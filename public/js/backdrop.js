// The world behind the page: a screen-filling pixel-art scene in parallax layers, seen through the holes. Four scenes,
// one picked per website: a synthwave city at dusk, mountains at nightfall, sunny hills, and deep space. Each layer
// is painted once at a quarter of the view's size and drawn scaled up with hard pixels, tiled sideways, and slides
// with the camera at its own speed (the far layers barely, the near ones a little).
export const THEMES = ['synth', 'dusk', 'sunny', 'space'];
const PX = 4;                    // one painted pixel = 4 page pixels
const OVER = 1.3;                // layers are this much taller than the view, for the vertical drift
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);

// a small seeded random, so a site always gets the same skyline
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// a dithered vertical gradient over [y0, y1): stops = [[pos 0..1, colour], ...]
function skyGradient(g, w, y0, y1, stops) {
  const img = g.createImageData(w, y1 - y0), d = img.data;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1], u = Math.max(0, Math.min(1, (t - p0) / Math.max(1e-6, p1 - p0)));
    for (let x = 0; x < w; x++) {
      const b = BAYER[(y & 3) * 4 + (x & 3)], c = mix(c0, c1, Math.max(0, Math.min(1, u + (b - 0.5) * 0.18)));
      const p = ((y - y0) * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, y0);
}
function stars(g, w, h, r, n, cols) { for (let i = 0; i < n; i++) { const x = (r() * w) | 0, y = (r() * h) | 0, big = r() < 0.12; g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y, 1, 1); if (big) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); } } }
// a tower: body, a rim light down one edge, a grid of windows some of which are lit
function tower(g, x, top, w, bottom, body, rim, winCols, r, lit = 0.5, pitch = 4) {
  g.fillStyle = body; g.fillRect(x, top, w, bottom - top);
  if (rim) { g.fillStyle = rim; g.fillRect(x, top, 1, bottom - top); }
  for (let wy = top + 3; wy < bottom - 2; wy += pitch) for (let wx = x + 2; wx < x + w - 1; wx += 3) {
    if (r() < lit) { g.fillStyle = winCols[(r() * winCols.length) | 0]; g.fillRect(wx, wy, 1, 1); }
  }
}

