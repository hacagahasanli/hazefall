import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { DISTRICTS, MAP, PROPS, RIVER, SIZE, STADIUM, TILE, railSides, riverCentre, tileHash } from '../sim/constants';

const STADIUM_PITCH = STADIUM.pitch;

import { mergeRigid, mergeStatic } from './merge';

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

/** A box from `a` to `b` (a beam, a cable, a diagonal), `w` x `h` in section. */
const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: THREE.ColorRepresentation) => {
  const len = a.distanceTo(b);
  const g = box(w, h, len, 0, 0, 0, color);
  const m = new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, 0));
  if (Math.abs(b.x - a.x) < 1e-6 && Math.abs(b.z - a.z) < 1e-6) m.lookAt(b, a, new THREE.Vector3(1, 0, 0)); // vertical
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
};

/** A small round joint (a bolted node), vertex-coloured like `box`. */
const knot = (p: THREE.Vector3, r: number, color: THREE.ColorRepresentation) => {
  const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(p.x, p.y, p.z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

/**
 * A light truss bridge that spans the river in one go, bank to bank, sized for a village: a thin
 * deck and, along each side, a slim Warren truss (a bottom chord at the deck edge, a top chord
 * above, diagonals zig-zagging between them) with a bolted joint at every node. Nothing stands
 * in the water and nothing crosses overhead, so the people on it stay in view from above. The
 * bridge on the main path is painted steel with an asphalt deck; the two footbridges are timber.
 */
const bridge = (bx: number, bw: number) => {
  let y0 = SIZE;
  let y1 = 0;
  for (let y = 0; y < SIZE; y++) {
    if (MAP[y][bx] !== 'd') continue;
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const big = bw >= 4;
  const weir = bw === 3;
  const x0 = bx * TILE;
  const x1 = (bx + bw) * TILE;
  const z0 = y0 * TILE;
  const z1 = (y1 + 1) * TILE;
  const cx = (x0 + x1) / 2;
  const parts: THREE.BufferGeometry[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (weir) {
    // The Weir: a plain grey concrete deck with a low parapet on each side, no truss: exposed on purpose.
    parts.push(box(x1 - x0 + 0.2, 0.3, z1 - z0, cx, DECK_Y - 0.15, (z0 + z1) / 2, 0x9a9a96));
    for (const x of [x0 + 0.1, x1 - 0.1]) parts.push(box(0.3, 0.7, z1 - z0, x, DECK_Y + 0.35, (z0 + z1) / 2, 0x8a8a86));
    for (const z of [z0 + 0.4, z1 - 0.4]) parts.push(box(x1 - x0 + 0.6, 0.9, 0.8, cx, DECK_Y - 0.4, z, 0x7a7a76));
    return mesh(join(parts));
  }
  const MEMBER = big ? 0x3e6a8a : 0x8a623e;
  const JOINT = big ? 0x1f2a33 : 0x3a2a1c;
  const t = big ? 0.14 : 0.12; // member thickness
  // The deck: a thin slab, asphalt with edge lines on the road bridge, planks on the footbridges.
  if (big) {
    parts.push(box(x1 - x0 + 0.2, 0.18, z1 - z0, cx, DECK_Y - 0.09, (z0 + z1) / 2, 0x6f7276));
    parts.push(box(x1 - x0 - 0.3, 0.02, z1 - z0, cx, DECK_Y + 0.01, (z0 + z1) / 2, 0x3f4247));
    for (const x of [x0 + 0.4, x1 - 0.4]) parts.push(box(0.1, 0.025, z1 - z0, x, DECK_Y + 0.015, (z0 + z1) / 2, 0xe8e6df));
    for (let z = z0 + 1; z < z1 - 1; z += 3) parts.push(box(0.1, 0.025, 1.5, cx, DECK_Y + 0.015, z + 0.75, 0xe9c46a));
  } else {
    for (let z = z0; z < z1 - 0.01; z += 0.4) parts.push(box(x1 - x0 + 0.1, 0.07, 0.36, cx, DECK_Y - 0.035, z + 0.2, Math.round(z / 0.4) % 2 ? 0x9a7048 : 0x8a623e));
  }
  // Two thin girders under the deck, and a low abutment where it rests on each bank.
  for (const x of [x0 + 0.3, x1 - 0.3]) parts.push(box(0.14, 0.2, z1 - z0, x, DECK_Y - 0.2, (z0 + z1) / 2, JOINT));
  for (const z of [z0 + 0.4, z1 - 0.4]) parts.push(box(x1 - x0 + 0.5, 0.5, 0.8, cx, DECK_Y - 0.35, z, 0x8f8b82));
  // The trusses.
  const h = big ? 1.7 : 1.15;
  const bays = Math.max(3, Math.round((z1 - z0) / (big ? 2.4 : 2)));
  const step = (z1 - z0) / bays;
  for (const side of [-1, 1]) {
    const x = side < 0 ? x0 - 0.05 : x1 + 0.05;
    const bot = (k: number) => v(x, DECK_Y + 0.05, z0 + k * step);
    // Top nodes sit over the middle of each bay but the end ones, so the ends slope down.
    const top = (k: number) => v(x, DECK_Y + h, z0 + (k + 0.5) * step);
    for (let k = 0; k < bays; k++) {
      parts.push(beam(bot(k), bot(k + 1), t, t, MEMBER)); // bottom chord
      parts.push(beam(bot(k), top(k), t * 0.85, t * 0.85, MEMBER)); // up
      parts.push(beam(top(k), bot(k + 1), t * 0.85, t * 0.85, MEMBER)); // down
      if (k < bays - 1) parts.push(beam(top(k), top(k + 1), t, t, MEMBER)); // top chord
      parts.push(knot(top(k), t * 0.9, JOINT));
    }
    for (let k = 0; k <= bays; k++) parts.push(knot(bot(k), t * 0.9, JOINT));
  }
  return mesh(join(parts));
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


// ---------------------------------------------------------------------------
// Landmarks: things you can name from the plane. Each is built for the view from above first (its colour and the shape it
// makes seen from above), then for the side view. Code-made, plain coloured parts that merge with the other statics.
// ---------------------------------------------------------------------------

/** A low-poly cylinder standing on its base at y, vertex-coloured, with a few sides. */
const drum = (rTop: number, rBottom: number, h: number, x: number, y: number, z: number, sides: number, color: THREE.ColorRepresentation) => {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, sides).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

/**
 * A landmark in two pieces: the legs and footings (baked into the statics) and the tall part that fades when it hides you
 * (see `tallLandmarks`).
 */
interface Landmark {
  base: THREE.Object3D | null;
  tall: THREE.BufferGeometry;
}
const landmark = (base: THREE.BufferGeometry[], tall: THREE.BufferGeometry[]): Landmark => ({ base: base.length ? mesh(join(base)) : null, tall: join(tall) });

/** The water tower: a cream drum under a red lid on four legs with X braces, 16 m up. A red disc seen from the plane. The tank and lid are the tall part. */
const waterTower = () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  const tank: THREE.BufferGeometry[] = [];
  const legY = 11.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.34, legY, 0.34, sx * 1.6, legY / 2, sz * 1.6, 0x6b7280));
  for (const y of [3.8, 7.6]) {
    parts.push(box(3.4, 0.16, 0.16, 0, y, 1.6, 0x6b7280), box(3.4, 0.16, 0.16, 0, y, -1.6, 0x6b7280), box(0.16, 0.16, 3.4, 1.6, y, 0, 0x6b7280), box(0.16, 0.16, 3.4, -1.6, y, 0, 0x6b7280));
    for (const sz of [-1, 1]) {
      parts.push(beam(v(-1.6, y - 3.8, sz * 1.6), v(1.6, y, sz * 1.6), 0.1, 0.1, 0x4b5563), beam(v(1.6, y - 3.8, sz * 1.6), v(-1.6, y, sz * 1.6), 0.1, 0.1, 0x4b5563));
    }
  }
  tank.push(box(4.4, 0.3, 4.4, 0, legY + 0.15, 0, 0x4b5563)); // the platform under the tank
  tank.push(drum(3, 3, 3.4, 0, legY + 0.3, 0, 8, 0xf1e6c8)); // the drum
  tank.push(drum(0.2, 2.6, 0.9, 0, legY + 3.7, 0, 8, 0xe23d5c)); // the lid
  return landmark(parts, tank);
};

/**
 * A harbour crane: a gold portal on four legs with a long boom out over the water (towards +z; the caller turns it), a cab
 * and a counterweight at the back. Two long gold bars seen from above. The boom has no collision.
 */
const crane = () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const GOLD = 0xffc93c;
  const DARK = 0x2a2d33;
  const parts: THREE.BufferGeometry[] = [];
  const hi: THREE.BufferGeometry[] = [];
  const top = 17.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.4, top, 0.4, sx * 2.6, top / 2, sz * 1.5, GOLD));
  for (const sz of [-1, 1]) hi.push(box(5.7, 0.55, 0.55, 0, top, sz * 1.5, GOLD)); // the top beams
  for (const sx of [-1, 1]) {
    hi.push(box(0.55, 0.55, 3.5, sx * 2.6, top, 0, GOLD));
    parts.push(beam(v(sx * 2.6, 6, -1.5), v(sx * 2.6, top, 1.5), 0.2, 0.2, 0xe8a91f), beam(v(sx * 2.6, 6, 1.5), v(sx * 2.6, top, -1.5), 0.2, 0.2, 0xe8a91f));
    parts.push(box(0.4, 0.4, 3.4, sx * 2.6, 6, 0, 0xe8a91f));
  }
  hi.push(box(1.1, 0.7, 25, 0, top + 0.6, 8.5, GOLD)); // the boom: from 4 m behind the portal to 21 m out
  hi.push(box(1.3, 0.16, 25.2, 0, top + 1.05, 8.5, 0xe8a91f)); // its deck line
  hi.push(box(2.4, 2, 2.6, 0, top + 2, -1.2, GOLD)); // the cab
  hi.push(box(2.2, 1.1, 0.4, 0, top + 2.3, 0.1, 0x1b2a38)); // its window
  hi.push(box(2.2, 1.6, 2.2, 0, top + 1.5, -3.6, DARK)); // the counterweight
  for (const z of [13, 20]) hi.push(box(0.05, 6, 0.05, 0, top - 2.6, z, DARK)); // the hoist cables
  hi.push(box(1.1, 0.6, 1.1, 0, top - 5.8, 20, DARK)); // the spreader
  return landmark(parts, hi);
};

