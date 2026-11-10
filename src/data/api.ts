import type { Board, BoardState, ImageRec, Palette, Vote } from '../core/types.ts';

export interface NewImage {
  /** data URL da imagem redimensionada */
  image: string;
  /** data URL da miniatura */
  thumb: string;
  width: number;
  height: number;
  palette: Palette;
}

/** O board pede PIN e este dispositivo não tem (ou tem um errado). */
export class LockedError extends Error {
  constructor() {
    super('locked');
  }
}

export interface LiveHandlers {
  /** algo mudou no board (upload, voto, exclusão, PIN) */
  onChange(kind: string): void;
  /** conectado em tempo real ou não */
  onStatus?(live: boolean): void;
  /** o board passou a pedir PIN */
  onLocked?(): void;
}

/** Contrato único de dados — implementado pelo servidor (HTTP) e pelo modo local (IndexedDB). */
export interface Api {
  readonly mode: 'server' | 'local';
  /** PIN só faz sentido quando os dados saem do dispositivo */
  readonly supportsPin: boolean;
  listBoards(): Promise<Board[]>;
  createBoard(name: string): Promise<Board>;
  /** null = não existe; LockedError = precisa de PIN */
  getBoard(id: string): Promise<BoardState | null>;
  addImage(boardId: string, img: NewImage): Promise<ImageRec>;
  vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote>;

  /** guarda o PIN e testa; false se estiver errado */
  unlock(boardId: string, pin: string): Promise<boolean>;
  isOwner(boardId: string): boolean;
  ownerKey(boardId: string): string | null;
  /** "entrar como dono" com a chave copiada de outro aparelho */
  claimOwner(boardId: string, key: string): Promise<boolean>;
  deleteImage(boardId: string, imageId: string): Promise<void>;
  setPin(boardId: string, pin: string | null): Promise<Board>;
  /** escuta mudanças em tempo real; devolve a função para parar */
  subscribe(boardId: string, handlers: LiveHandlers): () => void;
}

let current: Promise<Api> | null = null;

/** Escolhe o adaptador: VITE_BACKEND=local (GitHub Pages / demo) ou server (padrão). */
export function api(): Promise<Api> {
  current ??= (async () => {
    if (import.meta.env.VITE_BACKEND === 'local') {
      const { LocalApi } = await import('./local.ts');
      return new LocalApi();
    }
    const { HttpApi } = await import('./http.ts');
    return new HttpApi(import.meta.env.VITE_API_URL ?? '');
  })();
  return current;
}
