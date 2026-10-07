// Keyboard + mouse, and twin-stick touch controls on phones/tablets.
export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Input {
  constructor(canvas, touchRoot) {
    this.keys = new Set(); this.edges = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
    this.wheel = 0; this.grenadeQ = false;
    this.touch = isTouch();
    this.stickL = { x: 0, y: 0 }; this.stickR = { x: 0, y: 0, active: false };
    this.lastAim = { x: 1, y: 0 }; this.prevUp = false;
    this.btn = { jump: false, grenade: false, swap: false, strike: false, dash: false }; this.tap = {};

    addEventListener('keydown', e => {
      if (e.target.closest?.('input,textarea')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; } });
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) { this.grenadeQ = true; this.mouse.rdown = true; }
    });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false; if (e.pointerType === 'mouse' && e.button === 2) this.mouse.rdown = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });

    if (this.touch) this.buildTouch(touchRoot);
  }

  buildTouch(root) {
    root.hidden = false;
    const stick = (el, out, onEnd) => {
      const knob = el.querySelector('.knob'); let id = null, cx = 0, cy = 0;
      const R = 52;
      const move = (x, y) => {
        let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        out.x = dx / R; out.y = dy / R;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); id = e.pointerId; el.setPointerCapture(id);
        const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        out.active = true; move(e.clientX, e.clientY);
      });
      el.addEventListener('pointermove', e => { if (e.pointerId === id) move(e.clientX, e.clientY); });
      const end = e => { if (e.pointerId !== id) return; id = null; out.x = 0; out.y = 0; out.active = false; knob.style.transform = ''; onEnd?.(); };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    };
    stick(root.querySelector('.stick-l'), this.stickL);
    stick(root.querySelector('.stick-r'), this.stickR);
    for (const [name, sel] of [['jump', '.btn-jump'], ['grenade', '.btn-grenade'], ['swap', '.btn-swap'], ['strike', '.btn-strike'], ['dash', '.btn-dash']]) {
      const b = root.querySelector(sel);
      b.addEventListener('pointerdown', e => { e.preventDefault(); this.btn[name] = true; if (name !== 'jump') this.edges.add('touch-' + name); else this.edges.add('touch-jump'); });
      const up = () => { this.btn[name] = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    }
  }

  // snapshot for one frame; aim is resolved by the game (needs the camera)
  frame() {
    const k = c => this.keys.has(c), e = c => this.edges.has(c);
    let ax = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let jumpHeld = k('Space') || k('KeyW') || k('ArrowUp');
    let jumpPressed = e('Space') || e('KeyW') || e('ArrowUp');
    let down = k('KeyS') || k('ArrowDown');
    let fire = this.mouse.down;
    const grenadeKey = e('KeyG') || e('KeyQ');
    let grenade = this.grenadeQ || grenadeKey, alt = !!this.mouse.rdown;   // alt: right button held (gravity well: grab)
    let strike = e('BracketLeft');
    // dash: Shift, or a quick double-tap of a direction
    let dash = e('ShiftLeft') || e('ShiftRight');
    const now = performance.now() / 1000;
    for (const [side, keys] of [['r', ['KeyD', 'ArrowRight']], ['l', ['KeyA', 'ArrowLeft']]]) if (keys.some(e)) {
      if (now - (this.tap[side] || -1) < 0.25) { dash = true; this.tap[side] = -1; } else this.tap[side] = now;
    }
    let weaponNext = this.wheel > 0 || e('KeyE'), weaponPrev = this.wheel < 0;
    let weaponSlot = null;
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']
      .forEach((c, i) => { if (e(c)) weaponSlot = i; });
    let aimDir = null;

    if (this.touch) {
      if (Math.abs(this.stickL.x) > 0.2) ax = this.stickL.x;
      const up = this.stickL.y < -0.6;
      if (up && !this.prevUp) jumpPressed = true;
      this.prevUp = up;
      jumpHeld = jumpHeld || up || this.btn.jump;
      jumpPressed = jumpPressed || e('touch-jump');
      down = down || this.stickL.y > 0.65;
      const m = Math.hypot(this.stickR.x, this.stickR.y);
      if (this.stickR.active && m > 0.25) { this.lastAim = { x: this.stickR.x / m, y: this.stickR.y / m }; fire = true; }
      aimDir = this.lastAim;
      grenade = grenade || e('touch-grenade');
      alt = alt || this.btn.grenade;
      strike = strike || e('touch-strike');
      dash = dash || e('touch-dash');
      weaponNext = weaponNext || e('touch-swap');
    }
    const out = { ax, jumpHeld, jumpPressed, down, fire, grenade, grenadeKey, alt, strike, dash, weaponNext, weaponPrev, weaponSlot, aimDir,
      mouseX: this.mouse.x, mouseY: this.mouse.y,
      pause: e('Escape') || e('KeyP'), clip: e('KeyR'), mute: e('KeyM') };
    this.edges.clear(); this.wheel = 0; this.grenadeQ = false;
    return out;
  }
}
