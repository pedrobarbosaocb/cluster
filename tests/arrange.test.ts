import { describe, expect, it } from 'vitest';
import { shelf, slugFile } from '../src/core/arrange.ts';

describe('shelf', () => {
  it('quebra linha quando passa da largura e centraliza', () => {
    const r = shelf([{ w: 100, h: 50 }, { w: 100, h: 80 }, { w: 100, h: 30 }], 220, 10);
    expect(r.width).toBe(210);
    expect(r.positions[0]).toEqual({ x: 0, y: 0 });
    expect(r.positions[1]).toEqual({ x: 110, y: 0 });
    expect(r.positions[2]).toEqual({ x: 55, y: 90 }); // linha 2 centralizada
    expect(r.height).toBe(120);
  });

  it('caixa maior que o limite ocupa a linha sozinha', () => {
    const r = shelf([{ w: 500, h: 10 }, { w: 50, h: 10 }], 200, 10);
    expect(r.width).toBe(500);
    expect(r.positions[1]!.y).toBe(20);
  });

  it('sem sobreposição', () => {
    const boxes = Array.from({ length: 9 }, (_, i) => ({ w: 40 + i * 13, h: 30 + (i % 3) * 20 }));
    const r = shelf(boxes, 300, 8);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = { ...r.positions[i]!, ...boxes[i]! };
        const b = { ...r.positions[j]!, ...boxes[j]! };
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
  });

  it('vazio', () => expect(shelf([], 100, 10)).toEqual({ positions: [], width: 0, height: 0 }));
});

describe('slugFile', () => {
  it('remove acentos e símbolos', () => expect(slugFile('Turnê 2027 — Pôster!')).toBe('flathead-turne-2027-poster.png'));
  it('fallback', () => expect(slugFile('!!!')).toBe('flathead-moodboard.png'));
});
