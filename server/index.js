import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { snapshot, closeBrowser, fail } from './snapshot.js';

const PORT = Number(process.env.PORT) || 4600;
// this machine only, unless told otherwise (HOST=0.0.0.0 in the container): the server fetches any URL it's given,
// so on a laptop it shouldn't be reachable from the rest of the Wi-Fi
const HOST = process.env.HOST || '127.0.0.1';
// how many reverse proxies in front of us append to X-Forwarded-For (1 behind ingress-nginx); 0 = use the socket address
const TRUST_PROXY = Number(process.env.TRUST_PROXY) || 0;
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 12;   // fresh renders per client per minute
const CACHE_BYTES = (Number(process.env.CACHE_MB) || 512) * 1e6;    // level images kept in memory, in total
// Optional analytics: with both set, the menu page gets a <script> tag for a tracker like Umami's. The script URL
// must be https and the site id a UUID, so the tag can be written without escaping. Unset = no analytics at all.
// async: the game's own script never waits on the analytics host. exclude-search: the tracker's automatic page views
// never carry the ?url= query, so the websites players type stay out of analytics (events send a hostname only).
const ANALYTICS = (() => {
  const script = process.env.ANALYTICS_SCRIPT || '', site = process.env.ANALYTICS_SITE || '';
  if (!script && !site) return null;
  if (!/^https:\/\/[\w.-]+(:\d+)?\/[\w./-]*$/.test(script) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(site)) {
    console.warn('analytics: ANALYTICS_SCRIPT must be an https URL and ANALYTICS_SITE a UUID; ignoring both'); return null;
  }
  return Buffer.from(`<script async src="${script}" data-website-id="${site}" data-exclude-search="true" data-exclude-hash="true"></script>\n</head>`);
})();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// level cache: same url + mode within 15 min reuses the render. Oldest go first past 40 levels or CACHE_MB of images.
const levels = new Map(); // id -> { meta, image, t }
const byKey = new Map();  // url|mode -> id
const TTL = 15 * 60 * 1000;
let cacheBytes = 0;
function remember(key, data) {
  const id = crypto.randomBytes(8).toString('hex');
  const { image, ...meta } = data;
  levels.set(id, { meta: { ...meta, id }, image: Buffer.from(image), t: Date.now() });
  cacheBytes += image.length;
  byKey.set(key, id);
  for (const [k, v] of levels) {
    if (Date.now() - v.t > TTL || levels.size > 40 || cacheBytes > CACHE_BYTES) { levels.delete(k); cacheBytes -= v.image.length; }
  }
  for (const [k, v] of byKey) if (!levels.has(v)) byKey.delete(k);
  return id;
}

// who's asking: the socket address, or the address the trusted proxy saw (the entry it appended to X-Forwarded-For).
// IPv6 clients are grouped by their /64, since one connection usually owns a whole /64 and could rotate through it.
function clientKey(req) {
  let ip = req.socket.remoteAddress || '';
  if (TRUST_PROXY) {
    const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (chain.length >= TRUST_PROXY) ip = chain[chain.length - TRUST_PROXY];
  }
  ip = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::'), a = head ? head.split(':') : [], b = tail ? tail.split(':') : [];
  return [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b].slice(0, 4).join(':') + '::/64';
}

// per-client rate limit for fresh renders (cached ones are free); clients with no recent renders are forgotten
const hits = new Map();
function limited(key) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(key, list);
  return list.length > RATE_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > 60000) hits.delete(k);
}, 60000).unref();

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
    if (u.pathname === '/play/level') {
      const q = u.searchParams, target = q.get('url');
      const opts = { mobile: q.get('mode') === 'mobile', width: +q.get('w'), height: +q.get('h'), dpr: +q.get('dpr') };
      const key = `${target}|${opts.mobile}|${opts.width}|${opts.height}|${opts.dpr}`;
      const cached = byKey.get(key);
      if (cached && levels.has(cached)) return send(res, 200, levels.get(cached).meta);
      if (limited(clientKey(req))) return send(res, 429, { error: 'Too many websites at once. Wait a minute and try again.' });
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
    let rel;
    try { rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname); } catch { throw fail('Bad path.'); }
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    let body = await fs.readFile(file).catch(() => null);
    if (!body) return send(res, 404, 'Not found', 'text/plain');
    if (ANALYTICS && file === path.join(ROOT, 'index.html')) { const i = body.indexOf('</head>'); if (i >= 0) body = Buffer.concat([body.subarray(0, i), ANALYTICS, body.subarray(i + 7)]); }
    return send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  } catch (e) {
    // our own messages go to the player as they are; anything else (Chrome, Puppeteer, bugs) is logged, not echoed
    console.warn('error:', e.expose ? e.message : e.stack || e.message);
    if (res.headersSent) return res.destroy();
    return send(res, e.status || 500, { error: e.expose ? e.message : 'Something went wrong on our side. Try another website.' });
  }
});

server.listen(PORT, HOST, () => console.log(`Wreck the Web → http://${['0.0.0.0', '127.0.0.1', '::'].includes(HOST) ? 'localhost' : HOST}:${PORT}`));

// stop cleanly (and never hang) on Ctrl+C / kill
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  setTimeout(() => process.exit(0), 2000).unref();
  server.close(); closeBrowser().finally(() => process.exit(0));
});
