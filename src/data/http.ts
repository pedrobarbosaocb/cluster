import type { Board, BoardState, ImageRec, Vote } from '../core/types.ts';
import type { Api, NewImage } from './api.ts';

export class HttpApi implements Api {
  readonly mode = 'server' as const;
  private readonly base: string;

  constructor(base: string) {
    this.base = base.replace(/\/$/, '');
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  private abs = (u: string): string => (u.startsWith('/') ? this.base + u : u);

  listBoards(): Promise<Board[]> {
    return this.req('/api/boards');
  }

  createBoard(name: string): Promise<Board> {
    return this.req('/api/boards', { method: 'POST', body: JSON.stringify({ name }) });
  }

  async getBoard(id: string): Promise<BoardState | null> {
    try {
      const s = await this.req<BoardState>(`/api/boards/${encodeURIComponent(id)}`);
      s.images = s.images.map((i) => ({ ...i, url: this.abs(i.url), thumbUrl: this.abs(i.thumbUrl) }));
      return s;
    } catch (e) {
      if (String(e).startsWith('404')) return null;
      throw e;
    }
  }

  async addImage(boardId: string, img: NewImage): Promise<ImageRec> {
    const i = await this.req<ImageRec>(`/api/boards/${encodeURIComponent(boardId)}/images`, {
      method: 'POST',
      body: JSON.stringify(img),
    });
    return { ...i, url: this.abs(i.url), thumbUrl: this.abs(i.thumbUrl) };
  }

  vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote> {
    return this.req(`/api/boards/${encodeURIComponent(boardId)}/votes`, {
      method: 'PUT',
      body: JSON.stringify({ imageId, voterId, value }),
    });
  }
}
