#!/bin/bash
# Sarge's aim frames redone from his empty-handed pose (public/art/anim/c9_plain.png) with a pistol, like the rest of
# the cast, so the game can erase it and put the selected weapon in his hands.
set -e
cd "$(dirname "$0")/.."
A=public/art/anim GUN="small black pistol"
[ -f $A/c9_draw_4.png ] || node scripts/animate.mjs $A/c9_plain.png $A/c9_draw "raises the $GUN and aims it straight ahead at arm's length with both hands, side view facing right, legs still" 4
[ -f $A/c9_sweep_12.png ] || node scripts/animate.mjs $A/c9_draw_4.png $A/c9_sweep "keeps the arm straight and slowly rotates the aimed $GUN upward until pointing straight up at the sky, then rotates it all the way down until pointing straight down at the ground, legs and body still, side view facing right" 12 &
[ -f $A/c9_lower_8.png ] || node scripts/animate.mjs $A/c9_draw_4.png $A/c9_lower "keeps the arm straight and slowly lowers the aimed $GUN, rotating it down until it points straight down at the ground, legs and body still, side view facing right" 8 &
wait
echo "=== sarge aims done"
