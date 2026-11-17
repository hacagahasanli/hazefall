import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { BUILDINGS, fenceVertical, MAP, SIZE, TILE, treeSpot, WORLD } from '../sim/constants';

import type { GameState } from '../sim/types';

/**
 * The world you fight in, dressed with Kenney's CC0 models (see ASSETS.md):
 * trees, bushes, rocks, crops, fences and crates are GPU-instanced; houses get a suburban
 * exterior scaled to their footprint that disappears when you walk in, showing the rooms.
 */

const loader = new GLTFLoader();
const load = (name: string) => loader.loadAsync(`/assets/models/${name}.glb`).then((g) => g.scene);

const TINTS = [0xffffff, 0xffc9b0, 0xc8dcff, 0xfff0b8, 0xe0ffd0, 0xffd6e8, 0xd8d0ff];
const TREES = ['tree_oak', 'tree_detailed', 'tree_default', 'tree_fat', 'tree_tall', 'tree_pineRoundC'];

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

const place = (x: number, y: number, scale: number, rotY = 0, h = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, h, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(scale, scale, scale));

// ---------------------------------------------------------------------------

const paintGround = () => {
  const px = 16;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE * px;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      const t = MAP[ty][tx];
      const n = hash(tx, ty);
      let col: string;
      if (t === 'a') col = '#4a4f5e';
      else if (t === 'p') col = `hsl(32, 38%, ${44 + n * 6}%)`;
      else if ('.lwr#'.includes(t) && insideBuilding(tx, ty)) col = `hsl(30, 35%, ${58 + n * 5}%)`;
      else if (t === 'c') col = `hsl(55, 45%, ${45 + n * 6}%)`;
      else if (t === 'k') col = `hsl(30, 10%, ${50 + n * 6}%)`;
      else col = `hsl(${100 + n * 18}, ${42 + n * 10}%, ${40 + n * 8}%)`;
      g.fillStyle = col;
      g.fillRect(tx * px, ty * px, px, px);
      if (t === '.' || t === 'l') {
        g.strokeStyle = 'rgba(80,50,20,0.18)';
        g.beginPath();
        g.moveTo(tx * px, ty * px + px / 2);
        g.lineTo(tx * px + px, ty * px + px / 2);
        g.stroke();
      }
    }
  }
  // Soft blades of grass.
  for (let i = 0; i < 9000; i++) {
    const x = hash(i, 1) * c.width;
    const y = hash(i, 2) * c.height;
    const t = MAP[Math.floor(y / px)][Math.floor(x / px)];
    if (t !== 'g' && t !== 't') continue;
    g.fillStyle = `rgba(${hash(i, 3) < 0.5 ? '40,90,40' : '150,200,90'},0.35)`;
    g.fillRect(x, y, 1.5, 3);
  }
  // Road centre line.
  g.strokeStyle = 'rgba(255,210,63,0.55)';
  g.setLineDash([10, 10]);
  g.lineWidth = 2;
  g.beginPath();
  for (let tx = 0; tx < SIZE; tx++) {
    const ty = MAP.findIndex((row, y) => row[tx] === 'a' && MAP[y + 1]?.[tx] === 'a');
    if (ty < 0) continue;
    const y = (ty + 1) * px;
    if (tx === 0) g.moveTo(0, y);
    else g.lineTo(tx * px + px / 2, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

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
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.1), white);
  door.position.set(0, 1.5, d / 2 + 0.06);
  g.add(door);
  return g;
};

export interface World {
  /** Hide the house you're standing in, swap crates for broken ones. */
  update: (state: GameState, selfX: number, selfY: number) => void;
}

