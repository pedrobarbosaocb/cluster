import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import type { BoardState } from '../src/core/types.ts';

const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const palette = [{ hex: '#ff0000', lab: [53.2, 80.1, 67.2], weight: 1 }];

let dir: string;
let server: Server;
let base: string;
let id: string;
let key: string;
const imgs: string[] = [];

const req = async (path: string, method = 'GET', body?: unknown, owner?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (owner) headers['x-owner-key'] = owner;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const putLayout = (layout: unknown, owner?: string) => req(`/api/boards/${id}/layout`, 'PUT', { layout }, owner);
const state = async () => (await req(`/api/boards/${id}`)).body as unknown as BoardState;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flathead-layout-'));
  server = await createApp({ dataDir: dir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const b = (await req('/api/boards', 'POST', { name: 'Layout' })).body;
  id = b.id as string;
  key = b.ownerKey as string;
  for (let i = 0; i < 3; i++)
    imgs.push((await req(`/api/boards/${id}/images`, 'POST', { image: PX, thumb: PX, width: 1, height: 1, palette })).body.id as string);
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe('layout manual (API)', () => {
  it('começa automático', async () => expect((await state()).layout).toBeNull());

  it('só o dono fixa o layout', async () => {
    expect((await putLayout({ groups: [[imgs[0]]] })).status).toBe(403);
    const r = await putLayout({ groups: [[imgs[2], imgs[0]], [imgs[1]]] }, key);
    expect(r.status).toBe(200);
    expect((await state()).layout).toEqual({ groups: [[imgs[2], imgs[0]], [imgs[1]]] });
  });

  it('rejeita id desconhecido, repetido, grupo vazio ou formato errado', async () => {
    for (const bad of [
      { groups: [['naoexiste']] },
      { groups: [[imgs[0], imgs[0]]] },
      { groups: [[imgs[0]], []] },
      { groups: 'x' },
      [imgs[0]],
    ])
      expect((await putLayout(bad, key)).status).toBe(400);
  });

  it('apagar imagem tira ela do layout', async () => {
    await req(`/api/boards/${id}/images/${imgs[1]}`, 'DELETE', undefined, key);
    expect((await state()).layout).toEqual({ groups: [[imgs[2], imgs[0]]] });
  });

  it('null volta ao automático', async () => {
    expect((await putLayout(null, key)).body.layout).toBeNull();
    expect((await state()).layout).toBeNull();
  });
});
