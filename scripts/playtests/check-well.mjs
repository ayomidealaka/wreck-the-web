// One gravity well into the article: what it takes out (letters, content, page, elements), how long it runs, and the
// worst frame while it does. Screenshots mid-sweep and after the burst. usage: node scripts/playtests/check-well.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 200000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/?debug&pack=test&bg=synth&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(600);
await p.keyboard.press('Digit0'); await wait(300);
const before = await p.evaluate(() => {
  const g = window.__game(), a = g.arsenal, L = g.level, pl = g.player;
  window.__ft = []; let last = performance.now(); const tick = t => { window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  return { letters: a.stats.letters, left: L.left, gone: L.gone ? L.gone.reduce((s, v) => s + v, 0) : 0, els: L.elements.filter(e => e.alive).length, x: pl.x, y: pl.y };
});
const s0 = await p.evaluate(q => { const g = window.__game(); return { x: (q.x + 330 - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y + 200 - g.cam.y + g.cam.sy) * g.cam.zoom }; }, before);
await p.mouse.move(s0.x, s0.y); await wait(200);
await p.mouse.down(); await wait(40); await p.mouse.up();
await wait(2200);
await p.screenshot({ path: `${OUT}/well_sweep.png` });
await wait(2500);
await p.screenshot({ path: `${OUT}/well_after.png` });
const after = await p.evaluate(b0 => {
  const g = window.__game(), a = g.arsenal, L = g.level;
  return { letters: a.stats.letters - b0.letters, cells: b0.left - L.left, blocks: (L.gone ? L.gone.reduce((s, v) => s + v, 0) : 0) - b0.gone, elsGone: b0.els - L.elements.filter(e => e.alive).length, worst: Math.round(Math.max(...window.__ft)), still: a.shots.filter(s => s.kind === 'well').length };
}, before);
console.log('one gravity well: letters', after.letters, '; content cells', after.cells, '; page blocks', after.blocks, '; elements broken', after.elsGone, '; still running', after.still, '; worst frame', after.worst, 'ms');
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
