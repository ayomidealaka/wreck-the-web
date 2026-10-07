// The nuke's reload: a bar over the character and on its slot while it reloads, and the other weapons free to fire
// meanwhile. usage: node scripts/playtests/check-recharge.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await p.keyboard.press('Equal'); await wait(300);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x + 300 - g.cam.x + g.cam.sx) * g.cam.zoom, y: Math.max(120, (pl.y + 120 - g.cam.y + g.cam.sy) * g.cam.zoom) }; });
await p.mouse.move(s.x, s.y); await p.mouse.down(); await wait(40); await p.mouse.up();
await wait(2500);
const r = await p.evaluate(() => { const a = window.__game().arsenal, w = a.weapon; return { weapon: w.id, recharge: a.recharge(w) }; });
console.log('2.5s after the nuke:', JSON.stringify(r));
await p.evaluate(() => { const g = window.__game(), pl = g.player; pl.x = g.cam.x + g.cam.w * 0.5; pl.vx = 0; }); await wait(400);
const pl = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (pl.y - g.cam.y + g.cam.sy) * g.cam.zoom }; });
await p.screenshot({ path: `${OUT}/nuke_bar.png`, clip: { x: Math.max(0, pl.x - 80), y: Math.max(0, pl.y - 130), width: 160, height: 150 } });
await p.screenshot({ path: `${OUT}/nuke_slot.png`, clip: { x: 640, y: 730, width: 640, height: 60 } });
// switch to the pistol and fire: it should go straight away
const shots0 = await p.evaluate(() => window.__game().arsenal.stats.shots);
await p.keyboard.press('Digit1'); await wait(200);
await p.mouse.down(); await wait(60); await p.mouse.up(); await wait(100);
console.log('pistol fired during the nuke reload:', (await p.evaluate(() => window.__game().arsenal.stats.shots)) > shots0);
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
