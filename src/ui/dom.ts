import { icons, type IconName } from './icons.ts';

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

/** Cria elementos de forma enxuta: h('button', { class: 'btn', onclick }, 'texto'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Elemento <span> com um ícone SVG. */
export function icon(name: IconName, cls = 'ico'): HTMLSpanElement {
  return h('span', { class: cls, html: icons[name] });
}

/** Botão só de ícone, com rótulo acessível e tooltip. */
export function iconBtn(name: IconName, label: string, onclick: EventListener, cls = ''): HTMLButtonElement {
  return h('button', { class: `btn btn-icon ${cls}`.trim(), type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

let toastTimer = 0;
/** Aviso curto estilo carimbo. */
export function toast(iconName: IconName, text = ''): void {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, icon(iconName), text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 2200);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback para HTTP puro (sem contexto seguro)
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
