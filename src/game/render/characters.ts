import * as THREE from 'three';

import { mat, mesh, PALETTE } from './palette';

import type { FighterId as CharacterId, WeaponKind } from '../sim/types';

/**
 * Low-poly fighters built from primitives. Each one has a different silhouette:
 * Hotfix is tall with a hood, Legacy is a wide block, Standup is small under a
 * cloud of hair, Intern carries a backpack bigger than their back.
 * Models face +z; the arena turns them sideways.
 */

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  /** Upper arms (pivot at the shoulder) and forearms (pivot at the elbow). */
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  armLen: number;
  shoulderL: THREE.Vector3;
  shoulderR: THREE.Vector3;
  legL: THREE.Group;
  legR: THREE.Group;
  weapon: THREE.Group;
  hand: THREE.Object3D;
  chestY: number;
  phase: number;
  turn: number;
}

interface Spec {
  legLen: number;
  legR: number;
  torsoW: number;
  torsoH: number;
  torsoD: number;
  headR: number;
  armLen: number;
  armR: number;
  skin: number;
  top: number;
  pants: number;
  shoes: number;
  extras: (ctx: { head: THREE.Group; torso: THREE.Group; spec: Spec }) => void;
}

const ico = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const cyl = (r: number, h: number, seg = 7) => new THREE.CylinderGeometry(r, r, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

const addEyes = (head: THREE.Group, r: number, y = 0.03) => {
  for (const sx of [-1, 1]) {
    const eye = mesh(box(0.045, 0.06, 0.02), mat(PALETTE.ink), false);
    eye.position.set(sx * r * 0.36, y, r * 0.93);
    head.add(eye);
  }
};

const SPECS: Record<CharacterId, Spec> = {
  hotfix: {
    legLen: 0.9,
    legR: 0.085,
    torsoW: 0.5,
    torsoH: 0.66,
    torsoD: 0.32,
    headR: 0.19,
    armLen: 0.78,
    armR: 0.07,
    skin: PALETTE.skinB,
    top: PALETTE.orange,
    pants: PALETTE.ink,
    shoes: PALETTE.white,
    extras: ({ head, torso, spec }) => {
      // Hood: a shell open at the face.
      const hood = mesh(
        new THREE.SphereGeometry(spec.headR * 1.32, 8, 6, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.72),
        mat(PALETTE.orange),
      );
      (hood.material as THREE.Material).side = THREE.DoubleSide;
      hood.position.y = 0.02;
      head.add(hood);
      // On-call headset with a gold mic.
      const band = mesh(new THREE.TorusGeometry(spec.headR * 1.38, 0.022, 4, 10, Math.PI), mat(PALETTE.ink));
      band.position.y = 0.02;
      head.add(band);
      for (const sx of [-1, 1]) {
        const cup = mesh(cyl(0.07, 0.06, 8), mat(PALETTE.ink));
        cup.rotation.z = Math.PI / 2;
        cup.position.set(sx * spec.headR * 1.36, 0.0, 0);
        head.add(cup);
      }
      const boom = mesh(box(0.02, 0.02, 0.22), mat(PALETTE.ink));
      boom.position.set(-spec.headR * 1.2, -0.08, 0.1);
      boom.rotation.y = -0.5;
      head.add(boom);
      const mic = mesh(ico(0.03, 0), mat(PALETTE.gold, { emissive: 0x3a2a00 }));
      mic.position.set(-spec.headR * 0.75, -0.11, 0.2);
      head.add(mic);
      // Hoodie strings and pocket.
      for (const sx of [-1, 1]) {
        const s = mesh(cyl(0.012, 0.2, 4), mat(PALETTE.white), false);
        s.position.set(sx * 0.07, spec.torsoH - 0.14, spec.torsoD / 2 + 0.01);
        torso.add(s);
      }
      const pocket = mesh(box(0.34, 0.14, 0.03), mat(0xb8441f));
      pocket.position.set(0, 0.16, spec.torsoD / 2);
      torso.add(pocket);
    },
  },
  legacy: {
    legLen: 0.55,
    legR: 0.15,
    torsoW: 0.95,
    torsoH: 0.75,
    torsoD: 0.55,
    headR: 0.23,
    armLen: 0.62,
    armR: 0.12,
    skin: PALETTE.skinA,
    top: PALETTE.green,
    pants: 0x5a4a3a,
    shoes: 0x4a3426,
    extras: ({ head, torso, spec }) => {
      const shirt = mesh(box(0.3, spec.torsoH * 0.92, 0.04), mat(PALETTE.paper));
      shirt.position.set(0, spec.torsoH / 2, spec.torsoD / 2);
      torso.add(shirt);
      for (let i = 0; i < 3; i++) {
        const b = mesh(cyl(0.025, 0.02, 6), mat(PALETTE.ink), false);
        b.rotation.x = Math.PI / 2;
        b.position.set(0.19, 0.18 + i * 0.18, spec.torsoD / 2 + 0.01);
        torso.add(b);
      }
      // A beard that takes the whole jaw.
      const beard = mesh(ico(spec.headR * 0.95, 1), mat(0x8a7e72));
      beard.scale.set(1.05, 0.95, 0.75);
      beard.position.set(0, -spec.headR * 0.45, spec.headR * 0.38);
      head.add(beard);
      const tache = mesh(box(0.2, 0.05, 0.06), mat(0x7a6e62));
      tache.position.set(0, -0.03, spec.headR * 0.95);
      head.add(tache);
      for (const sx of [-1, 1]) {
        const side = mesh(box(0.08, 0.14, 0.24), mat(0xb8b0a4));
        side.position.set(sx * spec.headR * 0.95, 0.02, -0.03);
        head.add(side);
        const lens = mesh(new THREE.TorusGeometry(0.065, 0.016, 4, 10), mat(PALETTE.ink), false);
        lens.position.set(sx * 0.085, 0.05, spec.headR * 0.98);
        head.add(lens);
      }
    },
  },
  standup: {
    legLen: 0.45,
    legR: 0.085,
    torsoW: 0.48,
    torsoH: 0.45,
    torsoD: 0.3,
    headR: 0.19,
    armLen: 0.48,
    armR: 0.065,
    skin: PALETTE.skinC,
    top: PALETTE.blue,
    pants: PALETTE.ink,
    shoes: PALETTE.gold,
    extras: ({ head, torso, spec }) => {
      // The hair cloud is the silhouette.
      const puffs: [number, number, number, number][] = [
        [0, 0.2, -0.04, 0.2],
        [-0.17, 0.14, -0.04, 0.16],
        [0.17, 0.14, -0.04, 0.16],
        [-0.22, -0.02, -0.06, 0.14],
        [0.22, -0.02, -0.06, 0.14],
        [-0.1, 0.26, 0.08, 0.13],
        [0.1, 0.26, 0.08, 0.13],
        [0, 0.12, -0.18, 0.19],
      ];
      for (const [x, y, z, r] of puffs) {
        const p = mesh(ico(r, 0), mat(0x2b2230));
        p.position.set(x, y, z);
        p.rotation.set(x * 7, y * 5, z * 3);
        head.add(p);
      }
      // Lanyard and badge.
      for (const sx of [-1, 1]) {
        const strap = mesh(cyl(0.012, 0.3, 4), mat(PALETTE.red), false);
        strap.position.set(sx * 0.07, spec.torsoH - 0.12, spec.torsoD / 2 + 0.01);
        strap.rotation.z = sx * 0.4;
        torso.add(strap);
      }
      const badge = mesh(box(0.11, 0.14, 0.02), mat(PALETTE.gold));
      badge.position.set(0, spec.torsoH - 0.3, spec.torsoD / 2 + 0.02);
      torso.add(badge);
    },
  },
  intern: {
    legLen: 0.7,
    legR: 0.1,
    torsoW: 0.52,
    torsoH: 0.55,
    torsoD: 0.32,
    headR: 0.19,
    armLen: 0.6,
    armR: 0.075,
    skin: PALETTE.skinA,
    top: PALETTE.paper,
    pants: PALETTE.blue,
    shoes: PALETTE.red,
    extras: ({ head, torso, spec }) => {
      const stripe = mesh(box(spec.torsoW + 0.01, 0.08, spec.torsoD + 0.01), mat(PALETTE.red));
      stripe.position.y = spec.torsoH * 0.55;
      torso.add(stripe);
      // Beanie with a pompom.
      const beanie = mesh(
        new THREE.SphereGeometry(spec.headR * 1.08, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(PALETTE.red),
      );
      beanie.position.y = 0.04;
      head.add(beanie);
      const cuff = mesh(cyl(spec.headR * 1.1, 0.07, 9), mat(0xa82e2e));
      cuff.position.y = 0.05;
      head.add(cuff);
      const pom = mesh(ico(0.07, 0), mat(PALETTE.gold));
      pom.position.y = spec.headR * 1.15;
      head.add(pom);
      // The backpack, bigger than it should be.
      const pack = mesh(box(0.62, 0.74, 0.4), mat(PALETTE.gold));
      pack.position.set(0, spec.torsoH * 0.5, -spec.torsoD / 2 - 0.2);
      torso.add(pack);
      const flap = mesh(box(0.5, 0.26, 0.06), mat(0xc98a1b));
      flap.position.set(0, spec.torsoH * 0.36, -spec.torsoD / 2 - 0.42);
      torso.add(flap);
      for (const sx of [-1, 1]) {
        const strap = mesh(box(0.06, spec.torsoH * 0.95, 0.04), mat(0xc98a1b), false);
        strap.position.set(sx * 0.15, spec.torsoH * 0.5, spec.torsoD / 2 + 0.01);
        torso.add(strap);
      }
    },
  },
};

export const buildRig = (id: CharacterId): Rig => {
  const s = SPECS[id];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = s.legLen;
  const torsoMesh = mesh(box(s.torsoW, s.torsoH, s.torsoD), mat(s.top));
  torsoMesh.position.y = s.torsoH / 2;
  torso.add(torsoMesh);
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = s.legLen + s.torsoH + 0.04 + s.headR;
  head.add(mesh(ico(s.headR, 1), mat(s.skin)));
  addEyes(head, s.headR);
  body.add(head);

  s.extras({ head, torso, spec: s });

  const makeLimb = (len: number, r: number, color: number, endColor: number, end: 'hand' | 'shoe') => {
    const g = new THREE.Group();
    const limb = mesh(cyl(r, len), mat(color));
    limb.position.y = -len / 2;
    g.add(limb);
    const tip =
      end === 'hand' ? mesh(ico(r * 1.15, 0), mat(endColor)) : mesh(box(r * 2.2, r * 1.2, r * 3.2), mat(endColor));
    tip.position.set(0, -len - (end === 'hand' ? 0.02 : 0), end === 'shoe' ? r * 0.7 : 0);
    g.add(tip);
    return g;
  };

  // Two-bone arms: an upper arm with a forearm hinged at the elbow, so hands can reach a grip.
  const makeArm = () => {
    const half = s.armLen / 2;
    const upper = new THREE.Group();
    const u = mesh(cyl(s.armR, half + 0.02), mat(s.top));
    u.position.y = -half / 2;
    upper.add(u);
    const elbow = mesh(ico(s.armR * 1.02, 0), mat(s.top));
    elbow.position.y = -half;
    upper.add(elbow);
    const fore = new THREE.Group();
    fore.position.y = -half;
    const f = mesh(cyl(s.armR * 0.92, half), mat(s.top));
    f.position.y = -half / 2;
    fore.add(f);
    const hand = mesh(ico(s.armR * 1.15, 0), mat(s.skin));
    hand.position.y = -half - 0.02;
    fore.add(hand);
    upper.add(fore);
    return { upper, fore };
  };
  const shoulderY = s.legLen + s.torsoH - 0.06;
  const left = makeArm();
  const right = makeArm();
  const armL = left.upper;
  const armR = right.upper;
  armL.position.set(-(s.torsoW / 2 + s.armR), shoulderY, 0);
  armR.position.set(s.torsoW / 2 + s.armR, shoulderY, 0);
  body.add(armL, armR);

  const legL = makeLimb(s.legLen, s.legR, s.pants, s.shoes, 'shoe');
  const legR = makeLimb(s.legLen, s.legR, s.pants, s.shoes, 'shoe');
  legL.position.set(-s.torsoW * 0.24, s.legLen, 0);
  legR.position.set(s.torsoW * 0.24, s.legLen, 0);
  body.add(legL, legR);

  const chestY = s.legLen + s.torsoH * 0.6;
  const weapon = new THREE.Group();
  weapon.position.set(0, chestY, 0);
  const hand = new THREE.Object3D();
  hand.position.set(0, 0, s.torsoD / 2 + Math.min(s.armLen, 0.55));
  weapon.add(hand);
  body.add(weapon);

  return {
    root, body, armL, armR, foreL: left.fore, foreR: right.fore, armLen: s.armLen,
    shoulderL: armL.position.clone(), shoulderR: armR.position.clone(),
    legL, legR, weapon, hand, chestY, phase: 0, turn: 0,
  };
};

export interface PoseInput {
  dt: number;
  time: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  /** Aim angle in world space: 0 = right, PI/2 = up. */
  aim: number;
  /** Turn the model sideways to the camera (arena) or keep it facing the viewer (gallery). */
  sideways: boolean;
  wall: -1 | 0 | 1;
  dashing: boolean;
  stunned: boolean;
  /** Two-handed guns pull both arms onto the weapon. */
  twoHanded: boolean;
  /** Seconds since the last shot: drives the recoil kick. */
  sinceShot: number;
  recoil: number;
  reloading: boolean;
  /** 0..1 while the Force Push is out. */
  pushing: number;
}

const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/** Procedural animation: running, jumping, aiming, recoil, Force Push. */
export const poseRig = (rig: Rig, p: PoseInput) => {
  const { dt } = p;
  const turnTarget = p.sideways ? p.facing * (Math.PI / 2 - 0.3) : 0;
  rig.turn = damp(rig.turn, turnTarget, 18, dt);
  rig.root.rotation.y = rig.turn;

  // Run cycle, played backwards when you back-pedal while aiming the other way.
  const speed = Math.abs(p.vx);
  const running = p.onGround && speed > 0.6;
  const backwards = p.vx * p.facing < 0 ? -1 : 1;
  rig.phase += dt * (running ? 4 + speed * 1.1 : 0) * backwards;
  const swing = running ? Math.sin(rig.phase) * Math.min(1, speed / 7) : 0;

  let legL = swing * 0.9;
  let legR = -swing * 0.9;
  if (!p.onGround) {
    legL = p.vy > 0 ? -0.7 : -0.25;
    legR = p.vy > 0 ? 0.35 : 0.2;
  }
  rig.legL.rotation.x = damp(rig.legL.rotation.x, legL, 20, dt);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, legR, 20, dt);

  let lean = running ? 0.1 * backwards : 0;
  if (p.dashing) lean = 0.45;
  if (p.stunned) lean = -0.35;
  if (p.pushing > 0) lean = 0.3 * p.pushing;
  rig.body.rotation.x = damp(rig.body.rotation.x, lean, 14, dt);
  rig.body.rotation.z = p.stunned ? Math.sin(p.time * 30) * 0.12 : damp(rig.body.rotation.z, 0, 10, dt);
  rig.body.position.y = running ? Math.abs(Math.sin(rig.phase)) * 0.06 : 0;

  // Elevation of the aim relative to where the model faces, in [-PI/2, PI/2].
  const elev = p.sideways ? Math.atan2(Math.sin(p.aim), Math.abs(Math.cos(p.aim))) : 0.15 * Math.sin(p.time);
  const kick = Math.max(0, 1 - p.sinceShot / 0.12) * p.recoil;
  let r = -elev - kick * 0.25;
  if (p.reloading) r = 0.7 + Math.sin(p.time * 14) * 0.1;
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, r, 30, dt);
  rig.weapon.position.z = -kick * 0.12;
  rig.weapon.position.x = p.twoHanded ? 0 : 0.16;
  const toWeapon = rig.weapon.rotation.x - Math.PI / 2;

  let armL = p.onGround ? -swing * 0.8 : -0.4;
  let armR = toWeapon;
  let armLz = p.onGround ? 0 : -0.6;
  let armRz = p.twoHanded ? -0.25 : -0.08;
  if (p.twoHanded) {
    armL = toWeapon;
    armLz = 0.25;
  }
  if (p.pushing > 0) {
    // Free hand shoves forward, palm out.
    armL = -Math.PI / 2 * p.pushing;
    armLz = 0.35 * p.pushing;
  }
  rig.armL.rotation.x = damp(rig.armL.rotation.x, armL, 30, dt);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, armR, 40, dt);
  rig.armL.rotation.z = damp(rig.armL.rotation.z, armLz, 14, dt);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, armRz, 14, dt);
};