/** The pole sign: a dark pole and a gold disc with a dark rim, tilted 20 degrees towards the sky so the disc shows from above. */
const poleSign = () => {
  const parts: THREE.BufferGeometry[] = [box(0.34, 11.2, 0.34, 0, 5.6, 0, 0x3a3e45)];
  const board = (r: number, h: number, y: number, color: THREE.ColorRepresentation) => {
    const g = drum(r, r, h, 0, 0, 0, 20, color);
    g.rotateX(Math.PI * (70 / 180));
    g.translate(0, y, 0.2);
    return g;
  };
  parts.push(board(2.15, 0.3, 11.6, 0x2a2d33), board(1.85, 0.34, 11.66, 0xffc93c));
  return mesh(join(parts));
};


/** The radio mast on Mast Hill: a tapered lattice of boxes, red and white every 6 m, 30 m up, with a red lamp on top. Thin from above: its long shadow is the read. Above 6 m is the tall part. */
const radioMast = () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // A gravel pad one tile wider than the 2 x 2 footprint on every side, the concrete foot on it, and three guy lines out to ground anchors.
  const parts: THREE.BufferGeometry[] = [box(6, 0.12, 6, 0, 0.06, 0, 0xb3ada0), box(3.4, 0.5, 3.4, 0, 0.25, 0, 0x8f8b82)];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const anchor = v(Math.cos(a) * 13, 0.1, Math.sin(a) * 13);
    parts.push(beam(v(0, 24, 0), anchor, 0.07, 0.07, 0x2a2d33), box(0.6, 0.3, 0.6, anchor.x, 0.15, anchor.z, 0x8f8b82));
  }
  const hi: THREE.BufferGeometry[] = [];
  const legs = [[-1, -1], [1, -1], [0, 1]];
  for (let k = 0; k < 5; k++) {
    const y0 = k * 6;
    const y1 = y0 + 6;
    const w0 = 1.3 - k * 0.2;
    const w1 = 1.3 - (k + 1) * 0.2;
    const col = k % 2 ? 0xf3efe6 : 0xe23d5c;
    const out = k === 0 ? parts : hi;
    for (const [sx, sz] of legs) out.push(beam(v(sx * w0, y0, sz * w0 * 0.8), v(sx * w1, y1, sz * w1 * 0.8), 0.22, 0.22, col));
    out.push(beam(v(-w1, y1, -w1 * 0.8), v(w1, y1, -w1 * 0.8), 0.12, 0.12, 0x9aa0ab), beam(v(w1, y1, -w1 * 0.8), v(0, y1, w1 * 0.8), 0.12, 0.12, 0x9aa0ab));
  }
  hi.push(box(0.6, 0.5, 0.6, 0, 30.25, 0, 0x2a1414)); // the lamp's housing; the blinking light is added in buildProps
  return landmark(parts, hi);
};

