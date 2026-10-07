#!/bin/bash
# Two-handed long-gun aim frames per character (stock in the shoulder, rear hand on the grip, front hand under the
# barrel), for rifles, shotguns, the minigun etc. The generated rifle is replaced in game by the selected weapon.
# usage: scripts/art/build-rifle.sh 1 2 3 ...   (skips anything already saved)
set -e
cd "$(dirname "$0")/.."
A=public/art/anim R=public/art/rifle
HOLD="the stock pressed into the shoulder, rear hand on the pistol grip with the elbow bent down, front hand under the barrel with the other arm reaching forward"
for i in "$@"; do
  echo "=== rifle c$i"
  SRC=$A/c${i}_base.png; [ -f $A/c${i}_plain.png ] && SRC=$A/c${i}_plain.png
  [ -f $R/c${i}_rdraw_4.png ] || node scripts/animate.mjs $SRC $R/c${i}_rdraw "raises a black assault rifle and holds it with both hands at shoulder height, $HOLD, aiming straight ahead, side view facing right, legs still" 4
  [ -f $R/c${i}_rsweep_12.png ] || node scripts/animate.mjs $R/c${i}_rdraw_4.png $R/c${i}_rsweep "keeps the assault rifle held the same way with both hands, $HOLD, and slowly tilts it upward until aiming steeply up at the sky, then tilts it all the way down until aiming down at the ground, legs still, side view facing right" 12
  [ -f $R/c${i}_rlower_8.png ] || node scripts/animate.mjs $R/c${i}_rdraw_4.png $R/c${i}_rlower "keeps the assault rifle held the same way with both hands and slowly lowers the aim until the rifle points down at the ground in front of the feet, legs still, side view facing right" 8
done
echo "=== rifle done $*"
