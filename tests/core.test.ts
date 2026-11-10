import { describe, expect, it } from 'vitest';
import { deltaE, labToRgb, rgbToHex, rgbToLab } from '../src/core/color.ts';
import { extractPalette } from '../src/core/palette.ts';
import { clusterPalettes, groupPalette, paletteDistance } from '../src/core/cluster.ts';
import { aggregate, isValidVote, latestVotes, TOKENS } from '../src/core/votes.ts';
import { collage } from '../src/core/layout.ts';
import type { Palette } from '../src/core/types.ts';

const solid = (rgbs: [number, number, number][], each = 400): Uint8ClampedArray => {
  const buf = new Uint8ClampedArray(rgbs.length * each * 4);
  let o = 0;
  for (const [r, g, b] of rgbs)
    for (let i = 0; i < each; i++) {
      buf[o++] = r;
      buf[o++] = g;
      buf[o++] = b;
      buf[o++] = 255;
    }
  return buf;
};

describe('color', () => {
  it('ida e volta RGB → Lab → RGB', () => {
    for (const c of [
      [0, 0, 0],
      [255, 255, 255],
      [211, 42, 31],
      [240, 179, 35],
    ] as [number, number, number][]) {
      expect(labToRgb(rgbToLab(...c))).toEqual(c);
    }
  });
  it('branco tem L≈100 e preto L≈0', () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
  });
  it('hex', () => expect(rgbToHex(255, 0, 16)).toBe('#ff0010'));
  it('deltaE', () => expect(deltaE([0, 0, 0], [3, 4, 0])).toBe(5));
});

describe('palette', () => {
  it('encontra as cores dominantes com os pesos certos', () => {
    const pal = extractPalette(solid([[255, 0, 0], [255, 0, 0], [255, 0, 0], [0, 0, 255]]), { k: 2 });
    expect(pal).toHaveLength(2);
    expect(pal[0]!.hex).toBe('#ff0000');
    expect(pal[0]!.weight).toBeCloseTo(0.75, 1);
    expect(pal[1]!.hex).toBe('#0000ff');
  });
  it('ignora pixels transparentes', () => {
    const buf = solid([[10, 200, 10]]);
    for (let i = 3; i < buf.length / 2; i += 4) buf[i] = 0;
    const pal = extractPalette(buf, { k: 3 });
    expect(pal[0]!.hex).toBe('#0ac80a');
  });
  it('é determinística', () => {
    const buf = solid([[200, 30, 30], [20, 20, 20], [240, 230, 200]]);
    expect(extractPalette(buf)).toEqual(extractPalette(buf));
  });
  it('retorna vazio sem pixels', () => expect(extractPalette(new Uint8ClampedArray())).toEqual([]));
});

const pal = (...rgbs: [number, number, number][]): Palette =>
  rgbs.map((c) => ({ lab: rgbToLab(...c), hex: rgbToHex(...c), weight: 1 / rgbs.length }));

describe('cluster', () => {
  const warm1 = pal([220, 40, 30], [20, 20, 20]);
  const warm2 = pal([200, 50, 40], [30, 25, 20]);
  const cool1 = pal([40, 120, 200], [230, 240, 250]);
  const cool2 = pal([50, 110, 210], [220, 235, 245]);
  const yellow = pal([250, 200, 20], [255, 240, 120]);

  it('distância 0 para paletas iguais e simétrica', () => {
    expect(paletteDistance(warm1, warm1)).toBe(0);
    expect(paletteDistance(warm1, cool1)).toBeCloseTo(paletteDistance(cool1, warm1));
    expect(paletteDistance(warm1, warm2)).toBeLessThan(paletteDistance(warm1, cool1));
  });

  it('separa paletas quentes, frias e amarelas', () => {
    const groups = clusterPalettes([warm1, cool1, warm2, yellow, cool2]);
    const sets = groups.map((g) => g.join(','));
    expect(sets).toContain('0,2');
    expect(sets).toContain('1,4');
    expect(sets).toContain('3');
  });

  it('respeita o número máximo de grupos', () => {
    const groups = clusterPalettes([warm1, cool1, yellow], { threshold: 0, maxClusters: 2 });
    expect(groups).toHaveLength(2);
    expect(groups.flat().sort()).toEqual([0, 1, 2]);
  });

  it('paleta do grupo funde cores próximas', () => {
    const g = groupPalette([warm1, warm2]);
    expect(g.length).toBeLessThanOrEqual(4);
    expect(g.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
  });
});

describe('votes', () => {
  it('escala Fibonacci com 5 fichas', () => {
    expect(TOKENS.map((t) => t.value)).toEqual([1, 2, 3, 5, 8]);
    expect(isValidVote(5)).toBe(true);
    expect(isValidVote(4)).toBe(false);
  });

  it('considera só o último voto de cada pessoa', () => {
    const v = latestVotes([
      { imageId: 'a', voterId: 'x', value: 1, at: 1 },
      { imageId: 'a', voterId: 'x', value: 8, at: 2 },
      { imageId: 'a', voterId: 'y', value: 3, at: 1 },
    ]);
    expect(v).toHaveLength(2);
    expect(v.find((x) => x.voterId === 'x')!.value).toBe(8);
  });

  it('agrega com suavização e normaliza 0..1', () => {
    const s = aggregate(
      ['a', 'b', 'c'],
      [
        { imageId: 'a', voterId: '1', value: 8, at: 1 },
        { imageId: 'a', voterId: '2', value: 8, at: 1 },
        { imageId: 'b', voterId: '1', value: 1, at: 1 },
        { imageId: 'b', voterId: '2', value: 1, at: 1 },
      ],
    );
    expect(s.get('a')!.norm).toBe(1);
    expect(s.get('b')!.norm).toBe(0);
    expect(s.get('c')!.norm).toBeGreaterThan(0);
    expect(s.get('c')!.norm).toBeLessThan(1);
    expect(s.get('a')!.breakdown[8]).toBe(2);
  });

  it('sem votos todo mundo fica no meio', () => {
    const s = aggregate(['a', 'b'], []);
    expect(s.get('a')!.norm).toBe(0.5);
  });
});

describe('layout', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), aspect: [0.7, 1, 1.4][i % 3]!, weight: i / 11 }));
  const res = collage(items, { cell: 10, gap: 0 });

  it('posiciona todas as imagens', () => expect(res.items).toHaveLength(12));

  it('sem sobreposição', () => {
    const r = res.items;
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i]!;
        const b = r[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it('maior peso → maior área', () => {
    const area = (id: string): number => {
      const p = res.items.find((x) => x.id === id)!;
      return p.w * p.h;
    };
    expect(area('11')).toBeGreaterThan(area('0'));
  });

  it('dimensões cobrem todos os itens', () => {
    for (const p of res.items) {
      expect(p.x + p.w).toBeLessThanOrEqual(res.width);
      expect(p.y + p.h).toBeLessThanOrEqual(res.height);
    }
  });

  it('vazio', () => expect(collage([])).toEqual({ items: [], width: 0, height: 0 }));
});
