export interface LayoutItem {
  id: string;
  /** largura / altura */
  aspect: number;
  /** 0..1 — importância (score normalizado) */
  weight: number;
}

export interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  items: Placed[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** tamanho da célula da grade em px */
  cell?: number;
  /** lado médio (em células) de uma imagem de peso 0 e de peso 1 */
  minSpan?: number;
  maxSpan?: number;
  gap?: number;
  /** mantém a ordem recebida (layout manual) em vez de ordenar por peso */
  keepOrder?: boolean;
}

/**
 * Empacota imagens numa grade estilo colagem: peso maior → mais células.
 * Coloca da mais importante para a menos, sempre na posição livre mais alta/à esquerda.
 */
export function collage(items: LayoutItem[], opts: LayoutOptions = {}): LayoutResult {
  const { cell = 24, minSpan = 3, maxSpan = 12, gap = 6 } = opts;
  if (items.length === 0) return { items: [], width: 0, height: 0 };

  const sized = items.map((it) => {
    const w = Math.min(1, Math.max(0, it.weight));
    const span = minSpan + (maxSpan - minSpan) * w;
    const aspect = Math.min(2.2, Math.max(0.45, it.aspect || 1));
    const cols = Math.max(2, Math.round(span * Math.sqrt(aspect)));
    const rows = Math.max(2, Math.round(span / Math.sqrt(aspect)));
    return { it, cols, rows };
  });
  if (!opts.keepOrder) sized.sort((a, b) => b.it.weight - a.it.weight || b.cols * b.rows - a.cols * a.rows);

  const totalArea = sized.reduce((s, x) => s + x.cols * x.rows, 0);
  const widest = Math.max(...sized.map((s) => s.cols));
  const gridCols = Math.max(widest, Math.ceil(Math.sqrt(totalArea * 1.15)));

  const occ: boolean[][] = [];
  const isFree = (r: number, c: number, rows: number, cols: number): boolean => {
    for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) if (occ[y]?.[x]) return false;
    return true;
  };

  const placed: Placed[] = [];
  let maxRow = 0;
  let maxCol = 0;
  for (const s of sized) {
    let done = false;
    for (let r = 0; !done; r++) {
      for (let c = 0; c + s.cols <= gridCols; c++) {
        if (!isFree(r, c, s.rows, s.cols)) continue;
        for (let y = r; y < r + s.rows; y++) {
          occ[y] ??= new Array<boolean>(gridCols).fill(false);
          for (let x = c; x < c + s.cols; x++) occ[y]![x] = true;
        }
        placed.push({ id: s.it.id, x: c * cell, y: r * cell, w: s.cols * cell - gap, h: s.rows * cell - gap });
        maxRow = Math.max(maxRow, r + s.rows);
        maxCol = Math.max(maxCol, c + s.cols);
        done = true;
        break;
      }
    }
  }
  return { items: placed, width: maxCol * cell - gap, height: maxRow * cell - gap };
}
