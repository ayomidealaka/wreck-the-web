// The feel pass on a real site: load it, drop onto the text, then the same short routine everywhere (pistol at bare
// page, AK through a text line, a rocket at the nearest element, a grenade), with zoomed screenshots of each and the
// frame times. usage: node scripts/playtests/playtest-sites.mjs <out-dir> <site> [pack] [character]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 280000);
const [OUT, site, pack = 'test', ch = 'r1'] = process.argv.slice(2);
const tag = site.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(c => localStorage.setItem('wtw-character', c), ch);
const t0 = Date.now();
await p.goto(`http://localhost:4600/?debug&pack=${pack}&url=` + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 150000 });
console.log(`${site}: loaded in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1200);
await p.evaluate(() => { window.__ft = []; let last = performance.now(); const tick = t => { window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
// stand above the first dense text block: the row with most letters in the top 1800px
const info = await p.evaluate(() => {
  const g = window.__game(), L = g.level, pl = g.player;
  const rows = {}; for (const l of L.letters) if (l.alive && l.y > 300 && l.y < 1500 && l.w > 3) (rows[Math.round(l.y / 4) * 4] ||= []).push(l);
  const row = Object.values(rows).sort((a, b2) => b2.length - a.length)[0];
  if (row) { row.sort((a, b2) => a.x - b2.x); pl.x = Math.max(60, row[0].x - 40); pl.y = row[0].y - 30; pl.vx = pl.vy = 0; }
  return { W: L.W, H: L.H, letters: L.letters.length, elements: L.elements.length, boxes: L.boxes.length, row: row && { x: row[0].x, y: row[0].y, n: row.length } };
});
console.log('  page', info.W + 'x' + info.H, info.letters, 'letters,', info.elements, 'elements,', info.boxes, 'boxes; text row', JSON.stringify(info.row));
await wait(900);
const scr = async (name, clip) => p.screenshot({ path: `${OUT}/${tag}_${name}.png`, clip });
const toScreen = q => p.evaluate(q => { const g = window.__game(); return { x: (q.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y - g.cam.y + g.cam.sy) * g.cam.zoom }; }, q);
const clipAround = (s, w = 360, h = 240) => ({ x: Math.max(0, Math.min(1440 - w, s.x - w / 2)), y: Math.max(0, Math.min(860 - h, s.y - h / 2)), width: w, height: h });
await scr('1_scene');
// pistol at bare page near the player (a point with no content on the way)
const paper = await p.evaluate(() => {
  const g = window.__game(), L = g.level, h = g.player.hand();
  for (let r = 140; r < 420; r += 12) for (let a = -1.1; a < 1.1; a += 0.12) {
    const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r;
    if (x < 20 || x > L.W - 20 || y < 10 || y > L.H - 10) continue;
    let clear = true; for (let dy = -6; dy <= 6 && clear; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (L.solidAt(x + dx, y + dy)) clear = false;
    for (let u = 0; u <= 1 && clear; u += 0.01) if (L.hitAt(h.x + (x - h.x) * u, h.y + (y - h.y) * u)) clear = false;
    if (clear) return { x, y };
  }
  return null;
});
await p.keyboard.press('Digit1'); await wait(200);
if (paper) {
  // aim, let the camera settle on the aim, then re-aim at the same world point before firing
  let s = await toScreen(paper); await p.mouse.move(s.x, s.y); await wait(400); s = await toScreen(paper); await p.mouse.move(s.x, s.y); await wait(150);
  for (let i = 0; i < 5; i++) { await p.mouse.down(); await wait(40); await p.mouse.up(); await wait(140); } await wait(120);
  const chk = await p.evaluate(q => { const g = window.__game(), L = g.level, t = L.tiles.find(t => q.y >= t.y && q.y < t.y + t.h), sc = L.scale, d = t.g.getImageData(Math.round(q.x * sc), Math.round((q.y - t.y) * sc), 1, 1).data; let holes = 0; for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) if (!t.g.getImageData(Math.round((q.x + dx) * sc), Math.round((q.y + dy - t.y) * sc), 1, 1).data[3]) holes++; return { alphaAtCursor: d[3], holePixelsNear: holes, heats: g.fx.heats.length, shots: g.arsenal.stats.shots }; }, paper);
  console.log('  paper holes at the cursor:', JSON.stringify(chk));
  s = await toScreen(paper); await scr('2_paper', clipAround(s));
}
// AK through the text row to the right
const text = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x + 320, y: pl.y - 8 }; });
await p.keyboard.press('Digit2'); await wait(150);
{ let s = await toScreen(text); await p.mouse.move(s.x, s.y); await wait(400); s = await toScreen(text); await p.mouse.move(s.x, s.y); await wait(150); await p.mouse.down(); await wait(650); await p.mouse.up(); await wait(150); s = await toScreen(text); await scr('3_text', clipAround(s, 480, 260)); }
// a rocket at the nearest element (or the text further on)
const target = await p.evaluate(() => {
  const g = window.__game(), L = g.level, pl = g.player;
  const els = L.elements.filter(e => e.alive && e.w > 40 && e.h > 40).map(e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2, d: Math.hypot(e.x + e.w / 2 - pl.x, e.y + e.h / 2 - pl.y) })).filter(e => e.d < 700).sort((a, b2) => a.d - b2.d);
  return els[0] || { x: pl.x + 420, y: pl.y + 60 };
});
await p.keyboard.press('Digit7'); await wait(150);
{ let s = await toScreen(target); await p.mouse.move(s.x, s.y); await wait(400); s = await toScreen(target); await p.mouse.move(s.x, s.y); await wait(150); await p.mouse.down(); await wait(40); await p.mouse.up(); await wait(900);
  const booms = await p.evaluate(() => window.__game().arsenal.stats.booms); console.log('  rocket: explosions so far', booms, 'target', JSON.stringify(target));
  s = await toScreen(target); await scr('4_blast', clipAround(s, 520, 340)); }
// a grenade
await p.keyboard.down('KeyG'); await wait(30); await p.keyboard.up('KeyG'); await wait(2200);
await scr('5_after');
const ft = await p.evaluate(() => window.__ft);
const sorted = ft.slice().sort((a, b2) => a - b2), avg = ft.reduce((a, b2) => a + b2, 0) / ft.length;
console.log(`  frames: avg ${avg.toFixed(1)}ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(0)}ms, worst ${sorted.at(-1).toFixed(0)}ms over ${ft.length} frames`);
console.log('  errors:', errs.length ? errs.join(' | ') : 'none');
await b.close(); process.exit(0);
