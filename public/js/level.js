// The level: a screenshot of the page split into tiles, plus a grid built from the page's boxes.
// Grid cells: 0 empty, 1 content (letters, images, controls: stops shots, can stand on),
// 2 ledge (top edge of a styled box: can stand on, shots fly through).
// Elements (images, icons, buttons, inputs, videos, background-image blocks) work like this:
// hits carve holes AND add damage; hit points grow with size; they crack at 30/55/80% damage and come loose, falling
// off the page as one piece with their text, when the damage reaches their hit points or 38% of them is carved away.
// Letters still go in one hit.
export const CELL = 2;         // grid resolution in page pixels (fine, so feet land right on the glyphs)
export const BLOCK = 4;        // explosion holes are cut in chunkier 4px blocks
const CONTENT = 1, LEDGE = 2;
const TILE = 1024;             // tile height for the page image
// element hit points: 20 + 0.4 x sqrt(area) (pictures 0.32), scaled so a pistol round does 1: a 100x40 button ~3 hits, a 300x200 card ~7, a 1000x600 section ~20
const hpFor = (w, h, picture) => (20 + (picture ? 0.32 : 0.4) * Math.sqrt(w * h)) / 16;
const LOOSE_AT = 0.38;   // comes loose once this share of it has been carved away

export class Level {
  constructor(meta, bitmap) {
    this.meta = meta;
    this.W = meta.width; this.H = meta.height;
    this.cols = Math.ceil(this.W / CELL); this.rows = Math.ceil(this.H / CELL);
    this.solid = new Uint8Array(this.cols * this.rows);
    this.owner = new Int32Array(this.cols * this.rows).fill(-1); // letter index per cell
    this.elOwner = new Int32Array(this.cols * this.rows).fill(-1); // element index per cell
    this.elements = []; this.maxShards = 48;   // maxShards: most pieces a falling element shatters into
    // The page image is stored at device resolution (scale = pixels per page pixel) in GPU canvases that are drawn
    // and carved but never read back (a read-back blocks the frame, and a canvas that is read often is kept in
    // main memory and re-uploaded whenever it changes: 20MB a tile on a retina screen). Everything that needs pixels
    // reads the snapshot instead: a copy of the untouched page taken once here (letters are cut out of it when they
    // pop; measureInk and the colour table below use it). Full resolution normally, 1x when that would be heavy.
    // Each tile's context is transformed so all drawing below happens in page coordinates.
    this.scale = meta.scale || 1;
    const s = this.scale, bytes = this.W * this.H * s * s * 4;
    this.snapScale = bytes > 180e6 || (navigator.maxTouchPoints > 0 && bytes > 60e6) ? 1 : s;
    const ss = this.snapScale;
    this.tiles = [];
    for (let y = 0; y < this.H; y += TILE) {
      const h = Math.min(TILE, this.H - y);
      const c = document.createElement('canvas');
      c.width = Math.round(this.W * s); c.height = Math.round(h * s);
      const g = c.getContext('2d');
      g.drawImage(bitmap, 0, -Math.round(y * s));
      g.setTransform(s, 0, 0, s, 0, -y * s);
      const sc = document.createElement('canvas');
      sc.width = Math.round(this.W * ss); sc.height = Math.round(h * ss);
      const sg = sc.getContext('2d', { willReadFrequently: true });
      sg.setTransform(ss / s, 0, 0, ss / s, 0, -Math.round(y * ss)); sg.drawImage(bitmap, 0, 0);
      this.tiles.push({ y, h, c, g, snap: sg.getImageData(0, 0, sc.width, sc.height) });
    }
    this.buildColors();
    const b = meta.boxes;
    for (let i = 0; i < b.length; i += 5) if (b[i + 4] >= 2) this.fillLedge(b[i], b[i + 1], b[i + 2]);
    for (let i = 0; i < b.length; i += 5) if (b[i + 4] === 1) {
      const id = this.elements.length, w = b[i + 2], h = b[i + 3], hp = hpFor(w, h, true);
      this.elements.push({ x: b[i], y: b[i + 1], w, h, hp, maxHp: hp, alive: true, cells: 0, lost: 0 });
      this.fillMedia(b[i], b[i + 1], w, h, id);
    }
    this.letters = [];
    const L = meta.letters || [];
    for (let i = 0; i < L.length; i += 4) this.letters.push({ x: L[i], y: L[i + 1], w: L[i + 2], h: L[i + 3], alive: true });
    this.measureInk();
    // a letter is solid only where its ink is, so you stand on the glyph itself, not the line box above it
    this.letters.forEach((l, id) => this.fillRect(l.x, l.iy ?? l.y, l.w, l.ih ?? l.h, id));
    this.total = 0;
    for (let i = 0; i < this.solid.length; i++) if (this.solid[i] === CONTENT) { this.total++; if (this.elOwner[i] >= 0) this.elements[this.elOwner[i]].cells++; }
    this.loose = new Set();   // elements carved past LOOSE_AT this frame (the arsenal drops them off the page)
    this.left = this.total;
    this.buildContainers(b);
    // content per grid row at the start (prefix sums): the denominator for "how much of the part you've seen is gone"
    this.rowStart = new Int32Array(this.rows + 1);
    for (let r = 0; r < this.rows; r++) { let n = 0; for (let c = 0, k = r * this.cols; c < this.cols; c++, k++) if (this.solid[k] === CONTENT) n++; this.rowStart[r + 1] = this.rowStart[r] + n; }
  }

