// Dash: distance covered on the ground and in the air, the air-dash limit, a dash through your own bullets
// (supercharged) and into your own grenade (punted airburst). usage: node scripts/playtests/playtest-dash.mjs <out-dir> [pack]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT, PACK = 'test'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto(`http://localhost:4600/?debug&pack=${PACK}&url=` + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
const place = () => p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 20; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; });
const pos = () => p.evaluate(() => { const pl = window.__game().player; return { x: Math.round(pl.x), y: Math.round(pl.y), dashing: pl.dashing, air: !pl.onGround }; });
await place(); await wait(400);
const s0 = await pos(); await p.mouse.move(1200, 300); await p.keyboard.press('ShiftLeft'); await wait(60);
const shot = async n => { const c = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: Math.max(0, pl.x * g.cam.zoom - 200), y: Math.max(0, (pl.y - g.cam.y) * g.cam.zoom - 110), width: 320, height: 130 }; }); await p.screenshot({ path: `${OUT}/dash_${n}.png`, clip: c }); };
await shot('ground'); await wait(300); const s1 = await pos();
console.log('ground dash: moved', s1.x - s0.x, 'px');
// double-tap D
await place(); await wait(300); const s2 = await pos(); await p.keyboard.press('KeyD'); await wait(80); await p.keyboard.press('KeyD'); await wait(350); const s3 = await pos();
console.log('double-tap D dash: moved', s3.x - s2.x, 'px');
// air: jump, dash twice -> only one counts
await place(); await wait(300); await p.keyboard.press('Space'); await wait(150);
const a0 = await pos(); await p.keyboard.press('ShiftLeft'); await wait(330); const a1 = await pos(); await p.keyboard.press('ShiftLeft'); await wait(200); const a2 = await pos();
console.log('air dash 1 moved', a1.x - a0.x, ' second air dash moved', a2.x - a1.x, '(should be small: one air dash until landing)');
// supercharge: fire the AK, then dash through the rounds
await place(); await wait(400);
await p.evaluate(() => { const g = window.__game(); g.arsenal.select(1); });
await p.mouse.move(1200, 330); await wait(100);
const charged = await p.evaluate(async () => {
  const g = window.__game(), a = g.arsenal, pl = g.player;
  a.bullet({ x: pl.x + 30, y: pl.y - 40 }, 0, 400, 'rifle', a.weapon.dmg);      // a slow round just ahead of him
  return a.shots.length;
});
await p.keyboard.press('ShiftLeft'); await wait(120);
console.log('rounds supercharged:', await p.evaluate(() => window.__game().arsenal.shots.filter(s => s.charged).length));
// punt: drop a grenade at his feet, dash into it
await place(); await wait(400);
await p.evaluate(() => { const g = window.__game(), pl = g.player; g.arsenal.shots.push({ kind: 'grenade', x: pl.x + 22, y: pl.y - 6, vx: 0, vy: 0, life: 3, spin: 0 }); });
await wait(150); await p.keyboard.press('ShiftLeft'); await wait(60);
const punted = await p.evaluate(() => { const s = window.__game().arsenal.shots.find(s => s.kind === 'grenade'); return s ? { punted: !!s.punted, vx: Math.round(s.vx) } : 'gone'; });
await shot('punt'); await wait(600);
console.log('grenade punted:', JSON.stringify(punted), ' booms so far:', await p.evaluate(() => window.__game().arsenal.stats.booms));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
