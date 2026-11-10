import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { isId, newId } from '../src/core/ids.ts';
import { cleanName, cleanPalette, parseDataUrl } from '../src/core/validate.ts';
import { isValidVote } from '../src/core/votes.ts';
import type { Board, BoardState, ImageRec, Vote } from '../src/core/types.ts';
import { checkOwner, checkPin, hashPin, newOwnerKey, PIN_RE, Throttle, type BoardSecret } from './auth.ts';

export interface AppOptions {
  dataDir: string;
  staticDir?: string;
  maxBody?: number;
  /** origem liberada para CORS (ex.: https://usuario.github.io) */
  corsOrigin?: string;
  /** chave mestra: vale como chave de dono de qualquer board (recuperação / boards antigos) */
  adminToken?: string;
}

interface Db {
  boards: Board[];
  images: ImageRec[];
  votes: (Vote & { boardId: string })[];
  /** segredos fora dos objetos públicos — nunca enviados ao cliente */
  secrets: Record<string, BoardSecret>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

/** Persistência simples: estado em memória, gravado em JSON de forma atômica. */
class JsonStore {
  db: Db = { boards: [], images: [], votes: [], secrets: {} };
  private file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(dir: string) {
    this.file = join(dir, 'db.json');
  }

  async load(): Promise<void> {
    try {
      this.db = { ...this.db, ...(JSON.parse(await readFile(this.file, 'utf8')) as Db) };
    } catch {
      /* primeiro uso */
    }
  }

  save(): Promise<void> {
    const snapshot = JSON.stringify(this.db);
    this.writing = this.writing.then(async () => {
      await writeFile(this.file + '.tmp', snapshot);
      await rename(this.file + '.tmp', this.file);
    });
    return this.writing;
  }
}

async function readJson(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, 'payload grande demais');
    chunks.push(c as Buffer);
  }
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object') throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'json inválido');
  }
}

