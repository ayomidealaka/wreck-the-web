// Per-frame cost in the 30 frames after a nuke: what each part of the frame took. usage: node scripts/playtests/time-frames.mjs
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await new Promise(r => setTimeout(r, 350)); }
await p.evaluate(() => {
  const g = window.__game(), F = window.__frames = [];
  let cur = null;
  const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); if (cur) { cur[label] = (cur[label] || 0) + performance.now() - t; cur[label + '#'] = (cur[label + '#'] || 0) + 1; } return r; }; };
  const frame = g.frame; g.frame = function (...a) { cur = { t: 0 }; const t = performance.now(); const r = frame.apply(this, a); cur.t = performance.now() - t; F.push(cur); cur = null; return r; };
  wrap(g, 'update', 'update'); wrap(g, 'render', 'render');
  wrap(g.fx, 'update', 'fx.update'); wrap(g.fx, 'drawBelow', 'fx.drawBelow'); wrap(g.fx, 'drawAbove', 'fx.drawAbove');
  wrap(g.arsenal, 'update', 'arsenal.update'); wrap(g.arsenal, 'popLetter', 'popLetter'); wrap(g.arsenal, 'updatePops', 'updatePops'); wrap(g.arsenal, 'updateBurning', 'burning'); wrap(g.arsenal, 'updateShots', 'shots');
  wrap(g.level, 'draw', 'level.draw'); wrap(g.player, 'draw', 'player.draw'); wrap(g.player, 'update', 'player.update'); wrap(g.backdrop, 'draw', 'backdrop.draw');
  if (g.recorder) wrap(g.recorder, 'frame', 'recorder');
  wrap(g.arsenal, 'draw', 'arsenal.draw'); wrap(g, 'drawHud', 'hud'); wrap(g, 'drawFuel', 'fuel'); wrap(g, 'drawBattery', 'battery'); wrap(g.arsenal, 'nuke', 'nuke');
});
// fire the nuke for real, so its frame carries the blast AND that frame's draw
await p.keyboard.press('Equal'); await new Promise(r => setTimeout(r, 300));
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x - g.cam.x) * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom }; });
await p.mouse.move(s.x + 250, s.y + 40); await new Promise(r => setTimeout(r, 100));
await p.evaluate(() => { window.__frames.length = 0; });
await p.mouse.down(); await new Promise(r => setTimeout(r, 60)); await p.mouse.up();
await new Promise(r => setTimeout(r, 1500));
const F = await p.evaluate(() => window.__frames.slice());
const keys = ['t', 'update', 'render', 'nuke', 'arsenal.update', 'updatePops', 'popLetter', 'shots', 'fx.update', 'level.draw', 'fx.drawBelow', 'fx.drawAbove', 'arsenal.draw', 'player.draw', 'hud', 'fuel', 'battery', 'recorder'];
console.log('frames', F.length, '; the 8 slowest:');
console.log(keys.map(k => k.padStart(13)).join(''));
for (const f of F.map((f, i) => ({ ...f, i })).sort((a, b) => b.t - a.t).slice(0, 8).sort((a, b) => a.i - b.i)) console.log(keys.map(k => (f[k] == null ? '-' : (k === 'popLetter' ? `${f[k].toFixed(1)}(${f['popLetter#']})` : f[k].toFixed(1))).padStart(13)).join(''));
await b.close(); process.exit(0);
