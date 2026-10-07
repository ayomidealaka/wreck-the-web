// Weapons, projectiles and the destruction they cause. Every weapon has a pixel-art sprite (public/art/weapons),
// its own projectile look, muzzle flash and sound. Handheld weapons are drawn in the character's hands pointing at
// the cursor; the drone is its own little machine, and airstrikes are called in on the [ key.

import { Fire } from './fire.js';

// ---------------------------------------------------------------- sprites
const IMG = {};
export const SPRITES = ['blaster', 'ak47', 'minigun', 'scatter', 'sniper', 'launcher', 'rocket', 'laser', 'well', 'flamer', 'drone', 'nuke',
  'mirv', 'star', 'wand', 'grenade', 'jetpack', 'bomb', 'jet', 'warhead'];
function scan(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, op = (x, y) => d[(y * c.width + x) * 4 + 3] > 60;
  return { w: c.width, h: c.height, op, canvas: c };
}
// muzzle = rightmost opaque column within the given rows (its middle row)
function tipOf(s, y0 = 0, y1 = s.h - 1) {
  for (let x = s.w - 1; x >= 0; x--) {
    const ys = []; for (let y = y0; y <= y1; y++) if (s.op(x, y)) ys.push(y);
    if (ys.length) return { x: x + 1, y: ys[ys.length >> 1] + 0.5 };
  }
  return { x: s.w, y: s.h / 2 };
}
export async function loadWeaponArt() {
  await Promise.all(SPRITES.map(id => new Promise(res => {
    const img = new Image(); img.onload = () => { IMG[id] = { img, ...scan(img) }; res(); }; img.onerror = res; img.src = `/art/weapons/${id}.png`;
  })));
  for (const w of WEAPONS) {
    const s = IMG[w.artId || w.id]; if (!s) continue;
    if (w.held) {
      // in the hands it's drawn at character scale (w.len px long); the full sprite stays for the weapon bar
      const k = Math.min(1, w.len / s.w), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(s.w * k)); c.height = Math.max(1, Math.round(s.h * k));
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(s.img, 0, 0, c.width, c.height);
      if (k < 1) { // keep the edges hard, like pixel art
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
        g.putImageData(d, 0, 0);
      }
      const sc = scan(c), m = tipOf(sc, 0, Math.round(sc.h * 0.75));
      w.art = { img: s.img, w: s.w, h: s.h, inHand: c, muzzle: m, hold: { x: Math.round(sc.w * w.holdAt), y: m.y + Math.round((w.gripDrop || 0) * k) } };
      if (w.port) w.art.port = { x: Math.round(sc.w * w.port), y: m.y - 1.5 };
    } else w.art = { img: s.img, w: s.w, h: s.h };
  }
  if (IMG.drone) { // the gatling hangs under the body: cut it off so it can swivel on its own
    const s = IMG.drone, cut = Math.round(s.h * 0.62);
    DRONE.classic = droneParts(crop(s.canvas, 0, 0, s.w, cut), crop(s.canvas, 0, cut, s.w, s.h - cut), s.w, 0);
  }
}
export const art = id => IMG[id];
// trimmed copy of part of a canvas
function crop(src, x, y, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, -x, -y);
  const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 40) { x0 = Math.min(x0, xx); y0 = Math.min(y0, yy); x1 = Math.max(x1, xx); y1 = Math.max(y1, yy); }
  const t = document.createElement('canvas'); t.width = Math.max(1, x1 - x0 + 1); t.height = Math.max(1, y1 - y0 + 1);
  t.getContext('2d').drawImage(c, -x0, -y0); return t;
}
// A drone as a body plus a gatling that swivels under it. bodyW = drawn width (world px); gunL = drawn gun length (0 =
// same scale as the body). The mount is the middle of the body's lowest opaque row; the gun turns on its left end.
export function droneParts(body, gun, bodyW, gunL) {
  const scan = c => { const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; return (x, y) => d[(y * c.width + x) * 4 + 3] > 60; };
  const ob = scan(body), og = scan(gun);
  let mount = { x: body.width / 2, y: body.height - 1 };
  for (let y = body.height - 1; y >= 0; y--) { const xs = []; for (let x = 0; x < body.width; x++) if (ob(x, y)) xs.push(x); if (xs.length) { mount = { x: (xs[0] + xs[xs.length - 1]) / 2, y: y - 1 }; break; } }
  let tip = { x: gun.width, y: gun.height / 2 };
  for (let x = gun.width - 1; x >= 0; x--) { const ys = []; for (let y = 0; y < gun.height; y++) if (og(x, y)) ys.push(y); if (ys.length) { tip = { x: x + 1, y: (ys[0] + ys[ys.length - 1]) / 2 }; break; } }
  const sb = bodyW / body.width, sg = gunL ? gunL / gun.width : sb;
  return { body, gun, sb, sg, mount, pivot: { x: Math.min(gun.width * 0.12, 3 / sg), y: tip.y }, tip };
}
const DRONE = {};
const LASER_REACH = 1400, LASER_CUTS = 6;   // how far the beam goes, and how many things it cuts per tick
const SLUG_BOUNCES = 3;                    // the .50 ricochets off elements this many times
const DRONE_BATTERY = 30, DRONE_RECHARGE = 8;
const JET_SCALE = 4;   // the airstrike jet, drawn at 4x its sprite (about 170px long)   // seconds of flight, then it blows up and needs this long to recharge

// ---------------------------------------------------------------- the arsenal
// held: drawn in the hands, len px long (characters are ~48px tall). pose 'rifle' = two-handed long-gun hold (stock in
// the shoulder); otherwise the arms-out pistol hold (shoulder launchers sit fine on that too). holdAt: where along the sprite the hand grips (0 = back, 1 = muzzle).
// port: where the ejection port sits along the gun (0 = back, 1 = muzzle); spent casings fly out of it.
// key: the keyboard slot. Damage follows each weapon's real-world class:
//   bullets  dmg.r = hole punched per hit (px), dmg.pen = material a round keeps tearing through (px; a letter costs 10),
//            dmg.splash = letters shaken loose around every hit
//   explosives  blast = radius (px)
export const WEAPONS = [
  { id: 'blaster', port: 0.5, key: '1', len: 13, name: 'Pistol', cd: 0.16, color: '#7CF2FF', held: true, holdAt: 0.3, gripDrop: 2, dmg: { r: 4, pen: 50, splash: 0 } },          // 9mm-class sidearm
  { id: 'ak47', port: 0.5, pose: 'rifle', key: '2', len: 30, name: 'AK-47', cd: 0.1, color: '#E0A060', held: true, holdAt: 0.42, gripDrop: 1, dmg: { r: 5, pen: 30, splash: 6 } },          // 7.62x39, 600 rpm
  { id: 'minigun', port: 0.38, pose: 'rifle', key: '3', len: 31, name: 'Minigun', cd: 0.045, color: '#FFE45C', held: true, holdAt: 0.4, gripDrop: 1, dmg: { r: 5, pen: 32, splash: 7 } },     // 7.62 NATO x6 barrels, ~3000 rpm
  { id: 'scatter', port: 0.5, pose: 'rifle', key: '4', len: 34, name: 'Shotgun', cd: 0.7, color: '#FF9A2E', held: true, holdAt: 0.42, gripDrop: 1, dmg: { r: 4, pen: 20, splash: 7 } },     // 12-gauge 00 buck + point-blank blast
  { id: 'sniper', port: 0.45, pose: 'rifle', key: '5', len: 38, name: '.50 Sniper', cd: 1.1, color: '#C9D6E3', held: true, holdAt: 0.42, gripDrop: 1, dmg: { r: 9, pen: 2400, splash: 14 } }, // .50 BMG anti-materiel: through everything
  { id: 'launcher', pose: 'rifle', key: '6', len: 28, name: 'Grenade Launcher', cd: 0.38, color: '#B5C27A', held: true, holdAt: 0.45, gripDrop: 2, blast: 64 },                  // 40mm HE
  { id: 'rocket', key: '7', len: 37, name: 'Rocket Launcher', cd: 0.8, color: '#FF5A4E', held: true, holdAt: 0.45, gripDrop: 2, blast: 86 },                      // RPG / AT4
  { id: 'flamer', pose: 'rifle', key: '8', len: 33, name: 'Flamethrower', cd: 0, color: '#FF8A2E', held: true, holdAt: 0.45, gripDrop: 1 },
  { id: 'laser', pose: 'rifle', key: '9', len: 31, name: 'Laser', cd: 0, color: '#FF3DCB', held: true, holdAt: 0.36, gripDrop: 2 },
  { id: 'well', pose: 'rifle', key: '0', len: 24, name: 'Gravity Well', cd: 1.5, color: '#B48CFF', held: true, holdAt: 0.33, gripDrop: 2 },
  { id: 'drone', key: '-', name: 'Gatling Drone', cd: 0.06, color: '#FF4A4A', held: false, dmg: { r: 4, pen: 20, splash: 4 } },
  { id: 'nuke', key: '=', len: 34, name: 'Mini Nuke', cd: 9, color: '#F5E04A', held: true, holdAt: 0.4, gripDrop: 2, blast: 190 },                                 // tactical warhead
  { id: 'mirv', pose: 'rifle', key: ',', len: 40, name: 'Cluster Launcher', cd: 1.9, color: '#FFB238', held: true, holdAt: 0.42, gripDrop: 2, blast: 46 },       // a shell that chutes down and splits into eight
  { id: 'star', pose: 'rifle', key: '.', len: 38, name: 'Pulsar', cd: 1.6, color: '#7CF2FF', held: true, holdAt: 0.4, gripDrop: 2 },                             // a neutron star: sweeping jets, then it collapses
  { id: 'wand', key: '/', len: 24, name: 'Magic Wand', cd: 2.2, color: '#FF8AE6', held: true, holdAt: 0.25, gripDrop: 1 },                                       // a spell: a ritual circle, a blast and six echoes
];
// the pulsar and the spell, by the numbers
const STAR = { radius: 42, form: 0.45, life: 4.2, collapse: 0.55, spin: 3, reach: 390, grow: 0.9 };
const SPELL = { ritual: 1.4, circle: 112, radius: 80, echoes: 6, echoRadius: 26, echoGap: 0.22, linger: 3 };
const PASTEL = ['#FFB3F0', '#C9A6FF', '#9BE7FF', '#FFF4A6', '#FFFFFF'];
const WPN = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

