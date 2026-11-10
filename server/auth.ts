import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface BoardSecret {
  /** sha256 da chave do dono */
  owner?: string;
  /** PIN com scrypt + sal */
  pin?: { salt: string; hash: string };
}

export const PIN_RE = /^\d{4,8}$/;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function newOwnerKey(): { key: string; hash: string } {
  const key = randomBytes(24).toString('base64url');
  return { key, hash: sha256(key) };
}

export function checkOwner(secret: BoardSecret | undefined, key: unknown, adminToken?: string): boolean {
  if (typeof key !== 'string' || key.length < 16 || key.length > 128) return false;
  if (adminToken && adminToken.length >= 16 && safeEqual(key, adminToken)) return true;
  return !!secret?.owner && safeEqual(sha256(key), secret.owner);
}

export function hashPin(pin: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') };
}

export function checkPin(secret: BoardSecret | undefined, pin: unknown): boolean {
  if (!secret?.pin) return true;
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return false;
  return safeEqual(scryptSync(pin, secret.pin.salt, 32).toString('hex'), secret.pin.hash);
}

/** Limita tentativas erradas de PIN/chave por IP+board numa janela de tempo. */
export class Throttle {
  private fails = new Map<string, { n: number; until: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = 8, windowMs = 10 * 60_000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  blocked(key: string, now = Date.now()): boolean {
    const f = this.fails.get(key);
    if (!f) return false;
    if (now > f.until) {
      this.fails.delete(key);
      return false;
    }
    return f.n >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    const f = this.fails.get(key);
    if (!f || now > f.until) this.fails.set(key, { n: 1, until: now + this.windowMs });
    else f.n++;
    if (this.fails.size > 10_000) this.fails.clear(); // proteção de memória
  }

  reset(key: string): void {
    this.fails.delete(key);
  }
}
