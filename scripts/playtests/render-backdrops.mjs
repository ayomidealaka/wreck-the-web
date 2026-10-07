// Renders each of the four worlds on its own (no page over it), a 1280x800 view, for a look at them.
// usage: node scripts/playtests/render-backdrops.mjs <out>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' });
for (const theme of ['synth', 'dusk', 'sunny', 'space']) {
  const data = await p.evaluate(async theme => {
    const { Backdrop } = await import('/js/backdrop.js');
    const W = 1280, H = 800, B = new Backdrop(W, 6000, 7, { theme });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    B.draw(g, { x: 0, y: 0, w: W, h: H });
    return c.toDataURL('image/png');
  }, theme);
  fs.writeFileSync(`${OUT}/world_${theme}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('rendered', theme);
}
await b.close(); process.exit(0);
