export interface Box {
  w: number;
  h: number;
}

export interface Arranged {
  positions: { x: number; y: number }[];
  width: number;
  height: number;
}

/**
 * Distribui caixas em prateleiras (como o flex-wrap da tela), centralizando
 * cada linha. Mantém a ordem de entrada.
 */
export function shelf(boxes: Box[], maxWidth: number, gap: number): Arranged {
  if (boxes.length === 0) return { positions: [], width: 0, height: 0 };
  const limit = Math.max(maxWidth, ...boxes.map((b) => b.w));

  const rows: { items: number[]; w: number; h: number }[] = [];
  let row = { items: [] as number[], w: 0, h: 0 };
  boxes.forEach((b, i) => {
    const needed = row.items.length ? row.w + gap + b.w : b.w;
    if (row.items.length && needed > limit) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.w = row.items.length ? row.w + gap + b.w : b.w;
    row.h = Math.max(row.h, b.h);
    row.items.push(i);
  });
  rows.push(row);

  const width = Math.max(...rows.map((r) => r.w));
  const positions = new Array<{ x: number; y: number }>(boxes.length);
  let y = 0;
  for (const r of rows) {
    let x = (width - r.w) / 2;
    for (const i of r.items) {
      positions[i] = { x, y };
      x += boxes[i]!.w + gap;
    }
    y += r.h + gap;
  }
  return { positions, width, height: y - gap };
}

/** Nome de arquivo seguro a partir do nome do board. */
export function slugFile(name: string, ext = 'png'): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `flathead-${slug || 'moodboard'}.${ext}`;
}
