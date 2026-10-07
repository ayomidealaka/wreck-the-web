import puppeteer from 'puppeteer-core'; // usage: node scripts/<this>.mjs <screenshot-dir> [site]
const OUT = process.argv[2];
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(1); }, 120000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
await p.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:4600/');
await p.screenshot({ path: `${OUT}/m_menu.png` });
await p.goto('http://localhost:4600/?debug&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'));
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 60000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1800); await p.screenshot({ path: `${OUT}/m_1.png` });
// right stick: aim down-right and fire
const r = await p.$eval('.stick-r', e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await p.touchscreen.touchStart(r.x, r.y); await p.touchscreen.touchMove(r.x + 40, r.y + 30);
await wait(1200); await p.screenshot({ path: `${OUT}/m_2.png` });
await p.touchscreen.touchEnd();
// where things are: the player on screen, the aim point and how far out it sits
console.log('state:', await p.evaluate(() => { const g = window.__game(), pl = g.player, a = g.arsenal.aimPt; return JSON.stringify({ playerScreen: [Math.round((pl.x - g.cam.x + g.cam.sx) * g.cam.zoom), Math.round((pl.y - g.cam.y + g.cam.sy) * g.cam.zoom)], zoom: +g.cam.zoom.toFixed(2), aimDist: a ? Math.round(Math.hypot(a.x - pl.x, a.y - pl.y + 27)) : null, letters: g.arsenal.stats.letters, shots: g.arsenal.stats.shots }); }));
// grenade, dash, swap weapon twice (should land on the minigun)
await p.tap('.btn-grenade'); await wait(600); await p.tap('.btn-dash'); await wait(400); await p.tap('.btn-swap'); await wait(150); await p.tap('.btn-swap'); await wait(1200);
await p.screenshot({ path: `${OUT}/m_3.png` });
console.log('debris now:', await p.evaluate(() => { const g = window.__game(), h = {}; for (const c of g.fx.chunks) { const k = (c.slab ? 'slab ' : c.sprite?.pageW > 10 ? 'big ' : 'small ') + (c.sprite?.pageW | 0) + 'x' + (c.sprite?.pageH | 0); h[k] = (h[k] || 0) + 1; } return JSON.stringify(h); }));
console.log('after buttons:', await p.evaluate(() => { const g = window.__game(); return JSON.stringify({ weapon: g.arsenal.weapon.id, booms: g.arsenal.stats.booms, tipsDone: g.tips.done }); }));
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close(); process.exit(0);
