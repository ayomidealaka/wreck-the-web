import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { snapshot, closeBrowser } from './snapshot.js';

const PORT = Number(process.env.PORT) || 4600;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// level cache: same url + mode within 15 min reuses the render
const levels = new Map(); // id -> { meta, image, t }
const byKey = new Map();  // url|mode -> id
const TTL = 15 * 60 * 1000;
function remember(key, data) {
  const id = crypto.randomBytes(8).toString('hex');
  const { image, ...meta } = data;
  levels.set(id, { meta: { ...meta, id }, image: Buffer.from(image), t: Date.now() });
  byKey.set(key, id);
  for (const [k, v] of levels) if (Date.now() - v.t > TTL || levels.size > 40) levels.delete(k);
  for (const [k, v] of byKey) if (!levels.has(v)) byKey.delete(k);
  return id;
}

// per-IP rate limit for renders
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list);
  return list.length > 12;
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/play/level') {
      const q = u.searchParams, target = q.get('url');
      const opts = { mobile: q.get('mode') === 'mobile', width: +q.get('w'), height: +q.get('h'), dpr: +q.get('dpr') };
      const key = `${target}|${opts.mobile}|${opts.width}|${opts.height}|${opts.dpr}`;
      const cached = byKey.get(key);
      if (cached && levels.has(cached)) return send(res, 200, levels.get(cached).meta);
      if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many websites at once. Wait a minute and try again.' });
      const t0 = Date.now();
      const data = await snapshot(target, opts);
      const id = remember(key, data);
      console.log(`level ${data.url} (${data.mode}) ${data.width}x${data.height}@${data.scale}x ${(data.image.length / 1e6).toFixed(1)}MB ${data.letters.length / 4} letters, ${data.boxes.length / 5} boxes in ${Date.now() - t0}ms`);
      return send(res, 200, levels.get(id).meta);
    }
    const img = u.pathname.match(/^\/play\/level\/([a-f0-9]{16})\.webp$/);
    if (img) {
      const lv = levels.get(img[1]);
      if (!lv) return send(res, 404, { error: 'Level expired.' });
      return send(res, 200, lv.image, 'image/webp', { 'Cache-Control': 'private, max-age=900' });
    }
    // static files
    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    const body = await fs.readFile(file).catch(() => null);
    if (!body) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  } catch (e) {
    console.warn('error:', e.message);
    return send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Wreck the Web → http://localhost:${PORT}`));

// stop cleanly (and never hang) on Ctrl+C / kill
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  setTimeout(() => process.exit(0), 2000).unref();
  server.close(); closeBrowser().finally(() => process.exit(0));
});
