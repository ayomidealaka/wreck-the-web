// The player's progress, kept in this browser: an anonymous id and a fun name, XP and the rank it buys, and three
// daily objectives (an easy, a medium and a hard one, picked by the date) about destroying websites and the guns used.
// The game reports what happens (letters knocked off and things smashed with which weapon, a site destroyed and how);
// this turns that into XP, rank-ups and finished objectives, and hands them back for the game to show.
import { RANKS, rankFor } from './badges.js';

const KEY = { pid: 'wtw-pid', name: 'wtw-name', xp: 'wtw-xp', daily: 'wtw-daily' };
// what things are worth
export const XP = { letters: 1 / 10, element: 5, destroyed: 150, tier: [75, 150, 250] };

const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const ADJ = ['Sneaky', 'Turbo', 'Wobbly', 'Grumpy', 'Rusty', 'Shiny', 'Fuzzy', 'Mighty', 'Sleepy', 'Spicy', 'Crispy', 'Jumpy', 'Lucky', 'Rapid', 'Feral', 'Sweaty', 'Cursed', 'Chunky', 'Laggy', 'Moody'];
const NOUN = ['Popup', 'Navbar', 'Captcha', 'Cookie', 'Footer', 'Banner', 'Pixel', 'Favicon', 'Iframe', 'Div', 'Tooltip', 'Modal', 'Sidebar', 'Spinner', 'Button', 'Widget', 'Hyperlink', 'Paywall', 'Carousel', 'Dropdown'];
export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

