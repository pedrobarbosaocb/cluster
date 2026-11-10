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
