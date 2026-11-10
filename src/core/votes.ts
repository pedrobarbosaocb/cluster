import type { Vote } from './types.ts';

export type TokenKey = 'rotten' | 'tomato' | 'zine' | 'vinyl' | 'crown';

export interface Token {
  key: TokenKey;
  value: number;
  label: string;
  hotkey: string;
}

/** Escala estilo planning poker (Fibonacci) — do lixo ao hino. */
export const TOKENS: readonly Token[] = [
  { key: 'rotten', value: 1, label: 'Tomate podre', hotkey: '1' },
  { key: 'tomato', value: 2, label: 'Tomate', hotkey: '2' },
  { key: 'zine', value: 3, label: 'Fanzine', hotkey: '3' },
  { key: 'vinyl', value: 5, label: 'Vinil', hotkey: '4' },
  { key: 'crown', value: 8, label: 'Coroa', hotkey: '5' },
];

export const tokenByValue = (v: number): Token | undefined => TOKENS.find((t) => t.value === v);
export const isValidVote = (v: unknown): v is number => typeof v === 'number' && TOKENS.some((t) => t.value === v);

export interface ImageScore {
  imageId: string;
  count: number;
  mean: number;
  /** média bayesiana: puxa para a média geral quando há poucos votos */
  score: number;
  /** 0..1 relativo ao board */
  norm: number;
  breakdown: Record<number, number>;
}

/** Mantém só o voto mais recente de cada pessoa por imagem. */
export function latestVotes(votes: Vote[]): Vote[] {
  const map = new Map<string, Vote>();
  for (const v of votes) {
    const k = `${v.imageId}|${v.voterId}`;
    const prev = map.get(k);
    if (!prev || prev.at <= v.at) map.set(k, v);
  }
  return [...map.values()];
}

export function aggregate(imageIds: string[], votes: Vote[], prior = 2): Map<string, ImageScore> {
  const valid = latestVotes(votes).filter((v) => isValidVote(v.value));
  const globalMean = valid.length ? valid.reduce((s, v) => s + v.value, 0) / valid.length : 3;
  const out = new Map<string, ImageScore>();
  for (const id of imageIds) {
    const mine = valid.filter((v) => v.imageId === id);
    const sum = mine.reduce((s, v) => s + v.value, 0);
    const breakdown: Record<number, number> = {};
    for (const t of TOKENS) breakdown[t.value] = 0;
    for (const v of mine) breakdown[v.value] = (breakdown[v.value] ?? 0) + 1;
    out.set(id, {
      imageId: id,
      count: mine.length,
      mean: mine.length ? sum / mine.length : 0,
      score: (prior * globalMean + sum) / (prior + mine.length),
      norm: 0.5,
      breakdown,
    });
  }
  const scores = [...out.values()].map((s) => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  for (const s of out.values()) s.norm = max - min > 1e-9 ? (s.score - min) / (max - min) : 0.5;
  return out;
}
