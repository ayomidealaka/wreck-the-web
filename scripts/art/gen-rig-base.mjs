// Test style pack: one character drawn by PixelLab Pro Flash in the style of public/art/ref/style_ref.png (high-detail
// pixel art, shown scaled down in game), standing side-on and empty-handed so it can be rigged.
// Saves public/art/packs/test/src/base_<seed>.png. usage: node scripts/art/gen-rig-base.mjs <seed> ...
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const SRC = `${ROOT}/public/art/packs/test/src/`;
const style = fs.readFileSync(SRC + 'style_native.png').toString('base64');
const DESC = 'full body pixel art character, side view facing right, standing upright, arms hanging relaxed at the sides, '
  + 'empty hands, no weapon. A rugged man with short messy black hair, an olive green gas mask over his mouth and nose, '
  + 'white button-up shirt with the sleeves rolled up to the elbows, black shoulder harness straps, dark charcoal trousers, '
  + 'black combat boots. Detailed shading, muted realistic colours, transparent background';
for (const seed of process.argv.slice(2).map(Number)) {
  const job = await pl('POST', '/create-image-pro-flash', {
    description: DESC, image_size: { width: 160, height: 256 }, no_background: true, seed,
    style_image: { image: { type: 'base64', base64: style, format: 'png' }, size: { width: 140, height: 236 }, usage_description: 'match this art style: detail level, shading, outline and proportions' },
    style_options: { color_palette: false, outline: true, detail: true, shading: true },
  });
  let st;
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`seed ${seed}: ${st.status}`, JSON.stringify(st.last_response || st).slice(0, 300)); continue; }
  const im = (st.last_response.images || [st.last_response.image])[0];
  savePng(im.base64 || im, `${SRC}base_${seed}.png`);
  console.log(`seed ${seed}: saved`, JSON.stringify(st.last_response.usage || st.usage || {}));
}
console.log('credits', await balance());