/** The HQ tower on the Campus plaza: a solid blue-glass block 12 m up with four window bands, a blue roof slab and a green ring on it, 8 m across. All of it is the tall part. */
const hqTower = () => {
  const parts: THREE.BufferGeometry[] = [box(11.4, 12, 11.4, 0, 6, 0, 0x6f8fb8)];
  for (const y of [2, 5, 8, 11]) parts.push(box(11.6, 1.5, 11.6, 0, y, 0, 0x1b2a38));
  parts.push(box(12, 0.8, 12, 0, 12.4, 0, 0x3e7bfa));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = box(2.2, 0.5, 0.9, 0, 0, 0, 0x2ec27e);
    g.rotateY(-a);
    g.translate(Math.cos(a) * 3.8, 13, Math.sin(a) * 3.8);
    parts.push(g);
  }
  return landmark([], parts);
};

/** The fire lookout in Deadwood: four legs, a cabin and a pyramid roof (an orange square in the dark green), 14 m up. */
const fireLookout = () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  const cabin: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(beam(v(sx * 1.6, 0, sz * 1.6), v(sx * 0.9, 10.5, sz * 0.9), 0.3, 0.3, 0x5a4030));
  for (const y of [4, 8]) for (const [a, b] of [[[-1.3, -1.3], [1.3, 1.3]], [[1.3, -1.3], [-1.3, 1.3]]]) parts.push(beam(v(a[0], y, a[1]), v(b[0], y + 3, b[1]), 0.12, 0.12, 0x7a5434));
  cabin.push(box(2.8, 2, 2.8, 0, 11.5, 0, 0x8a623e), box(2.9, 0.8, 2.9, 0, 11.7, 0, 0x1b2a38));
  cabin.push(drum(0.05, 2.7, 1.8, 0, 12.5, 0, 4, 0xf2542d).rotateY(Math.PI / 4));
  return landmark(parts, cabin);
};