export const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
};

/**
 * Where each gun sits relative to the chest (body space, model facing +z): x to the right,
 * y up, `grip` how far forward the firing hand is, `support` how much further the other hand
 * reaches along the gun (0 = both hands on the grip).
 */
const HOLD: Record<WeaponKind, { x: number; y: number; grip: number; support: number }> = {
  fists: { x: 0, y: 0, grip: 0.3, support: 0 },
  pistol: { x: 0.02, y: 0.06, grip: 0.46, support: 0 },
  smg: { x: 0.13, y: 0.02, grip: 0.24, support: 0.4 },
  shotgun: { x: 0.13, y: 0.03, grip: 0.24, support: 0.44 },
  rifle: { x: 0.13, y: 0.03, grip: 0.24, support: 0.42 },
  sniper: { x: 0.13, y: 0.04, grip: 0.24, support: 0.44 },
  rockets: { x: 0.2, y: 0.16, grip: 0.18, support: 0.32 },
};

const tmpE = new THREE.Euler();
const tmpGrip = new THREE.Vector3();
const tmpSupport = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const qA = new THREE.Quaternion();

/**
 * Point an upper arm and forearm so the hand lands on `target` (both in body space). Elbows
 * bend down and outwards. If the target is out of reach the arm straightens towards it.
 */
