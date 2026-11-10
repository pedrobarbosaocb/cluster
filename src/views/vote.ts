import { seededRandom } from '../core/math.ts';
import type { ImageRec } from '../core/types.ts';
import { TOKENS, tokenByValue, type Token } from '../core/votes.ts';
import { api } from '../data/api.ts';
import { voterId } from '../data/identity.ts';
import { h, icon, iconBtn, toast } from '../ui/dom.ts';
import { tokenArt } from '../ui/icons.ts';
import { boardHeader, notFound } from './common.ts';

const hash = (s: string): number => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

function shuffle<T>(arr: T[], seed: number): T[] {
  const r = seededRandom(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export async function voteView(root: HTMLElement, { id }: Record<string, string>): Promise<() => void> {
  const a = await api();
  const state = await a.getBoard(id!);
  if (!state) return notFound(root);
  const me = voterId();

  const mine = new Map(state.votes.filter((v) => v.voterId === me).map((v) => [v.imageId, v.value]));
  const all = shuffle(state.images, hash(me + id));
  let queue: ImageRec[] = all.filter((i) => !mine.has(i.id));
  const history: { img: ImageRec; prev: number | undefined }[] = [];

  const progress = h('span', { class: 'chip', title: 'avaliadas' }, icon('check'), '');
  const stage = h('div', { class: 'stage' });
  const hand = h('div', { class: 'hand', role: 'group', 'aria-label': 'fichas' });
  const undoBtn = iconBtn('undo', 'Desfazer (Z)', () => void undo(), 'btn-ghost');
  const skipBtn = iconBtn('skip', 'Pular (→)', () => skip(), 'btn-ghost');
  const tools = h('div', { class: 'vote-tools' }, undoBtn, skipBtn);

  root.append(boardHeader(state.board.name, progress), stage, hand, tools);

  const tokenEls = new Map<number, HTMLButtonElement>();
  for (const t of TOKENS) {
    const b = h(
      'button',
      { class: `token token-${t.key}`, type: 'button', title: `${t.label} · ${t.value} (${t.hotkey})`, 'aria-label': `${t.label}, ${t.value} pontos`, 'data-value': t.value },
      h('span', { class: 'token-art', html: tokenArt[t.key] }),
      h('span', { class: 'token-val' }, String(t.value)),
    );
    b.addEventListener('click', () => void cast(t));
    tokenEls.set(t.value, b);
    hand.append(b);
  }

  let card: HTMLElement | null = null;
  let busy = false;

  const updateProgress = (): void => {
    const done = state.images.length - queue.length;
    progress.lastChild!.textContent = ` ${done}/${state.images.length}`;
    undoBtn.disabled = history.length === 0;
    skipBtn.disabled = queue.length < 2;
  };

  const render = (): void => {
    stage.replaceChildren();
    card = null;
    updateProgress();
    const img = queue[0];
    if (!img) {
      hand.hidden = true;
      tools.hidden = state.images.length === 0 || history.length === 0;
      stage.append(
        state.images.length === 0
          ? h('div', { class: 'empty' }, icon('image'), h('a', { class: 'btn btn-red btn-icon', href: `#/b/${id}/up`, title: 'Subir imagens', 'aria-label': 'Subir imagens' }, icon('upload')))
          : h(
              'div',
              { class: 'empty done' },
              h('span', { class: 'token-art', html: tokenArt.crown }),
              h('p', { class: 'stamp' }, 'feito'),
              h(
                'div',
                { class: 'row' },
                h('a', { class: 'btn btn-red', href: `#/b/${id}`, title: 'Ver moodboard' }, icon('board'), 'board'),
                iconBtn('refresh', 'Rever tudo', () => {
                  queue = [...all];
                  render();
                }),
              ),
            ),
      );
      return;
    }
    hand.hidden = false;
    tools.hidden = false;
    // cartas de trás (só visual)
    // pilha alinhada: cartas de trás com o mesmo tamanho da atual
    const behind = Math.min(2, queue.length - 1);
    for (let i = behind; i >= 1; i--) stage.append(h('div', { class: `card ghost g${i}`, 'aria-hidden': 'true' }, h('img', { src: img.url, alt: '' })));
    const prev = mine.get(img.id);
    for (const [v, b] of tokenEls) b.classList.toggle('chosen', v === prev);
    card = h(
      'div',
      { class: 'card live', tabindex: 0, 'aria-label': 'imagem atual' },
      h('img', { src: img.url, alt: '', draggable: 'false' }),
      prev !== undefined ? h('span', { class: 'card-prev', html: tokenArt[tokenByValue(prev)!.key] }) : null,
    );
    stage.append(card);
    bindDrag(card);
    // pré-carrega a próxima
    if (queue[1]) new Image().src = queue[1].url;
  };

  const cast = async (t: Token, fromDrag = false): Promise<void> => {
    const img = queue[0];
    if (!img || busy || !card) return;
    busy = true;
    const el = card;
    const target = tokenEls.get(t.value)!;
    target.classList.add('hit');
    setTimeout(() => target.classList.remove('hit'), 380);
    if (!fromDrag) {
      const r1 = el.getBoundingClientRect();
      const r2 = target.getBoundingClientRect();
      el.style.setProperty('--tx', `${r2.left + r2.width / 2 - (r1.left + r1.width / 2)}px`);
      el.style.setProperty('--ty', `${r2.top - (r1.top + r1.height / 2)}px`);
    }
    el.classList.add('thrown');
    try {
      await a.vote(id!, img.id, me, t.value);
      history.push({ img, prev: mine.get(img.id) });
      mine.set(img.id, t.value);
      queue.shift();
    } catch {
      toast('bolt', 'falhou');
    }
    setTimeout(() => {
      busy = false;
      render();
    }, 260);
  };

  const skip = (): void => {
    if (queue.length < 2 || busy) return;
    queue.push(queue.shift()!);
    render();
  };

  const undo = async (): Promise<void> => {
    const last = history.pop();
    if (!last || busy) return;
    queue = [last.img, ...queue.filter((i) => i.id !== last.img.id)];
    if (last.prev !== undefined) {
      mine.set(last.img.id, last.prev);
      await a.vote(id!, last.img.id, me, last.prev).catch(() => {});
    } else mine.delete(last.img.id);
    render();
  };

  function bindDrag(el: HTMLElement): void {
    let sx = 0;
    let sy = 0;
    let dragging = false;
    let over: number | null = null;

    const tokenAt = (x: number, y: number): number | null => {
      for (const [v, b] of tokenEls) {
        const r = b.getBoundingClientRect();
        const pad = 18;
        if (x > r.left - pad && x < r.right + pad && y > r.top - pad * 2 && y < r.bottom + pad) return v;
      }
      return null;
    };

    el.addEventListener('pointerdown', (e) => {
      if (busy) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      hand.classList.add('aiming');
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 40}deg)`;
      const v = tokenAt(e.clientX, e.clientY);
      if (v !== over) {
        if (over !== null) tokenEls.get(over)?.classList.remove('armed');
        if (v !== null) tokenEls.get(v)?.classList.add('armed');
        over = v;
      }
      el.classList.toggle('skipping', v === null && dx < -110);
    });
    const end = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging', 'skipping');
      hand.classList.remove('aiming');
      const dx = e.clientX - sx;
      const v = over;
      if (over !== null) tokenEls.get(over)?.classList.remove('armed');
      over = null;
      if (v !== null) {
        el.style.setProperty('--tx', `${dx}px`);
        el.style.setProperty('--ty', `${e.clientY - sy + 40}px`);
        el.style.transform = '';
        void cast(tokenByValue(v)!, true);
      } else if (dx < -110 && queue.length > 1) {
        el.style.transform = `translate(-120vw, 0) rotate(-30deg)`;
        setTimeout(skip, 180);
      } else el.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    const t = TOKENS.find((x) => x.hotkey === e.key);
    if (t) void cast(t);
    else if (e.key === 'ArrowRight') skip();
    else if (e.key.toLowerCase() === 'z' || (e.key === 'Backspace' && !e.repeat)) void undo();
  };
  window.addEventListener('keydown', onKey);

  render();
  return () => window.removeEventListener('keydown', onKey);
}
