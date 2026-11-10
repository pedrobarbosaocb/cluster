import { api } from '../data/api.ts';
import { ACCEPT, processImage } from '../media/process.ts';
import { h, icon, toast } from '../ui/dom.ts';
import { boardHeader, loadBoard } from './common.ts';

const CONCURRENCY = 2;

export async function uploadView(root: HTMLElement, { id }: Record<string, string>): Promise<() => void> {
  const a = await api();
  const state = await loadBoard(root, a, id!);
  if (!state) return () => {};

  let alive = true;
  const counter = h('span', { class: 'chip', title: 'imagens no board' }, icon('image'), String(state.images.length));
  const fileInput = h('input', { type: 'file', accept: ACCEPT.join(','), multiple: true, class: 'sr-only', id: 'files' });
  const zone = h(
    'label',
    { class: 'dropzone', for: 'files', title: 'Arraste ou clique', 'aria-label': 'Subir imagens' },
    icon('upload', 'ico big'),
    h('span', { class: 'hint' }, 'arrasta o lote aqui'),
  );
  const grid = h('div', { class: 'up-grid' });
  const next = h(
    'a',
    { class: 'btn btn-red', href: `#/b/${id}/vote`, title: 'Avaliar' },
    icon('cards'),
    h('span', {}, 'julgar'),
  );

  root.append(boardHeader(state.board.name, counter), zone, fileInput, grid, h('div', { class: 'cta' }, next));

  // miniaturas já existentes
  for (const img of [...state.images].reverse().slice(0, 60)) grid.append(tile(img.thumbUrl, img.palette.map((p) => p.hex), 'done'));

  const queue: File[] = [];
  let running = 0;

  const pump = (): void => {
    while (alive && running < CONCURRENCY && queue.length) {
      const file = queue.shift()!;
      const el = tile(null, [], 'busy');
      grid.prepend(el);
      running++;
      void (async () => {
        try {
          const img = await processImage(file);
          const rec = await a.addImage(id!, img);
          el.replaceWith(tile(rec.thumbUrl, rec.palette.map((p) => p.hex), 'done'));
          counter.lastChild!.textContent = String(Number(counter.textContent) + 1);
        } catch (e) {
          console.error(e);
          el.dataset.state = 'error';
          el.title = file.name;
        } finally {
          running--;
          if (!queue.length && !running && alive) toast('check', 'lote no ar');
          pump();
        }
      })();
    }
  };

  const add = (files: FileList | File[] | null): void => {
    const ok = [...(files ?? [])].filter((f) => ACCEPT.includes(f.type));
    if (!ok.length) return toast('close', 'só imagem');
    queue.push(...ok);
    pump();
  };

  fileInput.addEventListener('change', () => {
    add(fileInput.files);
    fileInput.value = '';
  });

  const over = (e: DragEvent): void => {
    e.preventDefault();
    zone.classList.add('over');
  };
  const leave = (): void => zone.classList.remove('over');
  const drop = (e: DragEvent): void => {
    e.preventDefault();
    leave();
    add(e.dataTransfer?.files ?? null);
  };
  window.addEventListener('dragover', over);
  window.addEventListener('dragleave', leave);
  window.addEventListener('drop', drop);

  // colar do clipboard (Ctrl+V)
  const paste = (e: ClipboardEvent): void => add([...(e.clipboardData?.files ?? [])]);
  window.addEventListener('paste', paste);

  return () => {
    alive = false;
    window.removeEventListener('dragover', over);
    window.removeEventListener('dragleave', leave);
    window.removeEventListener('drop', drop);
    window.removeEventListener('paste', paste);
  };

  function tile(src: string | null, colors: string[], st: 'busy' | 'done' | 'error'): HTMLElement {
    return h(
      'figure',
      { class: 'up-tile', 'data-state': st },
      src ? h('img', { src, alt: '', loading: 'lazy' }) : icon('drop', 'ico spin'),
      h('div', { class: 'swatches' }, ...colors.map((c) => h('i', { style: `background:${c}` }))),
    );
  }
}

