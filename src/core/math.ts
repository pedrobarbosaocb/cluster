/** Restringe um valor ao intervalo [min, max]. */
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** PRNG determinístico (mulberry32) — garante resultados reproduzíveis nos algoritmos. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
