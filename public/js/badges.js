// The rank medals, drawn as 32x32 pixel art and scaled up with hard pixels. Five families: bronze medals (ranks 1-3),
// silver shields (4-6), gold sunbursts (7-9), platinum hexagons with a gem (10-11) and the winged legendary crest (12).
// Inside each sits the rank's own emblem; the stars under it count the step within the family.

export const RANKS = [
  { name: 'Lurker', xp: 0, emblem: 'eye' },
  { name: 'Clicker', xp: 150, emblem: 'cursor' },
  { name: 'Spammer', xp: 400, emblem: 'mail' },
  { name: 'Glitch', xp: 800, emblem: 'glitch' },
  { name: 'Bug', xp: 1400, emblem: 'bug' },
  { name: 'Hacker', xp: 2200, emblem: 'term' },
  { name: 'Crasher', xp: 3300, emblem: 'bolt' },
  { name: '404', xp: 4800, emblem: 'e404' },
  { name: 'Blue Screen', xp: 6800, emblem: 'bsod' },
  { name: 'Kernel Panic', xp: 9500, emblem: 'skull' },
  { name: 'Meltdown', xp: 13000, emblem: 'flame' },
  { name: 'Web Wrecker', xp: 18000, emblem: 'boom' },
];
export const rankFor = xp => { let r = 0; for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i; return r; };

// metal families: outline, deep, base, light, shine, the inner field, and the ribbon's two colours
const FAMILY = [
  { shape: 'round', outline: '#2E1A0C', deep: '#7A4522', base: '#B06A34', light: '#DE9A5E', shine: '#F8CFA0', field: '#5A3318', ribbon: ['#B8322A', '#E8D9C0'] },
  { shape: 'shield', outline: '#1E2230', deep: '#6A7488', base: '#A8B2C4', light: '#D6DEEA', shine: '#FFFFFF', field: '#454E62', ribbon: ['#2F5FB8', '#E8EEF8'] },
  { shape: 'sun', outline: '#3A2606', deep: '#9A6A10', base: '#E0A82A', light: '#FFD866', shine: '#FFF4C0', field: '#7A4E08', ribbon: ['#1F7A4A', '#F6E7A8'] },
  { shape: 'hex', outline: '#14202A', deep: '#5A7488', base: '#A6C4D8', light: '#DDF0FA', shine: '#FFFFFF', field: '#20384A', ribbon: ['#6A2FB8', '#7CF2FF'] },
  { shape: 'crest', outline: '#1A0820', deep: '#6A1E5A', base: '#C23C7A', light: '#FF7AB0', shine: '#FFE0F0', field: '#2A0C30', ribbon: ['#FFB238', '#FF3DCB'] },
];
const familyOf = r => r < 3 ? 0 : r < 6 ? 1 : r < 9 ? 2 : r < 11 ? 3 : 4;
const stepOf = r => r < 9 ? r % 3 : r < 11 ? r - 9 : 0;