  fillRect(x, y, w, h, id, el = -1) {
    const c0 = Math.max(0, Math.floor(x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + w - 0.5) / CELL));
    const r0 = Math.max(0, Math.floor(y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      this.solid[k] = CONTENT;
      if (id >= 0) this.owner[k] = id;
      if (el >= 0) this.elOwner[k] = el;
    }
  }
  // Finds each letter's real ink (top and bottom rows that differ from its backdrop) in the page image.
  measureInk() {
    const s = this.snapScale;
    for (const t of this.tiles) {
      const W = t.snap.width, H = t.snap.height, d = t.snap.data;
      for (const l of this.letters) {
        if (l.y < t.y || l.y + l.h > t.y + t.h) continue; // straddles two tiles: keep its box
        const X0 = Math.max(0, Math.floor(l.x * s)), X1 = Math.min(W, Math.ceil((l.x + l.w) * s));
        const Y0 = Math.max(0, Math.floor((l.y - t.y) * s)), Y1 = Math.min(H, Math.ceil((l.y + l.h - t.y) * s));
        if (X1 - X0 < 1 || Y1 - Y0 < 2) continue;
        const samples = [[X0, Y0], [X1 - 1, Y0], [X0, Y1 - 1], [X1 - 1, Y1 - 1], [X0, (Y0 + Y1) >> 1], [X1 - 1, (Y0 + Y1) >> 1]]
          .map(([x, y]) => (y * W + x) * 4);
        const bg = [0, 1, 2].map(k => samples.map(p => d[p + k]).sort((a, b) => a - b)[3]);
        let top = -1, bot = -1;
        for (let y = Y0; y < Y1; y++) {
          for (let x = X0, p = (y * W + X0) * 4; x < X1; x++, p += 4) {
            if (Math.abs(d[p] - bg[0]) > 64 || Math.abs(d[p + 1] - bg[1]) > 64 || Math.abs(d[p + 2] - bg[2]) > 64) {
              if (top < 0) top = y;
              bot = y; break;
            }
          }
        }
        if (top >= 0) { l.iy = t.y + top / s; l.ih = Math.max(1, (bot + 1 - top) / s); }
      }
    }
  }

