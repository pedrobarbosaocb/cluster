import { aggregate } from '../core/votes.ts';
import type { BoardState } from '../core/types.ts';
import { api, type Api } from '../data/api.ts';
import { confirmBtn, copyText, h, icon, iconBtn, toast } from '../ui/dom.ts';
import { boardHeader, loadBoard, rerender } from './common.ts';

/** Painel do dono: PIN, chave para outros aparelhos e moderação das imagens. */
export async function adminView(root: HTMLElement, { id }: Record<string, string>): Promise<() => void> {
  const a = await api();
  const state = await loadBoard(root, a, id!);
  if (!state) return () => {};

  if (!a.isOwner(id!)) {
    root.append(boardHeader(state.board.name), claimForm(a, id!));
    return () => {};
  }

  root.append(boardHeader(state.board.name), h('div', { class: 'admin' }, ...[a.supportsPin ? pinPanel(a, state) : null, a.ownerKey(id!) ? keyPanel(a.ownerKey(id!)!) : null, imagesPanel(a, state)].filter((x): x is HTMLElement => !!x)));
  return () => {};
}

/** Quem não é dono pode colar a chave copiada de outro aparelho. */
function claimForm(a: Api, id: string): HTMLElement {
  const input = h('input', { class: 'field', type: 'password', autocomplete: 'off', required: true, 'aria-label': 'Chave do dono', placeholder: 'chave' });
  const form = h(
    'form',
    {
      class: 'gate',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const key = input.value.trim();
        if (!key) return input.focus();
        try {
          if (await a.claimOwner(id, key)) {
            toast('key', 'você é o dono');
            return rerender();
          }
          form.classList.remove('shake');
          void form.offsetWidth;
          form.classList.add('shake');
          toast('lock', 'chave errada');
        } catch {
          toast('bolt', 'muitas tentativas');
        }
      },
    },
    icon('key', 'ico gate-ico'),
    h('div', { class: 'row' }, input, h('button', { class: 'btn btn-red btn-icon', type: 'submit', title: 'Entrar como dono', 'aria-label': 'Entrar como dono' }, icon('check'))),
  );
  return form;
}

function panel(iconName: Parameters<typeof icon>[0], label: string, ...body: (Node | null)[]): HTMLElement {
  return h('section', { class: 'panel', 'aria-label': label }, h('h2', { class: 'panel-title', title: label }, icon(iconName)), ...body);
}

function pinPanel(a: Api, state: BoardState): HTMLElement {
  const id = state.board.id;
  const locked = !!state.board.locked;
  const input = h('input', {
    class: 'field pin-field',
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'new-password',
    pattern: '\\d{4,8}',
    maxlength: 8,
    required: true,
    'aria-label': locked ? 'Trocar PIN' : 'Novo PIN (4 a 8 dígitos)',
    placeholder: '••••',
  });
  const status = h('span', { class: `chip ${locked ? 'chip-on' : ''}`, title: locked ? 'Trancado' : 'Aberto' }, icon(locked ? 'lock' : 'unlock'));
  const form = h(
    'form',
    {
      class: 'row',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const pin = input.value.trim();
        if (!/^\d{4,8}$/.test(pin)) return toast('lock', '4 a 8 dígitos');
        try {
          await a.setPin(id, pin);
          toast('lock', 'trancado');
          rerender();
        } catch {
          toast('bolt', 'falhou');
        }
      },
    },
    input,
    h('button', { class: 'btn btn-red btn-icon', type: 'submit', title: locked ? 'Trocar PIN' : 'Trancar', 'aria-label': locked ? 'Trocar PIN' : 'Trancar' }, icon('lock')),
    locked
      ? confirmBtn('unlock', 'Destrancar', async () => {
          await a.setPin(id, null);
          toast('unlock', 'aberto');
          rerender();
        })
      : null,
  );
  return panel('lock', 'PIN do board', h('div', { class: 'row' }, status, form));
}

function keyPanel(key: string): HTMLElement {
  return panel(
    'key',
    'Chave do dono',
    h(
      'div',
      { class: 'row' },
      iconBtn('key', 'Copiar chave do dono (use em outro aparelho)', async () => {
        toast((await copyText(key)) ? 'key' : 'close', 'chave copiada');
      }, 'btn-mustard'),
    ),
  );
}

function imagesPanel(a: Api, state: BoardState): HTMLElement {
  const id = state.board.id;
  const scores = aggregate(state.images.map((i) => i.id), state.votes);
  const count = h('span', { class: 'chip', title: 'imagens' }, icon('image'), String(state.images.length));
  const grid = h('div', { class: 'mod-grid' });
  // piores primeiro: é o que mais provavelmente vai pro lixo
  const sorted = [...state.images].sort((x, y) => (scores.get(x.id)?.score ?? 0) - (scores.get(y.id)?.score ?? 0));
  for (const img of sorted) {
    const sc = scores.get(img.id)!;
    const tile = h(
      'figure',
      { class: 'mod-tile' },
      h('img', { src: img.thumbUrl, alt: '', loading: 'lazy' }),
      sc.count ? h('span', { class: 'piece-score mod-score' }, sc.score.toFixed(1)) : null,
      confirmBtn('trash', 'Apagar imagem', async () => {
        try {
          await a.deleteImage(id, img.id);
          tile.remove();
          count.lastChild!.textContent = String(grid.children.length);
        } catch {
          toast('bolt', 'falhou');
        }
      }, 'mod-del'),
    );
    grid.append(tile);
  }
  return panel('trash', 'Moderar imagens', h('div', { class: 'row' }, count), state.images.length ? grid : h('div', { class: 'empty' }, icon('image')));
}
