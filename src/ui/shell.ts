import { h, icon, iconBtn } from './dom.ts';
import { Router } from './router.ts';
import type { IconName } from './icons.ts';

const THEME_KEY = 'flathead.theme';

function applyTheme(t: string | null): void {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function currentTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Monta cabeçalho (logo + navegação por ícones) e devolve o <main> onde as views renderizam. */
export function mountShell(app: HTMLElement): HTMLElement {
  try {
    applyTheme(localStorage.getItem(THEME_KEY));
  } catch {
    /* sem storage */
  }

  const nav = h('nav', { class: 'nav', 'aria-label': 'navegação' });
  const themeBtn = iconBtn(currentTheme() === 'dark' ? 'sun' : 'moon', 'Tema', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ok */
    }
    themeBtn.replaceChildren(icon(next === 'dark' ? 'sun' : 'moon'));
  }, 'btn-ghost');

  const header = h(
    'header',
    { class: 'top' },
    h(
      'a',
      { class: 'logo', href: '#/', 'aria-label': 'Início' },
      icon('skull'),
      h('span', { class: 'logo-text', html: '<b>FlatHead</b><small>MOODBOARD</small>' }),
    ),
    h('div', { class: 'spacer' }),
    nav,
    themeBtn,
  );
  const main = h('main', { id: 'view' });
  app.replaceChildren(header, main);

  const renderNav = (): void => {
    const path = Router.path();
    const m = /^\/b\/([^/]+)/.exec(path);
    if (!m) {
      nav.replaceChildren();
      return;
    }
    const id = m[1]!;
    const items: [IconName, string, string][] = [
      ['upload', 'Subir imagens', `/b/${id}/up`],
      ['cards', 'Avaliar', `/b/${id}/vote`],
      ['board', 'Moodboard', `/b/${id}`],
    ];
    nav.replaceChildren(
      ...items.map(([ic, label, to]) =>
        h('a', { href: '#' + to, title: label, 'aria-label': label, 'aria-current': path === to ? 'page' : undefined }, icon(ic)),
      ),
    );
  };
  document.addEventListener('route', renderNav);
  window.addEventListener('hashchange', renderNav);
  renderNav();
  return main;
}
