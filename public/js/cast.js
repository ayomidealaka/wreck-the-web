import { art } from './weapons.js';
// Realistic pixel characters (PixelLab-generated). Each character has five aim poses (forward, up-diagonal,
// up, down-diagonal, down), an idle loop, and skeleton-driven run + jump frames (legs posed from a hand-designed
// cycle, gun held forward). Aiming another way while moving = that aim pose's upper body over the moving frame's
// legs, joined at the hip line and shifted by the frame's recorded bob/lean. Facing left is a mirror.
// All frames are normalised onto one square canvas (bottom-centre aligned) so they share coordinates.

export const AIMS = ['up', 'upDiag', 'fwd', 'downDiag', 'down'];
const AIM_DIR = { up: [0, -1], upDiag: [0.71, -0.71], fwd: [1, 0], downDiag: [0.71, 0.71], down: [0.2, 1] };
const CANVAS = 128;
// in-game size of the sprites relative to their drawn pixels (the art is ~48px tall; this makes it ~60)
export const SPRITE_SCALE = 1.25;

// Character style packs, switchable from the menu. public/art/packs.json lists them: { id, name, manifest, root } where
// manifest is the pack's cast.json and root is the folder its art paths are relative to. Classic = the original cast
// (/art/cast.json, art under /art/), so it is never touched by a new pack.
let packs = null;
export async function loadPacks() {
  if (!packs) { try { packs = await (await fetch('/art/packs.json', { cache: 'no-cache' })).json(); } catch { packs = null; } }
  if (!Array.isArray(packs) || !packs.length) packs = [{ id: 'classic', name: 'Classic', manifest: '/art/cast.json', root: '/art/' }];
  return packs;
}
const manifests = new Map();
export async function loadManifest(pack) {
  pack ||= (await loadPacks())[0];
  if (!manifests.has(pack.id)) manifests.set(pack.id, (async () => {
    const list = await (await fetch(pack.manifest || `${pack.root}cast.json`, { cache: 'no-cache' })).json();
    return list.map(d => ({ ...d, root: d.root || pack.root || '/art/' }));
  })());
  return manifests.get(pack.id);
}

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const blank = (w = CANVAS, h = CANVAS) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// put any frame on the shared canvas, bottom-centre aligned (same rule the generator used when padding)
function normalise(img) {
  const c = blank(); c.getContext('2d', { willReadFrequently: true }).drawImage(img, Math.round((CANVAS - img.width) / 2), CANVAS - img.height);
  return c;
}

function measure(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
  let top = H, bottom = -1;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) { if (l < 0) l = x; r = x; }
    rows.push([l, r]);
    if (l >= 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  return { top, bottom, rows, d, W, H };
}
const centreAt = (m, y) => { const [l, r] = m.rows[Math.max(0, Math.min(m.H - 1, y))] || [-1, -1]; return l < 0 ? m.W / 2 : (l + r) / 2; };

// aim pose (upper body, shifted) over another frame's lower body, joined at row `split`
function stitch(upper, lower, split, dx = 0, dy = 0) {
  const c = blank(), g = c.getContext('2d');
  g.drawImage(lower, 0, split, CANVAS, CANVAS - split, 0, split, CANVAS, CANVAS - split);
  g.drawImage(upper, 0, 0, CANVAS, split - dy, Math.round(dx), Math.round(dy), CANVAS, split - dy);
  return c;
}

