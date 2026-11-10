import { deltaE, labToHex, rgbToLab } from './color.ts';
import { seededRandom } from './math.ts';
import type { Lab, Palette } from './types.ts';

export interface PaletteOptions {
  k?: number;
  maxSamples?: number;
  iterations?: number;
  seed?: number;
}

const nearest = (p: Lab, centers: Lab[]): number => {
  let best = 0;
  let bd = Infinity;
  for (let j = 0; j < centers.length; j++) {
    const d = deltaE(p, centers[j]!);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
};

/**
 * Extrai as cores dominantes de um buffer RGBA (como o de ImageData)
 * usando k-means++ no espaço Lab. Determinístico para a mesma entrada.
 */
export function extractPalette(rgba: ArrayLike<number>, opts: PaletteOptions = {}): Palette {
  const { k = 5, maxSamples = 4096, iterations = 12, seed = 7 } = opts;
  const total = Math.floor(rgba.length / 4);
  const step = Math.max(1, Math.floor(total / maxSamples));
  const pts: Lab[] = [];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if ((rgba[o + 3] ?? 255) < 128) continue; // ignora transparência
    pts.push(rgbToLab(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0));
  }
  if (pts.length === 0) return [];

  const rand = seededRandom(seed);
  const kk = Math.min(k, pts.length);

  // inicialização k-means++
  const centers: Lab[] = [pts[Math.floor(rand() * pts.length)]!];
  const d2 = new Float64Array(pts.length);
  while (centers.length < kk) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = deltaE(pts[i]!, centers[nearest(pts[i]!, centers)]!);
      d2[i] = d * d;
      sum += d2[i]!;
    }
    if (sum === 0) break;
    let r = rand() * sum;
    let idx = 0;
    for (; idx < pts.length - 1; idx++) {
      r -= d2[idx]!;
      if (r <= 0) break;
    }
    centers.push(pts[idx]!);
  }

  const assign = new Int32Array(pts.length);
  for (let it = 0; it < iterations; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const j = nearest(pts[i]!, centers);
      assign[i] = j;
      const a = acc[j]!;
      const p = pts[i]!;
      a[0]! += p[0];
      a[1]! += p[1];
      a[2]! += p[2];
      a[3]!++;
    }
    acc.forEach((a, j) => {
      if (a[3]! > 0) centers[j] = [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!];
    });
  }

  const counts = centers.map(() => 0);
  for (let i = 0; i < pts.length; i++) counts[nearest(pts[i]!, centers)]!++;
  const round = (v: number): number => Math.round(v * 10) / 10;
  return centers
    .map((lab, j) => ({
      lab: [round(lab[0]), round(lab[1]), round(lab[2])] as Lab,
      hex: labToHex(lab),
      weight: counts[j]! / pts.length,
    }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}