  // Images and other media: small ones are solid, big ones (hero banners, backdrops) are solid only
  // where they actually show something that differs from their own backdrop colour.
  fillMedia(x, y, w, h, el = -1) {
    if (w * h < 150 * 150) { this.fillRect(x, y, w, h, -1, el); return; }
    const c0 = Math.max(0, Math.floor(x / CELL)), r0 = Math.max(0, Math.floor(y / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / CELL));
    const cw = c1 - c0 + 1, ch = r1 - r0 + 1;
    if (cw < 3 || ch < 3) { this.fillRect(x, y, w, h, -1, el); return; }
    // one pixel per grid cell: the browser averages each cell's colour for us
    const m = document.createElement('canvas'); m.width = cw; m.height = ch;
    const g = m.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const k = 1 / (CELL * this.scale);
    for (const t of this.tiles) {
      if (r1 * CELL < t.y || r0 * CELL > t.y + t.h) continue;
      g.setTransform(k, 0, 0, k, -c0, (t.y - r0 * CELL) / CELL);
      g.drawImage(t.c, 0, 0);
    }
    const d = g.getImageData(0, 0, cw, ch).data;
    // backdrop colour = median of the border cells
    const border = [[], [], []];
    const add = (cx, cy) => { const p = (cy * cw + cx) * 4; border[0].push(d[p]); border[1].push(d[p + 1]); border[2].push(d[p + 2]); };
    for (let cx = 0; cx < cw; cx++) { add(cx, 0); add(cx, ch - 1); }
    for (let cy = 1; cy < ch - 1; cy++) { add(0, cy); add(cw - 1, cy); }
    const bgc = border.map(v => v.sort((p, q) => p - q)[v.length >> 1]);
    const plain = border[0].filter((_, i) => Math.max(Math.abs(border[0][i] - bgc[0]), Math.abs(border[1][i] - bgc[1]), Math.abs(border[2][i] - bgc[2])) < 20).length / border[0].length;
    if (plain < 0.6) { this.fillRect(x, y, w, h, -1, el); return; } // busy photo edge to edge: all of it is content
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      const p = (cy * cw + cx) * 4;
      if (Math.max(Math.abs(d[p] - bgc[0]), Math.abs(d[p + 1] - bgc[1]), Math.abs(d[p + 2] - bgc[2])) > 26) {
        const k = (r0 + cy) * this.cols + c0 + cx;
        this.solid[k] = CONTENT; if (el >= 0) this.elOwner[k] = el;
      }
    }
  }
  fillLedge(x, y, w) { // one row of cells along the top of a styled box
    const r = Math.floor(y / CELL);
    if (r < 0 || r >= this.rows) return;
    const c0 = Math.max(0, Math.floor(x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / CELL));
    for (let c = c0; c <= c1; c++) if (!this.solid[r * this.cols + c]) this.solid[r * this.cols + c] = LEDGE;
  }

  // share of the content between page heights y0..y1 that has been destroyed
  destroyedIn(y0, y1) {
    const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(this.rows, Math.ceil(y1 / CELL));
    const start = this.rowStart[r1] - this.rowStart[r0]; if (!start) return 0;
    let left = 0; for (let k = r0 * this.cols, e = r1 * this.cols; k < e; k++) if (this.solid[k] === CONTENT) left++;
    return 1 - left / start;
  }
    get destroyed() { return this.total ? 1 - this.left / this.total : 0; }

  // anything you can stand on or bounce off
  solidAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return false;
    return this.solid[((y / CELL) | 0) * this.cols + ((x / CELL) | 0)] !== 0;
  }
  // only real content stops a shot; backgrounds and ledges let it through
  hitAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return false;
    return this.solid[((y / CELL) | 0) * this.cols + ((x / CELL) | 0)] === CONTENT;
  }
  cellSolid(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    return this.solid[r * this.cols + c] !== 0;
  }
  letterAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return -1;
    return this.owner[((y / CELL) | 0) * this.cols + ((x / CELL) | 0)];
  }

  // copy part of the page as it is now (holes, scorch and cracks included) into a new canvas: the sprite of a falling
  // element or chip. Canvas to canvas on the GPU, so it costs nothing to speak of.
  copyRegion(x, y, w, h) {
    const s = this.scale;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d');
    for (const t of this.tiles) {
      if (y + h <= t.y || y >= t.y + t.h) continue;
      g.drawImage(t.c, Math.round(-x * s), Math.round((t.y - y) * s)); // canvas bounds clip it; handles regions straddling two tiles
    }
    c.pageW = w; c.pageH = h; // size in page pixels
    return c;
  }

  // the untouched page's pixels in a region (snapshot resolution), for cutting a letter out when it pops
  readRegion(x, y, w, h) {
    const s = this.snapScale, W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s)), X = Math.round(x * s);
    const out = new ImageData(W, H);
    for (const t of this.tiles) {
      if (y + h <= t.y || y >= t.y + t.h) continue;
      const S = t.snap, ty = Math.round((y - t.y) * s), r0 = Math.max(0, -ty), r1 = Math.min(H, S.height - ty);
      const c0 = Math.max(0, -X), c1 = Math.min(W, S.width - X), cw = c1 - c0;
      if (r1 <= r0 || cw <= 0) continue;
      for (let r = r0; r < r1; r++) { const p = ((ty + r) * S.width + X + c0) * 4; out.data.set(S.data.subarray(p, p + cw * 4), (r * W + c0) * 4); }
    }
    return out;
  }

  // One colour per 4px block of the untouched page: debris and dust are coloured from this
  // table instead of reading the page. Packed 0xAARRGGBB; 0 where there was nothing.
  buildColors() {
    const s = this.snapScale, cw = this.colCols = Math.ceil(this.W / BLOCK), ch = this.colRows = Math.ceil(this.H / BLOCK);
    const col = this.colors = new Uint32Array(cw * ch);
    this.gone = new Uint8Array(cw * ch);                                           // blocks carved, burnt or torn away since
    let lum = 0, n = 0;                                                         // how light the page is overall (0..1)
    for (const t of this.tiles) {
      const S = t.snap, d = S.data, q0 = Math.floor(t.y / BLOCK), q1 = Math.min(ch - 1, Math.ceil((t.y + t.h) / BLOCK) - 1);
      for (let q = q0; q <= q1; q++) {
        const py = Math.min(S.height - 1, Math.round(((q + 0.5) * BLOCK - t.y) * s)); if (py < 0) continue;
        for (let b = 0; b < cw; b++) {
          const px = Math.min(S.width - 1, Math.round((b + 0.5) * BLOCK * s)), p = (py * S.width + px) * 4;
          if (d[p + 3] >= 40) { col[q * cw + b] = ((d[p + 3] << 24) | (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]) >>> 0; lum += (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255; n++; }
        }
      }
    }
    this.lum = n ? lum / n : 1;
  }
  // is there still page in this 4px block?
  blockThere(k) { return this.colors[k] !== 0 && this.gone[k] === 0; }
  // the blocks under a page rectangle are gone (a piece torn out, a letter box cleared)
  markGone(x, y, w, h) {
    const b0 = Math.max(0, Math.floor(x / BLOCK)), b1 = Math.min(this.colCols - 1, Math.floor((x + w - 1) / BLOCK));
    const q0 = Math.max(0, Math.floor(y / BLOCK)), q1 = Math.min(this.colRows - 1, Math.floor((y + h - 1) / BLOCK));
    for (let q = q0; q <= q1; q++) for (let b = b0; b <= b1; b++) this.gone[q * this.colCols + b] = 1;
  }
  // a block burns away: its pixels go, its content cells are lost; returns the element it belonged to, or -1
  burnBlock(k) {
    const b = k % this.colCols, q = (k / this.colCols) | 0, x = b * BLOCK, y = q * BLOCK;
    this.gone[k] = 1;
    let el = -1;
    const per = BLOCK / CELL;
    for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
      const c = b * per + i, r = q * per + j; if (c >= this.cols || r >= this.rows) continue;
      const kk = r * this.cols + c;
      if (this.elOwner[kk] >= 0) el = this.elOwner[kk];
      if (this.solid[kk] === CONTENT) this.lose(kk);
      this.solid[kk] = 0; this.owner[kk] = -1; this.elOwner[kk] = -1;
    }
    for (const t of this.tiles) if (y + BLOCK > t.y && y < t.y + t.h) t.g.clearRect(x, y, BLOCK, BLOCK);
    return el;
  }
  // a block chars: darkened in place
  charBlock(k, a) {
    if (!this.blockThere(k)) return;
    const b = k % this.colCols, q = (k / this.colCols) | 0, x = b * BLOCK, y = q * BLOCK;
    for (const t of this.tiles) if (y + BLOCK > t.y && y < t.y + t.h) {
      t.g.globalCompositeOperation = 'source-atop'; t.g.fillStyle = `rgba(26,12,8,${a})`; t.g.fillRect(x, y, BLOCK, BLOCK); t.g.globalCompositeOperation = 'source-over';
    }
  }
  // carve a thin line (the star's jets, radial cracks): a hole every 2r along it, radius r (tapering to r1 when given)
  carveLine(x0, y0, x1, y1, r, r1 = r) {
    const d = Math.hypot(x1 - x0, y1 - y0); if (d < 1) return;
    for (let u = 0; u <= d; u += Math.max(2, r)) {
      const f = u / d, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      if (x < 0 || x >= this.W || y < 0 || y >= this.H) continue;
      this.carve(x, y, r + (r1 - r) * f, false);
    }
  }
  // the page's colour at a point (CSS string), or null where there was nothing
  colorAt(x, y) {
    const b = (x / BLOCK) | 0, q = (y / BLOCK) | 0;
    if (b < 0 || q < 0 || b >= this.colCols || q * this.colCols + b >= this.colors.length) return null;
    const v = this.colors[q * this.colCols + b];
    return v ? `rgb(${(v >>> 16) & 255},${(v >>> 8) & 255},${v & 255})` : null;
  }
  // n colours of the page around a point, from the colour table (within 48px: the colours near the hit are the ones
  // that matter)
  sampleColors(x, y, r, n) {
    const out = []; r = Math.min(r, 48);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const c = this.colorAt(x + Math.cos(a) * d, y + Math.sin(a) * d);
      if (c) out.push(c);
    }
    return out;
  }

  // knock one letter off the page; returns a cut-out sprite of it for the debris system.
  // The page behind it is patched with its own backdrop colour, so the letter looks lifted off the page.
  detachLetter(id) {
    const w = this.letters[id];
    if (!w || !w.alive) return null;
    w.alive = false;
    // cut out of the snapshot (plain pixel arrays, so reading them is cheap)
    const img = this.readRegion(w.x, w.y - 1, w.w, w.h + 2), bg = cutOut(img);
    let sprite = null;
    if (!img.blank) {
      sprite = document.createElement('canvas'); sprite.width = img.width; sprite.height = img.height;
      sprite.getContext('2d').putImageData(img, 0, 0); sprite.pageW = w.w; sprite.pageH = w.h + 2;
    }
    for (const t of this.tiles) {
      if (w.y + w.h + 1 <= t.y || w.y - 1 >= t.y + t.h) continue;
      if (bg) { t.g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; t.g.fillRect(w.x, w.y - 1, w.w, w.h + 2); }
      else t.g.clearRect(w.x, w.y - 1, w.w, w.h + 2);
    }
    const c0 = Math.max(0, Math.floor(w.x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((w.x + w.w - 1) / CELL));
    const r0 = Math.max(0, Math.floor(w.y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((w.y + w.h - 1) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      if (this.owner[k] === id) { if (this.solid[k] === CONTENT) this.lose(k); this.solid[k] = 0; this.owner[k] = -1; }
    }
    return { sprite, x: w.x + w.w / 2, y: w.y + w.h / 2, w: w.w, h: w.h, patched: !!bg };
  }

  // a content cell is gone: counts towards the destroyed %, and towards wearing down the element and the innermost
  // container it sits in (38% of one worn away and it comes loose). A container only counts what it holds
  // directly: a card falling out of a section doesn't wear the section down, so one card can't drag the page with it.
  lose(k) {
    this.left--;
    const el = this.elOwner[k];
    if (el >= 0) { const E = this.elements[el]; E.lost++; if (E.alive && E.lost >= E.cells * LOOSE_AT) this.loose.add(el); }
    const b = this.boxOwner ? this.boxOwner[k] : -1;
    if (b >= 0) { const B = this.boxes[b]; B.lost++; if (B.alive && B.cells >= 8 && B.lost >= B.cells * LOOSE_AT) this.looseBox.add(b); }
  }

  // ---------------------------------------------------------------- containers (cards, panels: nesting)
  // Styled boxes (type 2: a background or border, not page-sized) are containers: nested by geometry (a box fully
  // inside another is its child). They aren't solid (shots fly through backgrounds) but they are components: hits on
  // what's inside them damage the innermost one, wearing away 38% of what's inside makes one come loose, and when one
  // comes loose everything in it (text, pictures, buttons, boxes inside) comes off with it as one piece.
  buildContainers(b) {
    this.boxes = []; this.looseBox = new Set();
    this.boxOwner = new Int32Array(this.cols * this.rows).fill(-1);
    const list = [];
    for (let i = 0; i < b.length; i += 5) if (b[i + 4] === 2 && b[i + 2] >= 12 && b[i + 3] >= 10) list.push([b[i], b[i + 1], b[i + 2], b[i + 3]]);
    list.sort((p, q) => q[2] * q[3] - p[2] * p[3]);                      // biggest first: parents are painted before children
    for (const [x, y, w, h] of list) {
      const c0 = Math.max(0, Math.floor(x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / CELL));
      const r0 = Math.max(0, Math.floor(y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / CELL));
      if (c1 < c0 || r1 < r0) continue;
      // parent: the innermost box painted so far that holds all four corners
      const at = (c, r) => this.boxOwner[r * this.cols + c];
      let parent = at(c0, r0);
      if (parent >= 0 && !(at(c1, r0) === parent && at(c0, r1) === parent && at(c1, r1) === parent)) {
        // corners disagree: walk up until a box holds the whole rect
        while (parent >= 0) { const P = this.boxes[parent]; if (P.x <= x + 2 && P.y <= y + 2 && P.x + P.w >= x + w - 2 && P.y + P.h >= y + h - 2) break; parent = P.parent; }
      }
      const id = this.boxes.length, hp = (20 + 0.4 * Math.sqrt(w * h)) / 16;
      this.boxes.push({ x, y, w, h, hp, maxHp: hp, alive: true, parent, cells: 0, lost: 0 });
      for (let r = r0; r <= r1; r++) this.boxOwner.fill(id, r * this.cols + c0, r * this.cols + c1 + 1);
    }
    for (let k = 0; k < this.solid.length; k++) if (this.solid[k] === CONTENT && this.boxOwner[k] >= 0) this.boxes[this.boxOwner[k]].cells++;
    // an element's container: the box under its middle (but never the element's own box)
    this.elements.forEach(e => { const k = ((e.y + e.h / 2) / CELL | 0) * this.cols + ((e.x + e.w / 2) / CELL | 0); e.parent = this.boxOwner[k] ?? -1; });
  }
  boxAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return -1;
    let b = this.boxOwner[((y / CELL) | 0) * this.cols + ((x / CELL) | 0)];
    while (b >= 0 && !this.boxes[b].alive) b = this.boxes[b].parent;
    return b;
  }
  boxesInRadius(cx, cy, r) {
    const ids = [];
    this.boxes.forEach((e, id) => {
      if (!e.alive) return;
      const dx = Math.max(e.x - cx, 0, cx - (e.x + e.w)), dy = Math.max(e.y - cy, 0, cy - (e.y + e.h));
      if (dx * dx + dy * dy <= r * r) ids.push(id);
    });
    return ids;
  }
  damageBox(id, dmg, hx, hy) {
    const B = this.boxes[id];
    if (!B || !B.alive || dmg <= 0) return null;
    const before = 1 - B.hp / B.maxHp; B.hp -= dmg; const after = 1 - B.hp / B.maxHp;
    [0.3, 0.55, 0.8].forEach((t, i) => { if (before < t && after >= t) for (let k = 0; k < 2 + i; k++) this.crack(B, hx ?? B.x + B.w / 2, hy ?? B.y + B.h / 2); });
    return B.hp <= 0 ? 'broken' : 'hit';
  }
  // a container comes loose: one piece with everything in it; it, its contents and the boxes inside it leave the page
  detachBox(id) {
    const B = this.boxes[id];
    if (!B || !B.alive) return null;
    const sprite = this.copyRegion(B.x, B.y, B.w, B.h);
    const inside = (x, y) => x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h;
    // the boxes inside it go too
    const gone = new Set([id]);
    this.boxes.forEach((q, i) => { for (let p = q.parent; p >= 0; p = this.boxes[p].parent) if (p === id) { gone.add(i); break; } });
    for (const i of gone) { this.boxes[i].alive = false; this.looseBox.delete(i); }
    // the letters in it (through the grid, not a walk of every letter on the page)
    const gone2 = new Set();
    { const c0 = Math.max(0, Math.floor(B.x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((B.x + B.w - 1) / CELL));
      const r0 = Math.max(0, Math.floor(B.y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((B.y + B.h - 1) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const o = this.owner[r * this.cols + c]; if (o >= 0) gone2.add(o); } }
    for (const lid of gone2) this.killLetter(lid);
    const letters = gone2.size;
    let elements = 0;
    this.elements.forEach((e, eid) => { if (e.alive && inside(e.x + e.w / 2, e.y + e.h / 2)) { e.alive = false; this.loose.delete(eid); elements++; } });
    const c0 = Math.max(0, Math.floor(B.x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((B.x + B.w - 1) / CELL));
    const r0 = Math.max(0, Math.floor(B.y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((B.y + B.h - 1) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      if (this.solid[k] === CONTENT) this.lose(k);
      this.solid[k] = 0; this.owner[k] = -1; this.elOwner[k] = -1;
    }
    this.looseBox.delete(id);
    this.clearRect(B.x, B.y, B.w, B.h); this.markGone(B.x, B.y, B.w, B.h);
    return { sprite, x: B.x + B.w / 2, y: B.y + B.h / 2, w: B.w, h: B.h, letters, elements };
  }

  // ---------------------------------------------------------------- elements (hit points, cracks, shattering)
  elementAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return -1;
    const k = ((y / CELL) | 0) * this.cols + ((x / CELL) | 0);
    return this.solid[k] === CONTENT ? this.elOwner[k] : -1;
  }
  elementsInRadius(cx, cy, r) {
    const ids = new Set();
    this.elements.forEach((e, id) => {
      if (!e.alive) return;
      const dx = Math.max(e.x - cx, 0, cx - (e.x + e.w)), dy = Math.max(e.y - cy, 0, cy - (e.y + e.h));
      if (dx * dx + dy * dy <= r * r) ids.add(id);
    });
    return ids;
  }
  // takes damage; cracks spread from the hit at 30%, 55% and 80% (bigger ones for bigger elements). Returns 'broken'
  // when the damage reaches its hit points.
  damageElement(id, dmg, hx, hy) {
    const e = this.elements[id];
    if (!e || !e.alive || dmg <= 0) return null;
    const before = 1 - e.hp / e.maxHp; e.hp -= dmg; const after = 1 - e.hp / e.maxHp;
    [0.3, 0.55, 0.8].forEach((t, i) => { if (before < t && after >= t) for (let k = 0; k < 2 + i; k++) this.crack(e, hx ?? e.x + e.w / 2, hy ?? e.y + e.h / 2); });
    return e.hp <= 0 ? 'broken' : 'hit';
  }
  // a jagged crack from (hx, hy) across the element, drawn into the page image (dark line + light edge)
  crack(e, hx, hy) {
    const reach = Math.max(10, Math.min(e.w, e.h) * (0.35 + Math.random() * 0.35)), pts = [[hx, hy]];
    let a = Math.random() * Math.PI * 2, x = hx, y = hy;
    for (let i = 0; i < 6; i++) { a += (Math.random() - 0.5) * 1.1; x += Math.cos(a) * reach / 6; y += Math.sin(a) * reach / 6; pts.push([x, y]); }
    const branch = pts[2 + (Math.random() * 3 | 0)], ba = a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
    const br = [branch, [branch[0] + Math.cos(ba) * reach * 0.35, branch[1] + Math.sin(ba) * reach * 0.35]];
    for (const t of this.tiles) {
      if (e.y + e.h < t.y || e.y > t.y + t.h) continue;
      const g = t.g; g.save(); g.beginPath(); g.rect(e.x, e.y, e.w, e.h); g.clip();
      for (const [col, w, o] of [['rgba(255,255,255,0.45)', 1.2, 0.6], ['rgba(16,12,10,0.85)', 1, 0]]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter';
        for (const line of [pts, br]) { g.beginPath(); line.forEach(([px, py], i) => i ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o)); g.stroke(); }
      }
      g.restore();
    }
  }
  // Comes loose: returns the element as one piece (cut from the page image, holes and the text on it included) and
  // clears it from the page, the grid and the letters.
  detachElement(id) {
    const e = this.elements[id];
    if (!e || !e.alive) return null;
    e.alive = false; this.loose.delete(id);
    const sprite = this.copyRegion(e.x, e.y, e.w, e.h);
    const c0 = Math.max(0, Math.floor(e.x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((e.x + e.w - 1) / CELL));
    const r0 = Math.max(0, Math.floor(e.y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((e.y + e.h - 1) / CELL));
    // letters on it go with it (they are in the copied picture): take them out of play. Found through the grid, not
    // by walking every letter on the page (11,000 on a long article, four times over in one blast)
    const lettersGone = new Set();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      if (this.owner[k] >= 0) lettersGone.add(this.owner[k]);
      if (this.elOwner[k] !== id) continue;
      if (this.solid[k] === CONTENT) this.lose(k);
      this.solid[k] = 0; this.elOwner[k] = -1;
    }
    for (const lid of lettersGone) this.killLetter(lid);
    this.clearRect(e.x, e.y, e.w, e.h); this.markGone(e.x, e.y, e.w, e.h);
    return { sprite, x: e.x + e.w / 2, y: e.y + e.h / 2, w: e.w, h: e.h, letters: lettersGone.size };
  }
  anyOwned(id, x, y, w, h) {
    const c0 = Math.max(0, Math.floor(x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / CELL));
    const r0 = Math.max(0, Math.floor(y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.elOwner[r * this.cols + c] === id && this.solid[r * this.cols + c] === CONTENT) return true;
    return false;
  }

  // a letter vaporised outright (no flying cut-out): its cells and pixels just go
  killLetter(id) {
    const w = this.letters[id];
    if (!w || !w.alive) return false;
    w.alive = false;
    this.clearRect(w.x, w.y - 1, w.w, w.h + 2);
    const c0 = Math.max(0, Math.floor(w.x / CELL)), c1 = Math.min(this.cols - 1, Math.floor((w.x + w.w - 1) / CELL));
    const r0 = Math.max(0, Math.floor(w.y / CELL)), r1 = Math.min(this.rows - 1, Math.floor((w.y + w.h - 1) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      if (this.owner[k] === id) { if (this.solid[k] === CONTENT) this.lose(k); this.solid[k] = 0; this.owner[k] = -1; }
    }
    return true;
  }

  clearRect(x, y, w, h) {
    for (const t of this.tiles) {
      if (y + h <= t.y || y >= t.y + t.h) continue;
      t.g.clearRect(x, y, w, h);
    }
  }

  lettersInRadius(cx, cy, r) {
    const ids = new Set();
    const c0 = Math.max(0, Math.floor((cx - r) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((cx + r) / CELL));
    const r0 = Math.max(0, Math.floor((cy - r) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((cy + r) / CELL));
    const rr = r * r;
    for (let rw = r0; rw <= r1; rw++) for (let c = c0; c <= c1; c++) {
      const dx = c * CELL + CELL / 2 - cx, dy = rw * CELL + CELL / 2 - cy;
      if (dx * dx + dy * dy > rr) continue;
      const o = this.owner[rw * this.cols + c];
      if (o >= 0) ids.add(o);
    }
    return ids;
  }

  // punch a jagged, pixel-edged hole (in 4px blocks) and scorch its rim
  carve(cx, cy, r, scorch = true) {
    let removed = 0;
    const R = r + 6, per = BLOCK / CELL;
    const b0 = Math.max(0, Math.floor((cx - R) / BLOCK)), b1 = Math.min(Math.ceil(this.W / BLOCK) - 1, Math.floor((cx + R) / BLOCK));
    const q0 = Math.max(0, Math.floor((cy - R) / BLOCK)), q1 = Math.min(Math.ceil(this.H / BLOCK) - 1, Math.floor((cy + R) / BLOCK));
    // runs of blocks along each row become one rect each ([x, y, w]): a big blast is ~100 rects, not ~9,000
    const holes = [], rim = [[], []];
    for (let q = q0; q <= q1; q++) {
      const y = q * BLOCK; let run = null, rimRun = [null, null];
      for (let b = b0; b <= b1; b++) {
        const x = b * BLOCK;
        const d = Math.hypot(x + BLOCK / 2 - cx, y + BLOCK / 2 - cy);
        const jag = r * (0.88 + 0.12 * hash(b, q));
        let kind = -1;                                                              // -1 untouched, 0 hole, 1/2 rim colour
        if (d <= jag) {
          kind = 0;
          for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
            const c = b * per + i, rw = q * per + j;
            if (c >= this.cols || rw >= this.rows) continue;
            const k = rw * this.cols + c;
            if (this.solid[k] === CONTENT) { this.lose(k); removed++; }
            this.solid[k] = 0; this.owner[k] = -1; this.elOwner[k] = -1;
          }
        } else if (scorch && d <= jag + 5) kind = hash(x, y) > 0.8 ? 2 : 1;
        if (kind === 0) { if (run && run[0] + run[2] === x) run[2] += BLOCK; else holes.push(run = [x, y, BLOCK]); } else run = null;
        for (let m = 0; m < 2; m++) {
          if (kind === m + 1) { const rr = rimRun[m]; if (rr && rr[0] + rr[2] === x) rr[2] += BLOCK; else rim[m].push(rimRun[m] = [x, y, BLOCK]); }
          else rimRun[m] = null;
        }
      }
    }
    const RIM_COL = ['rgba(25,18,12,0.5)', 'rgba(255,140,40,0.55)'];
    for (const t of this.tiles) {
      const ty0 = t.y, ty1 = t.y + t.h;
      if (cy + R < ty0 || cy - R > ty1) continue;
      for (const [x, y, w] of holes) if (y + BLOCK > ty0 && y < ty1) t.g.clearRect(x, y, w, BLOCK);
      if (this.gone) for (const [x, y, w] of holes) { const q = (y / BLOCK) | 0; if (q < this.colRows) for (let b = (x / BLOCK) | 0, e = Math.min(this.colCols - 1, ((x + w) / BLOCK | 0) - 1); b <= e; b++) this.gone[q * this.colCols + b] = 1; }
      if (rim[0].length || rim[1].length) {
        t.g.globalCompositeOperation = 'source-atop';
        for (let m = 0; m < 2; m++) { t.g.fillStyle = RIM_COL[m]; for (const [x, y, w] of rim[m]) if (y + BLOCK > ty0 && y < ty1) t.g.fillRect(x, y, w, BLOCK); }
        t.g.globalCompositeOperation = 'source-over';
      }
    }
    return removed;
  }

  // a bullet hole in the page background (no content there): a small ragged hole cut at single-pixel resolution, with
  // a thin scorched ring. Nothing on the grid changes (bare page was never solid).
  paperHole(cx, cy, r) {
    const R = Math.ceil(r + 3);
    for (const t of this.tiles) {
      if (cy + R < t.y || cy - R > t.y + t.h) continue;
      t.g.globalCompositeOperation = 'source-atop';
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx + 0.5, dy + 0.5), jag = r * (0.85 + 0.3 * hash(Math.floor(cx) + dx, Math.floor(cy) + dy));
        if (d <= jag || d > jag + 2.4) continue;
        t.g.fillStyle = d <= jag + 1.2 ? 'rgba(30,20,12,0.8)' : 'rgba(30,20,12,0.4)';           // dark burnt edge, fading out
        t.g.fillRect(Math.floor(cx) + dx, Math.floor(cy) + dy, 1, 1);
      }
      t.g.globalCompositeOperation = 'source-over';
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx + 0.5, dy + 0.5), jag = r * (0.85 + 0.3 * hash(Math.floor(cx) + dx, Math.floor(cy) + dy));
        if (d <= jag) t.g.clearRect(Math.floor(cx) + dx, Math.floor(cy) + dy, 1, 1);
      }
    }
  }

  // Ragged, burnt edges round the rectangle a blast tore a piece out of: bites carved into the page along its border
  raggedEdge(x, y, w, h) {
    const per = 2 * (w + h);
    for (let u = 0; u < per; u += 14) {
      let px, py;
      if (u < w) { px = x + u; py = y; } else if (u < w + h) { px = x + w; py = y + (u - w); } else if (u < 2 * w + h) { px = x + w - (u - w - h); py = y + h; } else { px = x; py = y + h - (u - 2 * w - h); }
      const bx = px | 0, by = py | 0;
      if (hash(bx, by) < 0.7) this.carve(px + (hash(by, bx) - 0.5) * 8, py + (hash(bx + 1, by) - 0.5) * 8, 5 + hash(bx, by + 7) * 8, false);
    }
    for (const seg of [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]) this.scorch(0, 0, 0, 0, 0.9, seg);
  }

  // Scorch: a soft halo of burnt stipple from radius r0 out to r1 (page px), densest at the hole and fading
  // out in four bands of 4px blocks; on dark pixels it goes light (ash) instead of dark so it still shows. Only the
  // page gets it: cells already carved away are skipped. With `seg` ([x0,y0,x1,y1]) it follows a line instead (the
  // .50's trench), 4px wide.
  scorch(cx, cy, r0, r1, strength = 1, seg = null) {
    const BANDS = [0.22, 0.45, 0.7, 0.9], dark = [[], [], [], []], light = [[], [], [], []];
    let b0, b1, q0, q1, w0, w1;
    if (seg) { const [x0, y0, x1, y1] = seg; b0 = Math.min(x0, x1) - 8; b1 = Math.max(x0, x1) + 8; q0 = Math.min(y0, y1) - 8; q1 = Math.max(y0, y1) + 8; w0 = 3.5; w1 = 9; }
    else { b0 = cx - r1; b1 = cx + r1; q0 = cy - r1; q1 = cy + r1; w0 = r0; w1 = r1; }
    b0 = Math.max(0, Math.floor(b0 / BLOCK)); b1 = Math.min(Math.ceil(this.W / BLOCK) - 1, Math.floor(b1 / BLOCK));
    q0 = Math.max(0, Math.floor(q0 / BLOCK)); q1 = Math.min(Math.ceil(this.H / BLOCK) - 1, Math.floor(q1 / BLOCK));
    const dist = seg ? (x, y) => { const [x0, y0, x1, y1] = seg, vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / L2)); return Math.hypot(x - x0 - vx * t, y - y0 - vy * t); }
      : (x, y) => Math.hypot(x - cx, y - cy);
    for (let q = q0; q <= q1; q++) for (let b = b0; b <= b1; b++) {
      const x = b * BLOCK + BLOCK / 2, y = q * BLOCK + BLOCK / 2, d = dist(x, y);
      if (d < w0 - 1 || d > w1) continue;
      const j = Math.max(0, (d - w0) / Math.max(1, w1 - w0)), v = strength * Math.pow(1 - j, 1.4) + (hash(b, q) - 0.5) * 0.3;
      let band = -1; for (let k = BANDS.length - 1; k >= 0; k--) if (v >= BANDS[k]) { band = k; break; }
      if (band < 0) continue;
      const col = this.colors[q * this.colCols + b]; if (!col) continue;                 // nothing was there to burn
      const lum = (((col >>> 16) & 255) * 0.3 + ((col >>> 8) & 255) * 0.59 + (col & 255) * 0.11) / 255;
      if (lum < 0.3) { if (band >= 2) light[band].push(b, q); } else dark[band].push(b, q);
    }
    for (const t of this.tiles) {
      if (q1 * BLOCK + BLOCK < t.y || q0 * BLOCK > t.y + t.h) continue;
      const g = t.g; g.globalCompositeOperation = 'source-atop';
      for (const [lists, rgb, mul] of [[dark, '28,14,9', 1], [light, '196,182,190', 0.6]]) lists.forEach((L, k) => {
        if (!L.length) return; g.fillStyle = `rgba(${rgb},${(BANDS[k] * mul).toFixed(2)})`;
        for (let i = 0; i < L.length; i += 2) { const y = L[i + 1] * BLOCK; if (y + BLOCK > t.y && y < t.y + t.h) g.fillRect(L[i] * BLOCK, y, BLOCK, BLOCK); }
      });
      g.globalCompositeOperation = 'source-over';
    }
  }

  // pxPerUnit = screen device pixels per page pixel; when it matches the stored scale we blit 1:1 (sharpest)
  draw(g, cam, pxPerUnit) {
    g.imageSmoothingEnabled = Math.abs(pxPerUnit - this.scale) > 0.01;
    g.imageSmoothingQuality = 'high';
    for (const t of this.tiles) {
      if (t.y + t.h < cam.y || t.y > cam.y + cam.h) continue;
      g.drawImage(t.c, 0, t.y, this.W, t.h);
    }
  }
}

// Turns a letter's snapshot (ImageData, edited in place) into a cut-out: the backdrop colour (median of the border) becomes transparent
// and anti-aliased edges are un-mixed from it. Returns the backdrop colour, or null if it was already a hole.
function cutOut(img) {
  const d = img.data, W = img.width, H = img.height;
  const ch = [[], [], [], []];
  const add = (x, y) => { const p = (y * W + x) * 4; for (let k = 0; k < 4; k++) ch[k].push(d[p + k]); };
  for (let x = 0; x < W; x++) { add(x, 0); add(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { add(0, y); add(W - 1, y); }
  const bg = ch.map(v => v.sort((a, b) => a - b)[v.length >> 1]);
  if (bg[3] < 128) return null;
  const dist = p => Math.max(Math.abs(d[p] - bg[0]), Math.abs(d[p + 1] - bg[1]), Math.abs(d[p + 2] - bg[2]));
  let far = 0;
  for (let p = 0; p < d.length; p += 4) far = Math.max(far, dist(p));
  if (far < 14) { img.blank = true; return bg; } // nothing drawn here (a box with no glyph in it): no piece to throw
  // a faint glyph stays faint (the unmixing is scaled as if the contrast were at least 48), instead of being kept as
  // an opaque box of its background
  const span = Math.max(far, 48) * 0.85;
  for (let p = 0; p < d.length; p += 4) {
    const a = Math.min(1, dist(p) / span);
    if (a < 0.04) { d[p + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) d[p + k] = Math.max(0, Math.min(255, (d[p + k] - bg[k] * (1 - a)) / a));
    d[p + 3] = Math.round(255 * a);
  }
  return bg;
}

export function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
