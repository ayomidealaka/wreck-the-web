// Renders every character at several aim angles (standing + running) with the muzzle point and shot line.
// usage: node scripts/playtests/check-freeaim.mjs out.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:4600/cast-preview.html');
await p.waitForFunction(() => document.querySelectorAll('.card').length >= 8, { timeout: 60000 });
const url = await p.evaluate(async (ANG) => {
  const { loadManifest, CastCharacter } = await import('/js/cast.js?' + Date.now());
  const list = await loadManifest(), Z = 3, cw = 64, ch = 70;
  const angles = ANG.map(a => a * Math.PI / 180);
  const cols = angles.length * 2;
  const cv = document.createElement('canvas'); cv.width = cw * Z * cols; cv.height = ch * Z * list.length;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, cv.width, cv.height);
  for (const [row, def] of list.entries()) {
    const c = await new CastCharacter(def).load();
    for (let col = 0; col < cols; col++) {
      const aim = angles[col % angles.length], moving = col >= angles.length;
      const st = { x: cw / 2, y: ch - 6, facing: 1, moving, onGround: true, runT: 0.18, t: 0, vy: 0, aim };
      g.save(); g.translate(col * cw * Z, row * ch * Z); g.scale(Z, Z);
      c.draw(g, st);
      const m = c.muzzleAt(st);
      g.strokeStyle = '#FF2A2A'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + Math.cos(aim) * 30, m.y + Math.sin(aim) * 30); g.stroke();
      g.fillStyle = '#FFE14D'; g.fillRect(m.x - 1, m.y - 1, 2, 2);
      g.restore();
    }
  }
  return cv.toDataURL();
}, (process.env.ANG || '-80,-40,0,40,80').split(',').map(Number));
fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
