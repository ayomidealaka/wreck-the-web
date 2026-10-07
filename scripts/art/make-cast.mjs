// Writes public/art/cast.json from the generated frames.
// Aim poses come from PICKS (chosen by eye from labelled frame sheets). Characters without picks fall back
// to measuring the gun angle in every candidate frame and taking the closest to each target.
import fs from 'node:fs';
import zlib from 'node:zlib';

const A = new URL('../public/art/anim/', import.meta.url).pathname;
const SK = A.replace('anim/', 'skel/'), MO = A.replace('anim/', 'motion/'), FA = A.replace('anim/', 'faces/');
const NAMES = { 1: 'Dre', 2: 'Lucia', 3: 'Walt', 4: 'Mei', 5: 'Arjun', 6: 'Nia', 8: 'Hazmat', 9: 'Sarge' };
const TARGETS = { up: 90, upDiag: 45, fwd: 0, downDiag: -45, down: -80 };
// poses picked by eye from the labelled frame sheets (s = aim sweep frame, L = lower-the-gun frame)
// Gun angles read by eye off the frame sheet (degrees, + = down), for characters whose skeleton calibration is off
// (Sarge's skeleton anchors come from his old rifle-holding sprite). The game refines these from the pixels.
const MANUAL_ANGLES = {
  9: { draw_4: 0, sweep_1: -3, sweep_2: -5, sweep_3: -10, sweep_4: -30, sweep_5: -50, sweep_6: -70, sweep_7: -85, sweep_9: -75,
    sweep_10: -55, sweep_11: -25, sweep_12: -8, lower_1: 8, lower_2: 12, lower_3: 25, lower_4: 50, lower_5: 70, lower_6: 80, lower_7: 85 },
};
const PICKS = {
  1: { upDiag: 's4', up: 's7', downDiag: 's11', down: 's12' },
  2: { upDiag: 's3', up: 's6', downDiag: 'L4', down: 'L6' },
  3: { upDiag: 's3', up: 's7', downDiag: 'L4', down: 'L6' },
  4: { upDiag: 's4', up: 's6', downDiag: 'L4', down: 'L6' },
  5: { upDiag: 's4', up: 's8', downDiag: 'L4', down: 'L5' },
  6: { upDiag: 's9', up: 's6', downDiag: 'L4', down: 'L5' },
  8: { upDiag: 's4', up: 's7', downDiag: 'L4', down: 'L6' },
  9: { upDiag: 's5', up: 's7', downDiag: 'L4', down: 'L6' },
};
const OVERRIDES = Object.fromEntries(Object.entries(PICKS).map(([i, p]) => [i, Object.fromEntries(Object.entries(p).map(([k, v]) =>
  [k, `c${i}_${v[0] === 's' ? 'sweep' : 'lower'}_${v.slice(1)}.png`]))]));

