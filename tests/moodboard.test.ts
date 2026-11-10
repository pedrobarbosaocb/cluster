import { describe, expect, it } from 'vitest';
import { buildMoodboard } from '../src/core/moodboard.ts';
import { rgbToHex, rgbToLab } from '../src/core/color.ts';
import type { ImageRec, Vote } from '../src/core/types.ts';

const img = (id: string, rgb: [number, number, number]): ImageRec => ({
  id,
  boardId: 'b',
  url: '',
  thumbUrl: '',
  width: 300,
  height: 400,
  palette: [{ hex: rgbToHex(...rgb), lab: rgbToLab(...rgb), weight: 1 }],
  createdAt: 0,
});

describe('buildMoodboard', () => {
  const images = [
    img('r1', [210, 40, 30]),
    img('r2', [200, 45, 35]),
    img('b1', [30, 90, 200]),
    img('b2', [35, 95, 210]),
  ];
  const votes: Vote[] = [
    { imageId: 'r1', voterId: 'a', value: 8, at: 1 },
    { imageId: 'r2', voterId: 'a', value: 1, at: 1 },
    { imageId: 'b1', voterId: 'b', value: 2, at: 1 },
  ];
  const mb = buildMoodboard(images, votes);

  it('separa por cor', () => {
    const sets = mb.clusters.map((c) => c.images.map((i) => i.id).sort().join());
    expect(sets.sort()).toEqual(['b1,b2', 'r1,r2']);
  });

  it('imagem melhor avaliada fica maior', () => {
    const red = mb.clusters.find((c) => c.images.some((i) => i.id === 'r1'))!;
    const area = (id: string): number => {
      const p = red.layout.items.find((x) => x.id === id)!;
      return p.w * p.h;
    };
    expect(area('r1')).toBeGreaterThan(area('r2'));
  });

  it('conta votantes únicos', () => expect(mb.voters).toBe(2));

  it('board vazio', () => expect(buildMoodboard([], []).clusters).toEqual([]));
});
