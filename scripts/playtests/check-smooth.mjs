// Smoothness check for a rigged run: steps the cycle at 60 fps and reports, per joint, the largest per-frame jump and
// the typical (median) one. A glitch shows up as a max far above the median. usage: node scripts/playtests/check-smooth.mjs [pack]
import puppeteer from 'puppeteer-core';
const PACK = process.argv[2] || 'test';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
console.log(await p.evaluate(async PACK => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const c = await new RigCharacter((await loadManifest((await loadPacks()).find(x => x.id === PACK)))[0]).load();
  const pts = P => ({ hip: P.hip, kneeR: P.legs.R.knee, ankleR: P.legs.R.ankle, kneeL: P.legs.L.knee, ankleL: P.legs.L.ankle, shoulder: P.sR });
  const steps = [], N = Math.round(2 / 1.9 * 60);
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const P = c.pose({ x: 0, y: 0, facing: 1, t: i / 60, aim: 0, onGround: true, moving: true, speed: 1, runT: i / 60, landT: 0 }, null), q = pts(P);
    if (prev) steps.push(Object.fromEntries(Object.keys(q).map(k => [k, Math.hypot(q[k].x - prev[k].x, q[k].y - prev[k].y)])));
    prev = q;
  }
  return Object.keys(prev).map(k => { const v = steps.map(s => s[k]).sort((a, b) => a - b); return `${k.padEnd(8)} median ${v[v.length >> 1].toFixed(2)}  max ${v[v.length - 1].toFixed(2)} (drawing px / frame)`; }).join('\n');
}, PACK));
await b.close();
