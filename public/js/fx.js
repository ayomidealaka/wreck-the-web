// Debris, flying words, explosions, smoke and screen shake.
const G = 1500;

export class FX {
  constructor(level) {
    this.level = level;
    this.parts = [];   // {x,y,vx,vy,life,max,size,color,drag,grav,glow}
    this.chunks = [];  // detached words: {sprite,x,y,vx,vy,a,va,life,w,h,rest}
    this.booms = [];   // {x,y,r,t,max}
    this.heats = [];   // hot rims round fresh bullet holes: {x,y,r,t}
    this.heatLines = [];   // the two glowing edges of a fresh trench: {x0,y0,x1,y1,w,t,dur}
    this.rings = [];   // shockwave rings
    this.shake = 0;            // small random jitter (gunfire)
    this.maxChunks = 700; this.maxParts = 2200;   // lowered in degraded mode
    this.impacts = [];          // debris hitting the page hard this frame (the arsenal turns these into damage)
    this.quake = { amp: 0, t: 0 }; // tiered shake (impacts): see kick()
    this.avalancheCool = 0; this.avalanche = false;
    this.flash = 0;
    this.flashes = []; // muzzle flashes: {x,y,a,life,max,size,color,kind}
  }

  spark(x, y, vx, vy, color, size = 2, life = 0.5, opts = {}) {
    if (this.parts.length > this.maxParts) this.parts.splice(0, Math.ceil(this.maxParts / 11));
    this.parts.push({ x, y, vx, vy, color, size, life, max: life, drag: opts.drag ?? 0.02, grav: opts.grav ?? 1, glow: !!opts.glow,
      grow: opts.grow || 0, round: !!opts.round, spin: opts.spin || 0, a: 0, w: opts.w, bounce: opts.bounce ?? 0.3 });
  }

  // soft, growing, rising smoke puff
  smoke(x, y, vx = 0, vy = -30, size = 6, life = 1, shade = 70) {
    const c = shade + (Math.random() * 25 | 0);
    this.spark(x, y, vx, vy, `rgba(${c},${c - 4},${c + 6},0.55)`, size, life, { grav: -0.05, drag: 0.04, grow: 10, round: true });
  }
  // ejected brass / shell casing
  casing(x, y, dir, color = '#D9A63A', w = 3) {
    this.spark(x, y, -dir * (60 + Math.random() * 80), -140 - Math.random() * 90, color, 2, 1.6, { drag: 0.01, spin: (Math.random() - 0.5) * 30, w, bounce: 0.45 });
  }
  muzzle(x, y, a, kind = 'gun', color = '#FFD25A', size = 1) {
    this.flashes.push({ x, y, a, kind, color, size, life: kind === 'big' ? 0.08 : 0.05, max: kind === 'big' ? 0.08 : 0.05 });
  }