// ---------------------------------------------------------------- the daily objectives
const GUN = { uzi: 'Uzi', ak47: 'AK-47', minigun: 'Minigun', scatter: 'Shotgun', sniper: '.50 Sniper', launcher: 'Grenade Launcher', rocket: 'Rocket Launcher', flamer: 'Flamethrower', laser: 'Rail Laser', well: 'Gravity Well', mirv: 'Cluster Launcher', star: 'Pulsar', nuke: 'Mini Nuke' };
// [tier, make(pick)]: each makes one objective; pick(list) chooses from a list with the day's dice
const POOL = [
  [0, p => { const w = p(['uzi', 'ak47', 'minigun', 'scatter', 'flamer', 'laser']); return { kind: 'letters', weapon: w, n: 300, text: `Knock 300 letters off with the ${GUN[w]}` }; }],
  [0, p => { const w = p(['rocket', 'launcher', 'sniper', 'scatter', 'laser', 'mirv']); return { kind: 'elements', weapon: w, n: 8, text: `Smash 8 images or buttons with the ${GUN[w]}` }; }],
  [0, () => ({ kind: 'letters', n: 1500, text: 'Knock 1,500 letters off any websites' })],
  [1, () => ({ kind: 'destroy', n: 1, text: 'Destroy a website' })],
  [1, p => { const w = p(['uzi', 'ak47', 'minigun', 'flamer', 'laser']); return { kind: 'letters', weapon: w, n: 1200, text: `Knock 1,200 letters off with the ${GUN[w]}` }; }],
  [1, () => ({ kind: 'elements', n: 40, text: 'Smash 40 images or buttons' })],
  [2, p => { const w = p(['uzi', 'ak47', 'minigun', 'scatter', 'rocket', 'flamer', 'laser']); return { kind: 'destroyOnly', weapon: w, n: 1, text: `Destroy a website using only the ${GUN[w]}`, note: 'no other guns, grenades or airstrikes' }; }],
  [2, () => ({ kind: 'destroyFast', seconds: 240, n: 1, text: 'Destroy a website in under 4 minutes' })],
  [2, () => ({ kind: 'destroyWithout', without: ['nuke', 'airstrike', 'drone'], n: 1, text: 'Destroy a website without the nuke, airstrike or drone' })],
  [2, () => ({ kind: 'destroySites', n: 2, text: 'Destroy 2 different websites' })],
];
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// a seeded random from the date, so everyone gets the same three on the same day
function dice(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeDaily(date) {
  const r = dice(date), pick = list => list[(r() * list.length) | 0];
  return [0, 1, 2].map(tier => {
    const options = POOL.filter(([t]) => t === tier), o = pick(options)[1](pick);
    return { ...o, tier, xp: XP.tier[tier], progress: 0, done: false };
  });
}

export class Progress {
  constructor() {
    this.pid = load(KEY.pid, null);
    if (!/^[0-9a-f]{16}$/.test(this.pid || '')) { this.pid = hex(8); save(KEY.pid, this.pid); }
    this.name = load(KEY.name, null) || randomName(); save(KEY.name, this.name);
    this.xp = Math.max(0, +load(KEY.xp, 0) || 0);
    this.frac = 0;                  // letters' fractional XP, carried until it makes a whole point
    this.refreshDaily();
  }
  get rank() { return rankFor(this.xp); }
  // where this XP sits between this rank and the next: { rank, into, span, next } (next null at the top)
  standing(xp = this.xp) {
    const r = rankFor(xp), cur = RANKS[r].xp, nxt = RANKS[r + 1]?.xp ?? null;
    return { rank: r, name: RANKS[r].name, xp, into: xp - cur, span: nxt === null ? 1 : nxt - cur, next: nxt };
  }
  setName(n) { this.name = (n || '').trim().slice(0, 24) || randomName(); save(KEY.name, this.name); }
  // today's objectives (a new day brings new ones); `ends` is when they change
  refreshDaily() {
    const date = today(), d = load(KEY.daily, null);
    this.daily = d?.date === date && Array.isArray(d.list) && d.list.length === 3 ? d : { date, list: makeDaily(date), sites: [] };
    save(KEY.daily, this.daily);
    const t = new Date(); t.setHours(24, 0, 0, 0); this.dailyEnds = t.getTime();
  }
  // XP in; returns the ranks passed on the way (usually none)
  addXp(n) {
    const before = this.rank;
    this.xp += Math.max(0, Math.round(n)); save(KEY.xp, this.xp);
    const ups = []; for (let r = before + 1; r <= this.rank; r++) ups.push(r);
    return ups;
  }

  // ---- what the game reports. Each returns { xp, ups: [ranks], done: [objectives] }
  letters(src, n) {
    this.frac += n * XP.letters; const whole = Math.floor(this.frac); this.frac -= whole;
    return this.settle(whole, o => o.kind === 'letters' && (!o.weapon || o.weapon === src) ? n : 0);
  }
  elements(src, n) {
    return this.settle(n * XP.element, o => o.kind === 'elements' && (!o.weapon || o.weapon === src) ? n : 0);
  }
  // a website destroyed: run = { site, seconds, used: Set of weapon ids (grenade and airstrike count) }
  destroyed(run) {
    const sites = this.daily.sites; if (!sites.includes(run.site)) sites.push(run.site);
    return this.settle(XP.destroyed, o => {
      if (o.kind === 'destroy') return 1;
      if (o.kind === 'destroySites') return sites.length - o.progress;
      if (o.kind === 'destroyOnly') return run.used.size > 0 && [...run.used].every(w => w === o.weapon) ? 1 : 0;
      if (o.kind === 'destroyFast') return run.seconds < o.seconds ? 1 : 0;
      if (o.kind === 'destroyWithout') return o.without.some(w => run.used.has(w)) ? 0 : 1;
      return 0;
    });
  }
  // move the objectives on by `step(o)`, pay out any that finished, and the base XP
  settle(base, step) {
    if (this.daily.date !== today()) this.refreshDaily();
    const done = [];
    let xp = base;
    for (const o of this.daily.list) {
      if (o.done) continue;
      const k = step(o); if (!k) continue;
      o.progress = Math.min(o.n, o.progress + k);
      if (o.progress >= o.n) { o.done = true; done.push(o); xp += o.xp; }
    }
    save(KEY.daily, this.daily);
    return { xp, ups: xp > 0 ? this.addXp(xp) : [], done };
  }
}
