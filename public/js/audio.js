// Synthesised sound effects (no audio files): layered oscillators and filtered noise, light distortion for punch,
// and a short generated reverb for space. Also exposes a MediaStream so replay clips include sound.
const MAX_VOICES = 64;
export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.loops = {}; this.lastPop = 0; this.pitch = 1;
    this.voices = 0;   // one-shot sounds playing right now; capped so a huge moment never piles up into mush
  }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.25;
    // brick-wall limiter last, so stacked blasts (an airstrike's seven bombs) stay loud without clipping
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    // a low-pass on everything, opened all the way except in slow motion (muffled, as if underwater)
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5;
    this.master.connect(this.lp); this.lp.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    this.streamDest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.streamDest) lim.connect(this.streamDest);
    // white noise (2s) and a short room reverb
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const ir = ctx.createBuffer(2, ctx.sampleRate * 0.9, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const b = ir.getChannelData(ch); for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / b.length, 3); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    // soft-clip curve for punchy gunshots
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 3.2); }
    this.curve = curve;
  }
  // slow motion: new sounds play lower and everything is muffled (k = game speed, 0.3 .. 1)
  setTimeScale(k) {
    const u = Math.max(0, Math.min(1, (k - 0.3) / 0.7));
    this.pitch = 0.45 + 0.55 * u;
    if (this.lp) this.lp.frequency.setTargetAtTime(900 + 19100 * u * u, this.ctx.currentTime, 0.03);
  }
  grab(on) { // the tractor beam: a wobbling low hum
    this.loop('grab', on, c => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70;
      const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; o.connect(f);
      return { out: f, nodes: [o, lfo] };
    }, 0.14);
  }
  throwDebris(n = 10) { // letting go of the grabbed ball: a heavy whoosh, bigger with more pieces
    if (!this.ok()) return;
    const k = Math.min(1.5, 0.6 + n / 30);
    this.noise_({ type: 'bandpass', f0: 400, f1: 2200, q: 0.9, a: 0.01, d: 0.25 * k, peak: 0.6, verb: 0.3 });
    this.osc({ type: 'sine', f0: 200, f1: 60, d: 0.2, peak: 0.35 });
  }
  avalanche() { // a lot of debris coming down: rolling rumble with a clatter of pieces
    if (!this.ok()) return;
    this.noise_({ type: 'lowpass', f0: 500, f1: 160, q: 0.5, a: 0.15, d: 1.3, peak: 0.45, verb: 0.5 });
    for (let i = 0; i < 14; i++) this.noise_({ type: 'bandpass', f0: 900 + Math.random() * 2600, q: 2, d: 0.03, peak: 0.08 + Math.random() * 0.1, t: Math.random() * 1.2, verb: 0.3 });
  }
  slowWhoosh() { // entering slow motion: a deep falling whoosh
    if (!this.ok()) return;
    this.noise_({ type: 'bandpass', f0: 1800, f1: 140, q: 0.8, a: 0.02, d: 0.9, peak: 0.5, verb: 0.6 });
    this.osc({ type: 'sine', f0: 220, f1: 40, d: 0.9, peak: 0.3, verb: 0.4 });
  }
  get stream() { return this.streamDest?.stream || null; }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.7; return this.muted; }

  // ---------------------------------------------------------------- building blocks
  out(node, { verb = 0.2, drive = false } = {}) {
    let n = node;
    if (drive) { const ws = this.ctx.createWaveShaper(); ws.curve = this.curve; n.connect(ws); n = ws; }
    n.connect(this.master);
    if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; n.connect(s); s.connect(this.verbIn); }
  }
  env(param, t, a, peak, d, hold = 0) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    if (hold) param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }
  // filtered noise burst
  noise_({ t = 0, type = 'bandpass', f0 = 1200, f1 = 0, q = 0.8, a = 0.002, d = 0.15, peak = 0.5, rate = 1, verb = 0.2, drive = false }) {
    const c = this.ctx, at = c.currentTime + t;
    if (this.voices >= MAX_VOICES) return;
    const P = this.pitch; d /= Math.sqrt(P);
    const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = rate * P * (0.9 + Math.random() * 0.2);
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0 * P, at);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * P), at + a + d);
    const g = c.createGain(); this.env(g.gain, at, a, peak, d);
    src.connect(f); f.connect(g); this.out(g, { verb, drive });
    this.voices++; src.onended = () => { this.voices--; };
    src.start(at, Math.random() * 1.5); src.stop(at + a + d + 0.05);
  }
  // pitched oscillator with a frequency sweep
  osc({ t = 0, type = 'sine', f0 = 440, f1 = 0, a = 0.003, d = 0.12, peak = 0.2, verb = 0.15, drive = false, detune = 0 }) {
    const c = this.ctx, at = c.currentTime + t;
    if (this.voices >= MAX_VOICES) return;
    const P = this.pitch; d /= Math.sqrt(P);
    const o = c.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0 * P, at);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * P), at + a + d);
    const g = c.createGain(); this.env(g.gain, at, a, peak, d);
    o.connect(g); this.out(g, { verb, drive });
    this.voices++; o.onended = () => { this.voices--; };
    o.start(at); o.stop(at + a + d + 0.05);
  }
  // a looping sound that fades in/out; build(ctx) returns { out: AudioNode, nodes: [startable] }
  loop(name, on, build, level = 0.2) {
    if (!this.ctx) return;
    const L = this.loops[name], t = this.ctx.currentTime;
    if (on && !L) {
      const g = this.ctx.createGain(); g.gain.value = 0.0001;
      const parts = build(this.ctx); parts.out.connect(g); this.out(g, { verb: 0.12 });
      parts.nodes.forEach(n => n.start?.());
      g.gain.setTargetAtTime(level, t, 0.03);
      this.loops[name] = { g, parts };
    } else if (!on && L) {
      L.g.gain.setTargetAtTime(0.0001, t, 0.05);
      L.parts.nodes.forEach(n => { try { n.stop?.(t + 0.4); } catch {} });
      delete this.loops[name];
    }
  }
  noiseSrc(c) { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; }
  ok() { return !!this.ctx && !this.muted; }

  // ---------------------------------------------------------------- weapons
  uzi() { // a fast, light 9mm snap: a short bright crack, a small bark under it, no room to speak of
    if (!this.ok()) return;
    const p = 0.92 + Math.random() * 0.16;
    this.noise_({ type: 'bandpass', f0: 1700 * p, q: 1.1, d: 0.045, peak: 0.5, drive: true, verb: 0.12 });
    this.noise_({ type: 'highpass', f0: 6000, d: 0.01, peak: 0.28, verb: 0 });
    this.osc({ type: 'sine', f0: 210 * p, f1: 80, d: 0.05, peak: 0.28 });
  }
  minigun() { // dry crack + low thump per round
    if (!this.ok()) return;
    this.noise_({ type: 'bandpass', f0: 1700 + Math.random() * 500, q: 1.2, d: 0.04, peak: 0.55, drive: true, verb: 0.1 });
    this.osc({ type: 'sine', f0: 110, f1: 55, d: 0.04, peak: 0.25, verb: 0 });
  }
  minigunSpin(on) { // motor whir that spins up while firing
    this.loop('spin', on, c => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; o.frequency.setTargetAtTime(95, c.currentTime, 0.25);
      const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = c.createGain(); lg.gain.value = 0.5;
      const am = c.createGain(); am.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      o.connect(am); am.connect(f);
      return { out: f, nodes: [o, lfo] };
    }, 0.12);
  }
  scatter() { // 12-gauge: a hard crack, a chest-thumping blast with a long room tail, then the pump racks
    if (!this.ok()) return;
    this.noise_({ type: 'highpass', f0: 2200, d: 0.03, peak: 1.0, drive: true, verb: 0.2 });
    this.noise_({ type: 'lowpass', f0: 5000, f1: 180, q: 0.5, a: 0.002, d: 0.55, peak: 1.5, drive: true, verb: 0.75 });
    this.osc({ type: 'sine', f0: 130, f1: 38, a: 0.002, d: 0.42, peak: 1.0 });
    this.osc({ type: 'square', f0: 75, f1: 40, d: 0.12, peak: 0.35, drive: true, verb: 0 });
    this.noise_({ type: 'bandpass', f0: 500, f1: 160, q: 0.7, d: 0.6, peak: 0.35, t: 0.06, verb: 0.9 });
    this.noise_({ type: 'highpass', f0: 2600, d: 0.035, peak: 0.45, t: 0.38, verb: 0.08 });
    this.osc({ type: 'square', f0: 950, f1: 620, d: 0.025, peak: 0.08, t: 0.38 });
    this.noise_({ type: 'highpass', f0: 2200, d: 0.04, peak: 0.5, t: 0.52, verb: 0.08 });
    this.osc({ type: 'square', f0: 720, f1: 480, d: 0.025, peak: 0.08, t: 0.52 });
  }
  rocketLaunch() { // rising whoosh with a low rumble
    if (!this.ok()) return;
    this.noise_({ type: 'bandpass', f0: 300, f1: 2200, q: 0.9, a: 0.04, d: 0.55, peak: 0.6, verb: 0.3 });
    this.osc({ type: 'sawtooth', f0: 60, f1: 120, a: 0.02, d: 0.4, peak: 0.12 });
    this.noise_({ type: 'highpass', f0: 2500, d: 0.05, peak: 0.3 });
  }
  boom(r = 50) { // crack of the blast front, a sub you feel, a distorted roar, then rolling rumble and debris
    if (!this.ok()) return;
    const k = Math.min(2.4, Math.max(0.6, r / 45));
    this.noise_({ type: 'highpass', f0: 1400, d: 0.05, peak: 1.0, drive: true, verb: 0.3 });
    this.osc({ type: 'sine', f0: 95, f1: 28, a: 0.002, d: 0.55 * k, peak: 1.1 });
    this.osc({ type: 'sine', f0: 52, f1: 20, a: 0.01, d: 1.3 * k, peak: 0.95 });
    this.osc({ type: 'square', f0: 62, f1: 30, d: 0.18 * k, peak: 0.45, drive: true, verb: 0 });
    this.noise_({ type: 'lowpass', f0: 3600, f1: 110, q: 0.4, a: 0.003, d: 1.1 * k, peak: 1.6, drive: true, verb: 0.85 });
    this.noise_({ type: 'lowpass', f0: 260, f1: 55, q: 0.6, a: 0.12, d: 1.8 * k, peak: 0.8, verb: 0.6 });
    for (let i = 0; i < 8 + 6 * k; i++) this.noise_({ type: 'highpass', f0: 1800 + Math.random() * 3600, d: 0.014, peak: 0.12 + Math.random() * 0.2, t: 0.1 + Math.random() * 0.8 * k, verb: 0.35 });
  }
  ak47() { // sharp supersonic crack over a mid-range bark, a little room
    if (!this.ok()) return;
    const p = 0.94 + Math.random() * 0.12;
    this.noise_({ type: 'bandpass', f0: 1100 * p, q: 0.9, d: 0.07, peak: 0.75, drive: true, verb: 0.3 });
    this.noise_({ type: 'highpass', f0: 5000, d: 0.012, peak: 0.35, verb: 0 });
    this.osc({ type: 'sine', f0: 150 * p, f1: 60, d: 0.07, peak: 0.4 });
    this.osc({ type: 'square', f0: 2600, f1: 2400, d: 0.01, peak: 0.03, t: 0.05 }); // bolt carrier
  }
  sniper() { // .50 cal: a supersonic crack, a cannon-like boom, echoes rolling off the buildings, then the bolt
    if (!this.ok()) return;
    this.noise_({ type: 'highpass', f0: 3000, d: 0.025, peak: 1.2, drive: true, verb: 0.25 });
    this.noise_({ type: 'bandpass', f0: 1400, q: 0.8, d: 0.08, peak: 0.9, drive: true, verb: 0.3 });
    this.noise_({ type: 'lowpass', f0: 6000, f1: 140, q: 0.4, a: 0.002, d: 1.0, peak: 1.6, drive: true, verb: 1 });
    this.osc({ type: 'sine', f0: 110, f1: 26, a: 0.002, d: 1.1, peak: 1.1 });
    this.osc({ type: 'square', f0: 58, f1: 30, d: 0.16, peak: 0.45, drive: true, verb: 0 });
    [0.24, 0.5, 0.8, 1.15].forEach((t, i) => this.noise_({ type: 'lowpass', f0: 1800 / (i + 1), f1: 200, q: 0.5, d: 0.45, peak: 0.55 / (i + 1), t, verb: 0.9 }));
    this.noise_({ type: 'highpass', f0: 2800, d: 0.035, peak: 0.4, t: 1.0, verb: 0.05 });
    this.osc({ type: 'square', f0: 820, f1: 600, d: 0.025, peak: 0.07, t: 1.0 });
    this.noise_({ type: 'highpass', f0: 2400, d: 0.04, peak: 0.45, t: 1.22, verb: 0.05 });
    this.osc({ type: 'square', f0: 640, f1: 460, d: 0.025, peak: 0.07, t: 1.22 });
  }
  launcher() { // hollow "thoomp" of a 40mm round leaving the tube
    if (!this.ok()) return;
    this.osc({ type: 'sine', f0: 180, f1: 55, d: 0.18, peak: 0.7 });
    this.noise_({ type: 'lowpass', f0: 900, f1: 200, q: 1.2, d: 0.16, peak: 0.6, verb: 0.3 });
    this.osc({ type: 'square', f0: 1300, f1: 1100, d: 0.02, peak: 0.04, t: 0.28 }); // drum rotates
  }
  strikeBeep() { if (this.ok()) { this.osc({ type: 'square', f0: 1980, f1: 1980, d: 0.05, peak: 0.08, verb: 0.08 }); this.osc({ type: 'sine', f0: 990, f1: 990, d: 0.05, peak: 0.06 }); } }
  designate() { // target lock beeps over the radio, then a crackly "copy"
    if (!this.ok()) return;
    [0, 0.12, 0.24].forEach(t => this.osc({ type: 'square', f0: 1760, f1: 1760, d: 0.06, peak: 0.07, t, verb: 0.1 }));
    this.noise_({ type: 'bandpass', f0: 1800, q: 3, d: 0.35, peak: 0.12, t: 0.45, verb: 0.05 });
  }
  jetFlyby() { // a fighter screaming over: rising then falling roar
    if (!this.ok()) return;
    this.noise_({ type: 'bandpass', f0: 500, f1: 2600, q: 0.7, a: 0.6, d: 1.4, peak: 0.55, verb: 0.4 });
    this.noise_({ type: 'lowpass', f0: 300, f1: 120, q: 0.5, a: 0.5, d: 1.6, peak: 0.6, drive: true, verb: 0.3 });
    this.osc({ type: 'sawtooth', f0: 220, f1: 120, a: 0.5, d: 1.3, peak: 0.06 });
  }
  bombWhistle() { // falling bombs: the long descending whistle
    if (!this.ok()) return;
    this.osc({ type: 'sine', f0: 1900, f1: 500, a: 0.1, d: 0.9, peak: 0.12, verb: 0.3 });
    this.osc({ type: 'sine', f0: 1850, f1: 480, a: 0.1, d: 0.9, peak: 0.06, verb: 0.3, t: 0.12 });
  }
  nukeLaunch() { // heavy catapult thunk and a rushing launch
    if (!this.ok()) return;
    this.osc({ type: 'sine', f0: 120, f1: 35, d: 0.45, peak: 0.9 });
    this.noise_({ type: 'lowpass', f0: 1600, f1: 200, q: 0.6, d: 0.5, peak: 0.8, drive: true, verb: 0.5 });
    this.noise_({ type: 'bandpass', f0: 400, f1: 1800, q: 0.8, a: 0.05, d: 0.8, peak: 0.4, verb: 0.4 });
  }
  nuke() { // the big one: a pressure crack, a sub you feel, a long rolling rumble and debris raining down
    if (!this.ok()) return;
    this.noise_({ type: 'highpass', f0: 1500, d: 0.06, peak: 0.9, verb: 0.5 });
    this.osc({ type: 'sine', f0: 60, f1: 18, a: 0.01, d: 4, peak: 1 });
    this.osc({ type: 'sine', f0: 42, f1: 20, a: 0.2, d: 4.5, peak: 0.7 });
    this.noise_({ type: 'lowpass', f0: 2600, f1: 60, q: 0.3, a: 0.005, d: 3.5, peak: 1.3, drive: true, verb: 1 });
    this.noise_({ type: 'lowpass', f0: 400, f1: 80, q: 0.5, a: 0.8, d: 4, peak: 0.6, verb: 0.8 });
    for (let i = 0; i < 26; i++) this.noise_({ type: 'highpass', f0: 1500 + Math.random() * 4000, d: 0.015, peak: 0.08 + Math.random() * 0.14, t: 0.4 + Math.random() * 3.2, verb: 0.4 });
  }
  wellFire() { if (this.ok()) { this.osc({ type: 'sine', f0: 900, f1: 120, d: 0.3, peak: 0.25, verb: 0.4 }); this.noise_({ type: 'bandpass', f0: 600, f1: 200, d: 0.3, peak: 0.2 }); } }
  well() { // the black hole opening: a falling wobble and wind
    if (!this.ok()) return;
    this.osc({ type: 'sawtooth', f0: 110, f1: 32, a: 0.05, d: 2.2, peak: 0.25, verb: 0.5 });
    this.osc({ type: 'sine', f0: 55, f1: 28, a: 0.05, d: 2.2, peak: 0.45 });
    this.noise_({ type: 'bandpass', f0: 400, f1: 120, q: 2, a: 0.3, d: 1.9, peak: 0.35, verb: 0.5 });
  }
  flamer(on) { // roaring gas: low-passed noise with a flutter
    this.loop('flame', on, c => {
      const n = this.noiseSrc(c);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      const bp = c.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 260; bp.gain.value = 9;
      const am = c.createGain(); am.gain.value = 0.7;
      const lfo = c.createOscillator(); lfo.frequency.value = 17; const lg = c.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(am.gain);
      n.connect(lp); lp.connect(bp); bp.connect(am);
      return { out: am, nodes: [n, lfo] };
    }, 0.4);
    if (on && !this.flameOn && this.ok()) this.noise_({ type: 'lowpass', f0: 200, f1: 2400, a: 0.02, d: 0.25, peak: 0.5, verb: 0.2 });
    this.flameOn = on;
  }
  crackle() { if (this.ok() && Math.random() < 0.5) this.noise_({ type: 'highpass', f0: 2500 + Math.random() * 3500, d: 0.01 + Math.random() * 0.02, peak: 0.06 + Math.random() * 0.08, verb: 0.1 }); }
  drone(on) { // rotor buzz
    this.loop('drone', on, c => {
      const a = c.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 145;
      const b = c.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 149;
      const am = c.createGain(); am.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 31; const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
      a.connect(am); b.connect(am); am.connect(f);
      return { out: f, nodes: [a, b, lfo] };
    }, 0.07);
  }
  droneShot() { if (this.ok()) { this.noise_({ type: 'bandpass', f0: 2600, q: 1.4, d: 0.03, peak: 0.3, drive: true, verb: 0.05 }); this.osc({ type: 'sine', f0: 160, f1: 80, d: 0.03, peak: 0.12 }); } }

  // ---------------------------------------------------------------- gear, movement, page
  throw() { if (this.ok()) { this.noise_({ type: 'bandpass', f0: 500, f1: 1500, q: 1, d: 0.16, peak: 0.25 }); this.osc({ type: 'square', f0: 2400, f1: 2200, d: 0.015, peak: 0.04 }); } }
  tick() { if (this.ok()) { this.osc({ type: 'sine', f0: 320, f1: 150, d: 0.05, peak: 0.18 }); this.noise_({ type: 'lowpass', f0: 900, d: 0.03, peak: 0.12 }); } }
  jet(on) { // thrust roar while flying
    this.loop('jet', on, c => {
      const n = this.noiseSrc(c), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const r = c.createOscillator(); r.type = 'sawtooth'; r.frequency.value = 48; const rg = c.createGain(); rg.gain.value = 0.15;
      const mix = c.createGain(); mix.gain.value = 0.8; n.connect(lp); lp.connect(mix); r.connect(rg); rg.connect(mix);
      return { out: mix, nodes: [n, r] };
    }, 0.22);
  }
  dash() { // a sharp air whoosh with a low push
    if (!this.ok()) return;
    this.noise_({ type: 'bandpass', f0: 700, f1: 2600, q: 1.1, a: 0.01, d: 0.16, peak: 0.45, verb: 0.15 });
    this.osc({ type: 'sine', f0: 160, f1: 70, d: 0.1, peak: 0.25 });
  }
  charge() { // a round supercharged by a dash: electric zap rising
    if (!this.ok()) return;
    this.osc({ type: 'sawtooth', f0: 500, f1: 2200, d: 0.12, peak: 0.08, verb: 0.2 });
    this.noise_({ type: 'highpass', f0: 4000, d: 0.05, peak: 0.18 });
  }
  punt() { // kicking a grenade: a hard metallic clank
    if (!this.ok()) return;
    this.osc({ type: 'square', f0: 900, f1: 500, d: 0.06, peak: 0.12, verb: 0.2 });
    this.noise_({ type: 'bandpass', f0: 1800, q: 2, d: 0.05, peak: 0.35 });
  }
  crack() { // an element taking a hit: a short brittle crack (rate-limited)
    if (!this.ok()) return; const now = this.ctx.currentTime; if (now - (this.lastCrack || 0) < 0.05) return; this.lastCrack = now;
    this.noise_({ type: 'highpass', f0: 2600 + Math.random() * 1800, d: 0.035, peak: 0.28, verb: 0.15 });
    this.osc({ type: 'triangle', f0: 1400 + Math.random() * 900, f1: 600, d: 0.05, peak: 0.05 });
  }
  tearOff(size = 60) { // an element coming loose: a tearing crack and a heavy thud, deeper for bigger things
    if (!this.ok()) return;
    const k = Math.min(2, Math.max(0.5, size / 120));
    this.noise_({ type: 'bandpass', f0: 1400 / k, f1: 300, q: 0.9, d: 0.28 * k, peak: 0.5, drive: true, verb: 0.35 });
    this.osc({ type: 'sine', f0: 110 / Math.sqrt(k), f1: 40, d: 0.3 * k, peak: 0.45 });
    this.noise_({ type: 'highpass', f0: 2600, d: 0.03, peak: 0.25, t: 0.02 });
  }
  shatter(size = 60) { // an element breaking apart: a crunch plus pieces tinkling down, bigger for bigger things
    if (!this.ok()) return;
    const k = Math.min(2, Math.max(0.5, size / 80));
    this.noise_({ type: 'bandpass', f0: 1800, f1: 500, q: 0.7, d: 0.22 * k, peak: 0.55, drive: true, verb: 0.35 });
    this.osc({ type: 'sine', f0: 140, f1: 60, d: 0.12 * k, peak: 0.25 });
    for (let i = 0; i < 4 + 4 * k; i++) this.noise_({ type: 'highpass', f0: 3000 + Math.random() * 3500, d: 0.02, peak: 0.08 + Math.random() * 0.1, t: 0.06 + Math.random() * 0.4 * k, verb: 0.3 });
  }
  pop() { // a letter tearing off: soft paper flick (rate-limited so big blasts don't buzz)
    if (!this.ok()) return;
    const now = this.ctx.currentTime; if (now - this.lastPop < 0.035) return; this.lastPop = now;
    this.noise_({ type: 'bandpass', f0: 2500 + Math.random() * 2500, q: 2, d: 0.03, peak: 0.12, verb: 0.05 });
  }
  jump(p = 1) { if (this.ok()) { this.noise_({ type: 'lowpass', f0: 500, d: 0.06, peak: 0.15 }); this.osc({ type: 'triangle', f0: 180 * p, f1: 360 * p, d: 0.08, peak: 0.06 }); } }
  land() { if (this.ok()) this.noise_({ type: 'lowpass', f0: 380, q: 0.7, d: 0.09, peak: 0.3 }); }
  // a round punching through bare paper: a dry papery tick (rate-limited, the minigun lands ~20 a second)
  // the cluster shell's chute popping / splitting open
  split() { if (this.ok()) { this.noise_({ type: 'bandpass', f0: 1800, f1: 600, q: 1.2, d: 0.12, peak: 0.3 }); this.osc({ type: 'square', f0: 900, f1: 300, d: 0.08, peak: 0.12 }); } }
  // the pulsar: a rising charge when fired, a deep hum as it forms, a whoosh per half turn of the jets, a groan as it
  // collapses, and the burst
  starFire() { if (this.ok()) { this.osc({ type: 'sawtooth', f0: 180, f1: 1400, d: 0.35, peak: 0.16 }); this.noise_({ type: 'highpass', f0: 3000, d: 0.2, peak: 0.1 }); } }
  starForm() { if (this.ok()) { this.osc({ type: 'sine', f0: 60, f1: 110, d: 1.2, peak: 0.3 }); this.osc({ type: 'triangle', f0: 2200, f1: 400, d: 0.6, peak: 0.1 }); } }
  starSweep() { if (this.ok()) this.noise_({ type: 'bandpass', f0: 400, f1: 2400, q: 1.5, d: 0.3, peak: 0.16 }); }
  starCollapse() { if (this.ok()) { this.osc({ type: 'sawtooth', f0: 400, f1: 40, d: 0.55, peak: 0.25 }); this.noise_({ type: 'lowpass', f0: 1200, f1: 200, d: 0.55, peak: 0.2 }); } }
  starEnd() { if (this.ok()) { this.noise_({ type: 'lowpass', f0: 2500, f1: 120, d: 1.4, peak: 0.9 }); this.osc({ type: 'sine', f0: 90, f1: 28, d: 1.2, peak: 0.6 }); this.osc({ type: 'triangle', f0: 3000, f1: 200, d: 0.5, peak: 0.2 }); } }
  // the rail laser: a rising whine while it charges, then a crack, a falling zap and a deep thump
  railCharge() { if (this.ok()) { this.osc({ type: 'sawtooth', f0: 220, f1: 1800, d: 0.38, peak: 0.12 }); this.osc({ type: 'sine', f0: 440, f1: 3200, d: 0.38, peak: 0.06 }); } }
  rail() { if (this.ok()) { this.noise_({ type: 'highpass', f0: 2400, f1: 500, d: 0.35, peak: 0.6 }); this.osc({ type: 'sawtooth', f0: 1800, f1: 60, d: 0.42, peak: 0.32 }); this.osc({ type: 'sine', f0: 95, f1: 30, d: 0.55, peak: 0.55 }); this.noise_({ type: 'lowpass', f0: 700, f1: 120, d: 0.3, peak: 0.45 }); } }
  // a daily objective done: a bright two-note ding
  challenge() { if (this.ok()) [784, 1175].forEach((f, i) => this.osc({ type: 'square', f0: f, f1: f, d: 0.12, peak: 0.08, t: i * 0.09, verb: 0.3 })); }
  // a new rank: a rising fanfare and a shimmer
  rankUp() { if (this.ok()) { [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc({ type: 'square', f0: f, f1: f, d: 0.18, peak: 0.08, t: i * 0.09, verb: 0.35 })); this.osc({ type: 'triangle', f0: 2093, f1: 2637, d: 0.6, peak: 0.05, t: 0.45, verb: 0.5 }); } }
  // the .50 glancing off something hard: a short metallic whine
  ricochet() { if (this.ok()) { this.osc({ type: 'triangle', f0: 2600 + Math.random() * 600, f1: 900, d: 0.16, peak: 0.16 }); this.noise_({ type: 'highpass', f0: 5000, d: 0.03, peak: 0.1 }); } }
  paperHit() {
    if (!this.ok()) return;
    const now = this.ctx.currentTime; if (now - (this.lastPaper || 0) < 0.045) return; this.lastPaper = now;
    this.noise_({ type: 'bandpass', f0: 3200 + Math.random() * 1200, f1: 1800, q: 1.4, d: 0.035, peak: 0.16 });
    this.noise_({ type: 'highpass', f0: 6000, d: 0.012, peak: 0.07 });
  }
  click() { if (this.ok()) { this.osc({ type: 'square', f0: 1300, f1: 1000, d: 0.025, peak: 0.05 }); this.noise_({ type: 'highpass', f0: 4000, d: 0.015, peak: 0.08 }); } }
  respawn() { if (this.ok()) this.osc({ type: 'triangle', f0: 300, f1: 900, d: 0.3, peak: 0.1, verb: 0.3 }); }
  milestone() { if (this.ok()) [523, 659, 784, 1046].forEach((f, i) => this.osc({ type: 'square', f0: f, f1: f, d: 0.14, peak: 0.07, t: i * 0.08, verb: 0.3 })); }
  // legacy names
  shot() { this.uzi(); }
  launch() { this.rocketLaunch(); }
  stopLoops() { for (const k of Object.keys(this.loops)) this.loop(k, false); this.flameOn = false; }
}
