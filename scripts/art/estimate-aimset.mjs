// Measures the gun angle in every drawn aim frame (draw, sweep, lower) via PixelLab estimate-skeleton, so the game
// can show the drawn frame closest to the cursor. Saves public/art/skel/c<n>_aimset.json. usage: node scripts/art/estimate-aimset.mjs <n> ...
import { pl, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
// RIFLE=1: the two-handed long-gun frames in public/art/rifle (scripts/build-rifle.sh) -> c<n>_rifleset.json
const RIFLE = !!process.env.RIFLE;
const A = `${ROOT}/public/art/${RIFLE ? 'rifle' : 'anim'}/`;
for (const n of process.argv.slice(2)) {
  const out = `${ROOT}/public/art/skel/c${n}_${RIFLE ? 'rifleset' : 'aimset'}.json`;
  const files = fs.readdirSync(A).filter(f => new RegExp(`^c${n}_${RIFLE ? 'r' : ''}(draw_[34]|sweep_\\d+|lower_\\d+)\\.png$`).test(f));
  const res = [];
  for (const f of files) {
    const pad = `${A}_pad_${n}.png`;
    execFileSync('magick', [A + f, '-background', 'none', '-gravity', 'south', '-extent', '128x128', pad]);
    const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(pad).toString('base64'), format: 'png' } });
    fs.unlinkSync(pad);
    const k = Object.fromEntries(r.keypoints.map(p => [p.label, { x: p.x * 128, y: p.y * 128 }]));
    // muzzle-flash check: bright yellow/white pixels baked into the frame
    const bright = +execFileSync('magick', [A + f, '-alpha', 'off', '-fx', 'r>0.9&&g>0.82&&b>0.55?1:0', '-format', '%[fx:mean*w*h]', 'info:']).toString();
    res.push({ file: f, shoulder: k['RIGHT SHOULDER'], elbow: k['RIGHT ELBOW'], hand: k['RIGHT ARM'], lhand: k['LEFT ARM'], lelbow: k['LEFT ELBOW'], bright });
  }
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`c${n}: ${res.length} frames measured`);
}
