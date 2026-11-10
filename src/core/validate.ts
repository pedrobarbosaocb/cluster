import type { Palette } from './types.ts';

export const MAX_NAME = 60;
export const MAX_PALETTE = 8;

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s.length ? s : null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanPalette(v: unknown): Palette | null {
  if (!Array.isArray(v) || v.length > MAX_PALETTE) return null;
  const out: Palette = [];
  for (const s of v as unknown[]) {
    if (!s || typeof s !== 'object') return null;
    const { hex, lab, weight } = s as Record<string, unknown>;
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    if (!Array.isArray(lab) || lab.length !== 3 || !lab.every(num)) return null;
    if (!num(weight) || weight < 0 || weight > 1) return null;
    out.push({ hex: hex.toLowerCase(), lab: [lab[0] as number, lab[1] as number, lab[2] as number], weight });
  }
  return out;
}

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export function parseDataUrl(v: unknown): { ext: string; base64: string } | null {
  if (typeof v !== 'string') return null;
  const m = DATA_URL.exec(v);
  if (!m) return null;
  return { ext: m[1] === 'jpeg' ? 'jpg' : m[1]!, base64: m[2]! };
}
