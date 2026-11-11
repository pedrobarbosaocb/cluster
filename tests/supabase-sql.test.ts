import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, describe, expect, it } from 'vitest';

/** Imita o mínimo do Supabase (papéis, Storage e Realtime) para rodar a migração de verdade. */
const STUBS = `
  create schema extensions;
  create role anon nologin;
  create role authenticated nologin;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text, primary key (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, delete on storage.objects to anon, authenticated;
  create schema realtime;
  create table realtime.sent (topic text, payload jsonb);
  create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
    language sql as $$ insert into realtime.sent values (topic, payload) $$;
`;

const migration = readFileSync(new URL('../supabase/migrations/0001_moodboard.sql', import.meta.url), 'utf8');

let db: PGlite;

async function rpc<T = Record<string, unknown>>(fn: string, ...args: unknown[]): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query<{ v: T }>(`select public.${fn}(${params}) as v`, args);
  return r.rows[0]!.v;
}

const PALETTE = [{ hex: '#ff0000', lab: [53, 80, 67], weight: 1 }];

async function addImage(board: string, owner: string | null, pin: string | null = null): Promise<string> {
  const { imageId } = await rpc<{ imageId: string }>('mb_begin_upload', board, pin, owner);
  const path = `${board}/${imageId}.webp`;
  const thumb = `${board}/${imageId}_t.webp`;
  await db.query(`insert into storage.objects values ('moodboard', $1), ('moodboard', $2)`, [path, thumb]);
  const rec = await rpc('mb_add_image', board, pin, owner, imageId, path, thumb, 800, 600, JSON.stringify(PALETTE));
  expect(rec.id).toBe(imageId);
  return imageId;
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  await db.exec(migration);
  await db.exec(migration); // idempotente
});

