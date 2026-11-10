import './styles.css';
import { mountShell } from './ui/shell.ts';
import { Router } from './ui/router.ts';
import { h, icon } from './ui/dom.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const main = mountShell(app);

new Router(main, (root) => void root.append(h('div', { class: 'empty' }, icon('skull'))))
  .on('/', (root) => void root.append(h('h1', { class: 'headline', html: 'Moodboard<br>da <span class="hl">Flat<span class="red">Head</span></span>' })))
  .start();
