// Weapon combos: a round through your own grenade in flight (airburst), the .50 through one (fragments too), and the
// laser bouncing. usage: node scripts/playtests/playtest-combos.mjs <out-dir>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const OUT = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
for (const style of ['rifle', 'slug']) {
  const r = await p.evaluate(async style => {
    const g = window.__game(), a = g.arsenal, { WEAPONS } = await import('/js/weapons.js');
    const booms = a.stats.booms, x = 600, y = -120;   // above the page: open air
    a.shots.push({ kind: 'grenade', x, y, vx: 0, vy: -50, life: 3, spin: 0 });
    a.bullet({ x: x - 120, y }, 0, style === 'slug' ? 4200 : 2000, style, WEAPONS.find(w => w.id === (style === 'slug' ? 'sniper' : 'ak47')).dmg);
    await new Promise(r => setTimeout(r, 250));
    return { boomed: a.stats.booms - booms, grenadeLeft: a.shots.some(s => s.kind === 'grenade'), fragments: a.shots.filter(s => s.kind === 'bullet' && s.style === 'pellet').length };
  }, style);
  console.log(style === 'slug' ? '.50 through grenade:' : 'AK round through grenade:', JSON.stringify(r));
  await wait(400);
}
// laser at a slant down into the page: count the bounces
await p.evaluate(() => { const g = window.__game(), L = g.level.letters.filter(l => l.alive && l.y > 250 && l.y < 450).sort((a, b) => a.y - b.y || a.x - b.x); const pl = g.player; pl.x = L[0].x + 30; pl.y = L[0].y - 1; pl.vx = pl.vy = 0; g.arsenal.select(8); });
await wait(400);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: pl.x * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom }; });
await p.mouse.move(s.x + 300, s.y + 140); await p.mouse.down(); await wait(400);
const beam = await p.evaluate(() => { const B = window.__game().arsenal.beam; return B && B.segs.map(sg => [Math.round(sg.x1), Math.round(sg.y1)]); });
await p.screenshot({ path: `${OUT}/laser_bounce.png`, clip: { x: Math.max(0, s.x - 60), y: Math.max(0, s.y - 160), width: 700, height: 420 } });
await p.mouse.up();
console.log('laser segments (end points):', JSON.stringify(beam));
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); process.exit(0);
