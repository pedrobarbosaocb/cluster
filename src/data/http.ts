import type { Board, BoardState, ImageRec, Layout, Vote } from '../core/types.ts';
import { LockedError, type Api, type LiveHandlers, type NewImage } from './api.ts';
import { SseParser, backoff } from './sse.ts';
import { getCred, setCred } from './creds.ts';

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(`${status} ${msg}`);
    this.status = status;
  }
}

export class HttpApi implements Api {
  readonly mode = 'server' as const;
  readonly supportsPin = true;
  private readonly base: string;

  constructor(base: string) {
    this.base = base.replace(/\/$/, '');
  }

  private async req<T>(path: string, init: RequestInit = {}, boardId?: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body) headers['content-type'] = 'application/json';
    if (boardId) {
      const pin = getCred('pin', boardId);
      const owner = getCred('owner', boardId);
      if (pin) headers['x-board-pin'] = pin;
      if (owner) headers['x-owner-key'] = owner;
    }
    const res = await fetch(this.base + path, { ...init, headers });
    if (res.status === 401) throw new LockedError();
    if (!res.ok) throw new HttpStatusError(res.status, await res.text());
    return (await res.json()) as T;
  }

  private abs = (u: string): string => (u.startsWith('/') ? this.base + u : u);
  private b = (id: string): string => `/api/boards/${encodeURIComponent(id)}`;

  listBoards(): Promise<Board[]> {
    return this.req('/api/boards');
  }

  async createBoard(name: string): Promise<Board> {
    const { ownerKey, ...board } = await this.req<Board & { ownerKey: string }>('/api/boards', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setCred('owner', board.id, ownerKey);
    return board;
  }

  async getBoard(id: string): Promise<BoardState | null> {
    try {
      const s = await this.req<BoardState>(this.b(id), {}, id);
      s.images = s.images.map((i) => ({ ...i, url: this.abs(i.url), thumbUrl: this.abs(i.thumbUrl) }));
      return s;
    } catch (e) {
      if (e instanceof HttpStatusError && e.status === 404) return null;
      throw e;
    }
  }

  async addImage(boardId: string, img: NewImage): Promise<ImageRec> {
    const i = await this.req<ImageRec>(`${this.b(boardId)}/images`, { method: 'POST', body: JSON.stringify(img) }, boardId);
    return { ...i, url: this.abs(i.url), thumbUrl: this.abs(i.thumbUrl) };
  }

  vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote> {
    return this.req(`${this.b(boardId)}/votes`, { method: 'PUT', body: JSON.stringify({ imageId, voterId, value }) }, boardId);
  }

  async unlock(boardId: string, pin: string): Promise<boolean> {
    const prev = getCred('pin', boardId);
    setCred('pin', boardId, pin);
    try {
      await this.req(this.b(boardId), {}, boardId);
      return true;
    } catch (e) {
      setCred('pin', boardId, prev);
      if (e instanceof LockedError) return false;
      throw e;
    }
  }

  isOwner(boardId: string): boolean {
    return !!getCred('owner', boardId);
  }

  ownerKey(boardId: string): string | null {
    return getCred('owner', boardId);
  }

  async claimOwner(boardId: string, key: string): Promise<boolean> {
    try {
      await this.req(`${this.b(boardId)}/owner`, { method: 'POST', body: JSON.stringify({ key }) });
      setCred('owner', boardId, key);
      return true;
    } catch (e) {
      if (e instanceof HttpStatusError && e.status === 403) return false;
      throw e;
    }
  }

  async deleteImage(boardId: string, imageId: string): Promise<void> {
    await this.req(`${this.b(boardId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' }, boardId);
  }

  /**
   * SSE via fetch (o EventSource nativo não manda headers, e o PIN não deve ir na URL).
   * Reconecta com espera progressiva; para de vez em 401 (PIN) ou 404.
   */
  subscribe(boardId: string, h: LiveHandlers): () => void {
    const ac = new AbortController();
    let attempt = 0;

    const run = async (): Promise<void> => {
      while (!ac.signal.aborted) {
        try {
          const headers: Record<string, string> = { accept: 'text/event-stream' };
          const pin = getCred('pin', boardId);
          const owner = getCred('owner', boardId);
          if (pin) headers['x-board-pin'] = pin;
          if (owner) headers['x-owner-key'] = owner;
          const res = await fetch(`${this.base}${this.b(boardId)}/events`, { headers, signal: ac.signal });
          if (res.status === 401) return void (h.onStatus?.(false), h.onLocked?.());
          if (res.status === 404) return void h.onStatus?.(false);
          if (!res.ok || !res.body) throw new Error(String(res.status));
          attempt = 0;
          h.onStatus?.(true);
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          const parser = new SseParser();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const ev of parser.push(value)) {
              if (ev.event !== 'change') continue;
              try {
                h.onChange((JSON.parse(ev.data) as { kind: string }).kind);
              } catch {
                h.onChange('unknown');
              }
            }
          }
        } catch {
          if (ac.signal.aborted) return;
        }
        h.onStatus?.(false);
        await new Promise((r) => setTimeout(r, backoff(attempt++)));
      }
    };
    void run();
    return () => ac.abort();
  }

  async setLayout(boardId: string, layout: Layout | null): Promise<void> {
    await this.req(`${this.b(boardId)}/layout`, { method: 'PUT', body: JSON.stringify({ layout }) }, boardId);
  }

  async setPin(boardId: string, pin: string | null): Promise<Board> {
    const board = await this.req<Board>(`${this.b(boardId)}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }, boardId);
    setCred('pin', boardId, pin); // o dono já fica com o PIN novo neste aparelho
    return board;
  }
}
