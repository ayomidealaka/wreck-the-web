// Lists each character's usable long-gun frames after processing (file: angle in degrees). usage: node scripts/art/dump-rifleset.mjs
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
console.log(await p.evaluate(async () => {
  const { loadManifest, CastCharacter } = await import('/js/cast.js');
  const out = [];
  for (const def of await loadManifest()) {
    const c = await new CastCharacter(def).load();
    out.push(`${def.id}: ` + (c.rifleset || []).map(e => `${e.file.replace(/^c\d+_rs_/, '').replace('.png', '')}:${Math.round(e.angle * 57.3)}`).join(' '));
  }
  return out.join('\n');
}));
await b.close();
