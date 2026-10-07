// Builds hand-designed skeleton poses (run cycle, jump) from a character's estimated skeleton and asks
// PixelLab to draw the character in exactly those poses (animate-with-skeleton-v3).
// usage: node scripts/art/skeleton-anim.mjs <id e.g. c1> <run|jump> "<what the character looks like>"
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';

const [id, kind, description] = process.argv.slice(2);
const DIR = `${ROOT}/public/art/skel/`;
const SIZE = 128;
const base = JSON.parse(fs.readFileSync(`${DIR}${id}_first.json`, 'utf8'));
const J = Object.fromEntries(base.map(k => [k.label, { x: k.x * SIZE, y: k.y * SIZE, z: k.z_index }]));
const rad = d => d * Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// body measurements from the standing pose
const legLen = s => ({ thigh: dist(J[`${s} HIP`], J[`${s} KNEE`]), shin: dist(J[`${s} KNEE`], J[`${s} LEG`]) });
const L = { RIGHT: legLen('RIGHT'), LEFT: legLen('LEFT') };
const thigh = Math.max(L.RIGHT.thigh, L.LEFT.thigh, 6), shin = Math.max(L.RIGHT.shin, L.LEFT.shin, 5);
const ground = Math.max(J['RIGHT LEG'].y, J['LEFT LEG'].y);
const hip0 = { x: (J['RIGHT HIP'].x + J['LEFT HIP'].x) / 2, y: (J['RIGHT HIP'].y + J['LEFT HIP'].y) / 2 };
const UPPER = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR', 'NECK', 'LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW', 'LEFT ARM', 'RIGHT ARM'];

// one pose: per-leg thigh angle (deg, + = forward/east) and knee bend (deg), whether feet stay grounded, torso lean (px)
function pose({ legs, grounded, lean = 0, drop = 0 }) {
  const leg = (side, [th, kn]) => {
    const hx = J[`${side} HIP`].x - hip0.x;
    const knee = { x: hx + Math.sin(rad(th)) * thigh, y: Math.cos(rad(th)) * thigh };
    const a = rad(th - kn); // shin bends backwards from the thigh
    const ankle = { x: knee.x + Math.sin(a) * shin, y: knee.y + Math.cos(a) * shin };
    return { side, hx, knee, ankle };
  };
  const ls = [leg('RIGHT', legs.near), leg('LEFT', legs.far)];
  // grounded: lowest foot touches the ground (gives the natural bob); airborne: hips stay where they stand
  const hipY = grounded ? ground - Math.max(...ls.map(l => l.ankle.y)) : hip0.y + drop;
  const dy = hipY - hip0.y;
  const out = [];
  for (const name of UPPER) out.push({ label: name, x: J[name].x + lean, y: J[name].y + dy, z: J[name].z });
  for (const l of ls) {
    out.push({ label: `${l.side} HIP`, x: hip0.x + l.hx, y: hipY, z: J[`${l.side} HIP`].z });
    out.push({ label: `${l.side} KNEE`, x: hip0.x + l.knee.x, y: hipY + l.knee.y, z: J[`${l.side} KNEE`].z });
    out.push({ label: `${l.side} LEG`, x: hip0.x + l.ankle.x, y: hipY + l.ankle.y, z: J[`${l.side} LEG`].z });
  }
  return { keypoints: out.map(k => ({ label: k.label, x: Math.min(1, Math.max(0, k.x / SIZE)), y: Math.min(1, Math.max(0, k.y / SIZE)), z_index: Math.round(k.z) })), bob: dy, lean };
}