const reach = (upper: THREE.Group, fore: THREE.Group, shoulder: THREE.Vector3, target: THREE.Vector3, len: number, side: 1 | -1) => {
  const a = len / 2;
  const toT = vA.subVectors(target, shoulder);
  const d = Math.min(Math.max(toT.length(), 0.05), len * 0.999);
  const u = vD.copy(toT).normalize();
  // Elbow direction: out to the side and down, made perpendicular to the shoulder-hand line.
  const pole = vB.set(side * 0.8, -1, -0.2);
  pole.sub(vC.copy(u).multiplyScalar(pole.dot(u))).normalize();
  const cosA = Math.min(1, d / (2 * a));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbowDir = vC.copy(u).multiplyScalar(cosA).addScaledVector(pole, sinA).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, elbowDir);
  // Forearm: from the elbow towards the hand, expressed in the upper arm's frame.
  const elbow = vB.copy(shoulder).addScaledVector(elbowDir, a);
  const handDir = vA.copy(shoulder).addScaledVector(u, d).sub(elbow).normalize();
  handDir.applyQuaternion(qA.copy(upper.quaternion).invert());
  fore.quaternion.setFromUnitVectors(DOWN, handDir);
};

export interface TopDownPose {
  dt: number;
  time: number;
  /** World velocity on the map (m/s). */
  vx: number;
  vy: number;
  /** Where the body faces on the map (radians, 0 = +x). */
  yaw: number;
  /** How fast the visual yaw is turning (rad/s): the body banks into turns. */
  yawRate: number;
  onGround: boolean;
  dashing: boolean;
  /** Seconds since the last shot: drives the recoil kick. */
  sinceShot: number;
  /** What's in the hands: decides the grip and where each hand goes. */
  gun: WeaponKind;
  /** 0..1 through a reload, or null. */
  reload: number | null;
  /** -1 (left) .. 1 (right). */
  lean: number;
  /** 0..1 through a vault over a rail or sill, or null. */
  vault: number | null;
  /** 0..1 through the landing roll, or null. */
  roll: number | null;
}

