// Always-on replay buffer. Two recorders run staggered, each restarting every PERIOD seconds,
// so "save clip" can always hand back the last ~20–40s of play as a video (with sound).
const PERIOD = 40;

function pickType() {
  if (!window.MediaRecorder) return null;
  for (const t of ['video/mp4;codecs=avc3.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export class ClipRecorder {
  constructor(source, audioStream, { maxWidth = 1280, fps = 30, single = false } = {}) {
    this.type = pickType();
    this.ok = !!this.type && !!source.captureStream;
    if (!this.ok) return;
    // record a downscaled copy so retina screens don't produce giant files
    this.source = source;
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d');
    this.maxWidth = maxWidth;
    this.resize();
    const v = this.canvas.captureStream(fps);
    this.stream = new MediaStream([...v.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])]);
    this.slots = single ? [this.slot()] : [this.slot(), this.slot()];
    this.slots[0].start();
    if (this.slots[1]) this.stagger = setTimeout(() => this.slots[1].start(), PERIOD * 500);
  }
  resize() {
    const s = Math.min(1, this.maxWidth / this.source.width);
    const w = Math.round(this.source.width * s / 2) * 2, h = Math.round(this.source.height * s / 2) * 2;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
  frame() { // call once per rendered frame
    if (!this.ok) return;
    this.resize();
    this.g.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
  }
  slot() {
    const s = { rec: null, chunks: [], t0: 0, timer: null, want: null };
    s.start = () => {
      s.chunks = []; s.t0 = performance.now();
      s.rec = new MediaRecorder(this.stream, { mimeType: this.type, videoBitsPerSecond: 4_000_000 });
      s.rec.ondataavailable = e => { if (e.data.size) s.chunks.push(e.data); };
      s.rec.onstop = () => {
        const blob = new Blob(s.chunks, { type: this.type.split(';')[0] });
        const dur = (performance.now() - s.t0) / 1000;
        const want = s.want; s.want = null;
        if (!this.stopped) s.start();
        want?.({ blob, seconds: dur });
      };
      s.rec.start(1000);
      clearTimeout(s.timer);
      s.timer = setTimeout(() => { if (s.rec.state === 'recording') s.rec.stop(); }, PERIOD * 1000);
    };
    return s;
  }
  save() {
    if (!this.ok) return Promise.reject(new Error('Recording is not supported in this browser.'));
    const live = this.slots.filter(s => s.rec?.state === 'recording').sort((a, b) => a.t0 - b.t0);
    const s = live[0];
    if (!s) return Promise.reject(new Error('Nothing recorded yet.'));
    return new Promise(res => { s.want = res; clearTimeout(s.timer); s.rec.stop(); });
  }
  get ext() { return this.type?.includes('mp4') ? 'mp4' : 'webm'; }
  stop() {
    this.stopped = true; clearTimeout(this.stagger);
    for (const s of this.slots || []) { clearTimeout(s.timer); if (s.rec?.state === 'recording') s.rec.stop(); }
  }
}
