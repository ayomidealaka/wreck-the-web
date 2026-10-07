// All twelve rank medals on one sheet, at 4x. usage: node scripts/playtests/render-badges.mjs <out.png>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' });
const data = await p.evaluate(async () => {
  const { badgeCanvas, RANKS } = await import('/js/badges.js');
  const S = 4, cell = 32 * S + 24, cols = 6, c = document.createElement('canvas'); c.width = cols * cell; c.height = 2 * (cell + 26);
  const g = c.getContext('2d'); g.fillStyle = '#1A1526'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
  RANKS.forEach((r, i) => {
    const x = (i % cols) * cell + 12, y = Math.floor(i / cols) * (cell + 26) + 8;
    g.drawImage(badgeCanvas(i, S), x, y);
    g.fillStyle = '#F4EFFA'; g.font = '700 13px monospace'; g.textAlign = 'center'; g.fillText(`${i + 1}. ${r.name}`, x + 16 * S, y + 32 * S + 18);
  });
  return c.toDataURL();
});
fs.writeFileSync(OUT, Buffer.from(data.split(',')[1], 'base64'));
await b.close(); process.exit(0);