/** A signal gantry: one leg, and (the first of the pair) a beam 16 m long across the tracks with a red and a green light. */
const signalGantry = (p: Prop) => {
  const parts: THREE.BufferGeometry[] = [box(0.4, 7, 0.4, 0, 3.5, 0, 0x2a2d33)];
  if (p.seed < 0.5) {
    parts.push(box(0.35, 0.5, 16.4, 0, 7, 8, 0x2a2d33));
    parts.push(box(0.5, 0.5, 0.5, 0.35, 6.4, 5.5, 0xff3b3b), box(0.5, 0.5, 0.5, 0.35, 6.4, 11, 0x3ddc84));
  }
  return mesh(join(parts));
};

/** The quarry conveyor: an inclined grey belt on three legs ending over a pale gravel cone. Runs along the map's y axis, 1 x 6 tiles. */
const conveyor = () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [beam(v(0, 1, -5.6), v(0, 9, 4.4), 1, 0.5, 0x7b8088)];
  for (const [z, h] of [[-4, 2.4], [-0.5, 5], [3, 7.6]]) parts.push(box(0.3, h, 0.3, 0, h / 2, z, 0x4b5563));
  parts.push(drum(0.2, 2.8, 2.6, 0, 0, 5.2, 7, 0xd6cfc0));
  return mesh(join(parts));
};

/**
 * The Pitch (CD spec map-balance-grass-stadium, 4.5): the town's football ground. Rendered blockwork walls with a violet
 * band, a main stand on the west side under a pale cantilever roof, an open east stand, steel railings and open gates at
 * the ends, dugouts, a roller, a line-marker cart, two goals and four floodlights. Local coordinates: x along the map's
 * x, z along the map's y, origin at the stadium's centre. One vertex-colour mesh, plus the gate board's lettering.
 */