export const buildWorld = (scene: THREE.Scene): World => {
  // ---------- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ map: paintGround(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD / 2, 0, WORLD / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(WORLD / 2, -0.05, WORLD / 2);
  scene.add(outside);

  // ---------- building interiors: walls and windows, shown only when you're inside
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xece4d4, flatShading: true });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.35, roughness: 0.1 });
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
        (o.material as THREE.Material).transparent = true;
        // A tint per house so the rooftops don't all read the same from above.
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.color) m.color.multiply(new THREE.Color(TINTS[i % TINTS.length]));
      }
    });
    scene.add(wrap);
    exteriors[i] = wrap;
  };
  BUILDINGS.forEach((b, i) => {
    if (!b.barn) return;
    const barn = buildBarn(b.w * TILE, b.h * TILE);
    barn.position.set(b.x0 * TILE + (b.w * TILE) / 2, 0, b.y0 * TILE + (b.h * TILE) / 2);
    barn.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        (o.material as THREE.Material).transparent = true;
      }
    });
    scene.add(barn);
    exteriors[i] = barn;
  });

  // ---------- everything loaded from the packs
  const crates = tilesOf('r');
  let crateMeshes: THREE.InstancedMesh[] = [];
  const crateMatrices = crates.map((t) => place(t.x, t.y, 4.2, hash(t.tx, t.ty) * Math.PI));
  const crateAlive = crates.map(() => true);

  void (async () => {
    const names = [...new Set([...TREES, 'plant_bushLarge', 'plant_bushDetailed', 'rock_largeA', 'rock_largeC', 'rock_tallB', 'box-large', 'fence_simple', 'crops_cornStageD', 'flower_redA', 'flower_yellowB', 'grass_large', 'stump_round', 'log_stack', ...Array.from({ length: 21 }, (_, i) => `house_type${String(i + 1).padStart(2, '0')}`)])];
    const models = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)] as const)));

    // Trees: tall, varied, a little random in size and turn.
    const byTree = new Map<string, THREE.Matrix4[]>();
    for (const t of tilesOf('t')) {
      const name = TREES[Math.floor(hash(t.tx, t.ty) * TREES.length)];
      const s = 6 + hash(t.tx, t.ty, 1) * 3;
      // Same spot as the trunk the simulation collides with.
      const spot = treeSpot(t.tx, t.ty);
      (byTree.get(name) ?? byTree.set(name, []).get(name)!).push(place(spot.x, spot.y, s, hash(t.tx, t.ty, 4) * Math.PI * 2));
    }
    for (const [name, ms] of byTree) scene.add(instance(models[name], ms));

    const bushes = tilesOf('b');
    scene.add(instance(models.plant_bushLarge, bushes.filter((_, i) => i % 2 === 0).map((t) => place(t.x, t.y, 6.5, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.plant_bushDetailed, bushes.filter((_, i) => i % 2 === 1).map((t) => place(t.x, t.y, 6, hash(t.tx, t.ty) * 6))));

    const rocks = tilesOf('k');
    scene.add(instance(models.rock_largeA, rocks.filter((_, i) => i % 3 === 0).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.rock_largeC, rocks.filter((_, i) => i % 3 === 1).map((t) => place(t.x, t.y, 2.2, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.rock_tallB, rocks.filter((_, i) => i % 3 === 2).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));

    scene.add(instance(models.crops_cornStageD, tilesOf('c').map((t) => place(t.x, t.y, 2.6, (hash(t.tx, t.ty) - 0.5) * 0.3))));

    // Fences turn to follow their neighbours.
    // The Kenney rail sits on the edge of its tile; shift it to the middle, where the simulation's rail is.
    const centre = new THREE.Matrix4().makeTranslation(0, 0, 0.465);
    const fences = tilesOf('f').map((t) => place(t.x, t.y, 2, fenceVertical(t.tx, t.ty) ? Math.PI / 2 : 0).multiply(centre));
    scene.add(instance(models.fence_simple, fences));

    const crateGroup = instance(models['box-large'], crateMatrices);
    crateMeshes = crateGroup.children as THREE.InstancedMesh[];
    scene.add(crateGroup);

    // Colour in the fields: flowers, tall grass, stumps and log piles.
    const fields = tilesOf('g').filter((t) => hash(t.tx, t.ty, 7) < 0.12);
    scene.add(instance(models.flower_redA, fields.filter((_, i) => i % 4 === 0).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.flower_yellowB, fields.filter((_, i) => i % 4 === 1).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.grass_large, fields.filter((_, i) => i % 4 === 2).map((t) => place(t.x, t.y, 3, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.stump_round, fields.filter((_, i) => i % 16 === 3).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));
    scene.add(instance(models.log_stack, fields.filter((_, i) => i % 16 === 7).map((t) => place(t.x, t.y, 2.4, hash(t.tx, t.ty) * 6))));

    BUILDINGS.forEach((b, i) => {
      if (!b.barn) dressHouse(i, models[`house_type${String(b.model + 1).padStart(2, '0')}`]);
    });
  })();

  const inBuilding = (x: number, y: number) =>
    BUILDINGS.findIndex((b) => x >= b.x0 * TILE && y >= b.y0 * TILE && x < (b.x0 + b.w) * TILE && y < (b.y0 + b.h) * TILE);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    update: (state, selfX, selfY) => {
      const inside = inBuilding(selfX, selfY);
      BUILDINGS.forEach((_, i) => {
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
