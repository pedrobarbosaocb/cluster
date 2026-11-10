import './styles.css';
import './views.css';
import { mountShell } from './ui/shell.ts';
import { Router } from './ui/router.ts';
import { homeView } from './views/home.ts';
import { uploadView } from './views/upload.ts';
import { voteView } from './views/vote.ts';
import { boardView } from './views/board.ts';
import { notFound } from './views/common.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const main = mountShell(app);

new Router(main, notFound)
  .on('/', homeView)
  .on('/b/:id', boardView)
  .on('/b/:id/up', uploadView)
  .on('/b/:id/vote', voteView)
  .start();
