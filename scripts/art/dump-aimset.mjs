// Prints each processed aim frame (after the pistol erase) for a character: file, labelled vs measured angle, hand.
// usage: node scripts/art/dump-aimset.mjs c2
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
const out = await p.evaluate(async id => {
  const { loadManifest, CastCharacter } = await import('/js/cast.js');
  const def = (await loadManifest()).find(d => d.id === id), lab = Object.fromEntries(def.aimset.map(r => [r.file, r.angle]));
  const c = await new CastCharacter(def).load();
  return [c.shoulder, c.armReach, c.aimset.map(e => `${e.file.padEnd(16)} label ${(lab[e.file] * 57.3).toFixed(0).padStart(4)}  real ${(e.angle * 57.3).toFixed(0).padStart(4)}  hand ${(e.muzzle.x - Math.cos(e.angle) * 5).toFixed(0)},${(e.muzzle.y - Math.sin(e.angle) * 5).toFixed(0)}`)];
}, process.argv[2]);
console.log(JSON.stringify(out[0]), out[1]); console.log(out[2].join('\n')); await b.close();
