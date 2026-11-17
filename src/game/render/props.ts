import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { DISTRICTS, MAP, PROPS, RIVER, SIZE, TILE, railSides, riverCentre, tileHash } from '../sim/constants';

import type { Prop } from '../sim/constants';

/**
 * The lively bits of the map, built in code: parked cars, shipping containers, tents round a
 * campfire, a windmill whose sails turn, a pond with a pier, cows and sheep that wander and
 * graze, and a flock of birds overhead. Cars, containers, tents and the windmill stand on 'v'
 * tiles (solid for the simulation); everything else is decoration.
 */

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) => {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const cylX = (r: number, len: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) => {
  const g = new THREE.CylinderGeometry(r, r, len, 12).toNonIndexed();
  g.deleteAttribute('uv');
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const join = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
};
/** Height of the water surface and of the bridge decks (people on a deck stand at DECK_Y). */
export const WATER_Y = 0.12;
export const DECK_Y = 0.32;

/**
 * The river flows: pale flecks of foam drift downstream (west to east) along the current,
 * fastest in the middle, and fade in and out.
 */
const riverFlow = (scene: THREE.Scene) => {
  const n = 90;
  const mat = new THREE.MeshBasicMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.35, depthWrite: false });
  const flecks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.12).rotateX(-Math.PI / 2), mat, n);
  const seeds = Array.from({ length: n }, (_, i) => ({ x: tileHash(i, 3) * SIZE * TILE, off: (tileHash(i, 5) - 0.5) * 2 * RIVER.half * 0.85, v: 0.6 + tileHash(i, 9) * 0.5 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  scene.add(flecks);
  return (_time: number, dt: number) => {
    seeds.forEach((s, i) => {
      s.x += dt * s.v * (1.4 - Math.abs(s.off) / RIVER.half);
      if (s.x > SIZE * TILE) s.x = 0;
      const tx = s.x / TILE;
      const c = riverCentre(tx) + s.off;
      const slope = (riverCentre(tx + 0.5) - riverCentre(tx - 0.5)) / 1;
      const life = Math.sin((s.x / (SIZE * TILE)) * Math.PI * 9 + i) * 0.5 + 0.5;
      q.setFromAxisAngle(pos.set(0, 1, 0), -Math.atan(slope));
      sc.setScalar(0.4 + life * 0.8);
      const t = MAP[Math.floor(c)]?.[Math.floor(tx)];
      if (t !== 'o') sc.setScalar(0.0001);
      m.compose(pos.set(s.x, WATER_Y + 0.015, c * TILE), q, sc);
      flecks.setMatrixAt(i, m);
    });
    flecks.instanceMatrix.needsUpdate = true;
  };
};

/**
 * The river surface as one smooth ribbon that follows its curve (the tiles underneath only decide
 * where you swim), with a lighter tint near the banks where it is shallow.
 */
const riverSheet = () => {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new THREE.Color(0x2c6f9e);
  const shallow = new THREE.Color(0x5d9fb8);
  const across = 6;
  let row = 0;
  for (let tx = -3; tx <= SIZE + 3; tx += 0.25, row++) {
    const c = riverCentre(tx);
    for (let k = 0; k <= across; k++) {
      const f = k / across; // 0 = north bank, 1 = south bank
      const edge = Math.abs(f - 0.5) * 2;
      pos.push(tx * TILE, WATER_Y, (c + (f - 0.5) * 2 * (RIVER.half + 0.15)) * TILE);
      const cc = deep.clone().lerp(shallow, edge ** 2.5);
      col.push(cc.r, cc.g, cc.b);
    }
    if (row > 0) {
      const a = (row - 1) * (across + 1);
      const b = row * (across + 1);
      for (let k = 0; k < across; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2 }));
  m.receiveShadow = true;
  return m;
};

const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
const shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material = flat) => {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};

/** World centre of a prop's tile rectangle, and whether it runs along x. */
const centre = (p: Prop) => ({ x: (p.x0 + p.w / 2) * TILE, y: (p.y0 + p.h / 2) * TILE, alongX: p.w >= p.h });

// ---------------------------------------------------------------------------

const CAR_COLORS = [0xc0392b, 0xecf0f1, 0x2e6fb7, 0xf1c40f, 0x7f8c8d, 0x27ae60, 0x1c1f26, 0xe67e22];

const car = (p: Prop) => {
  const body = CAR_COLORS[Math.floor(p.seed * CAR_COLORS.length)];
  const glass = 0x1b2a38;
  const parts = [
    box(4.1, 0.75, 1.85, 0, 0.6, 0, body), // body
    box(2.3, 0.62, 1.7, -0.25, 1.28, 0, body), // cabin
    box(2.15, 0.5, 1.72, -0.25, 1.3, 0, glass), // windows band
    box(0.06, 0.25, 1.4, 2.06, 0.7, 0, 0xfff6c8), // headlights
    box(0.06, 0.2, 1.5, -2.06, 0.75, 0, 0xb81d1d), // tail lights
    box(4.15, 0.18, 1.88, 0, 0.3, 0, 0x2a2d33), // bumper line
  ];
  for (const [x, z] of [[1.3, 0.9], [1.3, -0.9], [-1.3, 0.9], [-1.3, -0.9]]) parts.push(cylX(0.36, 0.28, x, 0.36, z, 0x15171b));
  const g = new THREE.Group();
  g.add(mesh(join(parts), shiny));
  return g;
};

/** A corrugated wall texture for the containers. */
const ribs = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 64; x++) {
      const v = 200 + Math.round(55 * Math.sin((x / 64) * Math.PI * 8));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 8);
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 1);
    return t;
  };
})();
const CONTAINER_COLORS = [0xa8432a, 0x2f5f8f, 0x2f7a4b, 0xd07a1f, 0x8a8f99, 0x6b2f6b];

