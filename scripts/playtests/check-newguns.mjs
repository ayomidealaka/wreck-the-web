// The flamethrower sets the page itself alight; the cluster launcher, pulsar and wand each run their course. Prints
// what burned and screenshots each weapon mid-way. usage: node scripts/playtests/check-newguns.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(600);
const toScreen = q => p.evaluate(q => { const g = window.__game(); return { x: (q.x - g.cam.x + g.cam.sx) * g.cam.zoom, y: (q.y - g.cam.y + g.cam.sy) * g.cam.zoom }; }, q);
const shot = async (name, q, w = 520, h = 400) => { const s = await toScreen(q); await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: Math.max(0, Math.min(1280 - w, s.x - w / 2)), y: Math.max(0, Math.min(800 - h, s.y - h / 2)), width: w, height: h } }); };
// 1. flamethrower held on a spot of the page for 1.2s, then the fire left to itself
const fl = await p.evaluate(async () => {
  const g = window.__game(), L = g.level, a = g.arsenal, pl = g.player, gone0 = L.gone.reduce((s, v) => s + v, 0);
  const h = { x: pl.x + 20, y: pl.y - 30 }, an = 0.35;
  for (let i = 0; i < 72; i++) { a.flamer(1 / 60, h, an); await new Promise(r => setTimeout(r, 16)); }
  const burning = a.fire.size; await new Promise(r => setTimeout(r, 1500));
  return { burningAtRelease: burning, burningNow: a.fire.size, blocksGone: L.gone.reduce((s, v) => s + v, 0) - gone0, at: { x: pl.x + 160, y: pl.y + 40 } };
});
console.log('flamethrower 1.2s on the page: burning blocks at release', fl.burningAtRelease, '-> now', fl.burningNow, '; page blocks burnt away', fl.blocksGone);
await shot('fire', fl.at);
// a clear spot for the big ones
const target = await p.evaluate(() => {
  const g = window.__game(), L = g.level, pl = g.player;
  for (let y = pl.y - 200; y < pl.y + 400; y += 16) for (let x = 500; x < L.W - 100; x += 16) { let ok = true; for (let dy = -30; dy <= 30 && ok; dy += 6) for (let dx = -30; dx <= 30; dx += 6) if (L.solidAt(x + dx, y + dy)) ok = false; if (ok) return { x, y }; }
  return { x: pl.x + 300, y: pl.y };
});
// 2. cluster launcher: shell lobbed at the target
const mv = await p.evaluate(async q => {
  const g = window.__game(), a = g.arsenal, pl = g.player, x0 = q.x - 320, y0 = q.y - 200, b0 = a.stats.booms;
  a.shots.push({ kind: 'mirv', x: x0, y: y0, vx: 420, vy: -120, a: 0, life: 9, t: 0, state: 0, bounces: 0, ct: 0 });
  let chuted = false; for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 50)); const s = a.shots.find(s => s.kind === 'mirv'); if (s?.state === 1) chuted = true; if (a.shots.some(s => s.kind === 'bomblet')) break; }
  const bomblets = a.shots.filter(s => s.kind === 'bomblet').length;
  await new Promise(r => setTimeout(r, 2600));
  return { chuted, bomblets, booms: a.stats.booms - b0 };
}, target);
console.log('cluster launcher: chute opened', mv.chuted, '; bomblets', mv.bomblets, '; explosions', mv.booms);
await shot('cluster', target, 640, 420);
// 3. pulsar: the star formed at the target, caught mid-sweep, then after its burst
const st = await p.evaluate(async q => { const g = window.__game(), a = g.arsenal; a.formStar(q.x, q.y); await new Promise(r => setTimeout(r, 1600)); return { stars: a.stars.length, len: Math.round(a.stars[0]?.len || 0) }; }, target);
console.log('pulsar: formed', st.stars === 1, 'jets reach', st.len);
await shot('pulsar', target, 760, 560);
await wait(3800);
console.log('pulsar after the burst: stars left', await p.evaluate(() => window.__game().arsenal.stars.length), '; explosions so far', await p.evaluate(() => window.__game().arsenal.stats.booms));
await shot('pulsar_after', target, 760, 560);
// 4. wand: the spell at the target, ritual then blast
const target2 = { x: target.x - 250, y: target.y + 220 };
await p.evaluate(q => { window.__game().arsenal.spells.push({ x: q.x, y: q.y, t: 0, popped: 0, rot: 1 }); }, target2);
await wait(900); await shot('wand_ritual', target2, 560, 440);
await wait(1800); await shot('wand_blast', target2, 560, 440);
console.log('wand: echoes popped', await p.evaluate(() => window.__game().arsenal.spells[0]?.popped ?? 'done'));
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
