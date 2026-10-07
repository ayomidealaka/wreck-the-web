// Profiles the game around a nuke: frame times for 5s after it goes off and the hottest functions (CPU profile).
// usage: node scripts/playtests/profile-nuke.mjs [site] [pack]
import puppeteer from 'puppeteer-core';
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 150000);
const [site = 'en.wikipedia.org/wiki/Stick_figure', pack = 'test'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await p.goto('http://localhost:4600/', { waitUntil: 'domcontentloaded' }); await p.evaluate(() => localStorage.removeItem('wtw-perf'));
await p.goto(`http://localhost:4600/?debug&pack=${pack}&url=` + encodeURIComponent(site), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
for (let k = 0; k < 6; k++) { await p.keyboard.press('KeyS'); await wait(350); }
await wait(500);
await p.evaluate(() => { window.__ft = []; let last = performance.now(); const tick = t => { window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
const cdp = await p.createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await p.keyboard.press('Equal'); await wait(300);
const s = await p.evaluate(() => { const g = window.__game(), pl = g.player; return { x: (pl.x - g.cam.x) * g.cam.zoom, y: (pl.y - g.cam.y) * g.cam.zoom }; });
await p.mouse.move(s.x + 250, s.y + 40); await wait(100);
await p.evaluate(() => { window.__ft = []; });
await cdp.send('Profiler.start');
await p.mouse.down(); await wait(60); await p.mouse.up();
const counts = [];
for (let i = 0; i < 10; i++) { await wait(500); counts.push(await p.evaluate(() => { const g = window.__game(), f = g.fx, a = g.arsenal; return `parts ${f.parts.length} chunks ${f.chunks.length} burning ${a.burning.size} pops ${a.pops?.length ?? '-'} degraded ${!!g.degraded}`; })); }
const { profile } = await cdp.send('Profiler.stop');
const ft = await p.evaluate(() => window.__ft);
const sec = []; let acc = 0, n = 0, worst = 0, cur = 0;
for (const d of ft) { acc += d; n++; worst = Math.max(worst, d); if (acc >= 500) { sec.push(`${Math.round(n / acc * 1000)}fps(worst ${Math.round(worst)}ms)`); acc = 0; n = 0; worst = 0; } }
console.log('per half-second after firing:', sec.join(' '));
counts.forEach((c, i) => console.log(`${(i + 1) * 0.5}s`, c));
// self time per function
const self = new Map(), byId = new Map(profile.nodes.map(nd => [nd.id, nd]));
const dt = profile.timeDeltas; const tot = new Map();
profile.samples.forEach((id, i) => { const nd = byId.get(id); const k = `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').pop()}:${nd.callFrame.lineNumber + 1}`; tot.set(k, (tot.get(k) || 0) + (dt[i] || 0)); });
const all = [...tot.values()].reduce((a, b) => a + b, 0);
console.log('hottest (self time):');
[...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => console.log(`  ${(v / 1000).toFixed(0).padStart(6)}ms ${(v / all * 100).toFixed(1).padStart(5)}%  ${k}`));
// who calls the hot native calls
const parent = new Map(); for (const nd of profile.nodes) for (const c of nd.children || []) parent.set(c, nd);
const name = nd => `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').pop()}:${nd.callFrame.lineNumber + 1}`;
for (const hot of ['getImageData', 'drawImage']) {
  const by = new Map();
  profile.samples.forEach((id, i) => { let nd = byId.get(id); if (nd.callFrame.functionName !== hot) return; const chain = []; let q = parent.get(nd.id); for (let k = 0; k < 3 && q; k++, q = parent.get(q.id)) chain.push(name(q)); const key = chain.join(' <- '); by.set(key, (by.get(key) || 0) + (dt[i] || 0)); });
  console.log(hot, 'callers:'); [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k, v]) => console.log(`  ${(v / 1000).toFixed(0).padStart(6)}ms  ${k}`));
}
console.log(errs.join('\n') || 'no errors'); process.exit(0);
