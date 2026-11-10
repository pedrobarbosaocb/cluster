import { buildMoodboard } from '../core/moodboard.ts';
import type { BoardState, ImageRec } from '../core/types.ts';
import { TOKENS } from '../core/votes.ts';
import { api } from '../data/api.ts';
import { h, icon, iconBtn } from '../ui/dom.ts';
import { tokenArt } from '../ui/icons.ts';
import { boardHeader, notFound } from './common.ts';

const REFRESH_MS = 15000;
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

export async function boardView(root: HTMLElement, { id }: Record<string, string>): Promise<() => void> {
  const a = await api();
  let state = await a.getBoard(id!);
  if (!state) return notFound(root);

  let zi = 3;
  let sig = '';
  const people = h('span', { class: 'chip', title: 'quem já votou' }, icon('people'), '0');
  const canvas = h('div', { class: 'mood' });
  const zoomLabel = (): void => canvas.style.setProperty('--z', String(ZOOMS[zi]));
  const zoom = h(
    'div',
    { class: 'zoom', role: 'group', 'aria-label': 'zoom' },
    iconBtn('zoomOut', 'Diminuir', () => {
      zi = Math.max(0, zi - 1);
      zoomLabel();
    }),
    iconBtn('fit', 'Tamanho normal', () => {
      zi = 3;
      zoomLabel();
    }),
    iconBtn('zoomIn', 'Aumentar', () => {
      zi = Math.min(ZOOMS.length - 1, zi + 1);
      zoomLabel();
    }),
  );
  root.append(boardHeader(state.board.name, people), canvas, zoom);
  zoomLabel();

  const render = (s: BoardState): void => {
    const nextSig = `${s.images.length}|${s.votes.length}|${s.votes.reduce((m, v) => Math.max(m, v.at), 0)}`;
    if (nextSig === sig) return;
    sig = nextSig;
    const mb = buildMoodboard(s.images, s.votes);
    people.lastChild!.textContent = String(mb.voters);

    if (!s.images.length) {
      canvas.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          icon('board'),
          h('a', { class: 'btn btn-red btn-icon', href: `#/b/${id}/up`, title: 'Subir imagens', 'aria-label': 'Subir imagens' }, icon('upload')),
        ),
      );
      return;
    }

    canvas.replaceChildren(
      ...mb.clusters.map((c, ci) => {
        const byId = new Map(c.images.map((i) => [i.id, i]));
        return h(
          'section',
          { class: 'cluster', style: `--tilt:${ci % 2 ? 0.6 : -0.6}deg`, 'aria-label': `grupo ${ci + 1}` },
          h('div', { class: 'cluster-palette', title: c.palette.map((p) => p.hex).join(' ') }, ...c.palette.map((p) => h('i', { style: `background:${p.hex};flex:${p.weight}` }))),
          h(
            'div',
            { class: 'collage', style: `--w:${c.layout.width};--h:${c.layout.height}` },
            ...c.layout.items.map((p, k) => {
              const img = byId.get(p.id)!;
              const sc = mb.scores.get(p.id)!;
              return h(
                'button',
                {
                  class: 'piece',
                  type: 'button',
                  style: `--x:${p.x};--y:${p.y};--pw:${p.w};--ph:${p.h};--r:${(((k * 53) % 9) - 4) * 0.35}deg;--d:${k * 30}ms`,
                  'aria-label': `imagem, nota ${sc.score.toFixed(1)}`,
                  onclick: () => openLightbox(img, sc.breakdown, sc.count),
                },
                h('img', { src: img.thumbUrl, alt: '', loading: 'lazy', draggable: 'false' }),
                sc.count ? h('span', { class: 'piece-score' }, sc.score.toFixed(1)) : null,
              );
            }),
          ),
        );
      }),
    );
  };

  function openLightbox(img: ImageRec, breakdown: Record<number, number>, count: number): void {
    const close = (): void => {
      dlg.close();
      dlg.remove();
    };
    const dlg = h(
      'dialog',
      { class: 'lightbox', onclick: (e: Event) => e.target === dlg && close() },
      h('img', { src: img.url, alt: '' }),
      h(
        'div',
        { class: 'lb-bar' },
        ...TOKENS.map((t) =>
          h('span', { class: 'lb-token', title: t.label }, h('span', { class: 'token-art', html: tokenArt[t.key] }), String(breakdown[t.value] ?? 0)),
        ),
        h('span', { class: 'chip' }, icon('people'), String(count)),
        h('div', { class: 'swatches' }, ...img.palette.map((p) => h('i', { style: `background:${p.hex}`, title: p.hex }))),
        iconBtn('close', 'Fechar', close, 'btn-ghost'),
      ),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  render(state);
  const timer = window.setInterval(async () => {
    try {
      const s = await a.getBoard(id!);
      if (s) render((state = s));
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, REFRESH_MS);

  return () => clearInterval(timer);
}
