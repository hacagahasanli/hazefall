import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { assetUrl } from '../../lib/assets';
import { BUILDINGS, fenceVertical, MAP, SIZE, TILE, tileHash, treeSpot, WORLD } from '../sim/constants';

import { buildFurniture, buildRugs } from './furniture';
import { cloneMaterial, collectParts, mergeParts, mergeRigid, mergeStatic } from './merge';
import { buildRoads } from './roads';
import { buildBushes, buildGrass, buildRocks, buildTallGrass, buildTrees, natureUniforms, outerForest, paintTerrain, updateNature } from './nature';

import { chunkedInstances } from './chunks';

import type { ChunkView } from './chunks';

import type { GameState } from '../sim/types';

/**
 * The world you fight in, dressed with Kenney's CC0 models (see ASSETS.md):
 * trees, bushes, rocks, crops, fences and crates are GPU-instanced; houses get a suburban
 * exterior scaled to their footprint that disappears when you walk in, showing the rooms.
 */

const loader = new GLTFLoader();
const load = (name: string) => loader.loadAsync(assetUrl(`models/${name}.glb`)).then((g) => g.scene);

const TINTS = [0xffffff, 0xffc9b0, 0xc8dcff, 0xfff0b8, 0xe0ffd0, 0xffd6e8, 0xd8d0ff];
/** Siding colours for the houses in first person, and their roofs. */
const FACADES = [0xd9c8a8, 0xb9c8d6, 0xe4d7c1, 0xc9a98a, 0xa9b996, 0xd8b8a4, 0xc4c0b6];
const ROOFS = [0x7a3a2e, 0x4a5560, 0x5a6b45, 0x6b4a32, 0x3f4650];

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
  ceiling: new THREE.MeshBasicMaterial({ color: 0xa8a092 }),
};

const buildRoof = (x0: number, z0: number, w: number, d: number, barn: boolean, i: number) => {
  const g = new THREE.Group();
  const H = 2.6;
  const o = 0.4;
  const alongX = w >= d;
  const L = (alongX ? w : d) + o * 2;
  const S = (alongX ? d : w) + o * 2;
  const rise = Math.min(barn ? 3.2 : 2.2, S * (barn ? 0.42 : 0.32));
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
  const roof = new THREE.Mesh(paint(slopes, barn ? 0x5b2a24 : ROOFS[i % ROOFS.length]), roofMats.roof);
  roof.castShadow = true;
  roof.receiveShadow = true;
  // The gables: triangles closing the ends between the wall tops and the ridge.
  const gables = new THREE.BufferGeometry();
  gables.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...pos(o, o, H), ...pos(o, S - o, H), ...pos(o, S / 2, H + rise - 0.1), ...pos(L - o, o, H), ...pos(L - o, S / 2, H + rise - 0.1), ...pos(L - o, S - o, H)], 3),
  );
  gables.computeVertexNormals();
  const gable = new THREE.Mesh(paint(gables, barn ? 0x9b3b30 : FACADES[i % FACADES.length]), roofMats.gable);
  gable.castShadow = true;
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

/** A red barn with white trim and a gable roof, built to the footprint. */
const buildBarn = (w: number, d: number) => {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb23b3b, flatShading: true, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3a36, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), red);
  body.position.y = 2.1;
  g.add(body);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.3, 0.35), white);
    post.position.set(x, 2.15, z);
    g.add(post);
  }
  const roof = new THREE.Shape();
  roof.moveTo(-d / 2 - 0.4, 0);
  roof.lineTo(0, 3.2);
  roof.lineTo(d / 2 + 0.4, 0);
  roof.lineTo(-d / 2 - 0.4, 0);
  const geo = new THREE.ExtrudeGeometry(roof, { depth: w + 0.8, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.8) / 2);
  const roofMesh = new THREE.Mesh(geo, roofMat);
  roofMesh.rotation.y = Math.PI / 2;
  roofMesh.position.y = 4.2;
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
}

