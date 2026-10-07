#!/bin/bash
# Generates every animation a character needs (PixelLab). Skips anything already saved, so it can be re-run.
# usage: scripts/art/build-cast.sh 1 2 3 ...   (run one process per character to generate in parallel)
set -e
cd "$(dirname "$0")/.."
A=public/art/anim
CLOTH="clothes, coat tails and hair moving naturally with the motion"
GUN="${WEAPON:-small black pistol}"
for i in "$@"; do
  echo "=== character c$i"
  [ -f $A/c${i}_base.png ] || magick public/art/candidates/c$i.png -background none -gravity south -extent 64x76 $A/c${i}_base.png
  [ -f $A/c${i}_draw_4.png ] || node scripts/animate.mjs $A/c${i}_base.png $A/c${i}_draw "raises the $GUN and aims it straight ahead at arm's length with both hands, side view facing right, legs still" 4
  [ -f $A/c${i}_sweep_12.png ] || node scripts/animate.mjs $A/c${i}_draw_4.png $A/c${i}_sweep "keeps the arm straight and slowly rotates the aimed $GUN upward until pointing straight up at the sky, then rotates it all the way down until pointing straight down at the ground, legs and body still, side view facing right" 12
  [ -f $A/c${i}_lower_8.png ] || node scripts/animate.mjs $A/c${i}_draw_4.png $A/c${i}_lower "keeps the arm straight and slowly lowers the aimed $GUN, rotating it down until it points straight down at the ground, legs and body still, side view facing right" 8
  [ -f $A/c${i}_run_8.png ] || node scripts/animate.mjs $A/c${i}_base.png $A/c${i}_run "running to the right, side view, arms pumping, $CLOTH" 8
  [ -f $A/c${i}_cloop_8.png ] || node scripts/animate.mjs $A/c${i}_run_6.png $A/c${i}_cloop "running in place, one full running stride cycle, seamless loop, side view facing right, $CLOTH, coat and jacket hems swinging with each stride" 8 $A/c${i}_run_6.png
  [ -f $A/c${i}_idle_8.png ] || node scripts/animate.mjs $A/c${i}_draw_4.png $A/c${i}_idle "standing still and aiming the $GUN forward, breathing gently, hair and clothes swaying slightly in a light breeze, seamless loop" 8 $A/c${i}_draw_4.png
  [ -f $A/c${i}_jump_8.png ] || node scripts/animate.mjs $A/c${i}_draw_4.png $A/c${i}_jump "crouches then jumps straight up high and lands, keeping the $GUN aimed forward, $CLOTH, coat flaring up while falling" 8
done
echo "=== all done $*"
