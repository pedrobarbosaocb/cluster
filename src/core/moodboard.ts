import { clusterPalettes, groupPalette, paletteDistance } from './cluster.ts';
import { collage, type LayoutResult } from './layout.ts';
import { sanitizeLayout } from './manual.ts';
import type { ImageRec, Layout, Palette, Vote } from './types.ts';
import { aggregate, type ImageScore } from './votes.ts';

export interface MoodCluster {
  palette: Palette;
  layout: LayoutResult;
  images: ImageRec[];
}

export interface Moodboard {
  clusters: MoodCluster[];
  scores: Map<string, ImageScore>;
  voters: number;
  /** true quando o dono fixou o layout */
  manual: boolean;
}

/** distância média máxima para uma imagem nova entrar num grupo fixado */
const JOIN_THRESHOLD = 22;

const autoGroups = (images: ImageRec[]): number[][] =>
  clusterPalettes(images.map((i) => i.palette), {
    maxClusters: Math.min(8, Math.max(1, Math.ceil(images.length / 3))),
  });

/**
 * Resolve os grupos a partir do layout manual. Imagens que não estão nele
 * (ex.: subidas depois) entram no grupo de paleta mais parecida, ou formam
 * grupos novos quando nenhum combina.
 */
function manualGroups(images: ImageRec[], layout: Layout): number[][] {
  const idx = new Map(images.map((im, i) => [im.id, i]));
  const groups = sanitizeLayout(layout, idx.keys()).groups.map((g) => g.map((id) => idx.get(id)!));
  const assigned = new Set(groups.flat());
  const leftovers: number[] = [];
  for (let i = 0; i < images.length; i++) {
    if (assigned.has(i)) continue;
    let best = -1;
    let bestD = Infinity;
    groups.forEach((g, gi) => {
      // membro mais parecido: grupos montados à mão podem misturar cores de propósito
      const d = Math.min(...g.map((j) => paletteDistance(images[i]!.palette, images[j]!.palette)));
      if (d < bestD) {
        bestD = d;
        best = gi;
      }
    });
    if (best >= 0 && bestD <= JOIN_THRESHOLD) groups[best]!.push(i);
    else leftovers.push(i);
  }
  // sobras só se juntam entre si se forem parecidas (sem forçar número de grupos)
  const extra = clusterPalettes(leftovers.map((i) => images[i]!.palette), { maxClusters: leftovers.length }).map((g) =>
    g.map((k) => leftovers[k]!),
  );
  return [...groups, ...extra];
}

/** Monta o moodboard: agrega votos → agrupa (automático ou fixado) → colagem por pontuação. */
export function buildMoodboard(images: ImageRec[], votes: Vote[], cell = 22, layout?: Layout | null): Moodboard {
  const scores = aggregate(images.map((i) => i.id), votes);
  const clean = layout ? sanitizeLayout(layout, images.map((i) => i.id)) : null;
  const manual = !!clean && clean.groups.length > 0;
  const groups = manual ? manualGroups(images, clean) : autoGroups(images);
  const clusters = groups.map((g) => {
    const imgs = g.map((i) => images[i]!);
    return {
      images: imgs,
      palette: groupPalette(imgs.map((i) => i.palette), 6),
      layout: collage(
        imgs.map((i) => ({ id: i.id, aspect: i.width / i.height, weight: scores.get(i.id)?.norm ?? 0.5 })),
        { cell, keepOrder: manual },
      ),
    };
  });
  if (!manual) {
    // automático: clusters com mais "peso" (soma das notas) primeiro
    const mass = (c: MoodCluster): number => c.images.reduce((s, i) => s + (scores.get(i.id)?.score ?? 0), 0);
    clusters.sort((a, b) => mass(b) - mass(a));
  }
  return { clusters, scores, voters: new Set(votes.map((v) => v.voterId)).size, manual };
}

/** Ponto de partida para editar: o que está na tela vira layout manual (grupos e ordem de colocação). */
export function layoutFromMoodboard(mb: Moodboard): Layout {
  return { groups: mb.clusters.map((c) => c.layout.items.map((p) => p.id)) };
}
