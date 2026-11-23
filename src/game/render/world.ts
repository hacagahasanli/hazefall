import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { assetUrl } from '../../lib/assets';
import { trackLoad } from '../../lib/loading';
import { BUILDINGS, CRATE_TOP, fenceVertical, MAP, SIZE, TILE, tileHash, treeSpot, WORLD } from '../sim/constants';
import { EAVE, ridgeHeight, roofRise, ROOF_LAYER } from '../sim/roofs';

import { buildFurniture, buildRugs } from './furniture';
import { cloneMaterial, collectParts, mergeParts, mergeRigid, mergeStatic } from './merge';
import { buildRoads } from './roads';
import { buildBushes, buildGrass, buildMeadow, buildRocks, buildTallGrass, buildTrees, natureUniforms, outerForest, paintTerrain, updateNature } from './nature';

import { chunkedInstances } from './chunks';

import type { ChunkView } from './chunks';

import type { GameState } from '../sim/types';

/**
 * The world you fight in, dressed with Kenney's CC0 models (see ASSETS.md):
 * trees, bushes, rocks, crops, fences and crates are GPU-instanced; houses get a suburban
 * exterior scaled to their footprint that disappears when you walk in, showing the rooms.
 */

const loader = new GLTFLoader();
// Counted for the loading screens (lib/loading): real files, real progress.
const load = (name: string) => trackLoad(loader.loadAsync(assetUrl(`models/${name}.glb`))).then((g) => g.scene);

/** With the metal gone the pack's pale colours read washed out next to the old look; this brings them back to it. */
const HOUSE_DIFFUSE = 0.6;

/**
 * Colours by place (battleground-atmosphere.md item 5), so Old Town reads apart from the Truck Stop at street level the way
 * the landmarks do from the sky: walls, trim, roofs and the tint of the house model seen from above, one set per kind of
 * place, picked per house by hash within it.
 */
interface Palette { walls: number[]; trim: number; roofs: number[]; tints: number[]; chimneys: boolean; ac: boolean }
const PALETTES: Record<string, Palette> = {
  town: { walls: [0xd9c8a8, 0xc9a98a, 0xb87a5e, 0xe4d7c1, 0xa9b996], trim: 0xf1ead8, roofs: [0x7a3a2e, 0x6b4a32, 0x4a5560], tints: [0xffe2cc, 0xfff0d8, 0xffd6c0, 0xf0e8ff], chimneys: true, ac: false },
  farm: { walls: [0xe8e0cc, 0xd8c49a], trim: 0x5b4636, roofs: [0x5a6b45, 0x6b4a32], tints: [0xfff6e0, 0xf0ffe0], chimneys: true, ac: false },
  cabin: { walls: [0x8a6440, 0x6f5136, 0xa07c56], trim: 0xe4d7c1, roofs: [0x3f5a3a, 0x3f4650], tints: [0xe0d0b8, 0xd8e8d0], chimneys: true, ac: false },
  truck: { walls: [0xd8b8a4, 0xb9c8d6, 0xe8dcb0, 0xc8d8c0], trim: 0xf4f1ea, roofs: [0x4a5560], tints: [0xffd6e8, 0xc8dcff, 0xfff0b8, 0xd8ffe0], chimneys: false, ac: true },
  campus: { walls: [0xc4c0b6, 0xdedbd2], trim: 0x3f4650, roofs: [0x4a5560], tints: [0xc8dcff, 0xffffff], chimneys: false, ac: true },
  works: { walls: [0x8f969c, 0x9c7f66, 0xb0aca2], trim: 0x3f4650, roofs: [0x3f4650, 0x5c6066], tints: [0xd0d4d8, 0xc8c0b8], chimneys: false, ac: false },
};
const PLACE_KIND: [string, number, number, number, number][] = [
  ['works', 4, 4, 27, 25], ['cabin', 30, 4, 79, 28], ['cabin', 88, 4, 117, 31], ['farm', 34, 32, 51, 45], ['farm', 72, 34, 89, 47],
  ['cabin', 4, 40, 31, 91], ['town', 44, 42, 79, 79], ['works', 76, 48, 89, 57], ['works', 89, 36, 113, 83], ['farm', 33, 74, 50, 87],
  ['campus', 10, 90, 41, 115], ['truck', 52, 90, 79, 105], ['works', 80, 93, 117, 117],
];
const DOOR_COLORS = [0x3f5a3a, 0x4a6a8a, 0x7a3a2e, 0x2b2d30, 0x5b4636, 0x2f4a5a];
const houseHash = (bi: number, k: number) => {
  const v = Math.sin(bi * 91.7 + k * 47.3) * 43758.5453;
  return v - Math.floor(v);
};
/** The look of building `bi`: its place's palette and the colours this house took from it. */
export const houseLook = (bi: number) => {
  const b = BUILDINGS[bi];
  const cx = b.x0 + b.w / 2;
  const cy = b.y0 + b.h / 2;
  const kind = PLACE_KIND.find(([, x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1)?.[0] ?? 'farm';
  const pal = PALETTES[kind];
  const pick = (list: number[], k: number) => list[Math.floor(houseHash(bi, k) * list.length) % list.length];
  return {
    kind,
    wall: b.barn ? 0x9b3b30 : kind === 'truck' ? pal.walls[bi % pal.walls.length] : pick(pal.walls, 1),
    trim: b.barn ? 0xe4d7c1 : pal.trim,
    roof: b.barn ? 0x5b2a24 : pick(pal.roofs, 2),
    tint: pick(pal.tints, 3),
    door: pick(DOOR_COLORS, 4),
    chimney: !b.barn && pal.chimneys && houseHash(bi, 21) < 0.5,
    ac: pal.ac,
  };
};

/**
 * A gabled roof over a building's footprint (x0, z0, w, d in metres): the ridge along the long
 * side, eaves at the wall tops with a little overhang, gable ends in the wall colour, and a flat
 * ceiling under it so a room reads as a room from inside.
 */
/** A flat colour on every vertex (the roofs share materials and carry their colour per vertex, so all of them merge). */
const paint = (g: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const roofMats = {
  roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }),
  gable: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }),
  ceiling: new THREE.MeshBasicMaterial({ color: 0x8c8374 }),
};