/** How hard each gun kicks: the shotgun and the sniper rock the whole body. */
const KICK: Record<WeaponKind, number> = { fists: 0.3, pistol: 0.6, smg: 0.35, rifle: 0.5, shotgun: 1.3, sniper: 1.6, rockets: 1.4 };

/**
 * Top-down animation, built to feel physical:
 * - the stride follows the real velocity (strafing steps sideways, back-pedalling runs the cycle
 *   backwards), the torso counter-twists, the head and the gun bob with each step;
 * - each gun kicks by its own weight: muzzle climb, the gun driven back, the shoulders rocked;
 * - reloading drops the support hand to the magazine and tilts the gun;
 * - leaning tilts the body out to the side;
 * - a vault plants a hand on the rail, tucks the legs and swings over;
 * - the landing after a parachute drop is a forward roll.
 */
export const poseTopDown = (rig: Rig, p: TopDownPose) => {
  const { dt } = p;
  const speed = Math.hypot(p.vx, p.vy);
  const amp = Math.min(1, speed / 6.5);
  const rel = Math.atan2(p.vy, p.vx) - p.yaw;
  const fwd = speed > 0.05 ? Math.cos(rel) : 0;
  const side = speed > 0.05 ? Math.sin(rel) : 0;
  const running = p.onGround && speed > 0.3 && p.vault === null && p.roll === null;
  rig.phase += dt * (running ? 3.2 + speed * 1.2 : 0) * (fwd < -0.35 ? -1 : 1);
  const swing = running ? Math.sin(rig.phase) * amp : 0;
  const bob = running ? Math.abs(Math.sin(rig.phase)) : 0;

  // ---- the landing roll: curl up and turn over around the hips, then stand.
  if (p.roll !== null) {
    const k = p.roll;
    const turn = k * Math.PI * 2;
    const hip = 0.55;
    // Kept in (-PI, PI] so the body doesn't spin back a whole turn when the roll ends.
    rig.body.rotation.set(turn > Math.PI ? turn - Math.PI * 2 : turn, 0, 0);
    rig.body.position.set(0, hip - hip * Math.cos(turn) - 0.35 * Math.sin(k * Math.PI), -hip * Math.sin(turn) * 0.4);
    const tuck = Math.sin(k * Math.PI);
    rig.legL.rotation.set(-1.6 * tuck, 0, 0);
    rig.legR.rotation.set(-1.4 * tuck, 0, 0);
    rig.armL.quaternion.setFromEuler(tmpE.set(-1.2 * tuck, 0, 0.3));
    rig.armR.quaternion.setFromEuler(tmpE.set(-1.2 * tuck, 0, -0.3));
    rig.foreL.quaternion.setFromEuler(tmpE.set(-1.4 * tuck, 0, 0));
    rig.foreR.quaternion.setFromEuler(tmpE.set(-1.4 * tuck, 0, 0));
    rig.weapon.visible = false;
    return;
  }
  rig.body.rotation.y = damp(rig.body.rotation.y, running ? -swing * 0.12 * Math.abs(fwd) : 0, 12, dt); // torso twist

  // ---- legs: stride along the direction of travel; tucked during a vault.
  const along = Math.max(Math.abs(fwd), 0.25);
  if (p.vault !== null) {
    const tuck = Math.sin(Math.min(1, p.vault / 0.8) * Math.PI);
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -1.3 * tuck, 25, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, -0.9 * tuck, 25, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, 0.5 * tuck, 25, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, 0.5 * tuck, 25, dt);
  } else {
    rig.legL.rotation.x = damp(rig.legL.rotation.x, swing * 0.9 * along, 16, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, -swing * 0.9 * along, 16, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, swing * 0.45 * side, 16, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, -swing * 0.45 * side, 16, dt);
  }

  // ---- body: lean into the run, bank into turns, lean out (Q/E), the kick of the gun.
  const sinceShot = p.sinceShot;
  const kickT = sinceShot < 0.25 ? sinceShot / 0.25 : 1;
  // A kick that snaps back and settles with a small overshoot.
  const kick = (1 - kickT) * Math.cos(kickT * Math.PI * 1.5) * KICK[p.gun];
  let leanX = p.dashing ? 0.45 : 0.14 * fwd * amp - kick * 0.07;
  let bank = Math.max(-0.18, Math.min(0.18, -p.yawRate * 0.035)) + 0.08 * side * amp - p.lean * 0.38;
  if (p.vault !== null) {
    // Swing over sideways with the weight on the planted hand.
    leanX = 0.35 * Math.sin(p.vault * Math.PI);
    bank = -0.55 * Math.sin(p.vault * Math.PI);
  }
  rig.body.rotation.x = damp(rig.body.rotation.x, leanX, 14, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, bank, 10, dt);
  const breathe = running ? 0 : Math.sin(p.time * 2.1) * 0.012;
  rig.body.position.set(
    damp(rig.body.position.x, p.lean * 0.22, 10, dt),
    running ? bob * 0.07 * amp : breathe,
    -kick * 0.05,
  );

  // ---- the gun: at the chest, stock at the right shoulder; bobs with the steps, kicks by its
  // weight, tilts and drops a little during a reload.
  const h = HOLD[p.gun];
  const step = running ? Math.sin(rig.phase * 2) * 0.03 * amp : 0;
  const sway = running ? Math.sin(rig.phase) * 0.05 * amp : Math.sin(p.time * 1.3) * 0.02;
  const r = p.reload;
  const reloadTilt = r === null ? 0 : Math.sin(Math.min(1, r * 1.3) * Math.PI) * 0.55;
  rig.weapon.visible = p.gun !== 'fists' && p.vault === null;
  rig.weapon.position.set(h.x + sway * 0.4, rig.chestY + h.y + step - reloadTilt * 0.12, -Math.max(0, kick) * 0.12);
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, -kick * 0.35 + sway * 0.4 + reloadTilt * 0.5, 30, dt);
  rig.weapon.rotation.y = damp(rig.weapon.rotation.y, sway * 0.6, 10, dt);
  rig.weapon.rotation.z = damp(rig.weapon.rotation.z, reloadTilt * 0.6 + p.lean * 0.2, 12, dt);
  rig.hand.position.set(0, 0, h.grip);

  if (p.vault !== null) {
    // Both hands planted on the rail ahead, sliding back as the body goes over it.
    const k = p.vault;
    const z = 0.55 - Math.max(0, k - 0.15) * 1.4;
    const y = 0.95 - rig.body.position.y;
    tmpGrip.set(0.22, y, z);
    tmpSupport.set(-0.22, y, z);
    if (k < 0.75) {
      reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
      reach(rig.armL, rig.foreL, rig.shoulderL, tmpSupport, rig.armLen, -1);
    } else {
      rig.armL.quaternion.setFromEuler(tmpE.set(-0.6, 0, 0.5));
      rig.armR.quaternion.setFromEuler(tmpE.set(-0.6, 0, -0.5));
    }
    return;
  }

  if (p.gun === 'fists') {
    // Arms pump with the stride, elbows bent; a jab on each punch.
    const jab = Math.max(0, 1 - sinceShot / 0.2);
    const swingArm = (upper: THREE.Group, fore: THREE.Group, sign: number) => {
      const punch = sign > 0 ? jab : 0;
      upper.quaternion.setFromEuler(tmpE.set(p.onGround ? sign * swing * 0.9 * along - punch * 1.4 : -0.4, 0, sign * 0.1));
      fore.quaternion.setFromEuler(tmpE.set(-0.6 - Math.max(0, sign * swing) * 0.6 + punch * 0.5, 0, 0));
    };
    swingArm(rig.armL, rig.foreL, -1);
    swingArm(rig.armR, rig.foreR, 1);
    return;
  }
  // Two-bone IK: right hand on the grip, left hand on the fore-end (or cupping the pistol grip);
  // during a reload the left hand goes down to the magazine well and back.
  rig.weapon.updateMatrix();
  tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
  if (r !== null && r < 0.85) {
    const drop = Math.sin(Math.min(1, r / 0.85) * Math.PI);
    tmpSupport.set(-0.05, -0.12 - drop * 0.35, h.grip + 0.1).applyMatrix4(rig.weapon.matrix);
  } else {
    tmpSupport.set(h.support === 0 ? -0.05 : 0, h.support === 0 ? -0.04 : 0.03, h.grip + h.support).applyMatrix4(rig.weapon.matrix);
  }
  reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
  reach(rig.armL, rig.foreL, rig.shoulderL, tmpSupport, rig.armLen, -1);
};

