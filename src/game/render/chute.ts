import * as THREE from 'three';

import { DROP } from '../sim/constants';

/**
 * The parachute: an original ram-air canopy (a wing of cells, in the jumper's colour and white) on suspension lines,
 * opened in stages and deformed every frame by the air. Everything lives in the chute group's frame: its origin is
 * the top of the jumper's backpack (the harness), +y runs up the lines to the canopy, +z is the way the canopy flies;
 * "L" is the -x side, like the rig's armL and legL.
 *
 * The group's orientation is the canopy's own (see `moveChute`): the body hangs from it and swings on its own spring,
 * so the risers and lines are recomputed each frame from the body's straps and hands to the canopy, and always meet.
 *
 * Cost per jumper: four draw calls (canopy, lines, deployment bag, pilot chute), a ~180-point shape evaluation and
 * ~1000 vertex writes per frame; far canopies are reshaped less often by the caller.
 */

/** How far above the harness the canopy's lower surface flies (the lines' length). */
export const CHUTE_UP = 4.6;
/** Where the chute is attached to the body: the top of the backpack, behind the shoulders (body space z). */
export const HARNESS_BACK = -0.25;
/** Where each riser leaves the backpack's shoulder strap (x), relative to the harness point. */
const STRAP_X = 0.17;
/** The riser tops (where the lines meet the risers), in the chute frame. */
const JUNCTION = { x: 0.34, y: 0.6 };
/** The wing: span, chord, the arc's half-angle across the span, and the airfoil's thickness at the middle. */
const SPAN = 5.4;
const CHORD = 2.1;
const ARC = 0.55;
const THICK = 0.42;
/** Cells across the span and stations along the chord. */
const NS = 12;
const NC = 6;
/** Line attachment ribs (rib index from the -x tip) and chord stations (front, middle, rear). */
const LINE_RIBS = [0, 2, 4, 6, 8, 10, 12];
const LINE_ROWS = [0.06, 0.45, 0.8];
/** Brake lines leave the trailing edge at these ribs (L side, R side) and cascade to the toggles in the hands. */
const BRAKE_RIBS = [[0, 2, 4], [8, 10, 12]] as const;

const R = SPAN / 2 / Math.sin(ARC);
const PTS = (NS + 1) * (NC + 1);

const lineMat = new THREE.LineBasicMaterial({ vertexColors: true });
const bagMat = new THREE.MeshStandardMaterial({ color: 0x3b412a, roughness: 0.9 });

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** The index of grid point (rib i, station j) on the top (0) or bottom (1) surface. */
const at = (i: number, j: number, side: 0 | 1) => side * PTS + i * (NC + 1) + j;

export interface ChuteParts {
  canopy: THREE.Mesh;
  lines: THREE.LineSegments;
  bag: THREE.Mesh;
  pilot: THREE.Mesh;
  /** Grid points, top surface then bottom (x, y, z each), and the vertex-to-point map of the triangles. */
  pts: Float32Array;
  map: Uint16Array;
}

/**
 * A parachute for one jumper. `userData.deploy` holds the canopy (the part the touchdown collapse deflates);
 * everything tagged `line` (lines, bag, pilot) hides when the canopy is let go.
 */