const container = (p: Prop) => {
  const g = new THREE.Group();
  const stack = p.seed > 0.6 ? 2 : 1;
  for (let k = 0; k < stack; k++) {
    const color = CONTAINER_COLORS[Math.floor(tileHash(p.x0, p.y0, k) * CONTAINER_COLORS.length)];
    const m = new THREE.MeshStandardMaterial({ color, map: ribs(), roughness: 0.75 });
    const c = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.6, 2.45), m);
    c.position.set(k ? 0.4 : 0, 1.3 + k * 2.62, 0);
    c.rotation.y = k ? 0.08 : 0;
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
    // Door bars at one end.
    for (const z of [-0.5, 0.5]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a3e45 }));
      bar.position.set(2.92 + (k ? 0.4 : 0), 1.3 + k * 2.62, z);
      g.add(bar);
    }
  }
  return g;
};

const tent = (p: Prop) => {
  const color = p.seed > 0.5 ? 0x3f6b3a : 0xd0782c;
  const shape = new THREE.Shape();
  shape.moveTo(-1.7, 0);
  shape.lineTo(0, 2.2);
  shape.lineTo(1.7, 0);
  shape.lineTo(-1.7, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false });
  geo.translate(0, 0, -1.7);
  const g = new THREE.Group();
  g.add(mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })));
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a1410, side: THREE.DoubleSide }));
  flap.position.set(0, 0.7, 1.72);
  g.add(flap);
  return g;
};

// ---------------------------------------------------------------------------

