/** Credenciais por board guardadas neste dispositivo: chave do dono e PIN. */
type Kind = 'owner' | 'pin';

const key = (kind: Kind, boardId: string): string => `flathead.${kind}.${boardId}`;

export function getCred(kind: Kind, boardId: string): string | null {
  try {
    return localStorage.getItem(key(kind, boardId));
  } catch {
    return null;
  }
}

export function setCred(kind: Kind, boardId: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key(kind, boardId));
    else localStorage.setItem(key(kind, boardId), value);
  } catch {
    /* sem storage: vale só nesta sessão */
  }
}
