#!/bin/bash
# Empty-handed two-hand grip aim frames (draw, sweep, lower) per character, so the game can put any weapon in the
# hands instead of drawing it over the character's own pistol. Skips anything already saved.
# usage: scripts/art/build-grip.sh 1 2 3 ...
set -e
cd "$(dirname "$0")/.."
A=public/art/anim H=public/art/held
GRIP="both empty hands held together in a two-handed grip as if holding an invisible rifle, nothing in the hands"
for i in "$@"; do
  echo "=== grip c$i"
  # from the empty-handed base pose (FROM=draw starts from the pistol pose instead, which worked for c1)
  SRC=$A/c${i}_base.png AWAY="raises both empty hands"
  [ "${FROM:-base}" = draw ] && SRC=$A/c${i}_draw_4.png AWAY="puts the pistol away into the pocket, then holds both empty hands"
  [ "$i" = 9 ] && AWAY="drops the rifle to the ground, then raises both empty hands"
  [ -f $H/c${i}_grip_draw_4.png ] || node scripts/animate.mjs $SRC $H/c${i}_grip_draw "$AWAY both empty hands out in front at chest height, one hand slightly ahead of the other, as if gripping an invisible rifle, arms straight ahead, nothing in the hands, side view facing right, legs still" 4
  [ -f $H/c${i}_grip_sweep_12.png ] || node scripts/animate.mjs $H/c${i}_grip_draw_4.png $H/c${i}_grip_sweep "keeps $GRIP, and slowly rotates the arms upward until pointing straight up at the sky, then rotates them all the way down until pointing straight down at the ground, legs and body still, side view facing right" 12
  [ -f $H/c${i}_grip_lower_8.png ] || node scripts/animate.mjs $H/c${i}_grip_draw_4.png $H/c${i}_grip_lower "keeps $GRIP, and slowly lowers the arms, rotating them down until pointing straight down at the ground, legs and body still, side view facing right" 8
done
echo "=== grip done $*"
