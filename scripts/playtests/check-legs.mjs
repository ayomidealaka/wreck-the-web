// Close-up of a rigged character's hips and legs on magenta (gaps show up pink): standing, run keys, jump, landing.
// usage: node scripts/playtests/check-legs.mjs out.png [pack]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT, PACK = 'test'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async PACK => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const c = await new RigCharacter((await loadManifest((await loadPacks()).find(x => x.id === PACK)))[0]).load();
  const S = [{ onGround: true, moving: false }, ...[0, 0.1, 0.2, 0.3, 0.4].map(r => ({ onGround: true, moving: true, runT: r })), { onGround: false, vy: -300 }, { onGround: true, landT: 0.1 }];
  const cv = document.createElement('canvas'); cv.width = S.length * 56 * 6; cv.height = 50 * 6;
  const g = cv.getContext('2d'); g.fillStyle = '#FF00FF'; g.fillRect(0, 0, cv.width, cv.height); g.scale(6, 6);
  S.forEach((s, i) => { g.save(); g.translate(0, -44); c.draw(g, { x: i * 56 + 26, y: 92, facing: 1, t: 0, aim: 0, landT: 0, speed: 1, runT: 0, recoil: 0, bgLum: 0.9, ...s }, null); g.restore(); });
  return cv.toDataURL();
}, PACK);
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64')); console.log('errors:', errs.join(' | ') || 'none'); await b.close();
