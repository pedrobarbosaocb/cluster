import { api } from '../data/api.ts';
import { h, icon, toast } from '../ui/dom.ts';
import { Router } from '../ui/router.ts';

export async function homeView(root: HTMLElement): Promise<void> {
  const a = await api();

  const input = h('input', {
    class: 'field',
    name: 'name',
    placeholder: 'nome do board',
    'aria-label': 'Nome do board',
    maxlength: 60,
    autocomplete: 'off',
    required: true,
  });
  const form = h(
    'form',
    {
      class: 'create tape',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return input.focus();
        try {
          const b = await a.createBoard(name);
          Router.go(`/b/${b.id}/up`);
        } catch {
          toast('bolt', 'falhou');
        }
      },
    },
    input,
    h('button', { class: 'btn btn-red btn-icon', type: 'submit', title: 'Criar board', 'aria-label': 'Criar board' }, icon('plus')),
  );

  const hero = h(
    'section',
    { class: 'hero' },
    h('h1', { class: 'headline', html: 'Moodboard<br>da <span class="hl">Flat<span class="red">Head</span></span>' }),
    h(
      'ol',
      { class: 'steps', 'aria-label': 'como funciona' },
      h('li', {}, icon('upload'), h('span', {}, 'sobe')),
      h('li', {}, icon('cards'), h('span', {}, 'julga')),
      h('li', {}, icon('board'), h('span', {}, 'cola')),
    ),
    form,
  );

  const list = h('section', { class: 'boards', 'aria-label': 'boards' });
  root.append(hero, list);
  input.focus();

  try {
    const boards = await a.listBoards();
    list.append(
      ...boards.map((b) =>
        h(
          'a',
          { class: 'board-card', href: `#/b/${b.id}` },
          icon('board'),
          h('strong', {}, b.name),
          h('time', { datetime: new Date(b.createdAt).toISOString() }, new Date(b.createdAt).toLocaleDateString()),
        ),
      ),
    );
  } catch {
    list.append(h('p', { class: 'empty' }, icon('bolt'), 'servidor fora do ar'));
  }
}