export interface World {
  /** Before each render: draw only the chunks of trees, bushes, rocks and grass this camera can see. */
  cull: (camera: THREE.Camera, o: CullOptions) => void;
  /** Another chunked set (the clouds) to cull with the rest. */
  track: (set: { update: (v: ChunkView) => void }) => void;
  /** Hide the house you're standing in, swap crates for broken ones. */
  /** `firstPerson`: walls stay full height inside and the tree canopies are never cut away. */
  update: (state: GameState, selfX: number, selfY: number, firstPerson?: boolean) => void;
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
    buildTrees([...tilesOf('t').map((t) => ({ ...treeSpot(t.tx, t.ty), seed: tileHash(t.tx, t.ty, 1) })), ...outerForest()]),
    buildBushes(tilesOf('b').map(spot)),
    buildRocks(tilesOf('k').map(spot)),
    buildGrass(),
    buildTallGrass(),
  ];
  ['trees', 'bushes', 'rocks', 'grass', 'tall grass'].forEach((name, i) => (nature[i].group.name = name));
  nature.forEach((n) => scene.add(n.group));
  scene.add(mergeStatic(buildRoads()));

  // ---------- furniture and rugs: under the house shells from above, so drawn only once a house opens up (you walk in)
  // or at eye level
  const furniture = buildFurniture();
  const rugs = mergeStatic(buildRugs(), { bake: true });
  scene.add(furniture, rugs);

  // ---------- doorways: a frame, a dark opening and a doormat where the real doors are, so you
  // can see from outside where to walk in (the house models' own doors are only decoration)
  /**
   * The doorway panels, per building: shown from above (where the house is a shell model you cannot see into), gone in
   * first person (where you see the real room through the door). They used to be near-black, so from above every
   * entrance read as a dark hole while the same door in first person showed a bright room: now the panel is the lit room
   * colour, self-lit so roof and eave shadows cannot darken it, and both cameras share a warm pool of light on the
   * threshold. All of it is unlit or emissive, so it reads the same on every quality tier (no point lights needed).
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
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffcf8a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const poolGeo = new THREE.PlaneGeometry(4.6, 3.4).rotateX(-Math.PI / 2);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.7 });
  const roomMat = new THREE.MeshStandardMaterial({ color: 0xead8b4, emissive: 0x6b4c26, emissiveIntensity: 0.9, roughness: 1 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  // Built per building, then merged per material over the whole map (frames, doormats, openings, light pools: four
  // draw calls); a building's doors are hidden by collapsing its triangles in those batches.
  const doorParts = BUILDINGS.flatMap((b, bi) => {
    const g = new THREE.Group();
    const ring = (x: number, y: number) => x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
    const seen = new Set<string>();
    for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
      for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
        if (!ring(tx, ty) || MAP[ty][tx] !== '.' || seen.has(`${tx},${ty}`)) continue;
        // A door is two tiles along the wall: find its partner.
        const horizontal = ty === b.y0 || ty === b.y0 + b.h - 1;
        const nx = horizontal ? tx + 1 : tx;
        const ny = horizontal ? ty : ty + 1;
        seen.add(`${tx},${ty}`);
        seen.add(`${nx},${ny}`);
        const out = horizontal ? (ty === b.y0 ? -1 : 1) : tx === b.x0 ? -1 : 1;
        const cx = horizontal ? (tx + 1) * TILE : tx * TILE + TILE / 2 + out * (TILE / 2);
        const cz = horizontal ? ty * TILE + TILE / 2 + out * (TILE / 2) : (ty + 1) * TILE;
        const holder = new THREE.Group();
        holder.position.set(cx, 0, cz);
        holder.rotation.y = horizontal ? 0 : Math.PI / 2;
        // After the quarter turn local +z is world +x, so 'out' is the outward side in both cases.
        const sgn = out;
        const opening = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 0.08), roomMat);
        opening.position.set(0, 1.2, sgn * 0.06);
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
        holder.add(opening, lintel, postL, postR, mat);
        holder.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
        holder.add(pool);
        g.add(holder);
      }
    }
    return collectParts(g, bi);
  });
  const doorBatches = mergeParts(doorParts);
  doorBatches.forEach((d) => scene.add(d.mesh));
  const openingBatch = doorBatches.find((d) => d.mesh.material === roomMat);

  // ---------- building interiors: walls and windows, shown only when you're inside
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xece4d4, flatShading: true });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.35, roughness: 0.1 });
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

  // In first person (and over the shoulder) every house shows its real walls at once, in its own colour: one instanced
  // wall, sill and glass mesh for the whole map (the per-building ones above stay for the view from above, where only
  // the house you're in opens up).
  const allInteriors = (() => {
    const g = new THREE.Group();
    const walls: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const windows: THREE.Matrix4[] = [];
    BUILDINGS.forEach((b, bi) => {
      const c = new THREE.Color(b.barn ? 0x9b3b30 : FACADES[bi % FACADES.length]);
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
    g.visible = false;
    scene.add(g);
    return g;
  })();

  // ---------- first-person roofs: a gabled roof on the real walls, a ceiling under it (all of them merged: three draw calls)
  const roofs = mergeStatic(
    (() => {
      const g = new THREE.Group();
      BUILDINGS.forEach((b, i) => g.add(buildRoof(b.x0 * TILE, b.y0 * TILE, b.w * TILE, b.h * TILE, b.barn, i)));
      return g;
    })(),
    { bake: true },
  );
  roofs.visible = false;
  scene.add(roofs);

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
    holder.scale.set(fx, Math.min(fx, fz) * 0.85, fz);
    wrap.add(holder);
    wrap.position.set(b.x0 * TILE + w / 2, 0, b.y0 * TILE + d / 2);
    wrap.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = (o.material as THREE.Material).clone();
        // A tint per house so the rooftops don't all read the same from above.
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.color) m.color.multiply(new THREE.Color(TINTS[i % TINTS.length]));
      }
    });
    // The model's colours go into its vertices: one draw call per house. Its material is its own, so it can fade.
    mergeRigid(wrap);
    ownFadingMaterials(wrap);
    wrap.name = 'house';
    scene.add(wrap);
    exteriors[i] = wrap;
  };
  BUILDINGS.forEach((b, i) => {
    if (!b.barn) return;
    const barn = buildBarn(b.w * TILE, b.h * TILE);
    barn.position.set(b.x0 * TILE + (b.w * TILE) / 2, 0, b.y0 * TILE + (b.h * TILE) / 2);
    ownFadingMaterials(barn);
    barn.name = 'barn';
    scene.add(barn);
    exteriors[i] = barn;
  });

  // ---------- everything loaded from the packs
  const crates = tilesOf('r');
  let crateMeshes: THREE.InstancedMesh[] = [];
  const crateMatrices = crates.map((t) => place(t.x, t.y, 4.2, hash(t.tx, t.ty) * Math.PI));
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
      nature.forEach((n) => n.update(view));
    },
    update: (state, selfX, selfY, firstPerson = false) => {
      // Wind, and the canopy cut-out around you (4.5 m) so trees never hide your fighter.
      updateNature(performance.now() / 1000, selfX, selfY, firstPerson ? 0 : 4.5);
      const inside = inBuilding(selfX, selfY);
      furniture.visible = rugs.visible = firstPerson || fade.some((f) => f < 0.98) || inside >= 0;
      roofs.visible = firstPerson;
      allInteriors.visible = firstPerson;
      if (openingBatch) openingBatch.mesh.visible = !firstPerson;
      BUILDINGS.forEach((_, i) => {
        if (firstPerson) {
          // At eye level the house is its real walls, doors, windows and a roof: the shell
          // models (built to be seen from above) would be walls you walk through.
          const ext = exteriors[i];
          if (ext) ext.visible = false;
          interiors[i].visible = false;
          doorBatches.forEach((d) => d.setHidden(i, false));
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
        doorBatches.forEach((d) => d.setHidden(i, !(fade[i] > 0.5)));
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
