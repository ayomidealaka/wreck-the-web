#!/bin/bash
# Fighting stance (idle) + driven run for one character, skeleton-posed. usage: scripts/art/build-moves.sh <n>
set -e
cd "$(dirname "$0")/.."
i=$1; S=public/art/skel
DESC=$(node -e "const l=require('./public/art/candidates/list.json'); console.log(l[$i-1].desc + ', holding a ' + (process.env.WEAPON || 'small black pistol') + ' forward with both hands')")
[ -f $S/c${i}_stance_7.png ] || node scripts/skeleton-anim.mjs c$i stance "$DESC"
[ -f $S/c${i}_drive_7.png ] || node scripts/skeleton-anim.mjs c$i drive "$DESC"
echo "=== c$i moves done"
