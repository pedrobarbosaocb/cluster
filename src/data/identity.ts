import { newId } from '../core/ids.ts';

const KEY = 'flathead.voter';
let memo: string | null = null;

/** Identidade anônima por dispositivo — sem login, só para "um voto por pessoa". */
export function voterId(): string {
  if (memo) return memo;
  try {
    memo = localStorage.getItem(KEY);
    if (!memo) {
      memo = newId(16);
      localStorage.setItem(KEY, memo);
    }
  } catch {
    memo = newId(16);
  }
  return memo;
}
