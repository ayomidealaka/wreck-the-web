// The rail laser (key 9): charge, then one beam to the page edge. Checks it waits for its charge, cuts a trench through
// text and bare page, pops the letters it passes, hits the elements it crosses, and what the frame it fires costs.
// usage: node scripts/playtests/check-rail.mjs <out>
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
await p.keyboard.press('Digit9'); await wait(300);
const before = await p.evaluate(() => { const g = window.__game(), a = g.arsenal, L = g.level, pl = g.player; window.__ft = []; let last = performance.now(); const tick = t => { window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return { letters: a.stats.letters, left: L.left, gone: L.gone.reduce((s, v) => s + v, 0), x: pl.x, y: pl.y, els: L.elements.filter(e => e.alive).length }; });
// aim down-right across the article
const s0 = await p.evaluate(q => { const g = window.__game(); return { x: (q.x + 400 - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y + 180 - g.cam.y + g.cam.sy) * g.cam.zoom }; }, before);
await p.mouse.move(s0.x, s0.y); await wait(200);
await p.mouse.down(); await wait(60); await p.mouse.up();
await wait(150);
const mid = await p.evaluate(() => { const a = window.__game().arsenal; return { charging: !!a.charge, rails: a.rails.length }; });
await wait(400);
await p.screenshot({ path: `${OUT}/rail_beam.png` });
const fired = await p.evaluate(() => { const a = window.__game().arsenal; return { charging: !!a.charge, rails: a.rails.length, beam: a.rails[0] && [a.rails[0].x0, a.rails[0].y0, a.rails[0].x1, a.rails[0].y1].map(Math.round) }; });
await wait(1200);
await p.screenshot({ path: `${OUT}/rail_after.png` });
const after = await p.evaluate(b0 => {
  const g = window.__game(), a = g.arsenal, L = g.level;
  return { letters: a.stats.letters - b0.letters, cells: b0.left - L.left, blocks: L.gone.reduce((s, v) => s + v, 0) - b0.gone, elsGone: b0.els - L.elements.filter(e => e.alive).length, worst: Math.round(Math.max(...window.__ft)) };
}, before);
console.log('150ms after the click: charging', mid.charging, 'beam yet', mid.rails > 0);
console.log('550ms: charging', fired.charging, 'beam', JSON.stringify(fired.beam));
console.log('one shot: letters popped', after.letters, '; content cells cut', after.cells, '; 4px blocks of page gone', after.blocks, '; elements broken', after.elsGone, '; worst frame', after.worst, 'ms');
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
