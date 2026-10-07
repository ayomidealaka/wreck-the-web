// Frame strips of Ash's gun animations: grenade throw, weapon swing-in, shotgun pump. usage: node scripts/playtests/check-anims.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(() => localStorage.setItem('wtw-character', 'r1'));
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(2500);
const scr = () => p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (pl.y - g.cam.y + g.cam.sy) * g.cam.zoom }; });
// pose frames rendered straight from the rig at set moments of each animation (screenshots are too slow for 0.3s moves)
const render = (name, weapon, overrides) => p.evaluate((name, weapon, overrides) => {
  const g = window.__game(), pl = g.player, W = g.arsenal.constructor && g.arsenal.weapons ? null : null;
  const w = (window.__weapons || []).find(x => x.id === weapon) || g.arsenal.weapon;
  const c = document.createElement('canvas'); c.width = 130 * overrides.length * 3; c.height = 120 * 3; const x = c.getContext('2d');
  x.fillStyle = '#E8E4DA'; x.fillRect(0, 0, c.width, c.height); x.scale(3, 3);
  overrides.forEach((o, i) => {
    const st = { ...pl.spriteState(), x: 65 + i * 130, y: 110, facing: 1, aim: -0.15, moving: false, onGround: true, vy: 0, landT: 0, jetting: false, dashing: false, flipAngle: 0, recoil: 0, gun: { kick: 0, rot: 0, swing: 0, lag: 0, switchT: 1, pumpT: 1, throwT: 1, ...o } };
    pl.sprite.draw(x, st, w);
  });
  return c.toDataURL();
}, name, weapon, overrides);
const fs = await import('node:fs');
const save = (n, d) => fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(d.split(',')[1], 'base64'));
// which weapon object: select by key, then read arsenal.weapon
const pick = async key => { await p.keyboard.press(key); await wait(400); };
await pick('Digit2');
save('throw', await render('throw', 'ak47', [0, 0.12, 0.25, 0.36, 0.47, 0.6, 0.75, 0.9].map(t => ({ throwT: t }))));
save('switch', await render('switch', 'ak47', [[0.9, 0], [0.6, 0.15], [0.3, 0.35], [0.08, 0.6], [-0.02, 1]].map(([sw, t]) => ({ swing: sw, switchT: t }))));
await pick('Digit4');
save('pump', await render('pump', 'scatter', [0, 0.14, 0.22, 0.29, 0.36, 0.44].map(t => ({ pumpT: t }))));
save('kick', await render('kick', 'scatter', [{ kick: 1, rot: 1 }, { kick: 0.5, rot: 0.6 }, { kick: -0.05, rot: 0.1 }, { lag: 2.5 }, { lag: -2.5 }]));
console.log(errs.join('\n') || 'no errors'); process.exit(0);
