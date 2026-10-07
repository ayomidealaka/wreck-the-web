// Element hit points: lists the page's elements by HP band, then shoots one picture with the pistol shot by shot,
// screenshotting it as it cracks and shatters. usage: node scripts/playtests/playtest-elements.mjs <out-dir> [site]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT, site = 'en.wikipedia.org/wiki/Stick_figure'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1200);
const info = await p.evaluate(() => {
  const E = window.__game().level.elements, bands = {};

  // a mid-size picture (3-5 hp) on screen-ish
  const t = E.map((e, id) => ({ ...e, id })).filter(e => e.w > 60 && e.h > 60).sort((a, b) => a.y - b.y)[Number(new URLSearchParams(location.search).get('pick') || 0)] || E.map((e, id) => ({ ...e, id }))[0];
  return { count: E.length, bands, target: t && { id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, hp: t.maxHp } };
});
console.log('elements:', info.count, 'target:', JSON.stringify(info.target));
const T = info.target;
// stand the player to the left of it, level with its middle, pistol out
await p.evaluate(T => { const g = window.__game(), pl = g.player; pl.x = Math.max(30, T.x - 120); pl.y = T.y + T.h / 2 + 30; pl.vx = pl.vy = 0; g.arsenal.select(0); g.player.update = (() => { const u = g.player.update.bind(g.player); return (dt, inp, fx, audio) => { const r = u(dt, inp, fx, audio); g.player.y = T.y + T.h / 2 + 30; g.player.vy = 0; g.player.onGround = true; return r; }; })(); }, T);
await wait(500);
const scr = async n => { const c = await p.evaluate(T => { const g = window.__game(); return { x: Math.max(0, (T.x - 40) * g.cam.zoom), y: Math.max(0, (T.y - 40 - g.cam.y) * g.cam.zoom), width: (T.w + 80) * g.cam.zoom, height: (T.h + 80) * g.cam.zoom }; }, T); await p.screenshot({ path: `${OUT}/el_${n}.png`, clip: c }); };
await scr(0);
for (let shot = 1; shot <= 14; shot++) {
  // a real pistol round, fired from just beside it at a solid part of it (so no text is in the way)
  await p.evaluate(T => {
    const g = window.__game(), L = g.level, a = g.arsenal; let best = null;
    for (let x = T.x; x < T.x + T.w && !best; x += 2) for (let y = T.y + T.h * 0.3; y < T.y + T.h * 0.7; y += 2) if (L.elementAt(x, y) === T.id) { best = { x, y }; break; }
    best ||= { x: T.x + 2, y: T.y + T.h / 2 };
    a.bullet({ x: best.x - 8, y: best.y + 1 }, 0, 1500, 'smg', { r: 4, pen: 0, splash: 0 });   // one full-strength round (the Uzi's are half)
  }, T);
  await wait(260);
  const st = await p.evaluate(id => { const g = window.__game(), e = g.level.elements[id]; return { hp: +e.hp.toFixed(2), alive: e.alive, carved: +(e.lost / e.cells).toFixed(2), falling: g.fx.chunks.filter(c => c.slab).length }; }, T.id);
  console.log(`shot ${shot}:`, JSON.stringify(st));
  await scr(shot);
  if (!st.alive) break;
}
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
