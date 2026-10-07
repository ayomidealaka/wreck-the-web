// Aim accuracy for a rigged character: for targets all around, how far the barrel line passes from the target (world
// px), using the old shoulder aim vs the two-step aimAt. usage: node scripts/playtests/check-aim.mjs [pack]
import puppeteer from 'puppeteer-core';
const PACK = process.argv[2] || 'test';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:4600/cast-preview.html', { waitUntil: 'domcontentloaded' });
console.log(await p.evaluate(async PACK => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js'); await loadWeaponArt();
  const c = await new RigCharacter((await loadManifest((await loadPacks()).find(x => x.id === PACK)))[0]).load();
  const out = [];
  for (const id of ['uzi', 'ak47', 'sniper', 'rocket']) {
    const w = WEAPONS.find(x => x.id === id), errs = { old: [], new: [] };
    for (const dist of [60, 150, 400]) for (let deg = -80; deg <= 80; deg += 20) {
      const st0 = { x: 0, y: 0, facing: 1, t: 0, onGround: true, moving: false, landT: 0, recoil: 0, aim: 0 };
      const sh = c.shoulderAt(st0), T = { x: sh.x + Math.cos(deg * Math.PI / 180) * dist, y: sh.y + Math.sin(deg * Math.PI / 180) * dist };
      const miss = aim => { const st = { ...st0, aim }, m = c.weaponMuzzle(st, w), P = c.pose(st, w), ga = P.weapon.a;
        const ux = Math.cos(ga), uy = Math.sin(ga); return Math.abs(-(T.x - m.x) * uy + (T.y - m.y) * ux); };
      let oldA = 0; for (let i = 0; i < 3; i++) { const s2 = c.shoulderAt({ ...st0, aim: oldA }); oldA = Math.atan2(T.y - s2.y, T.x - s2.x); }
      errs.old.push(miss(oldA)); errs.new.push(miss(c.aimAt(st0, w, T)));
    }
    const f = a => `avg ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2)} max ${Math.max(...a).toFixed(2)}`;
    out.push(`${id.padEnd(8)} old aim: ${f(errs.old)}   new aim: ${f(errs.new)}  (world px off the cursor)`);
  }
  return out.join('\n');
}, PACK));
await b.close();
