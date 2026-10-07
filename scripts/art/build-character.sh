#!/bin/bash
# Full pipeline for one character from its candidate sprite: aim poses, skeleton run/jump, stance, driven run,
# commando leap, arm skeletons, cleanup. usage: WEAPON="assault rifle" scripts/art/build-character.sh <n>
set -e
cd "$(dirname "$0")/.."
i=$1
scripts/build-cast.sh $i
node scripts/clean-frames.mjs c${i}_ anim
scripts/build-skel.sh $i
scripts/build-moves.sh $i
scripts/build-leap.sh $i
node scripts/clean-frames.mjs c${i}_ skel
echo "=== c$i character done"
