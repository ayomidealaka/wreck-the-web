// XP, ranks and the daily objectives: the menu card, XP earned while playing, a rank-up and a finished objective on
// screen, the results, and the ranks screen. Starts from a clean browser. usage: node scripts/playtests/check-progress.mjs <out>
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 240000);
const [OUT] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:4600/', { waitUntil: 'networkidle0' });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('wtw-pack', 'test'); });
await p.reload({ waitUntil: 'networkidle0' }); await wait(800);
const menu = await p.evaluate(() => ({ name: document.querySelector('#playerName').value, pid: localStorage.getItem('wtw-pid'), rank: document.querySelector('.standing-rank')?.textContent, daily: [...document.querySelectorAll('.daily-what')].map(e => e.textContent), ends: document.querySelector('#dailyEnds').textContent }));
console.log('menu:', JSON.stringify(menu));
await p.screenshot({ path: `${OUT}/menu.png`, fullPage: true });
// play: Uzi into the text for 3s
await p.goto('http://localhost:4600/?debug&pack=test&url=' + encodeURIComponent('en.wikipedia.org/wiki/Stick_figure'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 120000 });
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
const s0 = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x + 300 - g.cam.x + g.cam.sx) * g.cam.zoom, y: (pl.y + 60 - g.cam.y + g.cam.sy) * g.cam.zoom }; });
await p.mouse.move(s0.x, Math.max(150, s0.y)); await p.mouse.down(); await wait(3000); await p.mouse.up(); await wait(300);
const played = await p.evaluate(() => { const g = window.__game(); return { runXp: g.runXp, letters: g.arsenal.stats.letters, xp: +localStorage.getItem('wtw-xp'), used: [...g.arsenal.used], daily: JSON.parse(localStorage.getItem('wtw-daily')).list.map(o => `${o.text}: ${o.progress}/${o.n}${o.done ? ' DONE' : ''}`) }; });
console.log('after 3s of Uzi:', JSON.stringify(played));
await p.screenshot({ path: `${OUT}/hud.png`, clip: { x: 0, y: 0, width: 640, height: 140 } });
// a rank-up and a finished objective, on screen
await p.evaluate(() => { const g = window.__game(); g.reward({ xp: 0, ups: [3], done: [{ text: 'Knock 300 letters off with the Uzi', xp: 75 }] }); });
await wait(900);
await p.screenshot({ path: `${OUT}/rankup.png` });
// destroy the page outright and look at the results
await p.evaluate(() => { const g = window.__game(); for (let i = 0; i < 3; i++) g.arsenal.nuke(g.level.W * (0.2 + i * 0.25), 300 + i * 900); g.destruction = () => 1; });   // and call it destroyed
await wait(4000);
const res = await p.evaluate(() => ({ results: !document.querySelector('#results').hidden, xp: document.querySelector('#resultsXp')?.textContent.replace(/\s+/g, ' ').trim(), daily: JSON.parse(localStorage.getItem('wtw-daily')).list.map(o => `${o.text}: ${o.done ? 'DONE' : o.progress + '/' + o.n}`) }));
console.log('after destroying it:', JSON.stringify(res));
await p.screenshot({ path: `${OUT}/results.png` });
// back to the menu, open the ranks
await p.evaluate(() => document.querySelector('#results [data-act="menu"]').click()); await wait(600);
await p.screenshot({ path: `${OUT}/menu_after.png`, fullPage: true });
await p.click('#ranksBtn'); await wait(300);
await p.screenshot({ path: `${OUT}/ranks.png` });
console.log('errors:', errs.length ? errs.join(' | ') : 'none'); process.exit(0);
