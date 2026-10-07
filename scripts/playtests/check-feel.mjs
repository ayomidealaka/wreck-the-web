// Rigged character feel check: rows = white page / dark page (shadow tint), columns = weapon x aim, at rest and at
// full recoil side by side. usage: node scripts/playtests/check-feel.mjs out.png [pack]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT, PACK = 'test'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async PACK => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js'); await loadWeaponArt();
  const c = await new RigCharacter((await loadManifest((await loadPacks()).find(x => x.id === PACK)))[0]).load();
  const cols = [];
  for (const id of ['uzi', 'ak47', 'scatter', 'sniper']) for (const deg of [-55, 0, 45]) for (const recoil of [0, 1]) cols.push({ id, deg, recoil });
  const CW = 78, CH = 120, Z = 2, cv = document.createElement('canvas'); cv.width = cols.length * CW * Z; cv.height = 2 * CH * Z;
  const g = cv.getContext('2d'); g.scale(Z, Z);
  [['#FFFFFF', 1], ['#1A1626', 0.1]].forEach(([bg, lum], r) => {
    g.fillStyle = bg; g.fillRect(0, r * CH, cols.length * CW, CH);
    cols.forEach((col, i) => {
      const w = WEAPONS.find(x => x.id === col.id), x = i * CW + 34, y = r * CH + 108;
      const st = { x, y, facing: 1, t: 0, onGround: true, moving: false, landT: 0, recoil: col.recoil, bgLum: lum, aim: 0 };
      st.aim = c.aimAt({ ...st, recoil: 0 }, w, { x: x + Math.cos(col.deg * Math.PI / 180) * 200, y: y - 50 + Math.sin(col.deg * Math.PI / 180) * 200 });
      c.draw(g, st, w);
    });
  });
  return cv.toDataURL();
}, PACK);
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close();