export const buildChute = (color: string) => {
  const g = new THREE.Group();
  const deploy = new THREE.Group();
  g.add(deploy);
  g.userData.deploy = deploy;

  // The wing's triangles, unindexed so every cell has its own flat colour: top, bottom, and the two closed tips.
  const quads: [number, number, number, number, number][] = []; // four point indices and a colour key
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NC; j++) {
      const stripe = i % 2;
      quads.push([at(i, j, 0), at(i + 1, j, 0), at(i + 1, j + 1, 0), at(i, j + 1, 0), stripe]);
      quads.push([at(i, j, 1), at(i, j + 1, 1), at(i + 1, j + 1, 1), at(i + 1, j, 1), 2 + stripe]);
    }
  for (const i of [0, NS])
    for (let j = 0; j < NC; j++) quads.push([at(i, j, 0), at(i, j + 1, 0), at(i, j + 1, 1), at(i, j, 1), 4]);
  const map = new Uint16Array(quads.length * 6);
  const colors = new Float32Array(quads.length * 18);
  const main = new THREE.Color(color);
  const tones = [main, new THREE.Color(0xf4f2ea), main.clone().multiplyScalar(0.62), new THREE.Color(0xb9b6ad), main.clone().multiplyScalar(0.8)];
  quads.forEach(([a, b, c, d, k], q) => {
    [a, b, c, a, c, d].forEach((p, n) => {
      map[q * 6 + n] = p;
      tones[k].toArray(colors, (q * 6 + n) * 3);
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(map.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Flat shading takes the normals from the triangles in the shader: no normals to recompute each frame.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CHUTE_UP, 0), SPAN * 0.75);
  const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.75 }));
  canopy.castShadow = true;
  deploy.add(canopy);

  // Lines: suspension lines and brake lines (pale), and the two risers (dark webbing), as one draw call.
  const nLines = LINE_RIBS.length * LINE_ROWS.length + (BRAKE_RIBS[0].length + 1) * 2 + 2;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nLines * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const lc = new Float32Array(nLines * 6);
  for (let k = 0; k < nLines; k++) {
    const c = k >= nLines - 2 ? [0.16, 0.17, 0.14] : [0.9, 0.89, 0.84];
    lc.set(c, k * 6);
    lc.set(c, k * 6 + 3);
  }
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CHUTE_UP * 0.5, 0), CHUTE_UP + SPAN * 0.6);
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.userData.line = true;
  g.add(lines);

  // The deployment bag (leaves the pack first, the canopy folded inside) and the small pilot chute that pulls it out.
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), bagMat);
  bag.userData.line = true;
  bag.visible = false;
  g.add(bag);
  const pilot = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.34, 7, 1, true).rotateX(Math.PI),
    new THREE.MeshStandardMaterial({ color: main, side: THREE.DoubleSide, flatShading: true }),
  );
  pilot.userData.line = true;
  pilot.visible = false;
  g.add(pilot);

  const parts: ChuteParts = { canopy, lines, bag, pilot, pts: new Float32Array(PTS * 2 * 3), map };
  g.userData.parts = parts;
  return g;
};

export interface ChuteShape {
  /** Seconds since the pull (DROP.stretch: lines at full stretch; DROP.deployTime: open). */
  canopy: number;
  time: number;
  seed: number;
  /** Toggle pull per side, 0..1 (both: the flare). */
  brakeL: number;
  brakeR: number;
  /** In the chute group's frame: the body's shoulder straps and the hands (where the toggles are). */
  strapL: THREE.Vector3;
  strapR: THREE.Vector3;
  handL: THREE.Vector3;
  handR: THREE.Vector3;
}

/** 0..1 of the inflation, from the moment the lines are stretched to the moment the canopy is open. */
export const inflation = (canopy: number) => Math.min(1, Math.max(0, (canopy - DROP.stretch) / (DROP.deployTime - DROP.stretch)));

/**
 * Reshape the canopy and restring its lines for this frame. The stages, from `canopy` seconds since the pull:
 * - up to DROP.stretch: the pilot chute and the bag climb out of the pack, the lines paying out behind them;
 * - then the fabric streams out of the bag, narrow and flagging, and the cells fill from the middle out to the tips,
 *   the flutter dying as they pressurise, with a little overshoot as the wing snaps open;
 * - flying: the wing breathes, the trailing edge ripples, and a pulled toggle drags its side's trailing edge down.
 * `shape: false` restrings the lines only (a far canopy keeps last frame's shape).
 */
