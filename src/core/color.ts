import type { Lab } from './types.ts';

const toLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number): number => {
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

// Branco de referência D65
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number): number => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInv = (t: number): number => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / XN;
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / YN;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = fInv(fx) * XN;
  const y = fInv(fy) * YN;
  const z = fInv(fz) * ZN;
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  return [fromLinear(R), fromLinear(G), fromLinear(B)];
}

export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export const labToHex = (lab: Lab): string => rgbToHex(...labToRgb(lab));

/** Distância perceptual CIE76 (ΔE). */
export const deltaE = (a: Lab, b: Lab): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
