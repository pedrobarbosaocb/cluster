import { newId } from '../core/ids.ts';
import type { Board, BoardState, ImageRec, Vote } from '../core/types.ts';
import type { Api, LiveHandlers, NewImage } from './api.ts';

const channel = (boardId: string): BroadcastChannel | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`flathead-${boardId}`);

/** Avisa as outras abas deste navegador que o board mudou. */
function notify(boardId: string, kind: string): void {
  const c = channel(boardId);
  c?.postMessage({ kind });
  c?.close();
}

const DB = 'flathead-moodboard';
type Store = 'boards' | 'images' | 'votes';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('boards', { keyPath: 'id' });
      db.createObjectStore('images', { keyPath: 'id' }).createIndex('boardId', 'boardId');
      db.createObjectStore('votes', { keyPath: ['imageId', 'voterId'] }).createIndex('boardId', 'boardId');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const wrap = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Modo local: tudo fica no navegador (IndexedDB). Usado no GitHub Pages / demo. */
export class LocalApi implements Api {
  readonly mode = 'local' as const;
  private db = open();

  private async store(name: Store, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    return (await this.db).transaction(name, mode).objectStore(name);
  }

  async listBoards(): Promise<Board[]> {
    const all = await wrap((await this.store('boards')).getAll() as IDBRequest<Board[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createBoard(name: string): Promise<Board> {
    const board: Board = { id: newId(), name, createdAt: Date.now() };
    await wrap((await this.store('boards', 'readwrite')).add(board));
    return board;
  }

  async getBoard(id: string): Promise<BoardState | null> {
    const board = await wrap((await this.store('boards')).get(id) as IDBRequest<Board | undefined>);
    if (!board) return null;
    const images = await wrap((await this.store('images')).index('boardId').getAll(id) as IDBRequest<ImageRec[]>);
    const votes = await wrap((await this.store('votes')).index('boardId').getAll(id) as IDBRequest<Vote[]>);
    return { board, images: images.sort((a, b) => a.createdAt - b.createdAt), votes };
  }

  async addImage(boardId: string, img: NewImage): Promise<ImageRec> {
    const rec: ImageRec = {
      id: newId(),
      boardId,
      url: img.image,
      thumbUrl: img.thumb,
      width: img.width,
      height: img.height,
      palette: img.palette,
      createdAt: Date.now(),
    };
    await wrap((await this.store('images', 'readwrite')).add(rec));
    notify(boardId, 'image');
    return rec;
  }

  async vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote> {
    const v: Vote = { imageId, voterId, value, at: Date.now() };
    await wrap((await this.store('votes', 'readwrite')).put({ ...v, boardId }));
    notify(boardId, 'vote');
    return v;
  }

  // Modo local: o dispositivo é o dono de tudo; PIN não se aplica.
  readonly supportsPin = false;

  async unlock(): Promise<boolean> {
    return true;
  }

  isOwner(): boolean {
    return true;
  }

  ownerKey(): string | null {
    return null;
  }

  async claimOwner(): Promise<boolean> {
    return true;
  }

  async deleteImage(boardId: string, imageId: string): Promise<void> {
    const tx = (await this.db).transaction(['images', 'votes'], 'readwrite');
    tx.objectStore('images').delete(imageId);
    const votes = tx.objectStore('votes');
    const mine = await wrap(votes.index('boardId').getAll(boardId) as IDBRequest<Vote[]>);
    for (const v of mine) if (v.imageId === imageId) votes.delete([v.imageId, v.voterId]);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notify(boardId, 'delete');
  }

  /** Tempo real entre abas do mesmo navegador (os dados não saem do aparelho). */
  subscribe(boardId: string, h: LiveHandlers): () => void {
    const c = channel(boardId);
    if (!c) return () => {};
    c.onmessage = (e: MessageEvent<{ kind: string }>) => h.onChange(e.data?.kind ?? 'unknown');
    h.onStatus?.(true);
    return () => c.close();
  }

  async setPin(): Promise<Board> {
    throw new Error('PIN não existe no modo local');
  }
}
