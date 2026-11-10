import type { ServerResponse } from 'node:http';

export type ChangeKind = 'image' | 'delete' | 'vote' | 'pin';

/**
 * Hub de Server-Sent Events: guarda as conexões abertas por board e
 * avisa "mudou" — o cliente busca o estado de novo.
 */
export class Hub {
  private subs = new Map<string, Set<ServerResponse>>();
  private beat: ReturnType<typeof setInterval>;

  constructor(heartbeatMs = 25_000) {
    // comentário periódico mantém proxies e conexões vivos
    this.beat = setInterval(() => this.each((res) => res.write(': ping\n\n')), heartbeatMs);
    this.beat.unref?.();
  }

  open(boardId: string, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // nginx: não segurar o stream
    });
    res.write('retry: 3000\n\n');
    let set = this.subs.get(boardId);
    if (!set) this.subs.set(boardId, (set = new Set()));
    set.add(res);
    res.on('close', () => {
      set.delete(res);
      if (!set.size) this.subs.delete(boardId);
    });
  }

  emit(boardId: string, kind: ChangeKind): void {
    const msg = `event: change\ndata: ${JSON.stringify({ kind, at: Date.now() })}\n\n`;
    for (const res of this.subs.get(boardId) ?? []) res.write(msg);
  }

  /** Encerra todas as conexões de um board (ex.: PIN mudou — reconectam com o novo). */
  closeBoard(boardId: string): void {
    for (const res of this.subs.get(boardId) ?? []) res.end();
    this.subs.delete(boardId);
  }

  count(boardId: string): number {
    return this.subs.get(boardId)?.size ?? 0;
  }

  stop(): void {
    clearInterval(this.beat);
    this.each((res) => res.end());
    this.subs.clear();
  }

  private each(fn: (res: ServerResponse) => void): void {
    for (const set of this.subs.values()) for (const res of set) fn(res);
  }
}
