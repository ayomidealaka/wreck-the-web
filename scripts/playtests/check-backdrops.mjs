// Each of the four worlds under the page: a nuke opens the page up, then a screenshot of what shows through.
// usage: node scripts/playtests/check-backdrops.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 400000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const theme of ['synth', 'dusk', 'sunny', 'space']) {
  await p.goto(`http://localhost:4600/?debug&pack=test&bg=${theme}&url=` + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
  await wait(1200);
  for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(300); }
  await wait(400);
  const t0 = performance.now();
  const info = await p.evaluate(() => { const g = window.__game(), pl = g.player; g.arsenal.nuke(pl.x + 380, pl.y - 40); g.arsenal.nuke(pl.x + 380, pl.y + 300); return { theme: g.backdrop.theme, night: g.backdrop.night }; });
  await wait(1800);
  await p.screenshot({ path: `${OUT}/bg_${theme}.png` });
  console.log(theme, JSON.stringify(info));
}
// the pick: never the same one twice running
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const picks = await p.evaluate(() => { const g = window.__game(); return [localStorage.getItem('wtw-bg-last'), g.backdrop.theme]; });
console.log('picked for this site:', picks[1], '(remembered as last:', picks[0] + ')');
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
