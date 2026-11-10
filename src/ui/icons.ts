import type { TokenKey } from '../core/votes.ts';

/** Ícones de traço (24×24) — herdam a cor via currentColor. */
const stroke = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${body}</svg>`;

export const icons = {
  /** logo: caveira de cabeça chata */
  skull: stroke(
    '<path d="M4 4h16v9l-2 2v4h-3v-2h-2v2h-2v-2H9v2H6v-4l-2-2z"/><path d="M8 9h2.5v2.5H8zM13.5 9H16v2.5h-2.5z" fill="currentColor" stroke="none"/><path d="M11.2 13.5h1.6"/>',
  ),
  upload: stroke('<path d="M12 15V3M6.5 8.5 12 3l5.5 5.5"/><path d="M3 14v7h18v-7"/>'),
  cards: stroke('<rect x="3.5" y="6" width="11" height="15" transform="rotate(-8 9 13.5)"/><rect x="9.5" y="3" width="11" height="15" transform="rotate(7 15 10.5)"/>'),
  board: stroke('<path d="M3 3h10v11H3zM15 3h6v6h-6zM15 11h6v10h-6zM3 16h10v5H3z"/>'),
  link: stroke('<path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.6 3.6a4 4 0 0 0 5.7 5.7l1.6-1.6"/>'),
  plus: stroke('<path d="M12 4v16M4 12h16"/>'),
  undo: stroke('<path d="M9 5 4 10l5 5"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>'),
  skip: stroke('<path d="m5 5 7 7-7 7M12 5l7 7-7 7"/>'),
  check: stroke('<path d="m4 12 5 5L20 6"/>'),
  close: stroke('<path d="M5 5l14 14M19 5 5 19"/>'),
  zoomIn: stroke('<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M10 7v6M7 10h6"/>'),
  zoomOut: stroke('<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6"/>'),
  fit: stroke('<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>'),
  people: stroke('<circle cx="8" cy="8" r="3.5"/><path d="M2 21v-2a6 6 0 0 1 12 0v2"/><path d="M15 4.6a3.5 3.5 0 0 1 0 6.8M17 13.5a6 6 0 0 1 5 5.5v2"/>'),
  image: stroke('<path d="M3 4h18v16H3z"/><path d="m3 17 6-6 5 5 3-3 4 4"/><circle cx="16" cy="8.5" r="1.5"/>'),
  drop: stroke('<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>'),
  refresh: stroke('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  arrowLeft: stroke('<path d="M20 12H4M10 6l-6 6 6 6"/>'),
  bolt: stroke('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  sun: stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  moon: stroke('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
} as const;

export type IconName = keyof typeof icons;

/**
 * Fichas de voto — ilustrações coloridas (48×48) no estilo serigrafia:
 * contorno de tinta grossa, cores chapadas da paleta.
 */
export const tokenArt: Record<TokenKey, string> = {
  rotten: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 13c9 0 16 5.5 16 14.5S33 42 23 42 7 36 8 27.5C9 18 15 13 24 13z" fill="#7c7a2c" stroke="var(--ink)" stroke-width="3"/>
    <path d="M14 22c3-2 5 1 8-1M27 31c3 1 5-1 7 1" stroke="#4b3b16" stroke-width="2.5" fill="none"/>
    <circle cx="18" cy="32" r="3" fill="#4b3b16"/><circle cx="31" cy="22" r="2" fill="#4b3b16"/>
    <path d="M20 41c0 3 2 4 2 6M29 40c1 2 0 3 1 5" stroke="#7c7a2c" stroke-width="3" fill="none"/>
    <path d="M22 14l-3-5M25 14l2-6" stroke="#4b3b16" stroke-width="3"/>
    <g transform="translate(35 5)"><ellipse cx="3" cy="4" rx="3" ry="2.2" fill="var(--ink)"/><ellipse cx="1" cy="1.2" rx="2.4" ry="1.4" fill="none" stroke="var(--ink)" stroke-width="1.2"/><ellipse cx="5" cy="1.2" rx="2.4" ry="1.4" fill="none" stroke="var(--ink)" stroke-width="1.2"/></g>
    <path d="M30 9c3-1 4 1 6-1" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="1.5 1.5" fill="none"/>
  </svg>`,
  tomato: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 12c10 0 17 6 17 15S34 43 24 43 7 36 7 27s7-15 17-15z" fill="#d1281c" stroke="var(--ink)" stroke-width="3"/>
    <path d="M13 22c1-4 4-6 7-6.5" stroke="#f6efdf" stroke-width="3" fill="none"/>
    <path d="M24 15l-4-6 4 2.5L27 6l1 6 6-2-5 5 5 1-6 1z" fill="#2c7a73" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round"/>
  </svg>`,
  zine: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 9h26l6 6v26H8z" fill="#f6efdf" stroke="var(--ink)" stroke-width="3"/>
    <path d="M34 9v6h6" fill="none" stroke="var(--ink)" stroke-width="3"/>
    <rect x="12" y="14" width="17" height="9" fill="var(--ink)"/>
    <path d="M14.5 16.5l4 4M18.5 16.5l-4 4" stroke="#efb21f" stroke-width="2"/>
    <path d="M22 18.5h5" stroke="#efb21f" stroke-width="2"/>
    <path d="M12 28h24M12 32h24M12 36h16" stroke="var(--ink)" stroke-width="2.4"/>
    <rect x="30" y="33" width="7" height="5" fill="#d1281c"/>
  </svg>`,
  vinyl: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="19" fill="#15120e" stroke="var(--ink)" stroke-width="3"/>
    <circle cx="24" cy="24" r="14.5" fill="none" stroke="#4a4237" stroke-width="1.2"/>
    <circle cx="24" cy="24" r="11.5" fill="none" stroke="#4a4237" stroke-width="1.2"/>
    <path d="M12 15a14 14 0 0 1 8-6" stroke="#f6efdf" stroke-width="2.4" fill="none" opacity=".7"/>
    <circle cx="24" cy="24" r="7.5" fill="#d1281c"/>
    <path d="M19 22.5h10" stroke="#f6efdf" stroke-width="1.6"/>
    <circle cx="24" cy="24" r="1.8" fill="#f6efdf"/>
  </svg>`,
  crown: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M6 16l9 8 9-14 9 14 9-8-4 22H10z" fill="#efb21f" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 38h28v5H10z" fill="#efb21f" stroke="var(--ink)" stroke-width="3"/>
    <circle cx="24" cy="29" r="3.2" fill="#d1281c" stroke="var(--ink)" stroke-width="2"/>
    <circle cx="15.5" cy="31" r="2" fill="#2c7a73"/><circle cx="32.5" cy="31" r="2" fill="#2c7a73"/>
    <circle cx="6" cy="16" r="2.4" fill="var(--ink)"/><circle cx="24" cy="9.5" r="2.4" fill="var(--ink)"/><circle cx="42" cy="16" r="2.4" fill="var(--ink)"/>
  </svg>`,
};
