#!/bin/bash
# Commando-sheet jump ("leap") for one character, skeleton-posed. usage: scripts/art/build-leap.sh <n>
set -e
cd "$(dirname "$0")/.."
i=$1; S=public/art/skel
DESC=$(node -e "const l=require('./public/art/candidates/list.json'); console.log(l[$i-1].desc + ', holding a ' + (process.env.WEAPON || 'small black pistol') + ' forward with both hands')")
[ -f $S/c${i}_leap_5.png ] || node scripts/skeleton-anim.mjs c$i leap "$DESC"
node scripts/clean-frames.mjs c${i}_leap skel
echo "=== c$i leap done"
