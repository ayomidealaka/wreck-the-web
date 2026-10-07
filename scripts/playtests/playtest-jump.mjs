import puppeteer from 'puppeteer-core'; // usage: node scripts/playtests/playtest-jump.mjs <screenshot-dir> [site]
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const [OUT, site = 'news.ycombinator.com'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent(site));
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const st = () => p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x, y: pl.y, ground: pl.onGround, jet: pl.jetting, cam: g.cam.y, zoom: g.cam.zoom }; });
await wait(2500);
const s0 = await st(); console.log('standing:', JSON.stringify(s0));
await p.screenshot({ path: `${OUT}/stand.png`, clip: { x: (s0.x - 70) * s0.zoom, y: (s0.y - s0.cam - 70) * s0.zoom, width: 140, height: 100 } });
// glyph check: what's directly under the feet
console.log('ground under feet:', await p.evaluate(() => { const g = window.__game(), pl = g.player, L = g.level;
  const r = Math.round(pl.y / 2); let row = ''; for (let c = Math.floor((pl.x - 10) / 2); c <= Math.floor((pl.x + 10) / 2); c++) row += L.cellSolid(c, r) ? '#' : '.'; return row; }));
for (const [label, ms] of [['tap', 40], ['medium', 130], ['full', 300]]) {
  const y0 = (await st()).y;
  await p.evaluate(() => { window.__apex = 1e9; const g = window.__game(); const f = () => { window.__apex = Math.min(window.__apex, g.player.y); if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; f(); });
  await p.keyboard.down('Space'); await wait(ms); await p.keyboard.up('Space');
  await wait(1100);
  const apex = await p.evaluate(() => { window.__stop = true; return window.__apex; });
  console.log(`${label} (${ms}ms): ${Math.round(y0 - apex)}px high, landed=${(await st()).ground}`);
}
await p.keyboard.down('Space'); await wait(700); const j = await st(); await p.keyboard.up('Space');
console.log('hold 700ms -> jetpack on:', j.jet);
await wait(1500);
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
