import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import type { Board, BoardState, ImageRec } from '../src/core/types.ts';

// PNG 1x1 vermelho
const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const palette = [{ hex: '#ff0000', lab: [53.2, 80.1, 67.2], weight: 1 }];

let dir: string;
let server: Server;
let base: string;

const j = async <T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const res = await fetch(base + path, init);
  return { status: res.status, body: (await res.json()) as T };
};
const post = (path: string, body: unknown, method = 'POST'): Promise<{ status: number; body: unknown }> =>
  j(path, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flathead-'));
  server = await createApp({ dataDir: dir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe('API', () => {
  let board: Board;
  let image: ImageRec;

  it('health', async () => expect((await j('/api/health')).body).toEqual({ ok: true }));

  it('cria e lista boards', async () => {
    const r = await post('/api/boards', { name: '  Turnê   2027 ' });
    expect(r.status).toBe(201);
    board = r.body as Board;
    expect(board.name).toBe('Turnê 2027');
    expect((await j<Board[]>('/api/boards')).body.map((b) => b.id)).toContain(board.id);
  });

  it('rejeita nome vazio', async () => expect((await post('/api/boards', { name: '  ' })).status).toBe(400));

  it('board inexistente → 404', async () => expect((await j('/api/boards/naoexiste')).status).toBe(404));

  it('sobe imagem e serve o arquivo', async () => {
    const r = await post(`/api/boards/${board.id}/images`, { image: PX, thumb: PX, width: 1, height: 1, palette });
    expect(r.status).toBe(201);
    image = r.body as ImageRec;
    const file = await fetch(base + image.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
  });

  it('rejeita imagem inválida', async () => {
    const r = await post(`/api/boards/${board.id}/images`, { image: 'data:text/html;base64,AAA', thumb: PX, width: 1, height: 1, palette });
    expect(r.status).toBe(400);
  });

  it('voto é único por pessoa e editável', async () => {
    expect((await post(`/api/boards/${board.id}/votes`, { imageId: image.id, voterId: 'voter0001', value: 3 }, 'PUT')).status).toBe(200);
    await post(`/api/boards/${board.id}/votes`, { imageId: image.id, voterId: 'voter0001', value: 8 }, 'PUT');
    const s = (await j<BoardState>(`/api/boards/${board.id}`)).body;
    expect(s.votes).toHaveLength(1);
    expect(s.votes[0]!.value).toBe(8);
    expect(s.images).toHaveLength(1);
  });

  it('rejeita valor fora da escala', async () => {
    const r = await post(`/api/boards/${board.id}/votes`, { imageId: image.id, voterId: 'voter0001', value: 4 }, 'PUT');
    expect(r.status).toBe(400);
  });

  it('bloqueia path traversal', async () => {
    expect((await fetch(base + '/uploads/..%2fdb.json')).status).toBe(404);
  });

  it('persiste em disco', async () => {
    const again = await createApp({ dataDir: dir });
    await new Promise<void>((r) => again.listen(0, '127.0.0.1', r));
    const port = (again.address() as AddressInfo).port;
    const s = (await (await fetch(`http://127.0.0.1:${port}/api/boards/${board.id}`)).json()) as BoardState;
    expect(s.votes[0]!.value).toBe(8);
    await new Promise((r) => again.close(r));
  });
});
