import { deltaE } from './color.ts';
import type { Palette } from './types.ts';

/**
 * Distância entre duas paletas: para cada cor de A, a menor ΔE até B,
 * ponderada pelo peso da cor — simetrizada (média A→B e B→A).
 */
export function paletteDistance(a: Palette, b: Palette): number {
  if (a.length === 0 || b.length === 0) return 100;
  const directed = (x: Palette, y: Palette): number => {
    let sum = 0;
    let wsum = 0;
    for (const s of x) {
      let best = Infinity;
      for (const t of y) best = Math.min(best, deltaE(s.lab, t.lab));
      sum += best * s.weight;
      wsum += s.weight;
    }
    return wsum > 0 ? sum / wsum : 0;
  };
  return (directed(a, b) + directed(b, a)) / 2;
}

export interface ClusterOptions {
  /** ΔE médio máximo para juntar dois grupos */
  threshold?: number;
  /** número máximo de grupos (força junções além do threshold) */
  maxClusters?: number;
}

/**
 * Clusterização aglomerativa (average linkage) das paletas.
 * Retorna grupos de índices, do maior para o menor.
 */
export function clusterPalettes(palettes: Palette[], opts: ClusterOptions = {}): number[][] {
  const { threshold = 22, maxClusters = 6 } = opts;
  const n = palettes.length;
  if (n === 0) return [];
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = paletteDistance(palettes[i]!, palettes[j]!);
      dist[i]![j] = d;
      dist[j]![i] = d;
    }

  let groups: number[][] = palettes.map((_, i) => [i]);
  const linkage = (g: number[], h: number[]): number => {
    let s = 0;
    for (const i of g) for (const j of h) s += dist[i]![j]!;
    return s / (g.length * h.length);
  };

  while (groups.length > 1) {
    let bi = 0;
    let bj = 1;
    let bd = Infinity;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const d = linkage(groups[i]!, groups[j]!);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    if (bd > threshold && groups.length <= maxClusters) break;
    const merged = [...groups[bi]!, ...groups[bj]!];
    groups = groups.filter((_, k) => k !== bi && k !== bj);
    groups.push(merged);
  }
  return groups
    .map((g) => [...g].sort((a, b) => a - b))
    .sort((a, b) => b.length - a.length || a[0]! - b[0]!);
}

/** Paleta representativa de um grupo: funde cores próximas e mantém as mais pesadas. */
export function groupPalette(palettes: Palette[], size = 6): Palette {
  const n = Math.max(1, palettes.length);
  const all = palettes.flat().map((s) => ({ ...s, weight: s.weight / n }));
  const out: Palette = [];
  for (const s of all.sort((a, b) => b.weight - a.weight)) {
    const near = out.find((o) => deltaE(o.lab, s.lab) < 12);
    if (near) near.weight += s.weight;
    else out.push({ ...s });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, size);
}
