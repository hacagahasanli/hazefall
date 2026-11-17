import * as THREE from 'three';

import { mat, mesh, PALETTE } from './palette';

import type { FighterId as CharacterId } from '../sim/types';

/**
 * Low-poly fighters built from primitives. Each one has a different silhouette:
 * Hotfix is tall with a hood, Legacy is a wide block, Standup is small under a
 * cloud of hair, Intern carries a backpack bigger than their back.
 * Models face +z; the arena turns them sideways.
 */

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
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

  const shoulderY = s.legLen + s.torsoH - 0.06;
  const armL = makeLimb(s.armLen, s.armR, s.top, s.skin, 'hand');
  const armR = makeLimb(s.armLen, s.armR, s.top, s.skin, 'hand');
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

  return { root, body, armL, armR, legL, legR, weapon, hand, chestY, phase: 0, turn: 0 };
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
  twoHanded: boolean;
  /** Seconds since the last shot: drives the recoil kick. */
  sinceShot: number;
}

/**
 * Top-down animation: the stride follows the real velocity, so strafing steps sideways and
 * back-pedalling plays the cycle backwards; the body leans into speed and banks into turns;
 * standing still, the fighter breathes and the gun sways a little.
 */
export const poseTopDown = (rig: Rig, p: TopDownPose) => {
  const { dt } = p;
  const speed = Math.hypot(p.vx, p.vy);
  const amp = Math.min(1, speed / 6.5);
  // Movement relative to the facing: fwd 1 = forward, -1 = backwards; side = strafing.
  const rel = Math.atan2(p.vy, p.vx) - p.yaw;
  const fwd = speed > 0.05 ? Math.cos(rel) : 0;
  const side = speed > 0.05 ? Math.sin(rel) : 0;
  const running = p.onGround && speed > 0.3;
  rig.phase += dt * (running ? 3.2 + speed * 1.2 : 0) * (fwd < -0.35 ? -1 : 1);
  const swing = running ? Math.sin(rig.phase) * amp : 0;

  // Legs swing along the direction of travel, not always forward.
  const along = Math.max(Math.abs(fwd), 0.25);
  rig.legL.rotation.x = damp(rig.legL.rotation.x, swing * 0.85 * along, 16, dt);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, -swing * 0.85 * along, 16, dt);
  rig.legL.rotation.z = damp(rig.legL.rotation.z, swing * 0.45 * side, 16, dt);
  rig.legR.rotation.z = damp(rig.legR.rotation.z, -swing * 0.45 * side, 16, dt);

  // Lean into the run and bank into turns; a hard forward tilt during a dash.
  const leanX = p.dashing ? 0.45 : 0.12 * fwd * amp;
  const bank = Math.max(-0.18, Math.min(0.18, -p.yawRate * 0.035)) + 0.08 * side * amp;
  rig.body.rotation.x = damp(rig.body.rotation.x, leanX, 10, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, bank, 8, dt);
  const breathe = running ? 0 : Math.sin(p.time * 2.1) * 0.012;
  rig.body.position.y = running ? Math.abs(Math.sin(rig.phase)) * 0.055 * amp : breathe;

  // Gun at the hip-to-chest line, kicked back by each shot, swaying when idle.
  const kick = Math.max(0, 1 - p.sinceShot / 0.12);
  const sway = running ? Math.sin(rig.phase * 0.5) * 0.04 * amp : Math.sin(p.time * 1.3) * 0.025;
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, -kick * 0.18 + sway, 28, dt);
  rig.weapon.rotation.y = damp(rig.weapon.rotation.y, sway * 0.6, 10, dt);
  rig.weapon.position.z = -kick * 0.1;
  rig.weapon.position.x = p.twoHanded ? 0 : 0.16;
  const toWeapon = rig.weapon.rotation.x - Math.PI / 2;

  let armL = p.onGround ? -swing * 0.75 * along : -0.4;
  let armLz = p.onGround ? 0.05 : -0.6;
  const armRz = p.twoHanded ? -0.25 : -0.08;
  if (p.twoHanded) {
    armL = toWeapon;
    armLz = 0.25;
  }
  rig.armL.rotation.x = damp(rig.armL.rotation.x, armL, 18, dt);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, toWeapon, 30, dt);
  rig.armL.rotation.z = damp(rig.armL.rotation.z, armLz, 12, dt);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, armRz, 12, dt);
};
