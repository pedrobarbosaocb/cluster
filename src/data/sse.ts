export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parser incremental de Server-Sent Events: recebe pedaços de texto e
 * devolve os eventos completos (separados por linha em branco).
 */
export class SseParser {
  private buf = '';

  push(chunk: string): SseEvent[] {
    this.buf += chunk.replace(/\r\n?/g, '\n');
    const out: SseEvent[] = [];
    let i: number;
    while ((i = this.buf.indexOf('\n\n')) >= 0) {
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue; // comentário / heartbeat
        const c = line.indexOf(':');
        const field = c < 0 ? line : line.slice(0, c);
        const value = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) out.push({ event, data: data.join('\n') });
    }
    return out;
  }
}

/** Espera de reconexão: 1 s, 2 s, 4 s… até 15 s. */
export const backoff = (attempt: number): number => Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
