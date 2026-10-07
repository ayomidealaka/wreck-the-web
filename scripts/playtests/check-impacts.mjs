// Checks the shooting model: rounds stop at the cursor (paper hole there), pierce letters, element hits tunnel
// and glow; Ash's gun springs (recoil, switch swing) and the grenade throw. usage: node scripts/playtests/check-impacts.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 200000);
const [OUT, site = 'en.wikipedia.org/wiki/Stick_figure', ch = 'r1'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(c => localStorage.setItem('wtw-character', c), ch);
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(600);
const scr = () => p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (pl.y - g.cam.y + g.cam.sy) * g.cam.zoom, z: g.cam.zoom, px: pl.x, py: pl.y }; });
// 1. pistol at a bare-paper point: find one near the player with no content between... just pick empty cell
const toScreen = q => p.evaluate(q => { const g = window.__game(); return { x: (q.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y - g.cam.y + g.cam.sy) * g.cam.zoom }; }, q);
let s = await scr();
// 1. paper holes: rounds fired across bare page near the camera, each stopping at its "cursor" 60px on
const holes = await p.evaluate(() => {
  const g = window.__game(), L = g.level, a = g.arsenal, out = [];
  for (let y = g.cam.y + 200; y < g.cam.y + 600 && out.length < 6; y += 9) for (let x = 200; x < 1000 && out.length < 6; x += 13) {
    let clear = true; for (let u = -66; u <= 8 && clear; u += 2) for (let dy = -4; dy <= 4; dy += 2) if (L.solidAt(x + u, y + dy)) clear = false;
    if (!clear || out.some(q => Math.hypot(q.x - x, q.y - y) < 40)) continue;
    a.bullet({ x: x - 60, y }, 0, 1500, 'bolt', { r: 4, pen: 50, splash: 0 }, { range: 60 }); out.push({ x, y });
  }
  return out;
});
await wait(300);
const al = await p.evaluate(hs => { const L = window.__game().level; return hs.map(q => { const t = L.tiles.find(t => q.y >= t.y && q.y < t.y + t.h), s = L.scale; return t.g.getImageData(Math.round(q.x * s), Math.round((q.y - t.y) * s), 1, 1).data[3]; }); }, holes);
console.log('paper holes at', holes.length, 'cursor points; alpha there now (0 = hole):', al.join(','), ' heats:', await p.evaluate(() => window.__game().fx.heats.length));
const target = holes[0];
let t = await toScreen(target);
await p.screenshot({ path: `${OUT}/paper_hot.png`, clip: { x: Math.max(0, t.x - 160), y: Math.max(0, t.y - 100), width: 320, height: 200 } });
await wait(700);
await p.screenshot({ path: `${OUT}/paper_cool.png`, clip: { x: Math.max(0, t.x - 160), y: Math.max(0, t.y - 100), width: 320, height: 200 } });
// 3. piercing: one pistol round fired along a line of text, cursor far past it: count letters it goes through
const pierce = await p.evaluate(() => {
  const g = window.__game(), L = g.level, a = g.arsenal;
  const rows = {}; for (const l of L.letters) if (l.alive && l.w > 3) (rows[l.y] ||= []).push(l);
  const row = Object.values(rows).filter(r => r.length > 25).sort((p, q) => q.length - p.length)[0]; if (!row) return null;
  row.sort((p, q) => p.x - q.x);
  const y = row[0].y + row[0].h * 0.6, x = row[0].x - 6, before = a.stats.letters;
  a.bullet({ x, y }, 0, 1500, 'bolt', { r: 4, pen: 50, splash: 0 }, { range: 600 });
  return { before, y, x };
});
await wait(600);
if (pierce) console.log('pistol round through a text line: letters popped', await p.evaluate(b => window.__game().arsenal.stats.letters - b, pierce.before));
// 4. springs: AK shot, sample gun state
await p.keyboard.press('Digit2'); await wait(40);
const sw = [];
for (let i = 0; i < 6; i++) { sw.push(await p.evaluate(() => { const G = window.__game().player.gun; return [G.swing.toFixed(2), G.switchT.toFixed(2)].join('/'); })); await wait(40); }
console.log('switch swing/switchT over time', sw.join(' '));
await wait(300);
await p.mouse.down(); await wait(30); await p.mouse.up();
const rk = [];
for (let i = 0; i < 8; i++) { rk.push(await p.evaluate(() => { const G = window.__game().player.gun; return `${G.kick.toFixed(2)},${G.rot.toFixed(2)}`; })); await wait(25); }
console.log('kick,rot over time', rk.join(' '));
// 5. throw
const th = [];
await p.keyboard.down('KeyG'); await wait(30); await p.keyboard.up('KeyG');
for (let i = 0; i < 8; i++) { th.push(await p.evaluate(() => { const g = window.__game(); return `${g.player.gun.throwT.toFixed(2)}:${g.arsenal.shots.filter(s => s.kind === 'grenade').length}`; })); await wait(40); }
console.log('throwT:grenades', th.join(' '));
s = await scr();
await p.keyboard.down('KeyG'); await wait(30); await p.keyboard.up('KeyG'); await wait(120);
await p.screenshot({ path: `${OUT}/throw.png`, clip: { x: Math.max(0, s.x - 120), y: Math.max(0, s.y - 160), width: 240, height: 200 } });
// 6. element tunnels: shoot the first image
const el = await p.evaluate(() => { const L = window.__game().level; const i = L.elements.findIndex(e => e.alive && e.w > 60 && e.h > 60); return i >= 0 ? { i, ...L.elements[i] } : null; });
if (el) {
  await p.evaluate(e => { const g = window.__game(); g.player.x = e.x - 120; g.player.y = e.y + e.h; g.player.vy = 0; }, el); await wait(600);
  await p.keyboard.press('Digit1'); await wait(300);
  t = await toScreen({ x: el.x + el.w / 2, y: el.y + el.h / 2 });
  await p.mouse.move(t.x, t.y); await wait(200);
  for (let k = 0; k < 2; k++) { await p.mouse.down(); await wait(30); await p.mouse.up(); await wait(200); }
  await wait(30);
  await p.screenshot({ path: `${OUT}/element.png`, clip: { x: Math.max(0, t.x - 200), y: Math.max(0, t.y - 120), width: 360, height: 240 } });
  console.log('element after 2 hits', JSON.stringify(await p.evaluate(i => { const e = window.__game().level.elements[i]; return { alive: e.alive, hp: e.hp.toFixed(2), lost: e.lost, cells: e.cells }; }, el.i)));
}
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close();
process.exit(0);
