#!/bin/sh
# Copies the models and sounds the game uses from the downloaded packs into public/assets.
# Usage: scripts/import-assets.sh ~/Desktop/projects/lcs-assets
# Models: Kenney (CC0). Sounds: Snake's Authentic Gun Sounds 1 & 2 (free, commercial use, no credit
# required), trimmed and compressed to AAC (.m4a). See ASSETS.md for what came from where.
set -eu
SRC="$1"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/assets"
mkdir -p "$OUT/models" "$OUT/sounds"

NAT="$SRC/kenney_nature-kit/Models/GLTF format"
for m in tree_oak tree_detailed tree_default tree_fat tree_tall tree_pineDefaultA tree_pineRoundC tree_cone_dark \
         plant_bushLarge plant_bushDetailed plant_bush rock_largeA rock_largeC rock_tallB stump_round log_stack \
         crops_cornStageD crops_wheatStageB flower_redA flower_yellowB grass_large fence_simple fence_planks; do
  [ -f "$NAT/$m.glb" ] && cp "$NAT/$m.glb" "$OUT/models/$m.glb"
done

SUB="$SRC/kenney_cityKitSuburban/Models/GLTF format"
for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21; do
  cp "$SUB/house_type$i.glb" "$OUT/models/house_type$i.glb"
done
# Suburban glTFs reference a shared texture next to them.
for t in "$SUB"/Textures/* "$SUB"/*.png; do [ -f "$t" ] && cp "$t" "$OUT/models/" || true; done

SUR="$SRC/kenney_survival-kit/Models/GLB format"
for m in box-large barrel tent-canvas signpost workbench; do cp "$SUR/$m.glb" "$OUT/models/$m.glb"; done
[ -d "$SUR/Textures" ] && cp -R "$SUR/Textures" "$OUT/models/" || true

S1="$SRC/Snake's Authentic Gun Sounds"
S2="$SRC/Snake's SECOND Authentic Gun Sounds"
enc() { ffmpeg -loglevel error -y -i "$1" -t "$3" -af "afade=t=out:st=$(echo "$3 - 0.3" | bc | sed "s|^\.|0.|"):d=0.3" -ac 2 -c:a aac -b:a 128k "$OUT/sounds/$2.m4a"; }
enc "$S2/Full Sounds/9mm/WAV/9mm Single.wav" pistol 1.4
enc "$S1/Full Sound/5.56/WAV/556 Single WAV.wav" smg 1.1
enc "$S2/Full Sounds/20 Gauge/WAV/20 Gauge Single.wav" shotgun 1.8
enc "$S1/Full Sound/7.62x39/WAV/762x39 Single WAV.wav" rifle 1.4
enc "$S1/Full Sound/7.62x54R/WAV/762x54r Single WAV.wav" sniper 2.0
enc "$S1/Reloads, Cycling & More/WAV/Pump Reload Full WAV.wav" pump 1.2
enc "$S1/Reloads, Cycling & More/WAV/Mosin Bolt Cycle WAV.wav" bolt 1.4
enc "$S1/Reloads, Cycling & More/WAV/AR Reload Full WAV.wav" reload 2.2
echo "imported into $OUT"
