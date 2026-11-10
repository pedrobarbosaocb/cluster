/**
 * Popula um servidor com um board de exemplo: pôsteres gerados em 3 famílias
 * de cor + votos aleatórios. Uso: node scripts/seed.ts [http://localhost:8787]
 */
import { deflateSync } from 'node:zlib';
import { extractPalette } from '../src/core/palette.ts';
import { seededRandom } from '../src/core/math.ts';
import { TOKENS } from '../src/core/votes.ts';

const base = process.argv[2] ?? 'http://localhost:8787';
const rand = seededRandom(1993);

type RGB = [number, number, number];
const FAMILIES: RGB[][] = [
  [[209, 40, 28], [21, 18, 14], [246, 239, 223]], // vermelho/preto/papel
  [[239, 178, 31], [21, 18, 14], [190, 60, 30]], // mostarda
  [[44, 122, 115], [230, 222, 200], [30, 40, 50]], // teal
];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pôster: fundo, bloco central, círculo e listras com meio-tom. */
function poster(w: number, h: number, [bg, fg, ac]: RGB[]): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  const cx = w * (0.3 + rand() * 0.4);
  const cy = h * (0.3 + rand() * 0.3);
  const r = Math.min(w, h) * (0.15 + rand() * 0.2);
  const band = h * (0.65 + rand() * 0.15);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = bg!;
      if (y > band && y < band + h * 0.12) c = fg!;
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) c = ac!;
      if (x > w * 0.08 && x < w * 0.92 && y > h * 0.06 && y < h * 0.14) c = fg!;
      if (c === bg && (x % 6 < 2 && y % 6 < 2) && y > band) c = fg!; // meio-tom
      const o = (y * w + x) * 4;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
  return px;
}

const j = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

const board = await j<{ id: string }>('/api/boards', { method: 'POST', body: JSON.stringify({ name: 'Turnê 2027' }) });
const ids: string[] = [];
const sizes: [number, number][] = [[240, 340], [260, 260], [320, 230], [220, 330], [250, 360]];
for (let i = 0; i < 18; i++) {
  const fam = FAMILIES[i % 3]!;
  const [w, h] = sizes[Math.floor(rand() * sizes.length)]!;
  const pixels = poster(w, h, rand() > 0.5 ? fam : [fam[0]!, fam[2]!, fam[1]!]);
  const url = 'data:image/png;base64,' + png(w, h, pixels).toString('base64');
  const rec = await j<{ id: string }>(`/api/boards/${board.id}/images`, {
    method: 'POST',
    body: JSON.stringify({ image: url, thumb: url, width: w, height: h, palette: extractPalette(pixels) }),
  });
  ids.push(rec.id);
}
for (let v = 0; v < 5; v++)
  for (const id of ids)
    if (rand() > 0.25)
      await j(`/api/boards/${board.id}/votes`, {
        method: 'PUT',
        body: JSON.stringify({ imageId: id, voterId: `seedvoter${v}`, value: TOKENS[Math.floor(rand() * TOKENS.length)]!.value }),
      });

console.log(`${base}/#/b/${board.id}`);