// ---------------------------------------------------------------- synthwave city
const synth = [
  { speed: 0.03, paint(g, w, h, r) {
    const horizon = Math.round(h * 0.6);
    skyGradient(g, w, 0, horizon, [[0, hex('#0A0220')], [0.35, hex('#2B0B4F')], [0.7, hex('#7A1F7A')], [0.9, hex('#FF3CA6')], [1, hex('#FFB36B')]]);
    stars(g, w, horizon * 0.6, r, Math.round(w * 0.9), ['#FFFFFF', '#FFD6F2', '#C8B6FF']);
    // the sun: a big disc, pink at the bottom to yellow at the top, with the classic dark stripes across its lower half
    const R = Math.round(h * 0.19), cx = Math.round(w * 0.5), cy = horizon - Math.round(R * 0.75);
    g.fillStyle = 'rgba(255,80,160,0.18)'; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, Math.PI * 2); g.fill();
    for (let y = -R; y <= R; y++) {
      const hw = Math.round(Math.sqrt(R * R - y * y)), t = (y + R) / (2 * R);
      if (y > 0) { const k = y / R, gap = 1 + Math.floor(k * 4), period = 2 + gap; if ((y % period) < gap) continue; }   // the stripes, wider towards the bottom
      g.fillStyle = css(mix(hex('#FFF07A'), hex('#FF2E88'), t)); g.fillRect(cx - hw, cy + y, hw * 2, 1);
    }
    // a glow along the horizon, then the far skyline as flat silhouettes with a pink rim
    g.fillStyle = 'rgba(255,60,166,0.25)'; g.fillRect(0, horizon - 6, w, 6);
    let x = 0; while (x < w) { const bw = 4 + (r() * 10 | 0), bh = 3 + (r() * h * 0.07 | 0); g.fillStyle = '#2A0A4A'; g.fillRect(x, horizon - bh, bw, bh); g.fillStyle = '#FF4FB0'; g.fillRect(x, horizon - bh, bw, 1); x += bw + (r() < 0.3 ? 2 : 0); }
    // the floor: a perspective grid in magenta over near-black
    g.fillStyle = '#12052A'; g.fillRect(0, horizon, w, h - horizon);
    g.fillStyle = '#C2178F';
    for (let i = 1, y = horizon + 2; y < h; i++) { g.fillRect(0, y, w, 1); y += 2 + i * 2; }
    for (let k = -14; k <= 14; k++) { const x0 = cx + k * (w / 14), x1 = cx + k * (w / 2.2); for (let y = horizon; y < h; y++) { const t = (y - horizon) / (h - horizon), xx = Math.round(x0 + (x1 - x0) * t); if (xx >= 0 && xx < w) g.fillRect(xx, y, 1, 1); } }
    g.fillStyle = 'rgba(255,60,166,0.35)'; g.fillRect(0, horizon, w, 1);
  } },
  { speed: 0.08, paint(g, w, h, r) {
    const base = Math.round(h * 0.62);
    let x = -2;
    while (x < w) {
      const bw = 7 + (r() * 12 | 0), bh = Math.round(h * (0.05 + r() * 0.16)), top = base - bh;
      tower(g, x, top, bw, base + 2, '#1A0836', '#FF4FB0', ['#FF6EC7', '#7AF7FF', '#FFD86B'], r, 0.45, 3);
      if (r() < 0.35) { g.fillStyle = '#FF4FB0'; g.fillRect(x + (bw >> 1), top - 4 - (r() * 6 | 0), 1, 4 + (r() * 6 | 0)); }     // antenna
      if (r() < 0.25) { g.fillStyle = r() < 0.5 ? '#00F0FF' : '#FF2E88'; g.fillRect(x + 1, top + 2 + (r() * 4 | 0), bw - 2, 1); }    // a neon strip
      x += bw + (r() < 0.5 ? 1 : 0);
    }
  } },
  { speed: 0.16, paint(g, w, h, r) {
    const base = Math.round(h * 0.68);
    let x = -4;
    while (x < w) {
      if (r() < 0.6) { x += 16 + (r() * 40 | 0); continue; }                                                    // gaps: this layer is sparse
      const bw = 12 + (r() * 22 | 0), bh = Math.round(h * (0.1 + r() * 0.22)), top = base - bh;
      tower(g, x, top, bw, Math.round(h * 0.86), '#07021A', '#3A0F5C', ['#FF2E88', '#00F0FF', '#FFD86B'], r, 0.2, 5);
      if (r() < 0.5) { const sy = top + 4 + (r() * 10 | 0); g.fillStyle = r() < 0.5 ? '#FF2E88' : '#00F0FF'; g.fillRect(x + 2, sy, bw - 4, 2); }   // a sign
      x += bw;
    }
    g.fillStyle = '#07021A'; g.fillRect(0, Math.round(h * 0.86), w, h);                                         // the street
  } },
];

// ---------------------------------------------------------------- mountains at dusk
const dusk = [
  { speed: 0.02, paint(g, w, h, r) {
    skyGradient(g, w, 0, h, [[0, hex('#141530')], [0.4, hex('#3C2A5E')], [0.72, hex('#8C4A72')], [0.9, hex('#E08A6A')], [1, hex('#F2C08A')]]);
    stars(g, w, h * 0.5, r, Math.round(w * 0.6), ['#FFFFFF', '#E8E0FF']);
    const mx = Math.round(w * 0.72), my = Math.round(h * 0.2);
    g.fillStyle = '#F4EFD8'; g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3C2A5E'; g.beginPath(); g.arc(mx - 3, my - 2, 6, 0, Math.PI * 2); g.fill();                 // a crescent
  } },
  { speed: 0.05, paint(g, w, h, r) { ridge(g, w, h, r, 0.52, 0.2, '#4A3A6E', 9); } },
  { speed: 0.09, paint(g, w, h, r) { ridge(g, w, h, r, 0.66, 0.16, '#33264F', 7); } },
  { speed: 0.16, paint(g, w, h, r) {
    const base = Math.round(h * 0.8);
    g.fillStyle = '#1B1430'; g.fillRect(0, base, w, h - base);
    for (let x = -4; x < w; x += 3 + (r() * 5 | 0)) pine(g, x, base + 1, 6 + (r() * 10 | 0), '#1B1430');
    for (let x = -6; x < w; x += 10 + (r() * 14 | 0)) pine(g, x, h * 0.9 + (r() * h * 0.1 | 0), 12 + (r() * 14 | 0), '#0F0A1E');
  } },
];
// a mountain ridge: a jagged silhouette down to the bottom
function ridge(g, w, h, r, baseF, ampF, col, step) {
  const base = Math.round(h * baseF); let y = base - (r() * h * ampF | 0);
  g.fillStyle = col; g.beginPath(); g.moveTo(0, h); g.lineTo(0, y);
  for (let x = 0; x <= w; x += step) { y = Math.max(base - h * ampF, Math.min(base, y + ((r() - 0.5) * h * 0.08))); g.lineTo(x, Math.round(y)); }
  g.lineTo(w, h); g.closePath(); g.fill();
}
function pine(g, x, baseY, hgt, col) { g.fillStyle = col; for (let i = 0; i < hgt; i++) { const hw = Math.round((i / hgt) * hgt * 0.35) + 1; g.fillRect(x - hw, baseY - hgt + i, hw * 2, 1); } g.fillRect(x, baseY - 1, 1, 2); }