describe('migração do Supabase', () => {
  it('cria board e só revela a chave do dono uma vez', async () => {
    const b = await rpc<{ id: string; ownerKey: string; locked: boolean }>('mb_create_board', '  Turnê   2027 ');
    expect(b.ownerKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(b.locked).toBe(false);
    const list = await rpc<Record<string, unknown>[]>('mb_list_boards');
    const found = list.find((x) => x.id === b.id)!;
    expect(found.name).toBe('Turnê 2027');
    expect(found).not.toHaveProperty('ownerKey');
    expect(await rpc('mb_create_board', '   ')).toEqual({ error: 'invalid' });
  });

  it('fluxo completo: upload, voto, layout, PIN e moderação', async () => {
    const { id, ownerKey } = await rpc<{ id: string; ownerKey: string }>('mb_create_board', 'Capa');
    const img = await addImage(id, null);
    const img2 = await addImage(id, null);

    const vote = await rpc('mb_vote', id, null, null, img, 'voter1', 5);
    expect(vote).toMatchObject({ imageId: img, voterId: 'voter1', value: 5 });
    await rpc('mb_vote', id, null, null, img, 'voter1', 8); // troca o voto
    expect(await rpc('mb_vote', id, null, null, img, 'voter1', 4)).toEqual({ error: 'invalid' });

    let s = await rpc<{ images: unknown[]; votes: { value: number }[] }>('mb_get_board', id, null, null);
    expect(s.images).toHaveLength(2);
    expect(s.votes).toEqual([expect.objectContaining({ value: 8 })]);

    // layout: só o dono, só ids do board, sem repetição
    expect(await rpc('mb_set_layout', id, null, JSON.stringify({ groups: [[img]] }))).toEqual({ error: 'forbidden' });
    expect(await rpc('mb_set_layout', id, ownerKey, JSON.stringify({ groups: [[img, img]] }))).toEqual({ error: 'invalid' });
    expect(await rpc('mb_set_layout', id, ownerKey, JSON.stringify({ groups: [[img], ['zzzzzz']] }))).toEqual({ error: 'invalid' });
    await rpc('mb_set_layout', id, ownerKey, JSON.stringify({ groups: [[img2], [img]] }));

    // PIN
    await rpc('mb_set_pin', id, ownerKey, '1234');
    expect(await rpc('mb_get_board', id, null, null)).toEqual({ error: 'locked' });
    expect(await rpc('mb_get_board', id, '9999', null)).toEqual({ error: 'locked' });
    expect(await rpc('mb_vote', id, null, null, img, 'voter2', 3)).toEqual({ error: 'locked' });
    expect(await rpc('mb_begin_upload', id, null, null)).toEqual({ error: 'locked' });
    s = await rpc('mb_get_board', id, '1234', null);
    expect(s.images).toHaveLength(2);
    expect((await rpc('mb_get_board', id, null, ownerKey)).board).toMatchObject({ locked: true });

    // moderação: apagar tira votos e a imagem do layout, e libera os arquivos
    expect(await rpc('mb_delete_image', id, null, img)).toEqual({ error: 'locked' });
    const del = await rpc<{ files: string[] }>('mb_delete_image', id, ownerKey, img);
    expect(del.files).toHaveLength(2);
    s = await rpc('mb_get_board', id, null, ownerKey);
    expect(s.images).toHaveLength(1);
    expect(s.votes).toHaveLength(0);
    expect((s as unknown as { layout: unknown }).layout).toEqual({ groups: [[img2]] });
    const deletable = await db.query<{ ok: boolean }>('select mb.deletable($1) as ok', [del.files[0]]);
    expect(deletable.rows[0]!.ok).toBe(true);

    // tirar o PIN
    await rpc('mb_set_pin', id, ownerKey, null);
    expect((await rpc('mb_get_board', id, null, null)).board).toMatchObject({ locked: false });

    const topics = await db.query<{ k: string }>(`select payload->>'kind' as k from realtime.sent where topic = $1`, [`board:${id}`]);
    expect(topics.rows.map((r) => r.k)).toEqual(['image', 'image', 'vote', 'vote', 'layout', 'pin', 'delete', 'pin']);
  });

  it('upload exige ticket válido e arquivos no Storage', async () => {
    const { id } = await rpc<{ id: string }>('mb_create_board', 'Merch');
    const { imageId } = await rpc<{ imageId: string }>('mb_begin_upload', id, null, null);
    const ok = await db.query<{ ok: boolean }>('select mb.upload_allowed($1) as ok', [`${id}/${imageId}_t.webp`]);
    expect(ok.rows[0]!.ok).toBe(true);
    const bad = await db.query<{ ok: boolean }>('select mb.upload_allowed($1) as ok', [`${id}/outroid99.webp`]);
    expect(bad.rows[0]!.ok).toBe(false);
    // sem os arquivos no Storage, não registra
    const r = await rpc('mb_add_image', id, null, null, imageId, `${id}/${imageId}.webp`, `${id}/${imageId}_t.webp`, 10, 10, JSON.stringify(PALETTE));
    expect(r).toEqual({ error: 'invalid' });
    // paleta inválida
    await db.query(`insert into storage.objects values ('moodboard', $1), ('moodboard', $2)`, [`${id}/${imageId}.webp`, `${id}/${imageId}_t.webp`]);
    const r2 = await rpc('mb_add_image', id, null, null, imageId, `${id}/${imageId}.webp`, `${id}/${imageId}_t.webp`, 10, 10, JSON.stringify([{ hex: 'red' }]));
    expect(r2).toEqual({ error: 'invalid' });
  });

  it('chave de dono: aceita a certa e limita tentativas erradas', async () => {
    const { id, ownerKey } = await rpc<{ id: string; ownerKey: string }>('mb_create_board', 'Clipe');
    expect(await rpc('mb_claim_owner', id, ownerKey)).toEqual({ ok: true });
    for (let i = 0; i < 8; i++) expect(await rpc('mb_claim_owner', id, 'x'.repeat(20))).toEqual({ error: 'forbidden' });
    expect(await rpc('mb_claim_owner', id, ownerKey)).toEqual({ error: 'throttled' });
    expect(await rpc('mb_get_board', 'naoexiste', null, null)).toEqual({ error: 'not_found' });
  });

  it('chave pública não lê as tabelas nem as funções internas', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from mb.boards')).rejects.toThrow(/permission denied/);
      await expect(db.query(`select mb.sha256('x')`)).rejects.toThrow(/permission denied/);
      const list = await db.query<{ v: unknown[] }>('select public.mb_list_boards() as v');
      expect(list.rows[0]!.v.length).toBeGreaterThan(0);
    } finally {
      await db.exec('reset role');
    }
  });
});