const send = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function serveFile(res: ServerResponse, root: string, rel: string, cache: string): Promise<boolean> {
  const base = resolve(root);
  const file = resolve(base, normalize('.' + sep + rel));
  if (!file.startsWith(base + sep)) return false;
  try {
    const st = await stat(file);
    if (!st.isFile()) return false;
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': cache,
    });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export async function createApp(opts: AppOptions): Promise<Server> {
  const { dataDir, staticDir, maxBody = 12 * 1024 * 1024, corsOrigin, adminToken } = opts;
  const throttle = new Throttle();
  const uploads = join(dataDir, 'uploads');
  await mkdir(uploads, { recursive: true });
  const store = new JsonStore(dataDir);
  await store.load();

  const pub = (b: Board): Board => ({ ...b, locked: !!store.db.secrets[b.id]?.pin });
  const header = (req: IncomingMessage, name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };

  const state = (id: string): BoardState | null => {
    const board = store.db.boards.find((b) => b.id === id);
    if (!board) return null;
    return {
      board: pub(board),
      images: store.db.images.filter((i) => i.boardId === id),
      votes: store.db.votes.filter((v) => v.boardId === id).map(({ boardId: _b, ...v }) => v),
    };
  };

  const handleApi = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<void> => {
    const [, , boards, boardId, sub, subId] = parts; // ['', 'api', 'boards', id, sub, subId]
    const method = req.method ?? 'GET';

    if (parts[2] === 'health') return send(res, 200, { ok: true });
    if (boards !== 'boards') throw new HttpError(404, 'não encontrado');

    if (!boardId) {
      if (method === 'GET') return send(res, 200, store.db.boards.map(pub).sort((a, b) => b.createdAt - a.createdAt));
      if (method === 'POST') {
        const name = cleanName((await readJson(req, 4096)).name);
        if (!name) throw new HttpError(400, 'nome inválido');
        const board: Board = { id: newId(), name, createdAt: Date.now() };
        const owner = newOwnerKey();
        store.db.boards.push(board);
        store.db.secrets[board.id] = { owner: owner.hash };
        await store.save();
        // a chave do dono só é revelada aqui, uma vez
        return send(res, 201, { ...pub(board), ownerKey: owner.key });
      }
      throw new HttpError(405, 'método não permitido');
    }

    if (!isId(boardId)) throw new HttpError(404, 'board não encontrado');
    const s = state(boardId);
    if (!s) throw new HttpError(404, 'board não encontrado');

    const secret = store.db.secrets[boardId];
    const who = `${req.socket.remoteAddress ?? '?'}|${boardId}`;
    if (throttle.blocked(who)) throw new HttpError(429, 'muitas tentativas, espera um pouco');

    // validar chave de dono (usada pra "entrar como dono" em outro aparelho)
    if (sub === 'owner' && method === 'POST') {
      if (checkOwner(secret, (await readJson(req, 1024)).key, adminToken)) {
        throttle.reset(who);
        return send(res, 200, { ok: true });
      }
      throttle.fail(who);
      throw new HttpError(403, 'chave inválida');
    }

    const isOwner = checkOwner(secret, header(req, 'x-owner-key'), adminToken);
    if (!isOwner) {
      const pin = header(req, 'x-board-pin');
      if (!checkPin(secret, pin)) {
        if (pin) throttle.fail(who);
        return send(res, 401, { error: 'pin', locked: true });
      }
    }

    if (!sub && method === 'GET') return send(res, 200, s);

    if (sub === 'pin' && method === 'PUT') {
      if (!isOwner) throw new HttpError(403, 'só o dono');
      const { pin } = await readJson(req, 1024);
      if (pin !== null && (typeof pin !== 'string' || !PIN_RE.test(pin))) throw new HttpError(400, 'pin deve ter 4 a 8 dígitos');
      const next: BoardSecret = { ...(secret ?? {}) };
      if (pin === null) delete next.pin;
      else next.pin = hashPin(pin);
      store.db.secrets[boardId] = next;
      await store.save();
      return send(res, 200, pub(s.board));
    }

    if (sub === 'images' && subId && method === 'DELETE') {
      if (!isOwner) throw new HttpError(403, 'só o dono');
      const img = s.images.find((i) => i.id === subId);
      if (!img) throw new HttpError(404, 'imagem não encontrada');
      store.db.images = store.db.images.filter((i) => i.id !== subId);
      store.db.votes = store.db.votes.filter((v) => v.imageId !== subId);
      await store.save();
      for (const u of [img.url, img.thumbUrl])
        if (u.startsWith('/uploads/')) await rm(join(uploads, u.slice('/uploads/'.length)), { force: true });
      return send(res, 200, { ok: true });
    }

    if (sub === 'images' && !subId && method === 'POST') {
      const body = await readJson(req, maxBody);
      const img = parseDataUrl(body.image);
      const thumb = parseDataUrl(body.thumb);
      const palette = cleanPalette(body.palette);
      const width = Number(body.width);
      const height = Number(body.height);
      if (!img || !thumb || !palette || !(width > 0) || !(height > 0)) throw new HttpError(400, 'imagem inválida');
      const id = newId();
      await writeFile(join(uploads, `${id}.${img.ext}`), Buffer.from(img.base64, 'base64'));
      await writeFile(join(uploads, `${id}_t.${thumb.ext}`), Buffer.from(thumb.base64, 'base64'));
      const rec: ImageRec = {
        id,
        boardId,
        url: `/uploads/${id}.${img.ext}`,
        thumbUrl: `/uploads/${id}_t.${thumb.ext}`,
        width: Math.round(width),
        height: Math.round(height),
        palette,
        createdAt: Date.now(),
      };
      store.db.images.push(rec);
      await store.save();
      return send(res, 201, rec);
    }

    if (sub === 'votes' && method === 'PUT') {
      const { imageId, voterId, value } = await readJson(req, 2048);
      if (!isId(imageId) || !isId(voterId) || !isValidVote(value)) throw new HttpError(400, 'voto inválido');
      if (!s.images.some((i) => i.id === imageId)) throw new HttpError(404, 'imagem não encontrada');
      const vote = { boardId, imageId, voterId, value, at: Date.now() };
      const idx = store.db.votes.findIndex((v) => v.imageId === imageId && v.voterId === voterId);
      if (idx >= 0) store.db.votes[idx] = vote;
      else store.db.votes.push(vote);
      await store.save();
      const { boardId: _b, ...out } = vote;
      return send(res, 200, out);
    }

    throw new HttpError(405, 'método não permitido');
  };

  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = decodeURIComponent(url.pathname);
      if (corsOrigin) {
        res.setHeader('access-control-allow-origin', corsOrigin);
        res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('access-control-allow-headers', 'content-type, x-board-pin, x-owner-key');
        res.setHeader('vary', 'origin');
        if (req.method === 'OPTIONS') {
          res.writeHead(204).end();
          return;
        }
      }
      try {
        if (path.startsWith('/api/')) return await handleApi(req, res, path.split('/'));
        if (path.startsWith('/uploads/')) {
          if (await serveFile(res, uploads, path.slice('/uploads/'.length), 'public, max-age=31536000, immutable'))
            return;
          throw new HttpError(404, 'não encontrado');
        }
        if (staticDir) {
          const rel = path === '/' ? 'index.html' : path.slice(1);
          const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
          if (await serveFile(res, staticDir, rel, cache)) return;
          if (await serveFile(res, staticDir, 'index.html', 'no-cache')) return;
        }
        throw new HttpError(404, 'não encontrado');
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(e);
        if (!res.headersSent) send(res, status, { error: e instanceof HttpError ? e.message : 'erro interno' });
        else res.end();
      }
    })();
  });
}
