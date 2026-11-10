export type Lab = readonly [number, number, number];

export interface Swatch {
  hex: string;
  lab: Lab;
  /** fração dos pixels representada por essa cor (0..1) */
  weight: number;
}

export type Palette = Swatch[];

export interface Board {
  id: string;
  name: string;
  createdAt: number;
  /** protegido por PIN */
  locked?: boolean;
}

export interface ImageRec {
  id: string;
  boardId: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  palette: Palette;
  createdAt: number;
}

export interface Vote {
  imageId: string;
  voterId: string;
  value: number;
  at: number;
}

export interface BoardState {
  board: Board;
  images: ImageRec[];
  votes: Vote[];
}
