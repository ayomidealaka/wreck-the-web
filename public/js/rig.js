import { art, WEAPONS, droneParts } from './weapons.js';
// A rigged character: one high-detail drawing cut into parts (scripts/art/cut-rig.mjs) and posed every frame, instead of
// pre-drawn frames. Legs: two-bone IK with the knees bending forward, a stride cycle with the feet lifting on the
// forward swing and lying flat on the ground. Arms: two-bone IK onto the held weapon's grips (rear hand on the grip,
// front hand under the barrel; both on the grip for a pistol), elbows bending down. Head: turns towards the aim.
// Shown scaled down (smoothed), so it reads finer than the classic pixel cast.
// Works in the drawing's own pixels, origin on the ground under the hips, y up = negative; facing right.
// Same interface the player uses for the classic cast (CastCharacter).

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
// Recoil per weapon at full kick (the player's recoil value, 1 right after a shot, fading fast): how far the gun is
// shoved back along the barrel (drawing px) and how far the muzzle climbs (degrees).
const KICK = {
  blaster: [10, 12], ak47: [9, 7], minigun: [6, 3], scatter: [18, 16], sniper: [22, 20], launcher: [12, 11],
  rocket: [14, 7], nuke: [18, 9], flamer: [2, 1], laser: [1.5, 0.5], well: [9, 9],
};
// One leg's run cycle in 8 keys, measured from a reference sprint (public/art/ref/run2, scripts/art/estimate-ref-poses.mjs):
// [thigh angle from vertical (+ = forward), knee bend (shin folds back by this much)]. The other leg is 4 keys behind.
//  0 knee driving high, 1 heel strike reaching forward, 2 absorbing under the body, 3 pushing off, 4 toe-off,
//  5 recovery (leg trailing), 6 heel kicked up to the backside, 7 knee driving forward
const RUN_KEYS = [[50, 130], [42, 23], [23, 62], [-34, 12], [-34, 27], [-43, 58], [5, 106], [35, 112]];
const RUN_FLIGHT = [1, 0, 0, 0, 1, 0, 0, 0];
// Jump and drop, measured from a reference jump (public/art/ref/jump2): front leg's knee drives up, back leg trails.
// Chosen by vertical speed (px/s, negative = rising): take-off, rising, apex, falling, about to land. Then the landing crouch.
const JUMP_KEYS = [
  { vy: -430, front: [33, 103], back: [-8, 22] },
  { vy: -280, front: [24, 117], back: [-14, 19] },
  { vy: -60, front: [11, 101], back: [-26, 17] },
  { vy: 150, front: [48, 96], back: [-8, 31] },
  { vy: 420, front: [51, 104], back: [-7, 71] },
];
const LAND_KEY = { front: [53, 73], back: [13, 87] };          // both feet off the ground at keys 0 and 4 (body rises a little)
// A looping list of key values as a smooth periodic curve: its first few Fourier harmonics. Passes close to every key
// with no snaps or overshoot (a spline through the keys whipped the shin from fully folded to straight in one key).
const smoothLoop = (vals, H = 3) => {
  const n = vals.length, c = [];
  for (let k = 0; k <= H; k++) {
    let a = 0, b = 0;
    vals.forEach((v, i) => { a += v * Math.cos(TAU * k * i / n); b += v * Math.sin(TAU * k * i / n); });
    c.push([a * 2 / n, b * 2 / n]);
  }
  return f => c.reduce((sum, [a, b], k) => sum + (k === 0 ? a / 2 : a * Math.cos(TAU * k * f / n) + b * Math.sin(TAU * k * f / n)), 0);
};
const RUN_THIGH = smoothLoop(RUN_KEYS.map(k => k[0])), RUN_BEND = smoothLoop(RUN_KEYS.map(k => k[1])), RUN_FLY = smoothLoop(RUN_FLIGHT, 2);
// Catmull-Rom through a looping list of values at position f (0..n)
const loopSpline = (vals, f) => {
  const n = vals.length, i = Math.floor(f) % n, t = f - Math.floor(f), v = k => vals[((i + k) % n + n) % n];
  const p0 = v(-1), p1 = v(0), p2 = v(1), p3 = v(2);
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const ang = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
// two-bone IK: the middle joint, picking whichever of the two solutions `prefer` scores higher
function ik(root, target, L1, L2, prefer) {
  const d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, dist(root, target)));
  const base = ang(root, target), a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const j1 = { x: root.x + Math.cos(base - a) * L1, y: root.y + Math.sin(base - a) * L1 };
  const j2 = { x: root.x + Math.cos(base + a) * L1, y: root.y + Math.sin(base + a) * L1 };
  return prefer(j1) >= prefer(j2) ? j1 : j2;
}

