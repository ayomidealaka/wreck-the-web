// Cuts a character drawing into rig parts (head, torso, upper/lower arms, thighs, shins) along its skeleton, so the
// game can pose each part: legs walk properly, the arms reach the weapon's grips, the head looks at the target.
// Works on an A-pose drawing (scripts/rig-pose.mjs), where the limbs stand clear of the body: head = above the chin,
// torso = the shoulder-hip quad, arms = outside it on each side (split at the elbow), legs = below the hips (split
// between the two legs and at the knee). Parts that get drawn over another also keep a small cap of the neighbouring
// part around their shared joint, so bending never opens a gap.
// Input: <pack>/src/<name>.png + <name>_skeleton.json. Output: <pack>/rig/*.png + rig.json.
// usage: node scripts/art/cut-rig.mjs public/art/packs/test [rigsrc]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const PACK = process.argv[2] || 'public/art/packs/test';
const SRC = `${PACK}/src/`, OUT = `${PACK}/rig/`, NAME = process.argv[3] || 'rigsrc';
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = execFileSync('magick', ['identify', '-format', '%w %h', SRC + NAME + '.png']).toString().split(' ').map(Number);
const px = execFileSync('magick', [SRC + NAME + '.png', '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 26 });
const K = Object.fromEntries(JSON.parse(fs.readFileSync(SRC + NAME + '_skeleton.json', 'utf8')).map(k => [k.label, { x: k.x * W, y: k.y * H }]));
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const op = (x, y) => px[(y * W + x) * 4 + 3] > 30;

// joints. RIGHT = the arm/leg on the image's left (his right: rear hand on the grip); LEFT = image right (front hand)
const neck = K['NECK'], hip = mid(K['RIGHT HIP'], K['LEFT HIP']);
let top = H; for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (op(x, y)) { top = y; break; }
let sole = 0; for (let y = H - 1; y >= 0 && !sole; y--) for (let x = 0; x < W; x++) if (op(x, y)) { sole = y + 1; break; }
const headTop = { x: (K['NOSE'].x + K['RIGHT EAR'].x) / 2, y: top + 4 };
// a wrist joint sits a little above the estimator's hand point; the bone runs on to the fingertips
const handEnd = (e, h) => ({ x: h.x + (h.x - e.x) * 0.3, y: h.y + (h.y - e.y) * 0.3 });
const footEnd = (k, a) => ({ x: a.x, y: sole - 1 });
const BONES = {
  head:   { a: neck, b: headTop, r: 13 },
  torso:  { a: neck, b: hip, r: 17 },
  uarmR:  { a: K['RIGHT SHOULDER'], b: K['RIGHT ELBOW'], r: 6 },
  larmR:  { a: K['RIGHT ELBOW'], b: handEnd(K['RIGHT ELBOW'], K['RIGHT ARM']), r: 6 },
  uarmL:  { a: K['LEFT SHOULDER'], b: K['LEFT ELBOW'], r: 6 },
  larmL:  { a: K['LEFT ELBOW'], b: handEnd(K['LEFT ELBOW'], K['LEFT ARM']), r: 6 },
  thighR: { a: K['RIGHT HIP'], b: K['RIGHT KNEE'], r: 9 },
  shinR:  { a: K['RIGHT KNEE'], b: K['RIGHT LEG'], r: 9 },
  footR:  { a: K['RIGHT LEG'], b: K['RIGHT LEG'], r: 9 },
  thighL: { a: K['LEFT HIP'], b: K['LEFT KNEE'], r: 9 },
  shinL:  { a: K['LEFT KNEE'], b: K['LEFT LEG'], r: 9 },
  footL:  { a: K['LEFT LEG'], b: K['LEFT LEG'], r: 9 },
};
// geometric classifier (see top)
const segDist = (p, { a, b }) => {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};
const S_R = K['RIGHT SHOULDER'], S_L = K['LEFT SHOULDER'], H_R = K['RIGHT HIP'], H_L = K['LEFT HIP'];
const chinY = K['NOSE'].y + (neck.y - K['NOSE'].y) * 0.5;
const side = (p, a, b) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);        // > 0: right of a->b (image coords)
const insideTorso = p => side(p, S_R, H_R) <= 3 * Math.hypot(H_R.x - S_R.x, H_R.y - S_R.y) && side(p, H_L, S_L) <= 3 * Math.hypot(S_L.x - H_L.x, S_L.y - H_L.y);
const proj = (p, a, b) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) ** 2 || 1);
const legX = (side, y) => { // x of a leg's polyline (hip -> knee -> ankle) at height y
  const h = K[`${side} HIP`], k = K[`${side} KNEE`], a = K[`${side} LEG`];
  const [p, q] = y < k.y ? [h, k] : [k, a]; return p.x + (q.x - p.x) * Math.max(0, Math.min(1, (y - p.y) / ((q.y - p.y) || 1)));
};
const classify = p => {
  if (p.y < chinY || (p.y < neck.y && Math.abs(p.x - neck.x) < 7)) return 'head';
  const hipY = Math.max(H_R.y, H_L.y);
  if (p.y < hipY + 1) {
    if (insideTorso(p)) return 'torso';
    const arm = p.x < (S_R.x + H_R.x) / 2 ? 'R' : 'L';
    const S = K[arm === 'R' ? 'RIGHT SHOULDER' : 'LEFT SHOULDER'], E = K[arm === 'R' ? 'RIGHT ELBOW' : 'LEFT ELBOW'], A = K[arm === 'R' ? 'RIGHT ARM' : 'LEFT ARM'];
    if (segDist(p, { a: S, b: A }) > 16) return 'torso';                    // harness ends, belt edges
    return proj(p, S, A) < proj(E, S, A) ? `uarm${arm}` : `larm${arm}`;
  }
  // the seat of the trousers just under the belt, between the hip joints, stays with the torso (drawn over the thigh
  // tops) so no gap opens between the legs when they angle in or swing
  const seatDepth = (K['RIGHT KNEE'].y - hipY) * 0.18;
  if (p.y < hipY + seatDepth && p.x > H_R.x - 3 && p.x < H_L.x + 3) {
    const tx = (p.y - hipY) / seatDepth;                                        // narrows towards the crotch
    const mid = (H_R.x + H_L.x) / 2, half = (H_L.x - H_R.x) / 2 + 3;
    if (Math.abs(p.x - mid) < half) return 'torso';                                   // flat-bottomed
  }
  // legs: whichever leg line is nearer at this height; thigh above the knee
  const leg = Math.abs(p.x - legX('RIGHT', p.y)) <= Math.abs(p.x - legX('LEFT', p.y)) ? 'R' : 'L', s2 = leg === 'R' ? 'RIGHT' : 'LEFT';
  if (p.y < K[`${s2} KNEE`].y) return `thigh${leg}`;
  return p.y < K[`${s2} LEG`].y - 2 ? `shin${leg}` : `foot${leg}`;            // the boot below the ankle is its own part
};
const names = Object.keys(BONES), owner = new Int16Array(W * H).fill(-1);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y)) owner[y * W + x] = names.indexOf(classify({ x: x + 0.5, y: y + 0.5 }));
// caps: the part drawn on top also gets the other part's pixels around their shared joint
const CAPS = [ // [part that gets the cap, part the pixels come from, joint, radius]
  ['larmR', 'uarmR', K['RIGHT ELBOW'], 5], ['larmL', 'uarmL', K['LEFT ELBOW'], 5],
  ['uarmR', 'torso', K['RIGHT SHOULDER'], 6], ['uarmL', 'torso', K['LEFT SHOULDER'], 6],
  ['shinR', 'thighR', K['RIGHT KNEE'], 6], ['shinL', 'thighL', K['LEFT KNEE'], 6],
  ['footR', 'shinR', K['RIGHT LEG'], 8], ['footL', 'shinL', K['LEFT LEG'], 8],
  ['thighR', 'torso', K['RIGHT HIP'], 9], ['thighL', 'torso', K['LEFT HIP'], 9],
  ['head', 'torso', neck, 5],
];
const rig = { size: { w: W, h: H }, top, sole, parts: {} };
for (const [i, n] of names.entries()) {
  const extra = CAPS.filter(c => c[0] === n);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const mine = (x, y) => owner[y * W + x] === i || extra.some(([, from, j, r]) => owner[y * W + x] === names.indexOf(from) && Math.hypot(x + 0.5 - j.x, y + 0.5 - j.y) <= r);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y) && mine(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) { console.log(n, 'empty'); continue; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (op(x, y) && mine(x, y)) px.copy(buf, ((y - y0) * w + (x - x0)) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4);
  execFileSync('magick', ['-size', `${w}x${h}`, '-depth', '8', 'rgba:-', `${OUT}${n}.png`], { input: buf });
  const B = BONES[n], loc = p => ({ x: +(p.x - x0).toFixed(1), y: +(p.y - y0).toFixed(1) });
  rig.parts[n] = { file: `${n}.png`, a: loc(B.a), b: loc(B.b), box: { x: x0, y: y0, w, h } };
  // forearms: where the fist grips; feet: the toe (front of the sole) so the foot can lie flat
  if (n.startsWith('larm')) rig.parts[n].grip = loc(K[n.endsWith('R') ? 'RIGHT ARM' : 'LEFT ARM']);
  if (n.startsWith('foot')) {
    let tx = -1; for (let x = x1; x >= x0 && tx < 0; x--) for (let y = y1 - 3; y <= y1; y++) if (op(x, y) && mine(x, y)) { tx = x; break; }
    rig.parts[n].b = loc({ x: tx + 0.5, y: y1 + 0.5 }); rig.parts[n].heel = loc({ x: x0 + 0.5, y: y1 + 0.5 });
  }
}
// joints in drawing coordinates, for building the skeleton in game
rig.joints = Object.fromEntries(Object.entries({ neck, hip, headTop, ...Object.fromEntries(Object.entries(K).map(([k, v]) => [k.toLowerCase().replace(/ /g, '_'), v])) })
  .map(([k, v]) => [k, { x: +v.x.toFixed(1), y: +v.y.toFixed(1) }]));
fs.writeFileSync(`${OUT}rig.json`, JSON.stringify(rig, null, 1));
console.log('parts:', Object.entries(rig.parts).map(([n, p]) => `${n} ${p.box.w}x${p.box.h}`).join(', '));
