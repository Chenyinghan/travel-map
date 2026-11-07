// Production mode: `npm run build`, then `node server/index.js` (or just `npm start`)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { apiMiddleware, DATA_DIR } from './api.js';

const PORT = Number(process.env.PORT) || 3000;
const DIST = path.resolve('dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ not found. Run npm run build first (or just npm start).');
  process.exit(1);
}

const api = apiMiddleware();

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await fsp.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => api(req, res, () => serveStatic(req, res)))
  .listen(PORT, () => {
    console.log(`\n  Travel map running at http://localhost:${PORT}`);
    console.log(`  Data folder: ${DATA_DIR}\n`);
  });
