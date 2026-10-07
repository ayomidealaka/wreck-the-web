// The pixel-art world hiding underneath the page: sky, soil, caves, ore and lava further down.
import { hash } from './level.js';

const PX = 4;          // backdrop pixel size
const TILE = 512;      // tile height in page pixels
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);

function noise(x, y, seed) { // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash(xi + seed, yi), b = hash(xi + 1 + seed, yi), c = hash(xi + seed, yi + 1), d = hash(xi + 1 + seed, yi + 1);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 17) * 0.3 + noise(x * 4.3, y * 4.3, seed + 41) * 0.1;
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
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
// The same world at night, for dark pages: a bright blue sky showing through a hole in a black page jars
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

export class Backdrop {
  constructor(W, H, seed = 7, { night = false } = {}) {
    this.W = W; this.H = H; this.seed = seed; this.night = night;
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
    const s = this.seed, PAL = this.night ? NIGHT : DAY;
    for (let py = 0; py < c.height; py++) {
      const y = i * TILE + py * PX;
      for (let px = 0; px < w; px++) {
        const x = px * PX, b = BAYER[(py & 3) * 4 + (px & 3)];
        let col;
        const surf = this.surfaceAt(x);
        if (y < surf) {
          // sky: dithered gradient, far + near hills, clouds
          const t = Math.max(0, Math.min(0.999, y / Math.max(1, surf)));
          const k = t * (PAL.sky.length - 1) + (b - 0.5) * 0.9;
          col = PAL.sky[Math.max(0, Math.min(PAL.sky.length - 1, Math.round(k)))];
          const far = surf - 70 - fbm(x / 140, 3, s + 5) * 90;
          const near = surf - 18 - fbm(x / 90, 7, s + 9) * 40;
          if (y > near) col = PAL.hillNear; else if (y > far) col = PAL.hillFar;
          else {
            const cl = fbm(x / 180, y / 60, s + 23);
            if (cl > 0.66 && y < surf * 0.7) col = cl > 0.7 + b * 0.04 ? PAL.cloud : PAL.cloudShade;
            else if (this.night && hash(px * 3, py * 5 + 1) > 0.992) col = STAR;                  // a few stars
          }
        } else {
          const depth = y - surf;
          const cave = fbm(x / 120, y / 80, s + 31);
          if (depth > 60 && cave > 0.68) col = cave > 0.7 ? PAL.cave : PAL.caveEdge;
          else if (depth < 6) col = PAL.grass[(hash(px, py) * 3) | 0];
          else {
            const layer = depth < 260 + noise(x / 80, 1, s) * 80 ? PAL.dirt : (y < this.lavaY - 400 ? PAL.stone : PAL.deep);
            col = layer[(fbm(x / 22, y / 22, s + 3) * 2.99 + (b - 0.5) * 0.6) | 0] || layer[0];
            if (depth > 120 && hash(px * 7, py * 13 + i) > 0.985) col = PAL.ores[Math.min(PAL.ores.length - 1, (hash(px, py + 3) * PAL.ores.length) | 0)];
            if (y > this.lavaY && fbm(x / 70, y / 50, s + 51) > 0.6) col = PAL.lava[Math.min(PAL.lava.length - 1, (hash(px, py) * 2.2 + b) | 0)];
          }
        }
        const p = (py * w + px) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // knock everything back a bit so the page stays the star
    g.fillStyle = 'rgba(14,10,24,0.18)'; g.fillRect(0, 0, w, c.height);
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
