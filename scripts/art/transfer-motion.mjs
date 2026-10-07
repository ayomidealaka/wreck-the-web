// Puts a character onto the reference run + jump animation (public/art/ref/motion) with PixelLab outfit transfer:
// the motion comes straight from the hand-drawn reference frames, the look from the character's sprite.
// usage: node scripts/art/transfer-motion.mjs <n> [weapon]
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [n, weapon = 'small black pistol'] = process.argv.slice(2);
const M = `${ROOT}/public/art/ref/motion/`, OUT = `${ROOT}/public/art/motion/`;
fs.mkdirSync(OUT, { recursive: true });
const b64 = f => fs.readFileSync(f).toString('base64');
const ref = `${OUT}c${n}_ref.png`;
const src = fs.existsSync(`${ROOT}/public/art/anim/raw/c${n}_draw_4.png`) ? `${ROOT}/public/art/anim/raw/c${n}_draw_4.png` : `${ROOT}/public/art/anim/c${n}_draw_4.png`;
execFileSync('magick', [src, '-trim', '+repage', '-background', 'none', '-gravity', 'south', '-extent', '64x64', ref]);
const who = JSON.parse(fs.readFileSync(`${ROOT}/public/art/candidates/list.json`, 'utf8'))[n - 1]?.desc || '';
const names = [0, 1, 2, 3, 4, 5].map(k => `run_${k}`).concat([0, 1, 2, 3, 4, 5].map(k => `jump_${k}`));
console.log(`c${n}: credits before`, await balance());
for (let attempt = 1; attempt <= 3; attempt++) {
  const job = await pl('POST', '/transfer-outfit-v2', {
    reference_image: { image: { type: 'base64', base64: b64(ref), format: 'png' }, size: { width: 64, height: 64 } },
    frames: names.map(f => ({ image: { type: 'base64', base64: b64(`${M}${f}.png`), format: 'png' }, size: { width: 64, height: 64 } })),
    image_size: { width: 64, height: 64 }, no_background: true, seed: 700 + attempt,
    additional_instructions: `The person is: ${who}. Redraw every frame as the person in the reference image: same face, hair, skin tone, clothes, colours and shoes. They hold a ${weapon} forward with both hands instead of the rifle. Keep each frame's exact pose, leg positions and motion. Side view, facing right. Frames 1-6 are a run cycle, frames 7-12 are a jump. Take ALL colours and clothing only from the reference image; ignore the colours and clothes of the input frames, use them only for the pose.${process.env.EXTRA ? ' ' + process.env.EXTRA : ''}`,
  });
  let st;
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status === 'completed') {
    st.last_response.images.forEach((im, k) => savePng(im.base64 || im, `${OUT}c${n}_${names[k]}.png`));
    console.log(`c${n}: ${st.last_response.images.length} frames`, JSON.stringify(st.last_response.usage || st.usage));
    break;
  }
  console.log(`c${n}: attempt ${attempt} ${st.status} ${st.last_response?.error || ''}`);
}
console.log(`c${n}: credits after`, await balance());
