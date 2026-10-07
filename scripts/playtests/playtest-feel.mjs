// Slow motion + shake tiers + sound cap: fires a nuke (should trigger slow-mo), samples the game speed and the
// camera shake over time, and checks the live sound voices never pass the cap. usage: node scripts/playtests/playtest-feel.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
await p.mouse.click(640, 400);   // a click starts the audio
await p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 30; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; g.arsenal.select(11); });
await wait(400);
// a rocket first: big shake tier but probably no slow-mo
await p.evaluate(() => { const g = window.__game(); g.arsenal.explode(g.player.x + 250, g.player.y - 30, 86, 1300); });
await wait(60);
console.log('rocket blast:', JSON.stringify(await p.evaluate(() => { const g = window.__game(); return { quake: g.fx.quake.amp, slow: g.slow?.t >= 0 }; })));
await wait(900);
await p.evaluate(() => { const g = window.__game(); g.arsenal.nuke(g.player.x + 320, g.player.y - 20); });
const samples = [];
for (let i = 0; i < 14; i++) {
  await wait(120);
  samples.push(await p.evaluate(() => { const g = window.__game(); return { k: +(g.slowK ?? 1).toFixed(2), slow: g.slow?.t >= 0, quake: +(g.fx.quake.amp * g.fx.quake.t / 0.4).toFixed(1), voices: window.__game().audio?.voices }; }));
  if (i === 3) await p.screenshot({ path: `${OUT}/slowmo.png` });
}
console.log('after nuke, every 120ms:', samples.map(s => `speed ${s.k}${s.slow ? ' SLOW' : ''} shake ${s.quake} voices ${s.voices}`).join('\n  '));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