// classic side-view run: thigh swings +-30 deg; knee folds high while the leg swings forward, straightens on contact
const runLeg = p => [30 * Math.sin(2 * Math.PI * p), 15 + 80 * Math.max(0, Math.cos(2 * Math.PI * p))];
// driven run: more forward lean, bigger knee lift
const driveLeg = p => [34 * Math.sin(2 * Math.PI * p), 18 + 92 * Math.max(0, Math.cos(2 * Math.PI * p))];
// fighting stance: feet apart (lead foot forward), knees bent, weight bouncing gently
const stance = k => { const b = Math.sin(2 * Math.PI * k / 8); return { near: [30, 30 + 8 * b], far: [-28, 12 + 6 * b] }; };
// "leap": the 6 poses from the commando jump sheet (public/art/ref), measured as joint angles and re-applied
// to this character's own leg lengths. RIGHT leg = near leg, LEFT leg = far leg (both sprites face east).
const leapPoses = (() => {
  const f = `${ROOT}/public/art/ref/commando_jump_poses.json`;
  if (!fs.existsSync(f)) return null;
  const deg = r => r * 180 / Math.PI;
  return JSON.parse(fs.readFileSync(f, 'utf8')).map((kp, i) => {
    const k = Object.fromEntries(kp.map(p => [p.label, { x: p.x, y: p.y }]));
    const leg = s => {
      const h = k[`${s} HIP`], kn = k[`${s} KNEE`], an = k[`${s} LEG`];
      const th = deg(Math.atan2(kn.x - h.x, kn.y - h.y)), sh = deg(Math.atan2(an.x - kn.x, an.y - kn.y));
      return [th, th - sh];
    };
    return pose({ legs: { near: leg('RIGHT'), far: leg('LEFT') }, grounded: i === 0 || i === 5, lean: 1.5 });
  });
})();
const FRAMES = {
  ...(leapPoses ? { leap: leapPoses } : {}),
  run: Array.from({ length: 8 }, (_, k) => pose({ legs: { near: runLeg(k / 8), far: runLeg(k / 8 + 0.5) }, grounded: true, lean: 1.5 })),
  drive: Array.from({ length: 8 }, (_, k) => pose({ legs: { near: driveLeg(k / 8), far: driveLeg(k / 8 + 0.5) }, grounded: true, lean: 3 })),
  stance: Array.from({ length: 8 }, (_, k) => pose({ legs: stance(k), grounded: true, lean: 1 })),
  jump: [
    pose({ legs: { near: [35, 70], far: [28, 62] }, grounded: true }),             // crouch
    pose({ legs: { near: [-4, 4], far: [-14, 8] }, grounded: false, drop: -1 }),     // take-off, legs straight
    pose({ legs: { near: [32, 62], far: [6, 40] }, grounded: false }),              // rising
    pose({ legs: { near: [48, 88], far: [24, 78] }, grounded: false }),             // top: knees up
    pose({ legs: { near: [14, 28], far: [-6, 18] }, grounded: false }),             // falling, legs reaching down
    pose({ legs: { near: [30, 58], far: [24, 52] }, grounded: true }),              // landing
  ],
};
const frames = FRAMES[kind];
if (!frames) throw new Error('kind must be run, drive, stance, jump or leap');
fs.writeFileSync(`${DIR}${id}_${kind}.json`, JSON.stringify(frames.map(f => ({ bob: f.bob, lean: f.lean })), null, 1));

if (process.env.DRY) { fs.writeFileSync(`${DIR}${id}_${kind}_poses.json`, JSON.stringify(frames.map(f => f.keypoints))); console.log('dry run: poses written'); process.exit(0); }
const first = { type: 'base64', base64: fs.readFileSync(`${DIR}${id}_first.png`).toString('base64'), format: 'png' };
console.log(`${id} ${kind}: credits before`, await balance());
for (let attempt = 1; attempt <= 4; attempt++) {
  const job = await pl('POST', '/animate-with-skeleton-v3', {
    description, action: { run: 'run', drive: 'sprint', stance: 'ready fighting stance', jump: 'jump', leap: 'jump' }[kind], direction: 'east', view: 'side',
    first_frame: first, first_frame_keypoints: base.map(k => ({ label: k.label, x: k.x, y: k.y, z_index: Math.round(k.z_index) })),
    keypoints: frames.map(f => f.keypoints), no_background: true,
  });
  let st;
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status === 'completed') {
    st.last_response.images.forEach((im, k) => savePng(im.base64 || im, `${DIR}${id}_${kind}_${k}.png`));
    console.log(`${id} ${kind}: ${st.last_response.images.length} frames`, JSON.stringify(st.last_response.usage || st.usage));
    break;
  }
  console.log(`${id} ${kind}: attempt ${attempt} ${st.status}: ${st.last_response?.error || JSON.stringify(st).slice(0, 200)}`);
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`${id} ${kind}: credits after`, await balance());