export const shapeChute = (g: THREE.Group, s: ChuteShape, shape = true) => {
  const parts = g.userData.parts as ChuteParts;
  const { pts } = parts;
  const k = s.canopy;
  const t = s.time;
  const bagUp = smooth(k / DROP.stretch);
  const f = inflation(k);
  const out = k >= DROP.stretch * 0.8;
  parts.canopy.visible = out;
  parts.bag.visible = k < DROP.stretch + 0.12;
  parts.pilot.visible = true;

  // The bag climbs to the end of the lines; the pilot chute flies above it, then rides the top of the wing.
  const bagY = 0.25 + (CHUTE_UP - 0.25) * bagUp;
  parts.bag.position.set(Math.sin(t * 21 + s.seed) * 0.05 * (1 - f), bagY, 0);
  parts.bag.rotation.set(Math.sin(t * 9) * 0.4 * (1 - bagUp), t * 3 * (1 - bagUp), 0);
  const pilotRise = Math.min(1, k / (DROP.stretch * 0.4));
  parts.pilot.position.set(Math.sin(t * 5.3 + s.seed) * 0.12, bagY + 0.4 + 1.1 * pilotRise + THICK * f, -CHORD * 0.25 * f);
  parts.pilot.rotation.set(Math.sin(t * 7.1 + s.seed) * 0.25, 0, Math.sin(t * 6.3 + s.seed) * 0.25);

  if (out && (shape || f < 1)) {
    // The snap open: a short widening past full span as the last cells fill, then settling.
    const pop = 1 + 0.07 * Math.sin(Math.PI * Math.min(1, Math.max(0, (k - DROP.deployTime + 0.25) / 0.45)));
    const breathe = 1 + 0.05 * Math.sin(t * 2.3 + s.seed);
    for (let i = 0; i <= NS; i++) {
      const u = (i / NS) * 2 - 1; // -1 the L tip .. +1 the R tip
      const au = Math.abs(u);
      // The cells fill from the middle outwards.
      const cell = smooth(f * 1.45 - au * 0.45);
      const flap = 0.3 * (1 - cell) + 0.025;
      const th = ARC * u;
      const fullX = R * Math.sin(th) * pop;
      const fullY = R * Math.cos(th) - R;
      const x = u * 0.28 + (fullX - u * 0.28) * cell;
      const yArc = fullY * cell;
      const thick = THICK * (1 - au * au * 0.55) * cell * breathe;
      const brake = u < 0 ? s.brakeL * smooth(-u * 1.3) : s.brakeR * smooth(u * 1.3);
      const chord = CHORD * (0.55 + 0.45 * cell) * (1 - au * au * 0.18);
      for (let j = 0; j <= NC; j++) {
        const v = j / NC;
        const z = (0.42 - v) * chord;
        // The airfoil: thickest a third of the way back, closing to the trailing edge.
        const camber = Math.sin(Math.PI * Math.pow(v, 0.62)) * thick;
        const drop = brake * v * v * 0.95 + (1 - cell) * v * 0.9;
        const ripple = Math.sin(t * 17 + u * 5.1 + v * 3.3 + s.seed) * flap * (0.4 + v) + Math.sin(t * 29 + u * 9 + s.seed) * flap * 0.35;
        const sway = Math.sin(t * 13 + v * 4 + s.seed * 1.7) * flap * 0.6;
        const top = at(i, j, 0) * 3;
        const bot = at(i, j, 1) * 3;
        const y = CHUTE_UP + yArc - drop + ripple;
        pts[top] = x + sway;
        pts[top + 1] = y + camber;
        pts[top + 2] = z;
        pts[bot] = x + sway;
        pts[bot + 1] = y - camber * 0.18;
        pts[bot + 2] = z;
      }
    }
    const pos = parts.canopy.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { map } = parts;
    for (let n = 0; n < map.length; n++) {
      const p = map[n] * 3;
      arr[n * 3] = pts[p];
      arr[n * 3 + 1] = pts[p + 1];
      arr[n * 3 + 2] = pts[p + 2];
    }
    pos.needsUpdate = true;
  }

  // The lines: from each riser top to the wing's lower surface (or to the bag while it climbs), the brake lines from
  // the hands to the trailing edge, and the risers from the shoulder straps to their tops.
  const la = parts.lines.geometry.attributes.position as THREE.BufferAttribute;
  const L = la.array as Float32Array;
  let n = 0;
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    L[n++] = ax;
    L[n++] = ay;
    L[n++] = az;
    L[n++] = bx;
    L[n++] = by;
    L[n++] = bz;
  };
  const jy = JUNCTION.y * Math.min(1, 0.3 + bagUp);
  const bp = parts.bag.position;
  for (const i of LINE_RIBS) {
    const jx = i < NS / 2 ? -JUNCTION.x : i > NS / 2 ? JUNCTION.x : 0;
    for (const v of LINE_ROWS) {
      if (!out) seg(jx, jy, 0, bp.x, bp.y, bp.z);
      else {
        const p = at(i, Math.round(v * NC), 1) * 3;
        seg(jx, jy, 0, pts[p], pts[p + 1], pts[p + 2]);
      }
    }
  }
  for (const [left, ribs] of [[true, BRAKE_RIBS[0]], [false, BRAKE_RIBS[1]]] as const) {
    const h = left ? s.handL : s.handR;
    // The cascade: the brake lines meet a metre above the hand, one line comes down to the toggle.
    const cx = h.x * 0.8;
    const cy = h.y + 1.1;
    const cz = h.z - 0.35;
    for (const i of ribs) {
      if (!out) seg(cx, cy, cz, bp.x, bp.y, bp.z);
      else {
        const p = at(i, NC, 1) * 3;
        seg(cx, cy, cz, pts[p], pts[p + 1], pts[p + 2]);
      }
    }
    seg(h.x, h.y, h.z, cx, cy, cz);
  }
  seg(s.strapL.x, s.strapL.y, s.strapL.z, -JUNCTION.x, jy, 0);
  seg(s.strapR.x, s.strapR.y, s.strapR.z, JUNCTION.x, jy, 0);
  la.needsUpdate = true;
};