export class CastCharacter {
  constructor(def) { this.def = def; this.ready = false; }
  async load() {
    const d = this.def;
    const R = d.root || '/art/', get = (f, dir = 'anim') => loadImg(`${R}${dir}/${f}`).then(normalise);
    this.poses = Object.fromEntries(await Promise.all(AIMS.map(async a => [a, await get(d.aim[a])])));
    this.idle = d.idle ? await Promise.all(d.idle.map(f => get(f))) : null;
    const ref = measure(this.poses.fwd);
    this.feet = ref.bottom;
    this.height = ref.bottom - ref.top + 1;
    this.centreX = centreAt(ref, Math.round(ref.bottom - this.height * 0.55));
    this.W = CANVAS; this.H = CANVAS;

    if (d.skel) {
      // skeleton frames: hips sit on a known row; bob/lean per frame come from the pose generator
      const hip = Math.round(d.skel.hipY);
      this.hipRow = hip;
      const run = await Promise.all(d.skel.run.map(f => get(f, 'skel')));
      const jump = await Promise.all(d.skel.jump.map(f => get(f, 'skel')));
      this.runMeta = d.skel.runMeta; this.jumpMeta = d.skel.jumpMeta;
      if (d.skel.leap) {
        const leap = await Promise.all(d.skel.leap.map(f => get(f, 'skel')));
        this.leapMeta = d.skel.leapMeta;
        this.leapCombo = Object.fromEntries(AIMS.map(a => [a, leap.map((f, k) => {
          const m = this.leapMeta[k];
          return a === 'fwd' ? f : stitch(this.poses[a], f, hip + Math.round(m.bob), m.lean, m.bob);
        })]));
      }
      if (d.skel.stance) { this.idle = await Promise.all(d.skel.stance.map(f => get(f, 'skel'))); this.idleMeta = d.skel.stanceMeta; }
      this.combo = {}; this.jumpCombo = {}; this.idleCombo = {};
      for (const a of AIMS) {
        this.combo[a] = run.map((f, k) => a === 'fwd' ? f : stitch(this.poses[a], f, hip + Math.round(this.runMeta[k].bob), this.runMeta[k].lean, this.runMeta[k].bob));
        // airborne frames: 2 rising, 3 top of the jump, 4 falling
        this.jumpCombo[a] = [2, 3, 4].map(k => a === 'fwd' ? jump[k] : stitch(this.poses[a], jump[k], hip + Math.round(this.jumpMeta[k].bob), 0, this.jumpMeta[k].bob));
        if (this.idle) this.idleCombo[a] = a === 'fwd' ? this.idle : this.idle.map((f, k) => {
          const m = this.idleMeta?.[k] || { bob: 0, lean: 0 };
          return stitch(this.poses[a], f, hip + Math.round(m.bob), m.lean, m.bob);
        });
      }
      this.runLen = run.length;
      if (d.motion) await this.loadMotion(d.motion, hip);
    } else {
      // older generated loops (no skeleton): same stitching at a waist estimate
      const split = Math.round(ref.bottom - this.height * 0.45);
      const run = await Promise.all(d.run.map(f => get(f)));
      this.runMeta = run.map(() => ({ bob: 0, lean: 0 }));
      this.combo = {}; this.idleCombo = {}; this.jumpCombo = null;
      for (const a of AIMS) {
        this.combo[a] = run.map(f => stitch(this.poses[a], f, split));
        if (this.idle) this.idleCombo[a] = a === 'fwd' ? this.idle : this.idle.map(f => stitch(this.poses[a], f, split));
      }
      this.runLen = run.length;
    }

    // muzzle per aim pose. The legs and body barely change between poses while the arm and gun move, so the gun
    // is found among pixels that differ from the forward pose; the tip is the one furthest from the shoulder
    // along the aim direction. The gun's real angle (shoulder -> tip) is what shots fly along.
    this.muzzle = {};
    const fwdM = measure(this.poses.fwd), sh = d.skel?.shoulder || { x: this.centreX, y: ref.bottom - this.height * 0.68 };
    const hipLimit = d.skel ? d.skel.hipY + this.height * 0.14 : ref.bottom - this.height * 0.3;
    const differs = (m, i) => m.d[i + 3] > 40 && (fwdM.d[i + 3] <= 40 || Math.abs(m.d[i] - fwdM.d[i]) + Math.abs(m.d[i + 1] - fwdM.d[i + 1]) + Math.abs(m.d[i + 2] - fwdM.d[i + 2]) > 90);
    const GUN = 5; // px the barrel sticks out past the gun hand
    for (const a of AIMS) {
      const arm = d.arms?.[a];
      if (arm?.hand && arm?.elbow) {
        // measured skeleton: the gun points along the forearm, its tip a few px past the hand
        const fx = arm.hand.x - arm.elbow.x, fy = arm.hand.y - arm.elbow.y, fl = Math.hypot(fx, fy) || 1;
        const ux = fx / fl, uy = fy / fl;
        this.muzzle[a] = { x: arm.hand.x + ux * GUN, y: arm.hand.y + uy * GUN, angle: Math.atan2(uy, ux) };
        continue;
      }
      const m = measure(this.poses[a]), [dx, dy] = AIM_DIR[a];
      let best = null, bs = -1e9;
      for (let y = m.top; y <= Math.min(m.bottom, hipLimit); y++) for (let x = 0; x < m.W; x++) {
        const i = (y * m.W + x) * 4;
        if (m.d[i + 3] <= 40 || (a !== 'fwd' && !differs(m, i)) || x < sh.x - 3) continue;
        const s = (x - sh.x) * dx + (y - sh.y) * dy;
        if (s > bs) { bs = s; best = { x, y }; }
      }
      best ||= { x: sh.x + 14 * dx, y: sh.y + 14 * dy };
      this.muzzle[a] = { ...best, angle: Math.atan2(best.y - sh.y, best.x - sh.x) }; // radians, facing-right space
    }
    this.shoulder = d.arms?.fwd?.shoulder || null;
    if (d.aimset) {
      // drawn aim frames, one every few degrees from straight up to straight down
      // every pose uses its cleaned aim frame's upper body (the body frames still hold the pistol)
      this.aimset = await Promise.all(d.aimset.map(async r => ({ ...r, img: await get(r.file, r.dir || 'anim'), base: false })));
      const pal = await this.palette(`${R}${d.plain || `anim/${d.id}_base.png`}`);
      if (pal && this.shoulder) {
        // arm + pistol reach: the furthest pixel sticking out of the body in the forward pose
        const f = this.aimset.reduce((a, b) => Math.abs(b.angle) < Math.abs(a.angle) ? b : a), S = this.shoulder;
        const fd = f.img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS, CANVAS).data;
        let reach = Math.hypot(f.muzzle.x - S.x, f.muzzle.y - S.y);
        for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
          if (fd[(y * CANVAS + x) * 4 + 3] <= 40 || pal.body[y * CANVAS + x]) continue;
          const dx = x + 0.5 - S.x, dy = y + 0.5 - S.y;
          if (Math.abs(Math.atan2(dy, dx)) < 0.5) reach = Math.max(reach, Math.hypot(dx, dy));
        }
        this.armReach = reach + 1;
        for (const e of this.aimset) this.eraseGun(e, pal);
        this.aimset.sort((a, b) => a.angle - b.angle);
      }
      // two-handed long-gun frames: generated rifle swapped out, hands kept to draw over the real weapon
      if (d.rifleset && pal) {
        this.rifleset = await Promise.all(d.rifleset.map(async r => ({ ...r, img: await get(r.file, r.dir), base: false })));
        for (const e of this.rifleset) this.prepareRifle(e, pal);
        this.rifleset = this.rifleset.filter(e => !e.bad).sort((a, b) => a.angle - b.angle);
      }
      this.stitchCache = new Map();
    }
    // face crop for menus: a square from the top of the head to the chin, centred on the head. The centre comes from
    // the top rows only (hair/forehead), where no arm or gun can widen it.
    const chin = Math.round(d.skel?.shoulder ? d.skel.shoulder.y - 2 : ref.top + this.height * 0.2);
    const headH = chin - ref.top + 1;
    let l = CANVAS, r = -1;
    for (let y = ref.top; y <= ref.top + Math.round(headH * 0.55); y++) { const [a0, b0] = ref.rows[y]; if (a0 >= 0) { l = Math.min(l, a0); r = Math.max(r, b0); } }
    const size = headH + 3;
    this.face = { x: Math.round((l + r) / 2 - size / 2) + 1, y: ref.top - 1, size };
    this.ready = true;
    return this;
  }

  // Run + jump frames drawn from the hand-made reference animation (outfit-transferred onto this character).
  // Grounded frames stand on the ground row; airborne frames hang from the standing hip height so the body follows
  // the physics arc. Other aims = that aim pose's upper body over the frame's legs, joined at the frame's hip.
  async loadMotion(m, hipRow) {
    const place = async (f, grounded) => {
      const img = await loadImg(`${this.def.root || '/art/'}motion/${f}`);
      const key = f.replace(/^c\d+_/, '').replace('.png', ''), hip = m.meta[key].hip;
      const tmp = blank(img.width, img.height); tmp.getContext('2d').drawImage(img, 0, 0);
      const mm = measure(tmp);
      const dx = Math.round(m.hipX - hip.x);
      const dy = grounded ? this.feet - mm.bottom : Math.round(hipRow - hip.y);
      const c = blank(); c.getContext('2d', { willReadFrequently: true }).drawImage(img, dx, dy);
      return { c, hipY: Math.round(hip.y + dy), off: { lean: Math.round(hip.x + dx - m.hipX), bob: Math.round(hip.y + dy - hipRow) } };
    };
    const run = await Promise.all(m.run.map(f => place(f, true)));
    const jump = await Promise.all(m.jump.map((f, k) => place(f, k === 0 || k === 5)));
    const combos = frames => Object.fromEntries(AIMS.map(a => [a, frames.map(fr => a === 'fwd' ? fr.c : stitch(this.poses[a], fr.c, fr.hipY, fr.off.lean, fr.off.bob))]));
    this.combo = combos(run); this.runMeta = run.map(r => r.off); this.runLen = run.length;
    this.leapCombo = combos(jump); this.leapMeta = jump.map(r => r.off);
  }

  // Free aim: the arm + gun from the forward-aim pose becomes its own sprite that rotates around the shoulder to any
  // angle; every body frame gets its baked-in arm erased (the band in front of the torso at chest height).
  buildFreeAim(S) {
    const M = this.muzzle.fwd, src = this.poses.fwd, sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS, CANVAS);
    const len = Math.hypot(M.x - S.x, M.y - S.y) || 1, ux = (M.x - S.x) / len, uy = (M.y - S.y) / len;
    const arm = blank(), ad = arm.getContext('2d').createImageData(CANVAS, CANVAS);
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4; if (sd.data[i + 3] <= 40) continue;
      const u = (x - S.x) * ux + (y - S.y) * uy, v = -(x - S.x) * uy + (y - S.y) * ux; // along the arm / across it (+ = below)
      const below = u < 6 ? 3 : 5.5;                                                    // gun grip and hands hang under the line
      if (u >= -2 && u <= len + 3 && v >= -3.5 && v <= below) for (let k = 0; k < 4; k++) ad.data[i + k] = sd.data[i + k];
    }
    arm.getContext('2d').putImageData(ad, 0, 0);
    this.arm = { img: arm, S, angle: Math.atan2(M.y - S.y, M.x - S.x) };
    this.bodyCache = new Map();
  }
  // body frame with its own arm and gun removed (cached per frame)
  bodyOf(img, off) {
    let b = this.bodyCache.get(img);
    if (b) return b;
    const S = this.arm.S, sy = Math.round(S.y + (off?.bob || 0)), sx = S.x + (off?.lean || 0);
    b = blank(); const g = b.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, CANVAS, CANVAS), row = y => { let r = -1; for (let x = 0; x < CANVAS; x++) if (d.data[(y * CANVAS + x) * 4 + 3] > 40) r = x; return r; };
    const waistFront = Math.max(row(sy + 12), row(sy + 13), Math.round(sx + 2));      // front of the torso below the arms
    for (let y = sy - 6; y <= sy + 10; y++) for (let x = waistFront + 2; x < CANVAS; x++) d.data[(y * CANVAS + x) * 4 + 3] = 0;
    // drop small pieces the erase cut off from the body (bits of hand or barrel)
    const lab = new Int32Array(CANVAS * CANVAS).fill(-1), sizes = [];
    for (let s = 0; s < CANVAS * CANVAS; s++) {
      if (d.data[s * 4 + 3] <= 40 || lab[s] >= 0) continue;
      const id = sizes.length, st = [s]; lab[s] = id; let n = 0;
      while (st.length) { const q = st.pop(); n++; const x = q % CANVAS, y = (q / CANVAS) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= CANVAS || ny >= CANVAS) continue; const r = ny * CANVAS + nx; if (lab[r] < 0 && d.data[r * 4 + 3] > 40) { lab[r] = id; st.push(r); } } }
      sizes.push(n);
    }
    for (let s = 0; s < CANVAS * CANVAS; s++) if (lab[s] >= 0 && sizes[lab[s]] < 12) d.data[s * 4 + 3] = 0;
    g.putImageData(d, 0, 0);
    this.bodyCache.set(img, b);
    return b;
  }
  // sprite-local point (facing-right space) -> world, at the in-game scale
  world(st, lx, ly) {
    return { x: st.x + (lx - this.centreX) * st.facing * SPRITE_SCALE, y: st.y - (this.feet - ly) * SPRITE_SCALE };
  }
  get worldHeight() { return this.height * SPRITE_SCALE; }
  // aim in facing-right space, limited to straight up .. straight down
  localAim(st) {
    let a = st.facing > 0 ? st.aim : Math.PI - st.aim;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
  }
  shoulderAt(st) {
    const { off } = this.baseFrame({ ...st, aim: 0 }), S = this.shoulder || this.arm?.S || { x: this.centreX, y: this.feet - this.height * 0.7 };
    return this.world(st, S.x + (off?.lean || 0), S.y + (off?.bob || 0));
  }

  // the face as its own small canvas (for the character picker)
  faceCanvas(scale = 4) {
    const f = this.face, c = blank(f.size * scale, f.size * scale), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.poses.fwd, f.x, f.y, f.size, f.size, 0, 0, f.size * scale, f.size * scale);
    return c;
  }

  static aimFor(angle, facing) {
    const ax = Math.cos(angle) * facing, ay = Math.sin(angle);
    const el = Math.atan2(-ay, Math.max(1e-6, ax)) * 180 / Math.PI; // +90 up .. -90 down
    if (el > 67.5) return 'up'; if (el > 22.5) return 'upDiag'; if (el >= -22.5) return 'fwd'; if (el >= -67.5) return 'downDiag'; return 'down';
  }

  // st: { x, y (feet), facing, moving, onGround, runT, t, vy, aim, flipAngle }
  // nearest drawn aim frame for the current aim (facing-right space)
  aimEntry(st) {
    const la = this.localAim(st), near = set => set.reduce((b, r) => Math.abs(r.angle - la) < Math.abs(b.angle - la) ? r : b);
    if (st.pose === 'rifle' && this.rifleset?.length) {
      // the long-gun hold, unless none of its frames comes near this aim (then the arms-out hold covers that angle)
      const r = near(this.rifleset);
      if (Math.abs(r.angle - la) < 0.35) return r;
      const p = near(this.aimset);
      return Math.abs(p.angle - la) < Math.abs(r.angle - la) ? p : r;
    }
    return near(this.aimset);
  }
  // A long-gun frame (posed by skeleton, so the hands are where we asked): pin each hand to its actual pixels, measure
  // the generated rifle's line (rear hand -> barrel tip), erase that rifle wherever it shows outside the body, and keep
  // both hands as an overlay so they grip the selected weapon from the outside.
  prepareRifle(e, pal) {
    const g = e.img.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, CANVAS, CANVAS), px = d.data;
    const op = i => px[i + 3] > 40;
    const metal = i => { const mx = Math.max(px[i], px[i + 1], px[i + 2]), sat = mx - Math.min(px[i], px[i + 1], px[i + 2]); return (mx < 125 && sat < 40) || (mx < 215 && sat < 18); };
    const own = i => { for (const c of pal) if ((px[i] - c[0]) ** 2 + (px[i + 1] - c[1]) ** 2 + (px[i + 2] - c[2]) ** 2 < 24 * 24) return true; return false; };
    // a hand = the character's own (non-gun) colours clustered near the requested spot
    const pin = p => {
      let sx = 0, sy = 0, n = 0;
      for (let y = Math.floor(p.y - 4); y <= p.y + 4; y++) for (let x = Math.floor(p.x - 4); x <= p.x + 4; x++) {
        const i = (y * CANVAS + x) * 4; if (x < 0 || y < 0 || x >= CANVAS || y >= CANVAS || !op(i) || metal(i) || !own(i)) continue;
        if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= 4) { sx += x + 0.5; sy += y + 0.5; n++; }
      }
      return n >= 3 ? { x: sx / n, y: sy / n } : { x: p.x, y: p.y };
    };
    const R = pin(e.rear), Fr = pin(e.front);
    // barrel tip: furthest gun pixel out of the body, in a cone around the hold
    let tip = null, td = 0;
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4; if (!op(i) || pal.body[y * CANVAS + x] || !metal(i)) continue;
      const dx = x + 0.5 - R.x, dy = y + 0.5 - R.y, dd = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - e.angle; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (dd < 42 && da < 0.9 && dd > td) { td = dd; tip = { x: x + 0.5, y: y + 0.5 }; }
    }
    const want = e.angle;
    if (tip && td > 8) e.angle = Math.atan2(tip.y - R.y, tip.x - R.x);
    e.bad = !tip || td <= 8 || Math.abs(e.angle - want) > 0.6;   // the generator ignored the pose: don't use this frame
    const ux = Math.cos(e.angle), uy = Math.sin(e.angle), L = Math.max(td, 18);
    const hands = blank(), hg = hands.getContext('2d'), hd = hg.createImageData(CANVAS, CANVAS);
    const inHand = (x, y) => Math.hypot(x + 0.5 - R.x, y + 0.5 - R.y) <= 2.7 || Math.hypot(x + 0.5 - Fr.x, y + 0.5 - Fr.y) <= 2.7;
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4; if (!op(i)) continue;
      if (inHand(x, y)) { if (!metal(i) && own(i)) for (let k = 0; k < 4; k++) hd.data[i + k] = px[i + k]; continue; }
      const u = (x + 0.5 - R.x) * ux + (y + 0.5 - R.y) * uy, v = Math.abs(-(x + 0.5 - R.x) * uy + (y + 0.5 - R.y) * ux);
      if (u > -14 && u < L + 4 && v < 4.5 && !pal.body[y * CANVAS + x]) px[i + 3] = 0;   // the generated rifle
    }
    // stray specks the generator left floating (well clear of the body)
    const lab = new Int32Array(CANVAS * CANVAS).fill(-1), sizes = [], out = [];
    for (let q0 = 0; q0 < CANVAS * CANVAS; q0++) {
      if (!op(q0 * 4) || lab[q0] >= 0) continue;
      const id = sizes.length, st = [q0]; lab[q0] = id; let n = 0, o = 0;
      while (st.length) { const q = st.pop(), x = q % CANVAS, y = (q / CANVAS) | 0; n++; if (!pal.body[q]) o++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= CANVAS || ny >= CANVAS) continue; const r = ny * CANVAS + nx; if (lab[r] < 0 && op(r * 4)) { lab[r] = id; st.push(r); } } }
      sizes.push(n); out.push(o);
    }
    const main = sizes.indexOf(Math.max(...sizes));
    for (let q = 0; q < CANVAS * CANVAS; q++) if (lab[q] >= 0 && lab[q] !== main && sizes[lab[q]] < 90 && out[lab[q]] > sizes[lab[q]] * 0.8) px[q * 4 + 3] = 0;
    g.putImageData(d, 0, 0); hg.putImageData(hd, 0, 0);
    e.hands = hands; e.hand = R; e.front = Fr;
    // how far the rear hand sits in front of the shoulder along the gun: the stock butt goes in the shoulder
    if (this.shoulder) e.back = Math.max(3, (R.x - this.shoulder.x) * ux + (R.y - this.shoulder.y) * uy + 1);
    e.muzzle = { x: R.x + ux * 5, y: R.y + uy * 5 };   // keeps the shared helpers working
  }
  // body frame `img` with the upper body of aim frame `e` (cached)
  withAim(e, img, off) {
    if (e.base) return img;
    let m = this.stitchCache.get(img); if (!m) this.stitchCache.set(img, m = new Map());
    let c = m.get(e.file);
    if (!c) {
      const bob = off?.bob || 0, lean = off?.lean || 0, split = (this.hipRow ?? Math.round(this.feet - this.height * 0.45)) + Math.round(bob);
      c = stitch(e.img, img, split, lean, bob);
      // aiming low: the gun hand hangs below the waist, so bring the arm + gun (only) down past the join as well
      const arm = this.armOnly(e), from = split - Math.round(bob);
      if (arm && e.muzzle.y + 3 > from) c.getContext('2d').drawImage(arm, 0, from, CANVAS, CANVAS - from, Math.round(lean), split, CANVAS, CANVAS - from);
      m.set(e.file, c);
    }
    return c;
  }
  // The aim frames were drawn holding a pistol; the selected weapon is drawn in the hands instead, so the pistol goes.
  // Along the arm, past the shoulder: any colour the character's own (empty-handed) base sprite doesn't have is gun
  // (or a baked-in muzzle flash); past the hand, dark unsaturated pixels go too (black pistols on black jackets).
  eraseGun(e, pal) {
    const g = e.img.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, CANVAS, CANVAS), px = d.data;
    const S = this.shoulder, ux = Math.cos(e.angle), uy = Math.sin(e.angle);
    const hx = e.muzzle.x - ux * 5, hy = e.muzzle.y - uy * 5, reach = (hx - S.x) * ux + (hy - S.y) * uy;
    const foreign = i => { let best = 1e9; for (const c of pal) { const q = (px[i] - c[0]) ** 2 + (px[i + 1] - c[1]) ** 2 + (px[i + 2] - c[2]) ** 2; if (q < best) best = q; } return best > 26 * 26; };
    const dark = i => { const mx = Math.max(px[i], px[i + 1], px[i + 2]); return mx < 125 && mx - Math.min(px[i], px[i + 1], px[i + 2]) < 36; };
    const along = (x, y, vx, vy) => [(x + 0.5 - S.x) * vx + (y + 0.5 - S.y) * vy, Math.abs(-(x + 0.5 - S.x) * vy + (y + 0.5 - S.y) * vx)];
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4; if (px[i + 3] <= 40) continue;
      const [u, v] = along(x, y, ux, uy);
      if (u >= reach - 5 && u <= reach + 16 && v <= 7 && foreign(i)) px[i + 3] = 0;   // only around the hand: sleeves keep their own shading
    }
    // the pistol is the last few px of the arm: find the tip (furthest pixel from the shoulder in a cone around the
    // aim) and clear gun-coloured pixels just behind it; the hand is a few px back from there
    // tip: the furthest pixel from the shoulder within arm's reach, in a wide cone around the frame's labelled angle
    let tip = null, td = -1;
    const maxD = this.armReach + 3;
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      if (px[(y * CANVAS + x) * 4 + 3] <= 40 || pal.body[y * CANVAS + x]) continue;   // only what sticks out of the body
      const dx = x + 0.5 - S.x, dy = y + 0.5 - S.y, dd = Math.hypot(dx, dy);
      if (dd > maxD || dd < this.armReach * 0.55) continue;
      let da = Math.atan2(dy, dx) - e.angle; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (da < 0.75 && dd > td) { td = dd; tip = { x: x + 0.5, y: y + 0.5 }; }
    }
    if (tip) {
      const L = Math.hypot(tip.x - S.x, tip.y - S.y) || 1, vx = (tip.x - S.x) / L, vy = (tip.y - S.y) / L;
      const metal = i => { const mx = Math.max(px[i], px[i + 1], px[i + 2]), sat = mx - Math.min(px[i], px[i + 1], px[i + 2]); return (mx < 125 && sat < 36) || (mx < 215 && sat < 18); };
      for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
        const i = (y * CANVAS + x) * 4; if (px[i + 3] <= 40) continue;
        const [u, v] = along(x, y, vx, vy);
        if (u > L - 9 && u < L + 2 && v < 5.5 && metal(i)) px[i + 3] = 0;
      }
      const hand = { x: tip.x - vx * 6, y: tip.y - vy * 6 };
      e.angle = Math.atan2(vy, vx);                     // the arm's real angle, which picks the pose for an aim
      e.muzzle = { x: hand.x + vx * 5, y: hand.y + vy * 5 };
    }
    // crumbs the erase left floating (no longer touching the body)
    const lab = new Int32Array(CANVAS * CANVAS).fill(-1), sizes = [];
    for (let s = 0; s < CANVAS * CANVAS; s++) {
      if (px[s * 4 + 3] <= 40 || lab[s] >= 0) continue;
      const id = sizes.length, st = [s]; lab[s] = id; let n = 0;
      while (st.length) { const q = st.pop(); n++; const x = q % CANVAS, y = (q / CANVAS) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= CANVAS || ny >= CANVAS) continue; const r = ny * CANVAS + nx; if (lab[r] < 0 && px[r * 4 + 3] > 40) { lab[r] = id; st.push(r); } } }
      sizes.push(n);
    }
    // small bits, or slightly bigger ones floating clear of the body (muzzle-flash streaks)
    const out = new Int32Array(sizes.length);
    for (let s = 0; s < CANVAS * CANVAS; s++) if (lab[s] >= 0 && !pal.body[s]) out[lab[s]]++;
    for (let s = 0; s < CANVAS * CANVAS; s++) if (lab[s] >= 0 && (sizes[lab[s]] < 8 || (sizes[lab[s]] < 20 && out[lab[s]] > sizes[lab[s]] / 2))) px[s * 4 + 3] = 0;
    g.putImageData(d, 0, 0);
  }
  // the distinct colours of a sprite
  async palette(src) {
    try {
      const img = await loadImg(src), c = blank(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, img.width, img.height).data, seen = new Map();
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 40) seen.set((px[i] >> 2) << 12 | (px[i + 1] >> 2) << 6 | px[i + 2] >> 2, [px[i], px[i + 1], px[i + 2]]);
      const nd = normalise(img).getContext('2d').getImageData(0, 0, CANVAS, CANVAS).data, body = new Uint8Array(CANVAS * CANVAS);
      for (let y = 1; y < CANVAS - 1; y++) for (let x = 1; x < CANVAS - 1; x++) if (nd[(y * CANVAS + x) * 4 + 3] > 40) for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) body[(y + k) * CANVAS + x + j] = 1;
      const colours = [...seen.values()]; colours.body = body;
      return colours;
    } catch { return null; }
  }
  // just the arm and gun of an aim frame: pixels within a few px of the shoulder -> muzzle line (cached)
  armOnly(e) {
    if (!this.shoulder) return null;
    this.armCache ||= new Map();
    if (this.armCache.has(e.file)) return this.armCache.get(e.file);
    const S = this.shoulder, M = e.muzzle, len = Math.hypot(M.x - S.x, M.y - S.y) || 1, ux = (M.x - S.x) / len, uy = (M.y - S.y) / len;
    const src = e.img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS, CANVAS);
    const out = blank(), od = out.getContext('2d').createImageData(CANVAS, CANVAS);
    for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4; if (src.data[i + 3] <= 40) continue;
      const u = (x - S.x) * ux + (y - S.y) * uy, v = Math.abs(-(x - S.x) * uy + (y - S.y) * ux);
      if (u >= 2 && u <= len + 3 && v <= 4.5) for (let k = 0; k < 4; k++) od.data[i + k] = src.data[i + k];
    }
    out.getContext('2d').putImageData(od, 0, 0);
    this.armCache.set(e.file, out);
    return out;
  }

  // body frame for the movement state (forward-aim set; the aim is applied on top)
  baseFrame(st) {
    const a = 'fwd';
    // landing crouch for a moment after touching down
    if (this.leapCombo && st.onGround && st.landT > 0) return { a, img: this.leapCombo[a][5], off: this.leapMeta[5] };
    if (!st.onGround && this.leapCombo) {
      // take-off -> rising -> mid-air -> top -> falling, chosen by vertical speed
      const vy = st.vy || 0, k = vy < -340 ? 0 : vy < -150 ? 1 : vy < 60 ? 2 : vy < 300 ? 3 : 4;
      return { a, img: this.leapCombo[a][k], off: this.leapMeta[k] };
    }
    if (!st.onGround) {
      if (this.jumpCombo) { const vy = st.vy || 0; return { a, img: this.jumpCombo[a][vy < -180 ? 0 : vy < 220 ? 1 : 2], off: { bob: 0, lean: 0 } }; }
      return { a, img: this.combo[a][2], off: this.runMeta[2] };
    }
    if (st.moving) { const k = Math.floor(st.runT * 12) % this.runLen; return { a, img: this.combo[a][k], off: this.runMeta[k] }; }
    if (this.idle) { const k = Math.floor((st.t || 0) * 6) % this.idle.length; return { a, img: this.idleCombo[a][k], off: this.idleMeta?.[k] || { bob: 0, lean: 0 } }; }
    return { a, img: this.poses[a], off: { bob: 0, lean: 0 } };
  }

  frameFor(st) {
    const f = this.baseFrame(st);
    if (!this.aimset) return f;
    const e = this.aimEntry(st);
    return { ...f, img: this.withAim(e, f.img, f.off), entry: e };
  }

  // where the hand is in the current frame (sprite-local, facing-right space)
  handLocal(st) {
    const { off, entry: e } = this.frameFor(st);
    if (!e) return null;
    const h = e.hand || { x: e.muzzle.x - Math.cos(e.angle) * 5, y: e.muzzle.y - Math.sin(e.angle) * 5 };
    return { x: h.x + (off?.lean || 0), y: h.y + (off?.bob || 0) };
  }
  // where along the weapon sprite the hand holds it: its grip, or further back for a long gun so the stock reaches the shoulder
  gripX(a, e) { return e?.back != null ? Math.min(a.hold.x, e.back) : a.hold.x; }
  // tip of the held weapon sprite (world space)
  weaponMuzzle(st, w) { return this.weaponPoint(st, w, w.art?.muzzle); }
  // any point on the held weapon sprite (its own pixel coords) in world space: muzzle, ejection port
  weaponPoint(st, w, pt) {
    const h = this.handLocal(st), a = w.art;
    if (!h || !a?.hold || !pt) return this.muzzleAt(st);
    const la = this.localAim(st), dx = pt.x - this.gripX(a, this.frameFor(st).entry), dy = pt.y - a.hold.y;
    const mx = h.x + dx * Math.cos(la) - dy * Math.sin(la), my = h.y + dx * Math.sin(la) + dy * Math.cos(la);
    return this.world(st, mx, my);
  }
  // jetpack nozzles (world space), for thruster particles
  jetNozzle(st) {
    const j = this.jetPlace(st); if (!j) return { x: st.x - st.facing * 9, y: st.y - this.height * 0.4 };
    return this.world(st, j.x + j.w / 2, j.y + j.h);
  }
  jetPlace(st) {
    const J = art('jetpack'), S = this.shoulder; if (!J || !S) return null;
    const { off } = this.baseFrame({ ...st, aim: 0 }), sc = 0.7, w = Math.round(J.w * sc), h = Math.round(J.h * sc);
    return { x: Math.round(S.x - w + 1 + (off?.lean || 0)), y: Math.round(S.y - 1 + (off?.bob || 0)), w, h }; // tucked against the back
  }

  muzzleAt(st) {
    if (this.aimset) {
      const { off, entry: e } = this.frameFor(st);
      return this.world(st, e.muzzle.x + (off?.lean || 0), e.muzzle.y + (off?.bob || 0));
    }
    if (this.arm) {
      const { off } = this.frameFor(st), A = this.arm, rot = this.localAim(st) - A.angle, M = this.muzzle.fwd;
      const dx = M.x - A.S.x, dy = M.y - A.S.y, mx = A.S.x + dx * Math.cos(rot) - dy * Math.sin(rot), my = A.S.y + dx * Math.sin(rot) + dy * Math.cos(rot);
      return this.world(st, mx + (off?.lean || 0), my + (off?.bob || 0));
    }
    const { a, off } = this.frameFor(st), m = this.muzzle[a];
    return this.world(st, m.x + (off?.lean || 0), m.y + (off?.bob || 0));
  }
  // the direction the gun in the current pose actually points (world space), so shots line up with the barrel
  gunAngle(st) {
    if (this.aimset) return st.aim; // shots go straight at the cursor; the drawn gun is within a few degrees of it
    if (this.arm) { const a = this.localAim(st); return st.facing > 0 ? a : Math.PI - a; }
    const ang = this.muzzle[CastCharacter.aimFor(st.aim, st.facing)].angle;
    return st.facing > 0 ? ang : Math.PI - ang;
  }

  draw(g, st, weapon) {
    const { img, off } = this.frameFor(st);
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(Math.round(st.x), Math.round(st.y));
    if (st.flipAngle) { g.translate(0, -this.worldHeight / 2); g.rotate(st.flipAngle * st.facing); g.translate(0, this.worldHeight / 2); }
    g.scale(st.facing * SPRITE_SCALE, SPRITE_SCALE);
    g.translate(-Math.round(this.centreX), -this.feet - 1);
    // jetpack on the back (behind the body), with thruster flames while flying
    const J = art('jetpack'), jp = this.jetPlace(st);
    if (J && jp) {
      g.drawImage(J.img, jp.x, jp.y, jp.w, jp.h);
      if (st.jetting) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const nx of [jp.x + jp.w * 0.28, jp.x + jp.w * 0.72]) {
          const fl = 5 + Math.random() * 6;
          g.fillStyle = '#FF8A2E'; g.beginPath(); g.moveTo(nx - 2, jp.y + jp.h); g.lineTo(nx, jp.y + jp.h + fl); g.lineTo(nx + 2, jp.y + jp.h); g.fill();
          g.fillStyle = '#FFF2B0'; g.beginPath(); g.moveTo(nx - 1, jp.y + jp.h); g.lineTo(nx, jp.y + jp.h + fl * 0.5); g.lineTo(nx + 1, jp.y + jp.h); g.fill();
        }
        g.restore();
      }
    }
    if (!this.arm || this.aimset) {
      g.drawImage(img, 0, 0);
      // the selected weapon in the hands, pointing exactly along the aim
      const a = weapon?.art, h = a?.hold && this.handLocal(st);
      if (h) {
        const { off, entry: e } = this.frameFor(st);
        g.save(); g.translate(h.x, h.y); g.rotate(this.localAim(st)); g.drawImage(a.inHand, -this.gripX(a, e), -a.hold.y); g.restore();
        if (e?.hands) g.drawImage(e.hands, off?.lean || 0, off?.bob || 0);   // fingers wrap over the gun
      }
      g.restore(); return;
    }
    g.drawImage(this.bodyOf(img, off), 0, 0);
    // arm + gun, rotated around the shoulder to the exact aim
    const A = this.arm, sx = A.S.x + (off?.lean || 0), sy = A.S.y + (off?.bob || 0);
    g.translate(sx, sy); g.rotate(this.localAim(st) - A.angle); g.drawImage(A.img, -A.S.x, -A.S.y);
    g.restore();
  }
}
