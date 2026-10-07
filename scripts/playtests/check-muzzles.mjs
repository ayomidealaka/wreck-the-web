import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html');
await p.waitForFunction(() => document.querySelectorAll('.card').length >= 7, { timeout: 60000 });
const url = await p.evaluate(async () => {
  const { loadManifest, CastCharacter, AIMS } = await import('/js/cast.js');
  const list = await loadManifest(), Z = 3, cw = 80, chh = 80;
  const cv = document.createElement('canvas'); cv.width = cw * Z * 5; cv.height = chh * Z * list.length;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, cv.width, cv.height);
  for (const [row, def] of list.entries()) {
    const c = await new CastCharacter(def).load();
    AIMS.forEach((a, col) => {
      const ox = col * cw * Z, oy = row * chh * Z, sx = 24, sy = 46;
      g.drawImage(c.poses[a], sx, sy, cw, chh, ox, oy, cw * Z, chh * Z);
      const m = c.muzzle[a], px = ox + (m.x - sx) * Z, py = oy + (m.y - sy) * Z;
      g.strokeStyle = '#FF2A2A'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(m.angle) * 90, py + Math.sin(m.angle) * 90); g.stroke();
      g.fillStyle = '#FFE14D'; g.fillRect(px - 4, py - 4, 8, 8);
    });
  }
  return cv.toDataURL();
});
fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