// ---------------------------------------------------------------- sunny hills
const sunny = [
  { speed: 0.02, paint(g, w, h, r) {
    skyGradient(g, w, 0, h, [[0, hex('#5FB3F0')], [0.6, hex('#A8DBF7')], [1, hex('#E6F6FF')]]);
    g.fillStyle = '#FFF6C0'; g.beginPath(); g.arc(Math.round(w * 0.18), Math.round(h * 0.16), 9, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) cloud(g, (r() * w) | 0, (h * (0.08 + r() * 0.35)) | 0, 8 + (r() * 14 | 0), r);
  } },
  { speed: 0.05, paint(g, w, h, r) { hills(g, w, h, r, 0.6, 0.1, '#7CBF7A'); } },
  { speed: 0.09, paint(g, w, h, r) { hills(g, w, h, r, 0.72, 0.08, '#4F9E58'); for (let x = 4; x < w; x += 6 + (r() * 9 | 0)) treeRound(g, x, h * 0.7 + (r() * 6 | 0), 4 + (r() * 3 | 0), '#2E7A3A', '#5B3A1E'); } },
  { speed: 0.16, paint(g, w, h, r) {
    hills(g, w, h, r, 0.86, 0.04, '#2F7A3C');
    for (let x = -4; x < w; x += 14 + (r() * 24 | 0)) treeRound(g, x, h * 0.86 + (r() * 4 | 0), 7 + (r() * 5 | 0), '#1F5C2B', '#4A2E16');
    for (let i = 0; i < w / 3; i++) { g.fillStyle = ['#FFD86B', '#FF7AA2', '#FFFFFF'][(r() * 3) | 0]; g.fillRect((r() * w) | 0, (h * 0.87 + r() * h * 0.12) | 0, 1, 1); }
  } },
];
function hills(g, w, h, r, baseF, ampF, col) {
  const base = Math.round(h * baseF); g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
  const n = 6 + (r() * 4 | 0), amp = h * ampF, ph = r() * 7;
  for (let x = 0; x <= w; x += 2) g.lineTo(x, Math.round(base - (Math.sin(x / w * Math.PI * n + ph) * 0.5 + 0.5) * amp));
  g.lineTo(w, h); g.closePath(); g.fill();
}
function cloud(g, x, y, s, r) { g.fillStyle = '#FFFFFF'; for (let i = 0; i < 4; i++) { const rr = (s * (0.35 + r() * 0.4)) | 0; g.beginPath(); g.arc(x + (i - 1.5) * s * 0.4, y + (r() - 0.5) * s * 0.2, rr, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#DCEFFA'; g.fillRect(x - s * 0.8, y + s * 0.25, s * 1.6, 1); }
function treeRound(g, x, baseY, s, leaf, trunk) { g.fillStyle = trunk; g.fillRect(x, baseY - s, 1, s); g.fillStyle = leaf; g.beginPath(); g.arc(x, baseY - s - s * 0.6, s * 0.8, 0, Math.PI * 2); g.fill(); }

// ---------------------------------------------------------------- deep space
const space = [
  { speed: 0.01, paint(g, w, h, r) {
    skyGradient(g, w, 0, h, [[0, hex('#02030C')], [0.5, hex('#070B22')], [1, hex('#0B1030')]]);
    // a nebula: soft overlapping blobs in teal and violet, dithered by alpha
    for (let n = 0; n < 3; n++) {                                                                               // three drifts of cloud, each a swarm of faint blobs
      const ox = r() * w, oy = h * (0.15 + r() * 0.5), c = ['120,60,200', '40,160,190', '200,80,160'][n], spread = w * 0.22;
      for (let i = 0; i < 120; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread, x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.45, rad = 3 + r() * 9; g.fillStyle = `rgba(${c},${0.035 + r() * 0.04})`; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
    }
    stars(g, w, h, r, Math.round(w * 2.2), ['#FFFFFF', '#CFE4FF', '#FFE2B0', '#B6FFF2']);
  } },
  { speed: 0.04, paint(g, w, h, r) {
    // a ringed planet, low on the right
    const cx = Math.round(w * 0.74), cy = Math.round(h * 0.62), R = Math.round(h * 0.13);
    g.fillStyle = 'rgba(255,170,90,0.12)'; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, Math.PI * 2); g.fill();
    for (let y = -R; y <= R; y++) { const hw = Math.round(Math.sqrt(R * R - y * y)), band = Math.floor((y + R) / 4); g.fillStyle = ['#E0945A', '#C8783F', '#F0B070', '#B06030'][band % 4]; g.fillRect(cx - hw, cy + y, hw * 2, 1); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(cx + R * 0.35, cy, R, 0, Math.PI * 2); g.fill();                          // its night side
    // the ring: a tilted ellipse, the far half hidden behind the planet
    for (let t = 0; t < Math.PI * 2; t += 0.004) {
      const rx = Math.cos(t) * R * 1.9, ry = Math.sin(t) * R * 0.42, x = Math.round(cx + rx), y = Math.round(cy + ry);
      if (ry < 0 && Math.hypot(rx, ry / 0.42) < R * 1.05 && Math.abs(rx) < R) continue;
      g.fillStyle = Math.abs(rx) > R * 1.6 ? '#9C8A74' : '#E8D8C0'; g.fillRect(x, y, 1, 1); if (Math.abs(rx) < R * 1.7) g.fillRect(x, y + 1, 1, 1);
    }
    const sx = Math.round(w * 0.2), sy = Math.round(h * 0.3); g.fillStyle = '#8FA6C4'; g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5F7694'; g.fillRect(sx - 2, sy - 1, 2, 1);   // a small moon
  } },
  { speed: 0.14, paint(g, w, h, r) {
    for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, s = 2 + r() * 5; g.fillStyle = '#4A4F5E'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); g.fillStyle = '#6B7080'; g.fillRect(x - s * 0.4, y - s * 0.5, s * 0.6, 1); }   // asteroids
  } },
];

const SCENES = { synth, dusk, sunny, space };

export class Backdrop {
  constructor(W, H, seed = 7, { night = false, theme = 'synth' } = {}) {
    this.W = W; this.H = H; this.seed = seed; this.night = night; this.theme = SCENES[theme] ? theme : 'synth';
    this.layers = null; this.size = null;
  }
  reveal() {}                                                   // the scene is always behind the page now
  // paint every layer for this view size (once; again when the window changes)
  build(w, h) {
    const lw = Math.ceil(w / PX), lh = Math.ceil(h * OVER / PX);
    this.layers = SCENES[this.theme].map((L, i) => {
      const c = document.createElement('canvas'); c.width = lw; c.height = lh; const g = c.getContext('2d');
      L.paint(g, lw, lh, rng(this.seed * 31 + i * 7 + 1));
      // the page stays the star: knock the scene back a little (more on dark pages for the one bright scene)
      const dim = this.night && this.theme === 'sunny' ? 0.5 : this.theme === 'sunny' ? 0.04 : 0.08;
      g.fillStyle = `rgba(10,8,24,${dim})`; g.fillRect(0, 0, lw, lh);
      return { c, speed: L.speed };
    });
    this.size = { w, h };
  }
  draw(g, cam) {
    if (!this.layers || this.size.w !== cam.w || this.size.h !== cam.h) this.build(cam.w, cam.h);
    g.imageSmoothingEnabled = false;
    const lift = cam.h * (OVER - 1) / 2;
    for (const L of this.layers) {
      const tw = cam.w, th = cam.h * OVER;
      let ox = -((cam.x * L.speed) % tw); if (ox > 0) ox -= tw;
      const oy = -lift - Math.max(-lift, Math.min(lift, cam.y * L.speed * 0.6));
      for (let x = ox; x < cam.w; x += tw) g.drawImage(L.c, cam.x + x, cam.y + oy, tw, th);
    }
  }
}
