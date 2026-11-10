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

/** Contrato único de dados — implementado pelo servidor (HTTP) e pelo modo local (IndexedDB). */
export interface Api {
  readonly mode: 'server' | 'local';
  listBoards(): Promise<Board[]>;
  createBoard(name: string): Promise<Board>;
  getBoard(id: string): Promise<BoardState | null>;
  addImage(boardId: string, img: NewImage): Promise<ImageRec>;
  vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote>;
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
