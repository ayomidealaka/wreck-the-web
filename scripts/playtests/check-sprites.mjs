// Letters in the air and a falling element, zoomed: are the cut-outs and slab sprites right? usage: node scripts/playtests/check-sprites.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(500);
// pop a row of letters straight up with no gravity for a moment, then shoot an element until it falls
const box = await p.evaluate(() => {
  const g = window.__game(), L = g.level, a = g.arsenal, pl = g.player;
  const rows = {}; for (const l of L.letters) if (l.alive && l.w > 3 && Math.abs(l.y - pl.y) < 300 && l.x > 100) (rows[l.y] ||= []).push(l);
  const row = Object.values(rows).filter(r => r.length > 20).sort((p, q) => Math.abs(p[0].y - pl.y) - Math.abs(q[0].y - pl.y))[0];
  row.sort((p, q) => p.x - q.x);
  const ids = row.slice(0, 18).map(l => L.letters.indexOf(l));
  ids.forEach((id, i) => a.popLetter(id, 0, -60 - (i % 3) * 20));
  const e = L.elements.map((e, i) => ({ ...e, i })).filter(e => e.alive && e.w > 60 && e.h > 60)[0];
  for (let k = 0; k < 12 && L.elements[e.i].alive; k++) a.hurtElement(e.i, 1, e.x + e.w / 2, e.y + e.h / 2, 0, -1);
  return { x0: row[0].x, y: row[0].y, x1: row[17].x + row[17].w, cam: [g.cam.x, g.cam.y, g.cam.zoom], el: [e.x, e.y, e.w, e.h] };
});
await wait(120);
const sc = (x, y) => [(x - box.cam[0]) * box.cam[2], (y - box.cam[1]) * box.cam[2]];
const [lx, ly] = sc(box.x0, box.y);
await p.screenshot({ path: `${OUT}/letters.png`, clip: { x: Math.max(0, lx - 20), y: Math.max(0, ly - 90), width: Math.min(420, 1280 - lx + 20), height: 150 } });
const [ex, ey] = sc(box.el[0], box.el[1]);
await p.screenshot({ path: `${OUT}/slab.png`, clip: { x: Math.max(0, ex - 40), y: Math.max(0, ey - 40), width: Math.min(box.el[2] + 120, 1280), height: Math.min(box.el[3] + 160, 800) } });
console.log('errors:', errs.join(' | ') || 'none'); process.exit(0);
