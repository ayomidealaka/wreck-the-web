// Marks each weapon's muzzle (yellow) and ejection port (cyan), and the jetpack nozzle (magenta), on a rigged and a
// classic character. usage: node scripts/playtests/check-points.mjs out.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async () => {
  const { loadPacks, loadManifest, CastCharacter } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js'); await loadWeaponArt();
  const packs = await loadPacks();
  const ash = await new RigCharacter((await loadManifest(packs.find(x => x.id === 'test')))[0]).load();
  const walt = await new CastCharacter((await loadManifest(packs.find(x => x.id === 'classic'))).find(d => d.id === 'c3')).load();
  const ids = ['blaster', 'ak47', 'minigun', 'scatter', 'sniper'], CW = 90, CH = 110, Z = 3;
  const cv = document.createElement('canvas'); cv.width = ids.length * CW * Z; cv.height = 2 * CH * Z;
  const g = cv.getContext('2d'); g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, cv.width, cv.height); g.scale(Z, Z);
  const dot = (q, c) => { g.fillStyle = c; g.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); };
  [ash, walt].forEach((c, r) => ids.forEach((id, i) => {
    const w = WEAPONS.find(x => x.id === id), st = { x: i * CW + 40, y: r * CH + 100, facing: 1, t: 0, onGround: true, moving: false, landT: 0, recoil: 0, bgLum: 0.9, aim: -0.3, pose: w.pose || 'pistol' };
    c.draw(g, st, w);
    dot(c.weaponMuzzle(st, w), '#FFE14D'); if (c.weaponPoint) dot(c.weaponPoint(st, w, w.art.port), '#00E5FF');
    if (r === 0) dot(c.jetNozzle(st), '#FF00CC');
  }));
  return cv.toDataURL();
});
fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close();
