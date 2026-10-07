// Times the one frame a nuke goes off in: wall time per level/fx method during arsenal.nuke(). usage: node scripts/playtests/time-nuke.mjs
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await new Promise(r => setTimeout(r, 350)); }
const res = await p.evaluate(() => {
  const g = window.__game(), T = {};
  const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); T[label] = (T[label] || 0) + performance.now() - t; T[label + ' calls'] = (T[label + ' calls'] || 0) + 1; return r; }; };
  for (const n of ['carve', 'killLetter', 'detachLetter', 'detachElement', 'clearRect', 'damageElement', 'crack', 'lettersInRadius', 'elementsInRadius', 'sampleColors', 'copyRegion']) wrap(g.level, n, 'level.' + n);
  for (const n of ['queuePop', 'hurtElement', 'dropElement', 'launchPiece', 'shatterSlab', 'ignite', 'popLetter']) wrap(g.arsenal, n, 'arsenal.' + n);
  for (const n of ['impulse', 'explosion', 'debris', 'smoke', 'chunk']) wrap(g.fx, n, 'fx.' + n);
  wrap(g.backdrop, 'reveal', 'backdrop.reveal'); wrap(g.audio, 'nuke', 'audio.nuke');
  const pl = g.player, x = pl.x + 200, y = pl.y - 50;
  const t0 = performance.now(); g.arsenal.nuke(x, y); const total = performance.now() - t0;
  // the frames right after: pops being released, then the first update/draw with everything flying
  const u0 = performance.now(); g.arsenal.updatePops(); const pops = performance.now() - u0;
  return { total, pops, letters: g.level.letters.length, elements: g.level.elements.length, cells: g.level.total, T: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
});
console.log('nuke() took', res.total.toFixed(1), 'ms; first updatePops', res.pops.toFixed(1), 'ms; letters', res.letters, 'elements', res.elements, 'cells', res.cells);
for (const [k, v] of Object.entries(res.T).filter(([k]) => !k.endsWith('calls')).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(7)}ms  ${k}  (${res.T[k + ' calls']} calls)`);
await b.close(); process.exit(0);