/** A canopy's own motion: where it heads, how it banks and pitches, each on a spring so it has weight. */
export interface ChuteMotion {
  yaw: number;
  yawV: number;
  bank: number;
  bankV: number;
  pitch: number;
  pitchV: number;
  /** The opening surge is kicked in once. */
  surged: boolean;
}

export const newChuteMotion = (yaw: number): ChuteMotion => ({ yaw, yawV: 0, bank: 0, bankV: 0, pitch: 0, pitchV: 0, surged: false });

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Fly the canopy for a frame from the jumper's velocity (map m/s): it turns towards the way you are going with real
 * inertia (a slow, slightly under-damped yaw spring), banks into the turn, rocks forward and back (the surge when it
 * opens, then a slow pendulum) and leans back with airspeed. Returns the toggle pulls the turn asks for (the inside
 * toggle comes down) and the turn, -1..1.
 */
export const moveChute = (m: ChuteMotion, dt: number, v: { vx: number; vy: number; canopy: number; time: number; seed: number }) => {
  const speed = Math.hypot(v.vx, v.vy);
  const open = inflation(v.canopy);
  if (speed > 1.2) {
    const d = wrap(Math.atan2(v.vy, v.vx) - m.yaw);
    const w = 2.4;
    m.yawV += (w * w * d - 2 * 0.78 * w * m.yawV) * dt;
  } else m.yawV -= m.yawV * Math.min(1, 3 * dt);
  m.yaw = wrap(m.yaw + m.yawV * dt);
  // Bank into the turn (turning left on the map, yaw rising, the inside is the -x side: it goes down), on its own spring.
  const bankWant = Math.max(-0.55, Math.min(0.55, m.yawV * 0.42)) * open;
  const wb = 5;
  m.bankV += (wb * wb * (bankWant - m.bank) - 2 * 0.5 * wb * m.bankV) * dt;
  m.bank += m.bankV * dt;
  // Pitch: the canopy surges forward as it bites, then rocks back and settles; it leans back with airspeed.
  if (!m.surged && v.canopy >= DROP.deployTime * 0.8) {
    m.pitchV -= 1.6;
    m.surged = true;
  }
  const pitchWant = -0.05 * (speed / DROP.chuteSpeed) + Math.sin(v.time * 0.9 + v.seed) * 0.025 * open;
  const wp = 3.2;
  m.pitchV += (wp * wp * (pitchWant - m.pitch) - 2 * 0.3 * wp * m.pitchV) * dt;
  m.pitch += m.pitchV * dt;
  const turn = Math.max(-1, Math.min(1, m.yawV / 1.2));
  return { brakeL: Math.max(0, turn), brakeR: Math.max(0, -turn), turn };
};

