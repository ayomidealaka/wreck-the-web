// Animate a sprite with PixelLab (animate-with-text-v3). Optional last frame for loops.
// usage: node scripts/art/animate.mjs <first.png> <outPrefix> "<action>" [frames] [last.png]
import { pl, savePng, balance } from './pixellab.mjs';
import fs from 'node:fs';
const [first, out, action, frames = '8', last] = process.argv.slice(2);
const img = f => ({ type: 'base64', base64: fs.readFileSync(f).toString('base64'), format: 'png' });
console.log('credits before', await balance());
for (let attempt = 1; attempt <= 4; attempt++) {
  const job = await pl('POST', '/animate-with-text-v3', { first_frame: img(first), ...(last ? { last_frame: img(last) } : {}), action, frame_count: +frames, no_background: true });
  let st;
  for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 4000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (st.status !== 'processing' && st.status !== 'pending' && st.status !== 'queued') break; }
  if (st.status === 'completed') {
    const imgs = st.last_response.images;
    imgs.forEach((im, k) => savePng(im.base64 || im, `${out}_${k}.png`));
    console.log('frames', imgs.length, 'usage', JSON.stringify(st.last_response.usage || st.usage));
    break;
  }
  console.log(`attempt ${attempt} ${st.status}: ${st.last_response?.error || ''}`);
  await new Promise(r => setTimeout(r, 20000));
}
console.log('credits after', await balance());
