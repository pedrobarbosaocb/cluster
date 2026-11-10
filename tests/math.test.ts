import { describe, expect, it } from 'vitest';
import { clamp, seededRandom } from '../src/core/math.ts';

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('seededRandom é determinístico', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    xs.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
  });
});