const buildRoof = (x0: number, z0: number, w: number, d: number, barn: boolean, i: number, rise: number) => {
  const g = new THREE.Group();
  const H = 2.6;
  const o = 0.4;
  const alongX = w >= d;
  const L = (alongX ? w : d) + o * 2;
  const S = (alongX ? d : w) + o * 2;
  const pos = (u: number, v: number, y: number) => (alongX ? [x0 - o + u, y, z0 - o + v] : [x0 - o + v, y, z0 - o + u]);
  const quad = (a: number[], b: number[], c: number[], e: number[]) => [...a, ...b, ...c, ...a, ...c, ...e];
  const slopes = new THREE.BufferGeometry();
  slopes.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        ...quad(pos(0, 0, H - 0.05), pos(L, 0, H - 0.05), pos(L, S / 2, H + rise), pos(0, S / 2, H + rise)),
        ...quad(pos(0, S, H - 0.05), pos(0, S / 2, H + rise), pos(L, S / 2, H + rise), pos(L, S, H - 0.05)),
      ],
      3,
    ),
  );
  slopes.computeVertexNormals();
  const look = houseLook(i);
  const roof = new THREE.Mesh(paint(slopes, look.roof), roofMats.roof);
  roof.castShadow = true;
  roof.receiveShadow = true;
  // The gables: triangles closing the ends between the wall tops and the ridge.
  const gables = new THREE.BufferGeometry();
  gables.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...pos(o, o, H), ...pos(o, S - o, H), ...pos(o, S / 2, H + rise - 0.1), ...pos(L - o, o, H), ...pos(L - o, S / 2, H + rise - 0.1), ...pos(L - o, S - o, H)], 3),
  );
  gables.computeVertexNormals();
  const gable = new THREE.Mesh(paint(gables, look.wall), roofMats.gable);
  gable.castShadow = true;
  // Roof details (merged with the roofs): a ridge cap, a chimney on half the homes, an AC box on flat roofs in town.
  const bits: THREE.BufferGeometry[] = [];
  const darker = new THREE.Color(look.roof).multiplyScalar(0.7).getHex();
  const at = (u: number, v: number, y: number, sx: number, sy: number, sz: number, hex: number) => {
    const p = pos(u, v, y);
    bits.push(paint(new THREE.BoxGeometry(alongX ? sx : sz, sy, alongX ? sz : sx).translate(p[0], p[1], p[2]), hex));
  };
  if (rise > 0.3) {
    at(L / 2, S / 2, H + rise + 0.03, L - 0.2, 0.12, 0.3, darker);
    if (look.chimney) {
      const v = S * 0.3;
      const ySlope = H + rise * (v / (S / 2));
      const brick = look.kind === 'cabin' ? look.wall : 0x8a6a5a;
      at(L * 0.3, v, (ySlope + H + rise + 0.5) / 2 - 0.2, 0.6, H + rise + 0.5 - ySlope + 0.4, 0.6, brick);
      at(L * 0.3, v, H + rise + 0.54, 0.7, 0.08, 0.7, 0x3a3430);
    }
  } else if (look.ac) {
    at(L * 0.35, S * 0.4, H + rise + 0.3, 1.2, 0.6, 0.9, 0x9aa3a8);
  }
  if (bits.length) {
    const m = new THREE.Mesh(mergeGeometries(bits.map((b) => b.toNonIndexed()))!, roofMats.roof);
    m.castShadow = true;
    g.add(m);
  }
  // Unlit: facing down, a lit ceiling would take the hemisphere light's grass-green ground colour.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), roofMats.ceiling);
  ceiling.position.set(x0 + w / 2, H - 0.02, z0 + d / 2);
  g.add(roof, gable, ceiling);
  return g;
};

/** A stable pseudo-random number per tile, so the dressing is the same every match. */
const hash = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const tilesOf = (chars: string) => {
  const out: { tx: number; ty: number; x: number; y: number }[] = [];
  MAP.forEach((row, ty) =>
    [...row].forEach((c, tx) => chars.includes(c) && out.push({ tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 })),
  );
  return out;
};

/** Turn every mesh of a loaded model into an InstancedMesh with these placements. */
const instance = (model: THREE.Object3D, placements: THREE.Matrix4[]) => {
  const group = new THREE.Group();
  if (!placements.length) return group;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, placements.length);
    const local = o.matrixWorld.clone();
    placements.forEach((m, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, local)));
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  });
  return group;
};

/** The same, chunked (see chunks.ts): only the placements near what the camera sees are drawn. */
const instanceChunked = (source: THREE.Object3D, placements: THREE.Matrix4[], height: number) => {
  // One mesh per model (its plain colours baked into the vertices), so one draw call per kind.
  const model = source.clone(true);
  mergeRigid(model);
  model.updateMatrixWorld(true);
  const kinds: ReturnType<typeof chunkedInstances>[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !placements.length) return;
    const local = o.matrixWorld.clone();
    const items = placements.map((m) => ({ x: m.elements[12], z: m.elements[14], matrix: new THREE.Matrix4().multiplyMatrices(m, local) }));
    kinds.push(chunkedInstances(o.geometry, o.material as THREE.Material, items, { height, radius: 2 }));
  });
  const group = new THREE.Group();
  kinds.forEach((k) => group.add(...k.meshes));
  return { group, kinds, update: (v: ChunkView) => kinds.forEach((k) => k.update(v)) };
};

const place = (x: number, y: number, scale: number, rotY = 0, h = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, h, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(scale, scale, scale));

// ---------------------------------------------------------------------------

const insideBuilding = (tx: number, ty: number) => BUILDINGS.some((b) => tx >= b.x0 && ty >= b.y0 && tx < b.x0 + b.w && ty < b.y0 + b.h);

/** A red barn with white trim and a gable roof, built to the footprint: walls `eave` high, the roof rising `rise` more. */
const buildBarn = (w: number, d: number, eave = 4.2, rise = 3.2) => {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb23b3b, flatShading: true, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3a36, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, eave, d), red);
  body.position.y = eave / 2;
  g.add(body);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, eave + 0.1, 0.35), white);
    post.position.set(x, (eave + 0.1) / 2, z);
    g.add(post);
  }
  const roof = new THREE.Shape();
  roof.moveTo(-d / 2 - 0.4, 0);
  roof.lineTo(0, rise);
  roof.lineTo(d / 2 + 0.4, 0);
  roof.lineTo(-d / 2 - 0.4, 0);
  const geo = new THREE.ExtrudeGeometry(roof, { depth: w + 0.8, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.8) / 2);
  const roofMesh = new THREE.Mesh(geo, roofMat);
  roofMesh.rotation.y = Math.PI / 2;
  roofMesh.position.y = eave;
  g.add(roofMesh);
  // Its colours baked into the vertices: one or two draw calls instead of one per board.
  g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  mergeRigid(g);
  return g;
};

/** Gives every mesh under `g` its own copy of its material, made transparent so the building can fade out. */
const ownFadingMaterials = (g: THREE.Object3D) =>
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = cloneMaterial(o.material as THREE.Material);
    (o.material as THREE.Material).transparent = true;
  });

/** What the camera sees, for `World.cull`: where the sun's shadow box is, the tier's view-distance scale, and where the far trees start. */
export interface CullOptions {
  shadow: { x: number; z: number; half: number } | null;
  reach: number;
  lodNear: number;
  /** Ground distance (m) past which nothing is drawn (beyond the fog). */
  far: number;
  /** The soft additive glows (door halos, warm room fill): off on the low tier. Default on. */
  glow?: boolean;
}

