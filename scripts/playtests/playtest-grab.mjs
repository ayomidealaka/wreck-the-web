// Gravity well grab and throw: makes debris with a blast, holds right-click to pull it into a ball, lets go to throw
// it at text. usage: node scripts/playtests/playtest-grab.mjs <out-dir>
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
await p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 30; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; g.arsenal.select(9); g.arsenal.explode(pl.x + 160, pl.y - 10, 60, 600); });
await wait(1500);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom, debris: g.fx.chunks.length }; });
console.log('debris lying around:', s.debris);
await p.mouse.move(s.x + 220, s.y - 10); await p.mouse.down({ button: 'right' }); await wait(1300);
const held = await p.evaluate(() => window.__game().arsenal.grab.held.length);
await p.screenshot({ path: `${OUT}/grab.png`, clip: { x: Math.max(0, s.x - 80), y: Math.max(0, s.y - 150), width: 520, height: 220 } });
console.log('pieces held after 1.3s:', held);
const before = await p.evaluate(() => window.__game().arsenal.stats.letters);
await p.mouse.move(s.x + 500, s.y + 60); await wait(100); await p.mouse.up({ button: 'right' }); await wait(80);
const thrown = await p.evaluate(() => window.__game().fx.chunks.filter(c => c.thrown > 0).length);
await wait(600);
const after = await p.evaluate(() => window.__game().arsenal.stats.letters);
console.log('thrown pieces in flight:', thrown, ' letters knocked off by the throw:', after - before);
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
