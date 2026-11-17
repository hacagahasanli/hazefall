import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BUILDINGS, MAP, SIZE, TILE, tileHash, WORLD } from '../sim/constants';

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

/** The ground texture: 8 px per metre, meadow greens with dry patches, soft dirt paths, asphalt. */
export const paintTerrain = () => {
  const px = 8;
  const n = WORLD * px;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  const path = weightGrid((t) => t === 'p');
  const road = weightGrid((t) => t === 'a');
  const soil = weightGrid((t) => t === 'c');
  const gravel = weightGrid((t) => t === 'k');
  const floor = weightGrid((t, tx, ty) => '.lwr#'.includes(t) && insideBuilding(tx, ty));
  const GRASS_A = [62, 112, 42];
  const GRASS_B = [98, 146, 58];
  const DRY = [146, 150, 74];
  const DIRT = [132, 102, 68];
  const DIRT_DARK = [104, 80, 54];
  const ASPHALT = [62, 66, 74];
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
      const wGravel = sstep(0.3, 0.6, sampleGrid(gravel, tx, ty) + e);
      if (wGravel > 0) col = mix(col, mix(GRAVEL, DIRT, fine * 0.6), wGravel * 0.85);
      const wPath = sstep(0.4, 0.5, sampleGrid(path, tx, ty) + e);
      if (wPath > 0) col = mix(col, mix(DIRT, DIRT_DARK, fbm(wx * 0.9, wy * 0.9, 2)), wPath);
      const wRoad = sstep(0.42, 0.52, sampleGrid(road, tx, ty));
      if (wRoad > 0) col = mix(col, [ASPHALT[0] + grain * 0.5, ASPHALT[1] + grain * 0.5, ASPHALT[2] + grain * 0.5], wRoad);
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

  // Road edge lines and a dashed centre line.
  const ppt = px * TILE;
  g.lineWidth = 1.5;
  for (let tx = 0; tx < SIZE; tx++) {
    const ty = MAP.findIndex((row, y) => row[tx] === 'a' && MAP[y + 1]?.[tx] === 'a');
    if (ty < 0) continue;
    g.strokeStyle = 'rgba(235,235,225,0.5)';
    g.beginPath();
    g.moveTo(tx * ppt, ty * ppt + 3);
    g.lineTo(tx * ppt + ppt, ty * ppt + 3);
    g.moveTo(tx * ppt, (ty + 2) * ppt - 3);
    g.lineTo(tx * ppt + ppt, (ty + 2) * ppt - 3);
    g.stroke();
    if (tx % 2 === 0) {
      g.strokeStyle = 'rgba(255,210,63,0.7)';
      g.beginPath();
      g.moveTo(tx * ppt + 2, (ty + 1) * ppt);
      g.lineTo(tx * ppt + ppt - 2, (ty + 1) * ppt);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// ---------------------------------------------------------------------------
// Shared wind and the canopy cut-out around you
// ---------------------------------------------------------------------------

export const natureUniforms = {
  uTime: { value: 0 },
  uFocus: { value: new THREE.Vector3() },
  uFade: { value: 0 },
};

/**
 * Adds wind sway (bigger the higher above `pivot` a vertex is) and, for canopies, a dithered
 * cut-out within `uFade` metres of the player above 2.2 m, so you can always see your fighter.
 */
const windy = (m: THREE.MeshStandardMaterial, amount: number, pivot: number, cutout: boolean) => {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, natureUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 base = vec3(0.0);
        #ifdef USE_INSTANCING
          base = instanceMatrix[3].xyz;
        #endif
        float bend = max(0.0, transformed.y - ${pivot.toFixed(2)});
        float ph = base.x * 0.37 + base.z * 0.29;
        float gust = 0.6 + 0.4 * sin(uTime * 0.7 + base.x * 0.05);
        transformed.x += sin(uTime * 1.9 + ph) * ${amount.toFixed(3)} * bend * gust;
        transformed.z += cos(uTime * 1.5 + ph * 1.3) * ${(amount * 0.7).toFixed(3)} * bend * gust;`,
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
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFocus;\nuniform float uFade;\nvarying vec3 vWorld;')
      .replace(
        '#include <clipping_planes_fragment>',
        cutout
          ? `#include <clipping_planes_fragment>
          if (uFade > 0.0 && vWorld.y > 2.2) {
            float d = distance(vWorld.xz, uFocus.xz) / uFade;
            if (d < 1.0) {
              vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
              float bayer = mod(q.x * 2.0 + q.y * 3.0 + q.x * q.y, 4.0) / 4.0 + 0.1;
              if (bayer > d * d * 1.2) discard;
            }
          }`
          : '#include <clipping_planes_fragment>',
      );
  };
  m.customProgramCacheKey = () => `windy-${amount}-${pivot}-${cutout}`;
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
const blob = (r: number, seed: number, rough: number, flat = 0.85) => {
  const g = new THREE.IcosahedronGeometry(r, 1);
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
  /** Kinds a tile can pick from, by weight. */
  weight: number;
}

const broadleaf = (seed: number, hue: number, birch: boolean): THREE.BufferGeometry => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 2.4 + r() * 1.2;
  const bark = birch ? (y: number) => hsl(0.1, 0.06, 0.82 - (Math.sin(y * 9) > 0.7 ? 0.55 : 0)) : () => hsl(0.07, 0.35, 0.22 + r() * 0.06);
  const lean = (r() - 0.5) * 0.25;
  const trunk = new THREE.CylinderGeometry(birch ? 0.14 : 0.2, birch ? 0.22 : 0.34, trunkH + 1, 6, 3);
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
    parts.push(piece(br, (_x, y) => bark(y)));
  }
  // The crown: several lumpy blobs, darker underneath and inside, sunlit on top.
  const crownY = trunkH + 1.3;
  const n = birch ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const rr = (birch ? 0.9 : 1.15) + r() * 0.7;
    const a = (i / n) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : 0.7 + r() * 0.6;
    const { g, displace } = blob(rr, seed * 7 + i, 0.38, 0.78);
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

const conifer = (seed: number): THREE.BufferGeometry => {
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
    const cone = new THREE.ConeGeometry(rad, h, 8, 2);
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

const TREE_KINDS = (): TreeKind[] => [
  { geo: broadleaf(11, 0.27, false), weight: 3 },
  { geo: broadleaf(23, 0.24, false), weight: 3 },
  { geo: broadleaf(37, 0.3, false), weight: 2 },
  { geo: broadleaf(41, 0.2, true), weight: 1 },
  { geo: conifer(53), weight: 2 },
  { geo: conifer(67), weight: 2 },
];

const leafMaterial = () => windy(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 0.035, 2.4, true);

export interface Placement {
  x: number;
  y: number;
  /** A per-object seed in 0..1. */
  seed: number;
}

const instanced = (geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], shadow = true) => {
  const im = new THREE.InstancedMesh(geo, m, Math.max(1, mats.length));
  mats.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.count = mats.length;
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.frustumCulled = false;
  return im;
};

const placeMatrix = (x: number, y: number, s: number, rot: number, sy = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, 0, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(s, sy, s));

export const buildTrees = (spots: Placement[]) => {
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
  const g = new THREE.Group();
  const m = leafMaterial();
  kinds.forEach((k, i) => g.add(instanced(k.geo, m, lists[i])));
  return g;
};

// ---------------------------------------------------------------------------
// Bushes and rocks
// ---------------------------------------------------------------------------

const bushGeo = (seed: number) => {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const rr = 0.55 + r() * 0.45;
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.45 + r() * 0.35;
    const { g, displace } = blob(rr, seed + i, 0.4, 0.75);
    g.translate(Math.cos(a) * d, rr * 0.55, Math.sin(a) * d);
    parts.push(piece(g, (_x, y, _z, f) => hsl(0.28 + (tileHash(f, seed, 1) - 0.5) * 0.04, 0.45, 0.16 + y * 0.12 + tileHash(f, i, seed) * 0.05), displace));
  }
  return merge(parts);
};

export const buildBushes = (spots: Placement[]) => {
  const kinds = [bushGeo(5), bushGeo(19), bushGeo(31)];
  const lists = kinds.map(() => [] as THREE.Matrix4[]);
  for (const p of spots) lists[Math.floor(p.seed * kinds.length)].push(placeMatrix(p.x, p.y, 1.05 + p.seed * 0.3, p.seed * 50));
  const g = new THREE.Group();
  const m = windy(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 0.03, 0.2, false);
  kinds.forEach((k, i) => g.add(instanced(k, m, lists[i])));
  return g;
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
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  kinds.forEach((k, i) => g.add(instanced(k, m, lists[i])));
  return g;
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
    // Both windings, so each side is a front face lit from above (no DoubleSide normal flip).
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, tx, h, tz, w, 0, 0, -w, 0, 0, tx, h, tz], 3));
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.28, 0, (r() - 0.5) * 0.28);
    const col = new Float32Array(18);
    const base = hsl(0.26, 0.45, 0.27);
    const tip = hsl(0.22 + r() * 0.04, 0.55, 0.45 + r() * 0.08);
    col.set([base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b, base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b]);
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
      // Denser in the lush patches, sparse in the dry ones.
      const lush = fbm(tx * 0.09, ty * 0.09, 3);
      const count = Math.round(5 + lush * 9);
      for (let i = 0; i < count; i++) {
        const x = tx * TILE + r() * TILE;
        const y = ty * TILE + r() * TILE;
        const s = 0.8 + r() * 0.7;
        mats.push(placeMatrix(x, y, s, r() * Math.PI * 2, s * (0.8 + lush * 0.6)));
        colors.push(new THREE.Color().setHSL(0.24 + r() * 0.05, 0.4, 0.75 + r() * 0.35));
      }
    }
  }
  const m = windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.25, 0, false);
  const im = instanced(tuftGeo(), m, mats, false);
  colors.forEach((c, i) => im.setColorAt(i, c));
  return im;
};

/** A forest beyond the edge of the map, so the world doesn't end in a flat green plane. */
export const outerForest = (): Placement[] => {
  const out: Placement[] = [];
  const r = rng(808);
  const margin = 26;
  for (let i = 0; i < 1400; i++) {
    const x = -margin + r() * (WORLD + margin * 2);
    const y = -margin + r() * (WORLD + margin * 2);
    if (x > 0 && y > 0 && x < WORLD && y < WORLD) continue;
    out.push({ x, y, seed: r() });
  }
  return out;
};

export const updateNature = (time: number, focusX: number, focusY: number, fade: number) => {
  natureUniforms.uTime.value = time;
  natureUniforms.uFocus.value.set(focusX, 0, focusY);
  natureUniforms.uFade.value = fade;
};
