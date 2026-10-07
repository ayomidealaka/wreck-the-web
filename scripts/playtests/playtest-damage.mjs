// Damage per weapon: fresh copy of the same page for each weapon, fire at the same spot for the same time, count
// letters knocked off and page content destroyed. usage: node scripts/playtests/playtest-damage.mjs <out-dir> [site] [ids]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 600000);
const [OUT, site = 'en.wikipedia.org/wiki/Stick_figure', only] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const ids = ['uzi', 'ak47', 'minigun', 'scatter', 'sniper', 'launcher', 'rocket', 'flamer', 'laser', 'well', 'drone', 'nuke', 'airstrike']; // airstrike = the [ key
// how long the trigger is held, and how long to let things play out afterwards
const hold = { uzi: 1500, ak47: 1500, minigun: 1500, scatter: 1500, sniper: 1500, launcher: 1500, rocket: 1500, flamer: 1500, laser: 1500, well: 1500, drone: 1500, airstrike: 200, nuke: 200 };
const after = { airstrike: 3600, nuke: 3500, well: 2600, flamer: 1800, launcher: 900, rocket: 900 };
const rows = [];
for (const [i, id] of ids.entries()) {
  if (only && !only.split(',').includes(id)) continue;
  await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
  await wait(1200);
  // stand on a line of body text (the densest row of letters) and fire across the paragraph below it
  await p.evaluate(() => {
    const g = window.__game(), L = g.level.letters, rows = new Map();
    for (const l of L) { if (!l.alive || l.y < 300) continue; const k = Math.round(l.y / 4); rows.set(k, (rows.get(k) || 0) + 1); }
    const row = [...rows].sort((a, b) => b[1] - a[1])[0][0] * 4, line = L.filter(l => Math.abs(l.y - row) < 4).sort((a, b) => a.x - b.x);
    const pl = g.player; pl.x = line[0].x + 6; pl.y = line[0].y - 1; pl.vx = pl.vy = 0;
  });
  await wait(700);
  const s = await p.evaluate(i => { const g = window.__game(); if (i < 12) g.arsenal.select(i); const pl = g.player; return { x: pl.x, y: pl.y, cam: g.cam.y, z: g.cam.zoom, left: g.level.left, letters: g.arsenal.stats.letters }; }, i);
  const sx = s.x * s.z, sy = (s.y - s.cam) * s.z;
  await p.mouse.move(sx + 360, sy + 60);
  if (id === 'airstrike') { await p.keyboard.press('BracketLeft'); await wait(after[id]); }
  else { await p.mouse.down(); await wait(hold[id]); await p.mouse.up(); await wait(after[id] || 400); }
  const e = await p.evaluate(() => { const g = window.__game(); return { left: g.level.left, letters: g.arsenal.stats.letters }; });
  await p.screenshot({ path: `${OUT}/dmg_${String(i + 1).padStart(2, '0')}_${id}.png` });
  rows.push({ id, letters: e.letters - s.letters, cells: s.left - e.left });
  console.log(id.padEnd(10), 'letters', String(e.letters - s.letters).padStart(5), '  content cells', String(s.left - e.left).padStart(7));
}
console.log('errors:', errs.join('\n') || 'none'); await b.close(); process.exit(0);
