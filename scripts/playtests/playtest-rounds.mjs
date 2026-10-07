// Rounds in flight over white page space, one screenshot per bullet weapon mid-burst. usage: node scripts/playtests/playtest-rounds.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1200);
// stand on the intro line and fire up-right into the blank space beside the heading
await p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 4; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; });
await wait(700);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom }; });
const clip = { x: Math.max(0, s.x - 60), y: Math.max(0, s.y - 260), width: 760, height: 300 };
for (const [key, id, ms] of [['Digit1', 'pistol', 220], ['Digit2', 'ak47', 220], ['Digit3', 'minigun', 220], ['Digit4', 'shotgun', 60], ['Digit5', 'sniper', 40], ['Minus', 'drone', 500]]) {
  await p.keyboard.press(key); await p.mouse.move(s.x + 700, s.y - 230); await wait(150);
  await p.mouse.down(); await wait(ms); await p.screenshot({ path: `${OUT}/round_${id}.png`, clip }); await p.mouse.up(); await wait(900);
}
console.log('errors:', errs.join('\n') || 'none'); await b.close(); process.exit(0);
