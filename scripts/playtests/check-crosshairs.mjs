// Every weapon's crosshair on a white strip and a dark strip, at rest and mid-recoil. usage: node scripts/playtests/check-crosshairs.mjs out.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async () => {
  const { drawCrosshair } = await import('/js/crosshair.js');
  const { WEAPONS } = await import('/js/weapons.js');
  const n = WEAPONS.length, cw = 80, Z = 3, cv = document.createElement('canvas'); cv.width = n * cw * Z; cv.height = 4 * 70 * Z;
  const g = cv.getContext('2d'); g.scale(Z, Z); g.imageSmoothingEnabled = false;
  ['#FFFFFF', '#FFFFFF', '#16121F', '#16121F'].forEach((c, r) => { g.fillStyle = c; g.fillRect(0, r * 70, n * cw, 70); });
  WEAPONS.forEach((w, i) => [0, 1, 0, 1].forEach((kick, r) => drawCrosshair(g, i * cw + cw / 2, r * 70 + 35, w, { t: 0.3, kick })));
  g.font = '9px sans-serif'; g.fillStyle = '#888'; WEAPONS.forEach((w, i) => g.fillText(w.id, i * cw + 4, 10));
  return cv.toDataURL();
});
fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64')); await b.close();
