import { Level } from './level.js';
import { Backdrop, THEMES } from './backdrop.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Arsenal, WEAPONS, loadWeaponArt } from './weapons.js';
import { Audio } from './audio.js';
import { Input, isTouch } from './input.js';
import { ClipRecorder } from './recorder.js';
import { loadPacks, loadManifest, CastCharacter } from './cast.js';
import { RigCharacter } from './rig.js';
import { drawCrosshair } from './crosshair.js';
import { Progress, randomName } from './progress.js';
import { RANKS, badgeCanvas } from './badges.js';

const $ = s => document.querySelector(s);
const canvas = $('#game'), g = canvas.getContext('2d');
const audio = new Audio();
const progress = new Progress();   // XP, rank and the daily objectives, kept in this browser
const input = new Input(canvas, $('#touch'));
const PIXEL = "'Silkscreen', ui-monospace, Menlo, monospace";
const MILESTONES = [0.1, 0.25, 0.5, 0.75];
// When the page counts as destroyed. Half the score is letters knocked off against 70% of the page's letters, half
// is content removed against 70% of its content cells; both full = destroyed. No caps: however long the page.
const LETTER_SHARE = 0.7, LETTER_CAP = Infinity, CELL_SHARE = 0.7, CELL_CAP = Infinity;
const WIN_AT = 1;
const TOUCH_REACH = 500;   // how far out the aim point sits when aiming with the stick
// the tips checklist: [id, desktop label, touch label]; ticks off as you do each, once, ever (stored per browser)
const TIPS = [
  ['move', 'A D  run', 'left stick  move'], ['jump', 'W  jump, hold for jetpack', 'push up  jump'], ['shoot', 'click  shoot', 'right stick  aim + fire'],
  ['switch', '1-0 / wheel  switch weapon', '⇄  switch weapon'], ['dash', 'shift  dash', '»  dash'],
  ['grenade', 'right click  grenade', '●  grenade'], ['strike', '[  airstrike', '✈  airstrike'],
];
const tipsDone = () => { try { return JSON.parse(localStorage.getItem('wtw-tips') || '[]'); } catch { return []; } };
const saveTips = d => { try { localStorage.setItem('wtw-tips', JSON.stringify(d)); } catch {} };
let game = null, dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ UI
const screens = { menu: $('#menu'), loading: $('#loading'), pause: $('#pause'), results: $('#results') };
function show(name) { for (const [k, el] of Object.entries(screens)) el.hidden = k !== name; if (name === 'menu') renderProfile(); }
let toastTimer;
function toast(html, ms = 3500) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function showError(msg) { const e = $('#error'); e.textContent = msg; e.hidden = !msg; }

$('#go').addEventListener('submit', e => { e.preventDefault(); load($('#url').value); });
$('#examples').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('#url').value = b.dataset.url; load(b.dataset.url); } });
$('#pause').addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act; if (!act || !game) return;
  if (act === 'resume') setPaused(false);
  if (act === 'clip') saveClip();
  if (act === 'restart') { const { meta, bitmap } = game; game.destroy(); game = new Game(meta, bitmap); setPaused(false); }
  if (act === 'mute') e.target.textContent = 'Sound: ' + (audio.toggleMute() ? 'off' : 'on');
  if (act === 'menu') { game.destroy(); game = null; history.replaceState(null, '', location.pathname); show('menu'); setHud(false); $('#url').focus(); }
  if (act === 'tips') { saveTips([]); game.tips = { done: [], pop: {}, allT: -1 }; toast('Tips are back on screen', 1500); }
});
$('#results').addEventListener('click', e => {
  const b = e.target.closest('button'), act = b?.dataset.act; if (!act || !game) return;
  b.blur();                                                       // so Space (jump) doesn't press it again
  if (act === 'continue') show(null);
  if (act === 'clip') saveClip();
  if (act === 'restart') { const { meta, bitmap } = game; game.destroy(); game = new Game(meta, bitmap); show(null); setHud(true); }
  if (act === 'menu') { game.destroy(); game = null; history.replaceState(null, '', location.pathname); show('menu'); setHud(false); $('#url').focus(); }
});
$('#pauseBtn').addEventListener('click', () => setPaused(true));
$('#clipBtn').addEventListener('click', () => saveClip());

function setHud(on) { $('#hudButtons').hidden = !on; $('#touch').hidden = !(on && input.touch); }
function setPaused(p) {
  if (!game) return;
  game.paused = p;
  if (p) {
    const s = game.arsenal.stats;
    $('#pauseStats').textContent = `${Math.round((game.progress || 0) * 100)}% destroyed · ${s.letters} letters knocked off · ${s.elements || 0} things smashed · ${s.booms} explosions`;
    show('pause');
  } else show(null);
  setHud(!p);
}
addEventListener('visibilitychange', () => { if (document.hidden && game && !game.paused) setPaused(true); });

const LOADING_LINES = ['Rendering the page…', 'Waiting for its JavaScript…', 'Measuring every letter…', 'Pouring concrete under the text…', 'Arming the stickman…'];
async function load(raw) {
  const url = String(raw || '').trim();
  if (!url) return;
  showError(''); audio.init();
  show('loading'); $('#loadingUrl').textContent = url;
  let i = 0; $('#loadingText').textContent = LOADING_LINES[0];
  const spin = setInterval(() => { $('#loadingText').textContent = LOADING_LINES[++i % LOADING_LINES.length]; }, 1400);
  try {
    const mode = isTouch() && Math.min(innerWidth, innerHeight) < 820 ? 'mobile' : 'desktop';
    // render the site at this window's size and pixel density, so it fills the screen like the real page
    const q = new URLSearchParams({ url, mode, w: innerWidth, h: innerHeight, dpr: Math.min(devicePixelRatio || 1, 2).toFixed(2) });
    const res = await fetch(`/play/level?${q}`);
    const meta = await res.json();
    if (!res.ok) throw new Error(meta.error || 'Could not load that site.');
    const blob = await (await fetch(`/play/level/${meta.id}.webp`)).blob();
    const bitmap = await createImageBitmap(blob);
    await document.fonts.load(`12px ${PIXEL}`).catch(() => {});
    // the chosen character + weapon art first (generous limit for slow connections; a late sprite is swapped in)
    await Promise.race([Promise.all([castReady.then(chosenReady), weaponArt]), new Promise(r => setTimeout(r, 30000))]);
    game?.destroy();
    game = new Game(meta, bitmap);
    history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
    show(null); setHud(true);
    document.activeElement?.blur(); // the address box kept focus, which swallowed keys like Esc
  } catch (e) {
    show('menu'); showError(e.message);
  } finally { clearInterval(spin); }
}

