// Tips checklist (fresh browser) and the ending: ticks off moves, then nukes a short page until the ending plays
// and the results screen shows. usage: node scripts/playtests/playtest-onboard.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(() => localStorage.removeItem('wtw-tips'));
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('example.com'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
await p.keyboard.down('KeyD'); await wait(400); await p.keyboard.up('KeyD');
await p.keyboard.press('Space'); await wait(300); await p.keyboard.press('ShiftLeft'); await wait(400);
await p.screenshot({ path: `${OUT}/tips.png`, clip: { x: 0, y: 0, width: 420, height: 260 } });
console.log('tips done:', JSON.stringify(await p.evaluate(() => window.__game().tips.done)));
// wreck it: nukes until the ending starts
for (let i = 0; i < 6; i++) {
  const st = await p.evaluate(() => { const g = window.__game(); if (!g.ending) g.arsenal.nuke(g.level.W * (0.3 + Math.random() * 0.4), g.level.H * (0.2 + Math.random() * 0.5)); return { progress: +g.progress.toFixed(2), ending: !!g.ending }; });
  console.log('nuke', i + 1, JSON.stringify(st));
  if (st.ending) break;
  await wait(900);
}
await wait(3000);
const res = await p.evaluate(() => ({ results: !document.querySelector('#results').hidden, stats: document.querySelector('#resultsStats').innerText.replace(/\n/g, ' | ') }));
console.log('results screen:', JSON.stringify(res));
await p.screenshot({ path: `${OUT}/results.png` });
// the game keeps running under the results; the x closes them and you carry on with the same page
const live = () => p.evaluate(() => { const g = window.__game(); return { paused: g.paused, t: +g.t.toFixed(2), shots: g.arsenal.stats.shots }; });
const a = await live(); await wait(500); const b2 = await live();
console.log('under the results: paused', a.paused, ' game clock advanced', (b2.t - a.t).toFixed(2), 's');
await p.click('.results-close'); await wait(200);
const closed = await p.evaluate(() => document.querySelector('#results').hidden);
await p.keyboard.press('Digit1'); await wait(150);
await p.mouse.move(900, 300); await p.mouse.down(); await wait(400); await p.mouse.up(); await wait(200);
const c = await live();
console.log('after x: results hidden', closed, ' paused', c.paused, ' shots fired since', c.shots - b2.shots);
await p.screenshot({ path: `${OUT}/after-close.png` });
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