// bites out of a slab sprite's border, so a piece a blast tore out is not a perfect rectangle
function tearEdges(c) {
  if (!c) return;
  const g = c.getContext('2d'), W = c.width, H = c.height, k = W / (c.pageW || W), per = 2 * (W + H);
  g.globalCompositeOperation = 'destination-out';
  for (let u = 0; u < per; u += 14 * k) {
    let x, y;
    if (u < W) { x = u; y = 0; } else if (u < W + H) { x = W; y = u - W; } else if (u < 2 * W + H) { x = W - (u - W - H); y = H; } else { x = 0; y = H - (u - 2 * W - H); }
    if (Math.random() < 0.3) continue;
    g.beginPath(); g.arc(x + (Math.random() - 0.5) * 6 * k, y + (Math.random() - 0.5) * 6 * k, (4 + Math.random() * 7) * k, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}
// airstrike: not a weapon slot; [ calls one in on the cursor
const STRIKE = { cd: 4, blast: 74 };
// stickman fallback: draw the sprite with its grip at the hand
for (const w of WEAPONS) w.sprite = g => { const a = w.art; if (!a) return; if (a.hold) g.drawImage(a.inHand, -a.hold.x, -a.hold.y); else g.drawImage(a.img, -a.w * 0.3, -a.h * 0.3, a.w * 0.6, a.h * 0.6); };

// how each kind of round looks in flight: streak length = speed * len seconds (clamped), body width, colours
const ROUND = {
  bolt:   { len: 0.020, min: 14, max: 40, w: 3.4, body: '#19B6E6', core: '#E6FFFF', bloom: 'rgba(80,220,255,0.35)' },   // pistol energy bolt
  rifle:  { len: 0.020, min: 16, max: 48, w: 2.6, body: '#F07A12', core: '#FFF1C8', bloom: 'rgba(255,150,50,0.35)' },   // AK-47
  tracer: { len: 0.018, min: 14, max: 40, w: 2.3, body: '#E8A010', core: '#FFF6D6', bloom: 'rgba(255,210,80,0.3)' },    // minigun
  pellet: { len: 0.016, min: 10, max: 26, w: 2.2, body: '#E2601A', core: '#FFE0B0', bloom: 'rgba(255,140,60,0.3)' },    // shotgun
  slug:   { len: 0.016, min: 30, max: 70, w: 3.2, body: '#F2A040', core: '#FFFFFF', bloom: 'rgba(255,230,190,0.4)' },   // .50 sniper
  drone:  { len: 0.018, min: 14, max: 36, w: 2.3, body: '#E8392A', core: '#FFE2DA', bloom: 'rgba(255,110,90,0.3)' },    // drone gatling
};
const FLAME_COLS = ['#FFF6C8', '#FFE07A', '#FFB238', '#FF8A2E', '#F2552C', '#C8341E'];

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.index = 0; this.cool = 0; this.grenadeCool = 0;
    this.shots = []; this.beam = null; this.beamTick = 0;
    this.flames = []; this.burning = new Map(); this.drone = null; this.strikeCool = 0;
    this.stars = []; this.spells = []; this.chutes = []; this.burnT = 0;
    this.trails = []; this.strikes = []; this.mushrooms = []; this.popQ = []; this.clock = 0;
    this.stats = { letters: 0, shots: 0, booms: 0 };
  }
  get weapon() { return WEAPONS[this.index]; }
  select(i, step = 0) {
    const n = (i + WEAPONS.length) % WEAPONS.length;
    if (n === this.index) return;
    if (WEAPONS[n].id === 'drone' && this.droneCool > 0) {   // still recharging: skip past it when scrolling
      if (step) return this.select(n + step, step);
      this.notice = `Drone recharging: ${Math.ceil(this.droneCool)}s`; return;
    }
    if (WEAPONS[n].id === 'drone') this.prevIndex = this.index;
    this.index = n; this.game.audio.click(); this.game.player.switchedWeapon?.();
  }

  update(dt, inp) {
    const { player, fx, audio } = this.game;
    this.cool -= dt; this.grenadeCool -= dt;
    this.droneCool = Math.max(0, (this.droneCool || 0) - dt);
    if (inp.weaponNext) this.select(this.index + 1, 1);
    if (inp.weaponPrev) this.select(this.index - 1, -1);
    if (inp.weaponSlot != null && inp.weaponSlot < WEAPONS.length) this.select(inp.weaponSlot);

    const w = this.weapon, h = player.hand(), a = player.fireAim, dir = Math.cos(a) >= 0 ? 1 : -1;
    const spread = s => a + (Math.random() - 0.5) * s;
    // rounds fly only as far as the cursor: what's on the way gets hit, and if a round reaches the cursor
    // over bare page it punches a little hole in the paper there (the .50 keeps going)
    const range = inp.aimX == null ? null : Math.max(24, Math.hypot(inp.aimX - h.x, inp.aimY - h.y));
    this.beam = null;
    let laserOn = false, flameOn = false, spinOn = false;

    if (inp.fire) {
      if (w.id === 'laser') { this.laser(dt, h, a); laserOn = true; }
      else if (w.id === 'flamer') { this.flamer(dt, h, a); flameOn = true; }
      else if (w.id === 'minigun') spinOn = true;
      if (this.cool <= 0 && !['laser', 'flamer', 'drone'].includes(w.id)) {
        this.cool = w.cd; this.stats.shots++;
        const back = (k, s = 1) => h.x - Math.cos(a) * k * s;
        // where spent casings come out: the gun's ejection port when the character can tell us, else a little behind the muzzle
        const port = (k) => player.port?.() || { x: back(k), y: h.y - Math.sin(a) * k };
        if (w.id === 'blaster') {
          this.bullet(h, spread(0.02), 1500, 'bolt', w.dmg, { range }); audio.blaster(); player.recoil = 0.5;
          fx.muzzle(h.x, h.y, a, 'ring', '#9FF6FF');
        }
        if (w.id === 'ak47') {
          this.bullet(h, spread(0.05), 2000, 'rifle', w.dmg, { range }); audio.ak47(); player.recoil = 0.6;
          fx.muzzle(h.x, h.y, a, 'star', '#FFD27A', 1 + Math.random() * 0.3); fx.shake = Math.max(fx.shake, 3);
          { const q = port(10); fx.casing(q.x, q.y, dir, '#D9A63A', 3); }
          if (Math.random() < 0.4) fx.smoke(h.x, h.y, Math.cos(a) * 40, -20, 3, 0.5, 150);
        }
        if (w.id === 'minigun') {
          this.bullet(h, spread(0.1), 1850, 'tracer', w.dmg, { range }); audio.minigun(); player.recoil = 0.35;
          fx.muzzle(h.x, h.y, a, 'star', '#FFE07A', 0.8 + Math.random() * 0.4); fx.shake = Math.max(fx.shake, 2.5);
          { const q = port(14); fx.casing(q.x, q.y, dir); }
        }
        if (w.id === 'scatter') {
          for (let i = 0; i < 10; i++) this.bullet(h, spread(0.34), 1100 + Math.random() * 450, 'pellet', w.dmg, { range: range && range * (0.85 + Math.random() * 0.3) });
          this.pointBlank(h, a, 95, 0.42);
          player.push(-Math.cos(a) * 260, -Math.sin(a) * 180); audio.scatter(); player.recoil = 1; fx.shake = Math.max(fx.shake, 4); fx.kick('small');
          fx.muzzle(h.x, h.y, a, 'big', '#FFC24A', 1.2);
          for (let i = 0; i < 4; i++) fx.smoke(h.x + Math.cos(a) * 6, h.y + Math.sin(a) * 6, Math.cos(a) * 60 + (Math.random() - 0.5) * 30, Math.sin(a) * 60 - 20, 5, 0.9);
          setTimeout(() => { const q = port(10); fx.casing(q.x, q.y, dir, '#C8341E', 4); }, 300);  // pumped out
        }
        if (w.id === 'sniper') {
          this.bullet(h, a, 4200, 'slug', w.dmg, { trail: true });
          audio.sniper(); player.push(-Math.cos(a) * 220, -Math.sin(a) * 140); player.recoil = 1; fx.shake = Math.max(fx.shake, 5); fx.kick('small');
          fx.muzzle(h.x, h.y, a, 'big', '#FFF2C8', 1.5);
          for (let i = 0; i < 7; i++) { const side = (i % 2 ? 1 : -1) * (0.9 + Math.random() * 0.4); fx.smoke(h.x, h.y, Math.cos(a + side) * 90, Math.sin(a + side) * 90 - 10, 5, 1.1, 160); } // muzzle-brake blast
          setTimeout(() => { const q = port(8); fx.casing(q.x, q.y, dir, '#E0B04A', 5); }, 450);   // bolt worked
        }
        if (w.id === 'launcher') {
          this.shots.push({ kind: 'shell40', x: h.x, y: h.y, vx: Math.cos(a) * 820, vy: Math.sin(a) * 820, a, life: 3, t: 0 });
          audio.launcher(); player.recoil = 0.8; fx.muzzle(h.x, h.y, a, 'ring', '#E4F0A0', 1.1);
          for (let i = 0; i < 3; i++) fx.smoke(h.x, h.y, Math.cos(a) * 50, Math.sin(a) * 50 - 15, 5, 0.8, 130);
        }
        if (w.id === 'rocket') {
          this.shots.push({ kind: 'rocket', x: h.x, y: h.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, a, life: 4, t: 0, range });   // goes off at the cursor if nothing stops it first
          player.push(-Math.cos(a) * 140, -Math.sin(a) * 100); audio.rocketLaunch(); player.recoil = 1;
          fx.muzzle(h.x, h.y, a, 'big', '#FFB238', 0.9);
          for (let i = 0; i < 6; i++) fx.smoke(back(30), h.y - Math.sin(a) * 30, -Math.cos(a) * (60 + Math.random() * 60), -Math.sin(a) * 60 - 10, 7, 1.2);
        }
        if (w.id === 'well') {
          this.shots.push({ kind: 'well', x: h.x, y: h.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 0.85, t: 0, active: false, r: 6 });
          audio.wellFire(); player.recoil = 1; fx.muzzle(h.x, h.y, a, 'ring', '#D7B8FF');
        }
        if (w.id === 'mirv') {
          this.shots.push({ kind: 'mirv', x: h.x, y: h.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760 - 80, a, life: 9, t: 0, state: 0, bounces: 0, ct: 0 });
          audio.launcher(); player.push(-Math.cos(a) * 260, -Math.sin(a) * 160); player.recoil = 1; fx.kick('small');
          fx.muzzle(h.x, h.y, a, 'big', '#FFC24A', 1.3);
          for (let i = 0; i < 6; i++) fx.smoke(h.x, h.y, Math.cos(a) * 60 + (Math.random() - 0.5) * 40, Math.sin(a) * 60 - 20, 6, 1, 120);
        }
        if (w.id === 'star') {
          this.shots.push({ kind: 'seed', x: h.x, y: h.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, a, life: 6, t: 0, range });
          audio.starFire(); player.push(-Math.cos(a) * 140, -Math.sin(a) * 90); player.recoil = 0.9;
          fx.muzzle(h.x, h.y, a, 'ring', '#9BE7FF', 1.4);
        }
        if (w.id === 'wand') {
          this.shots.push({ kind: 'spell', x: h.x, y: h.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, a, life: 6, t: 0, range, tw: 0 });
          audio.twinkle(); player.recoil = 0.5;
          for (let i = 0; i < 8; i++) fx.spark(h.x, h.y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, PASTEL[(Math.random() * 5) | 0], 2, 0.4, { glow: true, grav: 0 });
        }
        if (w.id === 'nuke') {
          this.shots.push({ kind: 'warhead', x: h.x, y: h.y, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720 - 60, a, life: 5, t: 0, range });
          audio.nukeLaunch(); player.push(-Math.cos(a) * 320, -Math.sin(a) * 200); player.recoil = 1; fx.kick('big');
          fx.muzzle(h.x, h.y, a, 'big', '#FFE07A', 1.6);
          for (let i = 0; i < 10; i++) fx.smoke(back(20), h.y - Math.sin(a) * 20, -Math.cos(a) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 60, -Math.sin(a) * 60 - 20, 8, 1.6);
        }
      }
    }
    audio.laser(laserOn); audio.flamer(flameOn); audio.minigunSpin(spinOn);

    // the drone flies with you while it's the selected weapon
    if (w.id === 'drone') { if (!this.drone || this.drone.leaving) this.spawnDrone(); }
    else if (this.drone && !this.drone.leaving) this.drone.leaving = true;
    if (this.drone) this.updateDrone(dt, inp);
    audio.drone(!!this.drone && !this.drone.leaving);

    this.strikeCool -= dt;
    if (inp.strike && this.strikeCool <= 0) { this.strikeCool = STRIKE.cd; this.callStrike(inp.aimX ?? h.x + Math.cos(a) * 300, inp.aimY ?? h.y + Math.sin(a) * 300); }
    this.aimPt = { x: inp.aimX ?? h.x + Math.cos(a) * 300, y: inp.aimY ?? h.y + Math.sin(a) * 300 };
    // gravity well, right button held: grab debris; let go to throw it (G / Q still throw grenades)
    const grabbing = w.id === 'well' && inp.alt;
    this.updateGrab(dt, inp, grabbing, h, a);
    if ((w.id === 'well' ? inp.grenadeKey : inp.grenade) && this.grenadeCool <= 0) {
      this.grenadeCool = 0.45; this.throwIn = 0.16; player.threw?.();          // leaves the hand 47% of the way through the throw
    }
    if (this.throwIn != null && (this.throwIn -= dt) <= 0) {
      this.throwIn = null;
      const q = player.throwPoint ? player.throwPoint() : h, ta = player.fireAim;
      this.shots.push({ kind: 'grenade', x: q.x, y: q.y, vx: Math.cos(ta) * 620 + player.vx * 0.5, vy: Math.sin(ta) * 620 - 140 + player.vy * 0.3, life: 1.8, spin: 0 });
      audio.throw();
    }
    this.clock += dt;
    for (const id of [...this.game.level.loose]) { const e = this.game.level.elements[id]; this.dropElement(id, e.x + e.w / 2, e.y - 10); }   // carved past 38%
    for (const id of [...this.game.level.looseBox]) { const B = this.game.level.boxes[id]; this.dropBox(id, B.x + B.w / 2, B.y - 10); }      // worn past 38%
    this.debrisImpacts();
    if (player.dashing) this.dashCombos();
    this.updatePops();
    this.updateStrikes(dt);
    this.updateMushrooms(dt);
    for (const t of this.trails) t.life -= dt;
    this.trails = this.trails.filter(t => t.life > 0);
    this.updateFlames(dt);
    this.updateBurning(dt);
    this.updateShots(dt);
    this.updateStars(dt);
    this.updateSpells(dt);
    for (const c of this.chutes) { c.t += dt; c.vy += (28 - c.vy) * Math.min(1, dt * 1.6); c.vx -= c.vx * 0.8 * dt; c.x += (c.vx + Math.sin(c.t * 3.1) * 26) * dt; c.y += c.vy * dt; }
    this.chutes = this.chutes.filter(c => c.t < 2.4);
    // fire on the page, and the damage it does to the elements it eats into (settled four times a second)
    this.fire ||= new Fire(this.game.level, fx);
    this.fire.update(dt);
    if ((this.burnT += dt) > 0.25) {
      this.burnT = 0;
      for (const [el, d] of this.fire.damage) { const e = this.game.level.elements[el]; if (e?.alive) this.hurtElement(el, d * 1.3, e.x + e.w / 2, e.y + e.h / 2, 0, -1); }
      this.fire.damage.clear();
    }
  }

  // Falling debris that hits the page hard does damage (energy / 15, worked out in fx.update): it knocks letters off,
  // cracks or breaks elements, and dents the rest. Damage fades out below the screen (full for 200px
  // under it, gone 600px further) so avalanches you can't see don't eat the page, and a piece that breaks something
  // keeps 30% of its speed and carries on down.
  debrisImpacts() {
    const { level, fx, cam, backdrop } = this.game;
    for (const im of fx.impacts) {
      const below = im.y - (cam.y + cam.h), fade = below <= 200 ? 1 : below >= 800 ? 0 : 1 - (below - 200) / 600;
      const dmg = im.dmg * fade; if (dmg < 1) continue;
      let broke = false;
      const id = level.letterAt(im.x, im.y);
      if (id >= 0) { this.popLetter(id, (Math.random() - 0.5) * 140, -100 - Math.random() * 140); broke = true; }
      else {
        const el = level.elementAt(im.x, im.y);
        if (el >= 0) broke = this.hurtElement(el, dmg, im.x, im.y, 0, 1, 240) === 'broken';
        else if (dmg >= 3) { level.carve(im.x, im.y, Math.min(9, 2 + dmg)); backdrop.reveal(im.y - 10, im.y + 10); broke = true; }
      }
      if (dmg >= 4) for (const n of level.lettersInRadius(im.x, im.y, Math.min(18, dmg * 2))) this.popLetter(n, (Math.random() - 0.5) * 200, -120 - Math.random() * 180);
      if (broke) { im.c.vy = im.vy * 0.3; im.c.rest = 0; }
      fx.debris(im.x, im.y, level.sampleColors(im.x, im.y, 4, 4), 3, 120, -Math.PI / 2);
    }
    fx.impacts.length = 0;
  }

  // Dashing through your own fire: bullets get supercharged (4x punch-through, bigger holes, faster); your own grenades
  // and 40mm rounds get punted along the dash and go off in the air (a bigger airburst).
  dashCombos() {
    const { player, fx, audio } = this.game, top = player.y - player.height - 6, bot = player.y + 4, half = player.w / 2 + 12;
    const touching = s => Math.abs(s.x - player.x) < half && s.y > top && s.y < bot;
    for (const s of this.shots) {
      if (!touching(s)) continue;
      if (s.kind === 'bullet' && !s.charged && s.style !== 'drone') {
        s.charged = true; s.range = null; s.pen = Math.max(40, s.pen * 4); s.r *= 1.6; s.splash = (s.splash || 0) * 1.6 + 6; s.vx *= 1.5; s.vy *= 1.5; s.life += 0.4;
        fx.muzzle(s.x, s.y, Math.atan2(s.vy, s.vx), 'ring', '#9FF6FF', 1.2); audio.charge();
      } else if ((s.kind === 'grenade' || s.kind === 'shell40') && !s.punted) {
        const d = player.dashDir;
        s.punted = true; s.airburst = 0.45; s.fuse = null; s.vx = d.x * 1050; s.vy = d.y * 1050 - 160;
        fx.muzzle(s.x, s.y, Math.atan2(s.vy, s.vx), 'big', '#FFE07A', 1); audio.punt();
      }
    }
  }
  // a grenade or 40mm round shot in flight: a bigger airburst (1.75x); hit by the .50 it also sprays 16 fragments
  shotGrenade(q, by) {
    const { fx, audio } = this.game, blast = q.kind === 'shell40' ? WPN.launcher.blast : 62;
    q.life = 0;
    fx.flash = Math.max(fx.flash, 0.3);
    this.explode(q.x, q.y, blast * 1.75, 1300);
    if (by.style === 'slug') {
      for (let i = 0; i < 16; i++) this.bullet({ x: q.x, y: q.y }, i / 16 * Math.PI * 2 + Math.random() * 0.2, 1300 + Math.random() * 400, 'pellet', { r: 4, pen: 30, splash: 6 });
      audio.charge();
    }
  }
  // a punted grenade: goes off on the first thing it touches, or after a moment in the air, 1.5x the blast
  airburst(s, dt, blast, force) {
    if (s.airburst == null) return false;
    s.airburst -= dt;
    const L = this.game.level;
    const clear = s.airburst < 0.37;                                         // a moment to leave the ground it was kicked off
    if (s.airburst <= 0 || (clear && (L.hitAt(s.x, s.y) || L.solidAt(s.x, s.y + 3)))) {
      this.game.fx.flash = Math.max(this.game.fx.flash, 0.25);
      this.explode(s.x, s.y, blast * 1.5, force * 1.3); s.life = 0; return true;
    }
    return false;
  }

  bullet(h, a, speed, style, dmg, extra = {}) {
    this.shots.push({ kind: 'bullet', style, x: h.x, y: h.y, x0: h.x, y0: h.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a,
      r: dmg.r, pen: dmg.pen, splash: dmg.splash, hits: 0, life: 1.2, t: 0, ...extra });
  }
  // shotgun at contact range: the whole charge tears a cone out before it spreads
  pointBlank(h, a, range, cone) {
    const { level } = this.game;
    for (const id of level.lettersInRadius(h.x, h.y, range)) {
      const L = level.letters[id], dx = L.x + L.w / 2 - h.x, dy = L.y + L.h / 2 - h.y;
      let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < cone) { const d = Math.hypot(dx, dy) || 1, k = 520 * (1.2 - d / range); this.queuePop(id, d / 2400, dx / d * k, dy / d * k - 160); }
    }
    for (const id of level.elementsInRadius(h.x, h.y, range)) {
      const e = level.elements[id], cx = Math.max(e.x, Math.min(h.x, e.x + e.w)), cy = Math.max(e.y, Math.min(h.y, e.y + e.h));
      let da = Math.atan2(cy - h.y, cx - h.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < cone) this.hurtElement(id, 2, cx, cy, Math.cos(a), Math.sin(a), 480);
    }
  }
  // letters knocked off in a moment's time (shockwaves travel outwards; big blasts spread the work over frames)
  queuePop(id, delay, vx, vy, burnt = false) { this.popQ.push({ id, at: this.clock + delay, vx, vy, burnt }); this.popQSorted = false; }
  updatePops() {
    if (!this.popQ.length) return;
    if (!this.popQSorted) { this.popQ.sort((p, q) => p.at - q.at); this.popQSorted = true; }
    let n = 0;
    while (n < this.popQ.length && n < 90 && this.popQ[n].at <= this.clock) n++;
    for (const p of this.popQ.splice(0, n)) this.popLetter(p.id, p.vx, p.vy, p.burnt);
  }

  // marches a segment through the grid; returns the first point that hits real content
  trace(x0, y0, x1, y1) {
    const L = this.game.level, d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 2));
    for (let i = 1; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (L.hitAt(x, y)) return { x, y };
    }
    return null;
  }

  popLetter(id, vx, vy, burnt = false) {
    const { level, fx, backdrop, audio } = this.game;
    const piece = level.detachLetter(id);
    if (!piece) return null;
    this.stats.letters++;
    this.burning.delete(id);
    if (!piece.patched) backdrop.reveal(piece.y - piece.h, piece.y + piece.h);
    if (!piece.sprite) { audio.pop(); return piece; }                       // an empty letter box: nothing to throw
    if (burnt) { // charred: darken the cut-out
      const g = piece.sprite.getContext('2d');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,14,8,0.78)'; g.fillRect(0, 0, piece.sprite.width, piece.sprite.height);
      g.globalCompositeOperation = 'source-over';
    }
    fx.chunk(piece, vx, vy);
    audio.pop();
    return piece;
  }

  // ---------------------------------------------------------------- page elements with hit points
  // Damage an element (image, icon, button...): it cracks, and comes loose when its hit points run out.
  // (ux, uy) = the direction the damage came from.
  hurtElement(id, dmg, hx, hy, ux = 0, uy = -1) {
    const { level, fx, audio } = this.game, parent = level.elements[id]?.parent ?? -1, r = level.damageElement(id, dmg, hx, hy);
    if (r === 'hit') { if (Math.random() < 0.6) audio.crack(); fx.debris(hx, hy, level.sampleColors(hx, hy, 4, 6), 3, 140, Math.atan2(-uy, -ux)); }
    if (r === 'broken') this.dropElement(id, hx, hy);
    if (r && parent >= 0) this.hurtBox(level.boxes[parent].alive ? parent : level.boxAt(hx, hy), dmg, hx, hy);   // the card it's in takes it too
    return r;
  }
  // a container (card, panel) takes damage from hits on what's inside it; it comes loose when its hit points run out
  hurtBox(id, dmg, hx, hy) {
    const { level } = this.game;
    if (id < 0 || !level.boxes[id]?.alive) return null;
    const r = level.damageBox(id, dmg, hx, hy);
    if (r === 'broken') this.dropBox(id, hx, hy);
    return r;
  }
  // a container comes loose: it falls as one piece with everything in it, like an element does
  dropBox(id, hx, hy) {
    const { level } = this.game, piece = level.detachBox(id);
    if (!piece) return;
    this.launchPiece(piece, hx, hy);
    this.stats.elements = (this.stats.elements || 0) + 1 + piece.elements; this.stats.letters += piece.letters;
  }
  // It falls off the page as one piece, the text on it included: pushed away from the blow, big things slowly (a
  // big panel drops, a small icon gets flung), with dust off its edges. Shoot it while it falls and it shatters.
  dropElement(id, hx, hy) {
    const piece = this.game.level.detachElement(id);
    if (!piece) return;
    this.launchPiece(piece, hx, hy);
    this.stats.elements = (this.stats.elements || 0) + 1; this.stats.letters += piece.letters;
  }
  launchPiece(piece, hx, hy) {
    const { fx, backdrop, audio, level } = this.game;
    // knocked out by a blast: the hole it leaves and the piece itself get torn, ragged edges rather than a clean rectangle
    if (this.blasting) { level.raggedEdge(piece.x - piece.w / 2, piece.y - piece.h / 2, piece.w, piece.h); tearEdges(piece.sprite); }
    const area = Math.max(1, piece.w * piece.h), sp = Math.max(15, Math.min(380, 2600 / Math.sqrt(area)));
    const cx = piece.x, cy = piece.y, d = Math.hypot(cx - (hx ?? cx), cy - (hy ?? cy + 1)) || 1;
    const vx = (cx - (hx ?? cx)) / d * sp * 1.4, vy = (cy - (hy ?? cy + 1)) / d * sp * 1.4 - 120;
    const c = fx.chunk({ ...piece, slab: true }, vx, vy);
    if (c) c.va = (Math.random() * 3 - 1.5) * Math.min(3, 300 / Math.sqrt(area));
    backdrop.reveal(piece.y - piece.h / 2 - 4, piece.y + piece.h / 2 + 4);
    for (let i = 0; i < 24; i++) { // dust off its edges
      const u = Math.random(), side = (Math.random() * 4) | 0;
      const x = side < 2 ? cx - piece.w / 2 + u * piece.w : side === 2 ? cx - piece.w / 2 : cx + piece.w / 2;
      const y = side >= 2 ? cy - piece.h / 2 + u * piece.h : side === 0 ? cy - piece.h / 2 : cy + piece.h / 2;
      fx.smoke(x, y, (Math.random() - 0.5) * 30, -20, 3, 0.5, 170);
    }
    fx.kick(area > 40000 ? 'big' : 'small');
    audio.tearOff(Math.sqrt(area));
  }
  // a falling (or fallen) element hit hard: it breaks into tiles of itself
  shatterSlab(c, hx, hy, force = 320) {
    const { fx, audio, level } = this.game;
    const i = fx.chunks.indexOf(c); if (i < 0) return; fx.chunks.splice(i, 1);
    const max = level.maxShards, tile = Math.max(12, Math.sqrt(c.w * c.h / max));
    const nx = Math.max(1, Math.round(c.w / tile)), ny = Math.max(1, Math.round(c.h / tile)), pw = c.w / nx, ph = c.h / ny;
    const sx = c.sprite.width / nx, sy = c.sprite.height / ny, cos = Math.cos(c.a), sin = Math.sin(c.a);
    // which tiles of it are holes: one read of the whole slab, not two per shard
    const SW = c.sprite.width, SH = c.sprite.height, px = c.sprite.getContext('2d').getImageData(0, 0, SW, SH).data;
    const solidAt = (x, y) => px[(Math.min(SH - 1, y | 0) * SW + Math.min(SW - 1, x | 0)) * 4 + 3] > 0;
    for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
      if (!solidAt((k + 0.5) * sx, (j + 0.5) * sy) && !solidAt(k * sx, j * sy)) continue;   // a hole: nothing there
      const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(sx)); t.height = Math.max(1, Math.round(sy));
      const tg = t.getContext('2d'); tg.drawImage(c.sprite, -k * sx, -j * sy);
      t.pageW = pw; t.pageH = ph;
      const lx = -c.w / 2 + (k + 0.5) * pw, ly = -c.h / 2 + (j + 0.5) * ph, x = c.x + lx * cos - ly * sin, y = c.y + lx * sin + ly * cos;
      const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy) || 1, f = force * (0.4 + Math.random() * 0.7);
      const p = fx.chunk({ sprite: t, x, y, w: pw, h: ph }, dx / d * f + c.vx * 0.5, dy / d * f * 0.7 + c.vy * 0.3 - 140);
      if (p) p.a = c.a;
    }
    fx.debris(hx, hy, level.sampleColors(hx, hy, 6, 6), 10, 260);
    fx.kick(c.w * c.h > 40000 ? 'big' : 'small');
    audio.shatter(Math.sqrt(c.w * c.h));
  }
  // first falling element a segment passes through (rotation ignored: they barely turn)
  slabOnPath(x0, y0, x1, y1) {
    let best = null, bt = 2;
    for (const c of this.game.fx.chunks) {
      if (!c.slab) continue;
      const L = c.x - c.w / 2, R = c.x + c.w / 2, T = c.y - c.h / 2, B = c.y + c.h / 2, dx = x1 - x0, dy = y1 - y0;
      let t0 = 0, t1 = 1;
      for (const [p, q] of [[-dx, x0 - L], [dx, R - x0], [-dy, y0 - T], [dy, B - y0]]) {
        if (p === 0) { if (q < 0) { t0 = 2; break; } continue; }
        const r = q / p; if (p < 0) { if (r > t1) { t0 = 2; break; } if (r > t0) t0 = r; } else { if (r < t0) { t0 = 2; break; } if (r < t1) t1 = r; }
      }
      if (t0 <= 1 && t0 < bt) { bt = t0; best = { c, x: x0 + dx * t0, y: y0 + dy * t0 }; }
    }
    return best;
  }

  // one round meeting the page; returns how much of its penetration it used up
  hit(x, y, vx, vy, s, loud = true) {
    const { level, fx, backdrop } = this.game, style = s.style;
    const id = level.letterAt(x, y);
    const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
    const col = { bolt: '#9FF6FF', tracer: '#FFE07A', rifle: '#FFC266', slug: '#FFFFFF', pellet: '#FFB238', drone: '#FF8A6A' }[style] || '#FFF6C8';
    const kick = (f = 1) => [ux * (260 + Math.random() * 220) * f + (Math.random() - 0.5) * 160, uy * 240 * f - 180 - Math.random() * 220];
    const shake = () => { if (s.splash) for (const n of level.lettersInRadius(x, y, s.splash)) this.popLetter(n, ...kick(s.style === 'slug' ? 1.6 : 1)); };
    if (loud && style === 'bolt') { fx.muzzle(x, y, Math.atan2(uy, ux) + Math.PI, 'ring', col); for (let i = 0; i < 5; i++) fx.spark(x, y, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, col, 2, 0.25, { glow: true, grav: 0.2 }); }
    s.met = id >= 0 ? 'letter' : level.elementAt(x, y) >= 0 ? 'element' : 'other';
    if (id >= 0) {
      this.hurtBox(level.boxAt(x, y), 0.15, x, y);                          // the card the text is in feels it a little (mostly it wears down)
      this.popLetter(id, ...kick(style === 'slug' ? 1.8 : 1));
      shake();
      if (loud) fx.spark(x, y, 0, 0, '#FFF6C8', 4, 0.05, { glow: true, grav: 0 });
      return 10;
    }
    // an element: the round carves its hole as usual AND does damage; it stops there (the .50 goes on through)
    const el = level.elementAt(x, y);
    if (el >= 0) {
      // the hole is a short tunnel along the shot (two smaller bites further in while there's still
      // something there), chips of the element break off it, the dust is the element's own colours (two thirds blown
      // on through the hole, a third back at you) and the rim glows hot for a moment
      const slug = style === 'slug', K = s.r * 1.2, cols = loud ? level.sampleColors(x, y, K + 2, 12) : null;
      const chips = loud ? this.spall(x, y, 1 + (Math.random() * 2.2 | 0)) : [];
      this.hurtElement(el, slug ? 6 : 1, x, y, ux, uy);
      if (level.elements[el]?.alive) {
        level.carve(x, y, K);
        for (const [d, f] of [[0.9, 0.72], [1.75, 0.5]]) { const tx = x + ux * K * d, ty = y + uy * K * d; if (level.elementAt(tx, ty) === el) level.carve(tx, ty, K * f, false); }
        backdrop.reveal(y - K * 2.5, y + K * 2.5);
        fx.heat(x, y, K);
        for (const c of chips) fx.chunk(c, -ux * (60 + Math.random() * 120) + (Math.random() - 0.5) * 140, -uy * 80 - 120 - Math.random() * 160);
      }
      if (slug) shake();                                                     // anti-materiel: still tears letters loose around it
      if (loud) { this.dust(x, y, ux, uy, cols, 8, 240); fx.spark(x, y, 0, 0, '#FFF6C8', 4, 0.05, { glow: true, grav: 0 }); }
      return slug ? 14 : 60;
    }
    const cols = loud ? level.sampleColors(x, y, s.r + 2, 10) : null;
    level.carve(x, y, s.r); backdrop.reveal(y - s.r, y + s.r); fx.heat(x, y, s.r);
    shake();
    if (loud) {
      this.dust(x, y, ux, uy, cols, style === 'slug' ? 12 : 6, style === 'slug' ? 420 : 260);
      fx.spark(x, y, 0, 0, '#FFF6C8', 5, 0.06, { glow: true, grav: 0 });
      if (style !== 'bolt' && style !== 'pellet') fx.smoke(x, y, -ux * 30, -20, 3, 0.5, 150);
    }
    return s.r * 2;
  }

  // impact dust in the page's own colours: two thirds sprayed on along the shot, a third back towards the shooter
  dust(x, y, ux, uy, cols, n, speed) {
    const fx = this.game.fx, fwd = Math.round(n * 0.66);
    fx.debris(x, y, cols, fwd, speed * 0.8, Math.atan2(uy, ux));
    fx.debris(x, y, cols, n - fwd, speed, Math.atan2(-uy, -ux));
  }
  // a few small chips cut from the page around a hit (before the hole is carved), ready to fly off as debris
  spall(x, y, n) {
    const level = this.game.level, out = [];
    for (let i = 0; i < n; i++) {
      const w = 3 + (Math.random() * 4 | 0), h = 3 + (Math.random() * 4 | 0), cx = x + (Math.random() - 0.5) * 8, cy = y + (Math.random() - 0.5) * 8;
      if (!level.hitAt(cx, cy)) continue;
      out.push({ sprite: level.copyRegion(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h), x: cx, y: cy, w, h });
    }
    return out;
  }
  // the .50's round gouges a thin trench through everything along its way, page included: a 3.5px cut every 4px, scorched lightly
  trench(x0, y0, x1, y1) {
    const { level, backdrop } = this.game, d = Math.hypot(x1 - x0, y1 - y0); if (d < 1) return;
    for (let u = 0; u < d; u += 4) {
      const x = x0 + (x1 - x0) * u / d, y = y0 + (y1 - y0) * u / d;
      if (x < 0 || x >= level.W || y < 0 || y >= level.H) continue;
      level.carve(x, y, 3.5, false);
    }
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    if (yb >= 0 && ya <= level.H) backdrop.reveal(ya - 6, yb + 6);
    level.scorch(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5, 0, 0, 0, [x0, y0, x1, y1]);
  }
  // a round that reaches the cursor over bare page: a small scorched hole in the paper, a white flash, paper bits
  paperHole(s) {
    const { level, fx, backdrop, audio } = this.game, x = s.x, y = s.y;
    if (x < 0 || x >= level.W || y < 0 || y >= level.H || level.hitAt(x, y)) return;
    const r = (s.style === 'drone' ? 3.6 : s.style === 'tracer' || s.style === 'pellet' ? 2.2 : 2.8) * (s.charged ? 1.6 : 1);
    const cols = level.sampleColors(x, y, r + 3, 6);
    level.paperHole(x, y, r); backdrop.reveal(y - r - 3, y + r + 3);
    fx.heat(x, y, r);
    fx.spark(x, y, 0, 0, '#FFFFFF', 5, 0.05, { glow: true, grav: 0 });
    fx.debris(x, y, cols, 3, 120, Math.atan2(-s.vy, -s.vx));
    audio.paperHit?.();
  }

  explode(x, y, r, force = 900) {
    this.blasting = true;
    try { this.explodeNow(x, y, r, force); } finally { this.blasting = false; }
  }
  explodeNow(x, y, r, force) {
    const { level, fx, backdrop, player, audio } = this.game;
    this.stats.booms++;
    for (const id of level.lettersInRadius(x, y, r * 1.2)) {
      const w = level.letters[id], dx = w.x + w.w / 2 - x, dy = w.y + w.h / 2 - y, d = Math.hypot(dx, dy) || 1;
      const k = force * (0.6 + 0.6 * (1 - Math.min(1, d / (r * 1.2))));
      this.queuePop(id, d / 1800, dx / d * k * (0.6 + Math.random() * 0.6), dy / d * k * 0.8 - 260 - Math.random() * 300, d < r * 0.6);
    }
    // pieces already falling in the blast shatter (not ones this blast knocks loose: those are seen falling first)
    for (const c of fx.chunks.slice()) if (c.slab && Math.hypot(c.x - x, c.y - y) < r + Math.min(c.w, c.h) / 2) this.shatterSlab(c, x, y, force * 0.5);
    // elements and containers in the blast: damage falls off with distance; a rocket is worth about six pistol rounds: it takes out a 300x200 image, a hero section takes about four
    for (const id of level.elementsInRadius(x, y, r * 1.2)) {
      const e = level.elements[id], nx = Math.max(e.x, Math.min(x, e.x + e.w)), ny = Math.max(e.y, Math.min(y, e.y + e.h));
      const d = Math.hypot(nx - x, ny - y), u = d ? [(nx - x) / d, (ny - y) / d] : [0, -1];
      this.hurtElement(id, Math.max(1, r * 0.09 * (1 - d / (r * 1.2))), nx, ny, u[0], u[1]);
    }
    for (const id of level.boxesInRadius(x, y, r)) {
      const B = level.boxes[id]; if (!B.alive) continue;
      const nx = Math.max(B.x, Math.min(x, B.x + B.w)), ny = Math.max(B.y, Math.min(y, B.y + B.h)), d = Math.hypot(nx - x, ny - y);
      this.hurtBox(id, Math.max(0.5, r * 0.07 * (1 - d / r)), nx, ny);
    }
    const cols = level.sampleColors(x, y, r, 50);
    level.carve(x, y, r, false); level.scorch(x, y, r * 0.92, r * 1.7, 1); backdrop.reveal(y - r - 8, y + r + 8);
    fx.explosion(x, y, r);
    fx.debris(x, y, cols, Math.round(r * 0.9), 460);
    for (let i = 0; i < r * 0.25; i++) { const an = Math.random() * Math.PI * 2, d = Math.random() * r * 0.6; fx.smoke(x + Math.cos(an) * d, y + Math.sin(an) * d, Math.cos(an) * 40, -30 - Math.random() * 40, 8 + Math.random() * 8, 1.4 + Math.random(), 55); }
    fx.impulse(x, y, r * 3, force * 0.9);
    // set what's left nearby on fire: letters, and for the bigger blasts a few spots of page along the rim
    for (const id of level.lettersInRadius(x, y, r * 1.6)) if (Math.random() < 0.25) this.ignite(id);
    if (r >= 40 && this.fire) for (let i = 0; i < 2 + r / 25; i++) { const an = Math.random() * Math.PI * 2, d = r * (1 + Math.random() * 0.5); this.fire.heatAt(x + Math.cos(an) * d, y + Math.sin(an) * d, 1, 3); }
    const hx = player.x, hy = player.y - player.height / 2, dx = hx - x, dy = hy - y, d = Math.hypot(dx, dy) || 1;
    if (d < r * 2.2) { const k = force * 0.62 * (1 - d / (r * 2.2)); player.push(dx / d * k, dy / d * k - k * 0.3); } // rocket-jumps
    audio.boom(r);
  }

  // The laser: a straight beam to the aim point (1400px at most) that cuts everything along it. Letters pop, elements
  // are burned through and carved, and where it ends over bare page it burns a hole. It eats through a few things a
  // tick, nearest first, so a block of text goes in a sweep rather than all at once.
  laser(dt, h, a) {
    const { level, fx, backdrop } = this.game, ux = Math.cos(a), uy = Math.sin(a);
    const reach = this.aimPt ? Math.min(LASER_REACH, Math.max(24, Math.hypot(this.aimPt.x - h.x, this.aimPt.y - h.y))) : LASER_REACH;
    const end = { x: h.x + ux * reach, y: h.y + uy * reach };
    this.beam = { segs: [{ x0: h.x, y0: h.y, x1: end.x, y1: end.y }], hit: false };
    if (Math.random() < 0.6) { const u = Math.random(); fx.spark(h.x + ux * reach * u, h.y + uy * reach * u, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, '#FF7DE0', 2, 0.2, { glow: true, grav: 0 }); }
    this.beamTick -= dt;
    if (this.beamTick > 0) return;
    this.beamTick = 0.02; this.stats.shots++;
    let cut = 0, lastEl = -1, lastCarve = -99;
    for (let u = 0; u <= reach && cut < LASER_CUTS; u += 3) {
      const x = h.x + ux * u, y = h.y + uy * u;
      if (!level.hitAt(x, y)) continue;
      this.beam.hit = true;
      const id = level.letterAt(x, y);
      if (id >= 0) {
        this.popLetter(id, ux * 240 + (Math.random() - 0.5) * 100, -200 - Math.random() * 220); cut++;
        for (let i = 0; i < 2; i++) fx.spark(x, y, (Math.random() - 0.5) * 320, -Math.random() * 320, Math.random() < 0.5 ? '#FF3DCB' : '#FFFFFF', 2, 0.35, { glow: true });
        continue;
      }
      const el = level.elementAt(x, y);
      if (el >= 0 && el !== lastEl) { this.hurtElement(el, 0.12, x, y, ux, uy); lastEl = el; cut++; }
      if (u - lastCarve >= 6 && (el < 0 || level.elements[el]?.alive)) { level.carve(x, y, 4, true); lastCarve = u; backdrop.reveal(y - 8, y + 8); }
      if (Math.random() < 0.15) fx.smoke(x, y, 0, -40, 4, 0.7, 90);
    }
    if (reach < LASER_REACH && end.x >= 0 && end.x < level.W && end.y >= 0 && end.y < level.H && !level.hitAt(end.x, end.y)) {
      level.carve(end.x, end.y, 5, true); backdrop.reveal(end.y - 8, end.y + 8); fx.heat(end.x, end.y, 5);   // burning the paper at the aim
    }
  }

  // ---------------------------------------------------------------- cluster launcher
  // The shell arcs, pops a parachute once it is falling (or has bounced), drifts down swaying, and splits into eight
  // bomblets just above whatever is below it. Each bomblet falls, maybe bounces once, and goes off on a short fuse.
  stepMirv(s, dt) {
    const { level, fx, audio } = this.game;
    s.t += dt;
    if (s.state === 0) {
      s.vy += 1178 * dt; s.a = Math.atan2(s.vy, s.vx);
      if (Math.random() < 0.6) fx.smoke(s.x, s.y, -s.vx * 0.1, -s.vy * 0.1, 3, 0.5, 120);
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (nx < 8 || nx > level.W - 8) s.vx = -s.vx * 0.5; else s.x = nx;
      if (s.vy > 0 && level.hitAt(s.x, ny + 6)) { s.vy = -Math.abs(s.vy) * 0.45; s.vx *= 0.7; s.bounces++; fx.debris(s.x, ny + 6, level.sampleColors(s.x, ny + 6, 6, 5), 5, 120, -Math.PI / 2); audio.tick(); }
      else if (s.vy < 0 && level.hitAt(s.x, ny - 6)) s.vy = -s.vy * 0.3;
      else s.y = ny;
      if ((s.t > 0.42 && s.vy > 30) || s.bounces > 0) {
        s.state = 1; s.ct = 0; audio.split();
        fx.rings.push({ x: s.x, y: s.y - 20, r: 4, max: 34, t: 0, dur: 0.22 });
        for (let i = 0; i < 8; i++) fx.spark(s.x, s.y - 16, (Math.random() - 0.5) * 240, -40 - Math.random() * 140, Math.random() < 0.5 ? '#FFF4A6' : '#FF8A2E', 2, 0.5);
      }
      if (s.y > level.H + 200) s.life = 0;
      return;
    }
    s.ct += dt; s.vy += (62 - s.vy) * Math.min(1, dt * 4.5); s.vx -= s.vx * 1.8 * dt;
    const nx = s.x + (s.vx + Math.cos(s.ct * 2.4) * 22) * dt, ny = s.y + s.vy * dt;
    if (nx > 8 && nx < level.W - 8) s.x = nx;
    if (!level.hitAt(s.x, ny + 6)) s.y = ny;
    s.a += (Math.PI / 2 + Math.sin(s.ct * 2.4) * 0.3 - s.a) * Math.min(1, dt * 7);
    let groundNear = false; for (let d = 6; d <= 95 && !groundNear; d += 6) if (level.hitAt(s.x, s.y + d)) groundNear = true;
    if (s.ct > 1.8 || (s.ct > 0.55 && groundNear) || s.y > level.H - 40) this.splitMirv(s);
  }
  splitMirv(s) {
    const { fx, audio } = this.game, n = 8;
    s.life = 0; audio.split(); fx.flash = Math.max(fx.flash, 0.12);
    fx.rings.push({ x: s.x, y: s.y, r: 4, max: 40, t: 0, dur: 0.24 });
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n - 0.5;
      this.shots.push({ kind: 'bomblet', x: s.x, y: s.y + 4, vx: k * 620 + (Math.random() - 0.5) * 120 + s.vx * 0.3, vy: -240 + Math.random() * 200, a: Math.random() * 6.28, av: (Math.random() - 0.5) * 28, t: 0, life: 6, fuse: 1.3 + Math.random() * 0.6, bounced: false });
    }
    this.chutes.push({ x: s.x, y: s.y - 22, vx: s.vx * 0.5 + (Math.random() - 0.5) * 80, vy: -90, t: 0 });
  }
  stepBomblet(s, dt) {
    const { level, fx } = this.game, R = WPN.mirv.blast;
    s.t += dt; s.fuse -= dt; s.vy += 1900 * dt; s.vx -= s.vx * 0.3 * dt; s.a += s.av * dt;
    if (Math.random() < 0.7) fx.spark(s.x + Math.sin(s.a) * 7, s.y - Math.cos(s.a) * 7, (Math.random() - 0.5) * 120, -20 - Math.random() * 100, Math.random() < 0.5 ? '#FFF4A6' : '#FF8A2E', 2, 0.1, { glow: true, grav: 0 });
    if (s.fuse <= 0) { this.explode(s.x, s.y, R, 900); s.life = 0; return; }
    const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
    if (nx < 4 || nx > level.W - 4) s.vx = -s.vx * 0.5; else s.x = nx;
    if (s.vy > 0 && level.hitAt(s.x, ny + 5) && s.t > 0.12) {
      if (!s.bounced && Math.random() < 0.35) { s.bounced = true; s.vy = -s.vy * 0.4; s.vx *= 0.7; s.av *= -0.6; return; }
      this.explode(s.x, ny - 3, R, 900); s.life = 0; return;
    }
    if (s.vy < 0 && level.hitAt(s.x, ny - 5)) { s.vy = -s.vy * 0.3; return; }
    s.y = ny;
    if (s.y > level.H + 20) { this.explode(s.x, level.H, R, 900); s.life = 0; }
  }

  // ---------------------------------------------------------------- the pulsar
  // A star forms where the seed lands. For four seconds two jets sweep round it, growing out to STAR.reach: they cut
  // rings through everything they cross and fling the letters inward, while debris is pulled in. Then it collapses,
  // pulling harder, and bursts: a crater, a wide scorch and a score of radial cracks.
  formStar(x, y) {
    const { fx, audio } = this.game;
    if (this.stars.length >= 2) this.stars.shift();
    this.stars.push({ x, y, t: 0, prev: Math.random() * Math.PI * 2, sweep: 0 });
    audio.starForm();
    fx.rings.push({ x, y, r: STAR.radius * 5.5, max: STAR.radius, t: 0, dur: 0.32 }, { x, y, r: STAR.radius * 3.4, max: STAR.radius * 0.8, t: 0, dur: 0.22 });
    fx.flash = Math.max(fx.flash, 0.25);
  }
  updateStars(dt) {
    const { level, fx, audio, player } = this.game, S = STAR;
    for (const st of this.stars) {
      const was = st.t; st.t += dt;
      const end = S.form + S.life;
      if (st.t >= end + S.collapse) { this.starBlast(st); st.dead = true; continue; }
      if (was < end && st.t >= end) { audio.starCollapse(); fx.rings.push({ x: st.x, y: st.y, r: S.radius * 6, max: S.radius, t: 0, dur: S.collapse }); }
      if (st.t < S.form) continue;
      if (st.t < end) {
        // the jets, sweeping from the last angle to this one
        const len = S.radius + (S.reach - S.radius) * Math.min(1, (st.t - S.form) / (S.life * S.grow)), a1 = st.prev + S.spin * dt;
        st.len = len;
        const steps = Math.max(1, Math.ceil(len * (a1 - st.prev) / 8));
        for (let j = 0; j < 2; j++) for (let i = 1; i <= steps; i++) {
          const an = st.prev + (a1 - st.prev) * i / steps + j * Math.PI, ca = Math.cos(an), sa = Math.sin(an);
          for (let rr = S.radius * 0.3; rr <= len; rr += 9) {
            const x = st.x + ca * rr, y = st.y + sa * rr;
            if (x < 0 || x >= level.W || y < 0 || y >= level.H) continue;
            const id = level.letterAt(x, y);
            if (id >= 0) { this.popLetter(id, -ca * 500 - sa * 300, -sa * 500 + ca * 300 - 100, true); continue; }
            const el = level.elementAt(x, y);
            if (el >= 0) this.hurtElement(el, 0.04, x, y, -ca, -sa);
            if (el < 0 || level.elements[el]?.alive) level.carve(x, y, 3 + rr * 0.02, false);   // the page too, not just what stands on it
          }
        }
        st.prev = a1;
        if ((st.sweep += S.spin * dt) >= Math.PI) { st.sweep -= Math.PI; audio.starSweep(); }
        fx.impulse(st.x, st.y, S.reach, -500 * dt);
        if (Math.random() < 0.5) { const an = Math.random() * Math.PI * 2, d = S.radius * (1 + Math.random() * 4); fx.spark(st.x + Math.cos(an) * d, st.y + Math.sin(an) * d, -Math.cos(an) * 300, -Math.sin(an) * 300, Math.random() < 0.4 ? '#FFFFFF' : '#7CF2FF', 2, 0.3, { glow: true, grav: 0 }); }
        fx.shake = Math.max(fx.shake, 1.2);
      } else {
        // collapsing: everything streams in
        fx.impulse(st.x, st.y, S.reach * 1.2, -2600 * dt);
        for (let i = 0; i < 6; i++) { const an = Math.random() * Math.PI * 2, d = S.radius * (2 + Math.random() * 5); fx.spark(st.x + Math.cos(an) * d, st.y + Math.sin(an) * d, -Math.cos(an) * 600 + Math.sin(an) * 200, -Math.sin(an) * 600 - Math.cos(an) * 200, Math.random() < 0.5 ? '#FFFFFF' : '#9BE7FF', 2, 0.35, { glow: true, grav: 0 }); }
        fx.shake = Math.max(fx.shake, 3);
      }
      const dx = player.x - st.x, dy = player.y - player.height / 2 - st.y, d = Math.hypot(dx, dy) || 1;
      if (d < S.reach) player.push(-dx / d * 900 * dt, -dy / d * 900 * dt);           // it pulls at you too
    }
    this.stars = this.stars.filter(s => !s.dead);
  }
  starBlast(st) {
    const { level, fx, audio, player } = this.game, h = STAR.radius, x = st.x, y = st.y, U = h * 2.2;
    audio.starEnd();
    this.explode(x, y, U, 1800);
    level.scorch(x, y, U, h * 4.2, 1);
    for (const id of level.lettersInRadius(x, y, h * 8)) { const L = level.letters[id], dx = L.x - x, dy = L.y - y, d = Math.hypot(dx, dy) || 1, k = 1300 * (1 - d / (h * 8)); this.queuePop(id, d / 2200, dx / d * k, dy / d * k - 150); }
    // radial cracks: a score of trenches out from the crater, a few of them long, tapering as they go
    const n = 18 + (Math.random() * 9 | 0);
    for (let i = 0; i < n; i++) {
      const an = i / n * Math.PI * 2 + (Math.random() - 0.5) * 0.24, far = Math.random() < 0.3, len = far ? h * (3.2 + Math.random() * 2.3) : h * (1.2 + Math.random() * 1.8), w = h * (0.28 + Math.random() * 0.22) * (far ? 1.15 : 1);
      level.carveLine(x + Math.cos(an) * U * 0.7, y + Math.sin(an) * U * 0.7, x + Math.cos(an) * (U + len), y + Math.sin(an) * (U + len), w / 2, 1.5);
    }
    for (const c of this.spall(x, y, 14 + (Math.random() * 6 | 0))) fx.chunk(c, (Math.random() - 0.5) * 600, -200 - Math.random() * 500);
    fx.rings.push({ x, y, r: h * 1.2, max: h * 9, t: 0, dur: 0.5 }, { x, y, r: h * 0.8, max: h * 6, t: 0, dur: 0.65 });
    fx.flash = 1; fx.flashHold = 0.08; fx.kick('huge');
    for (let i = 0; i < 160; i++) { const an = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 900; fx.spark(x, y, Math.cos(an) * sp, Math.sin(an) * sp, Math.random() < 0.3 ? '#FFFFFF' : '#7CF2FF', 2 + (Math.random() * 2 | 0), 0.3 + Math.random() * 0.6, { glow: true, grav: 0.3 }); }
    const dx = player.x - x, dy = player.y - player.height / 2 - y, d = Math.hypot(dx, dy) || 1;
    if (d < h * 7) { const k = 1500 * Math.pow(1 - d / (h * 7), 0.75); player.push(dx / d * k, dy / d * k - k * 0.3); }
  }

  // ---------------------------------------------------------------- the wand
  // The spell lands and draws a ritual circle: sparks orbit it for a moment, then it bursts (the letters at its heart
  // vanish in sparkles, the rest are flung, the page gets a crater), and six smaller echoes pop round the circle.
  updateSpells(dt) {
    const { level, fx, audio } = this.game, P = SPELL;
    for (const sp of this.spells) {
      const was = sp.t; sp.t += dt;
      if (sp.t < P.ritual) {
        const k = sp.t / P.ritual;
        for (let i = 0; i < 2 + Math.round(4 * k); i++) {
          const an = Math.random() * Math.PI * 2, rr = P.circle * (1.05 + Math.random() * 1.5), tang = (1.6 + 4 * k) * rr * 0.5;
          fx.spark(sp.x + Math.cos(an) * rr, sp.y + Math.sin(an) * rr, -Math.sin(an) * tang - Math.cos(an) * (40 + 200 * k), Math.cos(an) * tang - Math.sin(an) * (40 + 200 * k), PASTEL[(Math.random() * 5) | 0], 1 + (Math.random() * 3 | 0), 0.8 + Math.random() * 0.7, { glow: true, grav: 0 });
        }
        if (Math.floor(sp.t / 0.15) !== Math.floor(was / 0.15)) audio.twinkle(0.5 + k * 0.5);
        fx.shake = Math.max(fx.shake, 1 + 2 * k);
        continue;
      }
      if (was < P.ritual) {
        // the blast
        audio.wandBlast();
        for (const id of level.lettersInRadius(sp.x, sp.y, P.radius * 1.1)) {
          const L = level.letters[id], cx = L.x + L.w / 2, cy = L.y + L.h / 2;
          if (level.killLetter(id)) { this.stats.letters++; for (let i = 0; i < 3; i++) fx.spark(cx, cy, (cx - sp.x) * 2 + (Math.random() - 0.5) * 200, (cy - sp.y) * 2 - 100 - Math.random() * 200, PASTEL[(Math.random() * 5) | 0], 2, 0.6 + Math.random() * 0.4, { glow: true, grav: 0.3 }); }
        }
        this.explode(sp.x, sp.y, P.radius, 1300);
        level.scorch(sp.x, sp.y, P.radius * 0.9, P.radius * 2.5, 0.8);
        fx.rings.push({ x: sp.x, y: sp.y, r: P.radius * 0.8, max: P.radius * 2.8, t: 0, dur: 0.5 });
        for (let i = 0; i < 170; i++) { const an = Math.random() * Math.PI * 2, v = 200 + Math.random() * 900; fx.spark(sp.x, sp.y, Math.cos(an) * v, Math.sin(an) * v, PASTEL[(Math.random() * 5) | 0], 1 + (Math.random() * 3 | 0), 0.35 + Math.random() * 0.55, { glow: true, grav: 0.2 }); }
        fx.flash = Math.max(fx.flash, 0.6);
      }
      const after = sp.t - P.ritual;
      for (let i = 0; i < P.echoes; i++) {
        if (sp.popped & (1 << i)) continue;
        const at = 0.3 + i * P.echoGap, an = sp.rot + i / P.echoes * Math.PI * 2, ex = sp.x + Math.cos(an) * P.circle * 0.9, ey = sp.y + Math.sin(an) * P.circle * 0.9;
        if (after >= at) {
          sp.popped |= 1 << i; audio.twinkle(1.2);
          this.explode(ex, ey, P.echoRadius, 700);
          for (let k = 0; k < 40; k++) { const a2 = Math.random() * Math.PI * 2, v = 120 + Math.random() * 480; fx.spark(ex, ey, Math.cos(a2) * v, Math.sin(a2) * v, PASTEL[(Math.random() * 5) | 0], 2, 0.3 + Math.random() * 0.4, { glow: true, grav: 0.2 }); }
        } else if (Math.random() < 0.6) fx.spark(ex + (Math.random() - 0.5) * 8, ey + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 30, -10 - Math.random() * 40, PASTEL[(Math.random() * 5) | 0], 2, 0.4, { glow: true, grav: 0 });
      }
      if (after < P.linger && Math.random() < 0.7) { const an = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * P.radius * 2.2; fx.spark(sp.x + Math.cos(an) * rr, sp.y + Math.sin(an) * rr, (Math.random() - 0.5) * 20, -20 - Math.random() * 30, PASTEL[(Math.random() * 5) | 0], 1 + (Math.random() * 2 | 0), 1.5 + Math.random() * 2, { glow: true, grav: -0.05 }); }
    }
    this.spells = this.spells.filter(sp => sp.t < SPELL.ritual + 0.3 + SPELL.echoes * SPELL.echoGap + SPELL.linger);
  }

  // ---------------------------------------------------------------- flamethrower: spray that sets letters burning
  flamer(dt, h, a) {
    const { fx, player } = this.game;
    for (let i = 0; i < 3; i++) {
      const an = a + (Math.random() - 0.5) * 0.28, sp = 380 + Math.random() * 140;
      this.flames.push({ x: h.x, y: h.y, vx: Math.cos(an) * sp + player.vx * 0.4, vy: Math.sin(an) * sp, life: 0.45 + Math.random() * 0.15, max: 0.6, size: 3 + Math.random() * 2 });
    }
    if (Math.random() < 0.5) fx.muzzle(h.x, h.y, a, 'star', '#FFB238', 0.5);
  }
  updateFlames(dt) {
    const { level, fx } = this.game;
    for (const f of this.flames) {
      f.life -= dt; f.vx *= 1 - 2.6 * dt; f.vy = f.vy * (1 - 2.6 * dt) - 60 * dt; f.size += 22 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (this.fire) this.fire.heatAt(f.x, f.y, 0.6 * (1.2 - (1 - f.life / f.max)), 16);
      if (level.hitAt(f.x, f.y)) {
        if (this.fire) this.fire.heatAt(f.x, f.y, 1, 16);
        const id = level.letterAt(f.x, f.y);
        const el = id >= 0 ? -1 : level.elementAt(f.x, f.y);
        if (el >= 0) this.hurtElement(el, 0.05, f.x, f.y, f.vx / 400, f.vy / 400, 200);         // fire wears elements down
        if (id >= 0) { this.ignite(id); for (const n of level.lettersInRadius(f.x, f.y, 8)) this.ignite(n); }
        else if (Math.random() < 0.15) { level.carve(f.x, f.y, 3, true); this.game.backdrop.reveal(f.y - 4, f.y + 4); }
        f.vx *= 0.3; f.vy *= 0.3; f.life = Math.min(f.life, 0.15);
      }
      if (f.life < 0.12 && Math.random() < 0.08) fx.smoke(f.x, f.y, f.vx * 0.2, -40, 4, 0.8, 60);
    }
    this.flames = this.flames.filter(f => f.life > 0);
  }
  ignite(id) {
    const L = this.game.level.letters[id];
    if (!L || !L.alive || this.burning.has(id) || this.burning.size > 500) return;
    this.burning.set(id, { t: 0.7 + Math.random() * 0.8, spread: 0.12 + Math.random() * 0.2 });
  }
  updateBurning(dt) {
    if (!this.burning.size) return;
    const { level, fx, audio } = this.game;
    for (const [id, b] of this.burning) {
      const L = level.letters[id];
      if (!L?.alive) { this.burning.delete(id); continue; }
      b.t -= dt; b.spread -= dt;
      if (this.fire && Math.random() < 0.5) this.fire.heatAt(L.x + Math.random() * L.w, L.y + L.h, 0.12, 4);
      if (Math.random() < 0.5) fx.spark(L.x + Math.random() * L.w, L.y + L.h * 0.3 + Math.random() * L.h * 0.5, (Math.random() - 0.5) * 20, -60 - Math.random() * 60, FLAME_COLS[(Math.random() * 4) | 0], 2 + (Math.random() * 2 | 0), 0.35, { glow: true, grav: -0.15 });
      if (b.spread <= 0) { // fire jumps to a neighbour
        b.spread = 0.18 + Math.random() * 0.25;
        for (const n of level.lettersInRadius(L.x + L.w / 2, L.y + L.h / 2, 11)) if (Math.random() < 0.35) this.ignite(n);
      }
      if (b.t <= 0) { this.popLetter(id, (Math.random() - 0.5) * 60, -40 - Math.random() * 60, true); fx.smoke(L.x + L.w / 2, L.y, 0, -30, 4, 1, 50); }
    }
    if (Math.random() < Math.min(0.9, this.burning.size / 20)) audio.crackle();
  }

  // ---------------------------------------------------------------- gatling drone
  spawnDrone() {
    const p = this.game.player;
    this.drone = { x: p.x - p.facing * 30, y: p.y - p.height - 40, vx: 0, vy: 0, face: p.facing, cool: 0, leaving: false, t: 0, aim: 0, la: 0, battery: DRONE_BATTERY };
  }
  updateDrone(dt, inp) {
    const d = this.drone, { player, fx, audio } = this.game;
    d.t += dt;
    if (d.leaving) { // flies off when you switch weapons
      const tx = player.x + d.face * 400, ty = player.y - 400;
      d.vx += ((tx - d.x) * 18 - d.vx * 6) * dt; d.vy += ((ty - d.y) * 18 - d.vy * 6) * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.gone = (d.gone || 0) + dt; if (d.gone > 2 || Math.hypot(tx - d.x, ty - d.y) < 30) this.drone = null; return;
    }
    // piloted, free flight (no gravity, flies over everything): A/D/W/S steer it; with no keys it glides to the cursor
    // and hovers there
    const kx = inp.ax || 0, ky = (inp.down ? 1 : 0) - (inp.jumpHeld ? 1 : 0), MAX = 430;
    if (kx || ky) {
      const n = Math.hypot(kx, ky) || 1;
      d.vx += kx / n * 2600 * dt; d.vy += ky / n * 2600 * dt;
    } else {
      const dx = inp.aimX - d.x, dy = inp.aimY - 34 - d.y, dist = Math.hypot(dx, dy);    // hover just above the crosshair
      const want = dist > 24 ? Math.min(MAX, dist * 3) : 0;
      d.vx += ((dist ? dx / dist * want : 0) - d.vx) * 5 * dt; d.vy += ((dist ? dy / dist * want : 0) - d.vy) * 5 * dt;
    }
    d.vx *= 1 - Math.min(1, 1.6 * dt); d.vy *= 1 - Math.min(1, 1.6 * dt);
    const sp = Math.hypot(d.vx, d.vy); if (sp > MAX) { d.vx *= MAX / sp; d.vy *= MAX / sp; }
    d.x = Math.max(10, Math.min(this.game.level.W - 10, d.x + d.vx * dt));
    d.y = Math.max(-300, Math.min(this.game.level.H + 100, d.y + d.vy * dt + Math.sin(d.t * 3) * 0.15));
    // battery: beeps for the last 5 seconds, then the drone blows up and control goes back to the character
    const before = d.battery; d.battery -= dt;
    if (d.battery < 5 && Math.ceil(d.battery * 2) !== Math.ceil(before * 2)) audio.tick();
    if (d.battery <= 0) { this.droneDown(); return; }
    // the gatling swivels on its mount: any angle on the side the drone faces (180 degrees), turning the drone round
    // when the target goes behind it
    const pv = this.dronePivot();
    d.aim = Math.atan2(inp.aimY - pv.y, inp.aimX - pv.x);
    d.face = Math.cos(d.aim) >= 0 ? 1 : -1;
    d.la = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(Math.sin(d.aim), Math.cos(d.aim) * d.face)));
    d.cool -= dt;
    if (inp.fire && d.cool <= 0) {
      d.cool = WEAPONS.find(w => w.id === 'drone').cd;
      const t2 = this.droneTip(), an = d.aim + (Math.random() - 0.5) * 0.08;
      this.bullet(t2, an, 1700, 'drone', WPN.drone.dmg, { range: Math.max(24, Math.hypot(inp.aimX - t2.x, inp.aimY - t2.y)) }); audio.droneShot(); this.stats.shots++;
      fx.muzzle(t2.x, t2.y, d.aim, 'star', '#FF9A6A', 0.7);
      if (Math.random() < 0.5) fx.casing(t2.x - Math.cos(d.aim) * 6, t2.y, d.face, '#D9A63A', 2);
    }
  }
  droneDown() {
    const d = this.drone; if (!d) return;
    this.explode(d.x, d.y, 34, 750);
    this.drone = null; this.droneCool = DRONE_RECHARGE;
    this.index = this.prevIndex ?? 0; this.notice = 'Drone battery dead: back to you';
  }
  // a piece of art from the played character's style pack (Ash's airstrike jet and bombs), if it has one
  packArt(id) { return this.game.player?.sprite?.packArt?.(id) || null; }
  // the drone's art: the character's own (Ash's pack) or the shared pixel drone
  droneArt() { return this.game.player.sprite?.droneArt?.() || DRONE.classic; }
  dronePivot() {
    const d = this.drone, A = this.droneArt(); if (!A) return { x: d.x, y: d.y };
    const tilt = Math.max(-0.25, Math.min(0.25, d.vx / 900)), m = A.mount, bw = A.body.width, bh = A.body.height;
    const lx = (m.x - bw / 2) * A.sb * d.face, ly = (m.y - bh / 2) * A.sb;
    return { x: d.x + lx * Math.cos(tilt) - ly * Math.sin(tilt), y: d.y + lx * Math.sin(tilt) + ly * Math.cos(tilt) };
  }
  droneTip() {
    const d = this.drone, A = this.droneArt(); if (!A) return { x: d.x, y: d.y };
    const p = this.dronePivot(), ox = (A.tip.x - A.pivot.x) * A.sg, oy = (A.tip.y - A.pivot.y) * A.sg;
    const rx = ox * Math.cos(d.la) - oy * Math.sin(d.la), ry = ox * Math.sin(d.la) + oy * Math.cos(d.la);
    return { x: p.x + rx * d.face, y: p.y + ry };
  }

  // ---------------------------------------------------------------- grab and throw (gravity well, right button)
  // Holding: loose debris in a cone in front of you (34 degrees either side, out to 470px) is pulled into a swirling
  // ball held at your hand, up to 37 pieces. Letting go fires the ball at the cursor; every piece smashes letters, chips
  // elements and punches through anything weak, a few times each, before it drops.
  updateGrab(dt, inp, grabbing, h, a) {
    const { fx, level, audio, player } = this.game, G = this.grab ||= { held: [], t: 0 };
    const hold = { x: h.x + Math.cos(a) * 34, y: h.y + Math.sin(a) * 34 };
    G.held = G.held.filter(c => c.life > 0 && fx.chunks.includes(c));
    if (grabbing) {
      G.t += dt;
      for (const c of fx.chunks) {
        if (c.held || c.thrown > 0 || c.slab || G.held.length >= 37) continue;
        const dx = c.x - h.x, dy = c.y - h.y, d = Math.hypot(dx, dy);
        if (d > 470) continue;
        let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > 34 * Math.PI / 180 && d > 50) continue;
        const k = 2400 * dt / Math.max(40, d) * 60;                       // tractor pull, stronger close in
        c.vx += (hold.x - c.x) / Math.max(d, 1) * k; c.vy += (hold.y - c.y) / Math.max(d, 1) * k - 1750 * dt * 0.8;
        if (Math.hypot(hold.x - c.x, hold.y - c.y) < 34) { c.held = true; G.held.push(c); }
      }
      // the ball: pieces orbit the hold point
      G.held.forEach((c, i) => {
        const ang = G.t * 5 + i * 2.4, r = 6 + (i % 5) * 3;
        const tx = hold.x + Math.cos(ang) * r, ty = hold.y + Math.sin(ang) * r * 0.7;
        c.vx = (tx - c.x) * 18; c.vy = (ty - c.y) * 18; c.x += c.vx * dt; c.y += c.vy * dt; c.a += 6 * dt; c.life = Math.max(c.life, 4);
      });
      if (Math.random() < 0.5) fx.spark(hold.x + (Math.random() - 0.5) * 30, hold.y + (Math.random() - 0.5) * 30, (h.x - hold.x) * 2, (h.y - hold.y) * 2, '#B48CFF', 2, 0.25, { glow: true, grav: 0 });
      audio.grab(true);
    } else {
      audio.grab(false);
      if (G.held.length) { // let go: fire the ball at the cursor
        const sp = 1150;
        for (const c of G.held) {
          const an = a + (Math.random() - 0.5) * 0.22;
          c.held = false; c.thrown = 0.9; c.pierce = 3; c.vx = Math.cos(an) * sp * (0.85 + Math.random() * 0.3); c.vy = Math.sin(an) * sp * (0.85 + Math.random() * 0.3);
        }
        player.push(-Math.cos(a) * 160, -Math.sin(a) * 110); player.recoil = 1; fx.kick('small');
        fx.muzzle(hold.x, hold.y, a, 'ring', '#D7B8FF', 1.4); audio.throwDebris(G.held.length);
        G.held = []; G.t = 0;
      }
    }
    // thrown pieces fly straight and fast, smashing what they hit
    for (const c of fx.chunks) {
      if (!(c.thrown > 0)) continue;
      c.thrown -= dt; c.vy += 300 * dt;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, p = this.trace(c.x, c.y, nx, ny);
      if (p) {
        const sp = Math.hypot(c.vx, c.vy) || 1, ux = c.vx / sp, uy = c.vy / sp;
        const id = level.letterAt(p.x, p.y);
        if (id >= 0) this.popLetter(id, ux * 380, uy * 200 - 200);
        else {
          const el = level.elementAt(p.x, p.y);
          if (el >= 0) this.hurtElement(el, 1.5, p.x, p.y, ux, uy, 380);
          else { level.carve(p.x, p.y, 5); this.game.backdrop.reveal(p.y - 6, p.y + 6); }
        }
        for (const n of level.lettersInRadius(p.x, p.y, 7)) this.popLetter(n, ux * 300 + (Math.random() - 0.5) * 120, -160 - Math.random() * 160);
        fx.spark(p.x, p.y, 0, 0, '#E8DBFF', 4, 0.06, { glow: true, grav: 0 });
        c.pierce--; c.vx *= 0.7; c.vy *= 0.7;
        if (c.pierce <= 0) c.thrown = 0;                                      // spent: falls like normal debris
        c.x = p.x; c.y = p.y;
      } else { c.x = nx; c.y = ny; }
      c.a += c.va * dt * 2;
      if (c.thrown <= 0) { c.vx *= 0.5; c.vy *= 0.5; }
    }
  }

  // ---------------------------------------------------------------- airstrike: mark a spot, a jet carpet-bombs it
  callStrike(tx, ty) {
    const { audio, level } = this.game;
    tx = Math.max(0, Math.min(level.W, tx));
    this.strikes.push({ tx, ty, t: 0, dir: tx < level.W / 2 ? 1 : -1, dropped: 0, jet: null });
    audio.designate();
  }
  get strikeReady() { return Math.max(0, this.strikeCool); }
  updateStrikes(dt) {
    if (!this.strikes.length) return;
    const { audio, cam } = this.game;
    for (const s of this.strikes) {
      s.t += dt;
      if (!s.jet && (s.beep = (s.beep ?? 0) - dt) <= 0) { s.beep = Math.max(0.09, 0.28 - s.t * 0.17); audio.strikeBeep(); } // speeds up as the jet nears
      if (s.t > 1.1 && !s.jet) { s.jet = { x: s.tx - s.dir * 1300, y: Math.max((cam?.y ?? s.ty - 400) + 70, s.ty - 460) }; audio.jetFlyby(); }
      if (!s.jet) continue;
      s.jet.x += s.dir * 1150 * dt;
      // bombs carry forward as they fall, so release starts well before the mark: 7 bombs, 80px apart
      const rel = (s.jet.x - s.tx) * s.dir, want = Math.min(7, Math.floor((rel + 470) / 80) + 1);
      while (s.dropped < want && rel > -470) {
        this.shots.push({ kind: 'bomb', x: s.jet.x, y: s.jet.y + 14, vx: s.dir * 260, vy: 40, a: 0, life: 4, t: 0 });   // from under the belly
        if (s.dropped++ === 0) audio.bombWhistle();
      }
      if (rel > 1500) s.done = true;
    }
    this.strikes = this.strikes.filter(s => !s.done);
  }

  // ---------------------------------------------------------------- mini nuke
  // Ground zero is vaporised, a crater is blown out, and the shockwave rolls outwards tearing everything loose.
  nuke(x, y) {
    this.blasting = true;
    try { this.nukeNow(x, y); } finally { this.blasting = false; }
  }
  nukeNow(x, y) {
    const { level, fx, backdrop, player, audio } = this.game, R = WPN.nuke.blast, wave = R * 3.2;
    this.stats.booms++;
    for (const id of level.lettersInRadius(x, y, wave)) {
      const L = level.letters[id], dx = L.x + L.w / 2 - x, dy = L.y + L.h / 2 - y, d = Math.hypot(dx, dy) || 1;
      if (d < R * 0.9) { if (level.killLetter(id)) this.stats.letters++; continue; }
      const k = 1700 * (1 - d / wave) + 260;
      this.queuePop(id, d / 1100, dx / d * k * (0.7 + Math.random() * 0.5), dy / d * k * 0.8 - 300 - Math.random() * 300, d < R * 1.7);
    }
    for (const c of this.game.fx.chunks.slice()) if (c.slab && Math.hypot(c.x - x, c.y - y) < wave) this.shatterSlab(c, x, y, 900);
    for (const id of level.elementsInRadius(x, y, wave)) {
      const e = level.elements[id], nx = Math.max(e.x, Math.min(x, e.x + e.w)), ny = Math.max(e.y, Math.min(y, e.y + e.h)), d = Math.hypot(nx - x, ny - y) || 1;
      this.hurtElement(id, d < R * 1.3 ? 99 : 10 * (1 - d / wave), nx, ny, (nx - x) / d, (ny - y) / d, 1400);
    }
    level.carve(x, y, R, false);
    for (let i = 0; i < 12; i++) { const an = Math.random() * Math.PI * 2, rr = R * (0.85 + Math.random() * 0.35); level.carve(x + Math.cos(an) * rr, y + Math.sin(an) * rr, 18 + Math.random() * 34, false); }
    level.scorch(x, y, R * 0.95, R * 1.9, 1);
    backdrop.reveal(y - wave, y + wave);
    fx.explosion(x, y, R);
    fx.rings.push({ x, y, r: R * 0.5, max: wave * 1.5, t: 0, dur: 0.9 }, { x, y, r: R * 0.3, max: wave * 0.9, t: 0, dur: 0.6 });
    fx.flash = 1; fx.flashHold = 0.15; fx.kick('huge');
    fx.impulse(x, y, wave * 1.5, 2600);
    this.mushrooms.push({ x, y, t: 0 });
    for (const id of level.lettersInRadius(x, y, wave * 1.25)) if (Math.random() < 0.3) this.ignite(id);
    const hx = player.x, hy = player.y - player.height / 2, dx = hx - x, dy = hy - y, d = Math.hypot(dx, dy) || 1;
    if (d < wave * 1.3) { const k = 2300 * (1 - d / (wave * 1.3)); player.push(dx / d * k, dy / d * k - k * 0.35); }
    audio.nuke();
  }
  // the mushroom cloud: a rising stem of fire and smoke that spreads into a cap
  updateMushrooms(dt) {
    if (!this.mushrooms.length) return;
    const { fx } = this.game;
    for (const m of this.mushrooms) {
      m.t += dt;
      if (m.t > 3.2) continue;
      const top = m.y - 40 - Math.min(m.t, 1.6) * 170, k = Math.min(1, m.t / 1.6);
      for (let i = 0; i < 3; i++) { // stem
        const yy = m.y - Math.random() * (m.y - top);
        fx.smoke(m.x + (Math.random() - 0.5) * 34, yy, (Math.random() - 0.5) * 20, -60 - Math.random() * 40, 12 + Math.random() * 10, 1.6, 55 + (Math.random() * 30 | 0));
      }
      for (let i = 0; i < 4; i++) { // cap
        const an = Math.random() * Math.PI * 2, rx = (70 + 50 * k) * Math.cos(an), ry = (30 + 20 * k) * Math.sin(an);
        fx.smoke(m.x + rx, top + ry, rx * 0.4, ry * 0.4 - 20, 16 + Math.random() * 14, 2.2, 60 + (Math.random() * 40 | 0));
      }
      if (m.t < 1.4) for (let i = 0; i < 3; i++) fx.spark(m.x + (Math.random() - 0.5) * 60, top + (Math.random() - 0.3) * 50, (Math.random() - 0.5) * 80, -40 - Math.random() * 80,
        ['#FFF6C8', '#FFD25A', '#FF9A2E', '#FF5A1F'][(Math.random() * 4) | 0], 4 + (Math.random() * 4 | 0), 0.6, { glow: true, grav: -0.1 });
    }
    this.mushrooms = this.mushrooms.filter(m => m.t < 3.2);
  }

  // ---------------------------------------------------------------- projectiles
  updateShots(dt) {
    const { level, fx, player, audio } = this.game;
    for (const s of this.shots) {
      s.life -= dt; s.t = (s.t || 0) + dt;
      if (s.kind === 'bullet') {
        let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, ends = false;
        if (s.range != null) {                                                   // the cursor's distance: stop there this step
          const step = Math.hypot(nx - s.x, ny - s.y), left = Math.max(0, s.range - (s.dist || 0));
          if (step >= left) { const f = left / (step || 1); nx = s.x + (nx - s.x) * f; ny = s.y + (ny - s.y) * f; ends = true; }
          s.dist = (s.dist || 0) + Math.min(step, left);
        }
        if (s.style === 'bolt' && Math.random() < 0.6) fx.spark(s.x, s.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, '#7CF2FF', 2, 0.18, { glow: true, grav: 0 });
        // your own grenades and 40mm rounds in its path: set them off in the air (the .50 also sprays fragments)
        for (const q of this.shots) {
          if ((q.kind !== 'grenade' && q.kind !== 'shell40') || q.life <= 0) continue;
          const vx = nx - s.x, vy = ny - s.y, L2 = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((q.x - s.x) * vx + (q.y - s.y) * vy) / L2));
          if (Math.hypot(s.x + vx * u - q.x, s.y + vy * u - q.y) > 7) continue;
          this.shotGrenade(q, s);
          if (s.style !== 'slug') { s.life = 0; break; }
        }
        if (s.life <= 0) continue;
        // a falling element in the way: it shatters (a weak round stops there)
        const slab = this.slabOnPath(s.x, s.y, nx, ny);
        if (slab) { this.shatterSlab(slab.c, slab.x, slab.y, s.style === 'slug' ? 520 : 320); if (s.style !== 'slug') { s.life = 0; continue; } }
        // tear through until the round's penetration is spent
        let x0 = s.x, y0 = s.y;
        for (let k = 0; k < 80 && s.life > 0; k++) {
          const p = this.trace(x0, y0, nx, ny);
          if (!p) break;
          // the surface the round struck (sampled before the hit carves it away), for the .50's ricochet
          let nx2 = 0, ny2 = 0;
          if (s.style === 'slug') for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (level.hitAt(p.x + dx, p.y + dy)) { nx2 -= dx; ny2 -= dy; }
          s.pen -= this.hit(p.x, p.y, s.vx, s.vy, s, s.hits === 0 || s.hits % 5 === 0); s.hits++;
          if (s.pen < 0) { s.life = 0; s.x = p.x; s.y = p.y; }
          // the .50 ricochets off elements (letters it just goes through): reflected off the surface it struck
          if (s.life > 0 && s.style === 'slug' && s.met === 'element' && (s.bounces || 0) < SLUG_BOUNCES) {
            const nl = Math.hypot(nx2, ny2), sp = Math.hypot(s.vx, s.vy), vxn = s.vx / sp, vyn = s.vy / sp;
            if (nl) {
              nx2 /= nl; ny2 /= nl;
              const dot = vxn * nx2 + vyn * ny2;
              if (dot < 0) {
                const rx = vxn - 2 * dot * nx2, ry = vyn - 2 * dot * ny2;
                s.vx = rx * sp * 0.85; s.vy = ry * sp * 0.85; s.a = Math.atan2(s.vy, s.vx); s.bounces = (s.bounces || 0) + 1;
                if (s.trail) { this.trails.push({ x0: s.x0, y0: s.y0, x1: p.x, y1: p.y, life: 0.7, max: 0.7 }); s.x0 = p.x; s.y0 = p.y; }
                fx.spark(p.x, p.y, 0, 0, '#FFFFFF', 5, 0.06, { glow: true, grav: 0 }); audio.ricochet?.();
                nx = p.x + nx2 * 3; ny = p.y + ny2 * 3; break;
              }
            }
          }
          x0 = p.x; y0 = p.y;
        }
        if (s.style === 'slug' && !s.charged) this.trench(s.x, s.y, s.life > 0 ? nx : s.x, s.life > 0 ? ny : s.y);
        if (s.life > 0) { s.x = nx; s.y = ny; if (ends) { this.paperHole(s); s.life = 0; } }
        if (s.trail && s.life <= 0) this.trails.push({ x0: s.x0, y0: s.y0, x1: s.x, y1: s.y, life: 0.7, max: 0.7 });
      } else if (s.kind === 'shell40') {
        if (this.airburst(s, dt, WPN.launcher.blast, 950)) continue;
        // 40mm: arcs, hits, bounces and rolls, and goes off a moment later
        s.vy += 900 * dt; s.a = Math.atan2(s.vy, s.vx); s.spin = (s.spin ?? s.a) + s.vx * dt * 0.06;
        const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, R = 3;                 // bounce off its bottom edge
        const hit = (x, y) => level.solidAt(x, y) || level.hitAt(x, y);
        if (hit(nx, ny + R) || hit(nx + Math.sign(s.vx) * R, ny)) {
          if (hit(s.x, ny + R)) { s.vy *= -0.38; s.vx *= 0.72; } else s.vx *= -0.45;
          if (s.fuse == null) s.fuse = 0.55;
          if (Math.hypot(s.vx, s.vy) > 90) audio.tick();
        } else { s.x = nx; s.y = ny; }
        if (s.x < 0 || s.x > level.W) s.vx *= -0.6;
        if (s.fuse != null) s.fuse -= dt;
        if ((s.fuse != null && s.fuse <= 0) || s.life <= 0 || s.y > level.H) { this.explode(s.x, Math.min(s.y, level.H), WPN.launcher.blast, 950); s.life = 0; }
      } else if (s.kind === 'bomb' || s.kind === 'warhead') {
        // lobbed / dropped explosives: fall under gravity, go off on the first real content they meet
        s.vy += (s.kind === 'bomb' ? 1100 : s.kind === 'warhead' ? 520 : 700) * dt; s.a = Math.atan2(s.vy, s.vx);
        const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
        let p = this.trace(s.x, s.y, nx, ny);
        // the warhead arcs, so it goes off once it has come as far as the cursor along the line it was launched on
        if (s.range != null && !p) { s.x0 ??= s.x; s.y0 ??= s.y; if ((nx - s.x0) * Math.cos(s.a0 ??= s.a) + (ny - s.y0) * Math.sin(s.a0) >= s.range) p = { x: nx, y: ny }; }
        if (s.kind !== 'bomb' && Math.random() < 0.7) fx.smoke(s.x, s.y, (Math.random() - 0.5) * 20, -10, s.kind === 'warhead' ? 5 : 3, 0.7, 130);
        if (s.kind === 'warhead' && Math.random() < 0.6) fx.spark(s.x - Math.cos(s.a) * 8, s.y - Math.sin(s.a) * 8, -s.vx * 0.2, -s.vy * 0.2, '#FFE07A', 2, 0.15, { glow: true, grav: 0 });
        const off = p || s.life <= 0 || s.y > level.H;
        if (off) {
          const X = p ? p.x : s.x, Y = p ? p.y : Math.min(s.y, level.H);
          if (s.kind === 'bomb') this.explode(X, Y, STRIKE.blast, 1250);
          else this.nuke(X, Y);
          s.life = 0;
        } else { s.x = nx; s.y = ny; }
      } else if (s.kind === 'mirv') {
        this.stepMirv(s, dt);
      } else if (s.kind === 'bomblet') {
        this.stepBomblet(s, dt);
      } else if (s.kind === 'seed' || s.kind === 'spell') {
        // straight to the aim point (or the first thing in the way), where the star forms / the ritual starts
        let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, arrived = false;
        if (s.range != null) {
          const step = Math.hypot(nx - s.x, ny - s.y), left = Math.max(0, s.range - (s.dist || 0));
          if (step >= left) { const f = left / (step || 1); nx = s.x + (nx - s.x) * f; ny = s.y + (ny - s.y) * f; arrived = true; }
          s.dist = (s.dist || 0) + Math.min(step, left);
        }
        const col = s.kind === 'seed' ? (Math.random() < 0.3 ? '#FFFFFF' : '#7CF2FF') : PASTEL[(Math.random() * 5) | 0];
        for (let i = 0; i < 2; i++) fx.spark(s.x + (Math.random() - 0.5) * 6, s.y + (Math.random() - 0.5) * 6, -s.vx * 0.1 + (Math.random() - 0.5) * 60, -s.vy * 0.1 + (Math.random() - 0.5) * 60, col, 2, 0.3, { glow: true, grav: 0 });
        if (s.kind === 'spell' && (s.tw -= dt) <= 0) { s.tw = 0.11 + Math.random() * 0.08; audio.twinkle(0.6); }
        const p = this.trace(s.x, s.y, nx, ny) || (arrived || s.life <= 0 ? { x: nx, y: ny } : null);
        if (p) {
          const X = Math.max(20, Math.min(level.W - 20, p.x)), Y = Math.max(20, Math.min(level.H - 20, p.y));
          if (s.kind === 'seed') this.formStar(X, Y); else this.spells.push({ x: X, y: Y, t: 0, popped: 0, rot: Math.random() * Math.PI * 2 });
          s.life = 0;
        } else { s.x = nx; s.y = ny; }
      } else if (s.kind === 'rocket') {
        const sp = Math.min(1250, Math.hypot(s.vx, s.vy) + 1500 * dt);
        s.vx = Math.cos(s.a) * sp; s.vy = Math.sin(s.a) * sp;
        let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, arrived = false;
        if (s.range != null) {                                                    // it flies as far as the cursor, then goes off there
          const step = Math.hypot(nx - s.x, ny - s.y), left = Math.max(0, s.range - (s.dist || 0));
          if (step >= left) { const f = left / (step || 1); nx = s.x + (nx - s.x) * f; ny = s.y + (ny - s.y) * f; arrived = true; }
          s.dist = (s.dist || 0) + Math.min(step, left);
        }
        const p = this.trace(s.x, s.y, nx, ny) || (arrived ? { x: nx, y: ny } : null);
        const bx = s.x - Math.cos(s.a) * 9, by = s.y - Math.sin(s.a) * 9;
        fx.smoke(bx, by, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30 - 10, 4, 0.9, 120);
        fx.spark(bx, by, -Math.cos(s.a) * 120 + (Math.random() - 0.5) * 60, -Math.sin(s.a) * 120 + (Math.random() - 0.5) * 60, Math.random() < 0.5 ? '#FFE07A' : '#FF8A2E', 3, 0.12, { glow: true, grav: 0 });
        if (p || s.life <= 0) { this.explode(p ? p.x : s.x, p ? p.y : s.y, WPN.rocket.blast, 1300); s.life = 0; }
        else { s.x = nx; s.y = ny; }
      } else if (s.kind === 'grenade') {
        if (this.airburst(s, dt, 62, 1050)) continue;
        s.vy += 1500 * dt; s.spin += s.vx * dt * 0.08;
        const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
        if (level.solidAt(nx, ny)) {
          if (level.solidAt(s.x, ny)) { s.vy *= -0.42; s.vx *= 0.8; } else { s.vx *= -0.5; }
          if (Math.abs(s.vy) > 120) audio.tick();
        } else { s.x = nx; s.y = ny; }
        if (s.x < 0 || s.x > level.W) s.vx *= -0.6;
        if (s.life < 0.5 && Math.random() < 0.3) fx.spark(s.x, s.y - 4, 0, -40, '#FFB238', 2, 0.2, { glow: true, grav: 0 });
        if (s.life <= 0) this.explode(s.x, s.y, 62, 1050);
      } else if (s.kind === 'well') {
        if (!s.active) {
          const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
          const p = this.trace(s.x, s.y, nx, ny);
          if (Math.random() < 0.8) { const an = s.t * 25; fx.spark(s.x + Math.cos(an) * 6, s.y + Math.sin(an) * 6, 0, 0, '#B48CFF', 2, 0.3, { glow: true, grav: 0 }); }
          if (p) { s.x = p.x; s.y = p.y; } else { s.x = nx; s.y = ny; }
          if (p || s.life <= 0) { s.active = true; s.t = 0; s.life = 2.3; audio.well(); }
        } else {
          s.r = Math.min(72, 8 + s.t * 48);
          s.tick = (s.tick || 0) - dt;
          if (s.tick <= 0) {
            s.tick = 0.07;
            for (const id of level.lettersInRadius(s.x, s.y, s.r * 2.4)) {
              const w = level.letters[id], dx = s.x - (w.x + w.w / 2), dy = s.y - (w.y + w.h / 2), d = Math.hypot(dx, dy) || 1;
              this.popLetter(id, dx / d * 380, dy / d * 380);
            }
            for (const id of level.elementsInRadius(s.x, s.y, s.r * 1.2)) this.hurtElement(id, 0.8, s.x, s.y, 0, 0, -200);   // ground down, pieces sucked in
            level.carve(s.x, s.y, s.r, false); this.game.backdrop.reveal(s.y - s.r, s.y + s.r);
          }
          fx.impulse(s.x, s.y, 320, -2600 * dt);
          for (const c of fx.chunks) if (Math.hypot(c.x - s.x, c.y - s.y) < s.r * 0.5) { c.life = Math.min(c.life, 0.15); c.vx *= 0.5; c.vy *= 0.5; }
          const dx = s.x - player.x, dy = s.y - (player.y - player.height / 2), d = Math.hypot(dx, dy) || 1;
          if (d < 240) { const k = 1500 * (1 - d / 240) * dt; player.vx += dx / d * k; player.vy += dy / d * k; }
          if (Math.random() < 0.9) {
            const ang = Math.random() * Math.PI * 2, rr = s.r * 2.2;
            fx.spark(s.x + Math.cos(ang) * rr, s.y + Math.sin(ang) * rr, -Math.cos(ang + 0.6) * 260, -Math.sin(ang + 0.6) * 260, Math.random() < 0.5 ? '#B48CFF' : '#E8DBFF', 2, 0.35, { glow: true, grav: 0, drag: 0 });
          }
          if (s.life <= 0) this.explode(s.x, s.y, s.r + 10, 1100);
        }
      }
      if (s.x < -200 || s.x > level.W + 200 || s.y > level.H + 400 || s.y < -1500) s.life = 0;
    }
    this.shots = this.shots.filter(s => s.life > 0);
  }

  // ---------------------------------------------------------------- drawing
  draw(g, t) {
    // glowing things: additive bloom (lights up dark pages), then the same shapes in normal colour on top (additive light
    // alone vanishes on white pages and turns colours white)
    const glow = fn => { g.save(); g.globalCompositeOperation = 'lighter'; fn(); g.restore(); g.save(); g.globalAlpha = 0.85; fn(); g.restore(); };
    this.fire?.draw(g);
    this.drawStars(g, t, glow);
    this.drawSpells(g, t, glow);
    for (const c of this.chutes) { // a spent parachute drifting off
      g.save(); g.translate(c.x, c.y); g.rotate(Math.sin(c.t * 3.1) * 0.25);
      g.fillStyle = '#F2EBDD'; g.beginPath(); g.arc(0, 0, 11, Math.PI, 0); g.fill(); g.fillStyle = '#C8341E'; g.fillRect(-11, -1, 22, 2);
      g.strokeStyle = 'rgba(60,50,40,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-10, 0); g.lineTo(0, 16); g.lineTo(10, 0); g.stroke(); g.restore();
    }
    if (this.drone) this.drawDrone(g, t);
    // gravity well grab: a purple tractor beam from the hand to the held ball
    if (this.grab?.held.length || (this.weapon.id === 'well' && this.grab?.t > 0)) {
      const h = this.game.player.hand(), a = this.game.player.fireAim, hx = h.x + Math.cos(a) * 34, hy = h.y + Math.sin(a) * 34;
      glow(() => {
        g.strokeStyle = `rgba(180,140,255,${0.35 + 0.2 * Math.sin(t * 30)})`; g.lineWidth = 3;
        for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(h.x, h.y); g.quadraticCurveTo((h.x + hx) / 2 + Math.sin(t * 20 + k * 3) * 6, (h.y + hy) / 2 + Math.cos(t * 20 + k * 3) * 6, hx, hy); g.stroke(); }
        g.fillStyle = 'rgba(180,140,255,0.18)'; g.beginPath(); g.arc(hx, hy, 22 + Math.sin(t * 12) * 3, 0, Math.PI * 2); g.fill();
      });
    }
    // sniper: laser sight from the barrel to the crosshair
    if (this.weapon.id === 'sniper' && this.aimPt && this.game.player) {
      // normal blending, not glow: additive light vanishes on white pages
      const m = this.game.player.hand(), P = this.aimPt, k = 0.8 + 0.2 * Math.sin(t * 9);
      g.save(); g.lineCap = 'round';
      g.strokeStyle = `rgba(120,0,0,${0.35 * k})`; g.lineWidth = 2.4; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(P.x, P.y); g.stroke();
      g.strokeStyle = `rgba(255,30,30,${0.95 * k})`; g.lineWidth = 1; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(P.x, P.y); g.stroke();
      g.fillStyle = 'rgba(120,0,0,0.6)'; g.beginPath(); g.arc(P.x, P.y, 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FF3A30'; g.beginPath(); g.arc(P.x, P.y, 2.2, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    for (const s of this.shots) {
      if (s.kind === 'bullet') {
        this.drawRound(g, s);
      } else if (s.kind === 'mirv') {
        // the cluster shell: fat, hazard-striped; under its chute it hangs nose down
        g.save(); g.translate(s.x, s.y); g.rotate(s.a);
        g.fillStyle = '#2A2F2A'; g.fillRect(-11, -5, 20, 10); g.fillStyle = '#5E6B4A'; g.fillRect(-10, -4, 17, 8);
        g.fillStyle = '#F5E04A'; for (let k = -8; k < 6; k += 6) g.fillRect(k, -4, 3, 8); g.fillStyle = '#8A9670'; g.fillRect(-10, -4, 17, 1.5);
        g.fillStyle = '#C8341E'; g.fillRect(7, -3, 4, 6); g.fillStyle = '#3A3F36'; g.fillRect(-12, -7, 3, 3); g.fillRect(-12, 4, 3, 3);
        g.restore();
        if (s.state === 1) { // the canopy above it
          g.save(); g.translate(s.x, s.y - 26); g.rotate(Math.sin(s.ct * 2.4) * 0.3);
          g.fillStyle = '#F2EBDD'; g.beginPath(); g.arc(0, 0, 14, Math.PI, 0); g.fill(); g.fillStyle = '#C8341E'; g.fillRect(-14, -1, 28, 2.5);
          g.strokeStyle = 'rgba(60,50,40,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-12, 0); g.lineTo(0, 24); g.lineTo(12, 0); g.stroke(); g.restore();
        }
      } else if (s.kind === 'bomblet') {
        g.save(); g.translate(s.x, s.y); g.rotate(s.a);
        g.fillStyle = '#2A2F2A'; g.fillRect(-4, -3, 8, 6); g.fillStyle = '#F5E04A'; g.fillRect(-1, -3, 2, 6); g.fillStyle = '#C8341E'; g.fillRect(3, -2, 2, 4);
        g.restore();
      } else if (s.kind === 'seed' || s.kind === 'spell') {
        const col = s.kind === 'seed' ? '#7CF2FF' : '#FF8AE6';
        glow(() => { g.fillStyle = col; g.beginPath(); g.arc(s.x, s.y, 4 + Math.sin(t * 40) * 1.2, 0, Math.PI * 2); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(s.x, s.y, 1.8, 0, Math.PI * 2); g.fill(); });
      } else if (s.kind === 'rocket') {
        g.save(); g.translate(s.x, s.y); g.rotate(s.a);
        glow(() => { // exhaust flame
          const fl = 6 + Math.random() * 5;
          g.fillStyle = '#FF8A2E'; g.beginPath(); g.moveTo(-8, -2.5); g.lineTo(-8 - fl, 0); g.lineTo(-8, 2.5); g.fill();
          g.fillStyle = '#FFF2B0'; g.beginPath(); g.moveTo(-8, -1.2); g.lineTo(-8 - fl * 0.55, 0); g.lineTo(-8, 1.2); g.fill();
        });
        g.fillStyle = '#2A2F2A'; g.fillRect(-9, -3, 15, 6);
        g.fillStyle = '#5E6B4A'; g.fillRect(-8, -2, 12, 4);
        g.fillStyle = '#8A9670'; g.fillRect(-8, -2, 12, 1);
        g.fillStyle = '#C8341E'; g.fillRect(4, -2, 3, 4); g.fillRect(7, -1, 1, 2);
        g.fillStyle = '#3A3F36'; g.fillRect(-9, -5, 3, 2); g.fillRect(-9, 3, 3, 2);
        g.restore();
      } else if (s.kind === 'shell40') {
        // 40mm grenade: a stubby round, brass base and copper band, rounded copper nose. Flies nose first along its
        // arc; once it has hit something it tumbles as it bounces and rolls.
        g.save(); g.translate(s.x, s.y); g.rotate(s.fuse == null ? s.a : s.spin); g.scale(1.05, 1.05);
        g.lineJoin = 'round'; g.lineWidth = 0.8; g.strokeStyle = '#2A1A0E';
        const nose = () => { g.beginPath(); g.moveTo(-0.5, -3.4); g.lineTo(1.6, -3.4); g.quadraticCurveTo(5.4, -2.8, 5.6, 0); g.quadraticCurveTo(5.4, 2.8, 1.6, 3.4); g.lineTo(-0.5, 3.4); g.closePath(); };
        g.fillStyle = '#8E6A2C'; g.fillRect(-4.8, -3.4, 4.6, 6.8); g.strokeRect(-4.8, -3.4, 4.6, 6.8);           // brass base
        g.fillStyle = '#D8B464'; g.fillRect(-4.6, -3, 4.2, 1.3);                                                    // its shine
        g.fillStyle = '#5E4318'; g.fillRect(-4.6, 2, 4.2, 1.1);
        const cg = g.createLinearGradient(0, -3.4, 0, 3.4); cg.addColorStop(0, '#F0AD74'); cg.addColorStop(0.45, '#C27140'); cg.addColorStop(1, '#6E3A1C');
        g.fillStyle = cg; nose(); g.fill(); g.stroke();                                                               // copper nose
        g.fillStyle = '#4A2E14'; g.fillRect(-0.9, -3.4, 1.1, 6.8);                                                  // driving band
        g.fillStyle = 'rgba(255,235,210,0.7)'; g.fillRect(1.4, -2.6, 2.6, 0.9);                                     // highlight
        g.restore();
      } else if (s.kind === 'bomb' || s.kind === 'warhead') {
        const im = IMG[s.kind], sc = s.kind === 'bomb' ? 1.2 : 1.5, rot = s.a, own = s.kind === 'bomb' && this.packArt('bomb');
        g.save(); g.translate(s.x, s.y); g.rotate(rot);
        if (own) { const L = 24, H = L * own.height / own.width; g.imageSmoothingEnabled = true; g.drawImage(own, -L / 2, -H / 2, L, H); } // character's style
        else if (im) g.drawImage(im.img, -im.w * sc / 2, -im.h * sc / 2, im.w * sc, im.h * sc);
        else { g.fillStyle = s.kind === 'warhead' ? '#E8D040' : '#4A5236'; g.fillRect(-5, -3, 10, 6); g.fillStyle = '#20241A'; g.fillRect(-7, -4, 2, 8); }
        g.restore();
        if (s.kind === 'warhead' && (t * 10 | 0) % 2) glow(() => { g.fillStyle = '#FF3B3B'; g.fillRect(s.x - 1, s.y - 1, 2, 2); });
      } else if (s.kind === 'grenade') {
        const gi = IMG.grenade;
        g.save(); g.translate(s.x, s.y); g.rotate(s.spin);
        if (gi) g.drawImage(gi.img, -gi.w * 0.6, -gi.h * 0.6, gi.w * 1.2, gi.h * 1.2);
        g.restore();
        if (s.life < 0.6 && (t * 14 | 0) % 2) glow(() => { g.fillStyle = '#FF3B3B'; g.fillRect(s.x - 1, s.y - 6, 2, 2); });
      } else if (s.kind === 'well') {
        if (!s.active) {
          glow(() => { g.fillStyle = 'rgba(180,140,255,0.4)'; g.beginPath(); g.arc(s.x, s.y, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#E8DBFF'; g.beginPath(); g.arc(s.x, s.y, 3, 0, Math.PI * 2); g.fill(); });
          g.fillStyle = '#140A24'; g.beginPath(); g.arc(s.x, s.y, 2, 0, Math.PI * 2); g.fill();
          continue;
        }
        const pulse = 1 + Math.sin(t * 30) * 0.05;
        glow(() => {
          g.fillStyle = 'rgba(150,100,255,0.16)'; g.beginPath(); g.arc(s.x, s.y, s.r * 2.3 * pulse, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(232,219,255,0.9)'; g.lineWidth = 2;
          for (let k = 0; k < 3; k++) { const st = t * 6 + k * 2.1; g.beginPath(); g.arc(s.x, s.y, s.r * (1.05 + k * 0.18) * pulse, st, st + 1.4); g.stroke(); }
        });
        g.fillStyle = '#05030A'; g.beginPath(); g.arc(s.x, s.y, s.r * 0.75, 0, Math.PI * 2); g.fill();
      }
    }
    // sniper heat trails fading out
    if (this.trails.length) glow(() => {
      g.lineCap = 'round';
      for (const tr of this.trails) {
        const k = tr.life / tr.max;
        g.strokeStyle = `rgba(255,236,200,${0.35 * k})`; g.lineWidth = 1 + 3 * k;
        g.beginPath(); g.moveTo(tr.x0, tr.y0); g.lineTo(tr.x1, tr.y1); g.stroke();
      }
    });
    // airstrike: the marked spot, then the jet
    for (const st of this.strikes) {
      if (st.t < 2.4) {
        // pulsing green target (normal blending + dark edge so it reads on white pages too)
        const p = 1 + Math.sin(t * 14) * 0.25, on = (t * 6 | 0) % 2 || st.t < 1.1, a = on ? 1 : 0.55;
        const cross = (col, w) => {
          g.strokeStyle = col; g.lineWidth = w;
          g.beginPath(); g.arc(st.tx, st.ty, 10 * p, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(st.tx, st.ty, 18 * p, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(st.tx - 24, st.ty); g.lineTo(st.tx - 6, st.ty); g.moveTo(st.tx + 6, st.ty); g.lineTo(st.tx + 24, st.ty);
          g.moveTo(st.tx, st.ty - 24); g.lineTo(st.tx, st.ty - 6); g.moveTo(st.tx, st.ty + 6); g.lineTo(st.tx, st.ty + 24); g.stroke();
        };
        g.save();
        g.fillStyle = `rgba(40,230,100,${0.18 * a})`; g.beginPath(); g.arc(st.tx, st.ty, 18 * p, 0, Math.PI * 2); g.fill();
        cross(`rgba(0,60,20,${0.6 * a})`, 3); cross(`rgba(60,255,120,${a})`, 1.4);
        g.fillStyle = '#0A4A1E'; g.fillRect(st.tx - 2, st.ty - 2, 4, 4); g.fillStyle = '#7DFFA8'; g.fillRect(st.tx - 1, st.ty - 1, 2, 2);
        g.restore();
      }
      if (st.jet) {
        const J = IMG.jet, sc = JET_SCALE, own = this.packArt('jet'), L = (J ? J.w : 43) * sc, tail = -L / 2 + 6;
        g.save(); g.translate(Math.round(st.jet.x), Math.round(st.jet.y)); g.scale(st.dir, 1);
        glow(() => { // afterburner
          const fl = 34 + Math.random() * 26;
          g.fillStyle = '#FF8A2E'; g.beginPath(); g.moveTo(tail, -7); g.lineTo(tail - fl, 0); g.lineTo(tail, 7); g.fill();
          g.fillStyle = '#FFF2B0'; g.beginPath(); g.moveTo(tail, -3.5); g.lineTo(tail - fl * 0.55, 0); g.lineTo(tail, 3.5); g.fill();
        });
        if (own) { const H = L * own.height / own.width; g.imageSmoothingEnabled = true; g.drawImage(own, -L / 2, -H / 2, L, H); } // character's style
        else if (J) { g.imageSmoothingEnabled = false; g.drawImage(J.img, -J.w * sc / 2, -J.h * sc / 2, J.w * sc, J.h * sc); }
        else { g.fillStyle = '#6B7380'; g.fillRect(-28, -3, 56, 6); g.fillRect(-6, -10, 14, 20); }
        g.restore();
      }
    }
    if (this.flames.length) glow(() => {
      for (const f of this.flames) {
        const k = 1 - f.life / f.max, col = FLAME_COLS[Math.min(FLAME_COLS.length - 1, (k * FLAME_COLS.length) | 0)];
        g.globalAlpha = Math.max(0, Math.min(1, f.life / f.max * 1.6)) * 0.85;
        g.fillStyle = col; g.beginPath(); g.arc(f.x, f.y, f.size / 2, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    });
    if (this.beam) {
      const B = this.beam, wob = 1 + Math.sin(t * 60) * 0.35;
      const path = () => { g.beginPath(); B.segs.forEach((sg, i) => { if (!i) g.moveTo(sg.x0, sg.y0); g.lineTo(sg.x1, sg.y1); }); };
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,61,203,0.25)'; g.lineWidth = 12 * wob; path(); g.stroke();
      g.strokeStyle = 'rgba(255,61,203,0.7)'; g.lineWidth = 5; path(); g.stroke();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.6; path(); g.stroke();
      for (const sg of B.segs.slice(0, B.hit ? B.segs.length : B.segs.length - 1)) { g.fillStyle = 'rgba(255,120,230,0.6)'; g.beginPath(); g.arc(sg.x1, sg.y1, 5 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
      const s0 = B.segs[0]; g.fillStyle = 'rgba(255,180,240,0.8)'; g.beginPath(); g.arc(s0.x0, s0.y0, 3 + Math.random() * 1.5, 0, Math.PI * 2); g.fill();
      g.restore();
      // solid beam with a dark edge: shows on white pages as well as dark ones
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(90,0,70,0.55)'; g.lineWidth = 5.5; path(); g.stroke();
      g.strokeStyle = '#FF3DCB'; g.lineWidth = 3.4; path(); g.stroke();
      g.strokeStyle = '#FFD2F2'; g.lineWidth = 1.2; path(); g.stroke();
      g.restore();
    }
  }
  // A round in flight: a tracer as long as the distance it covers in a frame or two (never reaching back past the muzzle),
  // drawn as a dark edge, a saturated body and a bright core so it reads on white pages, with a soft bloom for dark ones.
  // the pulsar: a hot core and two jets sweeping round it; it shrinks to a point as it collapses
  drawStars(g, t, glow) {
    const S = STAR;
    for (const st of this.stars) {
      const end = S.form + S.life, form = Math.min(1, st.t / S.form), col = st.t >= end ? Math.min(1, (st.t - end) / S.collapse) : 0;
      const core = S.radius * 0.5 * form * (1 - col * 0.85), a = st.prev, len = st.len || S.radius;
      glow(() => {
        if (st.t >= S.form && st.t < end) for (let j = 0; j < 2; j++) {
          const an = a + j * Math.PI, ca = Math.cos(an), sa = Math.sin(an);
          const gr = g.createLinearGradient(st.x, st.y, st.x + ca * len, st.y + sa * len);
          gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(124,242,255,0.75)'); gr.addColorStop(1, 'rgba(124,242,255,0)');
          g.strokeStyle = gr; g.lineWidth = 5 + Math.sin(t * 30) * 1.5; g.lineCap = 'round';
          g.beginPath(); g.moveTo(st.x + ca * core, st.y + sa * core); g.lineTo(st.x + ca * len, st.y + sa * len); g.stroke();
        }
        const rg = g.createRadialGradient(st.x, st.y, 0, st.x, st.y, core * 2.6 + 6);
        rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(155,231,255,0.9)'); rg.addColorStop(1, 'rgba(124,242,255,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(st.x, st.y, core * 2.6 + 6, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(st.x, st.y, Math.max(1.5, core * 0.5), 0, Math.PI * 2); g.fill();
    }
  }
  // the ritual circle while the spell gathers itself
  drawSpells(g, t, glow) {
    for (const sp of this.spells) {
      if (sp.t >= SPELL.ritual) continue;
      const k = sp.t / SPELL.ritual, R = SPELL.circle;
      glow(() => {
        g.strokeStyle = `rgba(255,179,240,${0.35 + 0.5 * k})`; g.lineWidth = 1.5 + k * 2;
        g.beginPath(); g.arc(sp.x, sp.y, R * (0.3 + 0.7 * Math.min(1, k * 2)), 0, Math.PI * 2); g.stroke();
        g.strokeStyle = `rgba(201,166,255,${0.25 + 0.4 * k})`; g.lineWidth = 1;
        for (let i = 0; i < 12; i++) { const an = sp.rot + t * 1.5 + i / 12 * Math.PI * 2, r0 = R * 0.78, r1 = R * (0.88 + 0.06 * Math.sin(t * 6 + i)); g.beginPath(); g.moveTo(sp.x + Math.cos(an) * r0, sp.y + Math.sin(an) * r0); g.lineTo(sp.x + Math.cos(an) * r1, sp.y + Math.sin(an) * r1); g.stroke(); }
        g.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * k})`; g.beginPath(); g.arc(sp.x, sp.y, 3 + k * 6 + Math.sin(t * 25) * 1.5, 0, Math.PI * 2); g.fill();
      });
    }
  }
  drawRound(g, s) {
    const T0 = ROUND[s.style] || ROUND.tracer, sp = Math.hypot(s.vx, s.vy), ux = s.vx / sp, uy = s.vy / sp;
    // supercharged by a dash: fatter, longer, electric cyan
    const T = s.charged ? { ...T0, w: T0.w * 1.8, max: T0.max * 1.6, body: '#3FD8FF', core: '#FFFFFF', bloom: 'rgba(120,230,255,0.55)' } : T0;
    const L = Math.min(T.max, Math.max(T.min, sp * T.len), Math.hypot(s.x - s.x0, s.y - s.y0) + 2);
    const line = (from, to, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(s.x - ux * L * from, s.y - uy * L * from); g.lineTo(s.x - ux * L * to, s.y - uy * L * to); g.stroke(); };
    g.save(); g.lineCap = 'round';
    g.globalCompositeOperation = 'lighter'; line(1, 0, T.w * 2.6, T.bloom);           // bloom (dark pages)
    g.globalCompositeOperation = 'source-over';
    line(1, 0, T.w + 2.2, 'rgba(24,12,6,0.55)');                                         // dark edge (light pages)
    line(1, 0, T.w, T.body);
    line(0.55, 0, Math.max(1, T.w * 0.45), T.core);                                    // hot front
    g.fillStyle = T.core; g.beginPath(); g.arc(s.x, s.y, T.w * 0.55, 0, Math.PI * 2); g.fill();
    if (s.style === 'slug') { // .50 cal also drags a long heat trail back towards the shooter
      const H = Math.min(320, Math.hypot(s.x - s.x0, s.y - s.y0));
      g.strokeStyle = 'rgba(120,70,30,0.35)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(s.x - ux * H, s.y - uy * H); g.lineTo(s.x - ux * L, s.y - uy * L); g.stroke();
      g.strokeStyle = 'rgba(255,200,140,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x - ux * H, s.y - uy * H); g.lineTo(s.x - ux * L, s.y - uy * L); g.stroke();
    }
    g.restore();
  }
  drawDrone(g, t) {
    const d = this.drone, A = this.droneArt(); if (!A) return;
    const bw = A.body.width * A.sb, bh = A.body.height * A.sb, smooth = A.sb < 1;
    g.save(); g.translate(d.x, d.y); g.rotate(Math.max(-0.25, Math.min(0.25, d.vx / 900))); g.scale(d.face, 1);
    g.imageSmoothingEnabled = smooth;
    // gatling first (hangs under the body), swivelled to the target
    g.save(); g.translate((A.mount.x - A.body.width / 2) * A.sb, (A.mount.y - A.body.height / 2) * A.sb); g.rotate(d.la);
    g.drawImage(A.gun, -A.pivot.x * A.sg, -A.pivot.y * A.sg, A.gun.width * A.sg, A.gun.height * A.sg); g.restore();
    g.drawImage(A.body, -bw / 2, -bh / 2, bw, bh);
    g.fillStyle = `rgba(200,210,220,${0.25 + 0.2 * Math.sin(t * 60)})`; // rotor blur
    g.fillRect(-bw / 2, -bh / 2, bw, 2);
    g.restore();
  }

}