async function saveClip() {
  if (!game?.recorder?.ok) { toast('Replay clips are not supported in this browser.'); return; }
  toast('Saving clip…', 8000);
  try {
    const { blob, seconds } = await game.recorder.save();
    const host = (() => { try { return new URL(game.meta.url).hostname.replace(/^www\./, ''); } catch { return 'web'; } })();
    const name = `wreck-${host}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${game.recorder.ext}`;
    const file = new File([blob], name, { type: blob.type });
    if (input.touch && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `I wrecked ${host}` }).catch(() => {});
      toast(`Clip ready (${Math.round(seconds)}s)`);
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast(`Saved a ${Math.round(seconds)}s clip: <b>${name}</b>`);
    }
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ characters
// The picker appears straight from the manifest; the saved character's frames load first and the rest follow in
// parallel. A game never starts as a stick figure just because the art was slow (e.g. over a tunnel): it waits for
// the chosen character, and if that still runs late the sprite is swapped in when it arrives.
// Character styles (packs) switch from the menu; each pack remembers its own last pick. ?pack=<id> picks one by link.
const cast = new Map(), loading = new Map();
let chosenId = null, packId = null;
const chosenReady = () => loading.get(chosenId) || Promise.resolve(null);
const pickKey = () => `wtw-character:${packId}`;
function choose(id) {
  chosenId = id;
  try { localStorage.setItem(pickKey(), id); } catch {}
  document.querySelectorAll('#cast button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  chosenReady().then(c => { if (c && chosenId === id && game && game.player.sprite !== c) game.player.sprite = c; });
}
const weaponArt = loadWeaponArt().catch(e => console.warn('weapon art unavailable', e));
async function loadCast(pack) {
  packId = pack.id; chosenId = null; cast.clear(); loading.clear();
  try { localStorage.setItem('wtw-pack', pack.id); } catch {}
  document.querySelectorAll('#packs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === pack.id));
  const root = document.getElementById('cast'); root.replaceChildren();
  try {
    const list = await loadManifest(pack);
    if (packId !== pack.id) return;                                  // switched again while this was loading
    let saved = null;
    try { saved = localStorage.getItem(pickKey()) ?? (pack.id === 'classic' ? localStorage.getItem('wtw-character') : null); } catch {}
    if (!list.some(d => d.id === saved)) saved = list[0]?.id;
    const order = [...list].sort((x, y) => (y.id === saved) - (x.id === saved));
    for (const def of order) {
      loading.set(def.id, (def.rig ? new RigCharacter(def) : new CastCharacter(def)).load()   // rigged (posed parts) or classic frames
        .then(c => { if (packId === pack.id) cast.set(def.id, c); return c; })
        .catch(e => { console.warn('character unavailable', def.id, e); root.querySelector(`button[data-id="${def.id}"]`)?.remove(); return null; }));
    }
    for (const def of list) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = def.id; b.title = def.name;
      // front-facing portrait (generated); falls back to a crop of the sprite once it has loaded
      let cv;
      if (def.portrait) cv = Object.assign(new Image(), { src: `${def.root}faces/${def.portrait}`, alt: '' });
      else { cv = document.createElement('canvas'); loading.get(def.id).then(c => c && cv.replaceWith(Object.assign(c.faceCanvas(4), { style: cv.style.cssText }))); }
      cv.style.width = cv.style.height = '64px';
      b.append(cv, Object.assign(document.createElement('span'), { textContent: def.name }));
      b.onclick = () => choose(def.id);
      root.append(b);
    }
    document.getElementById('castWrap').hidden = false;
    document.getElementById('castEmpty').hidden = list.length > 0;
    if (list.length) { choose(saved); await loading.get(saved); }
  } catch (e) { console.warn('cast unavailable', pack.id, e); document.getElementById('castEmpty').hidden = false; }
}
let castReady = (async () => {
  const packs = await loadPacks();
  let want = new URLSearchParams(location.search).get('pack');
  if (!want) try { want = localStorage.getItem('wtw-pack'); } catch {}
  const first = packs.find(p => p.id === want) || packs[0];
  const bar = document.getElementById('packs');
  if (packs.length > 1) { // the style toggle only shows once there is more than one style to plug in
    for (const p of packs) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = p.id; b.textContent = p.name;
      b.onclick = () => { if (p.id !== packId) castReady = loadCast(p); };
      bar.append(b);
    }
    bar.hidden = false;
  }
  await loadCast(first);
})();

