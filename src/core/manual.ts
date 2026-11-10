import type { Layout } from './types.ts';

/** Remove ids desconhecidos/repetidos e grupos vazios. */
export function sanitizeLayout(layout: Layout, imageIds: Iterable<string>): Layout {
  const known = new Set(imageIds);
  const seen = new Set<string>();
  const groups = layout.groups
    .map((g) =>
      g.filter((id) => {
        if (!known.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
    )
    .filter((g) => g.length > 0);
  return { groups };
}

const clone = (l: Layout): string[][] => l.groups.map((g) => [...g]);

export type ImageTarget =
  | { kind: 'before'; id: string }
  | { kind: 'after'; id: string }
  | { kind: 'group'; group: number }
  | { kind: 'new' };

/** Move uma imagem para antes/depois de outra, para o fim de um grupo ou para um grupo novo. */
export function moveImage(layout: Layout, imageId: string, target: ImageTarget): Layout {
  if ((target.kind === 'before' || target.kind === 'after') && target.id === imageId) return layout;
  const groups = clone(layout);
  // grupo de destino é resolvido antes de remover a imagem (índices mudam se o grupo esvaziar)
  const destGroup =
    target.kind === 'group' ? groups[target.group] : target.kind === 'new' ? null : groups.find((g) => g.includes(target.id));
  if (target.kind !== 'new' && !destGroup) return layout;
  for (const g of groups) {
    const i = g.indexOf(imageId);
    if (i >= 0) g.splice(i, 1);
  }
  if (target.kind === 'new') groups.push([imageId]);
  else if (target.kind === 'group') destGroup!.push(imageId);
  else {
    const at = destGroup!.indexOf(target.id) + (target.kind === 'after' ? 1 : 0);
    destGroup!.splice(at, 0, imageId);
  }
  return { groups: groups.filter((g) => g.length > 0) };
}

/** Move o grupo `from` para a posição imediatamente antes (ou depois) do grupo `to`. */
export function moveGroup(layout: Layout, from: number, to: number, after = false): Layout {
  const groups = clone(layout);
  if (from === to || !groups[from] || !groups[to]) return layout;
  const [g] = groups.splice(from, 1);
  let at = to > from ? to - 1 : to;
  if (after) at++;
  groups.splice(at, 0, g!);
  return { groups };
}
