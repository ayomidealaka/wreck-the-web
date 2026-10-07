// The stickman: one-way-platform physics, double jump with a flip, jetpack, procedural animation.
import { CELL } from './level.js';
import { SPRITE_SCALE } from './cast.js';

const GRAV = 1750, RUN = 280, ACC = 2800, AIR_ACC = 1700, FRICTION = 2600;
const JET = 2600, JET_MAX_UP = 360, FUEL = 1.5;
// Variable jump: a tap is a small hop, holding keeps a low-gravity boost going for up to BOOST seconds
// (full hold reaches ~120px, the old max), letting go early cuts the climb. Hold past that = jetpack.
const STEP = 4; // px you can walk up without jumping (letter-height differences only; anything taller needs a jump)
const JUMP = 430, DJUMP = 400, BOOST = 0.24, BOOST_GRAV = 0.22, RELEASE_CUT = 0.5, JET_DELAY = 0.1;
// Dash (Shift, or double-tap a direction): a quick burst, no gravity while it lasts, one in the air until you land.
const DASH_SPEED = 980, DASH_TIME = 0.15, DASH_COOL = 0.28, DASH_KEEP = 0.45;

export class Player {
  constructor(level, x, y) {
    this.level = level;
    this.w = Math.round(14 * SPRITE_SCALE); this.h = 36;
    this.spawn = { x, y };
    this.reset(x, y);
    this.aim = 0; this.facing = 1;
    this.color = '#111111';
    this.sprite = null; // CastCharacter when a character is chosen (falls back to the stickman)
    this.weapon = null; // the selected weapon (set by the game each frame)
    this.runT = 0;
  }
  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.onGround = false; this.jumps = 0; this.fuel = FUEL;
    this.coyote = 0; this.buffer = 0; this.drop = 0; this.boost = 0; this.held = -1;
    // gun springs (rigged characters): see tickGun
    this.gun = { kick: 0, kickV: 0, rot: 0, rotV: 0, swing: 0, swingV: 0, lag: 0, lagV: 0, chestY: null, switchT: 1, pumpT: 1, throwT: 1 };
    this.flip = 0; this.flipDir = 1; this.phase = 0; this.jetting = false; this.landT = 0; this.recoil = 0;
    this.dashT = 0; this.dashCool = 0; this.airDashes = 0; this.dashDir = { x: 1, y: 0 };
  }
  // the weapons set this on every shot (1 = full kick, fading fast); a jump in it is a shot, which kicks the springs
  get recoil() { return this._recoil || 0; }
  set recoil(v) {
    if (this.gun && v > (this._recoil || 0) + 0.02) {
      const G = this.gun; G.kick = v; G.rot = v; G.kickV = G.rotV = 0;
      if (this.weapon?.id === 'scatter') G.pumpT = 0;
    }
    this._recoil = v;
  }
  switchedWeapon() { this.gun.swing = 0.9; this.gun.swingV = 0; this.gun.switchT = 0; }   // the new gun swings in from below
  threw() { this.gun.throwT = 0; }
  // Springs: the recoil shove and the muzzle climb settle in ~0.15s with a little overshoot; the gun
  // lags behind the chest's vertical movement (run bob, jumps, landings).
  tickGun(dt) {
    const G = this.gun;
    G.kickV += (-G.kick * 420 - G.kickV * 30) * dt; G.kick += G.kickV * dt;
    G.rotV += (-G.rot * 300 - G.rotV * 24) * dt; G.rot += G.rotV * dt;
    G.swingV += (-G.swing * 300 - G.swingV * 24) * dt; G.swing += G.swingV * dt;
    const cy = this.sprite?.ready && this.sprite.aimAt ? this.sprite.shoulderAt(this.spriteState()).y : this.y;
    const vy = G.chestY == null ? 0 : (cy - G.chestY) / dt; G.chestY = cy;
    const target = Math.max(-2.5, Math.min(2.5, -vy * 0.011));
    G.lagV += ((target - G.lag) * 260 - G.lagV * 20) * dt; G.lag += G.lagV * dt;
    G.switchT = Math.min(1, G.switchT + dt / 0.25); G.pumpT = Math.min(1, G.pumpT + dt); G.throwT = Math.min(1, G.throwT + dt / 0.34);
  }
  // where a thrown grenade leaves from: the throwing hand, else the gun
  throwPoint() { return this.sprite?.ready && this.sprite.throwHand ? this.sprite.throwHand(this.spriteState(), this.weapon) : this.hand(); }
  get fuelRatio() { return this.fuel / FUEL; }
  get dashing() { return this.dashT > 0; }
  get height() { return this.sprite?.ready ? this.sprite.worldHeight : this.h; }
  spriteState() {
    return { x: this.x, y: this.y, facing: this.facing, moving: this.onGround && Math.abs(this.vx) > 25, onGround: this.onGround,
      runT: this.runT, t: this.t, vy: this.vy, landT: this.landT, jetting: this.jetting, aim: this.aim, dashing: this.dashT > 0, pose: this.weapon?.pose || 'pistol', speed: Math.min(1, Math.abs(this.vx) / RUN), recoil: this.recoil, gun: { ...this.gun }, bgLum: this.bgLum, flipAngle: this.flip > 0 ? this.flipDir * (1 - this.flip) * Math.PI * 2 : 0 };
  }
  // direction shots travel: along the drawn gun for cast characters, the exact aim for the stickman
  get fireAim() { return this.sprite?.ready ? this.sprite.gunAngle(this.spriteState()) : this.aim; }
  hand() { // where shots come from
    if (this.sprite?.ready) return this.weapon?.art?.hold && this.sprite.aimset ? this.sprite.weaponMuzzle(this.spriteState(), this.weapon) : this.sprite.muzzleAt(this.spriteState());
    const sx = this.x, sy = this.y - 27;
    return { x: sx + Math.cos(this.aim) * 20, y: sy + Math.sin(this.aim) * 20 };
  }
  // the held gun's ejection port (world), when the character knows where its gun is
  port() {
    if (!this.sprite?.ready || !this.weapon?.art?.port) return null;
    if (this.sprite.weaponPort) return this.sprite.weaponPort(this.spriteState(), this.weapon);
    return this.sprite.weaponPoint ? this.sprite.weaponPoint(this.spriteState(), this.weapon, this.weapon.art.port) : null;
  }
  // touching down at this.vy: a crouch, a thud and dust scaled by how hard (a run off a low ledge makes none)
  landed(ground, fx, audio) {
    const v = this.vy, k = Math.min(1, Math.max(0, (v - 150) / 1000));
    this.landT = Math.max(this.landT, v > 500 ? 0.14 : 0.1);
    if (v > 150) audio.land(k);
    if (v > 200) fx.dust(this.x, ground, Math.round(4 + k * 10), 0.6 + k * 1.4, this.level.colorAt(this.x, ground + 1));
    if (v > 1200) fx.kick('small');
  }
  push(vx, vy) { this.vx += vx; this.vy += vy; if (vy < -50) { this.onGround = false; this.drop = 0.05; } }

  update(dt, inp, fx, audio) {
    const L = this.level;
    const ax = inp.ax; // -1..1
    if (this.sprite?.ready && this.sprite.aimAt) {
      // rigged characters: face the target, then the angle that puts the barrel itself on the cursor
      if (Math.abs(inp.aimX - this.x) > 2) this.facing = inp.aimX >= this.x ? 1 : -1;
      this.aim = this.sprite.aimAt(this.spriteState(), this.weapon, { x: inp.aimX, y: inp.aimY });
    } else {
      const sh = this.sprite?.ready && (this.sprite.arm || this.sprite.aimset) ? this.sprite.shoulderAt(this.spriteState()) : { x: this.x, y: this.y - this.height * 0.7 };
      this.aim = Math.atan2(inp.aimY - sh.y, inp.aimX - sh.x); // from the shoulder, so the gun points exactly at the cursor
      this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    }
    // page brightness behind the player (for the rigged character's shadow tint); cleared holes show the dark backdrop
    if ((this.lumT = (this.lumT || 0) - dt) <= 0) {
      this.lumT = 0.25;
      const cols = L.sampleColors(this.x, this.y - this.height / 2, 34, 30);
      const lum = cols.length < 8 ? 0.12 : cols.reduce((s, c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return s + (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }, 0) / cols.length;
      this.bgLum = this.bgLum == null ? lum : this.bgLum + (lum - this.bgLum) * 0.5;
    }

    // horizontal
    if (ax) {
      const a = (this.onGround ? ACC : AIR_ACC) * dt * ax;
      if (Math.abs(this.vx + a) < RUN * Math.abs(ax) || Math.sign(a) !== Math.sign(this.vx)) this.vx += a;
    } else if (this.onGround) {
      const f = FRICTION * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
    } else this.vx *= Math.pow(0.4, dt);

    // dash: the way you're moving, or (standing still / in the air) the way you're aiming
    this.dashCool -= dt;
    if (inp.dash && this.dashCool <= 0 && (this.onGround || this.airDashes < 1)) {
      let dx = ax ? Math.sign(ax) : Math.cos(this.aim), dy = ax || this.onGround ? 0 : Math.sin(this.aim);
      if (this.onGround && !ax) dx = dx >= 0 ? 1 : -1;
      const n = Math.hypot(dx, dy) || 1;
      this.dashDir = { x: dx / n, y: dy / n }; this.dashT = DASH_TIME; this.dashCool = DASH_COOL;
      if (!this.onGround) this.airDashes++;
      this.flip = 0; this.boost = 0;
      fx.debris(this.x, this.y - 4, ['#ffffff', '#cccccc'], 6, 160, Math.atan2(-this.dashDir.y, -this.dashDir.x));
      audio.dash();
    }

    // jumping
    if (inp.jumpPressed) this.buffer = 0.13;
    this.buffer -= dt; this.coyote -= dt; this.drop -= dt; this.landT -= dt;
    this.held = inp.jumpHeld ? (this.held < 0 ? 0 : this.held + dt) : -1;
    if (this.buffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -JUMP; this.buffer = 0; this.coyote = 0; this.jumps = 1; this.onGround = false;
      this.boost = BOOST; this.held = 0;
      fx.dust(this.x, this.y, 5, 0.7, L.colorAt(this.x, this.y + 1)); audio.jump();
    } else if (this.buffer > 0 && !this.onGround && this.jumps < 2) {
      this.vy = -DJUMP; this.buffer = 0; this.jumps = 2; this.flip = 1; this.flipDir = this.vx >= 0 ? 1 : -1;
      this.boost = BOOST; this.held = 0; audio.flipJump();
      fx.dust(this.x, this.y + 2, 7, 0.9, '#ffffff', -0.6);                         // a puff of air pushed down
      fx.rings.push({ x: this.x, y: this.y + 2, r: 4, max: 26, t: 0, dur: 0.22, w: 2, alpha: 0.55 });
    } else if (inp.jumpPressed && !this.onGround && this.jumps >= 2) {
      this.held = BOOST; this.buffer = 0; // out of jumps: a fresh press-and-hold goes straight to the jetpack
    }
    if (inp.down && this.onGround) { this.drop = 0.22; this.onGround = false; }

    let grav = GRAV;
    if (this.boost > 0) {
      if (inp.jumpHeld) { grav = GRAV * BOOST_GRAV; this.boost -= dt; }
      else { if (this.vy < 0) this.vy *= RELEASE_CUT; this.boost = 0; } // released early: short hop
    }

    // jetpack: keep holding jump after the jump has topped out
    this.jetting = inp.jumpHeld && !this.onGround && this.fuel > 0 && this.boost <= 0 && this.held >= BOOST + JET_DELAY && this.flip <= 0.35;
    if (this.jetting) {
      // unlimited jetpack: fuel is never spent, so the bar never shows
      // this.fuel = Math.max(0, this.fuel - dt);
      this.vy = Math.max(-JET_MAX_UP, this.vy - JET * dt);
      if (Math.random() < 0.9) {
        const nz = this.sprite?.ready ? this.sprite.jetNozzle(this.spriteState()) : { x: this.x - this.facing * 7, y: this.y - 20 }, bx = nz.x + (Math.random() - 0.5) * 6, by = nz.y;
        fx.spark(bx, by, (Math.random() - 0.5) * 60, 260 + Math.random() * 120, Math.random() < 0.5 ? '#FFD25A' : '#FF7A1A', 3, 0.22, { glow: true, grav: 0.2 });
      }
    } else if (this.onGround) this.fuel = Math.min(FUEL, this.fuel + dt * 1.2);

    this.vy += grav * dt;
    this.vy = Math.min(this.vy, 1400);
    if (this.dashT > 0) {           // dashing: straight line, no gravity; most of the speed is shed when it ends
      this.dashT -= dt; this.vx = this.dashDir.x * DASH_SPEED; this.vy = this.dashDir.y * DASH_SPEED;
      if (this.dashT <= 0) { this.vx *= DASH_KEEP; this.vy *= DASH_KEEP; }
    }
    if (this.flip > 0) this.flip = Math.max(0, this.flip - dt / 0.42);

    // move x (walls only at the world edges; the page is one-way platforms)
    this.x += this.vx * dt;
    if (this.x < this.w / 2) { this.x = this.w / 2; this.vx = 0; }
    if (this.x > L.W - this.w / 2) { this.x = L.W - this.w / 2; this.vx = 0; }

    // move y with one-way landing
    const prev = this.y;
    this.y += this.vy * dt;
    const was = this.onGround;
    this.onGround = false;
    if (this.vy >= 0 && this.drop <= 0) {
      const r0 = Math.floor(prev / CELL), r1 = Math.floor(this.y / CELL);
      const c0 = Math.floor((this.x - this.w / 2 + 2) / CELL), c1 = Math.floor((this.x + this.w / 2 - 2) / CELL);
      outer: for (let r = r0; r <= r1; r++) {
        const top = r * CELL;
        if (top < prev - 0.5) continue;
        for (let c = c0; c <= c1; c++) {
          if (L.cellSolid(c, r)) {
            if (!was) this.landed(top, fx, audio);
            this.y = top; this.vy = 0; this.onGround = true; this.jumps = 0; this.flip = 0; this.boost = 0;
            break outer;
          }
        }
      }
    }
    // the bottom edge of the page is solid ground (feet on the line where the page meets the backdrop): you can't fall
    // off the page, not even by dropping through a platform
    if (this.y >= L.H && this.vy >= 0) {
      if (!was) this.landed(L.H, fx, audio);
      this.y = L.H; this.vy = 0; this.onGround = true; this.jumps = 0; this.flip = 0; this.boost = 0;
    }
    // step up onto slightly taller glyphs (capitals next to lowercase) instead of sinking into them
    if (this.onGround) {
      const c0 = Math.floor((this.x - this.w / 2 + 2) / CELL), c1 = Math.floor((this.x + this.w / 2 - 2) / CELL);
      const rowSolid = r => { for (let c = c0; c <= c1; c++) if (L.cellSolid(c, r)) return true; return false; };
      let r = Math.floor(this.y / CELL) - 1, top = null;
      for (let k = 0; k < STEP / CELL; k++, r--) { if (rowSolid(r)) top = r * CELL; else if (top !== null) break; }
      if (top !== null) this.y = top;
    }
    if (was && !this.onGround && this.vy >= 0) this.coyote = 0.1;
    if (this.onGround) this.airDashes = 0;
    this.t = (this.t || 0) + dt;
    if (this.onGround) { this.phase += Math.abs(this.vx) * dt * 0.05; this.runT += dt * Math.min(1.2, Math.abs(this.vx) / RUN); }
    // footsteps: one each time a boot lands in the run cycle, with a little dust behind it
    const steps = this.sprite?.footfalls ? this.sprite.footfalls(this.runT) : Math.floor(this.runT * 3.4);
    if (steps !== this.steps) {
      if (this.onGround && Math.abs(this.vx) > 60 && this.dashT <= 0) {
        audio.step(0.6 + 0.4 * Math.min(1, Math.abs(this.vx) / RUN));
        if (Math.random() < 0.8) fx.dust(this.x - this.facing * 4, this.y, 2, 0.35, L.colorAt(this.x, this.y + 1), 0.6);
      }
      this.steps = steps;
    }
    this.recoil *= Math.pow(0.001, dt);
    this.tickGun(dt);

    if (this.y > L.H + 300) { this.reset(this.spawn.x, -40); audio.respawn(); return 'fell'; }   // safety net only: the floor above stops you first
    return null;
  }

  draw(g, weapon) {
    if (this.sprite?.ready) {
      // characters without their own afterimages (the classic cast): faded copies left along a dash
      if (!this.sprite.afterimages) {
        this.ghosts ||= [];
        if (this.dashT > 0 && (this.t - (this.lastGhost ?? -1)) > 0.03) { this.lastGhost = this.t; this.ghosts.push({ st: this.spriteState(), t: this.t }); }
        this.ghosts = this.ghosts.filter(q => this.t - q.t < 0.22 && this.t >= q.t);
        for (const q of this.ghosts) { g.save(); g.globalAlpha = 0.4 * (1 - (this.t - q.t) / 0.22); this.sprite.draw(g, q.st, weapon); g.restore(); }
      }
      this.sprite.draw(g, this.spriteState(), weapon); return;
    }
    const x = this.x, y = this.y, f = this.facing;
    const moving = this.onGround && Math.abs(this.vx) > 20;
    const s = Math.sin(this.phase * Math.PI), c2 = Math.cos(this.phase * Math.PI);
    const squash = this.landT > 0 ? 3 : 0;
    const hip = { x, y: y - 15 + squash }, sh = { x: x + f * 1, y: y - 27 + squash }, head = { x: x + f * 1.5, y: y - 33.5 + squash };
    let legs;
    if (!this.onGround) legs = [[{ x: x - f * 2, y: y - 9 }, { x: x - f * 6, y: y - 3 }], [{ x: x + f * 5, y: y - 8 }, { x: x + f * 3, y: y - 1 }]];
    else if (moving) legs = [
      [{ x: x + s * 6, y: y - 8 + Math.max(0, c2) * 2 }, { x: x + s * 9, y: y - Math.max(0, -c2) * 4 }],
      [{ x: x - s * 6, y: y - 8 + Math.max(0, -c2) * 2 }, { x: x - s * 9, y: y - Math.max(0, c2) * 4 }]];
    else legs = [[{ x: x - 3, y: y - 7 + squash / 2 }, { x: x - 5, y }], [{ x: x + 3, y: y - 7 + squash / 2 }, { x: x + 5, y }]];

    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    const back = this.recoil * 5;
    const elbow = { x: sh.x + ca * (8 - back) - sa * 2 * f, y: sh.y + sa * (8 - back) + ca * 2 * f + 2 };
    const handP = { x: sh.x + ca * (14 - back), y: sh.y + sa * (14 - back) };

    g.save();
    if (this.flip > 0) { // double-jump somersault around the hip
      g.translate(hip.x, hip.y); g.rotate(this.flipDir * (1 - this.flip) * Math.PI * 2); g.translate(-hip.x, -hip.y);
    }
    const path = () => {
      g.beginPath();
      for (const [k, ft] of legs) { g.moveTo(hip.x, hip.y); g.lineTo(k.x, k.y); g.lineTo(ft.x, ft.y); }
      g.moveTo(hip.x, hip.y); g.lineTo(sh.x, sh.y);
      g.moveTo(sh.x, sh.y); g.lineTo(elbow.x, elbow.y); g.lineTo(handP.x, handP.y);
      g.moveTo(sh.x, sh.y); g.lineTo(sh.x + ca * 6 + sa * 3 * f, sh.y + sa * 6 + 5);
      g.lineTo(handP.x - ca * 1, handP.y - sa * 1);
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    // jetpack
    g.fillStyle = '#ffffff'; g.fillRect(x - f * 9 - 4, y - 29 + squash, 8, 12);
    g.fillStyle = this.jetting ? '#FF7A1A' : '#5A5F6E'; g.fillRect(x - f * 9 - 3, y - 28 + squash, 6, 10);
    // outline pass then ink pass, so he reads on dark and light pages
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; path(); g.stroke();
    g.beginPath(); g.arc(head.x, head.y, 6.6, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = this.color; g.lineWidth = 2.8; path(); g.stroke();
    g.beginPath(); g.arc(head.x, head.y, 4.6, 0, Math.PI * 2); g.fillStyle = this.color; g.fill();
    // visor
    g.fillStyle = '#FFD25A'; g.fillRect(Math.round(head.x + f * 1.5 - 1), Math.round(head.y - 1.5), 3, 2);
    // weapon at the hand, pointing along the aim
    g.translate(handP.x, handP.y); g.rotate(this.aim);
    if (Math.cos(this.aim) < 0) g.scale(1, -1);
    weapon.sprite(g);
    g.restore();
  }
}