const stadium = (p: Prop) => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const cx = (p.x0 + p.w / 2) * TILE;
  const cz = (p.y0 + p.h / 2) * TILE;
  const X = (tx: number) => tx * TILE - cx; // west edge of tile tx
  const Z = (ty: number) => ty * TILE - cz;
  const WALL = 0xe6dcc6;
  const VIOLET = 0x7a5cd0;
  const PLINTH = 0xb9ae97;
  const CONCRETE = 0xcdc4b0;
  const CREAM = 0xefe6d2;
  const STEEL = 0x9aa3a8;
  const parts: THREE.BufferGeometry[] = [];
  const wallRun = (x0: number, z0: number, x1: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    parts.push(box(w, 3.6, d, x0 + w / 2, 1.8, z0 + d / 2, WALL));
    parts.push(box(w + 0.04, 0.35, d + 0.04, x0 + w / 2, 3.6 - 0.175, z0 + d / 2, VIOLET));
    parts.push(box(w + 0.04, 0.4, d + 0.04, x0 + w / 2, 0.2, z0 + d / 2, PLINTH));
  };
  // Outer walls: west (the tunnel rows 73-74 open), east, and the corners at both ends.
  wallRun(X(63), Z(67), X(64), Z(73));
  wallRun(X(63), Z(75), X(64), Z(81));
  wallRun(X(75), Z(67), X(76), Z(81));
  for (const ty of [67, 80]) {
    wallRun(X(64), Z(ty), X(66), Z(ty + 1));
    wallRun(X(73), Z(ty), X(75), Z(ty + 1));
  }
  // Stands: a parapet at the front, three steps of seats rising to the back; violet seats, every 6th cream, a few missing.
  const stand = (front: number, back: number, z0: number, z1: number) => {
    const dir = Math.sign(back - front);
    const depth = Math.abs(back - front);
    const stepD = depth / 3;
    parts.push(box(0.25, 1.1, z1 - z0, front + dir * 0.125, 0.55, (z0 + z1) / 2, CONCRETE));
    for (let i = 0; i < 3; i++) {
      const h = 1.1 + (i + 1) * 0.63;
      const xa = front + dir * (0.25 + i * stepD);
      parts.push(box(stepD, h, z1 - z0, xa + (dir * stepD) / 2, h / 2, (z0 + z1) / 2, CONCRETE));
      let n = 0;
      for (let z = z0 + 0.35; z < z1 - 0.3; z += 0.6, n++) {
        if (tileHash(Math.round(xa * 10), n, 13) < 1 / 12) continue;
        parts.push(box(0.45, 0.35, 0.45, xa + dir * stepD * 0.55, h + 0.175, z, n % 6 === 5 ? CREAM : VIOLET));
      }
    }
  };
  stand(X(66), X(64), Z(68), Z(73));
  stand(X(66), X(64), Z(75), Z(80));
  stand(X(73), X(75), Z(68), Z(80));
  // The main stand's roof: flat, over x 63-65 only, on posts along the back wall, with a violet fascia.
  parts.push(box(X(66) - X(63), 0.2, Z(80) - Z(68), (X(63) + X(66)) / 2, 4.6, (Z(68) + Z(80)) / 2, 0xd6d2c8));
  parts.push(box(0.12, 0.45, Z(80) - Z(68), X(66) - 0.06, 4.45, (Z(68) + Z(80)) / 2, VIOLET));
  for (const z of [Z(68) + 0.3, Z(72) + 1, Z(76), Z(80) - 0.3]) parts.push(box(0.25, 4.6, 0.25, X(63) + 0.4, 2.3, z, 0x8f8b82));
  // West gate: two pillars, a lintel, and the board above (its lettering is a separate plane, below).
  for (const z of [Z(73) + 0.3, Z(75) - 0.3]) parts.push(box(0.6, 4.7, 0.6, X(63) + 0.3, 2.35, z, WALL));
  parts.push(box(0.6, 0.4, Z(75) - Z(73), X(63) + 0.3, 3.9, Z(74), WALL));
  parts.push(box(0.12, 0.8, 4, X(63) - 0.06, 4.3, Z(74), VIOLET));
  // End railings (galvanised steel: a top rail and bars every 0.25 m) and the open gates' posts.
  for (const ty of [67, 80]) {
    const z = Z(ty) + 1;
    for (const [a, b] of [[66, 68], [71, 73]]) {
      parts.push(box(X(b) - X(a), 0.06, 0.06, (X(a) + X(b)) / 2, 1.1, z, STEEL));
      for (let x = X(a) + 0.125; x < X(b); x += 0.25) parts.push(box(0.035, 1.1, 0.035, x, 0.55, z, STEEL));
    }
    for (const x of [X(68), X(71)]) parts.push(box(0.14, 1.6, 0.14, x, 0.8, z, STEEL));
  }
  // Dugouts: a dark shell curving over a cream bench, open to the pitch.
  for (const ty of [70, 76]) {
    const z0 = Z(ty);
    const z1 = Z(ty + 2);
    parts.push(box(0.15, 2, z1 - z0, X(66) + 0.2, 1, (z0 + z1) / 2, 0x4a4f57));
    parts.push(box(1.4, 0.12, z1 - z0, X(66) + 0.8, 2, (z0 + z1) / 2, 0x4a4f57));
    for (const z of [z0 + 0.06, z1 - 0.06]) parts.push(box(1.4, 2, 0.12, X(66) + 0.8, 1, z, 0x4a4f57));
    parts.push(box(0.45, 0.45, z1 - z0 - 0.4, X(66) + 0.55, 0.225, (z0 + z1) / 2, CREAM));
  }
  // The pitch roller (an iron drum with a cream handle frame) and the line-marker cart.
  {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 3.4, 14).toNonIndexed();
    g.deleteAttribute('uv');
    g.rotateZ(Math.PI / 2);
    g.translate((X(70) + X(72)) / 2, 0.55, Z(71) + 1);
    const c = new THREE.Color(0x3b3f44);
    const col = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
    parts.push(beam(v(X(70) + 0.2, 0.55, Z(71) + 1), v(X(70) - 0.9, 1.1, Z(71) + 1), 0.08, 0.08, CREAM));
  }
  parts.push(box(1.1, 0.6, 0.7, X(67) + 1, 0.55, Z(75) + 1, 0xf0ede4));
  for (const dx of [-0.4, 0.4]) parts.push(cylX(0.2, 0.08, X(67) + 1 + dx, 0.2, Z(75) + 1 + 0.38, 0x8a8f96), cylX(0.2, 0.08, X(67) + 1 + dx, 0.2, Z(75) + 0.62, 0x8a8f96));
  // Goals on the goal lines (decor), mouths to the centre.
  const pz0 = STADIUM_PITCH.y0 * TILE - cz + 0.3;
  const pz1 = (STADIUM_PITCH.y0 + STADIUM_PITCH.h) * TILE - cz - 0.3;
  for (const [gz, out] of [[pz0, -1], [pz1, 1]] as const) {
    for (const x of [-2.5, 2.5]) {
      parts.push(box(0.12, 2, 0.12, x, 1, gz, 0xf4f1e8));
      parts.push(beam(v(x, 2, gz), v(x, 0, gz + out * 1.2), 0.05, 0.05, 0xc9c6bd));
    }
    parts.push(box(5.12, 0.12, 0.12, 0, 2, gz, 0xf4f1e8));
    parts.push(box(5, 0.04, 0.04, 0, 0.02, gz + out * 1.2, 0xc9c6bd));
    for (let x = -2.25; x <= 2.25; x += 0.5) parts.push(beam(v(x, 2, gz), v(x, 0, gz + out * 1.2), 0.02, 0.02, 0xd8d5cc));
  }
  // Floodlights at the stand corners: an 11 m pole, a head tilted 30 degrees down toward the centre spot with 6 lamps.
  for (const [tx, ty] of [[64, 68], [64, 79], [74, 68], [74, 79]]) {
    const x = X(tx) + 1;
    const z = Z(ty) + 1;
    parts.push(box(0.35, 11, 0.35, x, 5.5, z, 0x8a8f96));
    const head: THREE.BufferGeometry[] = [box(1.6, 1, 0.2, 0, 0, 0, 0x6b7076)];
    for (let i = 0; i < 6; i++) head.push(box(0.4, 0.3, 0.06, -0.5 + (i % 3) * 0.5, i < 3 ? 0.22 : -0.22, 0.12, CREAM));
    const yaw = Math.atan2(-x, -z);
    for (const g of head) {
      g.rotateX(0.52);
      g.rotateY(yaw);
      g.translate(x, 11.2, z);
      parts.push(g);
    }
  }
  const g = new THREE.Group();
  g.add(mesh(join(parts)));
  // The gate board's lettering, facing west toward Route 1.
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 102;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7a5cd0';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#efe6d2';
  ctx.font = '700 64px Bungee, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('THE PITCH', c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
  board.rotation.y = -Math.PI / 2;
  board.position.set(X(63) - 0.13, 4.3, Z(74));
  g.add(board);
  return g;
};

