const ALPHABET = '0123456789abcdefghijkmnopqrstuvwxyz';

/**
 * Id curto e aleatório. Usa crypto.getRandomValues (funciona também em
 * HTTP puro, ao contrário de crypto.randomUUID que exige contexto seguro).
 */
export function newId(len = 10): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-z]{4,32}$/.test(v);
