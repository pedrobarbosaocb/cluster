import { extractPalette } from '../core/palette.ts';
import type { NewImage } from '../data/api.ts';

export const MAX_SIDE = 1600;
export const THUMB_SIDE = 520;
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* cai pro <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

const fit = (w: number, h: number, max: number): [number, number] => {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
};

/** Redimensiona, gera miniatura e extrai a paleta — tudo no navegador. */
export async function processImage(file: Blob): Promise<NewImage> {
  const src = await decode(file);
  const [w, h] = fit(src.width, src.height, MAX_SIDE);
  const [tw, th] = fit(src.width, src.height, THUMB_SIDE);
  const full = draw(src, w, h);
  const thumb = draw(src, tw, th);
  const [pw, ph] = fit(src.width, src.height, 96);
  const small = draw(src, pw, ph);
  const pixels = small.getContext('2d')!.getImageData(0, 0, pw, ph).data;
  if ('close' in src && typeof src.close === 'function') src.close();
  return {
    image: full.toDataURL('image/jpeg', 0.86),
    thumb: thumb.toDataURL('image/jpeg', 0.8),
    width: w,
    height: h,
    palette: extractPalette(pixels, { k: 5 }),
  };
}
