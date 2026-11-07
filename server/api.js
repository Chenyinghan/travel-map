// Local data API, shared by the dev server (Vite middleware) and the production server (server/index.js)
//   GET    /api/data           read data/travel.json
//   PUT    /api/data           save data/travel.json (atomic write, keeps the previous version as .bak)
//   PUT    /api/photos/<file>  upload a photo file (original / thumbnail / display copy)
//   DELETE /api/photos/<id>    delete all files of a photo
//   GET    /photos/<file>      serve a photo
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.TRAVEL_DATA_DIR || 'data');
const DATA_FILE = path.join(DATA_DIR, 'travel.json');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

const MAX_JSON = 20 * 1024 * 1024;
const MAX_PHOTO = 80 * 1024 * 1024;

const PHOTO_FILE_RE = /^([a-z0-9-]{8,64})(_thumb|_disp)?\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp)$/i;
const PHOTO_ID_RE = /^[a-z0-9-]{8,64}$/i;

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
};

fs.mkdirSync(PHOTO_DIR, { recursive: true });

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('File too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function atomicWrite(file, buf) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, file);
}

// Saves run one at a time so writes never overlap
let writeChain = Promise.resolve();

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/data') {
    if (req.method === 'GET') {
      try {
        const txt = await fsp.readFile(DATA_FILE, 'utf8');
        return send(res, 200, JSON.parse(txt));
      } catch (e) {
        if (e.code === 'ENOENT') return send(res, 200, { version: 1, places: {} });
        throw e;
      }
    }
    if (req.method === 'PUT') {
      const buf = await readBody(req, MAX_JSON);
      const data = JSON.parse(buf.toString('utf8'));
      if (!data || typeof data !== 'object' || typeof data.places !== 'object') {
        return send(res, 400, { error: 'Invalid data format' });
      }
      const job = writeChain.then(async () => {
        if (fs.existsSync(DATA_FILE)) await fsp.copyFile(DATA_FILE, DATA_FILE + '.bak');
        await atomicWrite(DATA_FILE, JSON.stringify(data, null, 2));
      });
      writeChain = job.catch(() => {});
      await job;
      return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
    }
  }

  if (p.startsWith('/api/photos/')) {
    const name = p.slice('/api/photos/'.length);
    if (req.method === 'PUT') {
      if (!PHOTO_FILE_RE.test(name)) return send(res, 400, { error: 'Invalid file name' });
      const buf = await readBody(req, MAX_PHOTO);
      await atomicWrite(path.join(PHOTO_DIR, name), buf);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!PHOTO_ID_RE.test(name)) return send(res, 400, { error: 'Invalid photo id' });
      const files = await fsp.readdir(PHOTO_DIR);
      const mine = files.filter((f) => {
        const m = f.match(PHOTO_FILE_RE);
        return m && m[1] === name;
      });
      await Promise.all(mine.map((f) => fsp.rm(path.join(PHOTO_DIR, f), { force: true })));
      return send(res, 200, { ok: true, removed: mine.length });
    }
  }

  if (p.startsWith('/photos/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const name = p.slice('/photos/'.length);
    const m = name.match(PHOTO_FILE_RE);
    if (!m) return send(res, 404, 'Not found');
    const file = path.join(PHOTO_DIR, name);
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return send(res, 404, 'Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[m[3].toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      // File names are unique and contents never change, so cache for a long time
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
    return;
  }

  return false;
}

export function apiMiddleware() {
  return (req, res, next) => {
    handle(req, res)
      .then((handled) => {
        if (handled === false) next();
      })
      .catch((e) => {
        console.error('[travel-api]', e);
        if (!res.headersSent) send(res, e.status || 500, { error: e.message || 'Server error' });
        else res.end();
      });
  };
}
