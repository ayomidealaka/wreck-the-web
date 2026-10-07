import { pl, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const id = process.argv[2];
const img = { type: 'base64', base64: fs.readFileSync(`${ROOT}/public/art/skel/${id}_first.png`).toString('base64'), format: 'png' };
const r = await pl('POST', '/estimate-skeleton', { image: img });
fs.writeFileSync(`${ROOT}/public/art/skel/${id}_first.json`, JSON.stringify(r.keypoints, null, 1));
console.log('usage', JSON.stringify(r.usage));
for (const k of r.keypoints) console.log(k.label.padEnd(15), (k.x * 128).toFixed(1), (k.y * 128).toFixed(1), 'z', k.z_index);