const tmpEuler = new THREE.Euler();
/** The canopy's world orientation from its motion (yaw on the map: 0 = +x, like the fighters). */
export const chuteQuaternion = (m: ChuteMotion, out: THREE.Quaternion) => out.setFromEuler(tmpEuler.set(m.pitch, Math.PI / 2 - m.yaw, m.bank, 'YXZ'));

/**
 * A steering toggle's place, in body space: up at the side of the head on the rear riser; `pull` 0..1 brings it down
 * towards the hip (a hard turn, or both for the flare).
 */
export const toggleGrip = (side: -1 | 1, shoulderY: number, pull = 0, out = new THREE.Vector3()) =>
  out.set(side * (STRAP_X + 0.2 - 0.05 * pull), shoulderY + 0.4 - 0.7 * pull, HARNESS_BACK + 0.14 + 0.16 * pull);

/** Where a shoulder strap's riser leaves the pack, in body space. */
export const strapPoint = (side: -1 | 1, shoulderY: number, out = new THREE.Vector3()) => out.set(side * STRAP_X, shoulderY, HARNESS_BACK);

const inv = new THREE.Matrix4();
const pL = new THREE.Vector3();
const pR = new THREE.Vector3();
const hL = new THREE.Vector3();
const hR = new THREE.Vector3();

/** The parts of a fighter's rig the chute hangs from (structural, so this file need not know the rig). */
export interface ChuteBody {
  body: THREE.Object3D;
  foreL: THREE.Object3D;
  foreR: THREE.Object3D;
  armLen: number;
  shoulderL: THREE.Vector3;
}

/**
 * Put the chute on its jumper for this frame: the group sits on the harness (top of the backpack) with the canopy's
 * own orientation `q`, and the canopy is reshaped and its lines strung to the body's straps and hands as they are now
 * (call after posing the rig and updating its matrices).
 */
export const hangChute = (g: THREE.Group, rig: ChuteBody, q: THREE.Quaternion, s: Omit<ChuteShape, 'strapL' | 'strapR' | 'handL' | 'handR'>, shape = true) => {
  const y = rig.shoulderL.y;
  rig.body.localToWorld(g.position.set(0, y, HARNESS_BACK));
  g.quaternion.copy(q);
  g.updateMatrixWorld(true);
  inv.copy(g.matrixWorld).invert();
  rig.body.localToWorld(strapPoint(-1, y, pL)).applyMatrix4(inv);
  rig.body.localToWorld(strapPoint(1, y, pR)).applyMatrix4(inv);
  rig.foreL.localToWorld(hL.set(0, -rig.armLen / 2 - 0.02, 0)).applyMatrix4(inv);
  rig.foreR.localToWorld(hR.set(0, -rig.armLen / 2 - 0.02, 0)).applyMatrix4(inv);
  shapeChute(g, { ...s, strapL: pL, strapR: pR, handL: hL, handR: hR }, shape);
};
