// Contact sheet for a rigged character: rows = poses (idle / run phases / air), columns = weapons at several aims.
// usage: node scripts/playtests/check-rig.mjs out.png [pack] [character id]   (WEAPONS=ak47,uzi,rocket ANG=-50,0,40
// BASE=http://localhost:4600)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT, PACK = 'test', ID] = process.argv.slice(2), BASE = process.env.BASE || 'http://localhost:4600';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}/cast-preview.html`, { waitUntil: 'domcontentloaded' });
const url = await p.evaluate(async ([PACK, ID, WS, ANGS]) => {
  const { loadPacks, loadManifest } = await import('/js/cast.js');
  const { RigCharacter } = await import('/js/rig.js');
  const { WEAPONS, loadWeaponArt } = await import('/js/weapons.js');
  await loadWeaponArt();
  const pack = (await loadPacks()).find(x => x.id === PACK), list = await loadManifest(pack), def = list.find(d => d.id === ID) || list[0];
  const c = await new RigCharacter(def).load();
  const ws = [null, ...WS.map(id => WEAPONS.find(w => w.id === id))];
  const states = [
    { name: 'idle', onGround: true, moving: false, runT: 0 },
    { name: 'run 0', onGround: true, moving: true, runT: 0 },
    { name: 'run .13', onGround: true, moving: true, runT: 0.13 },
    { name: 'run .26', onGround: true, moving: true, runT: 0.26 },
    { name: 'rise', onGround: false, vy: -300 }, { name: 'fall', onGround: false, vy: 400 },
  ];
  const cols = [];
  for (const w of ws) for (const a of (w ? ANGS : [0])) cols.push({ w, a });
  const CW = 110, CH = 120, Z = 2, cv = document.createElement('canvas'); cv.width = cols.length * CW * Z; cv.height = states.length * CH * Z;
  const g = cv.getContext('2d'); g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, cv.width, cv.height); g.scale(Z, Z);
  states.forEach((s, r) => cols.forEach((col, i) => {
    const st = { x: i * CW + 45, y: r * CH + 108, facing: 1, t: 0.5, landT: 0, aim: col.a * Math.PI / 180, ...s };
    c.draw(g, st, col.w);
    if (col.w) { const m = c.weaponMuzzle(st, col.w); g.fillStyle = '#FFE14D'; g.fillRect(m.x - 1, m.y - 1, 2, 2); }
  }));
  g.font = '7px sans-serif'; g.fillStyle = '#222'; states.forEach((s, r) => g.fillText(s.name, 2, r * CH + 10));
  return cv.toDataURL();
}, [PACK, ID, (process.env.WEAPONS || 'ak47,uzi,rocket').split(','), (process.env.ANG || '-50,0,40').split(',').map(Number)]);
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
console.log('errors:', errs.join(' | ') || 'none'); await b.close();
