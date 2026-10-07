// Hip position in every transferred run/jump frame (PixelLab estimate-skeleton), so the game can line the frames
// up with the aim poses. Saves public/art/motion/c<n>_motion.json. usage: node scripts/art/estimate-motion.mjs <n> ...
import { pl, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = `${ROOT}/public/art/motion/`;
for (const n of process.argv.slice(2)) {
  const out = {};
  for (const f of [0, 1, 2, 3, 4, 5].map(k => `run_${k}`).concat([0, 1, 2, 3, 4, 5].map(k => `jump_${k}`))) {
    const pad = `${D}_pad_${n}_${f}.png`;
    execFileSync('magick', [`${D}c${n}_${f}.png`, '-background', 'none', '-gravity', 'center', '-extent', '128x128', pad]);
    const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(pad).toString('base64'), format: 'png' } });
    fs.unlinkSync(pad);
    const k = Object.fromEntries(r.keypoints.map(p => [p.label, { x: p.x * 128 - 32, y: p.y * 128 - 32 }])); // back to 64x64 coords
    out[f] = { hip: { x: (k['RIGHT HIP'].x + k['LEFT HIP'].x) / 2, y: (k['RIGHT HIP'].y + k['LEFT HIP'].y) / 2 } };
  }
  fs.writeFileSync(`${D}c${n}_motion.json`, JSON.stringify(out, null, 1));
  console.log(`c${n}:`, Object.entries(out).map(([f, v]) => `${f}@${v.hip.x.toFixed(0)},${v.hip.y.toFixed(0)}`).join(' '));
}
