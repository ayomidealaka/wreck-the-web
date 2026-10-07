// Tiny PixelLab client. Reads PIXELLAB_API_KEY from .env. Usage from other scripts: import { pl, savePng } ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = env.PIXELLAB_API_KEY || process.env.PIXELLAB_API_KEY;
if (!KEY) throw new Error('PIXELLAB_API_KEY missing from .env');
export async function pl(method, route, body, tries = 30) {
  for (let i = 0; ; i++) {
    try { return await call(method, route, body); }
    catch (e) {
      const busy = / 429:/.test(e.message), network = e instanceof TypeError || / 5\d\d:/.test(e.message); // busy queue or flaky connection
      if ((!busy && !network) || i >= tries) throw e;
      if (i % 6 === 0) console.log(busy ? 'queue busy (plan concurrency limit), waiting…' : 'network error, retrying…');
      await new Promise(r => setTimeout(r, busy ? 10000 : 5000));
    }
  }
}
async function call(method, route, body) {
  const res = await fetch('https://api.pixellab.ai/v2' + route, {
    method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${route} ${res.status}: ${text.slice(0, 400)}`);
  return json;
}
export function savePng(b64, file) {
  const data = b64.replace(/^data:image\/\w+;base64,/, '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}
export const balance = async () => (await pl('GET', '/balance')).subscription?.generations;
export { ROOT };
