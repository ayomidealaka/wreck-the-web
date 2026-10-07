// Recolours one sprite in another's metal: every pixel of <target> keeps its brightness (so its shading and detail stay)
// but takes the colour the <source> art has at that brightness. Saturated accents in the source (lights) are ignored.
// usage: node scripts/art/match-metal.mjs <source.png> <target.png> <out.png>
import { execFileSync } from 'node:child_process';
const [SRC, TGT, OUT] = process.argv.slice(2);
const read = f => { const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', f]).toString().split(' ').map(Number); return { w, h, d: execFileSync('magick', [f, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 26 }) }; };
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const s = read(SRC), ramp = [];
for (let i = 0; i < s.d.length; i += 4) {
  if (s.d[i + 3] < 200) continue;
  const r = s.d[i], g = s.d[i + 1], b = s.d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx > 0 && (mx - mn) / mx > 0.35) continue;                      // skip the red sensor lights etc.
  ramp.push([lum(r, g, b), r, g, b]);
}
ramp.sort((a, b) => a[0] - b[0]);
const pick = q => ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(q * (ramp.length - 1))))];
const t = read(TGT), L = [];
for (let i = 0; i < t.d.length; i += 4) if (t.d[i + 3] > 40) L.push(lum(t.d[i], t.d[i + 1], t.d[i + 2]));
L.sort((a, b) => a - b);
const rank = v => { let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, L.length - 1); };
const out = Buffer.from(t.d);
for (let i = 0; i < out.length; i += 4) {
  if (out[i + 3] <= 40) continue;
  const c = pick(rank(lum(out[i], out[i + 1], out[i + 2])));            // same brightness rank, source's colour
  out[i] = c[1]; out[i + 1] = c[2]; out[i + 2] = c[3];
}
execFileSync('magick', ['-size', `${t.w}x${t.h}`, '-depth', '8', 'rgba:-', OUT], { input: out });
console.log(`recoloured ${TGT} -> ${OUT} using ${ramp.length} source colours`);
