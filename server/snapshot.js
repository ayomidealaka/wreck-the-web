// Renders a website in headless Chrome and turns it into level data:
// a full-page WebP plus the boxes of every word, image and styled block on the page.
import puppeteer from 'puppeteer-core';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export const MAX_HEIGHT = 8000;
const PIXEL_BUDGET = 48e6;   // device pixels per level image (memory on the client)
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const clamp = (v, lo, hi, d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
const NAV_TIMEOUT = 20000;
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS) || 45000;   // a whole render, start to finish: a page that hangs Chrome gives its slot back after this
const MAX_QUEUE = Number(process.env.MAX_QUEUE) || 8;   // renders allowed to wait for a slot; past this the server says it's busy
const PORTS = new Set(['', '80', '443']);                // the page and everything it loads stay on the web's standard ports
const dbg = (...a) => process.env.DEBUG_SNAPSHOT && console.log('[snapshot]', ...a);

// errors the player should see as they are (everything else is logged and answered with a generic message)
export const fail = (message, status = 400) => Object.assign(new Error(message), { expose: true, status });

// ------------------------------------------------------------------ SSRF guard
// Only public addresses. IPv4: everything private, shared, loopback, link-local, multicast and reserved is out.
// IPv6: only global unicast (2000::/3), minus the ranges in it that embed or route to IPv4 (6to4, Teredo) and the
// documentation range. BlockList also matches IPv4-mapped IPv6 (::ffff:7f00:1 is 127.0.0.1) against the IPv4 rules.
// This is one layer: in production a network policy blocks the same ranges for the Chrome pod (deploy/), which also
// covers what an address check can't, like DNS rebinding.
const DENY = new net.BlockList(), GLOBAL6 = new net.BlockList();
for (const [a, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 16], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3]]) DENY.addSubnet(a, n, 'ipv4');
for (const [a, n] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]]) DENY.addSubnet(a, n, 'ipv6');
GLOBAL6.addSubnet('2000::', 3, 'ipv6');
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return DENY.check(ip, 'ipv4');
  if (!net.isIPv6(ip)) return true;
  if (DENY.check(ip, 'ipv6')) return true;
  let canon;
  try { canon = new URL(`http://[${ip}]/`).hostname.slice(1, -1); } catch { return true; }   // zone ids and the like
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(canon)) return false;   // IPv4-mapped and not denied above: a public IPv4
  return !GLOBAL6.check(canon, 'ipv6');
}

const hostCache = new Map(); // hostname -> Promise<boolean allowed>
export function isHostAllowed(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return Promise.resolve(false);
  if (net.isIP(h)) return Promise.resolve(!isPrivateIp(h));
  if (!hostCache.has(h)) {
    hostCache.set(h, dns.lookup(h, { all: true })
      .then(addrs => addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address)))
      .catch(() => false));
    setTimeout(() => hostCache.delete(h), 5 * 60 * 1000).unref();
  }
  return hostCache.get(h);
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw fail('Enter a website address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw fail('That does not look like a website address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw fail('Only http and https websites can be loaded.');
  if (u.username || u.password) throw fail('Addresses with credentials are not allowed.');
  if (!PORTS.has(u.port)) throw fail('Only websites on the standard ports (80 and 443) can be loaded.');
  u.hash = '';
  return u;
}