// ------------------------------------------------------------------ profile, ranks, daily objectives (menu)
const fmtLeft = ms => { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
// a medal, the rank's name, an XP bar and a line under it, into `el`
function renderStanding(el, line) {
  if (!el) return;
  const st = progress.standing(), b = badgeCanvas(st.rank, 2);
  const toNext = st.next === null ? 'Top rank' : `${(st.next - st.xp).toLocaleString()} XP to ${RANKS[st.rank + 1].name}`;
  el.replaceChildren();
  const pic = document.createElement('canvas'); pic.width = b.width; pic.height = b.height; pic.getContext('2d').drawImage(b, 0, 0); pic.className = 'badge';
  const main = document.createElement('div'); main.className = 'standing-main';
  main.innerHTML = `<p class="standing-rank">${st.name} <span class="muted">· ${st.xp.toLocaleString()} XP</span></p>
    <div class="xp-bar"><i style="width:${st.next === null ? 100 : (100 * st.into / st.span).toFixed(1)}%"></i></div>
    <p class="muted standing-line">${line ? `${line} · ` : ''}${toNext}</p>`;
  el.append(pic, main);
}
function renderProfile() {
  progress.refreshDaily();
  renderStanding($('#standing'));
  const name = $('#playerName'); if (document.activeElement !== name) name.value = progress.name;
  $('#dailyEnds').textContent = `New in ${fmtLeft(progress.dailyEnds - Date.now())}`;
  $('#dailyList').replaceChildren(...progress.daily.list.map(o => {
    const row = document.createElement('div'); row.className = o.done ? 'daily-row done' : 'daily-row';
    row.innerHTML = `<p class="daily-what">${o.done ? '✓ ' : ''}${o.text}${o.note ? `<span class="muted"> (${o.note})</span>` : ''}</p>
      <div class="xp-bar daily-bar"><i style="width:${(100 * Math.min(o.progress, o.n) / o.n).toFixed(1)}%"></i></div>
      <p class="daily-meta"><span class="muted">${o.done ? 'Done' : o.n > 1 ? `${Math.min(o.progress, o.n).toLocaleString()} / ${o.n.toLocaleString()}` : ''}</span><span class="daily-xp">+${o.xp} XP</span></p>`;
    return row;
  }));
}
function renderRanks() {
  const st = progress.standing();
  $('#ranksGrid').replaceChildren(...RANKS.map((r, i) => {
    const card = document.createElement('div'); card.className = `rank-card${i <= st.rank ? '' : ' locked'}${i === st.rank ? ' current' : ''}`;
    const b = badgeCanvas(i, 2), pic = document.createElement('canvas'); pic.width = b.width; pic.height = b.height; pic.getContext('2d').drawImage(b, 0, 0);
    card.append(pic, Object.assign(document.createElement('p'), { textContent: r.name }), Object.assign(document.createElement('p'), { className: 'muted', textContent: `${r.xp.toLocaleString()} XP` }));
    return card;
  }));
}
$('#playerName').addEventListener('change', e => { progress.setName(e.target.value); e.target.value = progress.name; });
$('#nameReroll').addEventListener('click', () => { progress.setName(randomName()); $('#playerName').value = progress.name; });
$('#ranksBtn').addEventListener('click', () => { renderRanks(); $('#ranks').hidden = false; });
$('#ranks').addEventListener('click', e => { if (e.target.closest('[data-act="close"]') || e.target.id === 'ranks') $('#ranks').hidden = true; });
// ------------------------------------------------------------------ release notes and the GitHub link (menu)
const VERSION = '1.0';
const seen = () => { try { return localStorage.getItem('wtw-seen-version'); } catch { return null; } };
$('#versionTag').textContent = `v${VERSION}`;
$('#newsDot').hidden = seen() === VERSION;
$('#newsBtn').addEventListener('click', () => {
  $('#news').hidden = false; $('#newsDot').hidden = true;
  try { localStorage.setItem('wtw-seen-version', VERSION); } catch {}
});
$('#news').addEventListener('click', e => { if (e.target.closest('[data-act="close"]') || e.target.id === 'news') $('#news').hidden = true; });
// the star count, once a session; the link works without it
(async () => {
  let n = null;
  try { n = sessionStorage.getItem('wtw-stars'); } catch {}
  if (n === null) {
    try {
      const r = await fetch('https://api.github.com/repos/ayomidealaka/wreck-the-web');
      if (r.ok) { n = String((await r.json()).stargazers_count ?? ''); try { sessionStorage.setItem('wtw-stars', n); } catch {} }
    } catch {}
  }
  if (+n > 0) { $('#starCount').textContent = Number(n).toLocaleString(); $('#starCount').hidden = false; }
})();
setInterval(() => { if (!screens.menu.hidden) $('#dailyEnds').textContent = `New in ${fmtLeft(progress.dailyEnds - Date.now())}`; }, 30000);

let strikeBtn = null; // touch airstrike button (dimmed while the strike recharges)
// ------------------------------------------------------------------ game
const STEP = 1 / 60;
const ONE_SHOT = ['jumpPressed', 'grenade', 'grenadeKey', 'strike', 'dash', 'weaponNext', 'weaponPrev'];
// a later step in the same frame: keep what's held, drop the one-shot presses (they already happened)
const holdOnly = inp => ({ ...inp, ...Object.fromEntries(ONE_SHOT.map(k => [k, false])), weaponSlot: null });
// a frame that ran no step hands its presses on to the next one
const mergeInput = (a, b) => ({ ...b, ...Object.fromEntries(ONE_SHOT.map(k => [k, a[k] || b[k]])), weaponSlot: b.weaponSlot ?? a.weaponSlot });

// Which world hides under this page: one of the four, chosen by the site, never the same one twice running
// (?bg=city forces one)
function pickTheme(meta) {
  const forced = new URLSearchParams(location.search).get('bg');
  if (THEMES.includes(forced)) return forced;
  let last = null; try { last = localStorage.getItem('wtw-bg-last'); } catch {}
  let i = (meta.id ? parseInt(meta.id.slice(6, 12), 16) : Math.floor(Math.random() * 1e6)) % THEMES.length;
  if (THEMES[i] === last) i = (i + 1 + Math.floor(Math.random() * (THEMES.length - 1))) % THEMES.length;
  try { localStorage.setItem('wtw-bg-last', THEMES[i]); } catch {}
  return THEMES[i];
}

// ------------------------------------------------------------------ game
class Game {
  constructor(meta, bitmap) {
    this.meta = meta; this.bitmap = bitmap;
    this.level = new Level(meta, bitmap);
    // the world under the page: by night when the page itself is dark
    this.backdrop = new Backdrop(this.level.W, this.level.H, (meta.id ? parseInt(meta.id.slice(0, 6), 16) : 7) % 997, { night: this.level.lum < 0.4, theme: pickTheme(meta) });
    this.fx = new FX(this.level);
    this.audio = audio;
    this.player = new Player(this.level, Math.min(this.level.W * 0.3, 360), -60);
    this.player.sprite = cast.get(chosenId) || null;
    if (!this.player.sprite) chosenReady().then(c => { if (c && game === this) this.player.sprite = c; }); // art still on its way
    this.arsenal = new Arsenal(this);
    this.arsenal.onCredit = (kind, src, n) => this.reward(kind === 'letters' ? progress.letters(src, n) : progress.elements(src, n));
    this.runXp = 0; this.xpPop = null; this.notes = []; this.medals = [];   // XP this game, the +XP flash, challenge banners, rank-ups to show
    this.cam = { x: 0, y: -200, w: innerWidth, h: innerHeight, zoom: 1, sx: 0, sy: 0 };
    this.t = 0; this.paused = false; this.hit = MILESTONES.map(() => false); this.banner = null;
    this.progress = 0; this.seen = null; this.progT = 0; this.ending = null;
    this.tips = { done: tipsDone(), pop: {}, allT: -1 };
    this.fx.cam = this.cam;
    try { if (localStorage.getItem('wtw-perf') === 'low') this.setDegraded(true, true); } catch {}
    this.recorder = new ClipRecorder(canvas, audio.stream, { single: input.touch });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.title = meta.title.length > 34 ? meta.title.slice(0, 33) + '…' : meta.title;
  }
  destroy() { cancelAnimationFrame(this.raf); this.recorder?.stop(); audio.stopLoops(); this.dead = true; }

  frame = now => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const real = Math.min(0.25, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.watchPerf(real);
    let inp = input.frame();
    if (this.pending) inp = mergeInput(this.pending, inp);   // presses from frames that ran no update
    if (inp.pause) setPaused(!this.paused);
    if (inp.mute) { const m = audio.toggleMute(); toast(m ? 'Sound off' : 'Sound on', 1200); }
    if (inp.clip) saveClip();
    // fixed 60Hz steps (at most 3 a frame; any further backlog is dropped), the same on every screen refresh rate
    this.pending = null;
    if (!this.paused) {
      this.acc = (this.acc || 0) + real; let steps = 0;
      while (this.acc >= STEP && steps < 3) { this.update(STEP * this.timeScale(STEP), steps ? holdOnly(inp) : inp, STEP); this.acc -= STEP; steps++; }
      if (steps === 3) this.acc = Math.min(this.acc, STEP);
      if (!steps) this.pending = { ...inp, pause: false, mute: false, clip: false };
    } else audio.stopLoops();
    this.render();
    this.recorder?.frame();
  };

  // ---------------------------------------------------------------- slower machines
  // Frames averaging over 25ms for 2s switch on degraded mode (less debris and particles, coarser shattering), and the
  // browser remembers it so the next game starts that way; under 17ms for 10s switches it back off.
  watchPerf(real) {
    if (real <= 0 || real > 0.2) return;                 // tab switches and the like
    this.ftEma = this.ftEma == null ? real : this.ftEma * 0.95 + real * 0.05;
    if (!this.degraded) { this.slowFor = this.ftEma > 0.025 ? (this.slowFor || 0) + real : 0; if (this.slowFor > 2) this.setDegraded(true); }
    else { this.fastFor = this.ftEma < 0.017 ? (this.fastFor || 0) + real : 0; if (this.fastFor > 10) this.setDegraded(false); }
  }
  setDegraded(on, quiet = false) {
    this.degraded = on; this.slowFor = this.fastFor = 0;
    this.fx.maxChunks = on ? 250 : 700; this.fx.maxParts = on ? 800 : 2200; this.level.maxShards = on ? 16 : 48;
    try { on ? localStorage.setItem('wtw-perf', 'low') : localStorage.removeItem('wtw-perf'); } catch {}
    if (!quiet) toast(on ? 'Performance mode on: lighter effects' : 'Performance mode off', 1800);
  }

  // ---------------------------------------------------------------- slow motion on big moments
  // When a big share of a screenful of the page goes within half a second, time drops to 30% (in 0.05s), holds 0.8s
  // and eases back over 0.7s; sound pitches down and goes muffled. Then it can't trigger again for 8s.
  timeScale(realDt) {
    const S = this.slow ||= { t: -1, cool: 0 };
    S.cool -= realDt;
    if (S.t < 0) return 1;
    S.t += realDt;
    const IN = 0.05, HOLD = 0.8, OUT = 0.7, LOW = 0.3;
    let k = S.t < IN ? 1 - (1 - LOW) * S.t / IN : S.t < IN + HOLD ? LOW : S.t < IN + HOLD + OUT ? LOW + (1 - LOW) * ((S.t - IN - HOLD) / OUT) ** 2 : 1;
    if (S.t >= IN + HOLD + OUT) { S.t = -1; k = 1; }
    this.slowK = k; audio.setTimeScale(k);
    return k;
  }
  watchBursts(realDt) {
    const L = this.level, S = this.slow ||= { t: -1, cool: 0 };
    const gone = Math.max(0, (this.lastLeft ?? L.left) - L.left); this.lastLeft = L.left;
    (this.burst ||= []).push([this.realT, gone]);
    while (this.burst.length && this.realT - this.burst[0][0] > 0.5) this.burst.shift();
    const sum = this.burst.reduce((a, b) => a + b[1], 0), screenful = L.total * Math.min(1, this.cam.h / L.H);
    // Slow motion is switched off for now: uncomment to bring it back.
    // if (S.t < 0 && S.cool <= 0 && sum >= Math.max(2500, screenful * 0.3)) {
    //   S.t = 0; S.cool = 8; this.burst.length = 0; audio.slowWhoosh();
    // }
  }

  // the destruction score (see WIN_AT): 0..1, shown on the meter and the milestones
  destruction() {
    const L = this.level, s = this.arsenal.stats;
    const letters = Math.max(1, Math.min(L.letters.length * LETTER_SHARE, LETTER_CAP));
    const cells = Math.max(1, Math.min(L.total * CELL_SHARE, CELL_CAP));
    return Math.min(1, s.letters / letters) * 0.5 + Math.min(1, (L.total - L.left) / cells) * 0.5;
  }
  trackProgress(realDt) {
    if ((this.progT -= realDt) > 0) return;
    this.progT = 0.25;
    this.progress = this.destruction();
    if (!this.ending && this.progress >= WIN_AT) {
      this.ending = { t: 0, blasts: 0 };
      const site = (() => { try { return new URL(this.meta.url).hostname.replace(/^www\./, ''); } catch { return this.meta.url; } })();
      this.reward(progress.destroyed({ site, seconds: this.t, used: this.arsenal.used }));
    }
  }
  // the ending: the game never stops. A "PAGE DESTROYED" banner, then the results float over the page
  // while you keep playing; close them (x or Keep wrecking) and carry on with the same page.
  updateEnding(realDt) {
    const E = this.ending; if (!E || E.done) return;
    E.t += realDt;
    if (E.t === realDt) { this.banner = { text: 'PAGE DESTROYED', t: 0 }; audio.milestone(); }
    if (E.t > 0.9 && !(this.medals.length && this.medals[0].t < 2)) { E.done = true; this.showResults(); }   // once a rank-up medal has had its moment
  }
  // XP and what it brought: the +XP flash, a banner per finished objective, a medal per rank passed
  reward(r) {
    if (!r) return;
    if (r.xp > 0) { this.runXp += r.xp; this.xpPop = { n: (this.xpPop && this.xpPop.t < 1 ? this.xpPop.n : 0) + r.xp, t: 0 }; }
    for (const o of r.done) { this.notes.push({ o, t: 0 }); audio.challenge(); }
    // several ranks at once: show just the one landed on (and drop any not yet shown that it passes)
    if (r.ups.length) { this.medals = this.medals.filter(m => m.t > 0); this.medals.push({ rank: r.ups[r.ups.length - 1], t: 0 }); }
  }
  showResults() {
    const s = this.arsenal.stats, mins = Math.floor(this.t / 60), secs = Math.floor(this.t % 60);
    $('#resultsStats').innerHTML = [
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`], ['Wrecked', `${Math.round(this.progress * 100)}%`],
      ['Of the page gone', `${Math.round(this.level.destroyed * 100)}%`],
      ['Letters knocked off', s.letters], ['Things smashed', s.elements || 0], ['Explosions', s.booms], ['Shots fired', s.shots],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    renderStanding($('#resultsXp'), `+${this.runXp.toLocaleString()} XP this game`);
    show('results');
  }
  // tips checklist: tick each off the first time it happens
  tickTips(inp) {
    const T = this.tips; if (T.allT >= 0 && this.t - T.allT > 2) return;
    const { player } = this, did = {
      move: Math.abs(player.vx) > 120 && player.onGround, jump: inp.jumpPressed, shoot: inp.fire,
      switch: inp.weaponNext || inp.weaponPrev || inp.weaponSlot != null, dash: player.dashing, grenade: inp.grenade, strike: inp.strike,
    };
    for (const [id] of TIPS) if (did[id] && !T.done.includes(id)) { T.done.push(id); T.pop[id] = this.t; saveTips(T.done); audio.click(); }
    if (T.allT < 0 && TIPS.every(([id]) => T.done.includes(id))) T.allT = this.t;
  }

  update(dt, inp, realDt = dt) {
    this.t += dt; this.realT = (this.realT || 0) + realDt;
    const { player, cam } = this;
    // on touch the stick gives a direction: the aim point (where bullets stop) sits TOUCH_REACH out
    if (inp.aimDir) {
      inp.aimX = player.x + inp.aimDir.x * TOUCH_REACH; inp.aimY = player.y - 27 + inp.aimDir.y * TOUCH_REACH;
      // but never off the screen (a phone is narrower than the reach): the crosshair stays in view, and so do the holes
      inp.aimX = Math.max(cam.x + 14, Math.min(cam.x + cam.w - 14, inp.aimX)); inp.aimY = Math.max(cam.y + 14, Math.min(cam.y + cam.h - 14, inp.aimY));
    }
    else { inp.aimX = cam.x + inp.mouseX / cam.zoom; inp.aimY = cam.y + inp.mouseY / cam.zoom; }
    if (inp.fire || inp.jumpPressed || inp.grenade) audio.init();
    // two physics substeps keep fast falls from tunnelling through thin text
    // piloting the drone: the character stands still on the controller; the movement keys fly the drone instead
    const piloting = this.arsenal.weapon.id === 'drone';
    if (this.arsenal.notice) { toast(this.arsenal.notice, 1800); this.arsenal.notice = null; }
    if (piloting && !this.droneTip) { this.droneTip = true; toast(input.touch ? 'Drone: left stick flies it, right stick fires' : 'Drone: A D W S fly it · or just point and it glides there · click to fire', 3200); }
    const pin = piloting ? { ...inp, ax: 0, jumpHeld: false, jumpPressed: false, down: false, dash: false } : inp;
    const half = { ...pin, jumpPressed: false, dash: false, grenade: false, weaponNext: false, weaponPrev: false, weaponSlot: null };
    player.weapon = this.arsenal.weapon;
    player.update(dt / 2, pin, this.fx, audio);
    if (player.update(dt / 2, half, this.fx, audio) === 'fell') toast('Fell off the page. Back to the top!', 1800);
    this.arsenal.update(dt, inp);
    audio.jet(player.jetting);
    this.fx.update(dt);
    this.watchBursts(realDt);
    this.updateCamera(realDt);
    this.trackProgress(realDt);
    const d = this.progress;
    MILESTONES.forEach((m, i) => {
      if (!this.hit[i] && d >= m) { this.hit[i] = true; this.banner = { text: `${Math.round(m * 100)}% DESTROYED`, t: 0 }; audio.milestone(); }
    });
    this.tickTips(inp);
    this.updateEnding(realDt);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.2) this.banner = null; }
    if (this.xpPop && (this.xpPop.t += realDt) > 1.6) this.xpPop = null;
    if (this.notes.length && (this.notes[0].t += realDt) > (this.notes.length > 1 ? 2.4 : 3.6)) this.notes.shift();
    if (this.medals.length) { const m = this.medals[0]; if (!m.t) audio.rankUp(); if ((m.t += realDt) > 3.4) this.medals.shift(); }
  }

  updateCamera(dt) {
    const { cam, player, level } = this;
    cam.zoom = innerWidth / level.W; // the page always spans the window, edge to edge
    cam.w = innerWidth / cam.zoom; cam.h = innerHeight / cam.zoom;
    // follow the player, or the drone while it is being flown
    const dr = this.arsenal.drone && !this.arsenal.drone.leaving ? this.arsenal.drone : null;
    const f = dr ? { x: dr.x, y: dr.y + 30, aim: 0, look: 0 } : { x: player.x, y: player.y, aim: player.aim, look: 70 };
    let tx = cam.w >= level.W ? (level.W - cam.w) / 2 : f.x - cam.w / 2 + Math.cos(f.aim) * f.look;
    let ty = f.y - cam.h * 0.55 + Math.sin(f.aim) * f.look * 0.6;
    if (cam.w < level.W) tx = Math.max(0, Math.min(level.W - cam.w, tx));
    // like a real page: the top edge sits at the top of the window unless you fly up past it. On a phone the HUD
    // (meter, weapon row, tips) fills the top ~250px, so there the view may scroll above the page to keep him under it
    const topCap = Math.min(f.y < 140 ? f.y - 140 : 0, input.touch ? f.y - 280 : Infinity);
    ty = Math.max(topCap, Math.min(level.H - cam.h + 160, ty));
    const k = 1 - Math.pow(0.0008, dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    // gunfire jitter + the tiered impact shake (26Hz, fading over 0.4s)
    const s = this.fx.shake, q = this.fx.quake, qa = q.amp * (q.t / 0.4), w = (this.realT || 0) * Math.PI * 2 * 26;
    cam.sx = (Math.random() - 0.5) * s + Math.sin(w) * qa; cam.sy = (Math.random() - 0.5) * s + Math.cos(w * 0.83) * qa * 0.7;
    if (this.fx.avalanche) { this.fx.avalanche = false; audio.avalanche(); }
  }

  render() {
    const { cam, level } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0E0B16'; g.fillRect(0, 0, canvas.width, canvas.height);
    const z = cam.zoom * dpr;
    g.setTransform(z, 0, 0, z, Math.round((-cam.x + cam.sx) * z), Math.round((-cam.y + cam.sy) * z));
    const view = { x: cam.x, y: cam.y, w: cam.w, h: cam.h };
    // void around the page
    g.fillStyle = '#171225'; g.fillRect(-4, -4, level.W + 8, level.H + 8);
    this.backdrop.draw(g, view);
    level.draw(g, view, z);
    g.imageSmoothingEnabled = true;
    this.fx.drawBelow(g);
    // the point under the mouse right now (after this frame's camera move and shake), so the sniper laser meets the crosshair
    if (!input.touch) this.arsenal.aimPt = { x: cam.x - cam.sx + input.mouse.x / cam.zoom, y: cam.y - cam.sy + input.mouse.y / cam.zoom };
    this.arsenal.draw(g, this.t);
    this.player.draw(g, this.arsenal.weapon);
    this.fx.drawAbove(g);
    this.drawFuel(); this.drawRecharge(); this.drawBattery();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.slow?.t >= 0 && this.slowK < 0.99) { // slow-mo: darkened, cooler edges
      const k = (1 - this.slowK) / 0.7, W = canvas.width, H = canvas.height;
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(10,20,40,0)'); vg.addColorStop(1, `rgba(10,20,40,${0.55 * k})`);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = vg; g.fillRect(0, 0, W, H); g.restore();
    }
    if (this.fx.flash > 0.01) { g.fillStyle = `rgba(255,240,210,${this.fx.flash})`; g.fillRect(0, 0, innerWidth, innerHeight); }
    this.drawHud();
  }

  // the drone's battery, above it, like the jetpack's fuel: blinks red for the last 5 seconds
  drawBattery() {
    const d = this.arsenal.drone; if (!d || d.leaving) return;
    const r = Math.max(0, d.battery / 30), w = 30, x = d.x - w / 2, y = d.y - 24;
    if (r < 5 / 30 && (this.t * 6 | 0) % 2) return;
    g.fillStyle = 'rgba(14,11,22,0.75)'; g.fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle = r > 0.25 ? '#7CF2FF' : '#FF5A4E'; g.fillRect(x, y, w * r, 3);
  }

  // the weapon in hand reloading (the nuke's nine seconds and the like): a bar over the character, filling up in the
  // weapon's colour
  drawRecharge() {
    const p = this.player, w = this.arsenal.weapon, r = this.arsenal.recharge(w); if (!r) return;
    const bw = 30, x = p.x - bw / 2, y = p.y - p.height - (p.fuelRatio > 0.99 ? 12 : 19);
    g.fillStyle = 'rgba(14,11,22,0.75)'; g.fillRect(x - 1, y - 1, bw + 2, 5);
    g.fillStyle = w.color; g.fillRect(x, y, bw * r.frac, 3);
  }
  drawFuel() {
    const p = this.player;
    if (p.fuelRatio > 0.99) return;
    const w = 26, x = p.x - w / 2, y = p.y - p.height - 12;
    g.fillStyle = 'rgba(14,11,22,0.75)'; g.fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle = p.fuelRatio > 0.25 ? '#FFD25A' : '#FF5A4E'; g.fillRect(x, y, w * p.fuelRatio, 3);
  }

  drawHud() {
    const W = innerWidth, H = innerHeight, d = this.progress, small = W < 560;
    const text = (s, x, y, size, color = '#fff', align = 'left') => {
      g.font = `700 ${size}px ${PIXEL}`; g.textAlign = align; g.textBaseline = 'top';
      g.fillStyle = 'rgba(14,11,22,0.85)'; g.fillText(s, x + 2, y + 2);
      g.fillStyle = color; g.fillText(s, x, y);
    };
    const panel = (x, y, w, h) => { g.fillStyle = 'rgba(14,11,22,0.78)'; g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill(); };
    // destruction meter
    const bw = Math.min(300, W - 150), bx = small ? 12 : (W - bw) / 2, by = small ? 12 : 14;
    panel(bx - 10, by - 8, bw + 20, 46);
    text('PAGE DESTROYED', bx, by, 11, '#A79DB8');
    text(`${(d * 100).toFixed(1)}%`, bx + bw, by, 11, '#FFD25A', 'right');
    g.fillStyle = 'rgba(14,11,22,0.8)'; g.fillRect(bx - 2, by + 17, bw + 4, 12);
    g.fillStyle = '#3A2E52'; g.fillRect(bx, by + 19, bw, 8);
    const segs = 30;
    for (let i = 0; i < segs; i++) if (i / segs < d) { g.fillStyle = i / segs < 0.5 ? '#FF9A2E' : '#FF5A4E'; g.fillRect(bx + i * bw / segs + 1, by + 19, bw / segs - 2, 8); }
    if (!small) {
      g.font = `700 11px ${PIXEL}`;
      const tw = Math.max(g.measureText(this.title).width, 170), pw = Math.min(tw + 62, bx - 24), st = progress.standing();
      panel(6, 6, pw, 52);
      g.imageSmoothingEnabled = false; g.drawImage(badgeCanvas(st.rank, 1), 11, 15, 32, 32);
      text(this.title, 50, 12, 11, '#F4EFFA');
      text(`${st.name.toUpperCase()} · ${this.arsenal.stats.letters} LETTERS`, 50, 28, 9, '#A79DB8');
      const xbw = pw - 52; g.fillStyle = '#3A2E52'; g.fillRect(50, 43, xbw, 4);
      g.fillStyle = '#FFD25A'; g.fillRect(50, 43, st.next === null ? xbw : xbw * st.into / st.span, 4);
      if (this.xpPop) { const a = Math.min(1, (1.6 - this.xpPop.t) / 0.4); g.globalAlpha = a; text(`+${this.xpPop.n} XP`, 6 + pw + 8, 26 - this.xpPop.t * 6, 11, '#FFD25A'); g.globalAlpha = 1; }
    }
    // weapon bar geometry: as many slots per row as fit (one row on desktop; on phones one compact row of small
    // slots at the top, so the tips panel can sit under it instead of on top of it)
    const n = WEAPONS.length, compact = input.touch && small, gap = compact ? 2 : 5;
    const perRow = compact ? n : Math.max(1, Math.min(n, Math.floor((W - 16 + gap) / ((small ? 40 : 52) + gap))));
    const rowsN = Math.ceil(n / perRow), sw = compact ? Math.floor((W - 12 - (n - 1) * gap) / n) : Math.min(small ? 44 : 58, Math.floor((W - 16 - (perRow - 1) * gap) / perRow));
    const slotH = compact ? 28 : 40, rowStep = slotH + 6;
    const total = perRow * sw + (perRow - 1) * gap, wx = (W - total) / 2, wy0 = input.touch ? (small ? 60 : 66) : H - 14 - rowsN * rowStep;
    // tips checklist (left side), until everything has been done once
    { const T = this.tips, all = T.allT >= 0;
      if (!(all && this.t - T.allT > 2) && !this.ending) {
        const x0 = 6, y0 = input.touch ? wy0 + rowsN * rowStep + 4 : small ? 60 : 66, rowH = small ? 15 : 17, w = small ? 168 : 210;
        g.globalAlpha = all ? Math.max(0, 1 - (this.t - T.allT - 1.2) / 0.8) : 1;
        panel(x0, y0, w, 24 + TIPS.length * rowH);
        text(all ? 'ALL SET. GO WRECK IT' : 'TRY THESE', x0 + 10, y0 + 8, small ? 8 : 9, all ? '#3DFF7A' : '#FFD25A');
        TIPS.forEach(([id, desk, touch], i) => {
          const y = y0 + 24 + i * rowH, on = T.done.includes(id), pt = T.pop[id] != null ? this.t - T.pop[id] : 9;
          const s = pt < 0.3 ? 1 + Math.sin(pt / 0.3 * Math.PI) * 0.5 : 1;          // pop when ticked
          g.save(); g.translate(x0 + 15, y + 5); g.scale(s, s);
          g.fillStyle = on ? '#3DFF7A' : 'rgba(255,255,255,0.15)'; g.fillRect(-5, -5, 10, 10);
          if (on) { g.strokeStyle = '#0E0B16'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, 0); g.lineTo(-1, 2.5); g.lineTo(3.5, -2.5); g.stroke(); }
          g.restore();
          text((input.touch ? touch : desk).toUpperCase(), x0 + 26, y, small ? 7 : 8, on ? '#7C7390' : '#F4EFFA');
        });
        g.globalAlpha = 1;
      } }
    // weapon bar
    WEAPONS.forEach((w, i) => {
      const x = wx + (i % perRow) * (sw + gap), wy = wy0 + Math.floor(i / perRow) * rowStep, on = i === this.arsenal.index;
      g.fillStyle = on ? 'rgba(255,90,78,0.9)' : 'rgba(14,11,22,0.7)'; g.fillRect(x, wy, sw, slotH);
      g.fillStyle = on ? '#fff' : w.color; g.fillRect(x, wy + slotH - 4, sw, 4);
      const icon = this.player.sprite?.weaponIcon?.(w) || w.art;   // the character's own weapon art when it has some
      if (icon) { // sprite scaled to fit the slot (crisp pixels for the shared sprites, smoothed for detailed art)
        const pad = compact ? 3 : 5, ih = slotH - 8 - (compact ? 0 : 2);
        const k = Math.min((sw - pad * 2) / icon.w, ih / icon.h, icon.smooth ? 1 : 2);
        g.imageSmoothingEnabled = !!icon.smooth; g.drawImage(icon.img, Math.round(x + (sw - icon.w * k) / 2), Math.round(wy + 2 + (slotH - 6 - icon.h * k) / 2), icon.w * k, icon.h * k);
      }
      if (w.id === 'drone' && this.arsenal.droneCool > 0) { // recharging: dimmed with a countdown
        g.fillStyle = 'rgba(14,11,22,0.7)'; g.fillRect(x, wy, sw, slotH);
        text(`${Math.ceil(this.arsenal.droneCool)}s`, x + sw / 2, wy + (compact ? 9 : 13), compact ? 8 : 11, '#FFD25A', 'center');
      }
      const rc = this.arsenal.recharge(w);
      if (rc) { // reloading: dimmed, a bar filling along the bottom, the seconds left
        g.fillStyle = 'rgba(14,11,22,0.7)'; g.fillRect(x, wy, sw, slotH);
        g.fillStyle = w.color; g.fillRect(x, wy + slotH - 4, sw * rc.frac, 4);
        text(`${Math.ceil(rc.left)}s`, x + sw / 2, wy + (compact ? 9 : 13), compact ? 8 : 11, '#FFD25A', 'center');
      }
      if (!input.touch) text(w.key, x + 4, wy + 3, 9, on ? '#fff' : '#A79DB8');
      if (on && !small) text(w.name.toUpperCase(), x + sw / 2, wy0 - 16, 10, '#fff', 'center');
    });
    if (!input.touch) { panel(W - 132, H - 30, 124, 24); text('R CLIP · ESC MENU', W - 16, H - 23, 9, '#C9C0D8', 'right'); }
    // airstrike ([ key): ready, or the seconds until the next one
    { const cd = this.arsenal.strikeReady, ready = cd <= 0;
      if (input.touch) { strikeBtn ||= document.querySelector('.btn-strike'); if (strikeBtn) strikeBtn.style.opacity = ready ? 1 : 0.35; }
      else {
        // measure both parts so they never overlap: label, a gap, then the widest value it can show
        g.font = `700 9px ${PIXEL}`;
        const lw = g.measureText('[ AIRSTRIKE').width, vw = Math.max(g.measureText('READY').width, g.measureText('9.9S').width), sw2 = 8 + lw + 14 + vw + 10;
        panel(8, H - 30, sw2, 24); text('[ AIRSTRIKE', 16, H - 23, 9, ready ? '#3DFF7A' : '#7C7390');
        text(ready ? 'READY' : `${cd.toFixed(1)}S`, 8 + sw2 - 10, H - 23, 9, ready ? '#C8FFD8' : '#A79DB8', 'right');
      } }
    // first-seconds controls hint
    if (this.t < 7 && !input.touch) {
      g.globalAlpha = Math.min(1, (7 - this.t) / 1.5);
      const hint = 'A/D RUN · W JUMP (HOLD = HIGHER, KEEP HOLDING = JETPACK) · SHIFT DASH · CLICK SHOOT · RIGHT CLICK GRENADE';
      g.font = `700 10px ${PIXEL}`; const hw = g.measureText(hint).width;
      panel(W / 2 - hw / 2 - 12, H - 124, hw + 24, 28);
      text(hint, W / 2, H - 115, 10, '#F4EFFA', 'center');
      g.globalAlpha = 1;
    }
    if (this.banner) {
      const t = this.banner.t, a = t < 0.2 ? t / 0.2 : t > 1.8 ? (2.2 - t) / 0.4 : 1, s = 1 + Math.max(0, 0.25 - t) * 1.2;
      g.globalAlpha = a; g.save(); g.translate(W / 2, H * 0.3); g.scale(s, s);
      text(this.banner.text, 0, 0, small ? 22 : 34, '#FFD25A', 'center'); g.restore(); g.globalAlpha = 1;
    }
    // a finished daily objective: a banner under the meter
    if (this.notes.length) {
      const { o, t } = this.notes[0], a = Math.min(1, t / 0.25, (3.6 - t) / 0.4), y = (small ? 70 : 72) + (1 - Math.min(1, t / 0.25)) * -20;
      g.font = `700 11px ${PIXEL}`; const line = o.text.toUpperCase(), lw = Math.max(g.measureText(line).width, 200) + 40;
      g.globalAlpha = a; panel(W / 2 - lw / 2, y, lw, 46);
      g.fillStyle = '#3DFF7A'; g.fillRect(W / 2 - lw / 2, y, 4, 46);
      text('DAILY CHALLENGE DONE', W / 2, y + 8, 10, '#3DFF7A', 'center');
      text(`${line}  +${o.xp} XP`, W / 2, y + 24, 11, '#F4EFFA', 'center');
      g.globalAlpha = 1;
    }
    // a new rank: the medal pops in over light rays, the rank's name under it
    if (this.medals.length) {
      const { rank, t } = this.medals[0], a = Math.min(1, t / 0.2, (3.4 - t) / 0.4), pop = t < 0.35 ? 0.4 + (t / 0.35) * 0.75 : 1.15 - Math.min(0.15, (t - 0.35) * 0.6);
      const cx = W / 2, cy = H * 0.42, S = small ? 4 : 5, pw = 32 * S + 150, ph = 32 * S + 120;
      g.save(); g.globalAlpha = a * 0.92; g.fillStyle = 'rgba(14,11,22,0.88)'; g.beginPath(); g.roundRect(cx - pw / 2, cy - ph / 2 - 6, pw, ph, 16); g.fill();
      g.strokeStyle = '#FFD25A'; g.lineWidth = 2; g.stroke(); g.restore();
      g.save(); g.globalAlpha = a; g.beginPath(); g.roundRect(cx - pw / 2, cy - ph / 2 - 6, pw, ph, 16); g.clip(); g.translate(cx, cy);
      g.rotate(t * 0.6); g.fillStyle = 'rgba(255,210,90,0.14)';
      for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -190); g.lineTo(18, -190); g.closePath(); g.fill(); }
      g.restore();
      g.save(); g.globalAlpha = a; g.translate(cx, cy); g.scale(pop, pop); g.imageSmoothingEnabled = false;
      const b = badgeCanvas(rank, S); g.drawImage(b, -b.width / 2, -b.height / 2 - 10); g.restore();
      g.globalAlpha = a;
      text('RANK UP', cx, cy - ph / 2 + 6, 13, '#FFD25A', 'center');
      text(RANKS[rank].name.toUpperCase(), cx, cy + 16 * S - 6, small ? 22 : 28, '#F4EFFA', 'center');
      g.globalAlpha = 1;
    }
    // crosshair (on touch: at the aim point while the stick is held, so you see where the rounds stop)
    const touchAim = input.touch && input.stickR.active && this.arsenal.aimPt;
    if ((!input.touch || touchAim) && !this.paused) {
      // each weapon's own sight; rapid-fire spreads open with recoil
      const w = this.arsenal.weapon, kick = Math.min(1, this.player.recoil * (w.id === 'minigun' ? 2.5 : 1.4));
      const C = this.cam, ax = touchAim ? (this.arsenal.aimPt.x - C.x + C.sx) * C.zoom : input.mouse.x, ay = touchAim ? (this.arsenal.aimPt.y - C.y + C.sy) * C.zoom : input.mouse.y;
      drawCrosshair(g, ax, ay, w, { t: this.t, kick });
    }
  }
}

if (new URLSearchParams(location.search).has('debug')) window.__game = () => game; // for automated tests

// deep link: ?url=example.com starts straight into that level
const start = new URLSearchParams(location.search).get('url');
if (start) { $('#url').value = start; load(start); } else { show('menu'); $('#url').focus(); }
