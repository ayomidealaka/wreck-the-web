// Generates side-view character candidates with PixelLab (Pixen). Usage: node scripts/art/gen-candidates.mjs [startIndex]
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const STYLE = 'realistic proportions pixel art character, full body side view facing right, standing relaxed, detailed shading, natural muted colours, cinematic pixel art';
export const CANDIDATES = [
  'young Black man with short fade haircut, grey hoodie, blue jeans, white sneakers',
  'Latina woman with long dark wavy hair, black leather jacket, dark jeans, ankle boots',
  'older white man with short grey beard, brown tweed coat, flat cap, corduroy trousers, brown shoes',
  'East Asian woman with black bob haircut, beige trench coat, grey trousers, black loafers',
  'South Asian man with full black beard, olive bomber jacket, black t-shirt, khaki cargo pants, sneakers',
  'Black woman with long box braids, mustard yellow puffer jacket, black joggers, white sneakers',
  'tall man in a sharp black suit, white shirt, thin black tie, dark sunglasses, slicked back hair',
  'person in a bright orange hazmat suit with a clear helmet visor, black boots and gloves',
];
const start = +(process.argv[2] || 1);
console.log('credits before:', await balance());
// free plan: one generation at a time, so run them in sequence (skip ones already saved)
for (const [i, desc] of CANDIDATES.entries()) {
  if (i < start || fs.existsSync(`${ROOT}/public/art/candidates/c${i + 1}.png`)) continue;
  const r = await pl('POST', '/create-image-pixen', {
    description: `${STYLE}, ${desc}`, image_size: { width: 40, height: 52 }, view: 'side', direction: 'east',
    outline: 'lineless', detail: 'highly detailed', no_background: true, seed: 1000 + i,
  });
  savePng(r.image.base64 || r.image, `${ROOT}/public/art/candidates/c${i + 1}.png`);
  console.log(`c${i + 1} done`, JSON.stringify(r.usage));
}
fs.writeFileSync(`${ROOT}/public/art/candidates/list.json`, JSON.stringify(CANDIDATES.map((d, i) => ({ file: `c${i + 1}.png`, desc: d }))));
console.log('credits after:', await balance());
