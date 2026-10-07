// Weapon / gear sprites with PixelLab Pro (generate-image-v2), styled after a cast sprite so they match the characters.
// Saves every option to public/art/weapons/options/<id>_<k>.png. usage: node scripts/art/gen-weapons.mjs [id ...]
import { pl, savePng, balance, ROOT } from './pixellab.mjs';
import fs from 'node:fs';
const STYLE = 'pixel art game item sprite, side view, facing right, the whole item centered with an empty margin around it, muted realistic colours, detailed shading, gritty cinematic pixel art, transparent background, no text';
export const ITEMS = {
  uzi:     { size: [30, 22], desc: 'Uzi submachine gun, compact matte black steel body, short barrel, long straight magazine down through the pistol grip, folded wire stock at the back, cocking knob on top' },
  minigun: { size: [42, 24], desc: 'heavy rotary minigun, six spinning barrels, dark steel body, carry handle on top, yellow ammo belt drum underneath, rear grip' },
  scatter: { size: [42, 20], desc: 'pump-action combat shotgun, dark steel barrel and tube magazine, wooden pump grip and wooden stock' },
  laser:   { size: [42, 20], desc: 'futuristic laser rifle, sleek dark purple and black body, glowing magenta energy core and lens at the barrel tip, grip and trigger' },
  well:    { size: [42, 24], desc: 'experimental gravity gun, chunky dark metal launcher with a swirling violet black-hole orb held in a ring at the front, glowing purple coils' },
  rocket:  { size: [40, 20], desc: 'shoulder-fired rocket launcher, olive green metal tube with a grip, trigger and small sight, rocket tip visible at the front' },
  flamer:  { size: [40, 20], desc: 'flamethrower gun, metal nozzle with a pilot light, grip and trigger, short hose to a small red fuel canister' },
  drone:   { size: [40, 32], desc: 'small hovering combat drone with two spinning rotors on top and a rotary gatling gun mounted underneath, dark grey metal, red status light' },
  turret:  { size: [32, 32], desc: 'deployable sentry turret on a short metal tripod, compact gun barrel pointing right, ammo box on the side, dark grey and olive metal' },
  grenade: { size: [16, 16], desc: 'single round frag hand grenade, dark olive green body, silver spoon lever and pin ring on top' },
  ak47:     { size: [42, 18], desc: 'AK-47 assault rifle, black steel receiver and long barrel, curved banana magazine underneath, warm brown wooden stock, grip and handguard' },
  sniper:   { size: [42, 16], desc: 'heavy .50 calibre anti-materiel sniper rifle, very long black barrel with a big muzzle brake, large scope on top, bipod folded under the barrel, matte black and dark tan' },
  launcher: { size: [40, 20], desc: 'six-shot 40mm revolver grenade launcher, fat rotating cylinder drum in the middle, short wide barrel, folding stock, olive drab and black metal' },
  designator: { size: [32, 20], desc: 'military laser target designator, chunky handheld binocular-like device with a red laser lens at the front, pistol grip, antenna, olive and black' },
  nuke:     { size: [42, 22], desc: 'portable mini nuke launcher, heavy catapult launcher tube with a fat round bomb warhead with tail fins loaded at the front, yellow and black radiation hazard stripes, olive metal' },
  bomb:     { size: [24, 16], desc: 'single aerial bomb falling, dark olive green streamlined body with tail fins, pointing right' },
  jet:      { size: [42, 16], desc: 'fighter jet in flight side view, grey military jet with swept wings and afterburner, pointing right' },
  warhead:  { size: [20, 16], desc: 'small round nuclear bomb shell with tail fins, yellow and black radiation stripes, pointing right' },
  mirv:    { size: [44, 24], desc: 'oversized cluster bomb launcher, absurdly fat dark steel tube with a hazard-striped cluster shell loaded at the front showing several small warhead tips, rear grip and shoulder rest' },
  star:    { size: [42, 22], desc: 'exotic particle cannon, dark metal body with a glowing cyan containment sphere in the middle, cooling fins, forward emitter dish, thick cables, grip and trigger' },
  jetpack: { size: [24, 32], desc: 'compact jetpack backpack, two metal thruster tanks side by side with nozzles at the bottom, straps, grey and orange' },
};
const style = { type: 'base64', base64: fs.readFileSync(`${ROOT}/public/art/candidates/c1.png`).toString('base64'), format: 'png' };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ITEMS);
await Promise.all(ids.map(async id => {
  const it = ITEMS[id];
  const job = await pl('POST', '/generate-image-v2', {
    description: `${STYLE}, ${it.desc}`, image_size: { width: it.size[0], height: it.size[1] }, no_background: true,
    style_image: { image: style, size: { width: 40, height: 52 } },
    style_options: { color_palette: true, outline: true, detail: true, shading: true },
  });
  let st;
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 5000)); st = await pl('GET', `/background-jobs/${job.background_job_id}`); if (!['processing', 'pending', 'queued'].includes(st.status)) break; }
  if (st.status !== 'completed') { console.log(`${id}: ${st.status} ${st.last_response?.error || ''}`); return; }
  const imgs = st.last_response.images || [];
  imgs.forEach((im, k) => savePng(im.base64 || im, `${ROOT}/public/art/weapons/options/${id}_${k}.png`));
  console.log(`${id}: ${imgs.length} options`, JSON.stringify(st.last_response.usage || st.usage));
}));
console.log('credits left', await balance());