export class RigCharacter {
  constructor(def) { this.def = def; this.ready = false; this.aimset = true; }   // aimset: tells the player to use weaponMuzzle

  async load() {
    const R = this.def.root || '/art/', rig = this.rig = await (await fetch(`${R}${this.def.rig}`, { cache: 'no-cache' })).json();
    const dir = this.def.rig.replace(/[^/]*$/, '');
    this.img = Object.fromEntries(await Promise.all(Object.entries(rig.parts).map(async ([n, p]) => [n, await loadImg(`${R}${dir}${p.file}`)])));
    const J = rig.joints, O = { x: J.hip.x, y: rig.sole };                         // origin: ground under the hips
    const L = p => ({ x: p.x - O.x, y: p.y - O.y });
    this.j = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, L(v)]));
    const j = this.j;
    this.len = {
      uarmR: dist(j.right_shoulder, j.right_elbow), larmR: dist(j.right_elbow, j.right_arm),
      uarmL: dist(j.left_shoulder, j.left_elbow), larmL: dist(j.left_elbow, j.left_arm),
      thighR: dist(j.right_hip, j.right_knee), shinR: dist(j.right_knee, j.right_leg),
      thighL: dist(j.left_hip, j.left_knee), shinL: dist(j.left_knee, j.left_leg),
    };
    this.ankleH = -(j.right_leg.y + j.left_leg.y) / 2;                              // ankle height above the sole
    this.hipH = -j.hip.y;
    this.srcH = rig.sole - rig.top;
    this.worldHeight = this.def.height || 76;
    this.k = this.worldHeight / this.srcH;                                         // world px per drawing px
    this.gun = (this.def.gunScale || 1.28) / this.k;                               // drawing px per weapon-sprite px
    this.height = this.worldHeight;
    if (this.def.weapons) await this.loadWeapons(`${R}${this.def.weapons}`);
    // trouser colour (average of the thigh art, a touch darker): fills the crotch under the legs at any angle
    { const im = this.img.thighR, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      this.crotch = n ? `rgb(${Math.round(r / n * 0.85)},${Math.round(gg / n * 0.85)},${Math.round(b / n * 0.85)})` : '#2A2E36'; }
    // boot colour (darkest third of the boot art): fills under the ankle joint so turning the foot never opens a gap
    { const im = this.img.footR, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
      px.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]); const q = px.slice(0, Math.max(1, px.length / 3 | 0));
      const m = k => Math.round(q.reduce((s, v) => s + v[k], 0) / q.length);
      this.bootCol = q.length ? `rgb(${m(0)},${m(1)},${m(2)})` : '#15171B'; }
    this.ready = true;
    return this;
  }

  // The pack's own weapon art (drawn at this character's detail level), used instead of the shared pixel sprites.
  // Each is trimmed, its barrel tip found, and scaled so it is as long in the hands as the shared sprite would be.
  async loadWeapons(dir) {
    const trim = img => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
      const tg = t.getContext('2d', { willReadFrequently: true }); tg.drawImage(c, -x0, -y0);
      return { c: t, d: tg.getImageData(0, 0, t.width, t.height).data };
    };
    this.hi = {};
    await Promise.all([...WEAPONS.filter(w => w.held).map(w => w.artId || w.id), 'jetpack', 'drone', 'dronegun', 'jet', 'bomb'].map(async id => {
      let img; try { img = await loadImg(`${dir}${id}.png`); } catch { return; }
      const { c, d } = trim(img), W = c.width, H = c.height, op = (x, y) => d[(y * W + x) * 4 + 3] > 60;
      if (id === 'jetpack') { this.hiJet = c; return; }
      if (id === 'drone' || id === 'dronegun') { (this.hiDroneSrc ||= {})[id] = c; return; }
      if (id === 'jet' || id === 'bomb') { (this.extra ||= {})[id] = c; return; }
      // barrel tip: rightmost opaque column in the upper 70% (below that hang grips and magazines)
      let m = { x: W, y: H / 2 };
      outer: for (let x = W - 1; x >= 0; x--) { const ys = []; for (let y = 0; y <= H * 0.7; y++) if (op(x, y)) ys.push(y); if (ys.length) { m = { x: x + 1, y: ys[ys.length >> 1] + 0.5 }; break outer; } }
      const w = WEAPONS.find(q => (q.artId || q.id) === id), u = W / (w.len || 30);   // hi-res px per shared-sprite px
      const art = { img: c, inHand: c, w: W, h: H, muzzle: m, hold: { x: Math.round(W * w.holdAt), y: m.y + H * 0.13 } };
      if (w.port) art.port = { x: Math.round(W * w.port), y: m.y - 1.5 * u };
      this.hi[w.id] = { art, u, g: (this.def.gunScale || 1.28) * (w.len || 30) / W / this.k };
    }));
  }
  // weapon art + scale for a weapon: the pack's own if it has one, else the shared sprite
  artFor(w) { return this.hi?.[w.id] || { art: w.art, u: 1, g: this.gun }; }
  // other art in this pack's style (the airstrike jet and bombs), trimmed
  packArt(id) { return this.extra?.[id] || null; }
  // the drone in this pack's style: body + its own swivelling gatling (sizes in world px)
  droneArt() {
    const D = this.hiDroneSrc; if (!D?.drone || !D?.dronegun) return null;
    return this.hiDrone ||= droneParts(D.drone, D.dronegun, 46, 30);
  }
  weaponIcon(w) {
    if (w.id === 'drone' && this.hiDroneSrc?.drone) { const c = this.hiDroneSrc.drone; return { img: c, w: c.width, h: c.height, smooth: true }; }
    const h = this.hi?.[w.id]; return h ? { img: h.art.img, w: h.art.w, h: h.art.h, smooth: true } : null;
  }

  localAim(st) {
    let a = st.facing > 0 ? st.aim : Math.PI - st.aim;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
  }
  // Two-step aim: lean for the current aim, then the angle that puts the barrel line itself through the target (the
  // barrel sits a few px off the pivot, so aiming the pivot at the target would miss by that much). World angle.
  aimAt(st, w, target) {
    const tl = { x: (target.x - st.x) * st.facing / this.k, y: (target.y - st.y) / this.k };
    const world = a => st.facing > 0 ? a : Math.PI - a;
    let a = this.localAim(st);
    for (let i = 0; i < 8; i++) {                                                  // the pistol's pivot moves with the aim: settle it
      const P = this.pose({ ...st, aim: world(a), recoil: 0, still: true }, w), W = P.weapon;   // springs and sway are looks only
      if (!W) { a = ang(P.sR, tl); break; }
      const d = dist(W.origin, tl), off = Math.max(-1, Math.min(1, W.barrelY / Math.max(d, 1)));
      a = ang(W.origin, tl) - Math.asin(off);
      a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(Math.sin(a), Math.cos(a))));
    }
    return world(a);
  }
  // drawing coords -> world
  world(st, p) { return { x: st.x + p.x * this.k * st.facing, y: st.y + p.y * this.k }; }
  shoulderAt(st) { return this.world(st, this.pose(st, null).sR); }
  gunAngle(st) { return st.aim; }
  muzzleAt(st) { const P = this.pose(st, null); return this.world(st, P.handR); }
  weaponMuzzle(st, w) {
    const P = this.pose(st, w);
    return this.world(st, P.muzzle || P.handR);
  }
  // the jetpack's box on the back (drawing coords); the draw and the thruster particles both use it
  jetRect(P) {
    const J = art('jetpack'); if (!J) return null;
    const s = 0.8 / this.k, h = J.h * s, w = this.hiJet ? h * this.hiJet.width / this.hiJet.height : J.w * s;
    return { img: this.hiJet || J.img, x: P.back.x - w * 0.55, y: P.back.y - h * 0.42, w, h };
  }
  jetNozzle(st) {
    const P = this.pose(st, null), r = this.jetRect(P);
    return this.world(st, r ? { x: r.x + r.w * 0.5, y: r.y + r.h } : add(P.back, { x: 0, y: 24 }));
  }
  // any point on the held weapon sprite (its own pixel coords) in world space: muzzle, ejection port
  weaponPoint(st, w, pt) {
    const P = this.pose(st, w), W = P.weapon; if (!W || !pt) return this.world(st, P.handR);
    return this.world(st, add(W.origin, rot((pt.x - W.ox) * W.g, (pt.y - W.oy) * W.g, W.a)));
  }
  // the free (far) hand, where a thrown grenade leaves from
  throwHand(st, w) { return this.world(st, this.pose(st, w).handL); }
  weaponPort(st, w) { const a = this.artFor(w).art; return a.port ? this.weaponPoint(st, w, a.port) : null; }

  // the whole pose for this moment: joint positions (drawing coords) and part angles
  pose(st, w) {
    const j = this.j, len = this.len, t = st.t || 0, tablet = w?.id === 'drone', a = tablet ? 0.35 : this.localAim(st);
    const moving = st.onGround && st.moving, air = !st.onGround;
    const phase = (st.runT || 0) * TAU * 1.7;
    // hips + torso
    const speed = Math.min(1, st.speed ?? 1), amt = 0.45 + 0.55 * speed;          // walk = a softer version of the run
    let hipY = -(this.hipH - 3) + Math.sin(t * 2.2) * 0.8, lean = 0.04;
    if (moving) lean = 0.04 + 0.26 * speed;                                       // sprinting leans into it
    if (air) { hipY = -(this.hipH - 2); lean = 0.06; }
    if (st.onGround && st.landT > 0) hipY += 12;
    // aim lean: chest back when aiming high, hunched over the gun when aiming low (the shoulder moves with it)
    lean += Math.max(-1.2, Math.min(1.2, a)) * 0.2;
    if (!air) hipY += Math.max(0, a) * 4;
    const hip = { x: 0, y: hipY };
    const T = p => add(hip, rot(p.x - j.hip.x, p.y - j.hip.y, lean));            // torso-attached point
    const P = { lean, hip, neck: T(j.neck), sR: T(j.right_shoulder), sL: T(j.left_shoulder), hR: T(j.right_hip), hL: T(j.left_hip) };
    P.back = T({ x: j.right_shoulder.x - 10, y: j.right_shoulder.y + 18 });
    P.look = tablet ? 0.42 : Math.max(-0.35, Math.min(0.35, a * 0.45));         // flying the drone: eyes on the tablet

    // legs. Both use the same lengths: the cut legs differ by a few px, which made the run limp on alternate steps.
    const LT = (len.thighR + len.thighL) / 2, LS = (len.shinR + len.shinL) / 2, A = this.ankleH;
    const fk = (root, thDeg, bendDeg) => {                                       // thigh angle from vertical, knee bend
      const th = thDeg * D2R, sh = th - Math.max(4, bendDeg) * D2R;
      const knee = { x: root.x + Math.sin(th) * LT, y: root.y + Math.cos(th) * LT };
      return { root, knee, ankle: { x: knee.x + Math.sin(sh) * LS, y: knee.y + Math.cos(sh) * LS }, footTilt: -sh * 0.85 };
    };
    const bottom = (L, side) => {                                                // lowest corner of the boot (heel or toe)
      const fp = this.rig.parts[`foot${side}`]; if (!fp) return L.ankle.y + A;
      return L.ankle.y + Math.max(...[fp.heel || fp.b, fp.b].map(q => rot(q.x - fp.a.x, q.y - fp.a.y, L.footTilt).y));
    };
    const shiftBody = d => {
      for (const k of ['hip', 'neck', 'sR', 'sL', 'hR', 'hL', 'back']) P[k] = add(P[k], { x: 0, y: d });
      for (const L of Object.values(legs)) for (const k of ['root', 'knee', 'ankle']) L[k] = add(L[k], { x: 0, y: d });
    };
    let legs;
    if (moving) {
      // run: the measured cycle, other leg half a cycle behind; walking plays a softer version
      const at = f => ({ R: fk(P.hR, RUN_THIGH(f) * amt, RUN_BEND(f) * amt), L: fk(P.hL, RUN_THIGH((f + 4) % 8) * amt, RUN_BEND((f + 4) % 8) * amt) });
      const f = (phase / TAU * 8) % 8;
      legs = at(f);
      // body height: the planted boot on the ground, averaged over the neighbouring moments of the cycle so the hips
      // glide instead of popping when the supporting foot changes; a little lift in the airborne moments
      const raw = g => { const l = at((g + 8) % 8); return -Math.max(bottom(l.R, 'R'), bottom(l.L, 'L')); };
      const drop = [-0.5, -0.25, 0, 0.25, 0.5].reduce((sum, d) => sum + raw(f + d), 0) / 5 - Math.max(0, RUN_FLY(f)) * 6 * speed;
      shiftBody(drop);
    } else if (air) {
      // jump: front knee drives up, back leg trails down; blended by vertical speed (take-off -> apex -> falling)
      const v = st.vy || 0, K = JUMP_KEYS;
      let i = 0; while (i < K.length - 2 && v > K[i + 1].vy) i++;
      const u = Math.max(0, Math.min(1, (v - K[i].vy) / (K[i + 1].vy - K[i].vy))), mix = (p, q) => p + (q - p) * u;
      legs = { R: fk(P.hR, mix(K[i].front[0], K[i + 1].front[0]), mix(K[i].front[1], K[i + 1].front[1])),
               L: fk(P.hL, mix(K[i].back[0], K[i + 1].back[0]), mix(K[i].back[1], K[i + 1].back[1])) };
    } else if (st.landT > 0) {
      // landing: the crouch, boots planted
      legs = { R: fk(P.hR, LAND_KEY.front[0], LAND_KEY.front[1]), L: fk(P.hL, LAND_KEY.back[0], LAND_KEY.back[1]) };
      shiftBody(-Math.max(bottom(legs.R, 'R'), bottom(legs.L, 'L')));
    } else {
      // standing: feet planted where they are drawn, knees forward
      legs = {};
      for (const [s, foot] of [['R', j.right_leg], ['L', j.left_leg]]) {
        const root = s === 'R' ? P.hR : P.hL, target = { x: foot.x, y: -A };
        const knee = ik(root, target, LT, LS, p => p.x);
        legs[s] = { root, knee, ankle: add(knee, rot(LS, 0, ang(knee, target))), footTilt: 0 };
      }
    }
    P.legs = legs;

    // weapon + hands
    const hold = w?.held && w.art?.hold ? w : null, H = hold ? this.artFor(w) : null, g = H?.g, u = H?.u || 1, G = st.still ? null : st.gun;
    let gripR, gripL;
    if (hold) {
      const A2 = H.art, wpx = A2.inHand.width, my = A2.muzzle.y;
      const kind = w.pose === 'rifle' ? 'rifle' : (w.id === 'rocket' || w.id === 'nuke') ? 'shoulder' : 'pistol';
      let origin, ox, oy;                                                          // weapon placement: origin + sprite offset
      if (kind === 'rifle') { origin = add(P.sR, { x: 7, y: 7 }); ox = 0; oy = my; }                 // butt in the shoulder pocket
      else if (kind === 'shoulder') { origin = add(P.sR, { x: 2, y: -5 }); ox = A2.hold.x; oy = my; } // tube resting on the shoulder
      else { origin = add(add(P.sR, { x: 6, y: 5 }), rot((len.uarmR + len.larmR) * 0.78, 0, a)); ox = A2.hold.x; oy = A2.hold.y; } // held out
      // recoil: the shot shoves the gun back along the barrel and tips the muzzle up, and springs bring
      // both home with a little overshoot (the player's gun springs; without them, the plain fading recoil value).
      // A new weapon swings in from below; the gun lags a beat behind the chest as it rises and falls; it sways with
      // the stride and while jetting. The hands are solved onto wherever the gun ends up.
      const kick = KICK[w.id] || [6, 6], r0 = st.still ? 0 : Math.max(0, Math.min(1, st.recoil || 0));
      const kp = G ? G.kick : r0, kr = G ? G.rot : r0;
      const sway = G ? (moving ? Math.sin(phase * 2 + 1.2) * 0.045 * speed : 0) + (st.jetting ? Math.sin(t * 5) * 0.03 : 0) : 0;
      const ga = a - kick[1] * D2R * kr + sway + (G ? G.swing : 0);
      const pull = G ? (1 - G.switchT) ** 2 * 10 : 0;
      origin = add(origin, rot(-kick[0] * kp - pull, 0, a));
      if (G) origin = add(origin, { x: 0, y: G.lag / this.k });
      const at = (sx, sy) => add(origin, rot((sx - ox) * g, (sy - oy) * g, ga));
      P.weapon = { kind, origin, ox, oy, a: ga, g, art: A2, barrelY: (A2.muzzle.y - oy) * g };
      P.muzzle = at(A2.muzzle.x, A2.muzzle.y);
      gripR = at(A2.hold.x, A2.hold.y + 1 * u);
      // shotgun: the front hand racks the pump back and forward again just after the shot
      const pump = G && w.id === 'scatter' && G.pumpT > 0.14 && G.pumpT < 0.44 ? Math.sin(Math.PI * (G.pumpT - 0.14) / 0.3) * 8 * u : 0;
      gripL = kind === 'pistol' ? at(A2.hold.x + 1 * u, A2.hold.y + 3 * u) : at(Math.min(wpx - 3 * u, A2.hold.x + wpx * 0.3) - pump, my + 2.5 * u);
    } else if (tablet) {
      // flying the drone: elbows tucked at his sides, forearms up, both hands on the lower end of a tablet held at chest
      // height and tipped towards his face; the near thumb taps the screen
      const C = add(P.sL, { x: 15, y: 19 }), ta = -1.0, ux = Math.cos(ta), uy = Math.sin(ta), nx = uy, ny = -ux;  // u: up the tablet, n: screen side
      const tap = Math.max(0, Math.sin(t * 6.5)) ** 4, slide = Math.sin(t * 1.7) * 2.5;
      P.tablet = { c: C, a: ta };
      gripL = { x: C.x - ux * 9 + nx * 2.5, y: C.y - uy * 9 + ny * 2.5 };
      const up = -7 + slide + tap * 1.5, out = -1.5 + tap * 2.5;              // thumb lifts off and presses back on the screen
      gripR = { x: C.x + ux * up - nx * out, y: C.y + uy * up - ny * out };
    } else {                                                                       // nothing in the hands: arms hang
      gripR = add(P.sR, { x: -3, y: (len.uarmR + len.larmR) * 0.93 });
      gripL = add(P.sL, { x: 4, y: (len.uarmL + len.larmL) * 0.93 });
    }
    // throwing a grenade: the free hand leaves the gun, winds back past the head, whips forward along the aim (the
    // grenade leaves the hand there, 47% of the way through) and follows through low before it returns to the gun
    if (G?.throwT < 1 && !tablet) {
      const R = len.uarmL + len.larmL, u2 = G.throwT, sL = P.sL;
      const keys = [[0, gripL], [0.25, add(sL, { x: -0.4 * R, y: -0.6 * R })], [0.47, add(sL, add(rot(R * 0.95, 0, a), { x: 0, y: -0.15 * R }))],
        [0.75, add(sL, { x: 0.5 * R, y: 0.55 * R })], [1, gripL]];
      let i = 0; while (i < keys.length - 2 && u2 > keys[i + 1][0]) i++;
      const [t0, p0] = keys[i], [t1, p1] = keys[i + 1], e = (1 - Math.cos(Math.PI * Math.min(1, (u2 - t0) / (t1 - t0)))) / 2;
      gripL = { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
    }
    const elbowDown = p => p.y;
    P.elbowR = ik(P.sR, gripR, len.uarmR, len.larmR, elbowDown);
    P.elbowL = ik(P.sL, gripL, len.uarmL, len.larmL, elbowDown);
    P.handR = gripR; P.handL = gripL;
    return P;
  }

  // draw one part so that its joint a sits at `at` and its a->b (or a->grip) direction points along `dirAngle`
  part(g, name, at, dirAngle, to = 'b') {
    const p = this.rig.parts[name], img = this.img[name]; if (!p || !img) return;
    const end = p[to] || p.b, rest = Math.atan2(end.y - p.a.y, end.x - p.a.x);
    g.save(); g.translate(at.x, at.y); g.rotate(dirAngle - rest); g.drawImage(img, -p.a.x, -p.a.y); g.restore();
  }

  // The character is drawn into its own canvas first, so it can cast a shadow: a solid copy offset a little, dark on
  // light pages and light on dark ones (st.bgLum = page brightness behind the player), so it reads on any site.
  draw(g, st, weapon) {
    const m = g.getTransform(), s = Math.max(1, Math.hypot(m.a, m.b)), B = 160, TOP = 125, px = Math.ceil(B * s);
    if (!this.off || this.off.width !== px) {
      this.off = Object.assign(document.createElement('canvas'), { width: px, height: px });
      this.sil = Object.assign(document.createElement('canvas'), { width: px, height: px });
    }
    const og = this.off.getContext('2d'), sg = this.sil.getContext('2d');
    og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, px, px);
    og.setTransform(s, 0, 0, s, (B / 2 - st.x) * s, (TOP - st.y) * s);
    this.drawRig(og, st, weapon);
    const lum = st.bgLum ?? 1, dark = lum < 0.42;
    this.afterimages(g, st, B, TOP, px);
    sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, px, px); sg.drawImage(this.off, 0, 0);
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = dark ? '#FFFFFF' : '#000000'; sg.fillRect(0, 0, px, px);
    g.save(); g.imageSmoothingEnabled = true;
    g.globalAlpha *= dark ? 0.22 : 0.32;
    g.drawImage(this.sil, st.x - B / 2 + 2.5, st.y - TOP + 2.5, B, B);
    g.globalAlpha = 1; g.drawImage(this.off, st.x - B / 2, st.y - TOP, B, B);
    g.restore();
  }

  // Afterimages while boosting (jetpack), flipping or dashing: copies of the character left behind, tinted along a colour ramp
  // and fading out, so fast moves read as fast.
  afterimages(g, st, B, TOP, px) {
    const now = st.t || 0, LIFE = 0.24, RAMP = ['#7CF2FF', '#7AA8FF', '#A97CFF', '#E070FF'];
    this.trail ||= []; this.pool ||= [];
    this.trail = this.trail.filter(e => { const keep = now - e.t < LIFE && now >= e.t; if (!keep) this.pool.push(e.c); return keep; });
    if ((st.jetting || st.flipAngle || st.dashing) && now - (this.lastTrail ?? -1) > (st.dashing ? 0.025 : 0.04)) {
      this.lastTrail = now;
      let c = this.pool.pop();
      if (!c || c.width !== px) c = Object.assign(document.createElement('canvas'), { width: px, height: px });
      const cg = c.getContext('2d'); cg.globalCompositeOperation = 'source-over'; cg.clearRect(0, 0, px, px); cg.drawImage(this.off, 0, 0);
      cg.globalCompositeOperation = 'source-in'; cg.fillStyle = RAMP[this.trail.length % RAMP.length]; cg.fillRect(0, 0, px, px);
      this.trail.push({ c, x: st.x - B / 2, y: st.y - TOP, t: now });
    }
    for (const e of this.trail) {
      g.save(); g.globalAlpha *= 0.45 * (1 - (now - e.t) / LIFE); g.drawImage(e.c, e.x, e.y, B, B); g.restore();
    }
  }

  drawRig(g, st, weapon) {
    const P = this.pose(st, weapon), k = this.k;
    g.save();
    g.translate(st.x, st.y);
    if (st.flipAngle) { g.translate(0, -this.worldHeight / 2); g.rotate(st.flipAngle * st.facing); g.translate(0, this.worldHeight / 2); }
    g.scale(st.facing * k, k);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // crotch underlay: trouser fabric between the hip joints and the top third of each thigh, so turning the thighs
    // never shows a hole between the legs
    { const R = P.legs.R, L = P.legs.L, on = (Lg, t) => ({ x: Lg.root.x + (Lg.knee.x - Lg.root.x) * t, y: Lg.root.y + (Lg.knee.y - Lg.root.y) * t });
      // flat across the bottom (straight from thigh to thigh), so it fills the gap without bulging below the crotch
      const pts = [add(P.hR, { x: -7, y: -10 }), add(P.hL, { x: 7, y: -10 }), add(on(L, 0.34), { x: 4, y: 0 }), add(on(R, 0.34), { x: -4, y: 0 })];
      g.fillStyle = this.crotch; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath(); g.fill(); }
    // legs, far (left) one first; feet lie flat on the ground, tip a little on the swing
    for (const s of ['L', 'R']) {
      const L = P.legs[s];
      this.part(g, `thigh${s}`, L.root, ang(L.root, L.knee));
      g.fillStyle = this.bootCol; g.beginPath(); g.arc(L.ankle.x + 1, L.ankle.y + 1, 6.5, 0, Math.PI * 2); g.fill();   // ankle filler
      this.part(g, `shin${s}`, L.knee, ang(L.knee, L.ankle));
      const fp = this.rig.parts[`foot${s}`];
      if (fp) this.part(g, `foot${s}`, L.ankle, Math.atan2(fp.b.y - fp.a.y, fp.b.x - fp.a.x) + (L.footTilt ?? -(L.lift || 0) * 0.35));
    }
    // jetpack on the back, behind the torso
    const jr = this.jetRect(P);
    if (jr) {
      const { w: jw, h: jh, x, y } = jr;
      g.drawImage(jr.img, x, y, jw, jh);
      if (st.jetting) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const nx of [x + jw * 0.28, x + jw * 0.72]) {
          const fl = (12 + Math.random() * 14) / k * 0.5;
          g.fillStyle = '#FF8A2E'; g.beginPath(); g.moveTo(nx - 5, y + jh); g.lineTo(nx, y + jh + fl * 2); g.lineTo(nx + 5, y + jh); g.fill();
          g.fillStyle = '#FFF2B0'; g.beginPath(); g.moveTo(nx - 2.5, y + jh); g.lineTo(nx, y + jh + fl); g.lineTo(nx + 2.5, y + jh); g.fill();
        }
        g.restore();
      }
    }
    // far arm (his left): on the far side of the body, so behind the torso and head; it shows where it reaches past them
    this.part(g, 'uarmL', P.sL, ang(P.sL, P.elbowL));
    this.part(g, 'larmL', P.elbowL, ang(P.elbowL, P.handL), 'grip');
    // torso (pivots on the hips), head (turns towards the aim)
    const tp = this.rig.parts.torso;
    const hj = this.rig.joints.hip;                                               // the torso's hip point, in its own image
    g.save(); g.translate(P.hip.x, P.hip.y); g.rotate(P.lean); g.drawImage(this.img.torso, -(hj.x - tp.box.x), -(hj.y - tp.box.y)); g.restore();
    const hp = this.rig.parts.head;
    this.part(g, 'head', P.neck, Math.atan2(hp.b.y - hp.a.y, hp.b.x - hp.a.x) + P.lean + P.look);
    // the drone's tablet: in front of the body, under the tapping hand; the screen glows
    if (P.tablet) {
      // a slab seen from the side but turned a little towards us: the dark back edge, then the lit screen, foreshortened
      const T = P.tablet, tt = st.t || 0, glow = 0.82 + 0.18 * Math.sin(tt * 11);
      g.save(); g.translate(T.c.x, T.c.y); g.rotate(T.a);
      g.fillStyle = '#101216'; g.beginPath(); g.roundRect(-15, -1, 30, 4.5, 1.5); g.fill();                       // back + edge
      g.fillStyle = '#20232A'; g.beginPath(); g.moveTo(-15, 0); g.lineTo(15, 0); g.lineTo(13.5, -10); g.lineTo(-13.5, -10); g.closePath(); g.fill(); // bezel
      const sc = g.createLinearGradient(0, -9, 0, -1); sc.addColorStop(0, `rgba(55,140,225,${glow})`); sc.addColorStop(1, `rgba(125,232,255,${glow})`);
      g.fillStyle = sc; g.beginPath(); g.moveTo(-13.5, -1.2); g.lineTo(13.5, -1.2); g.lineTo(12.2, -8.8); g.lineTo(-12.2, -8.8); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(235,255,255,0.9)'; g.lineWidth = 0.7;                                                  // drone view
      g.beginPath(); g.moveTo(-3, -5); g.lineTo(3, -5); g.moveTo(0, -7.6); g.lineTo(0, -2.4); g.stroke();
      g.fillStyle = '#FF5A4E'; g.fillRect(5 + Math.sin(tt * 2) * 4, -6.8, 1.4, 1.4);
      g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(80,190,255,${0.18 * glow})`;
      g.beginPath(); g.ellipse(-3, -16, 16, 11, 0, 0, Math.PI * 2); g.fill();                                   // screen light on his face
      g.restore();
    }
    // the gun, then the near arm whose hand wraps over the grip
    if (P.weapon) {
      const W = P.weapon;
      g.save(); g.translate(W.origin.x, W.origin.y); g.rotate(W.a); g.scale(W.g, W.g);
      g.drawImage(W.art.inHand, -W.ox, -W.oy); g.restore();
    }
    this.part(g, 'uarmR', P.sR, ang(P.sR, P.elbowR));
    this.part(g, 'larmR', P.elbowR, ang(P.elbowR, P.handR), 'grip');
    g.restore();
  }

  // the head on its own, for the character picker
  faceCanvas(scale = 4) {
    const img = this.img.head, c = document.createElement('canvas'), s = Math.max(img.width, img.height);
    c.width = c.height = 16 * scale; const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; const f = c.width / s;
    g.drawImage(img, (c.width - img.width * f) / 2, (c.height - img.height * f) / 2, img.width * f, img.height * f);
    return c;
  }
}
