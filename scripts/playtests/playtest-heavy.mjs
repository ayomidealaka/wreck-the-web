// Frames from the airstrike and the mini nuke going off over body text. usage: node scripts/playtests/playtest-heavy.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 300000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const [slot, id, shots] of [[12, 'airstrike', [900, 1500, 2300, 3200]], [13, 'nuke', [700, 1000, 1600, 3000]]]) {
  await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
  await wait(1200);
  // stand on the "Stick figure" intro paragraph
  await p.evaluate(slot => {
    const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x);
    const pl = g.player; pl.x = L[0].x + 4; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; g.arsenal.select(slot);
  }, slot);
  await wait(800);
  const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x, y: pl.y, cam: g.cam.y, z: g.cam.zoom }; });
  const sx = s.x * s.z, sy = (s.y - s.cam) * s.z;
  await p.mouse.move(sx + 380, sy + 140); await p.mouse.down(); await wait(120); await p.mouse.up();
  let t = 120;
  for (const at of shots) { await wait(at - t); t = at; await p.screenshot({ path: `${OUT}/heavy_${id}_${at}.png` }); }
}
console.log('errors:', errs.join('\n') || 'none'); await b.close(); process.exit(0);
