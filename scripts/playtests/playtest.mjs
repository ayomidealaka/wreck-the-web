import puppeteer from 'puppeteer-core'; // usage: node scripts/<this>.mjs <screenshot-dir> [site]
const OUT = process.argv[2], URL_ = process.argv[3] || 'en.wikipedia.org/wiki/Stick_figure';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(1); }, 150000);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1280,800'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.evaluateOnNewDocument(() => { window.__toasts = []; addEventListener('DOMContentLoaded', () => new MutationObserver(() => { const t = document.querySelector('#toast'); if (!t.hidden) window.__toasts.push(t.textContent); }).observe(document.querySelector('#toast'), { childList: true, subtree: true, attributes: true })); });
await p._client().send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }).catch(() => {});
await p.goto((process.env.BASE || 'http://localhost:4600') + '/?url=' + encodeURIComponent(URL_));
await p.waitForFunction(() => document.querySelector('#loading').hidden && document.querySelector('#menu').hidden, { timeout: 60000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async n => p.screenshot({ path: `${OUT}/play_${n}.png` });
await wait(1500); await shot(1);
await p.mouse.move(900, 380);
await p.keyboard.down('KeyD'); await wait(500); await p.keyboard.up('KeyD');
await p.mouse.down(); await wait(900); await p.mouse.up(); await shot(2);
await p.keyboard.press('Digit2'); await p.mouse.move(700, 600); await p.mouse.down(); await wait(1200); await p.mouse.up(); await shot(3);
await p.keyboard.press('Digit4'); await p.mouse.move(800, 550);
for (let i = 0; i < 3; i++) { await p.mouse.down(); await wait(60); await p.mouse.up(); await wait(820); }
await wait(150); await shot(4);
await p.mouse.click(600, 500, { button: 'right' }); await wait(2000); await shot(5);
await p.keyboard.press('Digit5'); await p.mouse.move(1000, 600); await p.mouse.down(); await wait(1200); await p.mouse.up(); await shot(6);
await p.keyboard.press('Digit6'); await p.mouse.move(800, 450); await p.mouse.down(); await wait(80); await p.mouse.up(); await wait(1600); await shot(7);
await wait(1400); await shot(8);
// jump + jetpack
await p.keyboard.down('Space'); await wait(1100); await shot(9); await p.keyboard.up('Space');
await p.keyboard.press('KeyR'); await wait(2500);
console.log('toasts:', JSON.stringify(await p.evaluate(() => [...new Set(window.__toasts)])));
await p.keyboard.press('Escape'); await wait(300); await shot(10);
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close(); process.exit(0);
