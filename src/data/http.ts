import type { Board, BoardState, ImageRec, Vote } from '../core/types.ts';
import { LockedError, type Api, type NewImage } from './api.ts';
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

  async setPin(boardId: string, pin: string | null): Promise<Board> {
    const board = await this.req<Board>(`${this.b(boardId)}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }, boardId);
    setCred('pin', boardId, pin); // o dono já fica com o PIN novo neste aparelho
    return board;
  }
}
