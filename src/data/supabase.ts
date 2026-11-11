import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Board, BoardState, ImageRec, Layout, Vote } from '../core/types.ts';
import { parseDataUrl } from '../core/validate.ts';
import { LockedError, type Api, type LiveHandlers, type NewImage } from './api.ts';
import { getCred, setCred } from './creds.ts';

const BUCKET = 'moodboard';
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Erro devolvido pelas RPCs como {"error": "..."} (ver supabase/migrations). */
class RpcError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function toBlob(dataUrl: string): { blob: Blob; ext: string } {
  const p = parseDataUrl(dataUrl);
  if (!p) throw new Error('imagem inválida');
  const bin = atob(p.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: MIME[p.ext] }), ext: p.ext };
}

/**
 * Backend hospedado no Supabase, para o front publicado no GitHub Pages.
 * Só usa a chave pública: as regras (PIN, dono) ficam nas funções do banco.
 */
export class SupabaseApi implements Api {
  readonly mode = 'server' as const;
  readonly supportsPin = true;
  private readonly sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    const err = (data as { error?: string } | null)?.error;
    if (err === 'locked') throw new LockedError();
    if (err) throw new RpcError(err);
    return data as T;
  }

  /** PIN e chave de dono guardados neste aparelho */
  private creds(boardId: string): { p_pin: string | null; p_owner: string | null } {
    return { p_pin: getCred('pin', boardId), p_owner: getCred('owner', boardId) };
  }

  private url = (path: string): string => this.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  private withUrls = (i: ImageRec): ImageRec => ({ ...i, url: this.url(i.url), thumbUrl: this.url(i.thumbUrl) });

  listBoards(): Promise<Board[]> {
    return this.rpc('mb_list_boards');
  }

  async createBoard(name: string): Promise<Board> {
    const { ownerKey, ...board } = await this.rpc<Board & { ownerKey: string }>('mb_create_board', { p_name: name });
    setCred('owner', board.id, ownerKey);
    return board;
  }

  async getBoard(id: string): Promise<BoardState | null> {
    try {
      const s = await this.rpc<BoardState>('mb_get_board', { p_board: id, ...this.creds(id) });
      return { ...s, images: s.images.map(this.withUrls) };
    } catch (e) {
      if (e instanceof RpcError && e.code === 'not_found') return null;
      throw e;
    }
  }

  async addImage(boardId: string, img: NewImage): Promise<ImageRec> {
    const creds = this.creds(boardId);
    const { imageId } = await this.rpc<{ imageId: string }>('mb_begin_upload', { p_board: boardId, ...creds });
    const full = toBlob(img.image);
    const thumb = toBlob(img.thumb);
    const path = `${boardId}/${imageId}.${full.ext}`;
    const thumbPath = `${boardId}/${imageId}_t.${thumb.ext}`;
    const bucket = this.sb.storage.from(BUCKET);
    for (const [p, f] of [[path, full], [thumbPath, thumb]] as const) {
      const { error } = await bucket.upload(p, f.blob, { contentType: f.blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);
    }
    const rec = await this.rpc<ImageRec>('mb_add_image', {
      p_board: boardId,
      ...creds,
      p_image: imageId,
      p_path: path,
      p_thumb_path: thumbPath,
      p_width: Math.round(img.width),
      p_height: Math.round(img.height),
      p_palette: img.palette,
    });
    return this.withUrls(rec);
  }

  vote(boardId: string, imageId: string, voterId: string, value: number): Promise<Vote> {
    return this.rpc('mb_vote', { p_board: boardId, ...this.creds(boardId), p_image: imageId, p_voter: voterId, p_value: value });
  }

  async unlock(boardId: string, pin: string): Promise<boolean> {
    const prev = getCred('pin', boardId);
    setCred('pin', boardId, pin);
    try {
      await this.rpc('mb_get_board', { p_board: boardId, ...this.creds(boardId) });
      return true;
    } catch (e) {
      setCred('pin', boardId, prev);
      if (e instanceof LockedError) return false;
      throw e;
    }
  }

  isOwner(boardId: string): boolean {
    return !!getCred('owner', boardId);
  }

  ownerKey(boardId: string): string | null {
    return getCred('owner', boardId);
  }

  async claimOwner(boardId: string, key: string): Promise<boolean> {
    try {
      await this.rpc('mb_claim_owner', { p_board: boardId, p_key: key });
      setCred('owner', boardId, key);
      return true;
    } catch (e) {
      if (e instanceof RpcError && e.code === 'forbidden') return false;
      throw e;
    }
  }

  async deleteImage(boardId: string, imageId: string): Promise<void> {
    const { files } = await this.rpc<{ files: string[] }>('mb_delete_image', {
      p_board: boardId,
      p_owner: getCred('owner', boardId),
      p_image: imageId,
    });
    // o banco liberou a remoção só desses arquivos; se falhar, sobra lixo mas o board já está certo
    await this.sb.storage.from(BUCKET).remove(files).catch(() => undefined);
  }

  async setPin(boardId: string, pin: string | null): Promise<Board> {
    const board = await this.rpc<Board>('mb_set_pin', { p_board: boardId, p_owner: getCred('owner', boardId), p_pin: pin });
    setCred('pin', boardId, pin);
    return board;
  }

  async setLayout(boardId: string, layout: Layout | null): Promise<void> {
    await this.rpc('mb_set_layout', { p_board: boardId, p_owner: getCred('owner', boardId), p_layout: layout });
  }

  /** Realtime Broadcast: o banco avisa no canal "board:<id>" a cada mudança. */
  subscribe(boardId: string, h: LiveHandlers): () => void {
    let closed = false;
    const channel = this.sb
      .channel(`board:${boardId}`)
      .on('broadcast', { event: 'change' }, ({ payload }) => {
        const kind = typeof payload?.kind === 'string' ? payload.kind : 'unknown';
        if (kind !== 'pin') return h.onChange(kind);
        // PIN mudou: se este aparelho ficou sem acesso, a view mostra a tela de PIN
        this.getBoard(boardId).then(
          () => h.onChange(kind),
          (e: unknown) => {
            if (e instanceof LockedError) h.onLocked?.();
          },
        );
      })
      .subscribe((status) => {
        if (!closed) h.onStatus?.(status === 'SUBSCRIBED');
      });
    return () => {
      closed = true;
      void this.sb.removeChannel(channel);
    };
  }
}
