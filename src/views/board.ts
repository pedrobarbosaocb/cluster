import { buildMoodboard } from '../core/moodboard.ts';
import type { BoardState, ImageRec } from '../core/types.ts';
import { TOKENS } from '../core/votes.ts';
import { api } from '../data/api.ts';
import { confirmBtn, h, icon, iconBtn, toast } from '../ui/dom.ts';
import { tokenArt } from '../ui/icons.ts';
import { boardHeader, loadBoard, rerender } from './common.ts';

/** reserva caso o tempo real caia */
const REFRESH_MS = 60000;
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

export async function boardView(root: HTMLElement, { id }: Record<string, string>): Promise<() => void> {
  const a = await api();
  let state = await loadBoard(root, a, id!);
  if (!state) return () => {};

  let zi = 3;
  let sig = '';
  const people = h('span', { class: 'chip', title: 'quem já votou' }, icon('people'), '0');
  const live = h('span', { class: 'chip live-chip', title: 'tempo real desligado', 'aria-label': 'tempo real desligado' }, icon('bolt'));
  const setExportable = (n: number): void => {
    exportBtn.disabled = n === 0;
  };
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
  const exportBtn = iconBtn('download', 'Baixar PNG', async () => {
    if (!state?.images.length || exportBtn.disabled) return;
    exportBtn.disabled = true;
    exportBtn.classList.add('busy');
    try {
      const [{ renderBoardPng, download }, { slugFile }] = await Promise.all([
        import('../media/export.ts'),
        import('../core/arrange.ts'),
      ]);
      download(await renderBoardPng(state), slugFile(state.board.name));
      toast('download', 'png pronto');
    } catch (e) {
      console.error(e);
      toast('bolt', 'falhou');
    } finally {
      exportBtn.disabled = false;
      exportBtn.classList.remove('busy');
    }
  });
  root.append(boardHeader(state.board.name, live, people, exportBtn), canvas, zoom);
  zoomLabel();

  const render = (s: BoardState): void => {
    const nextSig = `${s.images.length}|${s.votes.length}|${s.votes.reduce((m, v) => Math.max(m, v.at), 0)}`;
    if (nextSig === sig) return;
    sig = nextSig;
    const mb = buildMoodboard(s.images, s.votes);
    people.lastChild!.textContent = String(mb.voters);
    setExportable(s.images.length);

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
          { class: 'cluster', 'aria-label': `grupo ${ci + 1}` },
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
                  style: `--x:${p.x};--y:${p.y};--pw:${p.w};--ph:${p.h};--d:${k * 30}ms`,
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
        a.isOwner(id!)
          ? confirmBtn('trash', 'Apagar imagem', async () => {
              try {
                await a.deleteImage(id!, img.id);
                close();
                toast('trash', 'apagada');
                await refresh();
              } catch {
                toast('bolt', 'falhou');
              }
            }, 'btn-ghost')
          : null,
        iconBtn('close', 'Fechar', close, 'btn-ghost'),
      ),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  async function refresh(): Promise<void> {
    try {
      const s = await a.getBoard(id!);
      if (s) render((state = s));
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }

  render(state);
  const timer = window.setInterval(() => void refresh(), REFRESH_MS);

  // tempo real: junta rajadas de votos num único recarregamento
  let pending = 0;
  const stop = a.subscribe(id!, {
    onChange: () => {
      clearTimeout(pending);
      pending = window.setTimeout(() => void refresh(), 250);
    },
    onStatus: (on) => {
      live.classList.toggle('on', on);
      const t = on ? 'ao vivo' : 'tempo real desligado';
      live.title = t;
      live.setAttribute('aria-label', t);
    },
    onLocked: rerender,
  });

  return () => {
    clearInterval(timer);
    clearTimeout(pending);
    stop();
  };
}
