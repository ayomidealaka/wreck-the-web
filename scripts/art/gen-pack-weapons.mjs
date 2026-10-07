// Weapons redrawn in a style pack's art style (PixelLab Pro Flash, styled on a weapon from the pack's reference art),
// at the pack character's detail level. The game shows them only when that pack's character is played.
// Saves <pack>/weapons/<id>_<seed>.png. usage: node scripts/art/gen-pack-weapons.mjs public/art/packs/test <seed> <id> ...
import { pl, savePng, balance } from './pixellab.mjs';
import fs from 'node:fs';
const [PACK, seedArg, ...ids] = process.argv.slice(2);
const OUT = `${PACK}/weapons/`; fs.mkdirSync(OUT, { recursive: true });
const style = fs.readFileSync(`${PACK}/src/style_gun.png`).toString('base64');
const BASE = 'single weapon game sprite, side view, pointing right, horizontal, the whole weapon in frame with empty space around it, '
  + 'no hands, no person, detailed pixel art with dark outlines and rich shading, transparent background';
export const ITEMS = {
  blaster: 'compact sci-fi energy pistol, dark gunmetal body, glowing cyan energy cell, short barrel, pistol grip and trigger',
  ak47: 'AK-47 assault rifle, black steel receiver and long barrel with front sight, curved banana magazine, warm brown wooden stock and handguard',
  minigun: 'heavy six-barrel rotary minigun, dark steel barrel cluster, carry handle on top, rear pistol grip, yellow ammo belt box underneath',
  scatter: 'pump-action combat shotgun, dark steel barrel over a tube magazine, wooden pump grip, wooden stock',
  sniper: 'long .50 calibre anti-materiel sniper rifle, very long black barrel with big muzzle brake, large scope on top, folded bipod, matte black and tan',
  launcher: 'six-shot revolver grenade launcher, fat rotating cylinder drum, short wide barrel, folding stock, olive drab and black',
  rocket: 'shoulder-fired rocket launcher tube, olive green, front and rear grips with trigger, small optical sight, rocket warhead tip at the front',
  flamer: 'flamethrower gun, yellow and black body, long metal nozzle with pilot light, grip and trigger, small red fuel canister underneath',
  laser: 'futuristic laser rifle, sleek dark purple and black body, glowing magenta energy core and lens at the barrel tip, grip and trigger',
  well: 'experimental gravity gun, chunky dark metal launcher, swirling violet black-hole orb held in a ring at the front, glowing purple coils',
  nuke: 'portable mini-nuke catapult launcher, heavy olive launcher tube with a fat round bomb warhead with tail fins loaded at the front, yellow and black hazard stripes',
  drone: 'quadcopter combat drone seen from the side, dark grey armoured body, two rotor arms with propellers on top, glowing red sensor eye at the front, a small round turret mount underneath, NO gun',
  dronegun: 'compact six-barrel rotary gatling gun turret, dark steel barrel cluster pointing right, small round swivel mount at the left end',
  jet: 'small military fighter jet, the WHOLE aircraft from nose to tail fits inside the frame with a wide empty margin on every side, in level flight seen exactly from the side, nose pointing right, grey camouflage, swept wings, cockpit canopy, tail fin, engine exhaust nozzle at the back, bombs under the wings',
  bomb: 'single 500 lb aerial bomb seen from the side, nose pointing right, olive drab streamlined body, yellow band near the nose, tail fins at the back',
  jetpack: 'compact jetpack backpack seen from the side, two metal thruster tanks with nozzles at the bottom, straps, grey and orange, upright',
};
const seed = +seedArg;
console.log('credits before', await balance());
for (const id of ids) {
  const job = await pl('POST', '/create-image-pro-flash', {
    description: `${BASE}, ${ITEMS[id]}`, image_size: { width: 128, height: id === 'jetpack' || id === 'drone' ? 128 : 96 }, no_background: true, seed,
    style_image: { image: { type: 'base64', base64: style, format: 'png' }, size: { width: 104, height: 88 }, usage_description: 'match the art style of this weapon: outlines, shading, detail and colour treatment (not its shape)' },
    style_options: { color_palette: false, outline: true, detail: true, shading: true },
  });
  let st;
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`${id}: ${st.status}`, JSON.stringify(st.last_response || st).slice(0, 300)); continue; }
  const im = (st.last_response.images || [st.last_response.image])[0];
  savePng(im.base64 || im, `${OUT}${id}_${seed}.png`);
  console.log(`${id}: saved`, JSON.stringify(st.last_response.usage || st.usage || {}));
}
console.log('credits after', await balance());
