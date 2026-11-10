import type { BoardState } from '../core/types.ts';
import { LockedError, type Api } from '../data/api.ts';
import { copyText, h, icon, iconBtn, toast } from '../ui/dom.ts';

/** Título do board (estilo recorte) + ações à direita. */
export function boardHeader(name: string, ...extra: Node[]): HTMLElement {
  const share = iconBtn('link', 'Copiar link para avaliar', async () => {
    const id = /^#\/b\/([^/]+)/.exec(location.hash)?.[1] ?? '';
    const url = `${location.origin}${location.pathname}#/b/${id}/vote`;
    const ok = await copyText(url);
    toast(ok ? 'link' : 'close', ok ? 'link copiado' : url);
  }, 'btn-mustard');
  return h(
    'div',
    { class: 'board-head' },
    h('h1', { class: 'board-title' }, h('span', {}, name)),
    h('div', { class: 'spacer' }),
    ...extra,
    share,
  );
}

/** Re-renderiza a rota atual (ex.: depois de destrancar o board). */
export const rerender = (): void => void window.dispatchEvent(new HashChangeEvent('hashchange'));

/**
 * Carrega o board tratando os casos especiais: inexistente → 404,
 * trancado → tela de PIN. Retorna null quando a view não deve continuar.
 */
export async function loadBoard(root: HTMLElement, a: Api, id: string): Promise<BoardState | null> {
  try {
    const s = await a.getBoard(id);
    if (!s) notFound(root);
    return s;
  } catch (e) {
    if (!(e instanceof LockedError)) throw e;
    pinGate(root, a, id);
    return null;
  }
}

function pinGate(root: HTMLElement, a: Api, id: string): void {
  const input = h('input', {
    class: 'field pin-field',
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    pattern: '\\d{4,8}',
    maxlength: 8,
    required: true,
    'aria-label': 'PIN do board',
    placeholder: '••••',
  });
  const form = h(
    'form',
    {
      class: 'gate',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const pin = input.value.trim();
        if (!/^\d{4,8}$/.test(pin)) return input.focus();
        try {
          if (await a.unlock(id, pin)) return rerender();
          form.classList.remove('shake');
          void form.offsetWidth; // reinicia a animação
          form.classList.add('shake');
          input.select();
          toast('lock', 'pin errado');
        } catch {
          toast('bolt', 'muitas tentativas');
        }
      },
    },
    icon('lock', 'ico gate-ico'),
    h('div', { class: 'row' }, input, h('button', { class: 'btn btn-red btn-icon', type: 'submit', title: 'Entrar', 'aria-label': 'Entrar' }, icon('check'))),
  );
  root.append(form);
  input.focus();
}

export function notFound(root: HTMLElement): () => void {
  root.append(
    h(
      'div',
      { class: 'empty' },
      icon('skull'),
      h('p', { class: 'stamp' }, '404'),
      h('a', { class: 'btn', href: '#/', 'aria-label': 'Início' }, icon('arrowLeft')),
    ),
  );
  return () => {};
}
