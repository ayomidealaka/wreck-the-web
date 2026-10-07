import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/cast-preview.html');
await p.waitForFunction(() => document.querySelectorAll('.card').length >= 7, { timeout: 60000 });
const data = await p.evaluate(async () => {
  const { loadManifest, CastCharacter } = await import('/js/cast.js');
  const list = await loadManifest(), out = {};
  for (const def of list) {
    const c = await new CastCharacter(def).load();
    const strip = (frames) => { const W = frames[0].width, H = Math.max(...frames.map(f => f.height)); const cv = document.createElement('canvas'); cv.width = W * frames.length; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, cv.width, H); frames.forEach((f, i) => g.drawImage(f, i * W, 0)); return cv.toDataURL(); };
    out[def.id] = { runFwd: strip(c.combo.fwd), runUp: strip(c.combo.upDiag), jump: c.jumpCombo.fwd ? strip(c.jumpCombo.fwd) : null, idle: strip(c.idleCombo.fwd) };
  }
  return out;
});
for (const [id, d] of Object.entries(data)) for (const [k, v] of Object.entries(d)) if (v) fs.writeFileSync(`${OUT}/dump_${id}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('dumped', Object.keys(data).join(' ')); await b.close(); process.exit(0);
