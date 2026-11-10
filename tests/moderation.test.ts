import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import { Throttle, checkPin, hashPin } from '../server/auth.ts';
import type { Board, BoardState, ImageRec } from '../src/core/types.ts';

const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const palette = [{ hex: '#ff0000', lab: [53.2, 80.1, 67.2], weight: 1 }];
const ADMIN = 'admin-token-super-secreto-123';

let dir: string;
let server: Server;
let base: string;

const call = async (path: string, init: { method?: string; body?: unknown; pin?: string; owner?: string } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.pin) headers['x-board-pin'] = init.pin;
  if (init.owner) headers['x-owner-key'] = init.owner;
  const res = await fetch(base + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flathead-mod-'));
  server = await createApp({ dataDir: dir, adminToken: ADMIN });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe('dono, PIN e moderação', () => {
  let board: Board;
  let key: string;
  let img: ImageRec;

  it('criar board devolve a chave do dono uma única vez', async () => {
    const r = await call('/api/boards', { body: { name: 'Secreto' } });
    expect(r.status).toBe(201);
    key = r.body.ownerKey as string;
    board = r.body as unknown as Board;
    expect(key.length).toBeGreaterThan(20);
    const again = await call(`/api/boards/${board.id}`);
    expect(JSON.stringify(again.body)).not.toContain(key);
  });

  it('segredos não vazam no disco em texto puro nem na listagem', async () => {
    const db = await readFile(join(dir, 'db.json'), 'utf8');
    expect(db).not.toContain(key);
    const list = await call('/api/boards');
    expect(JSON.stringify(list.body)).not.toContain('secrets');
  });

  it('valida a chave do dono', async () => {
    expect((await call(`/api/boards/${board.id}/owner`, { body: { key } })).status).toBe(200);
    expect((await call(`/api/boards/${board.id}/owner`, { body: { key: 'x'.repeat(32) } })).status).toBe(403);
    expect((await call(`/api/boards/${board.id}/owner`, { body: { key: ADMIN } })).status).toBe(200);
  });

  it('só o dono define PIN', async () => {
    expect((await call(`/api/boards/${board.id}/pin`, { method: 'PUT', body: { pin: '1234' } })).status).toBe(403);
    expect((await call(`/api/boards/${board.id}/pin`, { method: 'PUT', body: { pin: '12a' }, owner: key })).status).toBe(400);
    const r = await call(`/api/boards/${board.id}/pin`, { method: 'PUT', body: { pin: '4321' }, owner: key });
    expect(r.status).toBe(200);
    expect(r.body.locked).toBe(true);
  });

  it('com PIN: sem código → 401, com código → ok, dono passa direto', async () => {
    const no = await call(`/api/boards/${board.id}`);
    expect(no.status).toBe(401);
    expect(no.body.locked).toBe(true);
    expect((await call(`/api/boards/${board.id}`, { pin: '0000' })).status).toBe(401);
    expect((await call(`/api/boards/${board.id}`, { pin: '4321' })).status).toBe(200);
    expect((await call(`/api/boards/${board.id}`, { owner: key })).status).toBe(200);
    const list = await call('/api/boards');
    expect((list.body as unknown as Board[]).find((b) => b.id === board.id)!.locked).toBe(true);
  });

  it('com PIN: upload e voto também exigem o código', async () => {
    const payload = { image: PX, thumb: PX, width: 1, height: 1, palette };
    expect((await call(`/api/boards/${board.id}/images`, { body: payload })).status).toBe(401);
    const r = await call(`/api/boards/${board.id}/images`, { body: payload, pin: '4321' });
    expect(r.status).toBe(201);
    img = r.body as unknown as ImageRec;
    const vote = { imageId: img.id, voterId: 'voter0001', value: 5 };
    expect((await call(`/api/boards/${board.id}/votes`, { method: 'PUT', body: vote })).status).toBe(401);
    expect((await call(`/api/boards/${board.id}/votes`, { method: 'PUT', body: vote, pin: '4321' })).status).toBe(200);
  });

  it('só o dono apaga imagem; some junto com votos e arquivos', async () => {
    expect((await call(`/api/boards/${board.id}/images/${img.id}`, { method: 'DELETE', pin: '4321' })).status).toBe(403);
    expect((await call(`/api/boards/${board.id}/images/${img.id}`, { method: 'DELETE', owner: key })).status).toBe(200);
    const s = (await call(`/api/boards/${board.id}`, { owner: key })).body as unknown as BoardState;
    expect(s.images).toHaveLength(0);
    expect(s.votes).toHaveLength(0);
    expect((await fetch(base + img.url)).status).toBe(404);
    expect((await call(`/api/boards/${board.id}/images/${img.id}`, { method: 'DELETE', owner: key })).status).toBe(404);
  });

  it('dono remove o PIN', async () => {
    const r = await call(`/api/boards/${board.id}/pin`, { method: 'PUT', body: { pin: null }, owner: key });
    expect(r.body.locked).toBe(false);
    expect((await call(`/api/boards/${board.id}`)).status).toBe(200);
  });

  it('bloqueia após muitas tentativas erradas', async () => {
    const b = (await call('/api/boards', { body: { name: 'Força bruta' } })).body;
    await call(`/api/boards/${b.id}/pin`, { method: 'PUT', body: { pin: '9999' }, owner: b.ownerKey as string });
    for (let i = 0; i < 8; i++) await call(`/api/boards/${b.id}`, { pin: String(1000 + i) });
    expect((await call(`/api/boards/${b.id}`, { pin: '9999' })).status).toBe(429);
  });
});

describe('auth', () => {
  it('hash de PIN confere só com o PIN certo', () => {
    const secret = { pin: hashPin('2468') };
    expect(checkPin(secret, '2468')).toBe(true);
    expect(checkPin(secret, '2469')).toBe(false);
    expect(checkPin(secret, undefined)).toBe(false);
    expect(checkPin({}, undefined)).toBe(true);
  });

  it('throttle expira depois da janela', () => {
    const t = new Throttle(2, 1000);
    t.fail('k', 0);
    t.fail('k', 10);
    expect(t.blocked('k', 20)).toBe(true);
    expect(t.blocked('k', 2000)).toBe(false);
  });
});