// emblems, 11 wide: k ink, w white, a/b/c/g the emblem's colours (set per emblem)
const EMBLEM = {
  eye: { cols: { a: '#7CF2FF' }, art: [
    '...kkkkk...',
    '.kkwwwwwkk.',
    'kwwwkkkwwwk',
    'kwwkkawkwwk',
    'kwwwkkkwwwk',
    '.kkwwwwwkk.',
    '...kkkkk...'] },
  cursor: { cols: {}, art: [
    '...k.......',
    '...kk......',
    '...kwk.....',
    '...kwwk....',
    '...kwwwk...',
    '...kwwwwk..',
    '...kwwwwwk.',
    '...kwwkkkk.',
    '...kwkkwk..',
    '...kk.kwk..',
    '...k...kk..'] },
  mail: { cols: { a: '#FF5A4E' }, art: [
    'kkkkkkkkkkk',
    'kwkwwwwwkwk',
    'kwwkwwwkwwk',
    'kwwwkakwwwk',
    'kwwwwkwwwwk',
    'kwwwwwwwwwk',
    'kkkkkkkkkkk'] },
  glitch: { cols: { a: '#7CF2FF', b: '#FF3DCB', c: '#FFF4A6' }, art: [
    'aaaa.bbbb..',
    '..aaaaa.bb.',
    'bbb..cccc..',
    '.aaaaaa.bbb',
    'bb..ccccc..',
    '..bbbb.aaaa',
    'aaa..bbb...'] },
  bug: { cols: { a: '#9BE564', b: '#3E7A34' }, art: [
    '..k.....k..',
    '...k...k...',
    '...kkkkk...',
    'k.kaaaaak.k',
    '.kkabkbakk.',
    'k.kaaaaak.k',
    '.kkabkbakk.',
    'k.kaaaaak.k',
    '...kkkkk...'] },
  term: { cols: { g: '#3DFF7A', a: '#7CF2FF' }, art: [
    'kkkkkkkkkkk',
    'kaaaaaaaaak',
    'kkkkkkkkkkk',
    'kgkkkkkkkkk',
    'kkgkkkkkkkk',
    'kgkkkggggkk',
    'kkkkkkkkkkk'] },
  bolt: { cols: { a: '#FFE04A', b: '#FFFFFF' }, art: [
    '......kkkk.',
    '.....kaak..',
    '....kaak...',
    '...kabkkk..',
    '..kaaaaak..',
    '..kkkkak...',
    '....kak....',
    '...kak.....',
    '..kak......',
    '..kk.......'] },
  e404: { cols: { a: '#FF5A4E' }, art: [
    'a.a.aaa.a.a',
    'a.a.a.a.a.a',
    'aaa.a.a.aaa',
    '..a.a.a...a',
    '..a.aaa...a'] },
  bsod: { cols: { b: '#1E5BD8', w: '#FFFFFF' }, art: [
    'kkkkkkkkkkk',
    'kbbbbbbbbbk',
    'kbbwbbbwbbk',
    'kbbbbbbbbbk',
    'kbbbwwwbbbk',
    'kbbwbbbwbbk',
    'kbbbbbbbbbk',
    'kkkkkkkkkkk'] },
  skull: { cols: {}, art: [
    '...kkkkk...',
    '.kkwwwwwkk.',
    'kwwwwwwwwwk',
    'kwkkwwwkkwk',
    'kwkkwwwkkwk',
    'kwwwwkwwwwk',
    '.kwwwwwwwk.',
    '..kwkwkwk..',
    '...kkkkk...'] },
  flame: { cols: { a: '#FF5A1F', b: '#FFB238', w: '#FFF4C0' }, art: [
    '.....a.....',
    '....aa.....',
    '....aab.a..',
    '...aabbaa..',
    '..aabbbbaa.',
    '.aabbwbbbaa',
    '.abbwwwbba.',
    '.abbwwwbba.',
    '..abbwbba..',
    '...aaaaa...'] },
  boom: { cols: { a: '#FF5A1F', b: '#FFD25A', w: '#FFFFFF' }, art: [
    'a....a....a',
    '.a...a...a.',
    '..abbbbba..',
    '...bwwwb...',
    'aabbwwwbbaa',
    '...bwwwb...',
    '..abbbbba..',
    '.a...a...a.',
    'a....a....a'] },
};

