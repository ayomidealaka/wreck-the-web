// Re-poses a style pack's base drawing into a rigging A-pose by skeleton (PixelLab animate-with-skeleton-v3): arms
// angled out and down away from the body, legs a little wider apart, so every part stands clear for cutting.
// Frames: A-pose at three arm angles (the clearest one is used). Saves <pack>/src/apose_<k>.png + apose.json (the
// requested skeletons, which become the rig's joints).
// usage: node scripts/art/rig-pose.mjs public/art/packs/test "<character description>"
import { pl, savePng, balance } from './pixellab.mjs';
import fs from 'node:fs';
const [PACK = 'public/art/packs/test', DESC = 'a man'] = process.argv.slice(2);
const SRC = `${PACK}/src/`;
const base = JSON.parse(fs.readFileSync(SRC + 'base_skeleton.json', 'utf8'));
const W = 160, H = 256;
const J = Object.fromEntries(base.map(k => [k.label, { x: k.x * W, y: k.y * H }]));
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const frames = [30, 40, 22].map(deg => {
  const a = deg * Math.PI / 180, kp = base.map(k => ({ label: k.label, x: k.x * W, y: k.y * H, z_index: Math.round(k.z_index) }));
  const set = (l, p) => Object.assign(kp.find(k => k.label === l), p);
  for (const [side, dir] of [['RIGHT', -1], ['LEFT', 1]]) {
    const S = J[`${side} SHOULDER`], up = d(S, J[`${side} ELBOW`]), lo = d(J[`${side} ELBOW`], J[`${side} ARM`]);
    // arm straight, angled `deg` below horizontal, out to its own side
    const ux = Math.cos(a) * dir, uy = Math.sin(a);
    set(`${side} ELBOW`, { x: S.x + ux * up, y: S.y + uy * up });
    set(`${side} ARM`, { x: S.x + ux * (up + lo), y: S.y + uy * (up + lo) });
    // feet a little further apart
    const spread = dir * 8;
    set(`${side} KNEE`, { x: J[`${side} KNEE`].x + spread * 0.5, y: J[`${side} KNEE`].y });
    set(`${side} LEG`, { x: J[`${side} LEG`].x + spread, y: J[`${side} LEG`].y });
  }
  return { deg, keypoints: kp };
});
fs.writeFileSync(SRC + 'apose.json', JSON.stringify(frames.map(f => ({ deg: f.deg, keypoints: f.keypoints.map(k => ({ label: k.label, x: +k.x.toFixed(1), y: +k.y.toFixed(1) })) })), null, 1));
const norm = kp => kp.map(k => ({ label: k.label, x: Math.min(1, Math.max(0, k.x / W)), y: Math.min(1, Math.max(0, k.y / H)), z_index: k.z_index }));
console.log('credits before', await balance());
const job = await pl('POST', '/animate-with-skeleton-v3', {
  description: `${DESC}, standing in an A-pose for rigging, arms held straight out and down away from the body, empty hands closed into fists, legs apart`,
  action: 'standing in an A-pose', direction: 'east', view: 'side',
  first_frame: { type: 'base64', base64: fs.readFileSync(SRC + 'base.png').toString('base64'), format: 'png' },
  first_frame_keypoints: base.map(k => ({ label: k.label, x: k.x, y: k.y, z_index: Math.round(k.z_index) })),
  keypoints: frames.map(f => norm(f.keypoints)), no_background: true,
});
let st;
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
if (st.status !== 'completed') { console.log('failed', st.status, JSON.stringify(st.last_response || st).slice(0, 400)); process.exit(1); }
st.last_response.images.forEach((im, k) => savePng(im.base64 || im, `${SRC}apose_${k}.png`));
console.log('frames', st.last_response.images.length, JSON.stringify(st.last_response.usage || st.usage || {}));
console.log('credits after', await balance());
