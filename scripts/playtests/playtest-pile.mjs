// Debris piles and cascades: blasts the top of the page, then measures over time how many pieces are resting on
// other pieces (stacked), how many letters the falling debris knocked off by itself, and the frame time.
// usage: node scripts/playtests/playtest-pile.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
await p.evaluate(() => {
  const g = window.__game(), a = g.arsenal;
  // count letters knocked off by falling debris alone
  const orig = a.debrisImpacts.bind(a); window.__cascade = 0;
  a.debrisImpacts = () => { const before = a.stats.letters; orig(); window.__cascade += a.stats.letters - before; };
  // keep the player out of it
  g.player.x = 40; g.player.y = 120;
  for (const [x, y] of [[300, 260], [420, 300], [560, 280], [700, 330]]) a.explode(x, y, 46, 700);
});
for (const ms of [800, 1600, 3000]) {
  await wait(ms === 800 ? 800 : ms - (ms === 1600 ? 800 : 1600));
  const st = await p.evaluate(() => {
    const g = window.__game(), C = g.fx.chunks;
    const stacked = C.filter(c => c.rest > 0.2 && C.some(r => r !== c && r.rest > 0.2 && Math.abs(c.x - r.x) < (c.w + r.w) * 0.42 && Math.abs((c.y + c.h / 2) - (r.y - r.h / 2)) < 3)).length;
    return { pieces: C.length, resting: C.filter(c => c.rest > 0.2).length, stackedOnOthers: stacked, cascadeLetters: window.__cascade, frameMs: +((g.ftEma || 0) * 1000).toFixed(1), degraded: !!g.degraded };
  });
  console.log(`after ${ms}ms:`, JSON.stringify(st));
}
await p.screenshot({ path: `${OUT}/pile.png`, clip: { x: 150, y: 150, width: 800, height: 450 } });
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
