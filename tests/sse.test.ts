import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import { SseParser, backoff } from '../src/data/sse.ts';

describe('SseParser', () => {
  it('junta pedaços e ignora heartbeat', () => {
    const p = new SseParser();
    expect(p.push('retry: 3000\n\n: ping\n\nevent: cha')).toEqual([]);
    expect(p.push('nge\ndata: {"kind":"vote"}\r\n\r\n')).toEqual([{ event: 'change', data: '{"kind":"vote"}' }]);
  });
  it('vários eventos num pedaço e data multilinha', () => {
    const p = new SseParser();
    expect(p.push('data: a\ndata: b\n\nevent: x\ndata: 1\n\n')).toEqual([
      { event: 'message', data: 'a\nb' },
      { event: 'x', data: '1' },
    ]);
  });
  it('backoff cresce e para em 15 s', () => {
    expect([0, 1, 2, 3, 10].map(backoff)).toEqual([1000, 2000, 4000, 8000, 15000]);
  });
});

const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const palette = [{ hex: '#ff0000', lab: [53.2, 80.1, 67.2], weight: 1 }];

let dir: string;
let server: Server;
let base: string;
const aborts: AbortController[] = [];

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...headers },
});

/** Abre o stream e devolve uma função que espera o próximo evento "change". */
async function listen(boardId: string, headers: Record<string, string> = {}) {
  const ac = new AbortController();
  aborts.push(ac);
  const res = await fetch(`${base}/api/boards/${boardId}/events`, { headers, signal: ac.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  const next = async (): Promise<{ kind: string } | 'closed'> => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return 'closed';
      const ev = parser.push(value).find((e) => e.event === 'change');
      if (ev) return JSON.parse(ev.data) as { kind: string };
    }
  };
  return { status: res.status, type: res.headers.get('content-type'), next };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flathead-sse-'));
  server = await createApp({ dataDir: dir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  aborts.forEach((a) => a.abort());
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe('tempo real (SSE)', () => {
  it('avisa upload, voto e exclusão para quem está ouvindo', async () => {
    const b = (await (await fetch(`${base}/api/boards`, json('POST', { name: 'Ao vivo' }))).json()) as { id: string; ownerKey: string };
    const ev = await listen(b.id);
    expect(ev.status).toBe(200);
    expect(ev.type).toContain('text/event-stream');

    const img = (await (await fetch(`${base}/api/boards/${b.id}/images`, json('POST', { image: PX, thumb: PX, width: 1, height: 1, palette }))).json()) as { id: string };
    expect(await ev.next()).toMatchObject({ kind: 'image' });

    await fetch(`${base}/api/boards/${b.id}/votes`, json('PUT', { imageId: img.id, voterId: 'voter0001', value: 8 }));
    expect(await ev.next()).toMatchObject({ kind: 'vote' });

    await fetch(`${base}/api/boards/${b.id}/images/${img.id}`, { method: 'DELETE', headers: { 'x-owner-key': b.ownerKey } });
    expect(await ev.next()).toMatchObject({ kind: 'delete' });
  });

  it('PIN protege o stream e trocar o PIN derruba as conexões', async () => {
    const b = (await (await fetch(`${base}/api/boards`, json('POST', { name: 'Trancado ao vivo' }))).json()) as { id: string; ownerKey: string };
    const ev = await listen(b.id);
    await fetch(`${base}/api/boards/${b.id}/pin`, json('PUT', { pin: '1357' }, { 'x-owner-key': b.ownerKey }));
    expect(await ev.next()).toMatchObject({ kind: 'pin' });
    expect(await ev.next()).toBe('closed');

    expect((await fetch(`${base}/api/boards/${b.id}/events`)).status).toBe(401);
    const ok = await listen(b.id, { 'x-board-pin': '1357' });
    expect(ok.status).toBe(200);
  });

  it('board inexistente → 404', async () => {
    expect((await fetch(`${base}/api/boards/naoexiste/events`)).status).toBe(404);
  });
});
