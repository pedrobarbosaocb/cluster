import { moveGroup, moveImage, type ImageTarget } from '../core/manual.ts';
import type { Layout } from '../core/types.ts';
import { h } from '../ui/dom.ts';

type Drag =
  | { kind: 'image'; id: string; src: HTMLElement; thumb: string }
  | { kind: 'group'; from: number; src: HTMLElement; thumb: string };

type Drop = { kind: 'image'; target: ImageTarget } | { kind: 'group'; to: number; after: boolean } | null;

const THRESHOLD = 6;
const EDGE = 70;
const MARKS = ['drop-before', 'drop-after', 'drop-into'];

/**
 * Arrastar-e-soltar do modo edição (pointer events: mouse e toque).
 * - imagem → antes/depois de outra imagem, no fim de um grupo ou num grupo novo
 * - faixa de paleta (alça do grupo) → antes/depois de outro grupo
 */
export function bindLayoutDrag(canvas: HTMLElement, getLayout: () => Layout, commit: (l: Layout) => void): { active: () => boolean; dispose: () => void } {
  let drag: Drag | null = null;
  let drop: Drop = null;
  let started = false;
  let sx = 0;
  let sy = 0;
  let ghost: HTMLElement | null = null;
  let marked: Element | null = null;

  const unmark = (): void => {
    marked?.classList.remove(...MARKS);
    marked = null;
  };
  const mark = (el: Element, cls: string): void => {
    if (marked !== el) unmark();
    MARKS.forEach((m) => el.classList.toggle(m, m === cls));
    marked = el;
  };
  const half = (el: Element, x: number): boolean => {
    const r = el.getBoundingClientRect();
    return x > r.left + r.width / 2;
  };

  const resolve = (x: number, y: number): Drop => {
    const el = document.elementFromPoint(x, y);
    if (!el || !drag) return null;
    if (drag.kind === 'image') {
      const piece = el.closest<HTMLElement>('.piece');
      if (piece && piece !== drag.src && piece.dataset.id) {
        const after = half(piece, x);
        mark(piece, after ? 'drop-after' : 'drop-before');
        return { kind: 'image', target: { kind: after ? 'after' : 'before', id: piece.dataset.id } };
      }
      const cluster = el.closest<HTMLElement>('.cluster');
      if (cluster?.classList.contains('new-group')) {
        mark(cluster, 'drop-into');
        return { kind: 'image', target: { kind: 'new' } };
      }
      if (cluster?.dataset.group) {
        mark(cluster, 'drop-into');
        return { kind: 'image', target: { kind: 'group', group: Number(cluster.dataset.group) } };
      }
    } else {
      const cluster = el.closest<HTMLElement>('.cluster:not(.new-group)');
      if (cluster?.dataset.group && cluster !== drag.src) {
        const after = half(cluster, x);
        mark(cluster, after ? 'drop-after' : 'drop-before');
        return { kind: 'group', to: Number(cluster.dataset.group), after };
      }
    }
    unmark();
    return null;
  };

  const end = (apply: boolean): void => {
    if (drag && started && apply && drop) {
      const l = getLayout();
      if (drop.kind === 'image' && drag.kind === 'image') commit(moveImage(l, drag.id, drop.target));
      if (drop.kind === 'group' && drag.kind === 'group') commit(moveGroup(l, drag.from, drop.to, drop.after));
    }
    drag?.src.classList.remove('dragging-src');
    ghost?.remove();
    ghost = null;
    unmark();
    drag = null;
    drop = null;
    started = false;
    document.body.classList.remove('is-dragging');
  };

  const onDown = (e: PointerEvent): void => {
    if (!canvas.classList.contains('editing') || e.button > 0) return;
    const t = e.target as Element;
    const piece = t.closest<HTMLElement>('.piece');
    const handle = t.closest<HTMLElement>('.cluster-palette');
    if (piece?.dataset.id) {
      drag = { kind: 'image', id: piece.dataset.id, src: piece, thumb: piece.querySelector('img')?.src ?? '' };
    } else if (handle) {
      const section = handle.closest<HTMLElement>('.cluster');
      if (!section?.dataset.group) return;
      drag = { kind: 'group', from: Number(section.dataset.group), src: section, thumb: section.querySelector('img')?.src ?? '' };
    } else return;
    e.preventDefault();
    sx = e.clientX;
    sy = e.clientY;
  };

  const onMove = (e: PointerEvent): void => {
    if (!drag) return;
    if (!started) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < THRESHOLD) return;
      started = true;
      drag.src.classList.add('dragging-src');
      document.body.classList.add('is-dragging');
      ghost = h('div', { class: `drag-ghost ${drag.kind === 'group' ? 'drag-ghost-group' : ''}` }, h('img', { src: drag.thumb, alt: '' }));
      document.body.append(ghost);
    }
    ghost!.style.left = `${e.clientX}px`;
    ghost!.style.top = `${e.clientY}px`;
    drop = resolve(e.clientX, e.clientY);
    // rolagem automática perto das bordas
    if (e.clientY < EDGE) window.scrollBy(0, -14);
    else if (e.clientY > innerHeight - EDGE) window.scrollBy(0, 14);
  };

  const onUp = (): void => end(true);
  const onCancel = (): void => end(false);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && drag) end(false);
  };

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);

  return {
    active: () => started,
    dispose: () => {
      end(false);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    },
  };
}