export const buildProps = (scene: THREE.Scene) => {
  const updates: ((time: number, dt: number) => void)[] = [];

  /** Water tiles already covered by a sheet (the pond and the river each draw their own). */
  const wet = new Set<number>();
  for (const p of PROPS) {
    const c = centre(p);
    let o: THREE.Object3D | null = null;
    if (p.kind === 'car') o = car(p);
    else if (p.kind === 'container') o = container(p);
    else if (p.kind === 'tent') o = tent(p);
    if (o) {
      o.position.set(c.x, 0, c.y);
      o.rotation.y = (c.alongX ? 0 : Math.PI / 2) + (p.seed - 0.5) * 0.12;
      scene.add(o);
    }

    if (p.kind === 'windmill') {
      const g = new THREE.Group();
      const tower = mesh(new THREE.CylinderGeometry(1.1, 1.9, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe9e2d0, flatShading: true }));
      tower.position.y = 5;
      const cap = mesh(new THREE.ConeGeometry(1.5, 2, 8), new THREE.MeshStandardMaterial({ color: 0x7a3b2e, flatShading: true }));
      cap.position.y = 11;
      g.add(tower, cap);
      // The sails face the camera (south) and turn slowly.
      const rotor = new THREE.Group();
      rotor.position.set(0, 9.6, 1.6);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Group();
        const arm = mesh(new THREE.BoxGeometry(0.18, 6.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a4030 }));
        arm.position.y = 3.1;
        const sail = mesh(new THREE.BoxGeometry(1.2, 4.6, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2ece0, side: THREE.DoubleSide }));
        sail.position.set(0.65, 3.6, 0);
        blade.add(arm, sail);
        blade.rotation.z = (i / 4) * Math.PI * 2;
        rotor.add(blade);
      }
      g.add(rotor);
      g.position.set(c.x, 0, c.y);
      scene.add(g);
      updates.push((_t, dt) => (rotor.rotation.z -= dt * 0.6));
    }

    if (p.kind === 'campfire') {
      const g = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const stone = mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x8a8580, flatShading: true }));
        stone.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
        g.add(stone);
      }
      for (let i = 0; i < 3; i++) {
        const log = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 3) * Math.PI;
        log.position.y = 0.15;
        g.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: 0.9 }));
      flame.position.y = 0.6;
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a0 }));
      core.position.y = 0.45;
      g.add(flame, core);
      const light = new THREE.PointLight(0xff9a40, 6, 9, 2);
      light.position.y = 1;
      g.add(light);
      // Smoke: soft grey puffs rising and spreading.
      const puffMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.35, depthWrite: false });
      const puffs = Array.from({ length: 10 }, (_, i) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), puffMat.clone());
        m.userData.t = i / 10;
        g.add(m);
        return m;
      });
      g.position.set((p.x0 + 0.5) * TILE, 0, (p.y0 + 0.5) * TILE);
      scene.add(g);
      updates.push((time, dt) => {
        const f = 1 + Math.sin(time * 17) * 0.12 + Math.sin(time * 29) * 0.08;
        flame.scale.set(f, f * (1 + Math.sin(time * 11) * 0.1), f);
        light.intensity = 5 + Math.sin(time * 13) * 1.2;
        for (const m of puffs) {
          m.userData.t = (m.userData.t + dt * 0.18) % 1;
          const k = m.userData.t as number;
          m.position.set(Math.sin(k * 6 + time * 0.5) * 0.4 * k + k * 1.2, 1 + k * 7, Math.cos(k * 5) * 0.3 * k);
          m.scale.setScalar(0.6 + k * 2.4);
          (m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
        }
      });
    }

    if (p.kind === 'river') {
      scene.add(riverSheet());
      updates.push(riverFlow(scene));
      continue;
    }
    if (p.kind === 'pond') {
      // Water over the pond or river tiles: one sheet, gently shimmering, with slow ripple rings.
      const cells: THREE.Matrix4[] = [];
      for (let y = p.y0; y < p.y0 + p.h; y++) {
        for (let x = p.x0; x < p.x0 + p.w; x++) {
          const t = MAP[y]?.[x];
          if ((t === 'o' || t === 'd') && !wet.has(y * SIZE + x)) {
            wet.add(y * SIZE + x);
            cells.push(new THREE.Matrix4().makeTranslation((x + 0.5) * TILE, WATER_Y, (y + 0.5) * TILE));
          }
        }
      }
      // Opaque, so the overlapping tiles don't show as a grid.
      const water = new THREE.MeshStandardMaterial({ color: 0x3f86b8, roughness: 0.12, metalness: 0.2 });
      const sheet = new THREE.InstancedMesh(new THREE.PlaneGeometry(TILE * 1.25, TILE * 1.25).rotateX(-Math.PI / 2), water, cells.length);
      cells.forEach((m, i) => sheet.setMatrixAt(i, m));
      sheet.receiveShadow = true;
      scene.add(sheet);
      const rings = Array.from({ length: 5 }, (_, i) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.4 }));
        ring.userData.t = i / 5;
        ring.userData.at = cells[Math.floor(tileHash(i, 7) * cells.length)];
        scene.add(ring);
        return ring;
      });
      updates.push((time, dt) => {
        water.color.setHSL(0.56, 0.5, 0.45 + Math.sin(time * 0.7) * 0.02);
        for (const r of rings) {
          r.userData.t = (r.userData.t + dt * 0.25) % 1;
          const k = r.userData.t as number;
          if (k < 0.01) r.userData.at = cells[Math.floor(Math.random() * cells.length)];
          r.position.setFromMatrixPosition(r.userData.at as THREE.Matrix4);
          r.position.y = WATER_Y + 0.02;
          r.scale.setScalar(0.3 + k * 2.2);
          (r.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - k);
        }
      });
    }
  }

  // The pier and the bridges: a plank deck on posts, with a rail on every side that faces water
  // (the simulation has the same rails: you can vault them into the river).
  const planks: THREE.BufferGeometry[] = [];
  const wood = (x: number, y: number) => MAP[y]?.[x] === 'o';
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      if (MAP[ty][tx] !== 'd') continue;
      const x0 = tx * TILE;
      const z0 = ty * TILE;
      const rail = railSides(tx, ty);
      const bridge = RIVER.bridges.some(([bx, bw]) => tx >= bx && tx < bx + bw) || wood(tx - 1, ty) || wood(tx + 1, ty); // runs north-south
      for (let i = 0; i < 5; i++) {
        const c = i % 2 ? 0x9a7048 : 0x8a623e;
        planks.push(bridge ? box(TILE * 1.02, 0.08, 0.36, x0 + TILE / 2, DECK_Y - 0.04, z0 + 0.2 + i * 0.4, c) : box(0.36, 0.08, TILE * 1.02, x0 + 0.2 + i * 0.4, DECK_Y - 0.04, z0 + TILE / 2, c));
      }
      // Beams under the deck and posts down into the water.
      planks.push(bridge ? box(0.18, 0.16, TILE, x0 + TILE / 2, DECK_Y - 0.16, z0 + TILE / 2, 0x4a3220) : box(TILE, 0.16, 0.18, x0 + TILE / 2, DECK_Y - 0.16, z0 + TILE / 2, 0x4a3220));
      const sides: [number, number, boolean][] = [];
      if (rail.w) sides.push([x0 + 0.06, z0 + TILE / 2, false]);
      if (rail.e) sides.push([x0 + TILE - 0.06, z0 + TILE / 2, false]);
      if (rail.n) sides.push([x0 + TILE / 2, z0 + 0.06, true]);
      if (rail.s) sides.push([x0 + TILE / 2, z0 + TILE - 0.06, true]);
      for (const [x, z, alongX] of sides) {
        // A post at the tile corner, a top rail and a mid rail.
        const px = alongX ? x - TILE / 2 + 0.08 : x;
        const pz = alongX ? z : z - TILE / 2 + 0.08;
        planks.push(box(0.14, 1.2, 0.14, px, DECK_Y + 0.3, pz, 0x5a3e28));
        planks.push(alongX ? box(TILE, 0.1, 0.1, x, DECK_Y + 0.85, z, 0x7a5434) : box(0.1, 0.1, TILE, x, DECK_Y + 0.85, z, 0x7a5434));
        planks.push(alongX ? box(TILE, 0.07, 0.07, x, DECK_Y + 0.45, z, 0x6a4a2e) : box(0.07, 0.07, TILE, x, DECK_Y + 0.45, z, 0x6a4a2e));
      }
    }
  }
  if (planks.length) scene.add(mesh(join(planks)));

  const herd = animals(scene);
  updates.push(herd.update, birds(scene));
  return {
    update: (time: number, dt: number) => updates.forEach((u) => u(time, dt)),
    /** Dev checks: where every animal stands. */
    animals: () => herd.list.map((a) => ({ x: a.g.position.x, y: a.g.position.z })),
  };
};

