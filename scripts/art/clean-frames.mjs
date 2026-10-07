// Removes stray pixels the generator sometimes adds (floating glyphs, detached sparks) from every frame:
// keeps the biggest connected blob (the character) plus anything within GAP px of it (gun, hair strands).
// Originals are copied to <dir>/raw/ the first time. usage: node scripts/art/clean-frames.mjs [prefix] [anim|skel]
import fs from 'node:fs';
import zlib from 'node:zlib';
const A = new URL(`../public/art/${process.argv[3] || 'anim'}/`, import.meta.url).pathname;
const RAW = A + 'raw/';
const GAP = 3;

function readPng(b) {
  let p = 8, w, h, ct; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (ct !== 6) return null; // only 8-bit RGBA (what PixelLab returns); anything else is left untouched
  const bpp = 4, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4);
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
function writePng({ w, h, px }) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function clean(img) {
  const { w, h, px } = img, op = i => px[i * 4 + 3] > 20;
  const label = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s = 0; s < w * h; s++) {
    if (!op(s) || label[s] >= 0) continue;
    const id = sizes.length, stack = [s]; label[s] = id; let n = 0;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (op(q) && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
    sizes.push(n);
  }
  if (sizes.length <= 1) return 0;
  const main = sizes.indexOf(Math.max(...sizes));
  // grow the "keep" mask from the main blob by GAP px, then keep any blob touching it
  const near = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (label[p] === main) {
    const x = p % w, y = (p / w) | 0;
    for (let dy = -GAP; dy <= GAP; dy++) for (let dx = -GAP; dx <= GAP; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1; }
  }
  const keep = new Set([main]);
  for (let p = 0; p < w * h; p++) if (label[p] >= 0 && near[p]) keep.add(label[p]);
  let removed = 0;
  for (let p = 0; p < w * h; p++) if (label[p] >= 0 && !keep.has(label[p])) { px[p * 4 + 3] = 0; removed++; }
  return removed;
}

const prefix = process.argv[2] || 'c';
fs.mkdirSync(RAW, { recursive: true });
let total = 0, files = 0;
// reference images used as generation inputs are never touched
for (const f of fs.readdirSync(A).filter(f => f.startsWith(prefix) && f.endsWith('.png') && !/_(first|base|ref)\.png$/.test(f))) {
  if (!fs.existsSync(RAW + f)) fs.copyFileSync(A + f, RAW + f);
  const img = readPng(fs.readFileSync(RAW + f));        // always clean from the original
  if (!img) { console.log(`skipped ${f}: not an RGBA PNG`); continue; }
  const n = clean(img);
  fs.writeFileSync(A + f, writePng(img));
  if (n) { files++; total += n; }
}
console.log(`cleaned ${files} frames, removed ${total} stray pixels`);
