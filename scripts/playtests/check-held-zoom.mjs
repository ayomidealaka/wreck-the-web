// Close-ups of characters holding each handheld weapon at several angles, with the muzzle point marked.
// usage: node scripts/check-held.mjs out.png [c1,c4,...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.card').length >= 8, { timeout: 60000 });
const url = await p.evaluate(async ([IDS, process_W, ANGS]) => {
  const { loadManifest, CastCharacter } = await import('/js/cast.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js');
  await loadWeaponArt();
  const held = [null, ...WEAPONS.filter(w => (process_W).includes(w.id))], angles = ANGS.map(a => a * Math.PI / 180);
  const list = (await loadManifest()).filter(d => IDS.includes(d.id)), Z = 6, cw = 80, ch = 66;
  const cv = document.createElement('canvas'); cv.width = cw * Z * held.length; cv.height = ch * Z * list.length * angles.length;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, cv.width, cv.height);
  let row = 0;
  for (const def of list) {
    const c = await new CastCharacter(def).load();
    for (const aim of angles) {
      held.forEach((w, col) => {
        const st = { x: 30, y: ch - 6, facing: 1, moving: false, onGround: true, runT: 0, t: 0, vy: 0, aim, pose: w?.pose || 'pistol' };
        g.save(); g.translate(col * cw * Z, row * ch * Z); g.scale(Z, Z);
        c.draw(g, st, w);if (!w) { g.restore(); return; }
        const m = c.weaponMuzzle(st, w);
        g.strokeStyle = '#FF2A2A'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + Math.cos(aim) * 20, m.y + Math.sin(aim) * 20); g.stroke();
        g.fillStyle = '#FFE14D'; g.fillRect(m.x - 1, m.y - 1, 2, 2);
        g.restore();
      });
      row++;
    }
  }
  return cv.toDataURL();
}, [(process.argv[3] || 'c1,c4').split(','), (process.env.W || 'blaster,scatter').split(','), (process.env.ANG || '-50,0,45').split(',').map(Number)]);
fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