// minimal PNG reader (8-bit RGBA / RGB, non-interlaced) -> { w, h, px: Uint8Array RGBA }
function readPng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h, ct, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : null;
  if (!bpp) throw new Error(`${file}: unsupported PNG colour type ${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = k < bpp ? cur[x * bpp + k] : 255;
    prev = cur;
  }
  return { w, h, px: out };
}

// shoulder, gun tip and gun angle for one frame (measured against the forward pose's body)
function analyse(img, ref) {
  const { w, h, px } = img, op = (x, y) => px[(y * w + x) * 4 + 3] > 40;
  let top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (op(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const R = ref || { top, bottom, height: bottom - top + 1 };
  const chest = Math.round(R.top + R.height * 0.42);
  let l = -1, r = -1; for (let x = 0; x < w; x++) if (op(x, chest)) { if (l < 0) l = x; r = x; }
  const cx = ref ? ref.cx : (l + r) / 2, sh = { x: cx, y: R.top + R.height * 0.27 };
  let tip = null, best = -1, bright = 0;
  for (let y = 0; y <= Math.min(h - 1, R.top + R.height * 0.7); y++) for (let x = Math.floor(cx); x < w; x++) {
    if (!op(x, y)) continue;
    const d = Math.hypot(x - sh.x, y - sh.y); if (d > best) { best = d; tip = { x, y }; }
    const i = (y * w + x) * 4; if (px[i] > 230 && px[i + 1] > 210 && px[i + 2] > 150) bright++;
  }
  const angle = tip ? Math.atan2(-(tip.y - sh.y), tip.x - sh.x) * 180 / Math.PI : 0;
  return { top, bottom, height: bottom - top + 1, cx, angle, reach: best, bright };
}

const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const seq = (i, pre, ks) => ks.map(k => `c${i}_${pre}_${k}.png`);
const K6 = [0, 1, 2, 3, 4, 5], K8 = [0, 1, 2, 3, 4, 5, 6, 7];

const cast = [];
for (const [i, name] of Object.entries(NAMES)) {
  const refFile = `c${i}_draw_4.png`;
  if (!fs.existsSync(A + refFile)) { console.log(`skip c${i} (${name}): no draw frame`); continue; }

  // five aim poses (picked by eye, else measured)
  const ref = analyse(readPng(A + refFile));
  const pool = fs.readdirSync(A).filter(f => new RegExp(`^c${i}_(draw_[34]|sweep_\\d+|lower_\\d+)\\.png$`).test(f));
  const scored = pool.map(f => ({ f, ...analyse(readPng(A + f), ref) }));
  const aim = {};
  for (const [k, t] of Object.entries(TARGETS)) {
    if (k === 'fwd') { aim.fwd = refFile; continue; }
    aim[k] = scored.map(s => ({ ...s, cost: Math.abs(s.angle - t) + Math.max(0, s.bright - ref.bright - 2) * 15 + (s.reach < ref.reach * 0.6 ? 25 : 0) }))
      .sort((a, b) => a.cost - b.cost)[0].f;
  }
  Object.assign(aim, OVERRIDES[i] || {});

  // text-animated loops (fallback when skeleton frames are missing)
  const run = seq(i, 'cloop', [1, 2, 3, 4, 5, 6, 7, 8]), idle = seq(i, 'idle', [1, 2, 3, 4, 5, 6, 7, 8]), jump = seq(i, 'jump', [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const missing = [...run, ...idle].filter(f => !fs.existsSync(A + f));
  if (missing.length) { console.log(`skip c${i} (${name}): ${missing.length} frames missing`); continue; }

  // skeleton-posed frames: run (driven run preferred), stance, jump, leap
  const sk = n => fs.existsSync(SK + n);
  let skel = null;
  if (sk(`c${i}_run_7.png`) && sk(`c${i}_jump_5.png`) && sk(`c${i}_first.json`)) {
    const kp = json(SK + `c${i}_first.json`), at = l => kp.find(k => k.label === l);
    const r = sk(`c${i}_drive_7.png`) ? 'drive' : 'run';
    skel = {
      size: 128, hipY: (at('RIGHT HIP').y + at('LEFT HIP').y) / 2 * 128,
      shoulder: { x: at('RIGHT SHOULDER').x * 128, y: at('RIGHT SHOULDER').y * 128 },
      run: seq(i, r, K8), runMeta: json(SK + `c${i}_${r}.json`),
      ...(sk(`c${i}_stance_7.png`) ? { stance: seq(i, 'stance', K8), stanceMeta: json(SK + `c${i}_stance.json`) } : {}),
      jump: seq(i, 'jump', K6), jumpMeta: json(SK + `c${i}_jump.json`),
      ...(sk(`c${i}_leap_5.png`) ? { leap: seq(i, 'leap', K6), leapMeta: json(SK + `c${i}_leap.json`) } : {}),
    };
  }

  // measured elbow/hand per aim pose (scripts/estimate-poses.mjs)
  const arms = sk(`c${i}_aims.json`) ? json(SK + `c${i}_aims.json`) : null;

  // hand-drawn reference motion transferred onto this character (scripts/transfer-motion.mjs + estimate-motion.mjs)
  const mo = n => fs.existsSync(MO + n);
  let motion = null;
  if (mo(`c${i}_run_5.png`) && mo(`c${i}_jump_5.png`) && mo(`c${i}_motion.json`) && skel) {
    const kp = json(SK + `c${i}_first.json`), hx = l => kp.find(k => k.label === l).x * 128;
    motion = { hipX: (hx('RIGHT HIP') + hx('LEFT HIP')) / 2, meta: json(MO + `c${i}_motion.json`), run: seq(i, 'run', K6), jump: seq(i, 'jump', K6) };
  }

  // every drawn aim frame with its gun angle (scripts/estimate-aimset.mjs): the game shows the closest one.
  // The skeleton estimator under-reads steep angles, so measured shoulder->hand angles are calibrated against the
  // five poses checked by eye (up -90, up-diagonal -45, forward 0, down-diagonal 45, down 80; screen space, + = down).
  let aimset = null;
  if (sk(`c${i}_aimset.json`)) {
    const raw = json(SK + `c${i}_aimset.json`), base = raw.find(r => r.file === refFile);
    const meas = r => Math.atan2(r.hand.y - r.shoulder.y, r.hand.x - r.shoulder.x) * 180 / Math.PI;
    const byFile = Object.fromEntries(raw.map(r => [r.file, r]));
    const anchors = [['up', -90], ['upDiag', -45], ['fwd', 0], ['downDiag', 45], ['down', 80]]
      .filter(([k]) => byFile[aim[k]]).map(([k, t]) => [meas(byFile[aim[k]]), t]).sort((a, b) => a[0] - b[0]);
    const mono = anchors.filter((x, j) => j === 0 || x[1] > anchors[j - 1][1]);   // keep anchors that stay in order
    const calib = m => {
      if (m <= mono[0][0]) return mono[0][1] + (m - mono[0][0]);
      for (let j = 1; j < mono.length; j++) if (m <= mono[j][0]) {
        const [m0, t0] = mono[j - 1], [m1, t1] = mono[j];
        return t0 + (t1 - t0) * (m - m0) / ((m1 - m0) || 1);
      }
      const last = mono[mono.length - 1]; return last[1] + (m - last[0]);
    };
    const man = MANUAL_ANGLES[i], rows = man ? raw.filter(r => man[r.file.replace(`c${i}_`, '').replace('.png', '')] != null).map(r => {
      const rad = man[r.file.replace(`c${i}_`, '').replace('.png', '')] * Math.PI / 180;
      return { file: r.file, angle: rad, muzzle: { x: r.hand.x + Math.cos(rad) * 5, y: r.hand.y + Math.sin(rad) * 5 } };
    }).sort((a, b) => a.angle - b.angle) : raw.filter(r => r.file === refFile || r.bright <= (base?.bright || 0) + Math.max(3, (base?.bright || 0) * 0.5))  // no baked-in muzzle flashes (relative to the character's own highlights)
      .map(r => {
        const a = r.file === refFile ? 0 : Math.max(-95, Math.min(95, calib(meas(r)))), rad = a * Math.PI / 180;
        return { file: r.file, angle: rad, muzzle: { x: r.hand.x + Math.cos(rad) * 5, y: r.hand.y + Math.sin(rad) * 5 } };
      }).sort((a, b) => a.angle - b.angle);
    const kept = [];
    for (const r of rows) {
      const prev = kept[kept.length - 1];
      if (!prev || r.angle - prev.angle > 0.07) kept.push(r);
      else if (r.file === refFile) kept[kept.length - 1] = r;                    // the forward pose wins a tie
    }
    aimset = kept.map(r => ({ file: r.file, angle: +r.angle.toFixed(3), muzzle: { x: +r.muzzle.x.toFixed(1), y: +r.muzzle.y.toFixed(1) } }));
  }

  // two-handed long-gun hold (scripts/rifle-skeleton.mjs): frames posed by skeleton at 8 aim angles, with the requested
  // rear (grip) and front (barrel) hand positions. The game swaps the generated rifle for the selected weapon.
  const RF = A.replace('anim/', 'rifle/');
  let rifleset = null;
  if (fs.existsSync(RF + `c${i}_rs.json`)) {
    rifleset = json(RF + `c${i}_rs.json`).filter(r => fs.existsSync(RF + r.file)).map(r => ({ ...r, dir: 'rifle' }));
    if (!rifleset.length) rifleset = null;
  }

  // front-facing portrait for the character picker
  const portrait = fs.existsSync(FA + `c${i}.png`) ? `c${i}.png` : null;

  // empty-handed sprite (colours + silhouette for erasing the drawn pistol in game) when the base holds a weapon
  const plain = fs.existsSync(A + `c${i}_plain.png`) ? { plain: `anim/c${i}_plain.png` } : {};
  cast.push({ id: `c${i}`, name, aim, run, idle, ...plain, ...(aimset ? { aimset } : {}), ...(rifleset ? { rifleset } : {}), ...(motion ? { motion } : {}), ...(portrait ? { portrait } : {}),
    ...(arms ? { arms } : {}), ...(skel ? { skel } : jump.every(f => fs.existsSync(A + f)) ? { jump } : {}) });
  console.log(`c${i} ${name}: ` + Object.entries(aim).map(([k, f]) => `${k}=${f.replace(`c${i}_`, '').replace('.png', '')}`).join(' '));
}
fs.writeFileSync(new URL('../public/art/cast.json', import.meta.url), JSON.stringify(cast, null, 1));
console.log('cast.json:', cast.map(c => c.name).join(', '));
