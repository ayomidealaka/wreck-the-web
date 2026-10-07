// Rockets go off at the cursor over bare page; the .50 cuts a trench; explosions leave a soft scorch; the
// jetpack never runs dry. usage: node scripts/playtests/check-blast.mjs <out>
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
// 1. a bare patch of page (a 50px disk with nothing in it) and the player put 300px left of it with a clear line
const paper = await p.evaluate(() => {
  const g = window.__game(), L = g.level, pl = g.player;
  const clearDisk = (x, y, r) => { for (let dy = -r; dy <= r; dy += 4) for (let dx = -r; dx <= r; dx += 4) if (dx * dx + dy * dy <= r * r && L.solidAt(x + dx, y + dy)) return false; return true; };
  const clearLine = (x0, y0, x1, y1) => { for (let u = 0; u <= 1; u += 0.005) if (L.hitAt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) return false; return true; };
  let best = null;
  for (let y = 240; y < L.H - 240; y += 12) for (let x = 400; x < L.W - 80; x += 12) {
    if (!clearDisk(x, y, 50) || !clearLine(x - 300, y + 10, x, y)) continue;
    const d = Math.abs(y - pl.y); if (!best || d < best.d) best = { x, y, d };
  }
  if (!best) return null;
  pl.x = best.x - 300; pl.y = best.y + 40; pl.vx = 0; pl.vy = 0;
  return { x: best.x, y: best.y };
});
await wait(250);
console.log('bare target', paper && { x: Math.round(paper.x), y: Math.round(paper.y) });
// the rocket itself, launched straight at the bare point from 300px left (the mouse path is covered by the bullet tests)
const rk = await p.evaluate(async q => {
  const g = window.__game(), L = g.level, a = g.arsenal, x0 = q.x - 300, y0 = q.y + 10, an = Math.atan2(q.y - y0, q.x - x0), before = a.stats.booms;
  a.shots.push({ kind: 'rocket', x: x0, y: y0, vx: Math.cos(an) * 480, vy: Math.sin(an) * 480, a: an, life: 4, t: 0, range: Math.hypot(q.x - x0, q.y - y0) });
  await new Promise(r => setTimeout(r, 1200));
  const t = L.tiles.find(t => q.y >= t.y && q.y < t.y + t.h), sc = L.scale, al = t.g.getImageData(Math.round(q.x * sc), Math.round((q.y - t.y) * sc), 1, 1).data[3];
  return { booms: a.stats.booms - before, alphaAtTarget: al, rockets: a.shots.filter(s => s.kind === 'rocket').length };
}, paper);
console.log('rocket at bare page: booms +' + rk.booms, 'alpha at target', rk.alphaAtTarget, '(0 = hole) rockets still flying', rk.rockets);
await wait(300); let s = await toScreen(paper);
await p.screenshot({ path: `${OUT}/rocket_hole.png`, clip: { x: Math.max(0, s.x - 200), y: Math.max(0, s.y - 160), width: 400, height: 320 } });
// 2. the .50 straight right across the page
await p.keyboard.press('Digit5'); await wait(200);
const pl = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x, y: pl.y - 40 }; });
s = await toScreen({ x: pl.x + 400, y: pl.y }); await p.mouse.move(s.x, s.y); await wait(400); s = await toScreen({ x: pl.x + 400, y: pl.y }); await p.mouse.move(s.x, s.y); await wait(150);
await p.mouse.down(); await wait(40); await p.mouse.up(); await wait(500);
s = await toScreen({ x: pl.x + 250, y: pl.y });
await p.screenshot({ path: `${OUT}/trench.png`, clip: { x: Math.max(0, s.x - 300), y: Math.max(0, s.y - 120), width: 600, height: 240 } });
// 3. the warhead launched straight at the bare point from 300px left, then its scorch
await p.evaluate(async q => {
  const g = window.__game(), a = g.arsenal, x0 = q.x - 300, y0 = q.y + 10, an = Math.atan2(q.y - y0, q.x - x0);
  a.shots.push({ kind: 'warhead', x: x0, y: y0, vx: Math.cos(an) * 720, vy: Math.sin(an) * 720 - 60, a: an, life: 5, t: 0, range: Math.hypot(q.x - x0, q.y - y0) });
  await new Promise(r => setTimeout(r, 1800));
}, paper);
const nk = await p.evaluate(() => { const m = window.__game().arsenal.mushrooms.at(-1); return m ? { x: m.x, y: m.y } : null; });
console.log('nuke went off at', nk && { x: Math.round(nk.x), y: Math.round(nk.y) }, 'aimed at', { x: Math.round(paper.x), y: Math.round(paper.y) });
s = await toScreen(nk || paper);
await p.screenshot({ path: `${OUT}/nuke_hole.png`, clip: { x: Math.max(0, s.x - 420), y: Math.max(0, s.y - 330), width: 840, height: 660 } });
// 3b. the laser held on a bare point burns a hole there
const lz = await p.evaluate(q => {
  const g = window.__game(), a = g.arsenal, L = g.level, h = { x: q.x - 200, y: q.y + 30 }, an = Math.atan2(q.y - h.y, q.x - h.x);
  a.aimPt = { x: q.x, y: q.y }; a.beamTick = 0;
  for (let i = 0; i < 12; i++) { a.beamTick = 0; a.laser(1 / 60, h, an); }
  const t = L.tiles.find(t => q.y >= t.y && q.y < t.y + t.h), sc = L.scale;
  return { alphaAtAim: t.g.getImageData(Math.round(q.x * sc), Math.round((q.y - t.y) * sc), 1, 1).data[3], segEnd: a.beam && a.beam.segs.at(-1) && [Math.round(a.beam.segs.at(-1).x1), Math.round(a.beam.segs.at(-1).y1)] };
}, { x: paper.x + 90, y: paper.y - 10 });
console.log('laser on bare page: alpha at aim', lz.alphaAtAim, '(0 = burnt through), beam ends at', lz.segEnd, 'aim', [Math.round(paper.x + 90), Math.round(paper.y - 10)]);
// 4. jetpack: hold jump for 3s
const f0 = await p.evaluate(() => window.__game().player.fuelRatio);
await p.keyboard.down('KeyW'); await wait(3000);
const jet = await p.evaluate(() => { const pl = window.__game().player; return { fuel: +pl.fuelRatio.toFixed(2), jetting: pl.jetting, y: Math.round(pl.y) }; });
await p.keyboard.up('KeyW');
console.log('jetpack after 3s held: fuel', f0.toFixed(2), '->', jet.fuel, 'jetting', jet.jetting);
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
