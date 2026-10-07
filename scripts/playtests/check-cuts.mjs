// The laser cuts straight through to its target; the .50 ricochets off elements; a blast leaves ragged edges where it
// tore a piece out. usage: node scripts/playtests/check-cuts.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 200000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(600);
const toScreen = q => p.evaluate(q => { const g = window.__game(); return { x: (q.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y - g.cam.y + g.cam.sy) * g.cam.zoom }; }, q);
// 1. laser: a beam run straight through a dense text row for half a second
const lz = await p.evaluate(async () => {
  const g = window.__game(), L = g.level, a = g.arsenal;
  const rows = {}; for (const l of L.letters) if (l.alive && l.w > 3) (rows[l.y] ||= []).push(l);
  const row = Object.values(rows).filter(r => r.length > 30).sort((p, q) => q.length - p.length)[0]; row.sort((p, q) => p.x - q.x);
  const y = row[0].y + row[0].h * 0.6, x0 = row[0].x - 30, x1 = row[Math.min(row.length - 1, 40)].x, before = a.stats.letters;
  a.aimPt = { x: x1, y }; const h = { x: x0, y };
  for (let i = 0; i < 25; i++) { a.beamTick = 0; a.laser(1 / 50, h, 0); }
  return { popped: a.stats.letters - before, segs: a.beam.segs.length, end: [Math.round(a.beam.segs[0].x1), Math.round(a.beam.segs[0].y1)], aim: [Math.round(x1), Math.round(y)] };
});
console.log('laser half a second along a text row: letters popped', lz.popped, '; one straight segment:', lz.segs === 1, '; ends at the aim:', JSON.stringify(lz.end), JSON.stringify(lz.aim));
// 2. the .50 into an element at a slant: does it bounce?
const rc = await p.evaluate(async () => {
  const g = window.__game(), L = g.level, a = g.arsenal;
  const e = L.elements.filter(e => e.alive && e.w > 80 && e.h > 80).sort((p, q) => q.w * q.h - p.w * p.h)[0];
  const tx = e.x + e.w * 0.5, ty = e.y + 2, x0 = tx - 260, y0 = ty - 150, an = Math.atan2(ty - y0, tx - x0);   // onto its top edge at ~30 degrees
  a.bullet({ x: x0, y: y0 }, an, 4200, 'slug', { r: 9, pen: 2400, splash: 14 }, { trail: true });
  let bounces = 0, up = null;
  for (let i = 0; i < 15; i++) { await new Promise(r => setTimeout(r, 20)); const s = a.shots.find(s => s.style === 'slug'); if (s && (s.bounces || 0) > bounces) { bounces = s.bounces; up = s.vy < 0; } }
  return { bounces, trails: a.trails.length, headingUp: up, element: [e.w, e.h] };
});
console.log('.50 into an element at a slant: bounces', rc.bounces, 'trail legs', rc.trails, 'now heading up', rc.headingUp);
// 3. a rocket into a mid-size element until it comes out: the hole's edges
const rg = await p.evaluate(async () => {
  const g = window.__game(), L = g.level, a = g.arsenal;
  const e = L.elements.map((e, i) => ({ ...e, i })).filter(e => e.alive && e.w > 100 && e.h > 100 && e.w < 400).sort((p, q) => Math.abs(p.y - g.player.y) - Math.abs(q.y - g.player.y))[0];
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  for (let k = 0; k < 4 && L.elements[e.i].alive; k++) a.explode(cx, cy, 86, 1300);
  await new Promise(r => setTimeout(r, 150));
  // straight edge test: along the element's old left edge, how many 4px blocks just outside it are still intact page
  let intact = 0, n = 0; for (let y = e.y + 8; y < e.y + e.h - 8; y += 4) { n++; const t = L.tiles.find(t => y >= t.y && y < t.y + t.h); if (t.g.getImageData(Math.round((e.x - 3) * L.scale), Math.round((y - t.y) * L.scale), 1, 1).data[3]) intact++; }
  return { alive: L.elements[e.i].alive, x: e.x, y: e.y, w: e.w, h: e.h, leftEdgeIntact: `${intact}/${n}` };
});
console.log('rocket-blasted element: gone', !rg.alive, '; page just outside its old left edge still intact at', rg.leftEdgeIntact, 'sample points (fewer = more ragged)');
await wait(300);
const s = await toScreen({ x: rg.x + rg.w / 2, y: rg.y + rg.h / 2 });
await p.screenshot({ path: `${OUT}/ragged.png`, clip: { x: Math.max(0, s.x - 260), y: Math.max(0, s.y - 220), width: 520, height: 440 } });
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