export interface World {
  /** From the plane (choosing where to jump) the door frames, too small to see, are not drawn: fewer draw calls. */
  setOverview: (on: boolean) => void;
  /** Before each render: draw only the chunks of trees, bushes, rocks and grass this camera can see. */
  cull: (camera: THREE.Camera, o: CullOptions) => void;
  /** Another chunked set (the clouds) to cull with the rest. */
  track: (set: { update: (v: ChunkView) => void }) => void;
  /** Hide the house you're standing in, swap crates for broken ones. */
  /** `firstPerson`: walls stay full height inside and the tree canopies are never cut away. */
  /** `selfZ`: your feet's height (on a roof you are not inside the house under you). */
  update: (state: GameState, selfX: number, selfY: number, firstPerson?: boolean, selfZ?: number) => void;
}

/**
 * Close-up grain for the ground. The painted terrain has 6 px per metre: plenty from the
 * top-down camera, soft at eye level. A small tiled noise texture, repeated every ~1.5 m and
 * again every ~7.5 m, modulates its colour in the shader: grit and clumps up close, invisible
 * from high up (it averages out in the mipmaps).
 */
const addGroundDetail = (m: THREE.MeshStandardMaterial) => {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // Red: fine grit; green: soft clumps (blurred random, wrapped so the tile repeats seamlessly).
  const coarse = Array.from({ length: 16 * 16 }, rnd);
  const at = (x: number, y: number) => coarse[((y + 16) % 16) * 16 + ((x + 16) % 16)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * 16;
      const fy = (y / n) * 16;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const v = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
      const o = (y * n + x) * 4;
      img.data[o] = 90 + rnd() * 140;
      img.data[o + 1] = v * 255;
      img.data[o + 2] = 128;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float grit = texture2D(uDetail, vMapUv * ${(WORLD / 1.5).toFixed(1)}).r;
        float clump = texture2D(uDetail, vMapUv * ${(WORLD / 7.5).toFixed(1)}).g;
        diffuseColor.rgb *= mix(0.86, 1.12, grit) * mix(0.9, 1.08, clump);`,
      );
  };
};

/**
 * Soft light without textures or lights: a disc or cone whose vertex colour fades from `hex` to black at its rim, drawn
 * additively (black adds nothing). One material for every glow on the map, so they merge into a batch or two.
 */
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
// Faded out right in front of the camera, so walking through a doorway (through its cone) never washes the screen.
glowMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vNear;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvNear = smoothstep(0.8, 3.0, -mvPosition.z);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vNear;')
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb *= vNear;');
};
glowMat.customProgramCacheKey = () => 'glow-near';
/** A flat disc (in its own xy plane) bright at the centre, black at the rim. */
const glowDisc = (radius: number, hex: number, segs = 18) => {
  const g = new THREE.CircleGeometry(radius, segs);
  const c = new THREE.Color(hex);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, 1 - Math.hypot(pos.getX(i), pos.getY(i)) / radius);
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
/** A way into a building: the middle of its opening on the outer wall line (metres), along x or z, and its outward side. */
export interface Doorway {
  building: number;
  x: number;
  z: number;
  /** In a wall along x (a north or south wall), else along z. */
  horizontal: boolean;
  /** +1 if outside is towards +z (horizontal) or +x, else -1. */
  out: 1 | -1;
}
/** Every doorway on the map: two open tiles side by side in a building's outer ring of tiles. */
export const findDoorways = (): Doorway[] =>
  BUILDINGS.flatMap((b, building) => {
    const found: Doorway[] = [];
    const ring = (x: number, y: number) => x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
    const seen = new Set<string>();
    for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
      for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
        if (!ring(tx, ty) || MAP[ty][tx] !== '.' || seen.has(`${tx},${ty}`)) continue;
        // A door is two tiles along the wall: find its partner.
        const horizontal = ty === b.y0 || ty === b.y0 + b.h - 1;
        seen.add(`${tx},${ty}`);
        seen.add(horizontal ? `${tx + 1},${ty}` : `${tx},${ty + 1}`);
        const out = horizontal ? (ty === b.y0 ? -1 : 1) : tx === b.x0 ? -1 : 1;
        const x = horizontal ? (tx + 1) * TILE : tx * TILE + TILE / 2 + out * (TILE / 2);
        const z = horizontal ? ty * TILE + TILE / 2 + out * (TILE / 2) : (ty + 1) * TILE;
        found.push({ building, x, z, horizontal, out });
      }
    }
    return found;
  });
/** Half the width of a doorway's clear opening (between the frame's posts), and its height (under the lintel). */
export const DOOR_HALF = 1.72;
export const DOOR_HEIGHT = 2.375;
/**
 * The box cut out of a house's shell at a doorway (world metres, y up, z = map y): the clear opening, from a little
 * outside the wall line to `inward` metres in (past the model's own wall, which can stand inside its footprint or at the
 * back of a porch), from below the ground to the underside of the lintel. Only wall faces in it are cut (cutDoorways).
 */
export const doorwayCut = (d: Doorway, inward = 1) => {
  const along = [-DOOR_HALF, DOOR_HALF];
  const across = [d.out > 0 ? -inward : -0.4, d.out > 0 ? 0.4 : inward];
  const [x0, x1] = d.horizontal ? [d.x + along[0], d.x + along[1]] : [d.x + across[0], d.x + across[1]];
  const [z0, z1] = d.horizontal ? [d.z + across[0], d.z + across[1]] : [d.z + along[0], d.z + along[1]];
  return { min: new THREE.Vector3(x0, -1, z0), max: new THREE.Vector3(x1, DOOR_HEIGHT, z1) };
};
/**
 * Opens real holes in a house shell at its doorways: the shell's fragments inside each doorway box are thrown away, so
 * from above you look through the opening at what is really in there (the floor, furniture, loot, a fighter by the door)
 * and only along real lines of sight. Only wall faces are cut (a low roof or eave over the door stays whole); the shell's
 * other faces are one-sided, so its back walls never block the view in from inside. Its shadow stays whole (the shadow pass does not cut), so the room behind the door stays in the shade of
 * its roof. Each house has its own material, so the boxes are its own uniforms; the shader is shared.
 */
const cutDoorways = (root: THREE.Object3D, boxes: { min: THREE.Vector3; max: THREE.Vector3 }[]) => {
  if (!boxes.length) return;
  const n = boxes.length;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.Material;
    const before = m.onBeforeCompile;
    // Taken now: the default key is the hook's source, which is about to change.
    const key = m.customProgramCacheKey();
    const uniforms = { uCutMin: { value: boxes.map((b) => b.min) }, uCutMax: { value: boxes.map((b) => b.max) } };
    m.onBeforeCompile = (sh, r) => {
      before.call(m, sh, r);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;\nvarying float vCutUp;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCutUp = abs(normalize(mat3(modelMatrix) * objectNormal).y);',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vCutW;\nvarying float vCutUp;\nuniform vec3 uCutMin[${n}];\nuniform vec3 uCutMax[${n}];`)
        .replace(
          '#include <clipping_planes_fragment>',
          `if (vCutUp < 0.5) for (int i = 0; i < ${n}; i++) if (all(greaterThan(vCutW, uCutMin[i])) && all(lessThan(vCutW, uCutMax[i]))) discard;\n#include <clipping_planes_fragment>`,
        );
    };
    m.customProgramCacheKey = () => `${key}|door-cut-${n}`;
    m.needsUpdate = true;
  });
};

