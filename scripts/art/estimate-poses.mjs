// Estimates the skeleton of every aim pose (PixelLab estimate-skeleton, 0.1 generation each) so the game knows
// where each character's elbow and gun hand are. Saves public/art/skel/<id>_aims.json. usage: node scripts/art/estimate-poses.mjs
import { pl, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const cast = JSON.parse(fs.readFileSync(`${ROOT}/public/art/cast.json`, 'utf8'));
const tmp = `${ROOT}/public/art/skel/_pad.png`;
await Promise.all(cast.map(async ch => {
  const out = `${ROOT}/public/art/skel/${ch.id}_aims.json`;
  if (fs.existsSync(out)) return;
  const res = {};
  for (const [aim, file] of Object.entries(ch.aim)) {
    const pad = `${ROOT}/public/art/skel/_pad_${ch.id}_${aim}.png`;
    execFileSync('magick', [`${ROOT}/public/art/anim/${file}`, '-background', 'none', '-gravity', 'south', '-extent', '128x128', pad]);
    const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(pad).toString('base64'), format: 'png' } });
    fs.unlinkSync(pad);
    const k = Object.fromEntries(r.keypoints.map(p => [p.label, { x: p.x * 128, y: p.y * 128 }]));
    res[aim] = { shoulder: k['RIGHT SHOULDER'], elbow: k['RIGHT ELBOW'], hand: k['RIGHT ARM'], farElbow: k['LEFT ELBOW'], farHand: k['LEFT ARM'] };
  }
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(ch.id, Object.entries(res).map(([a, r]) => `${a}: hand ${r.hand.x.toFixed(0)},${r.hand.y.toFixed(0)}`).join(' | '));
}));
