// Fire on the page itself. The page is tracked in 4px blocks: flames and burning letters heat the blocks under them,
// a block that gets hot enough catches, burns for a moment while it spreads to its neighbours, then burns away into
// a hole and chars the blocks around it. Fire carries an energy that drops by one with each block it jumps to, so a
// flame burst eats a patch of page and goes out instead of taking the whole thing.
import { BLOCK } from './level.js';

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const FLAME = ['#FFF6C8', '#FFE07A', '#FFB238', '#FF8A2E', '#F2552C'];
const MAX_BURNING = 2000, EMIT_PER_FRAME = 22;
const SPREAD = 9, COOL = 1.0;        // spreads per second from a burning block; how fast warmth fades

export class Fire {
  constructor(level, fx) {
    this.level = level; this.fx = fx;
    this.heat = new Map();       // block -> warmth building up (catches at 1)
    this.cells = new Map();      // block -> { t, max, e } burning now
    this.damage = new Map();     // element -> damage owed from blocks of it that burned away
    this.emitted = 0; this.burnt = 0;   // burnt: blocks burned away so far
  }
  get size() { return this.cells.size; }

  // warmth from a flame at a point (page px): most to the block under it, a little to the ring around
  heatAt(x, y, amount, energy = 5) {
    const L = this.level, b = (x / BLOCK) | 0, q = (y / BLOCK) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const bb = b + dx, qq = q + dy;
      if (bb < 0 || qq < 0 || bb >= L.colCols || qq >= L.colRows) continue;
      const k = qq * L.colCols + bb;
      if (!L.blockThere(k) || this.cells.has(k)) continue;
      const v = (this.heat.get(k) ?? 0) + amount * (dx === 0 && dy === 0 ? 1 : 0.45);
      if (v >= 1) this.ignite(k, energy); else this.heat.set(k, v);
    }
  }
  ignite(k, energy) {
    if (this.cells.size > MAX_BURNING || this.cells.has(k) || !this.level.blockThere(k)) return;
    const t = 0.5 + Math.random() * 0.6;
    this.cells.set(k, { t, max: t, e: energy });
    this.heat.delete(k);
  }

  update(dt) {
    const L = this.level, cols = L.colCols, rows = L.colRows, cool = Math.exp(-COOL * dt);
    for (const [k, v] of this.heat) { const c = v * cool; if (c < 0.05) this.heat.delete(k); else this.heat.set(k, c); }
    this.emitted = 0;
    const catching = [];
    for (const [k, c] of this.cells) {
      if (!L.blockThere(k)) { this.cells.delete(k); continue; }
      c.t -= dt;
      const b = k % cols, q = (k / cols) | 0;
      // spreading: a neighbour warms up, and catches once it is warm enough
      if (c.e > 0 && Math.random() < SPREAD * dt) {
        const [dx, dy] = NEIGHBOURS[Math.random() < 0.35 ? (Math.random() * 3) | 0 : (Math.random() * 8) | 0];   // leans upward
        const bb = b + dx, qq = q + dy;
        if (bb >= 0 && qq >= 0 && bb < cols && qq < rows) {
          const n = qq * cols + bb;
          if (L.blockThere(n) && !this.cells.has(n) && Math.random() < 0.7) catching.push([n, c.e - (Math.random() < 0.7 ? 1 : 0)]);
        }
      }
      if (this.emitted < EMIT_PER_FRAME && Math.random() < 2.4 * dt) {
        this.emitted++;
        const x = (b + 0.5) * BLOCK, y = (q + 0.5) * BLOCK;
        this.fx.spark(x, y, (Math.random() - 0.5) * 20, -55 - Math.random() * 30, FLAME[(Math.random() * FLAME.length) | 0], 2 + (Math.random() * 3 | 0), 0.25 + Math.random() * 0.2, { glow: true, grav: -0.2 });
        if (Math.random() < 0.12) this.fx.smoke(x, y, (Math.random() - 0.5) * 25, -70 - Math.random() * 25, 4, 0.6 + Math.random() * 0.6, 60);
      }
      if (c.t <= 0) {
        this.cells.delete(k);
        const el = L.burnBlock(k); this.burnt++;
        if (el >= 0) this.damage.set(el, (this.damage.get(el) ?? 0) + 0.06);
        for (const [dx, dy] of NEIGHBOURS) {
          const bb = b + dx, qq = q + dy;
          if (bb < 0 || qq < 0 || bb >= cols || qq >= rows) continue;
          const n = qq * cols + bb;
          if (!this.cells.has(n) && Math.random() < 0.55) L.charBlock(n, 0.55);
        }
        if (Math.random() < 0.18) this.fx.smoke((b + 0.5) * BLOCK, (q + 0.5) * BLOCK, (Math.random() - 0.5) * 20, -40 - Math.random() * 20, 3, 1 + Math.random(), 40);
      }
    }
    for (const [k, e] of catching) this.ignite(k, e);
  }

  // burning blocks as flickering embers on the page (the particles above them do the rest)
  draw(g) {
    if (!this.cells.size) return;
    const cols = this.level.colCols;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [k, c] of this.cells) {
      const f = c.t / c.max, b = k % cols, q = (k / cols) | 0;
      g.fillStyle = f > 0.5 ? `rgba(255,${120 + (Math.random() * 80 | 0)},40,${0.55 + Math.random() * 0.3})` : `rgba(255,70,20,${0.25 + f * 0.6})`;
      g.fillRect(b * BLOCK, q * BLOCK, BLOCK, BLOCK);
    }
    g.restore();
  }
}