// ------------------------------------------------------------------ browser
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    const executablePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.');
    browserPromise = puppeteer.launch({
      executablePath, headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
      protocolTimeout: 30000,   // a page that hangs Chrome can't hold a call open for Puppeteer's default 3 minutes
      // Puppeteer turns Chrome's popup blocker off by default. Keep it on: a popup is a page of its own, outside the
      // request filter below, and with no user gestures in a render it blocks every window.open and target=_blank.
      ignoreDefaultArgs: ['--disable-popup-blocking'],
      args: ['--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-dev-shm-usage',
             '--disable-features=Translate,MediaRouter', '--hide-scrollbars',
             // containers whose seccomp profile has no user namespaces can't run Chrome's sandbox (see deploy/README.md)
             ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
    });
    browserPromise.then(b => b.on('disconnected', () => { browserPromise = null; }), () => { browserPromise = null; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  await b?.close().catch(() => {});
}

// tiny concurrency gate so a burst of requests can't spawn dozens of tabs; a full queue turns new renders away
let active = 0; const waiting = [];
async function gate(fn) {
  if (active >= 2 && waiting.length >= MAX_QUEUE) throw fail('Lots of websites are being wrecked right now. Try again in a minute.', 503);
  if (active >= 2) await new Promise((resolve, reject) => {   // a minute at most in the queue, then it gives up
    const turn = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { waiting.splice(waiting.indexOf(turn), 1); reject(fail('Lots of websites are being wrecked right now. Try again in a minute.', 503)); }, 60000);
    waiting.push(turn);
  });
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

// Runs inside the page: collects level geometry in document coordinates.
function extractLevel(maxH) {
  const sx = window.scrollX, sy = window.scrollY;
  const docW = document.documentElement.clientWidth;
  const out = [];
  const push = (r, type) => {
    const x = r.left + sx, y = r.top + sy;
    if (r.width < 2 || r.height < 2 || y > maxH || x > docW || x + r.width < 0) return;
    out.push(Math.round(x), Math.round(y), Math.round(r.width), Math.round(r.height), type);
  };
  const visible = el => !el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

  // letters: one box per visible character (grapheme), so hits knock out single letters
  const letters = [];
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest('script,style,noscript,template,svg,textarea,select')) return NodeFilter.FILTER_REJECT;
      return /\S/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const range = document.createRange(); const seen = new Map(); let count = 0, node;
  const MAX_LETTERS = 60000;
  while ((node = walker.nextNode()) && count < MAX_LETTERS) {
    const p = node.parentElement;
    if (!seen.has(p)) seen.set(p, visible(p));
    if (!seen.get(p)) continue;
    const parts = seg ? seg.segment(node.data) : Array.from(node.data, (c, i) => ({ segment: c, index: i }));
    let idx = 0;
    for (const part of parts) {
      const start = seg ? part.index : idx; idx += part.segment.length;
      if (!/\S/.test(part.segment)) continue;
      range.setStart(node, start); range.setEnd(node, start + part.segment.length);
      const r = range.getBoundingClientRect();
      const x = r.left + sx, y = r.top + sy;
      if (r.width < 1 || r.height < 2 || y > maxH || x > docW || x + r.width < 0) continue;
      letters.push(Math.round(x * 2) / 2, Math.round(y), Math.max(1, Math.round(r.width * 2) / 2), Math.round(r.height));
      if (++count >= MAX_LETTERS) break;
    }
  }
  // 1: media and controls
  for (const el of document.querySelectorAll('img,svg,video,canvas,iframe,input,textarea,select,button,hr,[role="img"]')) {
    if (el.tagName.toLowerCase() !== 'svg' && el.closest('svg')) continue;
    if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) continue;
    if (!visible(el)) continue;
    push(el.getBoundingClientRect(), 1);
  }
  // 2: styled blocks (background / border). 3: huge blocks only get a solid top edge.
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const transparent = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  const all = document.body.getElementsByTagName('*');
  for (let i = 0; i < all.length && i < 20000; i++) {
    const el = all[i];
    if (/^(SCRIPT|STYLE|NOSCRIPT|BR|IMG|SVG|PATH|VIDEO|CANVAS|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON|HR)$/i.test(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') continue;
    const hasBg = !transparent(cs.backgroundColor) && cs.backgroundColor !== bodyBg;
    const hasImg = cs.backgroundImage !== 'none';
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && !transparent(cs.borderTopColor);
    if (!hasBg && !hasImg && !hasBorder) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const huge = r.width * r.height > docW * 420 || (r.width > docW * 0.85 && r.height > 260);
    if (hasImg && !huge) push(r, 1);        // small background images are pictures/icons: real content
    else push(r, huge ? 3 : 2);              // styled boxes: only their top edge is a ledge
  }
  const bg = transparent(bodyBg) ? getComputedStyle(document.documentElement).backgroundColor : bodyBg;
  return {
    boxes: out, letters, title: document.title || location.hostname,
    height: Math.min(maxH, Math.ceil(document.documentElement.scrollHeight)),
    width: docW, bg: transparent(bg) ? 'rgb(255, 255, 255)' : bg,
  };
}

export async function snapshot(input, opts = {}) {
  const url = normalizeUrl(input);
  if (!(await isHostAllowed(url.hostname))) throw fail('That address points to a private or unknown host.');
  // render at the player's real window size and pixel density, so the level is the page as they'd see it
  const mobile = !!opts.mobile;
  const width = Math.round(clamp(opts.width, 320, 2560, mobile ? 390 : 1280));
  const vh = Math.round(clamp(opts.height, 480, 1600, 900));
  let scale = clamp(opts.dpr, 1, 2, 1);
  const mode = { width, height: vh, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale };

  return gate(async () => {
    const t0 = Date.now(); const step = s => dbg(s, Date.now() - t0 + 'ms');
    const browser = await getBrowser(); step('browser');
    const ctx = await browser.createBrowserContext({ downloadBehavior: { policy: 'deny' } });
    // and if a popup gets through anyway (a page with an opener: ours has none), it's closed as soon as it appears
    ctx.on('targetcreated', t => { if (t.type() === 'page' && t.opener()) t.page().then(p => p?.close()).catch(() => {}); });
    // the whole render races a deadline; on timeout the context is closed, which ends whatever was still running in it
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(fail('That website took too long to render.', 504)), RENDER_TIMEOUT); });
    const job = (async () => {
      const page = await ctx.newPage(); step('page');
      const ver = (await browser.version()).replace('HeadlessChrome', 'Chrome').split('/')[1] || '140.0.0.0';
      await page.setUserAgent(mobile ? MOBILE_UA
        : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`);
      await page.setViewport(mode);
      await page.setRequestInterception(true);
      page.on('request', async req => {
        try {
          const u = new URL(req.url());
          if (u.protocol === 'data:' || u.protocol === 'blob:') return req.continue();
          if (u.protocol !== 'http:' && u.protocol !== 'https:') return req.abort('blockedbyclient');
          if (!PORTS.has(u.port)) return req.abort('blockedbyclient');
          if (!(await isHostAllowed(u.hostname))) return req.abort('blockedbyclient');
          if (['media', 'websocket', 'eventsource'].includes(req.resourceType())) return req.abort('blockedbyclient');
          return req.continue();
        } catch { try { await req.abort('blockedbyclient'); } catch {} }
      });
      page.on('dialog', d => d.dismiss().catch(() => {}));

      let response = null;
      try {
        response = await page.goto(url.href, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      } catch (e) {
        if (!/timeout/i.test(e.message)) throw fail(`Could not load that site (${e.message.split('\n')[0]}).`, 502);
      }
      step('goto');
      if (response && response.status() >= 400) throw fail(`The site answered with HTTP ${response.status()}.`, 502);

      // wake lazy images, then let the page settle
      await page.evaluate(async maxH => {
        document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
        const step = innerHeight * 0.8;
        for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += step) {
          scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
        }
        scrollTo(0, 0);
      }, MAX_HEIGHT);
      step('scrolled');
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => {}); step('idle');
      // overlays (cookie walls, sticky headers) would float over the level; flatten them
      await page.evaluate(() => {
        for (const el of document.body.querySelectorAll('*')) {
          const p = getComputedStyle(el).position;
          if (p === 'fixed') el.style.setProperty('display', 'none', 'important');
          else if (p === 'sticky') el.style.setProperty('position', 'relative', 'important');
        }
        document.documentElement.style.setProperty('overflow', 'visible', 'important');
        document.body.style.setProperty('overflow', 'visible', 'important');
        scrollTo(0, 0);
      });
      await new Promise(r => setTimeout(r, 250));

      step('flattened');
      // keep the image inside the client's memory budget. Prefer the screen's exact density (crisp 1:1 pixels)
      // and trim very long pages; only step down to 1.5x / 1x when the page would get too short.
      const docH = Math.min(MAX_HEIGHT, await page.evaluate(() => document.documentElement.scrollHeight));
      let maxH = MAX_HEIGHT;
      const fits = sc => Math.min(MAX_HEIGHT, Math.floor(PIXEL_BUDGET / (width * sc * sc)), Math.floor(16000 / sc));
      for (const sc of [scale, 1.5, 1].filter(v => v <= scale)) {
        scale = sc; maxH = fits(sc);
        if (maxH >= Math.min(docH, 3500)) break;
      }
      if (scale !== mode.deviceScaleFactor) await page.setViewport({ ...mode, deviceScaleFactor: scale });
      const level = await page.evaluate(extractLevel, maxH); step('extracted');
      const height = Math.max(level.height, mode.height);
      const image = await page.screenshot({
        type: 'webp', quality: 92, captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: level.width, height },
      });
      step('screenshot');
      return { url: page.url(), title: level.title, width: level.width, height, scale, bg: level.bg, boxes: level.boxes, letters: level.letters, image, mode: mobile ? 'mobile' : 'desktop' };
    })();
    job.catch(() => {});   // after a timeout it still rejects (its context is gone); that's expected, not unhandled
    try {
      return await Promise.race([job, deadline]);
    } finally {
      clearTimeout(timer);
      await ctx.close().catch(() => {});
    }
  });
}
