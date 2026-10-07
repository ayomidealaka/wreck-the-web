// Fires every weapon in a real level and screenshots each. usage: node scripts/playtests/playtest-weapons.mjs <out-dir> [site] [character]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT, site = 'en.wikipedia.org/wiki/Stick_figure', ch = 'c1'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(c => localStorage.setItem('wtw-character', c), ch);
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
// drop into the body text
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(600);
const names = ['blaster', 'ak47', 'minigun', 'scatter', 'sniper', 'launcher', 'rocket', 'flamer', 'laser', 'well', 'drone', 'nuke', 'mirv', 'star', 'wand'];
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Comma', 'Period', 'Slash'];
const hold = { blaster: 700, ak47: 700, minigun: 900, scatter: 120, sniper: 120, launcher: 120, rocket: 120, laser: 900, well: 120, flamer: 1100, drone: 1200, nuke: 120, mirv: 120, star: 120, wand: 120 };
const after = { rocket: 260, launcher: 260, sniper: 60, well: 900, scatter: 60, nuke: 900, mirv: 2600, star: 2600, wand: 2200 };
for (const [i, n] of names.entries()) {
  const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x, y: pl.y, cam: g.cam.y, z: g.cam.zoom }; });
  const sx = s.x * s.z, sy = (s.y - s.cam) * s.z;
  await p.keyboard.press(KEYS[i]); await wait(150);
  await p.mouse.move(sx + 260, sy - 60);
  await p.mouse.down(); await wait(hold[n]);
  if (!after[n]) await p.screenshot({ path: `${OUT}/wpn_${i + 1}_${n}.png`, clip: { x: Math.max(0, sx - 120), y: Math.max(0, sy - 170), width: 520, height: 260 } });
  await p.mouse.up(); await wait(after[n] || 200);
  if (after[n]) await p.screenshot({ path: `${OUT}/wpn_${i + 1}_${n}.png`, clip: { x: Math.max(0, sx - 120), y: Math.max(0, sy - 170), width: 520, height: 260 } });
  const st = await p.evaluate(() => { const a = window.__game().arsenal; return { w: a.weapon.id, shots: a.shots.length, burning: a.burning.size, drone: !!a.drone }; });
  console.log(n, JSON.stringify(st));
}
// grenade + jetpack
await p.mouse.move(700, 300); await p.keyboard.press('KeyG'); await wait(250);
await p.keyboard.down('Space'); await wait(700);
const s2 = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x, y: pl.y, cam: g.cam.y, z: g.cam.zoom, jet: pl.jetting }; });
await p.screenshot({ path: `${OUT}/wpn_jet.png`, clip: { x: Math.max(0, s2.x * s2.z - 160), y: Math.max(0, (s2.y - s2.cam) * s2.z - 170), width: 360, height: 260 } });
await p.keyboard.up('Space');
console.log('jetting:', s2.jet, ' stats:', JSON.stringify(await p.evaluate(() => window.__game().arsenal.stats)));
console.log('errors:', errs.join('\n') || 'none'); await b.close(); process.exit(0);
