// Rigs a character made by gen-char.mjs, the way Ash was rigged, in two steps with a look in between:
//   pose <id> <base file>   the chosen drawing becomes chars/<id>/src/base.png, PixelLab estimates its skeleton
//                           (base_skeleton.json), then rig-pose.mjs re-poses it into three A-poses (apose_0..2.png)
//   cut <id> <k>            A-pose k (0 = arms 30° down, 1 = 40°, 2 = 22°) becomes rigsrc.png with its skeleton,
//                           and cut-rig.mjs cuts it into parts: chars/<id>/rig/*.png + rig.json
// usage: node scripts/art/rig-char.mjs pose r2 base_reference_1.png
//        node scripts/art/rig-char.mjs cut r2 0
import { pl, ROOT } from './pixellab.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [step, id, arg] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(`${ROOT}/scripts/art/characters.json`, 'utf8'));
const ch = cfg.characters.find(c => c.id === id);
if (!ch || !['pose', 'cut'].includes(step) || arg == null) throw new Error('usage: rig-char.mjs pose <id> <base file> | cut <id> <k>');
const DIR = `public/art/packs/test/chars/${id}`, SRC = `${ROOT}/${DIR}/src/`;
const run = (script, ...args) => execFileSync('node', [`${ROOT}/scripts/art/${script}`, ...args], { cwd: ROOT, stdio: 'inherit' });

if (step === 'pose') {
  fs.copyFileSync(SRC + arg, SRC + 'base.png');
  const r = await pl('POST', '/estimate-skeleton', { image: { type: 'base64', base64: fs.readFileSync(SRC + 'base.png').toString('base64'), format: 'png' } });
  fs.writeFileSync(SRC + 'base_skeleton.json', JSON.stringify(r.keypoints, null, 1));
  console.log(`${ch.name}: skeleton estimated (${r.keypoints.length} points)`);
  run('rig-pose.mjs', DIR, `pixel art character, side view facing right: ${ch.look}`);
} else {
  const k = Number(arg), frames = JSON.parse(fs.readFileSync(SRC + 'apose.json', 'utf8'));
  if (!Number.isInteger(k) || k < 0 || k >= frames.length || !fs.existsSync(`${SRC}apose_${k}.png`)) throw new Error(`no A-pose ${arg}: pick 0..${frames.length - 1}`);
  // apose.json keypoints are px of the base drawing (rig-pose.mjs); cut-rig wants them as fractions of the image
  const [W, H] = execFileSync('magick', ['identify', '-format', '%w %h', SRC + 'base.png']).toString().split(' ').map(Number);
  const frame = frames[k];
  fs.copyFileSync(`${SRC}apose_${k}.png`, SRC + 'rigsrc.png');
  fs.writeFileSync(SRC + 'rigsrc_skeleton.json', JSON.stringify(frame.keypoints.map(p => ({ label: p.label, x: p.x / W, y: p.y / H, z_index: 0 })), null, 1));
  run('cut-rig.mjs', DIR, 'rigsrc');
}
