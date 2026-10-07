// Two-handed long-gun hold, posed by skeleton: PixelLab draws the character (empty-handed) in exactly these arm
// positions, at 8 aim angles. Near arm: elbow tucked down, hand on the grip just in front of the chest. Far arm:
// reaching forward, hand under the barrel. The whole hold pivots on the near shoulder (stock in the shoulder).
// Saves public/art/rifle/c<n>_rs_<k>.png + c<n>_rs.json (angle, rear/front hand per frame, 128px canvas coords).
// usage: node scripts/art/rifle-skeleton.mjs <n> ...     (DRY=1: poses only)
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const SIZE = 128, ANGLES = [-70, -50, -30, -15, 0, 20, 40, 65];
const SK = `${ROOT}/public/art/skel/`, OUT = `${ROOT}/public/art/rifle/`, A = `${ROOT}/public/art/anim/`;
const list = JSON.parse(fs.readFileSync(`${ROOT}/public/art/candidates/list.json`, 'utf8'));
for (const n of process.argv.slice(2)) {
  const src = fs.existsSync(`${A}c${n}_plain.png`) ? `${A}c${n}_plain.png` : `${A}c${n}_base.png`;
  const first = `${SK}c${n}_rbase.png`, firstJ = `${SK}c${n}_rbase.json`;
  execFileSync('magick', [src, '-background', 'none', '-gravity', 'south', '-extent', `${SIZE}x${SIZE}`, first]);
  if (!fs.existsSync(firstJ)) {
    const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(first).toString('base64'), format: 'png' } });
    fs.writeFileSync(firstJ, JSON.stringify(r.keypoints, null, 1));
  }
  const base = JSON.parse(fs.readFileSync(firstJ, 'utf8'));
  const J = Object.fromEntries(base.map(k => [k.label, { x: k.x * SIZE, y: k.y * SIZE, z: k.z_index }]));
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const upper = Math.max(6.5, d(J['RIGHT SHOULDER'], J['RIGHT ELBOW'])), fore = Math.max(6, d(J['RIGHT ELBOW'], J['RIGHT ARM']));
  const S = J['RIGHT SHOULDER'], F = J['LEFT SHOULDER'];
  const rot = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const frames = ANGLES.map(deg => {
    const a = deg * Math.PI / 180, at = (o, p) => { const r = rot(p, a); return { x: o.x + r.x, y: o.y + r.y }; };
    // level hold, relative to the near shoulder, scaled to this character's arm
    const k = (upper + fore) / 14;
    const nearElbow = at(S, { x: 2 * k, y: 7 * k }), rear = at(S, { x: 8 * k, y: 3 * k });
    const farElbow = at(S, { x: 10 * k, y: 6 * k }), front = at(S, { x: 16 * k, y: 1.5 * k });
    const kp = base.map(p => ({ label: p.label, x: p.x * SIZE, y: p.y * SIZE, z_index: Math.round(p.z_index) }));
    const set = (label, p) => { const q = kp.find(x => x.label === label); q.x = p.x; q.y = p.y; };
    set('RIGHT ELBOW', nearElbow); set('RIGHT ARM', rear); set('LEFT ELBOW', farElbow); set('LEFT ARM', front);
    return { deg, rear, front, keypoints: kp.map(p => ({ ...p, x: Math.min(1, Math.max(0, p.x / SIZE)), y: Math.min(1, Math.max(0, p.y / SIZE)) })) };
  });
  fs.writeFileSync(`${OUT}c${n}_rs.json`, JSON.stringify(frames.map((f, k) => ({ file: `c${n}_rs_${k}.png`, angle: +(f.deg * Math.PI / 180).toFixed(3),
    rear: { x: +f.rear.x.toFixed(1), y: +f.rear.y.toFixed(1) }, front: { x: +f.front.x.toFixed(1), y: +f.front.y.toFixed(1) } })), null, 1));
  if (process.env.DRY) { console.log(`c${n}: poses written`); continue; }
  const desc = list.find(c => c.file === `c${n}.png`)?.desc || 'a person';
  const job = await pl('POST', '/animate-with-skeleton-v3', {
    description: `${desc}, both hands empty, holding nothing, hands positioned as if gripping a rifle`, action: 'aiming a rifle', direction: 'east', view: 'side',
    first_frame: { type: 'base64', base64: fs.readFileSync(first).toString('base64'), format: 'png' },
    first_frame_keypoints: base.map(k => ({ label: k.label, x: k.x, y: k.y, z_index: Math.round(k.z_index) })),
    keypoints: frames.map(f => f.keypoints), no_background: true,
  });
  let st;
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`c${n}: ${st.status} ${st.last_response?.error || ''}`); continue; }
  st.last_response.images.forEach((im, k) => savePng(im.base64 || im, `${OUT}c${n}_rs_${k}.png`));
  console.log(`c${n}: ${st.last_response.images.length} frames`, JSON.stringify(st.last_response.usage || st.usage));
}
console.log('credits', await balance());