/**
 * Hanging under the parachute: hands up on the risers, legs loose and swinging a little,
 * the body tilted the way you steer. With the gun out (you fired in the last moments) the right
 * hand brings the pistol down and forward while the left keeps hold of a riser.
 */
export const poseChute = (rig: Rig, p: { dt: number; time: number; seed: number; steerX: number; steerZ: number; shooting: boolean }) => {
  const { dt, time, seed } = p;
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.x = damp(rig.body.rotation.x, p.steerZ * 0.12, 4, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, -p.steerX * 0.12, 4, dt);
  rig.body.rotation.y = 0;
  const dangle = Math.sin(time * 1.7 + seed) * 0.18;
  rig.legL.rotation.set(dangle + 0.1, 0, 0.05);
  rig.legR.rotation.set(-dangle * 0.8 + 0.15, 0, -0.05);
  rig.armL.quaternion.setFromEuler(tmpE.set(Math.PI - 0.35, 0, -0.35));
  rig.foreL.quaternion.setFromEuler(tmpE.set(0.25, 0, 0));
  rig.weapon.visible = p.shooting;
  if (p.shooting) {
    const h = HOLD.pistol;
    rig.weapon.position.set(h.x + 0.1, rig.chestY + h.y, 0);
    rig.weapon.rotation.set(0, 0, 0);
    rig.hand.position.set(0, 0, h.grip);
    rig.weapon.updateMatrix();
    tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
    reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
  } else {
    rig.armR.quaternion.setFromEuler(tmpE.set(Math.PI - 0.35, 0, 0.35));
    rig.foreR.quaternion.setFromEuler(tmpE.set(0.25, 0, 0));
  }
};
