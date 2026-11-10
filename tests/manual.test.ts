import { describe, expect, it } from 'vitest';
import { moveGroup, moveImage, sanitizeLayout } from '../src/core/manual.ts';
import { buildMoodboard, layoutFromMoodboard } from '../src/core/moodboard.ts';
import { collage } from '../src/core/layout.ts';
import { rgbToHex, rgbToLab } from '../src/core/color.ts';
import type { ImageRec, Layout } from '../src/core/types.ts';

const L = (...groups: string[][]): Layout => ({ groups });

describe('sanitizeLayout', () => {
  it('tira ids desconhecidos, repetidos e grupos vazios', () => {
    expect(sanitizeLayout(L(['a', 'x', 'b'], ['a', 'c'], ['zz']), ['a', 'b', 'c'])).toEqual(L(['a', 'b'], ['c']));
  });
});

describe('moveImage', () => {
  const base = L(['a', 'b', 'c'], ['d', 'e']);
  it('antes de outra imagem em outro grupo', () => expect(moveImage(base, 'a', { kind: 'before', id: 'e' })).toEqual(L(['b', 'c'], ['d', 'a', 'e'])));
  it('depois de outra no mesmo grupo', () => expect(moveImage(base, 'a', { kind: 'after', id: 'c' })).toEqual(L(['b', 'c', 'a'], ['d', 'e'])));
  it('fim de um grupo', () => expect(moveImage(base, 'e', { kind: 'group', group: 0 })).toEqual(L(['a', 'b', 'c', 'e'], ['d'])));
  it('grupo novo e grupo que esvazia some', () => {
    expect(moveImage(L(['a'], ['b']), 'a', { kind: 'new' })).toEqual(L(['b'], ['a']));
    expect(moveImage(L(['a'], ['b', 'c']), 'a', { kind: 'group', group: 1 })).toEqual(L(['b', 'c', 'a']));
  });
  it('sobre si mesma ou alvo inexistente não muda', () => {
    expect(moveImage(base, 'a', { kind: 'before', id: 'a' })).toBe(base);
    expect(moveImage(base, 'a', { kind: 'before', id: 'zz' })).toBe(base);
    expect(moveImage(base, 'a', { kind: 'group', group: 9 })).toBe(base);
  });
});

describe('moveGroup', () => {
  const base = L(['a'], ['b'], ['c'], ['d']);
  it('para antes', () => expect(moveGroup(base, 3, 1)).toEqual(L(['a'], ['d'], ['b'], ['c'])));
  it('para depois', () => expect(moveGroup(base, 0, 2, true)).toEqual(L(['b'], ['c'], ['a'], ['d'])));
  it('para trás e para frente', () => expect(moveGroup(base, 0, 3)).toEqual(L(['b'], ['c'], ['a'], ['d'])));
  it('índices inválidos não mudam', () => expect(moveGroup(base, 0, 0)).toBe(base));
});

describe('collage keepOrder', () => {
  it('respeita a ordem recebida', () => {
    const items = [
      { id: 'small', aspect: 1, weight: 0 },
      { id: 'big', aspect: 1, weight: 1 },
    ];
    const auto = collage(items, { cell: 10, gap: 0 });
    const fixed = collage(items, { cell: 10, gap: 0, keepOrder: true });
    expect(auto.items[0]!.id).toBe('big');
    expect(fixed.items[0]!.id).toBe('small');
    expect(fixed.items.find((p) => p.id === 'small')).toMatchObject({ x: 0, y: 0 });
  });
});

const img = (id: string, rgb: [number, number, number]): ImageRec => ({
  id,
  boardId: 'b',
  url: '',
  thumbUrl: '',
  width: 300,
  height: 300,
  palette: [{ hex: rgbToHex(...rgb), lab: rgbToLab(...rgb), weight: 1 }],
  createdAt: 0,
});

describe('buildMoodboard com layout manual', () => {
  const red1 = img('r1', [210, 40, 30]);
  const red2 = img('r2', [200, 45, 35]);
  const blue1 = img('b1', [30, 90, 200]);
  const blue2 = img('b2', [35, 95, 210]);
  const green = img('g1', [40, 200, 60]);

  it('grupos e ordem do dono prevalecem sobre a cor', () => {
    const mb = buildMoodboard([red1, red2, blue1, blue2], [], 22, L(['b2', 'r1'], ['r2', 'b1']));
    expect(mb.manual).toBe(true);
    expect(mb.clusters.map((c) => c.layout.items.map((p) => p.id))).toEqual([
      ['b2', 'r1'],
      ['r2', 'b1'],
    ]);
  });

  it('imagem nova entra no grupo de cor parecida; cor diferente vira grupo novo', () => {
    const mb = buildMoodboard([red1, red2, blue1, green], [], 22, L(['r1'], ['b1']));
    const ids = mb.clusters.map((c) => c.images.map((i) => i.id).sort().join());
    expect(ids).toEqual(['r1,r2', 'b1', 'g1']);
  });

  it('imagens novas de cores diferentes não são forçadas no mesmo grupo', () => {
    const purple = img('p1', [110, 40, 135]);
    const mb = buildMoodboard([red1, blue1, green, purple], [], 22, L(['r1'], ['b1']));
    expect(mb.clusters.map((c) => c.images.map((i) => i.id).join())).toEqual(['r1', 'b1', 'g1', 'p1']);
  });

  it('grupo misto à mão: imagem nova entra pelo membro mais parecido', () => {
    const yellowA = img('y1', [240, 180, 30]);
    const yellowB = img('y2', [235, 185, 40]);
    const mb = buildMoodboard([red1, yellowA, blue1, yellowB], [], 22, L(['r1', 'y1'], ['b1']));
    expect(mb.clusters[0]!.images.map((i) => i.id)).toEqual(['r1', 'y1', 'y2']);
  });

  it('layout que só tem ids apagados volta ao automático', () => {
    const imgs = [red1, red2, blue1, blue2, green];
    const mb = buildMoodboard(imgs, [], 22, L(['apagada']));
    expect(mb.manual).toBe(false);
    expect(mb.clusters.map((c) => c.images.map((i) => i.id))).toEqual(buildMoodboard(imgs, []).clusters.map((c) => c.images.map((i) => i.id)));
  });

  it('layoutFromMoodboard reproduz a tela', () => {
    const auto = buildMoodboard([red1, red2, blue1, blue2], []);
    const fixed = buildMoodboard([red1, red2, blue1, blue2], [], 22, layoutFromMoodboard(auto));
    expect(fixed.clusters.map((c) => c.layout.items.map((p) => p.id))).toEqual(auto.clusters.map((c) => c.layout.items.map((p) => p.id)));
  });
});