// ---------------------------------------------------------------------------
// Animals: cows in the farm fields, sheep on Windmill Hill. Decoration only: they wander between
// spots on open ground in their area, stop to graze, and never block anyone.
// ---------------------------------------------------------------------------

const cowGeo = () =>
  join([
    box(1.7, 0.85, 0.8, 0, 1.05, 0, 0xf3f0ea),
    box(0.6, 0.86, 0.82, -0.3, 1.06, 0, 0x22201e), // a patch
    box(0.45, 0.5, 0.45, 1.05, 1.25, 0, 0xf3f0ea), // head
    box(0.2, 0.22, 0.42, 1.3, 1.1, 0, 0xe0a8a0), // muzzle
    box(0.08, 0.12, 0.6, 1.0, 1.55, 0, 0xd8d0b0), // horns
  ]);
const sheepGeo = () =>
  join([
    box(1.0, 0.7, 0.7, 0, 0.8, 0, 0xf2efe6),
    box(0.35, 0.4, 0.35, 0.62, 0.95, 0, 0x2a2622),
  ]);

const animals = (scene: THREE.Scene) => {
  const herds: { area: { x0: number; y0: number; x1: number; y1: number }; count: number; kind: 'cow' | 'sheep' }[] = [];
  for (const d of DISTRICTS) {
    if (d.name.endsWith('Farm')) herds.push({ area: d, count: 4, kind: 'cow' });
    if (d.name === 'Windmill Hill') herds.push({ area: d, count: 7, kind: 'sheep' });
  }
  const open = (x: number, y: number) => 'gc'.includes(MAP[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] ?? '#');
  const geos = { cow: cowGeo(), sheep: sheepGeo() };
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3430 });
  const list: { g: THREE.Group; legs: THREE.Mesh[]; head: number; tx: number; ty: number; wait: number; area: (typeof herds)[number]['area']; speed: number }[] = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  /** Is the straight walk from (x0, y0) to (x1, y1) on open ground all the way? */
  const clearWalk = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5);
    for (let i = 1; i <= n; i++) if (!open(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  };
  /**
   * A new spot to wander to: in the herd's area, on open ground, and reachable in a straight line
   * from where the animal stands (else it would walk into a fence and get stuck there).
   */
  const spot = (a: (typeof herds)[number]['area'], from?: { x: number; y: number }) => {
    for (let i = 0; i < 40; i++) {
      const near = from && i < 30;
      const x = near ? from.x + (rnd() - 0.5) * 16 : a.x0 + rnd() * (a.x1 - a.x0);
      const y = near ? from.y + (rnd() - 0.5) * 16 : a.y0 + rnd() * (a.y1 - a.y0);
      if (x < a.x0 || y < a.y0 || x > a.x1 || y > a.y1 || !open(x, y)) continue;
      if (!from || clearWalk(from.x, from.y, x, y)) return { x, y };
    }
    return from ?? { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 };
  };
  for (const h of herds) {
    for (let i = 0; i < h.count; i++) {
      const g = new THREE.Group();
      const body = mesh(geos[h.kind]);
      g.add(body);
      const legs: THREE.Mesh[] = [];
      const lx = h.kind === 'cow' ? 0.6 : 0.35;
      const lz = h.kind === 'cow' ? 0.28 : 0.22;
      const len = h.kind === 'cow' ? 0.7 : 0.48;
      for (const [x, z] of [[lx, lz], [lx, -lz], [-lx, lz], [-lx, -lz]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.14).translate(0, -len / 2, 0), legMat);
        leg.position.set(x, len, z);
        leg.castShadow = true;
        g.add(leg);
        legs.push(leg);
      }
      const s0 = spot(h.area);
      g.position.set(s0.x, 0, s0.y);
      g.scale.setScalar(h.kind === 'cow' ? 1 : 0.95);
      scene.add(g);
      const t = spot(h.area, s0);
      list.push({ g, legs, head: rnd() * 6, tx: t.x, ty: t.y, wait: rnd() * 4, area: h.area, speed: h.kind === 'cow' ? 0.7 : 0.9 });
    }
  }
  return {
    list,
    update: (time: number, dt: number) => {
      for (const a of list) {
        const dx = a.tx - a.g.position.x;
        const dz = a.ty - a.g.position.z;
        const d = Math.hypot(dx, dz);
        let walking = false;
        if (a.wait > 0) a.wait -= dt;
        else if (d < 0.3) {
          a.wait = 2 + Math.random() * 6; // graze a while
          const t = spot(a.area, { x: a.g.position.x, y: a.g.position.z });
          a.tx = t.x;
          a.ty = t.y;
        } else {
          walking = true;
          const want = Math.atan2(-dz, dx);
          let turn = want - a.head;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          a.head += Math.max(-dt * 1.5, Math.min(dt * 1.5, turn));
          const step = Math.min(d, a.speed * dt);
          const nx = a.g.position.x + Math.cos(a.head) * step;
          const nz = a.g.position.z - Math.sin(a.head) * step;
          if (open(nx, nz)) a.g.position.set(nx, 0, nz);
          else {
            // Blocked anyway (turning wide round a corner): stand, then head somewhere reachable.
            walking = false;
            a.wait = 0.5 + Math.random();
            const t = spot(a.area, { x: a.g.position.x, y: a.g.position.z });
            a.tx = t.x;
            a.ty = t.y;
          }
        }
        a.g.rotation.y = a.head;
        const sw = walking ? Math.sin(time * 6 + a.head * 3) * 0.4 : 0;
        a.legs.forEach((l, i) => (l.rotation.z = i === 0 || i === 3 ? sw : -sw));
        // Grazing: the head (the front of the body) dips.
        a.g.children[0].rotation.z = walking ? 0 : -0.12 + Math.sin(time * 1.3 + a.head) * 0.05;
      }
    },
  };
};

