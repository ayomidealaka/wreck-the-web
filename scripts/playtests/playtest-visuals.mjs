// Screenshots of the sniper laser sight, the laser beam over white page space, the airstrike marker and a 40mm round
// bouncing before it goes off.
// usage: node scripts/playtests/playtest-visuals.mjs <out-dir> [character]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT, ch = 'c1'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(c => localStorage.setItem('wtw-character', c), ch);
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1200);
await p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 4; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; });
await wait(700);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom }; });
const clip = { x: Math.max(0, s.x - 120), y: Math.max(0, s.y - 220), width: 640, height: 360 };
await p.keyboard.press('Digit5'); await p.mouse.move(s.x + 420, s.y - 60); await wait(400);
await p.screenshot({ path: `${OUT}/vis_sniper.png`, clip });
await p.keyboard.press('Digit9'); await p.mouse.move(s.x + 420, s.y - 150); await p.mouse.down(); await wait(500);
await p.screenshot({ path: `${OUT}/vis_laser.png`, clip }); await p.mouse.up(); await wait(200);
await p.keyboard.press('Digit2'); await p.mouse.move(s.x + 420, s.y - 150); await p.mouse.down(); await wait(260);
await p.screenshot({ path: `${OUT}/vis_ak.png`, clip }); await p.mouse.up(); await wait(200);
await p.keyboard.press('BracketLeft'); await wait(500);
await p.screenshot({ path: `${OUT}/vis_strike.png`, clip });
await wait(3500);
await p.keyboard.press('Digit6'); await p.mouse.move(s.x + 260, s.y - 140); await wait(200);
await p.mouse.down(); await wait(60); await p.mouse.up();
for (const t of [450, 700]) { await wait(t === 450 ? 450 : 250); await p.screenshot({ path: `${OUT}/vis_launcher_${t}.png`, clip }); }
console.log('errors:', errs.join('\n') || 'none'); await b.close(); process.exit(0);