/** A boxcar: a container-sized rust-coloured wagon with a roof ridge, one per 3 x 2 tiles on a yard track. */
const boxcar = (p: Prop) => {
  const colors = [0x8a4b32, 0x6b3a2a, 0x7a5a3a, 0x5a3c30];
  const color = colors[Math.floor(p.seed * colors.length)];
  const parts = [
    box(5.8, 2.6, 2.4, 0, 1.8, 0, color),
    box(5.8, 0.25, 1.2, 0, 3.2, 0, 0x3a2a22),
    box(0.1, 2, 1.1, 0, 1.8, 1.22, 0x3a2a22),
    box(5.9, 0.4, 2.1, 0, 0.45, 0, 0x2a2d33),
  ];
  return mesh(join(parts));
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


/** How many tall parts can fade on their own (the HQ, the water tower, two cranes, the mast, the lookout and room for more). */
const TALL_MAX = 16;
/** A tall part fades to this opacity over `FADE_IN` s when it stands between the camera and you, and returns over `FADE_OUT` s after `FADE_HOLD` s clear. */
const FADE_MIN = 0.3;
const FADE_IN = 0.15;
const FADE_OUT = 0.3;
const FADE_HOLD = 0.4;
/** How far each part's box grows before the line from the camera to you is tested against it (m). */
const FADE_PAD = 1;

/**
 * The tall parts of the landmarks (the HQ block, the water tower's tank, the cranes' beams and cabs, the lookout cabin, the
 * mast above 6 m) in ONE mesh, one draw call: each vertex carries its part's number and a uniform array holds each part's
 * opacity, so every part fades alone. They fade when the line from the camera to the local player's chest crosses their
 * box (grown by a metre): to 0.3 in 0.15 s, back in 0.3 s once 0.4 s have passed without a hit. The shadow pass ignores the
 * fade, so shadows keep their full strength. High and medium fade with alpha (depth writes off while any part is ghosted);
 * the low tier uses a dither cut-out, which needs no blending.
 */
export const tallLandmarks = () => {
  const geos: THREE.BufferGeometry[] = [];
  const boxes: THREE.Box3[] = [];
  const level = new Float32Array(TALL_MAX).fill(1);
  const clear = new Float32Array(TALL_MAX).fill(99);
  const uniforms = { uFade: { value: level }, uDither: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, transparent: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPart;\nuniform float uFade[' + TALL_MAX + '];\nuniform float uDither;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        float fadeNow = uFade[int(vPart + 0.5)];
        if (uDither > 0.5) {
          if (fadeNow < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > fadeNow) discard;
        } else diffuseColor.a *= fadeNow;`,
      );
  };
  mat.customProgramCacheKey = () => 'tall-landmarks';
  const hits = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, b: THREE.Box3) => {
    // The segment from a to b against the box (slab test).
    let t0 = 0;
    let t1 = 1;
    const lo = [b.min.x, b.min.y, b.min.z];
    const hi = [b.max.x, b.max.y, b.max.z];
    const a = [ax, ay, az];
    const d = [bx - ax, by - ay, bz - az];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (a[i] < lo[i] || a[i] > hi[i]) return false;
        continue;
      }
      let u0 = (lo[i] - a[i]) / d[i];
      let u1 = (hi[i] - a[i]) / d[i];
      if (u0 > u1) [u0, u1] = [u1, u0];
      t0 = Math.max(t0, u0);
      t1 = Math.min(t1, u1);
      if (t0 > t1) return false;
    }
    return true;
  };
  let mesh_: THREE.Mesh | null = null;
  return {
    /** Adds one landmark's tall geometry, standing at (x, z) turned `rot` about the vertical. */
    add: (g: THREE.BufferGeometry, x: number, z: number, rot: number) => {
      if (geos.length >= TALL_MAX) throw new Error('too many tall landmarks');
      g.rotateY(rot);
      g.translate(x, 0, z);
      g.computeBoundingBox();
      boxes.push(g.boundingBox!.clone().expandByScalar(FADE_PAD));
      g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(geos.length), 1));
      geos.push(g);
    },
    build: () => {
      const g = mergeGeometries(geos)!;
      geos.forEach((p) => p.dispose());
      mesh_ = new THREE.Mesh(g, mat);
      mesh_.castShadow = true;
      mesh_.receiveShadow = true;
      return mesh_;
    },
    /** `dither`: the low tier. `on` false (in the plane, before the drop): every part is solid again at once. */
    fade: (cam: THREE.Vector3, target: THREE.Vector3, dt: number, dither: boolean, on = true) => {
      uniforms.uDither.value = dither ? 1 : 0;
      let ghosted = false;
      for (let i = 0; i < boxes.length; i++) {
        if (on && hits(cam.x, cam.y, cam.z, target.x, target.y, target.z, boxes[i])) clear[i] = 0;
        else clear[i] += dt;
        if (!on) level[i] = 1;
        else if (clear[i] < FADE_HOLD) level[i] = Math.max(FADE_MIN, level[i] - ((1 - FADE_MIN) / FADE_IN) * dt);
        else level[i] = Math.min(1, level[i] + ((1 - FADE_MIN) / FADE_OUT) * dt);
        if (level[i] < 1) ghosted = true;
      }
      // Alpha mode always draws in the blended pass (switching it would recompile the shader mid-game); depth writes are off only while something is ghosted.
      if (mat.transparent === dither) {
        mat.transparent = !dither;
        mat.needsUpdate = true;
      }
      mat.depthWrite = dither || !ghosted;
    },
    /** For tests and dev checks. */
    state: () => ({ boxes, level: Array.from(level.slice(0, boxes.length)) }),
  };
};

export const buildProps = (scene: THREE.Scene) => {
  const updates: ((time: number, dt: number) => void)[] = [];
  /** True while the player is in the plane choosing where to jump. */
  let planeView = false;

  /** Water tiles already covered by a sheet (the pond and the river each draw their own). */
  const wet = new Set<number>();
  /** Everything that never moves (cars, containers, tents, the windmill's tower, the fire ring, decks and bridges): merged per material at the end. */
  const statics = new THREE.Group();
  const tall = tallLandmarks();
  /** Keeps the legs and footings with the statics and hands the tall part to the fading group, placed where the landmark stands. */
  const tallOf = (l: Landmark, p: Prop, c: { x: number; y: number }): THREE.Object3D => {
    tall.add(l.tall, c.x, c.y, p.kind === 'crane' && p.dir === -1 ? Math.PI : 0);
    return l.base ?? new THREE.Group();
  };
  for (const p of PROPS) {
    const c = centre(p);
    let o: THREE.Object3D | null = null;
    if (p.kind === 'car') o = car(p);
    else if (p.kind === 'container') o = container(p);
    else if (p.kind === 'tent') o = tent(p);
    else if (p.kind === 'tower') o = tallOf(waterTower(), p, c);
    else if (p.kind === 'crane') o = tallOf(crane(), p, c);
    else if (p.kind === 'sign') o = poleSign();
    else if (p.kind === 'mast') o = tallOf(radioMast(), p, c);
    else if (p.kind === 'hq') o = tallOf(hqTower(), p, c);
    else if (p.kind === 'lookout') o = tallOf(fireLookout(), p, c);
    else if (p.kind === 'gantry') o = signalGantry(p);
    else if (p.kind === 'conveyor') o = conveyor();
    else if (p.kind === 'boxcar') o = boxcar(p);
    else if (p.kind === 'stadium') o = stadium(p);
    if (o && ['tower', 'crane', 'sign', 'mast', 'hq', 'lookout', 'gantry', 'conveyor', 'boxcar', 'stadium'].includes(p.kind)) {
      // Landmarks stand square to the map (a crane's boom runs along the map's y axis towards `dir`) and keep their own look.
      o.position.set(c.x, 0, c.y);
      if (p.kind === 'crane') o.rotation.y = p.dir === -1 ? Math.PI : 0;
      statics.add(o);
    } else if (o) {
      o.position.set(c.x, 0, c.y);
      o.rotation.y = (c.alongX ? 0 : Math.PI / 2) + (p.seed - 0.5) * 0.12;
      statics.add(o);
    }

    if (p.kind === 'mast') {
      // The red light on top: on for half a second, off for half a second (1 Hz), with a glow disc that shows from the plane.
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
      const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), lampMat);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), glowMat);
      lamp.position.set(c.x, 30.8, c.y);
      glow.position.set(c.x, 31.2, c.y);
      scene.add(lamp, glow);
      updates.push((time) => {
        const on = time % 1 < 0.5;
        lamp.visible = on;
        glow.visible = on;
      });
    }

    if (p.kind === 'windmill') {
      const g = new THREE.Group();
      const tower = mesh(new THREE.CylinderGeometry(1.1, 1.9, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe9e2d0, flatShading: true }));
      tower.position.y = 5;
      const cap = mesh(new THREE.ConeGeometry(1.5, 2, 8), new THREE.MeshStandardMaterial({ color: 0x7a3b2e, flatShading: true }));
      cap.position.y = 11;
      const still = new THREE.Group();
      still.add(tower, cap);
      still.position.set(c.x, 0, c.y);
      statics.add(still);
      // The sails face the camera (south) and turn slowly.
      const rotor = new THREE.Group();
      rotor.position.set(0, 9.6, 1.6);
      rotor.scale.setScalar(1.15); // 15 % bigger sails
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
      // The sails turn as one: one mesh.
      mergeRigid(rotor);
      g.add(rotor);
      g.position.set(c.x, 0, c.y);
      scene.add(g);
      // They turn slowly on the ground and faster while you choose where to drop from the plane (the north's moving read).
      updates.push((_t, dt) => (rotor.rotation.z -= dt * (planeView ? 1.6 : 0.6)));
    }

    if (p.kind === 'campfire') {
      const g = new THREE.Group();
      const ring = new THREE.Group();
      ring.position.set((p.x0 + 0.5) * TILE, 0, (p.y0 + 0.5) * TILE);
      statics.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const stone = mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x8a8580, flatShading: true }));
        stone.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
        ring.add(stone);
      }
      for (let i = 0; i < 3; i++) {
        const log = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 3) * Math.PI;
        log.position.y = 0.15;
        ring.add(log);
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
      // All ten puffs are one instanced mesh; each fades on its own through a per-instance opacity.
      const puffMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, depthWrite: false });
      const puffAlpha = new THREE.InstancedBufferAttribute(new Float32Array(10), 1);
      puffMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
          .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vAlpha;');
      };
      puffMat.customProgramCacheKey = () => 'puff-alpha';
      const puffGeo = new THREE.IcosahedronGeometry(0.35, 1);
      puffGeo.setAttribute('aAlpha', puffAlpha);
      const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, 10);
      puffMesh.frustumCulled = false;
      g.add(puffMesh);
      const puffM = new THREE.Matrix4();
      const puffQ = new THREE.Quaternion();
      const puffS = new THREE.Vector3();
      const puffs = Array.from({ length: 10 }, (_, i) => ({ t: i / 10, position: new THREE.Vector3() }));
      g.position.set((p.x0 + 0.5) * TILE, 0, (p.y0 + 0.5) * TILE);
      scene.add(g);
      updates.push((time, dt) => {
        const f = 1 + Math.sin(time * 17) * 0.12 + Math.sin(time * 29) * 0.08;
        flame.scale.set(f, f * (1 + Math.sin(time * 11) * 0.1), f);
        light.intensity = 5 + Math.sin(time * 13) * 1.2;
        puffs.forEach((m, i) => {
          m.t = (m.t + dt * 0.18) % 1;
          const k = m.t;
          m.position.set(Math.sin(k * 6 + time * 0.5) * 0.4 * k + k * 1.2, 1 + k * 7, Math.cos(k * 5) * 0.3 * k);
          puffMesh.setMatrixAt(i, puffM.compose(m.position, puffQ, puffS.setScalar(0.6 + k * 2.4)));
          puffAlpha.setX(i, 0.35 * (1 - k));
        });
        puffMesh.instanceMatrix.needsUpdate = true;
        puffAlpha.needsUpdate = true;
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
      if (RIVER.bridges.some(([bx, bw]) => tx >= bx && tx < bx + bw)) continue; // bridges are built below
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
  if (planks.length) statics.add(mesh(join(planks)));
  for (const [bx, bw] of RIVER.bridges) statics.add(bridge(bx, bw));
  // A few draw calls per quarter of the map instead of one per car, container, bar and stone.
  scene.add(mergeStatic(statics, { chunk: 88, bake: true }));
  scene.add(tall.build());

  const herd = animals(scene);
  updates.push(herd.update, birds(scene));
  return {
    update: (time: number, dt: number) => updates.forEach((u) => u(time, dt)),
    /** Once a frame while on the ground or under the canopy: ghosts the tall landmark parts that stand between the camera and `target` (the local player's chest). */
    fade: tall.fade,
    /** The plane phase: the windmill's sails turn faster. */
    setPlaneView: (on: boolean) => {
      planeView = on;
    },
    /** Dev checks: each tall part's box and current opacity. */
    tallState: tall.state,
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
      g.userData.kind = h.kind;
      const t = spot(h.area, s0);
      list.push({ g, legs, head: rnd() * 6, tx: t.x, ty: t.y, wait: rnd() * 4, area: h.area, speed: h.kind === 'cow' ? 0.7 : 0.9 });
    }
  }
  // Drawn instanced (all bodies of a kind, all legs: three draw calls); the groups above only hold the pose.
  const herdOf = (kind: 'cow' | 'sheep') => list.filter((a) => a.g.userData.kind === kind);
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, n: number) => {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
    im.count = n;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  const cows = herdOf('cow');
  const sheep = herdOf('sheep');
  const bodies = [
    { herd: cows, im: inst(geos.cow, flat, cows.length) },
    { herd: sheep, im: inst(geos.sheep, flat, sheep.length) },
  ];
  const legGeo = { cow: list.find((a) => a.g.userData.kind === 'cow')?.legs[0].geometry, sheep: list.find((a) => a.g.userData.kind === 'sheep')?.legs[0].geometry };
  const legSets = (['cow', 'sheep'] as const).map((k) => ({ herd: herdOf(k), im: legGeo[k] ? inst(legGeo[k]!, legMat, herdOf(k).length * 4) : null }));
  const draw = () => {
    for (const { herd, im } of bodies) {
      herd.forEach((a, i) => {
        a.g.updateMatrixWorld(true);
        im.setMatrixAt(i, a.g.children[0].matrixWorld);
      });
      im.instanceMatrix.needsUpdate = true;
    }
    for (const { herd, im } of legSets) {
      if (!im) continue;
      herd.forEach((a, i) => a.legs.forEach((l, k) => im.setMatrixAt(i * 4 + k, l.matrixWorld)));
      im.instanceMatrix.needsUpdate = true;
    }
  };
  draw();
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
      draw();
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
