// Measures a reference animation sheet (<dir>/sheet.png, figures in reading order) with PixelLab estimate-skeleton, one
// frame at a time at a common scale, and saves the joints per frame to <dir>/poses.json (frames saved as <dir>/f<n>.png).
// Boxes = [x, y, w, h] per figure, e.g. from ImageMagick connected components on the sheet.
// usage: node scripts/art/estimate-ref-poses.mjs <dir> <scale> '<boxes json>'
//   run:  node scripts/art/estimate-ref-poses.mjs public/art/ref/run2 0.3 '[[81,69,358,312],[414,44,390,346],[826,63,301,338],[74,433,345,334],[388,450,362,317],[725,468,406,337],[70,826,301,338],[413,807,332,324]]'
import { pl, ROOT } from './pixellab.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [dirArg, scaleArg, boxArg] = process.argv.slice(2);
const D = `${ROOT}/${dirArg.replace(/\/$/, '')}/`, S = +scaleArg, BOX = JSON.parse(boxArg), out = [];
for (const [i, [x, y, w, h]] of BOX.entries()) {
  const f = `${D}f${i + 1}.png`;
  execFileSync('magick', [`${D}sheet.png`, '-crop', `${w + 20}x${h + 20}+${x - 10}+${y - 10}`, '+repage', '-fuzz', '10%', '-transparent', 'white',
    '-resize', `${S * 100}%`, '-background', 'none', '-gravity', 'center', '-extent', '128x128', f]);
  const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(f).toString('base64'), format: 'png' } });
  out.push(Object.fromEntries(r.keypoints.map(k => [k.label, { x: +(k.x * 128).toFixed(1), y: +(k.y * 128).toFixed(1), z: k.z_index }])));
  console.log(`f${i + 1} done`);
}
fs.writeFileSync(`${D}poses.json`, JSON.stringify(out, null, 1));
