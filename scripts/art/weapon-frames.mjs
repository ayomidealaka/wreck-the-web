// Redraws a character's aim frames holding a given weapon (PixelLab edit-animation-v2), keeping each pose, so every
// character really holds every weapon at every angle. Saves public/art/held/c<n>_<weapon>_<frame>.png.
// usage: node scripts/art/weapon-frames.mjs <n> <weapon>
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
export const HELD = {
  blaster: 'a compact gunmetal sci-fi blaster pistol with a small glowing cyan energy cell, held in one hand like a handgun, sized like a real pistol',
  minigun: 'a heavy rotary minigun with six barrels and a yellow ammo drum underneath, held at the hip with both hands',
  scatter: 'a pump-action shotgun with a dark steel barrel and a wooden pump and stock, held with both hands like a rifle',
  rocket: 'an olive green rocket launcher tube resting on the shoulder, held with both hands, rocket tip at the front',
  laser: 'a sleek black futuristic laser rifle with a glowing magenta core, held with both hands like a rifle',
  well: 'a chunky dark metal gravity gun with violet glowing coils and a swirling purple orb at the front, held with both hands',
  flamer: 'a flamethrower with a metal nozzle, pilot light and a small red fuel canister, held with both hands',
};
const [n, weapon] = process.argv.slice(2);
if (!HELD[weapon]) throw new Error('weapon must be one of ' + Object.keys(HELD).join(', '));
const cast = JSON.parse(fs.readFileSync(`${ROOT}/public/art/cast.json`, 'utf8'));
const ch = cast.find(c => c.id === `c${n}`); if (!ch?.aimset) throw new Error('no aimset for c' + n);
const who = JSON.parse(fs.readFileSync(`${ROOT}/public/art/candidates/list.json`, 'utf8'))[n - 1].desc;
const files = ch.aimset.map(r => r.file).slice(0, 16);
const OUT = `${ROOT}/public/art/held/`, TMP = `${OUT}_tmp_${n}_${weapon}.png`;
const frames = files.map(f => {
  execFileSync('magick', [`${ROOT}/public/art/anim/${f}`, '-background', 'none', '-gravity', 'south', '-extent', '64x64', TMP]);
  const b = fs.readFileSync(TMP).toString('base64');
  return { image: { type: 'base64', base64: b, format: 'png' }, size: { width: 64, height: 64 } };
});
fs.unlinkSync(TMP);
console.log(`c${n} ${weapon}: ${files.length} frames, credits before`, await balance());
for (let attempt = 1; attempt <= 3; attempt++) {
  const job = await pl('POST', '/edit-animation-v2', {
    description: `The person (${who}) now holds ${HELD[weapon]} instead of the small black pistol. Remove the pistol completely. The weapon points in the same direction the arms point in each frame. Keep the body, legs, head, face, hair, clothes, colours and pose of every frame exactly the same; only the hands and the weapon change. Side view, facing right, pixel art.`,
    frames, image_size: { width: 64, height: 64 }, no_background: true, seed: 300 + attempt,
  });
  let st;
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status === 'completed') {
    st.last_response.images.forEach((im, k) => savePng(im.base64 || im, `${OUT}c${n}_${weapon}_${files[k]}`));
    console.log(`c${n} ${weapon}: ${st.last_response.images.length} frames`, JSON.stringify(st.last_response.usage || st.usage));
    break;
  }
  console.log(`c${n} ${weapon}: attempt ${attempt} ${st.status} ${st.last_response?.error || ''}`);
}
console.log(`c${n} ${weapon}: credits after`, await balance());
