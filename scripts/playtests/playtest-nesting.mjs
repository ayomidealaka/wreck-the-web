// Component nesting: lists the page's containers, then shoots things inside one card until the card comes loose
// with everything in it. usage: node scripts/playtests/playtest-nesting.mjs <out-dir> [site]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT, site = 'en.wikipedia.org/wiki/Stick_figure'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1200);
const info = await p.evaluate(() => {
  const L = window.__game().level, B = L.boxes;
  const kids = B.map(() => 0); B.forEach(q => { if (q.parent >= 0) kids[q.parent]++; });
  const withText = B.map((q, id) => ({ id, ...q, letters: L.letters.filter(l => l.x >= q.x && l.x + l.w <= q.x + q.w && l.y >= q.y && l.y + l.h <= q.y + q.h).length, els: L.elements.filter(e => e.parent === id).length }));
  // a card: has its own text and an element or a child box, mid-sized, near the top
  const card = withText.filter(q => q.letters > 10 && (q.els > 0 || kids[q.id] > 0) && q.w * q.h < 400000 && q.y > 150).sort((a, c) => a.y - c.y)[0];
  return { containers: B.length, nested: B.filter(q => q.parent >= 0).length, elementsInBoxes: L.elements.filter(e => e.parent >= 0).length, card: card && { id: card.id, x: card.x, y: card.y, w: card.w, h: card.h, hp: +card.maxHp.toFixed(1), letters: card.letters, elements: card.els, childBoxes: kids[card.id] } };
});
console.log(JSON.stringify(info));
const C = info.card;
if (!C) { console.log('no card with text + contents on this page to test'); console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0); }
const shot = async n => { const c = await p.evaluate(C => { const g = window.__game(); return { x: Math.max(0, (C.x - 30) * g.cam.zoom), y: Math.max(0, (C.y - 30 - g.cam.y) * g.cam.zoom), width: Math.min(1280, (C.w + 60) * g.cam.zoom), height: Math.min(780, (C.h + 140) * g.cam.zoom) }; }, C); await p.screenshot({ path: `${OUT}/nest_${n}.png`, clip: c }); };
await p.evaluate(C => { const g = window.__game(); g.cam.y = Math.max(0, C.y - 200); g.player.x = 20; g.player.y = C.y - 300; }, C); await wait(400);
await shot(0);
let n = 0;
for (; n < 200; n++) {
  const st = await p.evaluate(C => {
    const g = window.__game(), L = g.level, a = g.arsenal, B = L.boxes[C.id];
    if (!B.alive) return { alive: false };
    // fire a pistol round into a letter or element inside the card
    const targets = L.letters.filter(l => l.alive && l.x >= B.x && l.x + l.w <= B.x + B.w && l.y >= B.y && l.y + l.h <= B.y + B.h);
    const t = targets[(Math.random() * targets.length) | 0];
    if (!t) return { alive: true, hp: B.hp, empty: true };
    a.bullet({ x: t.x - 6, y: t.y + t.h / 2 }, 0, 1500, 'smg', { r: 4, pen: 0, splash: 0 });
    return { alive: true, hp: +B.hp.toFixed(2), worn: +(B.lost / Math.max(1, B.cells)).toFixed(2) };
  }, C);
  if (!st.alive) break;
  if (n % 20 === 0) console.log(`shot ${n}:`, JSON.stringify(st));
  await wait(90);
}
console.log(`card came loose after ${n} pistol shots`);
await wait(150); await shot(1); await wait(700); await shot(2);
const after = await p.evaluate(C => { const g = window.__game(); return { falling: g.fx.chunks.filter(c => c.slab).map(c => [Math.round(c.w), Math.round(c.h)]) }; }, C);
console.log('falling pieces:', JSON.stringify(after.falling));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