  debris(x, y, colors, n, speed, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = dir == null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.6;
      const s = speed * (0.3 + Math.random());
      const c = colors.length ? colors[(Math.random() * colors.length) | 0] : '#888';
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, c, 2 + (Math.random() * 3 | 0), 0.6 + Math.random() * 1.1);
    }
  }

  chunk(piece, vx, vy) {
    if (!piece) return;
    if (this.chunks.length > this.maxChunks) this.chunks.splice(0, Math.ceil(this.maxChunks / 12));
    const c = { ...piece, vx, vy, a: 0, va: (Math.random() - 0.5) * 22, life: (piece.slab ? 40 : 14) + Math.random() * 6, rest: 0, hurt: 0 };
    this.chunks.push(c);
    return c;
  }

  // a fresh hole's rim glows white-hot and cools through orange to dull red and out over HEAT_TIME
  heat(x, y, r) {
    if (this.heats.length > 300) this.heats.splice(0, 60);
    this.heats.push({ x, y, r, t: 0 });
  }

  // the edges of a straight trench, glowing and cooling for `dur` seconds
  heatLine(x0, y0, x1, y1, w, dur = 3.6) {
    if (this.heatLines.length > 12) this.heatLines.shift();
    this.heatLines.push({ x0, y0, x1, y1, w, t: 0, dur });
  }

  explosion(x, y, r) {
    this.booms.push({ x, y, r, t: 0, max: 0.55 });
    this.rings.push({ x, y, r: r * 0.4, max: r * 2.2, t: 0 });
    this.kick(r < 45 ? 'small' : r < 100 ? 'big' : 'huge');
    this.flash = Math.min(0.5, this.flash + r / 260);
    for (let i = 0; i < r * 0.6; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * r * 7;
      const hot = ['#FFF6C8', '#FFD25A', '#FF9A2E', '#FF5A1F'][(Math.random() * 4) | 0];
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, hot, 3, 0.25 + Math.random() * 0.45, { glow: true, grav: 0.3, drag: 0.08 });
    }
    for (let i = 0; i < r * 0.35; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 90;
      this.spark(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, Math.cos(a) * s, Math.sin(a) * s - 40,
        `rgba(${60 + (Math.random() * 40 | 0)},${55 + (Math.random() * 30 | 0)},${60 + (Math.random() * 30 | 0)},0.7)`, 6 + (Math.random() * 6 | 0), 0.9 + Math.random() * 0.8, { grav: -0.08, drag: 0.04 });
    }
  }

  // Three shake strengths: small 4px, big 8px, huge 14px, a 26Hz wobble that fades over 0.4s.
  // A stronger kick replaces a weaker one still running; a weaker one never cuts a big one short.
  kick(tier) {
    const amp = { small: 4, big: 8, huge: 14 }[tier] || 4, now = this.quake.amp * (this.quake.t / 0.4);
    if (amp >= now) this.quake = { amp, t: 0.4 };
  }
  // push loose things away from (or towards, with negative force) a point
  impulse(x, y, radius, force) {
    for (const c of this.chunks) {
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      const k = force * (1 - d / radius);
      c.vx += dx / d * k; c.vy += dy / d * k; c.rest = 0; c.va += (Math.random() - 0.5) * Math.abs(k) * 0.05;
    }
    for (const p of this.parts) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      const k = force * (1 - d / radius) * 0.6;
      p.vx += dx / d * k; p.vy += dy / d * k;
    }
  }

  update(dt) {
    const L = this.level;
    for (const p of this.parts) {
      p.life -= dt; p.a += p.spin * dt; if (p.grow) p.size += p.grow * dt;
      p.vy += G * p.grav * dt;
      const f = 1 - p.drag; p.vx *= f; p.vy *= f;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.grav > 0 && !p.glow && L.solidAt(nx, ny)) { p.vy *= -p.bounce; p.vx *= 0.6; p.spin *= 0.6; if (Math.abs(p.vy) < 40) p.vy = 0; }
      else { p.x = nx; p.y = ny; }
    }
    this.parts = this.parts.filter(p => p.life > 0 && p.y < L.H + 400);

    // Debris piles up: a falling piece lands on the page or on a piece already lying still (a spatial hash of the
    // resting ones), so heaps form; take away what holds a heap up and it comes down again. A piece left hanging off
    // an edge slides off. (Debris damaging what it lands on is switched off for now: see below.)
    const grid = new Map(), CELLPX = 32, key = (x, y) => ((x / CELLPX) | 0) * 65536 + ((y / CELLPX) | 0);
    for (const c of this.chunks) if (c.rest > 0.05 && !c.held && !(c.thrown > 0)) {
      const k = key(c.x, c.y - c.h / 2); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
    }
    const restingTop = (c, x, foot) => {        // the resting piece this one would land on, if any
      for (let gx = -1; gx <= 1; gx++) for (let gy = 0; gy <= 1; gy++) {
        const a = grid.get(key(x + gx * CELLPX, foot + gy * CELLPX)); if (!a) continue;
        for (const r of a) {
          if (r === c) continue;
          const top = r.y - r.h / 2;
          if (Math.abs(x - r.x) < (c.w + r.w) * 0.42 && foot >= top && c.y + c.h / 2 <= top + 3) return r;
        }
      }
      return null;
    };
    for (const c of this.chunks) {
      if (c.held || c.thrown > 0) { c.life -= dt; continue; }   // the gravity well's grab moves these (Arsenal.updateGrab)
      c.life -= c.rest > 0.5 ? dt * 0.25 : dt;                    // heaps stay around a good while
      c.vy += G * dt;
      c.vx *= 0.995;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, half = c.slab ? c.h / 2 : Math.min(c.h, 14) / 2, foot = ny + half;   // a whole element lands on its real bottom
      const onPage = c.vy > 0 && L.solidAt(nx, foot), under = c.vy > 0 && !onPage ? restingTop(c, nx, ny + c.h / 2) : null;
      if (onPage || under) {
        const impact = c.vy;
        // Falling debris damaging what it lands on is switched off for now (it brought whole pages down too fast):
        // uncomment to bring it back (Arsenal.debrisImpacts turns these into damage).
        // if (onPage && impact > 330 && c.hurt < 3) {             // hard landing on the page: damage what it hits
        //   const e = c.w * c.h * impact * impact / 2e6;
        //   if (e >= 15) { this.impacts.push({ c, x: nx, y: foot + 1, dmg: e / 15, vy: impact }); c.hurt++; }
        // }
        c.vy *= -0.28; c.vx *= 0.75; c.va *= 0.5;
        if (Math.abs(c.vy) < 60) { c.vy = 0; c.rest += dt; c.a *= 0.85; }
        if (under) {
          c.y = under.y - under.h / 2 - c.h / 2;
          const off = (nx - under.x) / Math.max(1, under.w);       // hanging off the edge of the one below: slide off
          if (Math.abs(off) > 0.35) { c.vx += Math.sign(off) * 90 * dt * 10; c.rest = 0; }
        }
        c.x = nx;
      } else { c.x = nx; c.y = ny; c.a += c.va * dt; if (c.vy > 30) c.rest = 0; }
      if (c.x < 0 || c.x > L.W) { c.vx *= -0.5; c.x = Math.max(0, Math.min(L.W, c.x)); }
      if (c.y + c.h / 2 > L.H) { c.y = L.H - c.h / 2; c.vy = 0; c.rest += dt; }       // the page's bottom edge is a floor
    }
    this.chunks = this.chunks.filter(c => c.life > 0 && c.y < L.H + 400);
    // eviction: resting debris far from the view goes first when there's too much
    if (this.cam && this.chunks.length > this.maxChunks * 0.8) {
      const top = this.cam.y - 1000, bot = this.cam.y + this.cam.h + 400;
      this.chunks = this.chunks.filter(c => !(c.rest > 1 && (c.y < top || c.y > bot)));
    }

    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter(f => f.life > 0);
    for (const h of this.heats) h.t += dt;
    if (this.heats.length) this.heats = this.heats.filter(h => h.t < HEAT_TIME);
    for (const h of this.heatLines) h.t += dt;
    if (this.heatLines.length) this.heatLines = this.heatLines.filter(h => h.t < h.dur);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter(b => b.t < b.max);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter(r => r.t < (r.dur || 0.35));
    this.shake = Math.min(6, this.shake) * Math.pow(0.0015, dt);
    if (this.quake.t > 0) this.quake.t = Math.max(0, this.quake.t - dt);
    // lots of debris coming down at once: the game plays the avalanche sound (rate-limited)
    this.avalancheCool -= dt;
    if (this.avalancheCool <= 0) {
      let falling = 0; for (const c of this.chunks) if (c.vy > 260 && !c.thrown) falling++;
      if (falling >= 28) { this.avalanche = true; this.avalancheCool = 1.7; }
    }
    if (this.flashHold > 0) this.flashHold -= dt; else this.flash *= Math.pow(0.002, dt);
  }

  drawBelow(g) { // hot rims on the page, then chunks, all behind the player
    for (const pass of [0, 1]) for (const h of this.heatLines) {
      const k = h.t / h.dur, hot = 1.05 * Math.pow(1 - k, 1.4), L = Math.hypot(h.x1 - h.x0, h.y1 - h.y0) || 1, nx = -(h.y1 - h.y0) / L, ny = (h.x1 - h.x0) / L;
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over'; g.globalAlpha = Math.min(1, hot) * (pass ? 0.8 : 0.6);
      g.strokeStyle = heatColor(Math.min(0.999, k * 1.2)); g.lineWidth = pass ? 3 : 2;
      g.beginPath();
      for (const s of [-1, 1]) { g.moveTo(h.x0 + nx * s * (h.w + 0.5), h.y0 + ny * s * (h.w + 0.5)); g.lineTo(h.x1 + nx * s * (h.w + 0.5), h.y1 + ny * s * (h.w + 0.5)); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (this.heats.length) {
      // a solid colour pass so it shows on white pages, then additive bloom
      for (const pass of [0, 1]) {
        if (pass) g.globalCompositeOperation = 'lighter';
        for (const h of this.heats) {
          const k = h.t / HEAT_TIME, c = heatColor(k);
          g.globalAlpha = (1 - k) * (pass ? 0.9 : 0.55);
          g.strokeStyle = c; g.lineWidth = (pass ? 2.2 : 1.4) * (1 - k * 0.5);
          g.beginPath(); g.arc(h.x, h.y, h.r + 0.6, 0, Math.PI * 2); g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    for (const c of this.chunks) {
      g.save();
      g.globalAlpha = Math.min(1, c.life / 1.2);
      g.translate(c.x, c.y); g.rotate(c.a);
      const sw = c.sprite.pageW || c.sprite.width, sh = c.sprite.pageH || c.sprite.height;
      g.drawImage(c.sprite, -sw / 2, -sh / 2, sw, sh);
      g.restore();
    }
  }

  flashPass(g, alpha) {
    for (const f of this.flashes) {
      const k = f.life / f.max, s = f.size;
      g.globalAlpha = k * alpha;
      g.save(); g.translate(f.x, f.y); g.rotate(f.a);
      g.fillStyle = f.color;
      if (f.kind === 'big') { // wide cone + side spikes
        g.beginPath(); g.moveTo(0, -5 * s); g.lineTo(16 * s, 0); g.lineTo(0, 5 * s); g.closePath(); g.fill();
        g.fillRect(2 * s, -8 * s, 2, 16 * s);
      } else if (f.kind === 'ring') {
        g.strokeStyle = f.color; g.lineWidth = 1.5; g.beginPath(); g.arc(2, 0, 3 + (1 - k) * 4, 0, Math.PI * 2); g.stroke();
      } else { // star
        g.beginPath(); g.moveTo(0, -3 * s); g.lineTo(9 * s, 0); g.lineTo(0, 3 * s); g.closePath(); g.fill();
        g.fillRect(1, -5 * s, 2, 10 * s);
      }
      g.fillStyle = '#FFFFFF'; g.fillRect(0, -1, 4 * s, 2);
      g.restore();
    }
  }

  drawAbove(g) {
    for (const r of this.rings) {
      const k = r.t / (r.dur || 0.35);
      g.strokeStyle = `rgba(255,240,200,${0.5 * (1 - k)})`; g.lineWidth = (r.dur ? 14 : 6) * (1 - k) + 1;
      g.beginPath(); g.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2); g.stroke();
    }
    for (const b of this.booms) { // shrinking pixel discs, hot to cool
      const k = b.t / b.max;
      const layers = [['#FF5A1F', 1.0], ['#FF9A2E', 0.78], ['#FFD25A', 0.55], ['#FFF6C8', 0.32]];
      for (const [col, s] of layers) {
        const rr = b.r * s * (k < 0.25 ? 0.6 + k * 1.6 : 1 - (k - 0.25) * 1.2);
        if (rr <= 0) continue;
        pixelDisc(g, b.x, b.y, rr, col);
      }
    }
    // smoke and solid bits first, glowing particles on top with additive blending
    for (const p of this.parts) {
      if (p.glow) continue;
      g.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      g.fillStyle = p.color;
      if (p.round) { g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); g.fill(); }
      else if (p.w) { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-p.w / 2, -1, p.w, 2); g.restore(); }
      else g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    this.flashPass(g, 0.7);
    // glowing particles: a normal colour pass (so they show on white pages), then additive bloom on top
    for (const p of this.parts) {
      if (!p.glow) continue;
      g.globalAlpha = Math.min(1, p.life / p.max * 1.5) * 0.6;
      g.fillStyle = p.color;
      if (p.round) { g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.glow) continue;
      g.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      g.fillStyle = p.color;
      if (p.round) { g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    // muzzle flashes, additive bloom (their normal colour pass ran before the glow particles)
    this.flashPass(g, 1);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}

const HEAT_TIME = 0.55;
// white-hot -> yellow -> orange -> dull red as k goes 0..1
function heatColor(k) {
  const stops = [[255, 250, 220], [255, 214, 90], [255, 128, 34], [170, 40, 20]];
  const f = Math.min(0.999, k) * (stops.length - 1), i = f | 0, u = f - i, a = stops[i], b = stops[i + 1];
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * u)).join(',')})`;
}

export function pixelDisc(g, x, y, r, color, px = 4) {
  g.fillStyle = color;
  const n = Math.ceil(r / px);
  for (let j = -n; j <= n; j++) {
    const yy = j * px, half = Math.sqrt(Math.max(0, r * r - yy * yy));
    const w = Math.round(half / px) * px;
    if (w <= 0) continue;
    g.fillRect(Math.round((x - w) / px) * px, Math.round((y + yy) / px) * px, w * 2, px);
  }
}
