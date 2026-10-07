// PixelLab returns its options as tiles of one 8x8 sheet, but the tile cuts don't line up with the sprites. This puts the
// sheet back together and cuts each sprite out whole (connected pixels, small gaps bridged), into art/weapons/whole/.
// usage: node scripts/art/recut-options.mjs <id> ...   (GAP=1 for long thin items whose sprites nearly touch; default 2)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const GAP = +(process.env.GAP || 2);
const O = new URL('../public/art/weapons/options/', import.meta.url).pathname, OUT = O.replace('options/', 'whole/');
fs.mkdirSync(OUT, { recursive: true });
for (const id of process.argv.slice(2)) {
  const n = fs.readdirSync(O).filter(f => new RegExp(`^${id}_\\d+\\.png$`).test(f)).length, cols = 8, rows = Math.ceil(n / cols);
  const big = `${OUT}_${id}_sheet.png`;
  const rowFiles = [];
  for (let r = 0; r < rows; r++) {
    const f = `${OUT}_${id}_row${r}.png`;
    execFileSync('magick', [...Array.from({ length: cols }, (_, c) => `${O}${id}_${r * cols + c}.png`).filter(fs.existsSync), '+append', f]);
    rowFiles.push(f);
  }
  execFileSync('magick', [...rowFiles, '-append', big]); rowFiles.forEach(f => fs.unlinkSync(f));
  const [W, H] = execFileSync('magick', ['identify', '-format', '%w %h', big]).toString().split(' ').map(Number);
  const px = execFileSync('magick', [big, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 });
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && px[(y * W + x) * 4 + 3] > 40;
  const lab = new Int32Array(W * H).fill(-1), boxes = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] >= 0 || px[s * 4 + 3] <= 40) continue;
    const id2 = boxes.length, st = [s], b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 }; lab[s] = id2;
    while (st.length) {
      const q = st.pop(), x = q % W, y = (q / W) | 0; b.n++;
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
      for (let dy = -GAP; dy <= GAP; dy++) for (let dx = -GAP; dx <= GAP; dx++) { const r = (y + dy) * W + x + dx; if (on(x + dx, y + dy) && lab[r] < 0) { lab[r] = id2; st.push(r); } }
    }
    boxes.push(b);
  }
  const tileW = W / cols, keep = boxes.filter(b => b.n > 30 && b.x1 - b.x0 + 1 >= tileW * 0.35 && b.x1 - b.x0 + 1 <= tileW * 1.15 && b.y1 - b.y0 + 1 <= H / rows * 1.15).sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  fs.readdirSync(OUT).filter(f => f.startsWith(id + '_')).forEach(f => fs.unlinkSync(OUT + f));
  keep.forEach((b, k) => execFileSync('magick', [big, '-crop', `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}+${b.x0}+${b.y0}`, '+repage', `${OUT}${id}_${k}.png`]));
  fs.unlinkSync(big);
  console.log(`${id}: ${keep.length} sprites`);
}
