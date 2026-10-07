#!/bin/bash
# Skeleton-driven run + jump for one character: pad its aim-forward frame to 128x128, estimate the skeleton,
# then generate the hand-designed run cycle and jump poses. Skips work already done. usage: scripts/art/build-skel.sh <n>
set -e
cd "$(dirname "$0")/.."
i=$1; S=public/art/skel; A=public/art/anim
DESC=$(node -e "const l=require('./public/art/candidates/list.json'); console.log(l[$i-1].desc + ', holding a ' + (process.env.WEAPON || 'small black pistol') + ' forward with both hands')")
src=$A/raw/c${i}_draw_4.png; [ -f $src ] || src=$A/c${i}_draw_4.png
[ -f $S/c${i}_first.png ] || magick $src -background none -gravity south -extent 128x128 $S/c${i}_first.png
[ -f $S/c${i}_first.json ] || node scripts/estimate-first.mjs c$i > /dev/null
[ -f $S/c${i}_run_7.png ] || node scripts/skeleton-anim.mjs c$i run "$DESC"
[ -f $S/c${i}_jump_5.png ] || node scripts/skeleton-anim.mjs c$i jump "$DESC"
echo "=== c$i done"
