// A rigged character's run cycle at its 8 keys (one cycle = 1 / 1.7 of runT), with and without a rifle, then the jump:
// take-off, rising, apex, falling, about to land, landing.
// usage: node scripts/playtests/check-run.mjs out.png [pack]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT, PACK = 'test'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async PACK => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js');
  await loadWeaponArt();
  const c = await new RigCharacter((await loadManifest((await loadPacks()).find(x => x.id === PACK)))[0]).load();
  const ak = WEAPONS.find(w => w.id === 'ak47'), CW = 90, CH = 110, Z = 3;
  const cv = document.createElement('canvas'); cv.width = 8 * CW * Z; cv.height = 3 * CH * Z;
  const g = cv.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height); g.scale(Z, Z);
  [null, ak].forEach((w, r) => { for (let k = 0; k < 8; k++) {
    g.fillStyle = '#ccc'; g.fillRect(k * CW, r * CH + 100, CW - 4, 1);
    c.draw(g, { x: k * CW + 40, y: r * CH + 100, facing: 1, t: 0, landT: 0, aim: 0, onGround: true, moving: true, speed: 1, runT: k / 8 / 1.7 }, w);
  } });
  [-430, -280, -60, 150, 420, 'land'].forEach((vy, k) => {
    g.fillStyle = '#ccc'; g.fillRect(k * CW, 2 * CH + 100, CW - 4, 1);
    const st = vy === 'land' ? { onGround: true, landT: 0.1 } : { onGround: false, vy, landT: 0 };
    c.draw(g, { x: k * CW + 40, y: 2 * CH + (vy === 'land' ? 100 : 90), facing: 1, t: 0, aim: 0, moving: false, speed: 0, runT: 0, ...st }, ak);
  });
  return cv.toDataURL();
}, PACK);
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close();