// ---------------------------------------------------------------------------
// Birds: a loose flock wheeling over the map.
// ---------------------------------------------------------------------------

const birds = (scene: THREE.Scene) => {
  const world = SIZE * TILE;
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide });
  const flock = Array.from({ length: 12 }, (_, i) => {
    const g = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.25, 0, 0.9, 0.35, 0, 0.2], 3));
    const l = new THREE.Mesh(wingGeo, mat);
    const r = new THREE.Mesh(wingGeo, mat);
    r.scale.z = -1;
    g.add(l, r);
    g.scale.setScalar(0.9);
    scene.add(g);
    return { g, l, r, off: { a: i * 0.5, rr: 6 + (i % 4) * 2.5, h: 24 + (i % 3) * 2, ph: i * 1.7 } };
  });
  return (time: number) => {
    // The flock's centre drifts round the map on a wide loop.
    const cx = world / 2 + Math.cos(time * 0.05) * world * 0.3;
    const cz = world / 2 + Math.sin(time * 0.07) * world * 0.3;
    for (const b of flock) {
      const a = time * 0.35 + b.off.a;
      const x = cx + Math.cos(a) * b.off.rr;
      const z = cz + Math.sin(a) * b.off.rr;
      b.g.position.set(x, b.off.h + Math.sin(time + b.off.ph) * 0.8, z);
      b.g.rotation.y = -a;
      const flap = Math.sin(time * 9 + b.off.ph) * 0.7;
      b.l.rotation.x = flap;
      b.r.rotation.x = -flap;
    }
  };
};
