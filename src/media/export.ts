import { shelf } from '../core/arrange.ts';
import { buildMoodboard } from '../core/moodboard.ts';
import { seededRandom } from '../core/math.ts';
import type { BoardState } from '../core/types.ts';

const CELL = 22;
const PAD = 72;
const GAP = 64;
const STRIP = 14;
const STRIP_GAP = 12;
const MAX_SIDE = 8000;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // evita "tainted canvas" quando a API está em outra origem
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** drawImage com recorte "object-fit: cover". */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** Ruído de impressão: pontos e manchas espalhados, determinísticos. */
function noise(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  const r = seededRandom(1993);
  ctx.save();
  ctx.fillStyle = color;
  const n = Math.round((w * h) / 2200);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.04 + r() * 0.16;
    const rad = r() < 0.92 ? 0.4 + r() * 1.2 : 1.8 + r() * 2.4;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Renderiza o moodboard (mesmo agrupamento e tamanhos da tela) num PNG.
 * As cores seguem o tema atual.
 */
export async function renderBoardPng(state: BoardState, scale = 2): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const color = (v: string, fb: string): string => css.getPropertyValue(v).trim() || fb;
  const bg = color('--bg', '#e9dfc8');
  const ink = color('--ink', '#15120e');
  const paper = color('--paper', '#f6efdf');
  const red = color('--red', '#d1281c');

  await Promise.all([document.fonts.load('64px Anton'), document.fonts.load('16px "Special Elite"')]).catch(() => {});

  const mb = buildMoodboard(state.images, state.votes, CELL);
  const boxes = mb.clusters.map((c) => ({ w: Math.max(c.layout.width, 40), h: STRIP + STRIP_GAP + c.layout.height }));
  const target = Math.max(900, Math.sqrt(boxes.reduce((s, b) => s + (b.w + GAP) * (b.h + GAP), 0)) * 1.5);
  const arranged = shelf(boxes, target, GAP);

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = '64px Anton, Impact, sans-serif';
  const titleW = measure.measureText(state.board.name.toUpperCase()).width + 44;

  const titleH = 120;
  const footH = 56;
  const W = Math.max(arranged.width, 640, titleW) + PAD * 2;
  const H = titleH + arranged.height + footH + PAD * 2;
  const k = Math.min(scale, MAX_SIDE / Math.max(W, H));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * k);
  canvas.height = Math.round(H * k);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(k, k);

  // fundo + ruído
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  noise(ctx, W, H, ink);

  // título: bloco de tinta com sombra vermelha
  ctx.font = '64px Anton, Impact, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const title = state.board.name.toUpperCase();
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = red;
  ctx.fillRect(PAD + 8, PAD + 8, tw + 36, 84);
  ctx.fillStyle = ink;
  ctx.fillRect(PAD, PAD, tw + 36, 84);
  ctx.fillStyle = paper;
  ctx.fillText(title, PAD + 18, PAD + 70);

  // imagens (em paralelo)
  const imgs = new Map(
    await Promise.all(state.images.map(async (i) => [i.id, (await loadImage(i.url)) ?? (await loadImage(i.thumbUrl))] as const)),
  );

  const ox = PAD + (W - PAD * 2 - arranged.width) / 2;
  const oy = PAD + titleH;
  mb.clusters.forEach((c, ci) => {
    const p = arranged.positions[ci]!;
    const x0 = ox + p.x;
    const y0 = oy + p.y;
    // faixa de paleta
    const total = c.palette.reduce((s, sw) => s + sw.weight, 0) || 1;
    let sx = x0;
    for (const sw of c.palette) {
      const w = (sw.weight / total) * c.layout.width;
      ctx.fillStyle = sw.hex;
      ctx.fillRect(sx, y0, w, STRIP);
      sx += w;
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, c.layout.width, STRIP);
    // peças
    const yImg = y0 + STRIP + STRIP_GAP;
    for (const piece of c.layout.items) {
      const img = imgs.get(piece.id);
      const x = x0 + piece.x;
      const y = yImg + piece.y;
      if (img) drawCover(ctx, img, x, y, piece.w, piece.h);
      else {
        ctx.fillStyle = paper;
        ctx.fillRect(x, y, piece.w, piece.h);
      }
      ctx.strokeRect(x + 1, y + 1, piece.w - 2, piece.h - 2);
    }
  });

  // rodapé
  ctx.font = '22px Anton, Impact, sans-serif';
  ctx.fillStyle = red;
  const brand = 'FLATHEAD';
  const bw = ctx.measureText(brand).width;
  ctx.fillRect(W - PAD - bw - 16, H - PAD - 30, bw + 16, 32);
  ctx.fillStyle = paper;
  ctx.fillText(brand, W - PAD - bw - 8, H - PAD - 6);
  ctx.font = '14px "Special Elite", monospace';
  ctx.fillStyle = ink;
  ctx.textAlign = 'right';
  ctx.fillText(`${state.images.length} img · ${mb.voters} votantes · ${new Date().toLocaleDateString()}`, W - PAD - bw - 32, H - PAD - 8);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao gerar PNG'))), 'image/png'),
  );
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
