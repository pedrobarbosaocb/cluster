import { clusterPalettes, groupPalette } from './cluster.ts';
import { collage, type LayoutResult } from './layout.ts';
import type { ImageRec, Palette, Vote } from './types.ts';
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
}

/** Monta o moodboard: agrega votos → agrupa por paleta → colagem por pontuação. */
export function buildMoodboard(images: ImageRec[], votes: Vote[], cell = 22): Moodboard {
  const scores = aggregate(images.map((i) => i.id), votes);
  const groups = clusterPalettes(images.map((i) => i.palette), {
    maxClusters: Math.min(8, Math.max(1, Math.ceil(images.length / 3))),
  });
  const clusters = groups.map((g) => {
    const imgs = g.map((i) => images[i]!);
    return {
      images: imgs,
      palette: groupPalette(imgs.map((i) => i.palette), 6),
      layout: collage(
        imgs.map((i) => ({ id: i.id, aspect: i.width / i.height, weight: scores.get(i.id)?.norm ?? 0.5 })),
        { cell },
      ),
    };
  });
  // clusters com mais "peso" (soma das notas) primeiro
  const mass = (c: MoodCluster): number => c.images.reduce((s, i) => s + (scores.get(i.id)?.score ?? 0), 0);
  clusters.sort((a, b) => mass(b) - mass(a));
  return { clusters, scores, voters: new Set(votes.map((v) => v.voterId)).size };
}