// is (x, y) inside the family's shape (32x32, medal centred at 16, 20)
function inside(shape, x, y) {
  const cx = 15.5, cy = 19.5, dx = x - cx, dy = y - cy;
  if (shape === 'round') return dx * dx + dy * dy <= 11.2 * 11.2;
  if (shape === 'shield') { if (y < 9 || y > 31 || Math.abs(dx) > 11) return false; return y < 23 || Math.abs(dx) <= (31 - y) * 1.4; }
  if (shape === 'sun') { const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy); return r <= 9.5 + 2.4 * Math.max(0, Math.cos(a * 8)); }
  if (shape === 'hex' || shape === 'crest') { const ax = Math.abs(dx), ay = Math.abs(dy); return ay <= 11.5 && ax <= 10 && ax * 0.58 + ay <= 13; }
  return false;
}
function insideField(shape, x, y) {
  // the field: the same shape pulled in by 3 pixels
  for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]]) if (!inside(shape, x + ox, y + oy)) return false;
  return true;
}

const cache = new Map();
// the medal for rank r as a canvas, `scale` page pixels per art pixel
export function badgeCanvas(r, scale = 2) {
  const key = `${r}|${scale}`; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 32 * scale;
  const g = c.getContext('2d'), F = FAMILY[familyOf(r)], E = EMBLEM[RANKS[r].emblem], px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); };
  // the ribbon: two straps meeting behind the medal, striped
  for (let y = 0; y < 12; y++) for (const side of [-1, 1]) {
    const x0 = Math.round(15.5 + side * (8 - y * 0.45)) - (side < 0 ? 0 : 4);
    for (let i = 0; i < 5; i++) { const x = x0 + i; px(x, y, i === 0 || i === 4 ? F.outline : i === 2 ? F.ribbon[1] : F.ribbon[0]); }
  }
  // wings for the crest
  if (F.shape === 'crest') for (let y = 13; y < 27; y++) for (let x = 0; x < 32; x++) {
    const dx = Math.abs(x - 15.5), w = 15.5 - (y - 13) * 0.55, feather = (Math.floor(dx) + y) % 3 === 0;
    if (dx > 9 && dx < w) px(x, y, dx > w - 1 ? F.outline : feather ? F.light : F.base);
  }
  // the body: outline, then shaded metal (light from the top left)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inside(F.shape, x, y)) continue;
    const edge = !inside(F.shape, x - 1, y) || !inside(F.shape, x + 1, y) || !inside(F.shape, x, y - 1) || !inside(F.shape, x, y + 1);
    if (edge) { px(x, y, F.outline); continue; }
    const k = (x - 15.5) + (y - 19.5);
    let col = k < -8 ? F.shine : k < -3 ? F.light : k > 9 ? F.deep : F.base;
    if (insideField(F.shape, x, y)) col = F.field;
    else if (insideField(F.shape, x - 1, y - 1) || insideField(F.shape, x + 1, y + 1)) col = k < 0 ? F.deep : F.light;   // the bevel round the field
    px(x, y, col);
  }
  // the gem on the platinum hexagons
  if (F.shape === 'hex') { for (const [x, y, col] of [[15, 7, F.outline], [16, 7, F.outline], [14, 8, F.outline], [15, 8, '#7CF2FF'], [16, 8, '#FFFFFF'], [17, 8, F.outline], [15, 9, F.outline], [16, 9, F.outline]]) px(x, y, col); }
  // the emblem, centred in the field
  const art = E.art, ew = art[0].length, eh = art.length, ex = 16 - Math.ceil(ew / 2), ey = 19 - Math.floor(eh / 2) - (F.shape !== 'crest' ? 2 : 0);
  for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
    const ch = art[j][i]; if (ch === '.') continue;
    px(ex + i, ey + j, ch === 'k' ? '#120C1A' : ch === 'w' ? (E.cols.w || '#F4EFFA') : E.cols[ch] || '#F4EFFA');
  }
  // stars for the step within the family
  if (F.shape !== 'crest') {
    const n = stepOf(r) + 1, y = F.shape === 'sun' ? 25 : 26;
    for (let i = 0; i < n; i++) { const x = 16 - n * 2 + i * 4 + 1; for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) px(x + dx, y + dy, dx || dy ? '#FFD25A' : '#FFF8D8'); }
  }
  cache.set(key, c);
  return c;
}