/** The wall lamp over every door: a dark housing and a warm bulb (self-lit, so it reads in shade, storm and fog). */
const lampMats = {
  housing: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.8, metalness: 0.3 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc46a, emissiveIntensity: 2.4, roughness: 1 }),
  // Worn hazard tape along the lintel: the first thing that says "way in" from across a field.
  tapeA: new THREE.MeshStandardMaterial({ color: 0xd4a21f, roughness: 0.9 }),
  tapeB: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 }),
  ceilingLamp: new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc878, emissiveIntensity: 1.8, roughness: 1 }),
};
const LAMP_GLOW = 0x8a5a26;
const ROOM_GLOW = 0x4a2e12;

export const buildWorld = (scene: THREE.Scene): World => {
  // ---------- ground
  const groundMat = new THREE.MeshStandardMaterial({ map: paintTerrain(), roughness: 1 });
  addGroundDetail(groundMat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD / 2, 0, WORLD / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x4a7a36, roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(WORLD / 2, -0.05, WORLD / 2);
  scene.add(outside);

  // ---------- nature built in code: trees, bushes, rocks, grass (see nature.ts)
  const spot = (t: { tx: number; ty: number; x: number; y: number }) => ({ x: t.x, y: t.y, seed: tileHash(t.tx, t.ty, 1) });
  const nature: { group: THREE.Object3D; update: (v: ChunkView) => void }[] = [
    buildTrees(tilesOf('t').map((t) => ({ ...treeSpot(t.tx, t.ty), seed: tileHash(t.tx, t.ty, 1) }))),
    // The forest beyond the map's edge is never seen close: only the cheap far variant.
    buildTrees(outerForest(), true),
    buildBushes(tilesOf('b').map(spot)),
    buildRocks(tilesOf('k').map(spot)),
    buildGrass(),
    buildTallGrass(),
    buildMeadow(),
  ];
  ['trees', 'bushes', 'rocks', 'grass', 'tall grass', 'meadow'].forEach((name, i) => (nature[i].group.name = name));
  nature.forEach((n) => scene.add(n.group));
  scene.add(mergeStatic(buildRoads()));

  // ---------- furniture and rugs: under the house shells from above, seen there through the doorways (and all of it once a
  // house opens up, when you walk in)
  const furniture = buildFurniture();
  const rugs = mergeStatic(buildRugs(), { bake: true });
  scene.add(furniture, rugs);
  let furnitureShadows = true;

  // ---------- doorways: a frame and a doormat where the real doors are, so you can see from outside where to walk in (the
  // house models' own doors are only decoration)
  /**
   * From above a house is a shell model, so at every doorway a real hole is cut in it (cutDoorways, below): you look
   * through the frame at the room as it is, its floor, furniture, loot and anyone standing by the door, lit by the warm
   * pool that spills over the threshold (addJambs gives the passage through the ring of wall tiles its sides). Both
   * cameras share the pool.
   */
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d')!;
    const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffcf8a, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const poolGeo = new THREE.PlaneGeometry(5.4, 4.2).rotateX(-Math.PI / 2);
  // A painted wood frame, in the houses' warm browns rather than stark white.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.8 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const doorList = findDoorways();
  // Built per building, then merged per material over the whole map (frames, doormats, light pools: three
  // draw calls); a building's doors are hidden by collapsing its triangles in those batches.
  // The lamps over the doors, merged apart from the frames (their look baked into the vertices, one batch, plus one for
  // their glow), and hidden with the doors.
  const lampParts: ReturnType<typeof collectParts> = [];
  const doorParts = BUILDINGS.flatMap((_, bi) => {
    const g = new THREE.Group();
    const lg = new THREE.Group();
    for (const d of doorList) {
      if (d.building !== bi) continue;
      const holder = new THREE.Group();
      holder.position.set(d.x, 0, d.z);
      holder.rotation.y = d.horizontal ? 0 : Math.PI / 2;
      // After the quarter turn local +z is world +x, so 'out' is the outward side in both cases.
      const sgn = d.out;
      // A wooden sill across the threshold.
      const sill = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.06, 0.3), frameMat);
      sill.position.set(0, 0.03, sgn * 0.12);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.25, 0.22), frameMat);
      lintel.position.set(0, 2.5, sgn * 0.1);
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.5, 0.22), frameMat);
      postL.position.set(-1.83, 1.25, sgn * 0.1);
      const postR = postL.clone();
      postR.position.x = 1.83;
      const mat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.9), matMat);
      mat.position.set(0, 0.015, sgn * 0.75);
      // The light pool spills from the doorway onto the step, half inside and half out (added after the shadow pass).
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(0, 0.04, sgn * 0.5);
      pool.renderOrder = 2;
      holder.add(sill, lintel, postL, postR, mat);
      holder.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      holder.add(pool);
      g.add(holder);

      // The lamp: housing and bulb above the lintel, a halo round it (upright for the eye-level views, flat for the
      // view from above) and hazard tape across the lintel. No cone of light: it filled the doorway with a pale wedge.
      const lamp = new THREE.Group();
      lamp.position.copy(holder.position);
      lamp.rotation.copy(holder.rotation);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), lampMats.housing);
      housing.position.set(0, 2.84, sgn * 0.2);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.22), lampMats.bulb);
      bulb.position.set(0, 2.74, sgn * 0.24);
      lamp.add(housing, bulb);
      for (let k = 0; k < 9; k++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.9 / 9, 0.13, 0.02), k % 2 ? lampMats.tapeB : lampMats.tapeA);
        stripe.position.set(-1.95 + (k + 0.5) * (3.9 / 9), 2.5, sgn * 0.22);
        lamp.add(stripe);
      }
      lamp.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      const halo = new THREE.Mesh(glowDisc(0.85, LAMP_GLOW), glowMat);
      halo.position.set(0, 2.74, sgn * 0.3);
      const haloTop = new THREE.Mesh(glowDisc(1.2, LAMP_GLOW).rotateX(-Math.PI / 2), glowMat);
      haloTop.position.set(0, 2.95, sgn * 0.45);
      for (const m of [halo, haloTop]) m.renderOrder = 3;
      lamp.add(halo, haloTop);
      lg.add(lamp);
    }
    lampParts.push(...collectParts(lg, bi));
    return collectParts(g, bi);
  });
  const doorBatches = mergeParts(doorParts);
  doorBatches.forEach((d) => scene.add(d.mesh));
  const lampBatches = mergeParts(lampParts, { bake: true });
  lampBatches.forEach((d) => scene.add(d.mesh));
  /** Everything hidden with a building's doors (when you stand in it, seen from above). */
  const doorways = [...doorBatches, ...lampBatches];
  const glows: THREE.Object3D[] = lampBatches.filter((d) => d.mesh.material === glowMat).map((d) => d.mesh);

  // ---------- inside: a warm, dim fill on the floor of every room (the lights are on in there), so a house reads as lived
  // in from the door and through the windows and its inside differs from the daylight outside. One batch for the map;
  // under the house shells from above it only shows once a house opens up.
  const roomGlow = mergeStatic(
    (() => {
      const g = new THREE.Group();
      BUILDINGS.forEach((b) => {
        const w = b.w * TILE;
        const d = b.h * TILE;
        const fill = new THREE.Mesh(glowDisc(1, ROOM_GLOW, 24).rotateX(-Math.PI / 2), glowMat);
        fill.scale.set(w * 0.48, 1, d * 0.48);
        fill.position.set(b.x0 * TILE + w / 2, 0.035, b.y0 * TILE + d / 2);
        fill.renderOrder = 2;
        g.add(fill);
      });
      return g;
    })(),
  );
  roomGlow.name = 'room glow';
  scene.add(roomGlow);
  glows.push(roomGlow);

  // ---------- earlier rounds and a hurried leaving: scorch marks on the ground by some houses, and yard things in some of their
  // corners. Picked per building from a fixed hash, so every match looks the same; flat or tucked into a corner, so none
  // of it reads as cover you could use (they are not in the simulation).
  const scorchMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0x1c1610, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const open = (tx: number, ty: number) => 'gpd'.includes(MAP[ty]?.[tx] ?? '#');
  const wear = new THREE.Group();
  // One material per colour (the yard things merge per material: a handful of draw calls for the whole map).
  // One vertex-coloured material for all of them: they merge into a single batch per chunk.
  const yardAll = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const yardGeo = (g: THREE.BufferGeometry, hex: number) => paint(g.toNonIndexed(), hex);
  BUILDINGS.forEach((b, bi) => {
    const x0 = b.x0 * TILE;
    const z0 = b.y0 * TILE;
    const x1 = (b.x0 + b.w) * TILE;
    const z1 = (b.y0 + b.h) * TILE;
    if (hash(bi, 3, 11) < 0.35) {
      // Along one wall, outside, a few metres from a corner.
      const side = Math.floor(hash(bi, 5, 12) * 4);
      const t = 0.2 + hash(bi, 7, 13) * 0.6;
      const at = [[x0 + (x1 - x0) * t, z0 - 1.4], [x0 + (x1 - x0) * t, z1 + 1.4], [x0 - 1.4, z0 + (z1 - z0) * t], [x1 + 1.4, z0 + (z1 - z0) * t]][side];
      if (open(Math.floor(at[0] / TILE), Math.floor(at[1] / TILE))) {
        const r = 1.3 + hash(bi, 9, 14) * 0.9;
        const s = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 1.6).rotateX(-Math.PI / 2), scorchMat);
        s.position.set(at[0], 0.03, at[1]);
        s.rotation.y = hash(bi, 2, 15) * Math.PI;
        s.renderOrder = 1;
        wear.add(s);
      }
    }
    if (hash(bi, 4, 16) < 0.6) {
      // Yard things hugging a corner, outside, where nobody walks.
      const corner = Math.floor(hash(bi, 6, 17) * 4);
      const cx = corner & 1 ? x1 : x0;
      const cz = corner & 2 ? z1 : z0;
      const ox = corner & 1 ? 1 : -1;
      const oz = corner & 2 ? 1 : -1;
      if (open(Math.floor((cx + ox * 0.6) / TILE), Math.floor((cz + oz * 0.6) / TILE))) {
        const pile = new THREE.Group();
        pile.position.set(cx + ox * 0.45, 0, cz + oz * 0.45);
        // A home left in a hurry, not a fort (battleground-atmosphere.md item 8): a woodpile, a water butt or two bins,
        // all low and against the wall.
        const kind = hash(bi, 8, 19);
        const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, ry = 0) => {
          const m = new THREE.Mesh(yardGeo(new THREE.BoxGeometry(w, h, d), hex), yardAll);
          m.position.set(x, y, z);
          m.rotation.y = ry;
          m.castShadow = m.receiveShadow = true;
          pile.add(m);
        };
        const drum = (r: number, h: number, x: number, z: number, hex: number, lid: number) => {
          const m = new THREE.Mesh(yardGeo(new THREE.CylinderGeometry(r, r * 0.92, h, 8), hex), yardAll);
          m.position.set(x, h / 2, z);
          m.castShadow = m.receiveShadow = true;
          const top = new THREE.Mesh(yardGeo(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.05, 8), lid), yardAll);
          top.position.set(x, h + 0.02, z);
          pile.add(m, top);
        };
        if (kind < 0.45) {
          // Logs in three rows along the wall, cut ends pale.
          for (let row = 0; row < 3; row++) for (let k = 0; k < 6 - row; k++) box(0.6, 0.17, 0.17, -ox * (0.1 + k * 0.19 + row * 0.09), 0.09 + row * 0.17, -oz * 0.02, k % 2 ? 0x7a5a3a : 0x8a6a48, Math.PI / 2);
        } else if (kind < 0.75) drum(0.3, 0.9, -ox * 0.2, -oz * 0.2, 0x3f5a3a, 0x2f4a2e);
        else {
          drum(0.25, 0.9, -ox * 0.15, -oz * 0.2, 0x4a5a4a, 0x3a4a3a);
          drum(0.25, 0.9, -ox * 0.7, -oz * 0.2, 0x4a5a4a, 0x3a4a3a);
        }
        wear.add(pile);
      }
    }
  });
  scene.add(mergeStatic(wear, { bake: true }));

  // ---------- building interiors: walls and windows, shown only when you're inside
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xece4d4, flatShading: true });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, flatShading: true });
  // A faint warm cast in the glass: the room behind it has its lights on.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x3a2610, transparent: true, opacity: 0.35, roughness: 0.1 });
  // From above, only the house you're in opens up, its walls in the room colour (at eye level see allInteriors below).
  const interiors = BUILDINGS.map((b) => {
    const g = new THREE.Group();
    const walls: THREE.Matrix4[] = [];
    const windows: THREE.Matrix4[] = [];
    for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
      for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
        const t = MAP[ty][tx];
        const m = new THREE.Matrix4().makeTranslation(tx * TILE + TILE / 2, 1.3, ty * TILE + TILE / 2);
        if (t === '#') walls.push(m);
        if (t === 'w') windows.push(m);
      }
    }
    const wi = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 2.6, TILE), wallMat, walls.length);
    walls.forEach((m, i) => wi.setMatrixAt(i, m));
    wi.castShadow = true;
    g.add(wi);
    if (windows.length) {
      const sill = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.9, TILE), sillMat, windows.length);
      const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.9, 1.5, TILE * 0.25), glassMat, windows.length);
      windows.forEach((m, i) => {
        sill.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, -0.85, 0).premultiply(m));
        glass.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, 0.35, 0).premultiply(m));
      });
      g.add(sill, glass);
    }
    g.visible = false;
    scene.add(g);
    return g;
  });

  /**
   * The facade kit at eye level (battleground-atmosphere.md item 4): a dark wear band at the foot of every outside wall, an
   * eave board under the roof, corner posts, window frames (lintel, jambs, a mullion) and a sill ledge, in the place's
   * trim colour. One instanced box mesh for the whole map; it shows with the real walls (shoulder view and first person).
   */
  const facadeKit = () => {
    const parts: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const piece = (x: number, y: number, z: number, along: number, high: number, proud: number, alongX: boolean, hex: number | THREE.Color) => {
      sc.set(alongX ? along : proud, high, alongX ? proud : along);
      parts.push({ m: new THREE.Matrix4().compose(v.set(x, y, z), q, sc), c: hex instanceof THREE.Color ? hex : new THREE.Color(hex) });
    };
    BUILDINGS.forEach((b, bi) => {
      const look = houseLook(bi);
      const band = new THREE.Color(look.wall).multiplyScalar(0.62).lerp(new THREE.Color(0x5a4a38), 0.3);
      const inB = (x: number, y: number) => x >= b.x0 && y >= b.y0 && x < b.x0 + b.w && y < b.y0 + b.h;
      for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
        for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
          const t = MAP[ty][tx];
          if (t !== '#' && t !== 'w') continue;
          for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (inB(tx + nx, ty + ny)) continue;
            const alongX = ny !== 0; // the face runs along x when its normal is along y
            const face = (proud: number) => [tx * TILE + TILE / 2 + nx * (TILE / 2 + proud / 2), ty * TILE + TILE / 2 + ny * (TILE / 2 + proud / 2)];
            let [fx, fz] = face(0.06);
            piece(fx, 0.225, fz, TILE, 0.45, 0.06, alongX, band);
            [fx, fz] = face(0.08);
            piece(fx, 2.49, fz, TILE, 0.22, 0.08, alongX, look.trim);
            if (t === 'w') {
              piece(fx, 2.42, fz, 1.9, 0.12, 0.08, alongX, look.trim);
              const ax = alongX ? 1 : 0;
              const az = alongX ? 0 : 1;
              for (const o of [-0.9, 0.9]) piece(fx + ax * o, 1.65, fz + az * o, 0.12, 1.5, 0.08, alongX, look.trim);
              [fx, fz] = face(0.04);
              piece(fx, 1.65, fz, 0.06, 1.5, 0.04, alongX, look.trim);
              [fx, fz] = face(0.22);
              piece(fx, 0.92, fz, TILE, 0.08, 0.22, alongX, new THREE.Color(look.trim).multiplyScalar(0.85));
            }
          }
        }
      }
      for (const [cx, cz] of [[b.x0, b.y0], [b.x0 + b.w, b.y0], [b.x0, b.y0 + b.h], [b.x0 + b.w, b.y0 + b.h]]) piece(cx * TILE, 1.3, cz * TILE, 0.16, 2.6, 0.16, true, look.trim);
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), parts.length);
    parts.forEach((p, i) => {
      mesh.setMatrixAt(i, p.m);
      mesh.setColorAt(i, p.c);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'facade kit';
    return mesh;
  };

  // In first person (and over the shoulder) every house shows its real walls at once, in its own colour: one instanced
  // wall, sill and glass mesh for the whole map (the per-building ones above stay for the view from above, where only
  // the house you're in opens up).
  const allInteriors = (() => {
    const g = new THREE.Group();
    const walls: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const windows: THREE.Matrix4[] = [];
    BUILDINGS.forEach((b, bi) => {
      const c = new THREE.Color(houseLook(bi).wall);
      for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
        for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
          const t = MAP[ty][tx];
          const m = new THREE.Matrix4().makeTranslation(tx * TILE + TILE / 2, 1.3, ty * TILE + TILE / 2);
          if (t === '#') walls.push({ m, c });
          if (t === 'w') windows.push(m);
        }
      }
    });
    const wallAll = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const wi = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 2.6, TILE), wallAll, walls.length);
    walls.forEach((w, i) => {
      wi.setMatrixAt(i, w.m);
      wi.setColorAt(i, w.c);
    });
    wi.castShadow = true;
    g.add(wi);
    const sill = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.9, TILE), sillMat, Math.max(1, windows.length));
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.9, 1.5, TILE * 0.25), glassMat, Math.max(1, windows.length));
    windows.forEach((m, i) => {
      sill.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, -0.85, 0).premultiply(m));
      glass.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, 0.35, 0).premultiply(m));
    });
    sill.count = glass.count = windows.length;
    g.add(sill, glass);
    g.add(facadeKit());
    g.visible = false;
    scene.add(g);
    return g;
  })();

  // ---------- first-person roofs: a gabled roof on the real walls, a ceiling under it (all of them merged: three draw calls)
  const roofs = mergeStatic(
    (() => {
      const g = new THREE.Group();
      BUILDINGS.forEach((b, i) => {
        // The rise the sim walks on (sim/roofs.ts): a gable, or flat for the flat-roofed models.
        g.add(buildRoof(b.x0 * TILE, b.y0 * TILE, b.w * TILE, b.h * TILE, b.barn, i, roofRise(b)));
        // A lamp or two on the ceiling, each with a warm halo on the plaster round it.
        const w = b.w * TILE;
        const d = b.h * TILE;
        const n = Math.max(w, d) >= 12 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const f = n === 1 ? 0.5 : (k + 0.75) / (n + 0.5);
          const x = b.x0 * TILE + (w >= d ? w * f : w / 2);
          const z = b.y0 * TILE + (w >= d ? d / 2 : d * f);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.55), lampMats.ceilingLamp);
          lamp.position.set(x, 2.54, z);
          const halo = new THREE.Mesh(glowDisc(2.2, 0x6a4420).rotateX(Math.PI / 2), glowMat);
          halo.position.set(x, 2.565, z);
          halo.name = 'ceiling glow';
          g.add(lamp, halo);
        }
      });
      return g;
    })(),
    { bake: true },
  );
  roofs.traverse((o) => o instanceof THREE.Mesh && o.material === glowMat && glows.push(o));
  roofs.visible = false;
  scene.add(roofs);

  /** The door frames drawn on each house's walls: tiny meshes, one call each, hidden from the plane. */
  const jamberMeshes: THREE.Mesh[] = [];

  // ---------- from above, a ceiling over every room that only casts a shadow (nothing drawn): the shells' one-sided roofs
  // let the sun in through their far slopes, and a room seen through its doorway should lie in the shade of its roof,
  // lit by its own lamps. At eye level the real roofs and ceilings above do this.
  const shade = new THREE.Mesh(
    mergeGeometries(BUILDINGS.map((b) => new THREE.PlaneGeometry(b.w * TILE - 0.9, b.h * TILE - 0.9).rotateX(Math.PI / 2).translate(b.x0 * TILE + (b.w * TILE) / 2, EAVE - 0.1, b.y0 * TILE + (b.h * TILE) / 2))),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }),
  );
  shade.castShadow = true;
  shade.name = 'room shade';
  scene.add(shade);

  /**
   * Opens a building's shell at its doorways: finds how far in the model's own wall stands behind each frame (some stand
   * inside their footprint, some at the back of a porch), cuts the hole through it (cutDoorways), and gives the passage
   * on through the ring of wall tiles its sides, from that wall to the room, in the room's wall colour. The sides are
   * part of the shell (they fade and hide with it; at eye level the real walls stand there) and never higher than its
   * roof above them, so none pokes through a low eave.
   */
  const jambBase = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const openDoorways = (root: THREE.Object3D, bi: number) => {
    const doors = doorList.filter((d) => d.building === bi);
    if (!doors.length) return;
    root.updateMatrixWorld(true);
    const shell: THREE.Object3D[] = [];
    root.traverse((o) => o instanceof THREE.Mesh && shell.push(o));
    const ray = new THREE.Raycaster();
    const from = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const hit = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
      ray.set(from.set(x, y, z), dir.set(dx, dy, dz));
      return ray.intersectObjects(shell, false)[0]?.distance;
    };
    // A doorway's own frame of reference: s metres in from the wall line, a metres along it.
    const point = (d: Doorway, s: number, a: number) => (d.horizontal ? { x: d.x + a, z: d.z - d.out * s } : { x: d.x - d.out * s, z: d.z + a });
    const roofAt = (x: number, z: number) => 40 - (hit(x, 40, z, 0, -1, 0) ?? -Infinity);
    /** How far in the model's wall stands: the deepest wall face met walking in at waist height, at most a tile. */
    const wallDepth = (d: Doorway) => {
      let deepest = 0;
      for (const a of [-1.2, 0, 1.2]) {
        const p = point(d, -2, a);
        const t = hit(p.x, 1.2, p.z, d.horizontal ? 0 : -d.out, 0, d.horizontal ? -d.out : 0);
        if (t !== undefined && t - 2 < TILE) deepest = Math.max(deepest, t - 2);
      }
      return deepest;
    };
    const depths = doors.map(wallDepth);
    cutDoorways(root, doors.map((d, k) => doorwayCut(d, Math.min(TILE, depths[k] + 0.4))));
    const b = BUILDINGS[bi];
    const pos: number[] = [];
    doors.forEach((d, k) => {
      const s0 = Math.min(depths[k], TILE - 0.2);
      for (const side of [-1, 1]) {
        const p = [s0, (s0 + TILE) / 2, TILE].map((s) => {
          const q = point(d, s, side * DOOR_HALF);
          return { ...q, h: Math.max(0, Math.min(DOOR_HEIGHT, roofAt(q.x, q.z) - 0.06)) };
        });
        for (let j = 0; j < p.length - 1; j++) {
          const [u, v] = [p[j], p[j + 1]];
          pos.push(u.x, 0, u.z, v.x, 0, v.z, v.x, v.h, v.z, u.x, 0, u.z, v.x, v.h, v.z, u.x, u.h, u.z);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.translate(-root.position.x, -root.position.y, -root.position.z);
    geo.computeVertexNormals();
    paint(geo, houseLook(bi).wall);
    const mat = cloneMaterial(jambBase);
    mat.transparent = true;
    const jambs = new THREE.Mesh(geo, mat);
    jambs.name = 'doorway sides';
    jamberMeshes.push(jambs);
    root.add(jambs);
  };

  // ---------- exteriors: a suburban house per building, a red barn for barns
  const exteriors: (THREE.Object3D | null)[] = BUILDINGS.map(() => null);
  const fade = BUILDINGS.map(() => 1);
  const dressHouse = (i: number, model: THREE.Object3D) => {
    const b = BUILDINGS[i];
    const w = b.w * TILE;
    const d = b.h * TILE;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    const inner = model.clone(true);
    inner.position.set(-center.x, -box.min.y, -center.z);
    // Turn the model so its long side follows the building's long side.
    const turn = size.x >= size.z !== w >= d;
    const holder = new THREE.Group();
    holder.add(inner);
    if (turn) holder.rotation.y = Math.PI / 2;
    const fx = (turn ? d : w) / size.x;
    const fz = (turn ? w : d) / size.z;
    // As tall as the roof you can stand on (sim/roofs.ts): its ridge is the model's top, so feet sit on the tiles.
    holder.scale.set(fx, ridgeHeight(b) / size.y, fz);
    wrap.add(holder);
    wrap.position.set(b.x0 * TILE + w / 2, 0, b.y0 * TILE + d / 2);
    wrap.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = (o.material as THREE.Material).clone();
        // A tint per house so the rooftops don't all read the same from above.
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.color) m.color.multiply(new THREE.Color(houseLook(i).tint));
        // The pack's materials are fully metallic and the scene has no environment map: a metal with nothing to reflect is
        // black wherever the sun's highlight does not reach (every slope and wall facing away from it).
        m.metalness = 0;
        m.color.multiplyScalar(HOUSE_DIFFUSE);
      }
    });
    // The model's colours go into its vertices: one draw call per house. Its material is its own, so it can fade.
    mergeRigid(wrap);
    ownFadingMaterials(wrap);
    openDoorways(wrap, i);
    wrap.name = 'house';
    scene.add(wrap);
    exteriors[i] = wrap;
  };
  BUILDINGS.forEach((b, i) => {
    if (!b.barn) return;
    // Built to the walkable roof (sim/roofs.ts): walls to the eaves, the roof up to the ridge, so feet sit on it.
    const barn = buildBarn(b.w * TILE, b.h * TILE, EAVE, ridgeHeight(b) - EAVE);
    barn.position.set(b.x0 * TILE + (b.w * TILE) / 2, 0, b.y0 * TILE + (b.h * TILE) / 2);
    ownFadingMaterials(barn);
    openDoorways(barn, i);
    barn.name = 'barn';
    scene.add(barn);
    exteriors[i] = barn;
  });

  // ---------- everything loaded from the packs
  const crates = tilesOf('r');
  let crateMeshes: THREE.InstancedMesh[] = [];
  // 1.3 m tall (CRATE_TOP: rounds stop on it up to there, so it must look that tall), 1.05 x 2.1 m on the ground.
  const crateMatrices = crates.map((t) => place(t.x, t.y, 4.2, hash(t.tx, t.ty) * Math.PI).multiply(new THREE.Matrix4().makeScale(1, CRATE_TOP / (0.25 * 4.2), 1)));
  const crateAlive = crates.map(() => true);

  void (async () => {
    const names = [...new Set(['box-large', 'fence_simple', 'crops_cornStageD', 'flower_redA', 'flower_yellowB', 'stump_round', 'log_stack', ...Array.from({ length: 21 }, (_, i) => `house_type${String(i + 1).padStart(2, '0')}`)])];
    const models = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)] as const)));

    const chunked = (set: ReturnType<typeof instanceChunked>) => {
      set.group.name = 'field dressing';
      scene.add(set.group);
      nature.push(set);
      // Until the next cull, draw them all.
    };
    chunked(instanceChunked(models.crops_cornStageD, tilesOf('c').map((t) => place(t.x, t.y, 2.6, (hash(t.tx, t.ty) - 0.5) * 0.3)), 3));

    // Fences turn to follow their neighbours.
    // The Kenney rail sits on the edge of its tile; shift it to the middle, where the simulation's rail is.
    const centre = new THREE.Matrix4().makeTranslation(0, 0, 0.465);
    const fences = tilesOf('f').map((t) => place(t.x, t.y, 2, fenceVertical(t.tx, t.ty) ? Math.PI / 2 : 0).multiply(centre));
    chunked(instanceChunked(models.fence_simple, fences, 2));

    const crateGroup = instance(models['box-large'], crateMatrices);
    crateMeshes = crateGroup.children as THREE.InstancedMesh[];
    scene.add(crateGroup);

    // Colour in the fields: flowers, tall grass, stumps and log piles.
    const fields = tilesOf('g').filter((t) => hash(t.tx, t.ty, 7) < 0.12);
    chunked(instanceChunked(models.flower_redA, fields.filter((_, i) => i % 4 === 0).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6)), 1.5));
    chunked(instanceChunked(models.flower_yellowB, fields.filter((_, i) => i % 4 === 1).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6)), 1.5));
    chunked(instanceChunked(models.stump_round, fields.filter((_, i) => i % 16 === 3).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6)), 1.5));
    chunked(instanceChunked(models.log_stack, fields.filter((_, i) => i % 16 === 7).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6)), 2));

    BUILDINGS.forEach((b, i) => {
      if (!b.barn) dressHouse(i, models[`house_type${String(b.model + 1).padStart(2, '0')}`]);
    });
  })();

  const inBuilding = (x: number, y: number) =>
    BUILDINGS.findIndex((b) => x >= b.x0 * TILE && y >= b.y0 * TILE && x < (b.x0 + b.w) * TILE && y < (b.y0 + b.h) * TILE);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const view: ChunkView = { frustum: new THREE.Frustum(), x: 0, y: 0, z: 0, shadow: null, reach: 1, far: Infinity, lodNear: Infinity, frame: 0 };
  const projView = new THREE.Matrix4();
  const camAt = new THREE.Vector3();
  return {
    setOverview: (on) => {
      for (const m of jamberMeshes) m.visible = !on;
    },
    track: (set) => nature.push(set as (typeof nature)[number]),
    cull: (camera, o) => {
      camera.updateMatrixWorld();
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      view.frustum.setFromProjectionMatrix(projView);
      const p = camera.getWorldPosition(camAt);
      view.x = p.x;
      view.y = p.y;
      view.z = p.z;
      view.shadow = o.shadow;
      view.reach = o.reach;
      view.lodNear = o.lodNear;
      view.far = o.far;
      view.frame++;
      natureUniforms.uReach.value = o.reach;
      const glowOn = o.glow ?? true;
      for (const g of glows) g.visible = glowOn;
      nature.forEach((n) => n.update(view));
    },
    update: (state, selfX, selfY, firstPerson = false, selfZ = 0) => {
      // Wind, and the canopy cut-out around you (4.5 m) so trees never hide your fighter.
      updateNature(performance.now() / 1000, selfX, selfY, firstPerson ? 0 : 4.5);
      const inside = selfZ >= ROOF_LAYER ? -1 : inBuilding(selfX, selfY);
      // Furniture and rugs are always there (from above you see them through the doorways); their shadows only matter
      // once a house opens up or at eye level (under a shell the roof's shadow covers them).
      const opened = firstPerson || fade.some((f) => f < 0.98) || inside >= 0;
      // Off while a house is open from above, so the room you stand in keeps its daylight as before.
      shade.visible = !opened;
      if (opened !== furnitureShadows) {
        furnitureShadows = opened;
        furniture.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = opened));
      }
      roofs.visible = firstPerson;
      allInteriors.visible = firstPerson;
      BUILDINGS.forEach((_, i) => {
        if (firstPerson) {
          // At eye level the house is its real walls, doors, windows and a roof: the shell
          // models (built to be seen from above) would be walls you walk through.
          const ext = exteriors[i];
          if (ext) ext.visible = false;
          interiors[i].visible = false;
          doorways.forEach((d) => d.setHidden(i, false));
          fade[i] = 1;
          return;
        }
        const want = i === inside ? 0 : 1;
        fade[i] += (want - fade[i]) * 0.2;
        const ext = exteriors[i];
        if (ext) {
          ext.visible = fade[i] > 0.02;
          ext.traverse((o) => {
            if (o instanceof THREE.Mesh) (o.material as THREE.Material).opacity = fade[i];
          });
        }
        interiors[i].visible = fade[i] < 0.98;
        // Inside, the walls are cut down to waist height so the whole room reads from above.
        interiors[i].scale.y = firstPerson ? 1 : 0.4 + 0.6 * fade[i];
        doorways.forEach((d) => d.setHidden(i, !(fade[i] > 0.5)));
      });
      crates.forEach((t, k) => {
        const alive = state.racks[t.ty * SIZE + t.tx] > 0;
        if (alive === crateAlive[k] || !crateMeshes.length) return;
        crateAlive[k] = alive;
        for (const im of crateMeshes) {
          im.setMatrixAt(k, alive ? crateMatrices[k] : zero);
          im.instanceMatrix.needsUpdate = true;
        }
      });
    },
  };
};
