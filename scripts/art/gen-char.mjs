// A new character in Ash's style: PixelLab Pro Flash edits Ash's own base drawing (public/art/packs/test/src/base.png)
// into the character described in scripts/art/characters.json, guided by its reference cut-out, so the side-on pose,
// proportions and pixel style carry over and the result can be rigged the same way.
// Saves public/art/packs/test/chars/<id>/src/base_<method>_<seed>.png.
// usage: node scripts/art/gen-char.mjs <id> <text|reference> <seed> [seed ...]
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const [id, method = 'reference', ...seeds] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(`${ROOT}/scripts/art/characters.json`, 'utf8'));
const ch = cfg.characters.find(c => c.id === id);
if (!ch || !['text', 'reference'].includes(method) || !seeds.length) throw new Error('usage: gen-char.mjs <id> <text|reference> <seed> ...');
const PACK = `${ROOT}/public/art/packs/test`, OUT = `${PACK}/chars/${id}/src/`;
const b64 = f => fs.readFileSync(f).toString('base64');
const description = `Turn this character into ${ch.look}. ${cfg.same}`;
for (const seed of seeds.map(Number)) {
  const job = await pl('POST', '/edit-image-pro-flash', {
    image: { type: 'base64', base64: b64(`${PACK}/src/base.png`), format: 'png' },
    method, description, no_background: true, seed,
    ...(method === 'reference' ? { reference_image: { type: 'base64', base64: b64(`${ROOT}/public/art/ref/chars/${ch.ref}`), format: 'png' } } : {}),
  });
  let st;
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`${id} ${method} ${seed}: ${st.status}`, JSON.stringify(st.last_response || st).slice(0, 300)); continue; }
  const r = st.last_response, im = (r.images || [r.image])[0];
  savePng(im.base64 || im, `${OUT}base_${method}_${seed}.png`);
  console.log(`${ch.name} (${id}) ${method} seed ${seed}: saved`);
}
console.log('generations left', await balance());
