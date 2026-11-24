import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BUILDINGS, DISTRICTS, MAP, MARKET_SQUARE, PLACE_TIER, SIZE, STADIUM, TILE, tileHash, WORLD } from '../sim/constants';

import { chunkedInstances } from './chunks';
import { routeDistance } from './roads';

import type { ChunkedKind, ChunkView, InstanceData } from './chunks';

/**
 * Procedural nature, built in code (no asset pack): a painted terrain with soft transitions,
 * swaying grass blades, trees, bushes and rocks with irregular silhouettes. Everything that
 * sways shares one wind clock; tree canopies dither away around you so trees never hide you.
 */

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

const lattice = (x: number, y: number) => tileHash(x, y, 9);
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise in 0..1. */
const noise2 = (x: number, y: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = lattice(x0, y0);
  const b = lattice(x0 + 1, y0);
  const c = lattice(x0, y0 + 1);
  const d = lattice(x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const fbm = (x: number, y: number, oct = 4) => {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
};
/** A repeatable 3D jitter for displacing vertices (duplicated vertices move together). */
const jitter3 = (x: number, y: number, z: number, k: number) => {
  const s = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + k * 11.13) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

const insideBuilding = (tx: number, ty: number) => BUILDINGS.some((b) => tx >= b.x0 && ty >= b.y0 && tx < b.x0 + b.w && ty < b.y0 + b.h);

/** Per-tile weight grids, sampled bilinearly so the edges between ground types are soft. */
const weightGrid = (test: (t: string, tx: number, ty: number) => boolean) => {
  const g = new Float32Array(SIZE * SIZE);
  for (let ty = 0; ty < SIZE; ty++) for (let tx = 0; tx < SIZE; tx++) g[ty * SIZE + tx] = test(MAP[ty][tx], tx, ty) ? 1 : 0;
  return g;
};
const sampleGrid = (g: Float32Array, x: number, y: number) => {
  // x, y in tiles; tile centres sit at +0.5.
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.max(0, Math.min(SIZE - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(SIZE - 1, Math.floor(fy)));
  const x1 = Math.min(SIZE - 1, x0 + 1);
  const y1 = Math.min(SIZE - 1, y0 + 1);
  const ax = Math.max(0, Math.min(1, fx - x0));
  const ay = Math.max(0, Math.min(1, fy - y0));
  const a = g[y0 * SIZE + x0] + (g[y0 * SIZE + x1] - g[y0 * SIZE + x0]) * ax;
  const b = g[y1 * SIZE + x0] + (g[y1 * SIZE + x1] - g[y1 * SIZE + x0]) * ax;
  return a + (b - a) * ay;
};
const sstep = (a: number, b: number, v: number) => smooth(Math.max(0, Math.min(1, (v - a) / (b - a))));
const mix = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The ground texture: 4.4 px per metre (roads and paths are geometry), meadow greens with dry patches, soft dirt, mud. */

/** Tiles within 2 of a building's footprint (the trodden yards: no lawn tufts, packed earth in the places). */
const NEAR_BUILDING = (() => {
  const a = new Uint8Array(SIZE * SIZE);
  for (const b of BUILDINGS) for (let y = b.y0 - 2; y < b.y0 + b.h + 2; y++) for (let x = b.x0 - 2; x < b.x0 + b.w + 2; x++) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) a[y * SIZE + x] = 1;
  return a;
})();
/** The loot tier of the named place a tile is in (0 = out in the fields). */
const placeTierAt = (tx: number, ty: number) => {
  let t = 0;
  const x = tx * TILE + 1;
  const y = ty * TILE + 1;
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) t = Math.max(t, PLACE_TIER[d.name] ?? 1);
  return t;
};
const inStadium = (tx: number, ty: number) => tx >= STADIUM.x0 && tx < STADIUM.x0 + STADIUM.w && ty >= STADIUM.y0 && ty < STADIUM.y0 + STADIUM.h;
/** A wall within 2 tiles on two opposite sides: an alley between houses. */
const alleyAt = (tx: number, ty: number) => {
  const wall = (x: number, y: number) => '#w'.includes(MAP[y]?.[x] ?? '');
  const near = (dx: number, dy: number) => [1, 2].some((k) => wall(tx + dx * k, ty + dy * k));
  return (near(-1, 0) && near(1, 0)) || (near(0, -1) && near(0, 1));
};

export const paintTerrain = () => {
  const px = 4.4; // 1056 px across, as before (6 px a metre over the old 176 m)
  const n = WORLD * px;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  const path = weightGrid((t) => t === 'p');
  // Paving runs on under what is parked on it (cars at the truck stop, the containers in the yard).
  const paved = (tx: number, ty: number) => MAP[ty]?.[tx] === 'a';
  const road = weightGrid((t, tx, ty) => t === 'a' || ((t === 'v' || t === 's' || t === 'r') && (paved(tx - 1, ty) || paved(tx + 1, ty) || paved(tx, ty - 1) || paved(tx, ty + 1) || paved(tx - 2, ty) || paved(tx + 3, ty))));
  const soil = weightGrid((t) => t === 'c');
  const gravel = weightGrid((t) => t === 'k');
  const pond = weightGrid((t) => t === 'o' || t === 'd');
  const meadow = weightGrid((t) => t === 'h');
  const floor = weightGrid((t, tx, ty) => '.lwr#u'.includes(t) && insideBuilding(tx, ty));
  // Yards in the places: packed earth near the houses (CD spec map-balance-grass-stadium, 3), more in the alleys.
  const yard = weightGrid((t, tx, ty) => t === 'g' && NEAR_BUILDING[ty * SIZE + tx] === 1 && placeTierAt(tx, ty) > 0 && !inStadium(tx, ty));
  const alley = weightGrid((t, tx, ty) => t === 'g' && NEAR_BUILDING[ty * SIZE + tx] === 1 && placeTierAt(tx, ty) > 0 && alleyAt(tx, ty));
  const EARTH = [138, 118, 86];
  const GRASS_A = [62, 112, 42];
  const GRASS_B = [98, 146, 58];
  const DRY = [146, 150, 74];
  const DIRT = [132, 102, 68];
  const DIRT_DARK = [104, 80, 54];
  const ASPHALT = [128, 116, 98];
  const SOIL = [96, 72, 46];
  const GRAVEL = [128, 124, 116];
  const WOOD = [170, 128, 86];
  for (let py = 0; py < n; py++) {
    const wy = py / px;
    const ty = wy / TILE;
    for (let pxx = 0; pxx < n; pxx++) {
      const wx = pxx / px;
      const tx = wx / TILE;
      // Meadow: two greens over large soft patches, dry yellowish spots, fine grain.
      const big = fbm(wx * 0.045, wy * 0.045, 4);
      const fine = noise2(wx * 1.7, wy * 1.7);
      let col = mix(GRASS_A, GRASS_B, sstep(0.3, 0.75, big));
      col = mix(col, DRY, sstep(0.62, 0.85, fbm(wx * 0.08 + 40, wy * 0.08 + 13, 3)) * 0.55);
      const grain = (fine - 0.5) * 18;
      col = [col[0] + grain, col[1] + grain, col[2] + grain * 0.6];

      const e = (fbm(wx * 0.6, wy * 0.6, 2) - 0.5) * 0.35; // wobble the edges
      const wSoil = sstep(0.45, 0.6, sampleGrid(soil, tx, ty) + e);
      if (wSoil > 0) {
        const rows = 0.5 + 0.5 * Math.sin(wx * 4.2); // furrows
        col = mix(col, mix(SOIL, DIRT_DARK, rows * 0.6), wSoil);
      }
      // The pond bed: dark mud under the water surface (props.ts), a muddy bank around it.
      const wPond = sstep(0.2, 0.55, sampleGrid(pond, tx, ty) + e * 0.5);
      if (wPond > 0) col = mix(col, mix([92, 84, 58], [38, 52, 48], sstep(0.5, 0.9, sampleGrid(pond, tx, ty))), wPond);
      const wTall = sstep(0.35, 0.65, sampleGrid(meadow, tx, ty) + e);
      if (wTall > 0) col = mix(col, [118, 128, 62], wTall * 0.7);
      const wGravel = sstep(0.3, 0.6, sampleGrid(gravel, tx, ty) + e);
      if (wGravel > 0) col = mix(col, mix(GRAVEL, DIRT, fine * 0.6), wGravel * 0.85);
      const wPath = sstep(0.4, 0.5, sampleGrid(path, tx, ty) + e);
      if (wPath > 0) col = mix(col, mix(DIRT, DIRT_DARK, fbm(wx * 0.9, wy * 0.9, 2)), wPath);
      const wYard = sstep(0.35, 0.65, sampleGrid(yard, tx, ty) + e);
      if (wYard > 0) col = mix(col, EARTH, wYard * 0.45 + sstep(0.35, 0.65, sampleGrid(alley, tx, ty) + e) * 0.2);
      // The Pitch: mown stripes and worn white lines; a cinder track; concrete at the gates and the tunnel.
      if (inStadium(Math.floor(tx), Math.floor(ty)) || (tx >= 62 && tx < 63 && ty >= 72 && ty < 76)) {
        const t0 = MAP[Math.floor(ty)][Math.floor(tx)];
        const pq = STADIUM.pitch;
        const px0 = pq.x0 * TILE;
        const px1 = (pq.x0 + pq.w) * TILE;
        const py0 = pq.y0 * TILE;
        const py1 = (pq.y0 + pq.h) * TILE;
        if (wx >= px0 && wx < px1 && wy >= py0 && wy < py1) {
          col = Math.floor((wy - py0) / 2) % 2 === 0 ? [95, 174, 62] : [79, 154, 53];
          col = [col[0] + grain * 0.4, col[1] + grain * 0.4, col[2] + grain * 0.3];
          const cx = (px0 + px1) / 2;
          const cy = (py0 + py1) / 2;
          const lw = 0.06;
          const gap = tileHash(Math.floor(wx / 3), Math.floor(wy / 3), 9) < 0.12;
          const onLine =
            Math.abs(wx - (px0 + 0.3)) < lw || Math.abs(wx - (px1 - 0.3)) < lw ||
            ((Math.abs(wy - (py0 + 0.3)) < lw || Math.abs(wy - (py1 - 0.3)) < lw) && wx > px0 + 0.3 && wx < px1 - 0.3) ||
            (Math.abs(wy - cy) < lw && wx > px0 + 0.3 && wx < px1 - 0.3) ||
            Math.abs(Math.hypot(wx - cx, wy - cy) - 2) < lw ||
            (Math.abs(wx - cx) <= 2 && (Math.abs(wy - (py0 + 1.9)) < lw || Math.abs(wy - (py1 - 1.9)) < lw)) ||
            (Math.abs(Math.abs(wx - cx) - 2) < lw && (wy > py0 + 0.3 && wy < py0 + 1.9 || wy < py1 - 0.3 && wy > py1 - 1.9)) ||
            Math.hypot(wx - cx, wy - (py0 + 3)) < 0.125 || Math.hypot(wx - cx, wy - (py1 - 3)) < 0.125;
          if (onLine && !gap) col = mix(col, [236, 232, 218], 0.85);
        } else if (t0 === 'p') col = mix([154, 91, 69], [125, 72, 54], fbm(wx * 0.9, wy * 0.9, 2));
        else if (t0 === 'a' || t0 === 'v' || t0 === 'f') col = [184 + grain * 0.4, 178 + grain * 0.4, 166 + grain * 0.4];
      }
      // Under the road strip (roads.ts): packed gravel, which shows only as a soft shoulder.
      const wRoad = sstep(0.3, 0.6, sampleGrid(road, tx, ty) + e);
      if (wRoad > 0) col = mix(col, [ASPHALT[0] + grain * 0.5, ASPHALT[1] + grain * 0.5, ASPHALT[2] + grain * 0.5], wRoad);
      // The Market Square's kerb: one tile of darker paving round its outline, left open where Route 1 comes in and goes out.
      {
        const q = MARKET_SQUARE;
        if (tx >= q.x0 && tx < q.x0 + q.w && ty >= q.y0 && ty < q.y0 + q.h) {
          const ring = tx < q.x0 + 1 || tx >= q.x0 + q.w - 1 || ty < q.y0 + 1 || ty >= q.y0 + q.h - 1;
          const roadGap = tx >= 60 && tx < 62 && (ty < q.y0 + 1 || ty >= q.y0 + q.h - 1);
          if (ring && !roadGap) col = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
        }
      }
      // Floors inside buildings: hard-edged planks.
      const ftx = Math.floor(tx);
      const fty = Math.floor(ty);
      if (floor[fty * SIZE + ftx] > 0) {
        const plank = Math.floor(wy * 3.3);
        const shade = (tileHash(plank, Math.floor((wx + plank * 0.7) / 2.4), 5) - 0.5) * 22;
        const seam = (wy * 3.3) % 1 < 0.06 ? -26 : 0;
        col = [WOOD[0] + shade + seam + grain * 0.3, WOOD[1] + shade * 0.8 + seam + grain * 0.3, WOOD[2] + shade * 0.6 + seam];
      }
      const o = (py * n + pxx) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// ---------------------------------------------------------------------------
// Shared wind and the canopy cut-out around you
// ---------------------------------------------------------------------------

/** Up to 10 people on the ground (x, z, 1 if present) that grass and bushes bend away from. */
const PEOPLE = 10;
export const natureUniforms = {
  uPeople: { value: Array.from({ length: PEOPLE }, () => new THREE.Vector3()) },
  uTime: { value: 0 },
  uFocus: { value: new THREE.Vector3() },
  uFade: { value: 0 },
  /** Shoulder-camera foliage fade: camera position, chest position, 1 when active (see `setFoliageFade`). */
  uLens: { value: new THREE.Vector3() },
  uChest: { value: new THREE.Vector3() },
  uLensOn: { value: 0 },
  /** The view's reach scale (per quality tier): grass and tall grass shrink away at `reach x uReach` metres. */
  uReach: { value: 1 },
};

/** Crown fade rule (C4): leaves within 3 m of the lens, or within 1 m of the lens-to-chest segment, thin to 25 %. */
export const FOLIAGE_FADE = { nearM: 3, nearSoftM: 0.6, segM: 1, segSoftM: 0.6, minAlpha: 0.25, minY: 0.0 } as const;
/** CPU mirror of the shader's crown fade (the shader also skips brown trunk faces: vColor.g < vColor.r): opacity (0.25..1) of a leaf at `p` for lens `cam` and `chest`. */
export const foliageAlpha = (p: [number, number, number], cam: [number, number, number], chest: [number, number, number]) => {
  const F = FOLIAGE_FADE;
  if (p[1] <= F.minY) return 1;
  const ab = [chest[0] - cam[0], chest[1] - cam[1], chest[2] - cam[2]];
  const ap = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = len2 > 1e-6 ? Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2)) : 0;
  const ds = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  const dc = Math.hypot(ap[0], ap[1], ap[2]);
  const k = Math.max(1 - sstep(F.nearM, F.nearM + F.nearSoftM, dc), 1 - sstep(F.segM, F.segM + F.segSoftM, ds));
  return 1 + (F.minAlpha - 1) * k;
};

/** How far (m, at reach scale 1) the lawn's tufts and the tall grass are drawn. */
export const GRASS_REACH = 70;
export const TALL_GRASS_REACH = 150;

/**
 * Adds wind sway (bigger the higher above `pivot` a vertex is) and, for canopies, a dithered
 * cut-out within `uFade` metres of the player above 2.2 m, so you can always see your fighter.
 */
const windy = (m: THREE.MeshStandardMaterial, amount: number, pivot: number, cutout: boolean, bend = 0, reach = 0, lensFade = cutout) => {
  // Blades (reach > 0: the grasses) are single triangles drawn from both sides, lit from above on either side.
  const blades = reach > 0;
  if (blades) m.side = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    if (blades) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    Object.assign(sh.uniforms, natureUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uReach;\nuniform vec3 uPeople[${PEOPLE}];\nvarying vec3 vWorld;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 base = vec3(0.0);
        #ifdef USE_INSTANCING
          base = instanceMatrix[3].xyz;
        #endif
        ${reach > 0 ? `// Small things shrink into the ground towards the edge of their reach (the chunks beyond it are not drawn).
        float reach = ${reach.toFixed(1)} * uReach;
        transformed *= smoothstep(reach, reach * 0.7, distance(base, cameraPosition));` : ''}
        float bend = max(0.0, transformed.y - ${pivot.toFixed(2)});
        float ph = base.x * 0.37 + base.z * 0.29;
        float gust = 0.6 + 0.4 * sin(uTime * 0.7 + base.x * 0.05);
        transformed.x += sin(uTime * 1.9 + ph) * ${amount.toFixed(3)} * bend * gust;
        transformed.z += cos(uTime * 1.5 + ph * 1.3) * ${(amount * 0.7).toFixed(3)} * bend * gust;
        // Pushed aside by anyone walking through: bend away from them, more at the tips.
        ${bend > 0 ? `for (int i = 0; i < ${PEOPLE}; i++) {
          vec3 pp = uPeople[i];
          if (pp.z < 0.5) continue;
          vec2 d = base.xz - pp.xy;
          float dl = length(d);
          float k = smoothstep(${(bend * 1.6).toFixed(2)}, 0.0, dl);
          vec2 dir = dl > 0.001 ? d / dl : vec2(1.0, 0.0);
          transformed.xz += dir * k * bend * ${bend.toFixed(2)} * 1.4;
          transformed.y -= k * bend * 0.35;
        }` : ''}`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWorld = (modelMatrix * wp).xyz;`,
      );
    const F = FOLIAGE_FADE;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFocus;\nuniform float uFade;\nuniform vec3 uLens;\nuniform vec3 uChest;\nuniform float uLensOn;\nvarying vec3 vWorld;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
${cutout ? `          if (uFade > 0.0 && vWorld.y > 2.2) {
            float d = distance(vWorld.xz, uFocus.xz) / uFade;
            if (d < 1.0) {
              vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
              float bayer = mod(q.x * 2.0 + q.y * 3.0 + q.x * q.y, 4.0) / 4.0 + 0.1;
              if (bayer > d * d * 1.2) discard;
            }
          }` : ''}
${lensFade ? `          if (uLensOn > 0.5 && vWorld.y > ${F.minY.toFixed(1)} && vColor.g >= vColor.r) {
            // Camera-to-chest rule, leaf faces only (mirrors foliageAlpha in nature.ts): thin to minAlpha with a screen-space alpha hash.
            vec3 ab = uChest - uLens;
            vec3 ap = vWorld - uLens;
            float tt = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
            float fk = max(1.0 - smoothstep(${F.nearM.toFixed(1)}, ${(F.nearM + F.nearSoftM).toFixed(1)}, length(ap)),
                           1.0 - smoothstep(${F.segM.toFixed(1)}, ${(F.segM + F.segSoftM).toFixed(1)}, length(ap - ab * tt)));
            float fa = mix(1.0, ${F.minAlpha.toFixed(2)}, fk);
            float hash = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (hash > fa) discard;
          }` : ''}`
      );
  };
  m.customProgramCacheKey = () => `windy-${amount}-${pivot}-${cutout}-${reach}-${lensFade}`;
  return m;
};

// ---------------------------------------------------------------------------
// Geometry helpers: non-indexed pieces with a per-face colour, merged into one mesh
// ---------------------------------------------------------------------------

type Shade = (x: number, y: number, z: number, face: number) => THREE.Color;

const piece = (geo: THREE.BufferGeometry, shade: Shade, displace?: (v: THREE.Vector3) => void) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  if (displace) {
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      displace(v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const c = shade(cx, cy, cz, i / 3);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
};

const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, Math.max(0, Math.min(1, l)), THREE.SRGBColorSpace);

/** A lumpy blob: an icosphere pushed in and out, slightly flattened. */
const blob = (r: number, seed: number, rough: number, flat = 0.85, detail = 1) => {
  // Detail 0 keeps the corners of detail 1 (which get the same jitter), so the far version has the same silhouette.
  const g = new THREE.IcosahedronGeometry(r, detail);
  return { g, displace: (v: THREE.Vector3) => {
    const k = 1 + jitter3(v.x, v.y, v.z, seed) * rough;
    v.multiplyScalar(k);
    v.y *= flat;
  } };
};

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

interface TreeKind {
  geo: THREE.BufferGeometry;
  /** The same tree with fewer faces, for far away and the view from the plane. */
  far: THREE.BufferGeometry;
  /** Kinds a tile can pick from, by weight. */
  weight: number;
}

const broadleaf = (seed: number, hue: number, birch: boolean, far = false): THREE.BufferGeometry => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 2.4 + r() * 1.2;
  const bark = birch ? (y: number) => hsl(0.1, 0.06, 0.82 - (Math.sin(y * 9) > 0.7 ? 0.55 : 0)) : () => hsl(0.07, 0.35, 0.22 + r() * 0.06);
  const lean = (r() - 0.5) * 0.25;
  const trunk = new THREE.CylinderGeometry(birch ? 0.14 : 0.2, birch ? 0.22 : 0.34, trunkH + 1, far ? 5 : 6, far ? 2 : 3);
  trunk.translate(0, (trunkH + 1) / 2, 0);
  parts.push(piece(trunk, (_x, y) => bark(y), (v) => {
    v.x += lean * v.y * v.y * 0.12;
  }));
  // Two branches reaching into the crown.
  for (let i = 0; i < 2; i++) {
    const a = r() * Math.PI * 2;
    const br = new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5);
    br.translate(0, 0.8, 0);
    br.rotateZ(0.8);
    br.rotateY(a);
    br.translate(lean * 0.4, trunkH - 0.2, 0);
    // From afar the branches are lost in the crown.
    if (far) br.dispose();
    else parts.push(piece(br, (_x, y) => bark(y)));
  }
  // The crown: several lumpy blobs, darker underneath and inside, sunlit on top.
  const crownY = trunkH + 1.3;
  const n = birch ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const rr = (birch ? 0.9 : 1.15) + r() * 0.7;
    const a = (i / n) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : 0.7 + r() * 0.6;
    const { g, displace } = blob(rr, seed * 7 + i, 0.38, 0.78, far ? 0 : 1);
    g.translate(Math.cos(a) * d + lean * 0.8, crownY + (i === 0 ? 0.6 : (r() - 0.3) * 0.9), Math.sin(a) * d);
    const top = crownY + 1.6;
    parts.push(
      piece(g, (_x, y, _z, f) => {
        const k = Math.max(0, Math.min(1, (y - (crownY - 1.2)) / (top - crownY + 1.2)));
        return hsl(hue + (tileHash(f, seed, 1) - 0.5) * 0.03, birch ? 0.5 : 0.45, 0.17 + k * 0.17 + tileHash(f, i, seed) * 0.05);
      }, displace),
    );
  }
  return merge(parts);
};

const conifer = (seed: number, far = false): THREE.BufferGeometry => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  parts.push(piece(trunk, () => hsl(0.06, 0.4, 0.2)));
  const tiers = 4 + Math.floor(r() * 2);
  let y = 1.2;
  let rad = 2.0 + r() * 0.5;
  for (let i = 0; i < tiers; i++) {
    const h = 2.1 - i * 0.18;
    const cone = new THREE.ConeGeometry(rad, h, 8, far ? 1 : 2);
    cone.translate(0, y + h / 2, 0);
    const s = seed * 13 + i;
    parts.push(
      piece(cone, (_x, yy, _z, f) => hsl(0.36 + (tileHash(f, s, 2) - 0.5) * 0.03, 0.42, 0.14 + ((yy - 1.2) / 9) * 0.12 + tileHash(f, s, 3) * 0.05), (v) => {
        // Ragged rims: push the lower ring of each tier in and out.
        if (v.y < y + h * 0.4) {
          const k = 1 + jitter3(v.x, v.y, v.z, s) * 0.5;
          v.x *= k;
          v.z *= k;
          v.y -= Math.abs(jitter3(v.z, v.x, v.y, s)) * 0.35;
        }
      }),
    );
    y += h * 0.55;
    rad *= 0.76;
  }
  return merge(parts);
};

/**
 * The tree from far away (past 90 m from the camera, and always for the outer forest): one flattened lump with no trunk
 * (a 20-face icosahedron, the broadleaf's colour) or one 6-sided cone (12 faces, the conifer's colour). At most 20 triangles.
 */
const lowTree = (kind: 'broadleaf' | 'conifer', hue: number, seed: number): THREE.BufferGeometry => {
  const g: THREE.BufferGeometry = kind === 'conifer' ? new THREE.ConeGeometry(2.3, 8.2, 6, 1) : new THREE.IcosahedronGeometry(2.6, 0);
  if (kind === 'conifer') g.translate(0, 4.6, 0);
  else {
    g.scale(1.15, 0.85, 1.15);
    g.translate(0, 5.1, 0);
  }
  const ng = g.toNonIndexed();
  g.dispose();
  ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = ng.getAttribute('position').getY(i);
    const c = kind === 'conifer' ? hsl(0.36, 0.42, 0.14 + (y / 9) * 0.12 + tileHash(Math.floor(i / 3), seed, 3) * 0.05) : hsl(hue, 0.45, 0.17 + (y / 8) * 0.14 + tileHash(Math.floor(i / 3), seed, 3) * 0.05);
    col.set([c.r, c.g, c.b], i * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.computeVertexNormals();
  return ng;
};

const TREE_KINDS = (): TreeKind[] => [
  { geo: broadleaf(11, 0.27, false), far: lowTree('broadleaf', 0.27, 11), weight: 3 },
  { geo: broadleaf(23, 0.24, false), far: lowTree('broadleaf', 0.24, 23), weight: 3 },
  { geo: broadleaf(37, 0.3, false), far: lowTree('broadleaf', 0.3, 37), weight: 2 },
  { geo: broadleaf(41, 0.2, true), far: lowTree('broadleaf', 0.2, 41), weight: 1 },
  { geo: conifer(53), far: lowTree('conifer', 0.36, 53), weight: 2 },
  { geo: conifer(67), far: lowTree('conifer', 0.36, 67), weight: 2 },
];

const leafMaterial = () => windy(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 0.035, 2.4, true);

export interface Placement {
  x: number;
  y: number;
  /** A per-object seed in 0..1. */
  seed: number;
}

/**
 * A set of chunked kinds (see chunks.ts) as one group: `update(view)` picks the chunks to draw for this frame's camera.
 */
export interface NatureSet {
  group: THREE.Group;
  kinds: ChunkedKind[];
  update: (v: ChunkView) => void;
}
const natureSet = (kinds: ChunkedKind[]): NatureSet => {
  const group = new THREE.Group();
  kinds.forEach((k) => group.add(...k.meshes));
  return { group, kinds, update: (v) => kinds.forEach((k) => k.update(v)) };
};
const item = (m: THREE.Matrix4, color?: THREE.Color): InstanceData => ({ x: m.elements[12], z: m.elements[14], matrix: m, color });

const placeMatrix = (x: number, y: number, s: number, rot: number, sy = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, 0, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(s, sy, s));

/** `lowOnly`: every tree is the cheap far variant (the outer forest, which is never seen close), one draw call per kind. */
export const buildTrees = (spots: Placement[], lowOnly = false) => {
  const kinds = TREE_KINDS();
  const total = kinds.reduce((a, k) => a + k.weight, 0);
  const lists = kinds.map(() => [] as THREE.Matrix4[]);
  for (const p of spots) {
    let pick = p.seed * total;
    let i = 0;
    while (pick >= kinds[i].weight) pick -= kinds[i++].weight;
    const s = 0.85 + tileHash(Math.round(p.x * 10), Math.round(p.y * 10), 4) * 0.4;
    lists[i].push(placeMatrix(p.x, p.y, s, p.seed * 40, s * (0.9 + p.seed * 0.25)));
  }
  const m = leafMaterial();
  return natureSet(kinds.map((k, i) => (lowOnly ? chunkedInstances(k.far, m, lists[i].map((mm) => item(mm)), { height: 12, radius: 4 }) : chunkedInstances(k.geo, m, lists[i].map((mm) => item(mm)), { height: 12, radius: 4, farGeo: k.far }))));
};

// ---------------------------------------------------------------------------
// Bushes and rocks
// ---------------------------------------------------------------------------

const bushGeo = (seed: number, far = false) => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const rr = 0.55 + r() * 0.45;
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.45 + r() * 0.35;
    const { g, displace } = blob(rr, seed + i, 0.4, 0.75, far ? 0 : 1);
    g.translate(Math.cos(a) * d, rr * 0.55, Math.sin(a) * d);
    parts.push(piece(g, (_x, y, _z, f) => hsl(0.28 + (tileHash(f, seed, 1) - 0.5) * 0.04, 0.45, 0.16 + y * 0.12 + tileHash(f, i, seed) * 0.05), displace));
  }
  return merge(parts);
};

export const buildBushes = (spots: Placement[]) => {
  const seeds = [5, 19, 31];
  const lists = seeds.map(() => [] as THREE.Matrix4[]);
  for (const p of spots) lists[Math.floor(p.seed * seeds.length)].push(placeMatrix(p.x, p.y, 1.05 + p.seed * 0.3, p.seed * 50));
  const m = windy(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 0.03, 0.2, false, 0.35, 0, true);
  return natureSet(seeds.map((sd, i) => chunkedInstances(bushGeo(sd), m, lists[i].map((mm) => item(mm)), { height: 2.5, radius: 2, farGeo: bushGeo(sd, true) })));
};

const rockGeo = (seed: number) => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const rr = i === 0 ? 0.9 : 0.35 + r() * 0.2;
    const g = new THREE.DodecahedronGeometry(rr, 1);
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.6;
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(
      piece(g, (_x, y, _z, f) => {
        // Grey stone, lichen-green on top.
        const moss = y > rr * 0.35 && tileHash(f, seed, 4) < 0.45;
        return moss ? hsl(0.22, 0.25, 0.36 + tileHash(f, seed, 5) * 0.06) : hsl(0.1, 0.05, 0.4 + tileHash(f, seed, 6) * 0.14);
      }, (v) => {
        const k = 1 + jitter3(v.x, v.y, v.z, seed + i) * 0.35;
        v.multiplyScalar(k);
        v.y = Math.max(-0.05, v.y * 0.62);
      }),
    );
  }
  return merge(parts);
};

export const buildRocks = (spots: Placement[]) => {
  const kinds = [rockGeo(3), rockGeo(17), rockGeo(29)];
  const lists = kinds.map(() => [] as THREE.Matrix4[]);
  for (const p of spots) lists[Math.floor(p.seed * kinds.length)].push(placeMatrix(p.x, p.y, 1.05 + p.seed * 0.2, p.seed * 60));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  return natureSet(kinds.map((k, i) => chunkedInstances(k, m, lists[i].map((mm) => item(mm)), { height: 1.5, radius: 2 })));
};

// ---------------------------------------------------------------------------
// Grass: tufts of blades over every open meadow tile, swaying in the wind
// ---------------------------------------------------------------------------

const tuftGeo = () => {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(77);
  for (let i = 0; i < 7; i++) {
    const h = 0.28 + r() * 0.3;
    const w = 0.035 + r() * 0.025;
    const g = new THREE.BufferGeometry();
    const tx = (r() - 0.5) * 0.12;
    const tz = (r() - 0.5) * 0.12;
    // One triangle per blade, drawn from both sides; the material keeps the normal pointing up on the back face too.
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, tx, h, tz], 3));
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.28, 0, (r() - 0.5) * 0.28);
    const col = new Float32Array(9);
    const base = hsl(0.26, 0.45, 0.27);
    const tip = hsl(0.22 + r() * 0.04, 0.55, 0.45 + r() * 0.08);
    col.set([base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b]);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  // Light grass from above, whichever way a blade faces.
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
};

export const buildGrass = () => {
  const mats: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const r = rng(2024);
  for (let ty = 2; ty < SIZE - 2; ty++) {
    for (let tx = 2; tx < SIZE - 2; tx++) {
      const t = MAP[ty][tx];
      if (t !== 'g' && t !== 't' && t !== 'b') continue;
      const rd = routeDistance(tx * TILE + 1, ty * TILE + 1);
      if (rd < -0.4) continue;
      // Denser in the lush patches, sparse in the dry ones.
      const lush = fbm(tx * 0.09, ty * 0.09, 3);
      // How much lawn this tile keeps (CD spec map-balance-grass-stadium, 3; the first rule that matches): none on the pitch
      // or in the yards, a few clumps in the riskiest places, thinner in the others and on the verges, bald spots in the fields.
      const tier = placeTierAt(tx, ty);
      const nextToTall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => MAP[ty + dy]?.[tx + dx] === 'h');
      const k = inStadium(tx, ty) || NEAR_BUILDING[ty * SIZE + tx]
        ? 0
        : tier === 3
          ? lush > 0.55 ? 0.25 : 0
          : tier > 0
            ? 0.6
            : rd >= 0.1 && rd <= 1.5
              ? 0.3
              : nextToTall
                ? 1
                : fbm(tx * 0.05 + 70, ty * 0.05 + 31, 3) < 0.33
                  ? 0
                  : t !== 'g' ? 0.5 : 1;
      const count = Math.round((5 + lush * 9) * k);
      for (let i = 0; i < count; i++) {
        const x = tx * TILE + r() * TILE;
        const y = ty * TILE + r() * TILE;
        if (routeDistance(x, y) < 0.1) continue; // keep the roads and paths clear
        const s = 0.8 + r() * 0.7;
        mats.push(placeMatrix(x, y, s, r() * Math.PI * 2, s * (0.8 + lush * 0.6)));
        colors.push(new THREE.Color().setHSL(0.24 + r() * 0.05, 0.4, 0.75 + r() * 0.35));
      }
    }
  }
  const m = windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.25, 0, false, 0.9, GRASS_REACH);
  return natureSet([chunkedInstances(tuftGeo(), m, mats.map((mm, i) => item(mm, colors[i])), { height: 1, radius: 1, reach: GRASS_REACH, castShadow: false, colors: true })]);
};

/**
 * Tall grass on the 'h' meadows: dense tufts 1.1-1.6 m high in straw and green, swaying more
 * than the lawn and parting round anyone walking through (it hides you like a bush).
 */
export const buildTallGrass = () => {
  const mats: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const r = rng(4096);
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      if (MAP[ty][tx] !== 'h') continue;
      for (let i = 0; i < 22; i++) {
        const x = tx * TILE + r() * TILE;
        const y = ty * TILE + r() * TILE;
        const s = 1.4 + r() * 0.8;
        mats.push(placeMatrix(x, y, s, r() * Math.PI * 2, 3.2 + r() * 1.4));
        const straw = r() < 0.4;
        colors.push(new THREE.Color().setHSL(straw ? 0.12 + r() * 0.03 : 0.2 + r() * 0.05, straw ? 0.55 : 0.45, 0.85 + r() * 0.3));
      }
    }
  }
  const m = windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.12, 0, false, 1.1, TALL_GRASS_REACH);
  return natureSet([chunkedInstances(tuftGeo(), m, mats.map((mm, i) => item(mm, colors[i])), { height: 2, radius: 1, reach: TALL_GRASS_REACH, colors: true })]);
};

/** A forest beyond the edge of the map, so the world doesn't end in a flat green plane. */
export const outerForest = (): Placement[] => {
  const out: Placement[] = [];
  const r = rng(808);
  const margin = 26;
  // 1400 trees round the old 176 m map; the same density round whatever the map is now.
  const n = Math.round(1400 * (((WORLD + margin * 2) ** 2 - WORLD ** 2) / ((176 + margin * 2) ** 2 - 176 ** 2)));
  for (let i = 0; i < n; i++) {
    const x = -margin + r() * (WORLD + margin * 2);
    const y = -margin + r() * (WORLD + margin * 2);
    if (x > 0 && y > 0 && x < WORLD && y < WORLD) continue;
    out.push({ x, y, seed: r() });
  }
  return out;
};

/** Where the people on the ground are, so grass and bushes part around them. */
export const setPeople = (people: { x: number; y: number }[]) => {
  natureUniforms.uPeople.value.forEach((v, i) => {
    const p = people[i];
    v.set(p?.x ?? 0, p?.y ?? 0, p ? 1 : 0);
  });
};

export const updateNature = (time: number, focusX: number, focusY: number, fade: number) => {
  natureUniforms.uTime.value = time;
  natureUniforms.uFocus.value.set(focusX, 0, focusY);
  natureUniforms.uFade.value = fade;
  natureUniforms.uLensOn.value = 0; // off until the shoulder camera calls setFoliageFade later in the frame
};

/**
 * Shoulder camera only: crowns near the lens or crossing the lens-to-chest segment fade to 25 %. Uniforms are shared by
 * all merged tree chunks, so this costs no draw calls. Call it after `updateNature` each frame (updateNature clears it).
 */
export const setFoliageFade = (camX: number, camY: number, camZ: number, chestX: number, chestY: number, chestZ: number) => {
  natureUniforms.uLens.value.set(camX, camY, camZ);
  natureUniforms.uChest.value.set(chestX, chestY, chestZ);
  natureUniforms.uLensOn.value = 1;
};
