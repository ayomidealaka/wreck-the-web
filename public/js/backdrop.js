// The pixel-art world hiding underneath the page. Four of them: open countryside (sky, hills, soil, caves and lava
// further down), a metro city at night (towers, streets, a subway and the sewers), a desert canyon (mesas, sandstone
// strata, a crystal cave) and the deep ocean (reef, seabed, the abyss). One is picked per website. Everything is
// generated from noise on a 4px grid, with ordered dithering so gradients read as pixel art.
import { hash } from './level.js';

const PX = 4;          // backdrop pixel size
const TILE = 512;      // tile height in page pixels
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
export const THEMES = ['country', 'city', 'desert', 'ocean'];

function noise(x, y, seed) { // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash(xi + seed, yi), b = hash(xi + 1 + seed, yi), c = hash(xi + seed, yi + 1), d = hash(xi + 1 + seed, yi + 1);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 17) * 0.3 + noise(x * 4.3, y * 4.3, seed + 41) * 0.1;
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// a dithered pick along a gradient of colours: t 0..1, b the dither threshold for this pixel
const grad = (cols, t, b) => cols[Math.max(0, Math.min(cols.length - 1, Math.round(t * (cols.length - 1) + (b - 0.5) * 0.9)))];

// ---------------------------------------------------------------- countryside
const DAY = {
  sky: ['#2B3A67', '#3E5C99', '#5C86C4', '#8FB5E0', '#C9DDF0'].map(rgb),
  cloud: rgb('#EEF3FA'), cloudShade: rgb('#C3D0E3'),
  hillFar: rgb('#6C8FB3'), hillNear: rgb('#4F7A5A'),
  grass: [rgb('#5DA34A'), rgb('#7FC25A'), rgb('#3E7A34')],
  dirt: [rgb('#7A5134'), rgb('#6A4429'), rgb('#8C6040')],
  stone: [rgb('#5D5A62'), rgb('#4E4B54'), rgb('#6E6A72')],
  deep: [rgb('#3A3442'), rgb('#2F2A37'), rgb('#463F50')],
  cave: rgb('#17131C'), caveEdge: rgb('#2A2330'),
  ores: [rgb('#F2C14E'), rgb('#5BC0EB'), rgb('#E85D75'), rgb('#9BE564')],
  lava: [rgb('#FF7A1A'), rgb('#FFB238'), rgb('#C83A12')],
};
// the same world at night, for dark pages: a bright blue sky showing through a hole in a black page jars
const NIGHT = {
  ...DAY,
  sky: ['#05060C', '#0A0D1A', '#111629', '#182038', '#1F2A48'].map(rgb),
  cloud: rgb('#2A3350'), cloudShade: rgb('#1F2740'),
  hillFar: rgb('#1A2238'), hillNear: rgb('#1B2A22'),
  grass: [rgb('#2E4A28'), rgb('#355A2C'), rgb('#243A20')],
  dirt: [rgb('#3E2A1C'), rgb('#352316'), rgb('#46301F')],
  stone: [rgb('#2E2C32'), rgb('#27262B'), rgb('#363439')],
  deep: [rgb('#1E1B24'), rgb('#19171E'), rgb('#241F2B')],
  cave: rgb('#08070B'), caveEdge: rgb('#120F17'),
};
const STAR = rgb('#C9D4F0');

function country(B, x, y, b, px, py, i) {
  const PAL = B.night ? NIGHT : DAY, s = B.seed, surf = B.surfaceAt(x);
  if (y < surf) {
    const t = Math.max(0, Math.min(0.999, y / Math.max(1, surf)));
    let col = grad(PAL.sky, t, b);
    const far = surf - 70 - fbm(x / 140, 3, s + 5) * 90, near = surf - 18 - fbm(x / 90, 7, s + 9) * 40;
    if (y > near) col = PAL.hillNear; else if (y > far) col = PAL.hillFar;
    else {
      const cl = fbm(x / 180, y / 60, s + 23);
      if (cl > 0.66 && y < surf * 0.7) col = cl > 0.7 + b * 0.04 ? PAL.cloud : PAL.cloudShade;
      else if (B.night && hash(px * 3, py * 5 + 1) > 0.992) col = STAR;
    }
    return col;
  }
  const depth = y - surf, cave = fbm(x / 120, y / 80, s + 31);
  if (depth > 60 && cave > 0.68) return cave > 0.7 ? PAL.cave : PAL.caveEdge;
  if (depth < 6) return PAL.grass[(hash(px, py) * 3) | 0];
  const layer = depth < 260 + noise(x / 80, 1, s) * 80 ? PAL.dirt : (y < B.lavaY - 400 ? PAL.stone : PAL.deep);
  let col = layer[(fbm(x / 22, y / 22, s + 3) * 2.99 + (b - 0.5) * 0.6) | 0] || layer[0];
  if (depth > 120 && hash(px * 7, py * 13 + i) > 0.985) col = PAL.ores[Math.min(PAL.ores.length - 1, (hash(px, py + 3) * PAL.ores.length) | 0)];
  if (y > B.lavaY && fbm(x / 70, y / 50, s + 51) > 0.6) col = PAL.lava[Math.min(PAL.lava.length - 1, (hash(px, py) * 2.2 + b) | 0)];
  return col;
}

// ---------------------------------------------------------------- metro city, at night
const CITY = {
  sky: ['#07091A', '#0D1228', '#161D3A', '#22305C', '#3A4C7A'].map(rgb),
  moon: rgb('#F4EFD8'), moonShade: rgb('#CFC9B4'),
  far: rgb('#141A30'), farWin: rgb('#A6A08A'),
  near: [rgb('#242B48'), rgb('#1D2440'), rgb('#2C3556')], edge: rgb('#3A4470'),
  win: [rgb('#FFE89A'), rgb('#FFD27A'), rgb('#7CF2FF'), rgb('#FF8AE6')], dark: rgb('#121626'),
  road: rgb('#2A2A33'), roadLine: rgb('#E8C84A'), kerb: rgb('#4A4B5E'), lamp: rgb('#FFF1B0'),
  concrete: [rgb('#3B3B46'), rgb('#44444F'), rgb('#33333D')], brick: [rgb('#5A3A3A'), rgb('#6A4444'), rgb('#4E3232')],
  tunnel: rgb('#0E0E14'), tunnelWall: rgb('#26262E'), rail: rgb('#9A9AA6'), sleeper: rgb('#4A3A2A'),
  pipe: rgb('#6E7E8E'), pipeShade: rgb('#4A5866'), water: [rgb('#1C4A3A'), rgb('#235A46')], cable: rgb('#7CF2FF'),
  bedrock: [rgb('#2A2730'), rgb('#232028'), rgb('#312D38')],
};
function city(B, x, y, b, px, py) {
  const s = B.seed, P = CITY, surf = B.surface;      // a city street is level
  if (y < surf) {
    const t = Math.max(0, Math.min(0.999, y / surf));
    let col = grad(P.sky, t, b);
    if (hash(px * 3, py * 5 + 1) > 0.993) col = STAR;
    // the moon
    const mx = B.W * 0.78, my = surf * 0.22, md = Math.hypot(x - mx, y - my);
    if (md < 26) col = md > 22 && b < 0.5 ? P.moonShade : P.moon;
    // far towers: one per 36px column, dark, a few lit windows
    const fc = Math.floor(x / 36), fh = 60 + hash(fc, s + 2) * 140, ftop = surf - fh - 24;
    if (y >= ftop) { col = P.far; if ((py & 3) === 1 && (px & 1) === 0 && hash(px, py + s) > 0.86) col = P.farWin; }
    // near towers: wider, taller, with a lit window grid, antennas on some roofs
    const nc = Math.floor(x / 64), nw = 40 + hash(nc, s + 7) * 20, nh = 110 + hash(nc, s + 11) * 220, ntop = surf - nh;
    const lx = x - nc * 64, inX = lx < nw;
    if (inX && y >= ntop) {
      col = P.near[nc % 3];
      if (lx < 4) col = P.edge;
      else if (lx % 8 >= 2 && lx % 8 < 6 && (y - ntop) % 12 >= 3 && (y - ntop) % 12 < 9 && y - ntop > 8) {
        const h = hash(Math.floor(lx / 8) + nc * 97, Math.floor((y - ntop) / 12) + s);
        col = h > 0.45 ? P.win[h > 0.95 ? 3 : h > 0.9 ? 2 : h > 0.7 ? 1 : 0] : P.dark;
      }
    } else if (inX && hash(nc, s + 3) > 0.5 && Math.abs(lx - nw / 2) < 2 && y >= ntop - 30) col = P.edge;   // antenna
    return col;
  }
  const depth = y - surf;
  if (depth < 28) {                                                            // the street
    if (depth < 4) return P.kerb;
    if (depth >= 14 && depth < 18 && Math.floor(x / 24) % 2 === 0) return P.roadLine;
    return P.road;
  }
  if (depth < 90) return depth >= 84 ? (b < 0.5 ? P.pipe : P.pipeShade) : P.concrete[(fbm(x / 20, y / 20, s + 3) * 2.99) | 0];
  if (depth < 170) return P.brick[(Math.floor(y / 6) + Math.floor(x / 14)) % 2 === 0 ? 0 : hash(px, py) > 0.92 ? 2 : 1];
  if (depth < 270) {                                                           // the subway
    if (depth < 182 || depth >= 258) return P.tunnelWall;
    if (depth >= 246) return depth < 250 ? P.rail : Math.floor(x / 12) % 2 === 0 ? P.sleeper : P.tunnel;
    if (depth < 192 && Math.abs((x % 180) - 90) < 4) return P.lamp;              // a lamp every 180px
    return P.tunnel;
  }
  if (depth < 330) return P.concrete[(fbm(x / 20, y / 20, s + 5) * 2.99) | 0];
  if (depth < 338) return b < 0.5 ? P.pipe : P.pipeShade;
  if (depth < 420) return P.brick[(Math.floor(y / 6) + Math.floor(x / 14)) % 2 === 0 ? 0 : 2];
  if (depth < 470) return P.water[fbm(x / 30, y / 10, s + 9) > 0.5 ? 1 : 0];          // the sewer
  const cave = fbm(x / 120, y / 80, s + 31);
  if (cave > 0.7) return P.tunnel;
  let col = P.bedrock[(fbm(x / 22, y / 22, s + 3) * 2.99) | 0];
  if ((py % 60) === 0 && hash(Math.floor(x / 200), Math.floor(y / 60)) > 0.5) col = P.cable;
  return col;
}

// ---------------------------------------------------------------- desert canyon
const DESERT = {
  sky: ['#4C6FA5', '#7A93C0', '#C9A3A0', '#F2A66A', '#F7C27A'].map(rgb),
  sun: rgb('#FFF4C0'), sunEdge: rgb('#FFD88A'),
  mesaFar: rgb('#B07A6A'), mesaNear: rgb('#9B5A44'),
  sand: [rgb('#E3B86E'), rgb('#D9A95C'), rgb('#EDC98A')],
  strata: [['#C98A4B', '#BE7F42'], ['#A86636', '#9E5E30'], ['#D9A066', '#CF955A'], ['#8E5A2E', '#84532A'], ['#B5704A', '#AB6844']].map(p => p.map(rgb)),
  bone: rgb('#F2E9D0'), cave: rgb('#1E1410'), caveEdge: rgb('#3A2418'), crystal: [rgb('#B48CFF'), rgb('#D9C2FF'), rgb('#8A5CFF')],
  deep: [rgb('#4A2E22'), rgb('#3E261C'), rgb('#56362A')],
};
function desert(B, x, y, b, px, py) {
  const s = B.seed, P = DESERT, surf = B.surfaceAt(x) + 10;
  if (y < surf) {
    const t = Math.max(0, Math.min(0.999, y / Math.max(1, surf)));
    let col = grad(P.sky, t, b);
    const sx = B.W * 0.2, sy = surf * 0.3, sd = Math.hypot(x - sx, y - sy);
    if (sd < 34) col = sd > 29 && b < 0.6 ? P.sunEdge : P.sun;
    const far = surf - 40 - Math.floor(fbm(x / 260, 2, s + 5) * 3) * 30, near = surf - 12 - Math.floor(fbm(x / 150, 6, s + 9) * 3) * 18;   // flat-topped mesas
    if (y > near) col = P.mesaNear; else if (y > far) col = P.mesaFar;
    return col;
  }
  const depth = y - surf;
  if (depth < 10) return P.sand[(hash(px, py) * 3) | 0];
  const cave = fbm(x / 120, y / 80, s + 31);
  if (depth > 300 && cave > 0.66) {
    if (cave > 0.69) return P.cave;
    return hash(px, py) > 0.55 ? P.crystal[(hash(px + 1, py) * 3) | 0] : P.caveEdge;
  }
  if (depth > 700) return P.deep[(fbm(x / 22, y / 22, s + 3) * 2.99) | 0];
  // wavy strata, a band every ~28px
  const band = Math.floor((depth + fbm(x / 90, 0.5, s + 13) * 36) / 28), pair = P.strata[band % P.strata.length];
  let col = pair[hash(px, py) > 0.5 ? 1 : 0];
  if (depth > 80 && hash(Math.floor(x / 40), Math.floor(y / 40) + s) > 0.93 && fbm(x / 6, y / 6, s + 77) > 0.62) col = P.bone;   // the odd fossil
  return col;
}

// ---------------------------------------------------------------- the deep ocean
const OCEAN = {
  sky: ['#9FD3F2', '#CFE8F7'].map(rgb), foam: rgb('#FFFFFF'),
  water: ['#3FA7D6', '#2B86BC', '#1B5E8E', '#124569', '#0E2F4F', '#081E35', '#05121F'].map(rgb),
  light: rgb('#7FD1F0'), fish: rgb('#0A2A3F'), bubble: rgb('#CFEFFF'),
  sand: [rgb('#C9B48A'), rgb('#BBA67C'), rgb('#D6C398')],
  coral: [rgb('#FF6F91'), rgb('#FFB347'), rgb('#7CE0C8'), rgb('#C77DFF')],
  rock: [rgb('#2B2F3A'), rgb('#232733'), rgb('#343845')], glow: [rgb('#7CF2FF'), rgb('#B48CFF'), rgb('#9BE564')],
  trench: rgb('#02070D'),
};
function ocean(B, x, y, b, px, py) {
  const s = B.seed, P = OCEAN, line = Math.min(80, B.surface * 0.25), bed = B.surface + 520 + fbm(x / 200, 1, s + 5) * 60;
  if (y < line) return grad(P.sky, Math.min(0.999, y / Math.max(1, line)), b);
  if (y < line + 5) return b < 0.7 ? P.foam : P.water[0];
  if (y >= bed) {
    const depth = y - bed;
    if (depth < 10) return P.sand[(hash(px, py) * 3) | 0];
    const cave = fbm(x / 140, y / 90, s + 31);
    if (depth > 120 && cave > 0.66) return P.trench;
    let col = P.rock[(fbm(x / 22, y / 22, s + 3) * 2.99) | 0];
    if (depth > 40 && hash(px * 7, py * 13) > 0.992) col = P.glow[(hash(px, py + 3) * 3) | 0];
    return col;
  }
  const t = Math.max(0, Math.min(0.999, (y - line) / Math.max(1, bed - line)));
  let col = grad(P.water, t, b);
  if (t < 0.25 && fbm(x / 40, y / 24, s + 61) > 0.68) col = P.light;                                        // caustics
  if (bed - y < 22 && fbm(x / 18, y / 10, s + 71) > 0.55) col = P.coral[(hash(Math.floor(x / 10), s) * 4) | 0];   // the reef
  const fx = Math.floor(x / 96), fy = Math.floor(y / 56);
  if (hash(fx, fy + s) > 0.82) {                                                                              // a fish
    const cx = fx * 96 + 20 + hash(fx + 1, fy) * 50, cy = fy * 56 + 16 + hash(fx, fy + 2) * 24, dx = x - cx, dy = y - cy;
    if (Math.abs(dy) < 3 && dx > -8 && dx < 6 && (dx > -3 || Math.abs(dy) < 1.5 + (dx + 8) * 0.3)) col = P.fish;
  }
  if (hash(px * 11, py * 7 + s) > 0.996) col = P.bubble;
  return col;
}

const DRAW = { country, city, desert, ocean };

export class Backdrop {
  constructor(W, H, seed = 7, { night = false, theme = 'country' } = {}) {
    this.W = W; this.H = H; this.seed = seed; this.night = night; this.theme = DRAW[theme] ? theme : 'country';
    this.surface = Math.min(420, H * 0.35);
    this.lavaY = Math.max(H - 900, this.surface + 1500);
    this.cache = new Map();
    this.open = new Set(); // tiles where the page has holes; only these get generated and drawn
  }
  reveal(y0, y1) { for (let i = Math.max(0, Math.floor(y0 / TILE)); i <= Math.floor(y1 / TILE); i++) this.open.add(i); }
  surfaceAt(x) { return this.surface + (fbm(x / 260, 0.5, this.seed) - 0.5) * 120; }

  tile(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    const w = Math.ceil(this.W / PX), h = Math.ceil(Math.min(TILE, this.H - i * TILE + PX) / PX);
    const c = document.createElement('canvas'); c.width = w; c.height = Math.max(1, h);
    const g = c.getContext('2d'); const img = g.createImageData(w, c.height); const d = img.data;
    const paint = DRAW[this.theme];
    for (let py = 0; py < c.height; py++) {
      const y = i * TILE + py * PX;
      for (let px = 0; px < w; px++) {
        const x = px * PX, b = BAYER[(py & 3) * 4 + (px & 3)];
        const col = paint(this, x, y, b, px, py, i);
        const p = (py * w + px) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // knock everything back a bit so the page stays the star; more on dark pages for the worlds without a night of their own
    const dim = this.night && this.theme !== 'country' && this.theme !== 'city' ? 0.5 : 0.18;
    g.fillStyle = `rgba(14,10,24,${dim})`; g.fillRect(0, 0, w, c.height);
    this.cache.set(i, c);
    return c;
  }

  draw(g, cam) {
    g.imageSmoothingEnabled = false;
    const i0 = Math.max(0, Math.floor(cam.y / TILE)), i1 = Math.floor((cam.y + cam.h) / TILE);
    for (let i = i0; i <= i1 && i * TILE < this.H; i++) {
      if (!this.open.has(i)) continue;
      const c = this.tile(i);
      g.drawImage(c, 0, i * TILE, c.width * PX, c.height * PX);
    }
  }
}
