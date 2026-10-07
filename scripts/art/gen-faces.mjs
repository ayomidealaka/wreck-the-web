// Front-facing portraits for the character picker: PixelLab generate-image-v2 with the character's sprite as a
// subject reference, so it's the same person looking at the viewer. Saves 16 options per character for review.
// usage: node scripts/art/gen-faces.mjs <n> [<n> ...]
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const list = JSON.parse(fs.readFileSync(`${ROOT}/public/art/candidates/list.json`, 'utf8'));
for (const n of process.argv.slice(2)) {
  const desc = list[n - 1].desc;
  const ref = fs.readFileSync(`${ROOT}/public/art/candidates/c${n}.png`).toString('base64');
  console.log(`c${n}: credits before`, await balance());
  const job = await pl('POST', '/generate-image-v2', {
    description: `pixel art portrait, head and shoulders, front view facing the viewer and looking straight at the camera, centered, ${desc}, detailed shading, natural muted colours`,
    image_size: { width: 64, height: 64 }, no_background: true,
    reference_images: [{ image: { type: 'base64', base64: ref, format: 'png' }, size: { width: 40, height: 52 }, usage_description: 'the same person: keep the face, hair, skin tone, facial hair and clothes exactly' }],
  });
  let st;
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`c${n}: ${st.status} ${st.last_response?.error || ''}`); continue; }
  const imgs = st.last_response.images || [];
  imgs.forEach((im, k) => savePng(im.base64 || im, `${ROOT}/public/art/faces/options/c${n}_${k}.png`));
  console.log(`c${n}: ${imgs.length} portraits`, JSON.stringify(st.last_response.usage || st.usage));
}
