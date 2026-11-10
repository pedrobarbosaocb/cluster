import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const dist = resolve(process.env.STATIC_DIR ?? 'dist');

const app = await createApp({ dataDir, staticDir: existsSync(dist) ? dist : undefined });
app.listen(port, host, () => {
  console.log(`🤘 Moodboard da FlatHead em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`   dados: ${dataDir}${existsSync(dist) ? '' : '  (sem dist/: rode npm run build para servir o front)'}`);
});
