export type Cleanup = () => void;
export type View = (root: HTMLElement, params: Record<string, string>) => Cleanup | void | Promise<Cleanup | void>;

interface Route {
  re: RegExp;
  keys: string[];
  view: View;
}

/** Router por hash (#/...) — funciona em qualquer hospedagem estática, inclusive GitHub Pages. */
export class Router {
  private routes: Route[] = [];
  private cleanup: Cleanup | void = undefined;
  private seq = 0;
  private root: HTMLElement;
  private fallback: View;

  constructor(root: HTMLElement, fallback: View) {
    this.root = root;
    this.fallback = fallback;
  }

  on(pattern: string, view: View): this {
    const keys: string[] = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)')).replace(/\//g, '\\/') + '\\/?$',
    );
    this.routes.push({ re, keys, view });
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => void this.resolve());
    void this.resolve();
  }

  static go(path: string): void {
    location.hash = '#' + path;
  }

  static path(): string {
    return location.hash.replace(/^#/, '') || '/';
  }

  private async resolve(): Promise<void> {
    const path = Router.path();
    const seq = ++this.seq;
    this.cleanup?.();
    this.cleanup = undefined;
    this.root.replaceChildren();
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')));
      const c = await r.view(this.root, params);
      if (seq === this.seq) this.cleanup = c;
      else c?.();
      document.dispatchEvent(new CustomEvent('route', { detail: path }));
      return;
    }
    await this.fallback(this.root, {});
  }
}
