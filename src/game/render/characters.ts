import * as THREE from 'three';

import { skinRig } from './merge';

import { BODY_ROLL, BODY_ROLL_MAX, HARNESS_BACK, swingSpring, toggleGrip } from './chute';
import { mat, mesh, PALETTE } from './palette';

import { GLOW_MATERIAL, GOLD_MATERIAL, outfitParts } from '../cosmetics';

import type { OutfitParts, PartColor } from '../cosmetics';
import type { FighterId as CharacterId, WeaponKind } from '../sim/types';
import { SNIPER_KICK, sniperBolt, sniperKick } from './sniperKick';

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
  /** Thighs (pivot at the hip) and shins (pivot at the knee). */
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  legLen: number;
  weapon: THREE.Group;
  hand: THREE.Object3D;
  chestY: number;
  phase: number;
  turn: number;
  head: THREE.Group;
  /** The plate carrier, shown while you wear armor. */
  vest: THREE.Group;
  /** Where the hips and legs face on the map (they lag the upper body and follow the run). */
  hipYaw: number;
  hipInit: boolean;
  /** The body's tilt springs in the air (angular velocities): the free-fall attitude, then the swing under the canopy. */
  chuteSwing: { vx: number; vz: number };
  /** In the air, where the body pivots: 0 at the hips (free fall) .. 1 at the harness (hanging from the canopy). */
  airPivot: number;
  /** Last frame's velocity and the smoothed acceleration (m/s^2, map axes): the body leans into a start, a stop and a cut. */
  motion: { vx: number; vy: number; ax: number; ay: number };
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
  extras: (ctx: { head: THREE.Group; torso: THREE.Group; spec: Spec; c: (part: string) => THREE.Material }) => void;
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
    extras: ({ head, torso, spec, c }) => {
      // Hood: a shell open at the face.
      const hood = mesh(
        new THREE.SphereGeometry(spec.headR * 1.32, 8, 6, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.72),
        c('hood').clone(),
      );
      (hood.material as THREE.Material).side = THREE.DoubleSide;
      hood.position.y = 0.02;
      head.add(hood);
      // On-call headset with a gold mic.
      const band = mesh(new THREE.TorusGeometry(spec.headR * 1.38, 0.022, 4, 10, Math.PI), c('headset'));
      band.position.y = 0.02;
      head.add(band);
      for (const sx of [-1, 1]) {
        const cup = mesh(cyl(0.07, 0.06, 8), c('headset'));
        cup.rotation.z = Math.PI / 2;
        cup.position.set(sx * spec.headR * 1.36, 0.0, 0);
        head.add(cup);
      }
      const boom = mesh(box(0.02, 0.02, 0.22), c('headset'));
      boom.position.set(-spec.headR * 1.2, -0.08, 0.1);
      boom.rotation.y = -0.5;
      head.add(boom);
      const mic = mesh(ico(0.03, 0), c('mic'));
      mic.position.set(-spec.headR * 0.75, -0.11, 0.2);
      head.add(mic);
      // Hoodie strings and pocket.
      for (const sx of [-1, 1]) {
        const s = mesh(cyl(0.012, 0.2, 4), c('strings'), false);
        s.position.set(sx * 0.07, spec.torsoH - 0.14, spec.torsoD / 2 + 0.01);
        torso.add(s);
      }
      const pocket = mesh(box(0.34, 0.14, 0.03), c('pocket'));
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
    extras: ({ head, torso, spec, c }) => {
      const shirt = mesh(box(0.3, spec.torsoH * 0.92, 0.04), c('shirt'));
      shirt.position.set(0, spec.torsoH / 2, spec.torsoD / 2);
      torso.add(shirt);
      for (let i = 0; i < 3; i++) {
        const b = mesh(cyl(0.025, 0.02, 6), c('buttons'), false);
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
        const lens = mesh(new THREE.TorusGeometry(0.065, 0.016, 4, 10), c('lens'), false);
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
    extras: ({ head, torso, spec, c }) => {
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
        const strap = mesh(cyl(0.012, 0.3, 4), c('lanyard'), false);
        strap.position.set(sx * 0.07, spec.torsoH - 0.12, spec.torsoD / 2 + 0.01);
        strap.rotation.z = sx * 0.4;
        torso.add(strap);
      }
      const badge = mesh(box(0.11, 0.14, 0.02), c('badge'));
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
    extras: ({ head, torso, spec, c }) => {
      const stripe = mesh(box(spec.torsoW + 0.01, 0.08, spec.torsoD + 0.01), c('stripe'));
      stripe.position.y = spec.torsoH * 0.55;
      torso.add(stripe);
      // Beanie with a pompom.
      const beanie = mesh(
        new THREE.SphereGeometry(spec.headR * 1.08, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        c('beanie'),
      );
      beanie.position.y = 0.04;
      head.add(beanie);
      const cuff = mesh(cyl(spec.headR * 1.1, 0.07, 9), c('cuff'));
      cuff.position.y = 0.05;
      head.add(cuff);
      const pom = mesh(ico(0.07, 0), c('pom'));
      pom.position.y = spec.headR * 1.15;
      head.add(pom);
      // The backpack, bigger than it should be.
      const pack = mesh(box(0.62, 0.74, 0.4), c('bag'));
      pack.position.set(0, spec.torsoH * 0.5, -spec.torsoD / 2 - 0.2);
      torso.add(pack);
      const flap = mesh(box(0.5, 0.26, 0.06), c('bagTrim'));
      flap.position.set(0, spec.torsoH * 0.36, -spec.torsoD / 2 - 0.42);
      torso.add(flap);
      for (const sx of [-1, 1]) {
        const strap = mesh(box(0.06, spec.torsoH * 0.95, 0.04), c('bagTrim'), false);
        strap.position.set(sx * 0.15, spec.torsoH * 0.5, spec.torsoD / 2 + 0.01);
        torso.add(strap);
      }
    },
  },
};

/**
 * Fighters only: a faint cool light on the edges that turn away from the camera, so a body separates from the grass or
 * the wall behind it. It is a share of the fighter's own lit colour (at most about a third, on the very rim), so it never
 * glows in the dark and never shows through anything.
 */
const rimCache = new Map<THREE.Material, THREE.Material>();
const withRim = (m: THREE.Material) => {
  let r = rimCache.get(m);
  if (r) return r;
  const c = m.clone();
  const base = m.onBeforeCompile;
  c.onBeforeCompile = (sh, renderer) => {
    base.call(m, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimK = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.8, 0.88, 1.0) * (rimK * rimK * rimK * 0.35);`,
    );
  };
  const key = m.customProgramCacheKey();
  c.customProgramCacheKey = () => `${key}-rim`;
  rimCache.set(m, c);
  return c;
};

/** The two shared special materials, one each: Terminal's glow and Legend's polished gold. Both bake into the rig's one draw call. */
const SPECIAL = (() => {
  const flat = { flatShading: true };
  return {
    gold: new THREE.MeshStandardMaterial({ ...flat, color: GOLD_MATERIAL.color, metalness: GOLD_MATERIAL.metalness, roughness: GOLD_MATERIAL.roughness, emissive: GOLD_MATERIAL.emissive }),
    glow: new THREE.MeshStandardMaterial({ ...flat, color: GLOW_MATERIAL.color, roughness: 0.6, emissive: GLOW_MATERIAL.emissive, emissiveIntensity: GLOW_MATERIAL.emissiveIntensity }),
  };
})();

/** The mic's own look in the Standard outfit: gold with a faint glow (it keeps it in Legend). */
const MIC_STANDARD = mat(PALETTE.gold, { emissive: 0x3a2a00 });
const partMat = (p: OutfitParts, part: string): THREE.Material => {
  const col: PartColor = p[part];
  if (col === 'gold' || col === 'glow') return SPECIAL[col];
  if (part === 'mic' && col === 0xffc93c) return MIC_STANDARD;
  return mat(col);
};

/** `outfit` is a key from cosmetics.ts (`standard` by default): it recolours parts only, never the shapes. */
export const buildRig = (id: CharacterId, outfit = 'standard'): Rig => {
  const s = SPECS[id];
  const parts = outfitParts(outfit, id);
  const c = (part: string) => partMat(parts, part);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = s.legLen;
  const torsoMesh = mesh(box(s.torsoW, s.torsoH, s.torsoD), c('top'));
  torsoMesh.position.y = s.torsoH / 2;
  torso.add(torsoMesh);
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = s.legLen + s.torsoH + 0.04 + s.headR;
  head.add(mesh(ico(s.headR, 1), mat(s.skin)));
  addEyes(head, s.headR);
  body.add(head);

  s.extras({ head, torso, spec: s, c });

  // ---- kit: everyone is dressed for a fight (the Intern brought their own huge backpack).
  const olive = mat(0x4f5638);
  const oliveDark = mat(0x3b412a);
  const strapMat = mat(0x2a2d24);
  // The shared pack, its flap and pouches and the roll take the outfit's kit colours; holster, belt pouches and vest stay.
  const packMat = id === 'intern' ? olive : c('pack');
  const flapMat = id === 'intern' ? oliveDark : c('flap');
  const rollMat = id === 'intern' ? mat(0xa08c64) : c('roll');
  const back = -s.torsoD / 2;
  if (id !== 'intern') {
    const pack = mesh(box(s.torsoW * 0.78, s.torsoH * 0.72, 0.26), packMat);
    pack.position.set(0, s.torsoH * 0.52, back - 0.13);
    const flap = mesh(box(s.torsoW * 0.7, s.torsoH * 0.22, 0.05), flapMat);
    flap.position.set(0, s.torsoH * 0.78, back - 0.27);
    const pouchL = mesh(box(0.1, s.torsoH * 0.36, 0.18), flapMat);
    pouchL.position.set(-s.torsoW * 0.44, s.torsoH * 0.42, back - 0.12);
    const pouchR = pouchL.clone();
    pouchR.position.x = s.torsoW * 0.44;
    const roll = mesh(new THREE.CylinderGeometry(0.09, 0.09, s.torsoW * 0.82, 10).rotateZ(Math.PI / 2), rollMat);
    roll.position.set(0, s.torsoH * 0.93, back - 0.13);
    torso.add(pack, flap, pouchL, pouchR, roll);
  }
  for (const sx of [-1, 1]) {
    // Shoulder straps over the chest.
    const strap = mesh(box(0.06, s.torsoH * 0.62, 0.03), strapMat, false);
    strap.position.set(sx * s.torsoW * 0.26, s.torsoH * 0.62, s.torsoD / 2 + 0.012);
    torso.add(strap);
  }
  const belt = mesh(box(s.torsoW + 0.04, 0.08, s.torsoD + 0.04), c('belt'));
  belt.position.y = 0.05;
  const buckle = mesh(box(0.07, 0.06, 0.02), c('buckle'), false);
  buckle.position.set(0, 0.05, s.torsoD / 2 + 0.03);
  const holster = mesh(box(0.08, 0.2, 0.13), oliveDark);
  holster.position.set(s.torsoW / 2 + 0.05, -0.05, 0.02);
  const beltPouchL = mesh(box(0.1, 0.11, 0.07), olive);
  beltPouchL.position.set(-s.torsoW * 0.3, 0.02, s.torsoD / 2 + 0.05);
  const beltPouchR = beltPouchL.clone();
  beltPouchR.position.x = s.torsoW * 0.3;
  torso.add(belt, buckle, holster, beltPouchL, beltPouchR);
  const vest = new THREE.Group();
  const plate = mesh(box(s.torsoW + 0.07, s.torsoH * 0.58, s.torsoD + 0.08), oliveDark);
  plate.position.y = s.torsoH * 0.6;
  vest.add(plate);
  for (let i = -1; i <= 1; i++) {
    const mag = mesh(box(0.1, 0.15, 0.06), olive);
    mag.position.set(i * 0.12, s.torsoH * 0.45, s.torsoD / 2 + 0.07);
    vest.add(mag);
  }
  vest.visible = false;
  torso.add(vest);

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
    const u = mesh(cyl(s.armR, half + 0.02), c('top'));
    u.position.y = -half / 2;
    upper.add(u);
    const elbow = mesh(ico(s.armR * 1.02, 0), c('top'));
    elbow.position.y = -half;
    upper.add(elbow);
    const fore = new THREE.Group();
    fore.position.y = -half;
    const f = mesh(cyl(s.armR * 0.92, half), c('top'));
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

  // Two-bone legs: a thigh and a shin hinged at the knee, the shoe on the shin.
  const makeLeg = () => {
    const half = s.legLen / 2;
    const thigh = new THREE.Group();
    const t = mesh(cyl(s.legR * 1.08, half + 0.02), c('pants'));
    t.position.y = -half / 2;
    thigh.add(t);
    const knee = mesh(ico(s.legR * 1.05, 0), c('pants'));
    knee.position.y = -half;
    thigh.add(knee);
    const shin = new THREE.Group();
    shin.position.y = -half;
    const sh = mesh(cyl(s.legR * 0.95, half), c('pants'));
    sh.position.y = -half / 2;
    shin.add(sh);
    const shoe = mesh(box(s.legR * 2.2, s.legR * 1.2, s.legR * 3.2), c('shoes'));
    // The sole, not the middle of the shoe, sits at the end of the leg: on a bridge deck the
    // feet rest on the planks instead of sinking into them.
    shoe.position.set(0, -half + s.legR * 0.6, s.legR * 0.7);
    shin.add(shoe);
    thigh.add(shin);
    return { thigh, shin };
  };
  const ll = makeLeg();
  const lr = makeLeg();
  const legL = ll.thigh;
  const legR = lr.thigh;
  legL.position.set(-s.torsoW * 0.24, s.legLen, 0);
  legR.position.set(s.torsoW * 0.24, s.legLen, 0);
  // Legs yaw first, then stride, so a twisted stance still swings along the hips' direction.
  legL.rotation.order = 'YXZ';
  legR.rotation.order = 'YXZ';
  body.add(legL, legR);

  const chestY = s.legLen + s.torsoH * 0.6;
  const weapon = new THREE.Group();
  weapon.position.set(0, chestY, 0);
  const hand = new THREE.Object3D();
  hand.position.set(0, 0, s.torsoD / 2 + Math.min(s.armLen, 0.55));
  weapon.add(hand);
  body.add(weapon);

  // Drawn as a skinned mesh (the groups above are its bones): a fighter is two or three draw calls instead of ~40.
  skinRig(root, new Set([weapon]), [vest]);
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && !Array.isArray(o.material)) o.material = withRim(o.material);
  });
  return {
    root, body, armL, armR, foreL: left.fore, foreR: right.fore, armLen: s.armLen,
    shinL: ll.shin, shinR: lr.shin, legLen: s.legLen,
    head, vest, hipYaw: 0, hipInit: false, chuteSwing: { vx: 0, vz: 0 }, airPivot: 0, motion: { vx: 0, vy: 0, ax: 0, ay: 0 },
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

/** Clamp `x` to [lo, hi]; one argument is a symmetric limit +-hi. */
const clampN = (x: number, hi: number, lo = -hi) => Math.max(lo, Math.min(hi, x));
const smoothN = (x: number) => {
  const t = clampN(x, 1, 0);
  return t * t * (3 - 2 * t);
};
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
/** Elbows out and down, behind the hands: on a ladder. */
const POLE_L = new THREE.Vector3(-0.6, -0.4, -0.6);
const POLE_R = new THREE.Vector3(0.6, -0.4, -0.6);

/**
 * Point an upper arm and forearm so the hand lands on `target` (both in body space). Elbows
 * bend down and outwards. If the target is out of reach the arm straightens towards it.
 */
const reach = (upper: THREE.Group, fore: THREE.Group, shoulder: THREE.Vector3, target: THREE.Vector3, len: number, side: 1 | -1, poleDir?: THREE.Vector3) => {
  const a = len / 2;
  const toT = vA.subVectors(target, shoulder);
  const d = Math.min(Math.max(toT.length(), 0.05), len * 0.999);
  const u = vD.copy(toT).normalize();
  // Elbow direction: out to the side and down, made perpendicular to the shoulder-hand line.
  const pole = poleDir ? vB.copy(poleDir) : vB.set(side * 0.8, -1, -0.2);
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
  /** Reduced motion: the sniper kick is a quarter size. */
  reducedMotion?: boolean;
  /** 0..1 through a reload, or null. */
  reload: number | null;
  /** -1 (left) .. 1 (right). */
  lean: number;
  /** 0..1 through a vault over a rail or sill, or null. */
  vault: number | null;
  /** 0..1 through the landing roll, or null. */
  roll: number | null;
  /** 0 (standing) .. 1 (crouched). */
  crouch?: number;
  /** Off your feet (a hop, a step off a roof): the vertical speed, + up (m/s). */
  airV?: number;
  /** 0..1: how hard you just landed, already shaped over time (the knees take it, then you stand). */
  land?: number;
  /** 0..1 up a ladder (the last quarter is over the eave), or null. */
  climb?: number | null;
  /** The aim's elevation (radians, + up): the gun points at a target above or below you. */
  aimPitch?: number;
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
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---- the hips: they follow the run, the upper body follows the aim. Running sideways or
  // back-pedalling twists the waist (legs one way, gun the other) up to ~60 degrees; standing,
  // the feet stay planted until the twist gets too big, then step round under you.
  if (!rig.hipInit) {
    rig.hipYaw = p.yaw;
    rig.hipInit = true;
  }
  let hipWant = rig.hipYaw;
  if (speed > 0.6) {
    const move = Math.atan2(p.vy, p.vx);
    hipWant = Math.abs(wrap(move - p.yaw)) > 1.9 ? move + Math.PI : move; // back-pedal: hips face the gun
  } else if (Math.abs(wrap(p.yaw - rig.hipYaw)) > 0.75) hipWant = p.yaw;
  const stepping = speed <= 0.6 && Math.abs(wrap(hipWant - rig.hipYaw)) > 0.05;
  rig.hipYaw += wrap(hipWant - rig.hipYaw) * (1 - Math.exp(-(speed > 0.6 ? 10 : 7) * dt));
  // Never twist past what a waist can do: beyond it the hips are dragged round.
  const maxTwist = 1.05;
  const tw = wrap(rig.hipYaw - p.yaw);
  if (Math.abs(tw) > maxTwist) rig.hipYaw = p.yaw + Math.sign(tw) * maxTwist;
  const twist = wrap(rig.hipYaw - p.yaw);
  if (stepping) rig.phase += dt * 9; // a quick shuffle while turning on the spot
  // The head turns a little ahead of the body into a turn.
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.max(-0.45, Math.min(0.45, -p.yawRate * 0.08)), 10, dt);
  // The sniper's shot nods the head back with the recoil.
  const nod = p.gun === 'sniper' ? sniperKick(p.sinceShot) * (p.reducedMotion ? SNIPER_KICK.reducedScale : 1) : 0;
  rig.head.rotation.x = damp(rig.head.rotation.x, -nod * SNIPER_KICK.headNod, nod > 0 ? 60 : 10, dt);

  const rel = Math.atan2(p.vy, p.vx) - rig.hipYaw;
  const fwd = speed > 0.05 ? Math.cos(rel) : 0;
  const side = speed > 0.05 ? Math.sin(rel) : 0;
  const crouch = p.crouch ?? 0;
  const climbing = p.climb !== undefined && p.climb !== null;
  const airborne = !p.onGround && p.vault === null && p.roll === null && !climbing;
  const running = p.onGround && speed > 0.3 && p.vault === null && p.roll === null && !climbing;
  // Crouched: shorter, quicker-looking steps (the stride is cut, the cadence kept).
  rig.phase += dt * (running ? 3.2 + speed * 1.2 * (1 + crouch * 0.6) : 0) * (fwd < -0.35 ? -1 : 1);
  const swing = running ? Math.sin(rig.phase) * amp * (1 - crouch * 0.45) : 0;
  // The body's weight: the smoothed acceleration in the body's own frame (forward, to the side). Starting off you lean
  // in, stopping you rock back, cutting sideways you bank into the cut.
  const mo = rig.motion;
  if (dt > 0) {
    const k = 1 - Math.exp(-10 * dt);
    mo.ax += (Math.max(-60, Math.min(60, (p.vx - mo.vx) / dt)) - mo.ax) * k;
    mo.ay += (Math.max(-60, Math.min(60, (p.vy - mo.vy) / dt)) - mo.ay) * k;
  }
  mo.vx = p.vx;
  mo.vy = p.vy;
  const accF = mo.ax * Math.cos(rig.hipYaw) + mo.ay * Math.sin(rig.hipYaw);
  const accS = -mo.ax * Math.sin(rig.hipYaw) + mo.ay * Math.cos(rig.hipYaw);
  const land = p.land ?? 0;

  // ---- up a ladder: face the wall, hand over hand on the rungs, knees stepping up opposite; over the eave like a vault.
  if (climbing && p.climb! < 0.75) {
    const up = p.climb! / 0.75;
    const cyc = up * 5; // five pulls from the ground to the eave
    const lead = (cyc % 1);
    const reachL = Math.sin(Math.PI * (Math.floor(cyc) % 2 === 0 ? lead : 1 - lead));
    const reachR = 1 - reachL;
    rig.body.rotation.set(damp(rig.body.rotation.x, 0.08, 14, dt), 0, damp(rig.body.rotation.z, (reachL - reachR) * 0.06, 10, dt));
    rig.body.position.set(0, 0, 0.05);
    rig.weapon.visible = false;
    // Hands on the rungs in front: one high, reaching, the other lower, pulling.
    const sy = rig.shoulderL.y;
    tmpGrip.set(-0.2, sy + 0.12 + reachR * 0.42, 0.34);
    tmpSupport.set(0.2, sy + 0.12 + reachL * 0.42, 0.34);
    reach(rig.armL, rig.foreL, rig.shoulderL, tmpGrip, rig.armLen, -1, POLE_L);
    reach(rig.armR, rig.foreR, rig.shoulderR, tmpSupport, rig.armLen, 1, POLE_R);
    // Feet on the rungs: the knee opposite the high hand comes up.
    rig.legL.rotation.set(damp(rig.legL.rotation.x, -0.25 - reachL * 0.95, 22, dt), 0, 0);
    rig.legR.rotation.set(damp(rig.legR.rotation.x, -0.25 - reachR * 0.95, 22, dt), 0, 0);
    rig.shinL.rotation.x = damp(rig.shinL.rotation.x, 0.4 + reachL * 1.25, 22, dt);
    rig.shinR.rotation.x = damp(rig.shinR.rotation.x, 0.4 + reachR * 1.25, 22, dt);
    rig.head.rotation.x = damp(rig.head.rotation.x, -0.35, 8, dt);
    return;
  }
  const vaultK = climbing ? (p.climb! - 0.75) / 0.25 : p.vault;
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
    rig.shinL.rotation.set(2.0 * tuck, 0, 0);
    rig.shinR.rotation.set(1.8 * tuck, 0, 0);
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
  let kneeL: number;
  let kneeR: number;
  if (vaultK !== null) {
    const tuck = Math.sin(Math.min(1, vaultK / 0.8) * Math.PI);
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -1.3 * tuck, 25, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, -0.9 * tuck, 25, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, 0.5 * tuck, 25, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, 0.5 * tuck, 25, dt);
    kneeL = 1.9 * tuck;
    kneeR = 1.6 * tuck;
  } else if (airborne) {
    // Off your feet: going up the knees tuck (one leads), coming down both legs reach for the ground.
    const v = p.airV ?? 0;
    const rise = Math.max(0, Math.min(1, v / 4));
    const fall = Math.max(0, Math.min(1, -v / 5));
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -0.85 * rise - 0.4 * fall - 0.15, 14, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, -0.3 * rise - 0.25 * fall - 0.1, 14, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, -0.06 - 0.08 * fall, 14, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, 0.06 + 0.08 * fall, 14, dt);
    kneeL = 0.35 + 1.15 * rise + 0.35 * fall;
    kneeR = 0.3 + 0.55 * rise + 0.25 * fall;
  } else {
    // A real run cycle: the leg swinging through bends hard at the knee and lifts the foot; the
    // standing leg stays nearly straight. Standing still: a ready stance, knees a little bent.
    // Crouched, the hips sink (thighs forward, knees bent hard, one foot a little ahead); a hard landing bends both
    // knees for a moment on top of whatever stance you're in.
    const c = running ? Math.cos(rig.phase) : 0;
    const ready = 0.22;
    const sit = crouch * 1.05 + land * 0.75;
    const bend = crouch * 1.85 + land * 1.35;
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -swing * 1.0 * along - ready * 0.6 - sit - crouch * 0.12, 16, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, swing * 1.0 * along - ready * 0.6 - sit + crouch * 0.18, land > 0.05 ? 40 : 16, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, -swing * 0.45 * side - 0.04 - crouch * 0.08, 16, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, swing * 0.45 * side + 0.04 + crouch * 0.08, 16, dt);
    kneeL = ready + bend + (running ? Math.max(0, c) * 1.5 * amp * (1 - crouch * 0.5) + 0.15 * amp : 0);
    kneeR = ready + bend - crouch * 0.25 + (running ? Math.max(0, -c) * 1.5 * amp * (1 - crouch * 0.5) + 0.15 * amp : 0);
  }
  rig.shinL.rotation.x = damp(rig.shinL.rotation.x, kneeL, land > 0.05 ? 40 : 18, dt);
  rig.shinR.rotation.x = damp(rig.shinR.rotation.x, kneeR, land > 0.05 ? 40 : 18, dt);
  // Legs face the hips (local yaw is the opposite sign of map yaw). A small step on the spot lifts
  // the feet while turning.
  rig.legL.rotation.y = -twist;
  rig.legR.rotation.y = -twist;
  if (stepping) {
    const lift = Math.max(0, Math.sin(rig.phase)) * 0.5;
    rig.shinL.rotation.x += lift;
    rig.legL.rotation.x -= lift * 0.4;
  }
  // Keep the lower foot on the ground: the body drops as far as the bent legs shorten it.
  const reachOf = (thigh: number, knee: number) => (Math.cos(thigh) + Math.cos(thigh + knee)) / 2;
  // (In the air the tucked legs lift the feet instead.)
  const legDrop = airborne ? 0 : rig.legLen * (1 - Math.max(reachOf(rig.legL.rotation.x, rig.shinL.rotation.x), reachOf(rig.legR.rotation.x, rig.shinR.rotation.x)));

  // ---- body: lean into the run, bank into turns, lean out (Q/E), the kick of the gun.
  const sinceShot = p.sinceShot;
  const kickT = sinceShot < 0.25 ? sinceShot / 0.25 : 1;
  // A kick that snaps back and settles with a small overshoot.
  const kick = (1 - kickT) * Math.cos(kickT * Math.PI * 1.5) * KICK[p.gun];
  // Running leans the body into it like a soldier on the move; firing straightens it a little.
  const bodyKick = p.gun === 'sniper' ? sniperKick(sinceShot) * (p.reducedMotion ? SNIPER_KICK.reducedScale : 1) : 0;
  // Crouched the chest comes forward over the knees; a landing folds it a little more; the weight shifts with each start,
  // stop and cut (accF, accS); in the air the body sits upright going up and leans in coming down.
  const weight = p.reducedMotion ? 0.4 : 1;
  let leanX = (p.dashing ? 0.45 : 0.26 * fwd * amp * (1 - crouch * 0.4) + 0.05 - kick * 0.07) - bodyKick * SNIPER_KICK.bodyLean +
    crouch * 0.3 + land * 0.32 + weight * Math.max(-0.16, Math.min(0.2, accF * 0.012)) + (airborne ? Math.max(-0.08, Math.min(0.12, -(p.airV ?? 0) * 0.025)) : 0);
  // The model faces +z, so its own right is -x: a lean to the right (E) moves the body to -x and
  // tips the top that way (positive z rotation).
  let bank = Math.max(-0.18, Math.min(0.18, -p.yawRate * 0.035)) + 0.08 * side * amp + p.lean * 0.38 + weight * Math.max(-0.12, Math.min(0.12, accS * 0.01));
  if (vaultK !== null) {
    // Swing over sideways with the weight on the planted hand.
    leanX = 0.35 * Math.sin(vaultK * Math.PI);
    bank = -0.55 * Math.sin(vaultK * Math.PI);
  }
  rig.body.rotation.x = damp(rig.body.rotation.x, leanX, bodyKick > 0 ? 80 : 14, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, bank, 10, dt);
  const breathe = running ? 0 : Math.sin(p.time * 2.1) * 0.012;
  rig.body.position.set(
    damp(rig.body.position.x, -p.lean * 0.22, 10, dt),
    (running ? bob * 0.06 * amp : breathe) - legDrop,
    -kick * 0.05 - bodyKick * SNIPER_KICK.bodyBack,
  );

  // ---- the gun: at the chest, stock at the right shoulder; bobs with the steps, kicks by its
  // weight, tilts and drops a little during a reload.
  const h = HOLD[p.gun];
  const step = running ? Math.sin(rig.phase * 2) * 0.03 * amp : 0;
  const sway = running ? Math.sin(rig.phase) * 0.05 * amp : Math.sin(p.time * 1.3) * 0.02;
  const r = p.reload;
  const reloadTilt = r === null ? 0 : Math.sin(Math.min(1, r * 1.3) * Math.PI) * 0.55;
  rig.weapon.visible = p.gun !== 'fists' && vaultK === null;
  // The sniper's own kick (every fighter's model, bots too): the rifle pitches up hard and is driven back, then settles.
  const snipeScale = p.reducedMotion ? SNIPER_KICK.reducedScale : 1;
  const snipe = p.gun === 'sniper' ? sniperKick(sinceShot) * snipeScale : 0;
  // ...then the bolt: the rifle rolls over, dips and is pulled back to re-chamber, and comes back ready.
  const bolt = p.gun === 'sniper' ? sniperBolt(sinceShot) * snipeScale : 0;
  // The model's right is -x: the gun sits at the right shoulder, on the side the over-the-shoulder camera looks past.
  rig.weapon.position.set(-h.x + sway * 0.4, rig.chestY + h.y + step - reloadTilt * 0.12 - bolt * SNIPER_KICK.boltDrop + snipe * SNIPER_KICK.weaponRise, -Math.max(0, kick) * 0.12 - snipe * SNIPER_KICK.weaponPush - bolt * SNIPER_KICK.boltPull);
  // Running without firing for a moment: the gun drops to low ready, muzzle down; it comes up
  // the moment you shoot.
  const lowReady = running && sinceShot > 0.8 && p.gun !== 'pistol' ? 0.35 * amp : 0;
  // The muzzle follows the aim up or down (at someone on a roof, from a roof down at the street), less the body's lean.
  const pitchAim = lowReady > 0 ? 0 : Math.max(-0.7, Math.min(0.7, p.aimPitch ?? 0));
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, -kick * 0.35 - snipe * SNIPER_KICK.weaponPitch + sway * 0.4 + bolt * SNIPER_KICK.boltPitch + reloadTilt * 0.5 + lowReady - pitchAim - (rig.body.rotation.x - 0.05) * 0.85, snipe > 0 ? 90 : 30 - lowReady * 40, dt);
  rig.weapon.rotation.y = damp(rig.weapon.rotation.y, sway * 0.6, 10, dt);
  // Leaning, the body tips over but the rifle is held nearly level against it (only a little cant), so the sights stay
  // on the line the round will fly.
  rig.weapon.rotation.z = damp(rig.weapon.rotation.z, reloadTilt * 0.6 - p.lean * 0.26 + bolt * SNIPER_KICK.boltRoll, bolt > 0 ? 40 : 12, dt);
  rig.hand.position.set(0, 0, h.grip);

  if (vaultK !== null) {
    // Both hands planted on the rail ahead, sliding back as the body goes over it.
    const k = vaultK;
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
    tmpSupport.set(0.05, -0.12 - drop * 0.35, h.grip + 0.1).applyMatrix4(rig.weapon.matrix);
  } else {
    tmpSupport.set(h.support === 0 ? 0.05 : 0, h.support === 0 ? -0.04 : 0.03, h.grip + h.support).applyMatrix4(rig.weapon.matrix);
  }
  // Right hand (the arm on -x) on the grip, left hand (on +x) on the fore-end.
  reach(rig.armL, rig.foreL, rig.shoulderL, tmpGrip, rig.armLen, -1);
  reach(rig.armR, rig.foreR, rig.shoulderR, tmpSupport, rig.armLen, 1);
};

// ---------- in the air: free fall, the opening, hanging under the canopy
//
// Every air pose blends: each joint slerps towards its target at its own rate and the body's tilt rides on springs, so
// the exit, the free fall, the pull, the opening and the canopy flow into each other without a snap. The wind's work on
// the limbs is layered noise (three incommensurate sines per channel, seeded per fighter), scaled by airspeed, so it
// never reads as a loop.

const qT = new THREE.Quaternion();
const qU = new THREE.Quaternion();
const qF = new THREE.Quaternion();
const vP = new THREE.Vector3();
const vQ = new THREE.Vector3();
const vT = new THREE.Vector3();
const pole = new THREE.Vector3();

/** Slerp a joint towards an Euler target (in the joint's own rotation order) at `rate` per second. */
const toward = (o: THREE.Object3D, x: number, y: number, z: number, rate: number, dt: number) => {
  qT.setFromEuler(tmpE.set(x, y, z, o.rotation.order));
  o.quaternion.slerp(qT, 1 - Math.exp(-rate * dt));
};

/** Two-bone IK onto `target`, blended in at `rate` per second from wherever the arm is now. */
const reachToward = (upper: THREE.Group, fore: THREE.Group, shoulder: THREE.Vector3, target: THREE.Vector3, len: number, side: 1 | -1, rate: number, dt: number, poleDir?: THREE.Vector3) => {
  qU.copy(upper.quaternion);
  qF.copy(fore.quaternion);
  reach(upper, fore, shoulder, target, len, side, poleDir);
  const a = 1 - Math.exp(-rate * dt);
  upper.quaternion.copy(qU.slerp(upper.quaternion, a));
  fore.quaternion.copy(qF.slerp(fore.quaternion, a));
};

/** Wind noise in -1..1: three sines at unrelated rates, so the pattern never visibly repeats. */
const gust = (t: number, seed: number, k: number) =>
  Math.sin(t * 1.37 * k + seed * 1.9) * 0.5 + Math.sin(t * 2.91 * k + seed * 3.7 + 1.3) * 0.3 + Math.sin(t * 6.43 * k + seed * 0.61 + 2.1) * 0.2;

/** Drive the body's tilt springs towards (pitch, roll) and keep the chosen pivot still while it turns. */
const airBody = (rig: Rig, dt: number, pitch: number, roll: number, yaw: number, w: number, zeta: number, pivotTo: number, rollCap = 0) => {
  const sw = rig.chuteSwing;
  // Integrated in small steps: the springs are stiff and a long frame (phones) must not overshoot numerically.
  const n = Math.max(1, Math.ceil(dt / 0.012));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    sw.vx += (w * w * (pitch - rig.body.rotation.x) - 2 * zeta * w * sw.vx) * h;
    sw.vz += (w * w * (roll - rig.body.rotation.z) - 2 * zeta * w * sw.vz) * h;
    rig.body.rotation.x += sw.vx * h;
    rig.body.rotation.z += sw.vz * h;
    // A hard ceiling on the roll, so a swing can never read as a flip.
    if (rollCap > 0 && Math.abs(rig.body.rotation.z) > rollCap) {
      rig.body.rotation.z = Math.sign(rig.body.rotation.z) * rollCap;
      if (Math.sign(sw.vz) === Math.sign(rig.body.rotation.z)) sw.vz = 0;
    }
  }
  rig.body.rotation.y = damp(rig.body.rotation.y, yaw, 6, dt);
  rig.airPivot = damp(rig.airPivot, pivotTo, 5, dt);
  // The pivot: the hips in free fall, the harness under the canopy. Rotating about it, not the feet, keeps the body
  // where the sim says it is (and keeps the shoulders under the risers).
  vP.set(0, rig.legLen + 0.1, 0).lerp(vQ.set(0, rig.shoulderL.y, HARNESS_BACK), rig.airPivot);
  vT.copy(vP).applyEuler(rig.body.rotation);
  rig.body.position.copy(vP).sub(vT);
};

export interface FreefallPose {
  dt: number;
  time: number;
  seed: number;
  /** Stick along the body, -1 (back off) .. 1 (track forward), and across it, -1..1. */
  track: number;
  side: number;
  /** How fast the body is turning (rad/s, map yaw): it banks and dips a shoulder into the turn. */
  turn: number;
  /** Airspeed as a share of terminal velocity: the wind's grip on the limbs. */
  speed: number;
  /** Seconds out of the door: the first moments roll out of the exit into the arch. */
  sinceJump: number;
}

/**
 * Free fall, belly to earth: hips pushed down into an arch, the arms out with the elbows bent about square and the hands
 * near head height, the knees bent with the feet up and a little apart, the head up looking ahead. Tracking forward
 * sweeps the arms back to the hips and straightens the legs (head down, the body planing); backing off reaches the arms
 * forward and tucks the knees; a turn dips the inside shoulder and drops that arm. The wind works every limb and the
 * torso, harder the faster you fall. Out of the door you tumble over from upright into the arch on the body's spring.
 */
export const poseFreefall = (rig: Rig, p: FreefallPose) => {
  const { dt, time: t, seed } = p;
  const w = Math.min(1, 0.25 + p.speed);
  const fwd = Math.max(0, p.track);
  const back = Math.max(0, -p.track);
  const exit = Math.max(0, 1 - p.sinceJump / 0.9);
  rig.weapon.visible = false;
  // The torso: arched and flat, pitched by the track, banked by the turn; the exit adds a roll off the door.
  const bank = Math.max(-0.5, Math.min(0.5, -p.turn * 0.32)) + p.side * 0.12;
  const pitch = 1.32 + fwd * 0.28 - back * 0.22 + gust(t, seed, 0.7) * 0.05 * w;
  const roll = bank + gust(t, seed + 5, 0.6) * 0.06 * w + exit * Math.sin(p.sinceJump * 5) * 0.35;
  airBody(rig, dt, pitch, roll, gust(t, seed + 9, 0.5) * 0.05 * w, 5.5, 0.75, 0);
  // Arms: hands out by the head (the box), swept back (track) or reaching forward (backing off).
  const arm = (upper: THREE.Group, fore: THREE.Group, shoulder: THREE.Vector3, side: 1 | -1, s: number) => {
    const dip = side * p.turn * 0.12; // the inside arm (the one the body banks towards) drops towards the ground
    vT.set(
      side * (0.5 - fwd * 0.1 + back * 0.02) + gust(t, s, 1.1) * 0.04 * w,
      0.34 - fwd * 0.92 + back * 0.32 + gust(t, s + 2, 1.3) * 0.05 * w,
      -0.05 + fwd * 0.02 + back * 0.12 + dip + gust(t, s + 4, 1.7) * 0.05 * w,
    ).add(shoulder);
    // Elbows out to the side and a little towards the feet and the sky (swept back: out and up).
    pole.set(side * 0.7, -0.8 + fwd * 1.0, -0.45);
    reachToward(upper, fore, shoulder, vT, rig.armLen, side, exit > 0 ? 6 : 10, dt, pole);
  };
  arm(rig.armL, rig.foreL, rig.shoulderL, -1, seed);
  arm(rig.armR, rig.foreR, rig.shoulderR, 1, seed + 11);
  // Legs: thighs a little back (towards the sky) and apart, knees bent; tracking straightens them out behind.
  const leg = (thigh: THREE.Group, shin: THREE.Group, side: 1 | -1, s: number) => {
    const flick = gust(t, s, 1.6) * 0.07 * w;
    toward(thigh, 0.3 - fwd * 0.2 + back * 0.15 + flick, 0, side * (0.32 - fwd * 0.14) + gust(t, s + 3, 0.9) * 0.04 * w, 9, dt);
    // The feet flutter in the airflow.
    toward(shin, 1.15 - fwd * 0.85 + back * 0.35 + gust(t, s + 6, 2.4) * 0.1 * w, 0, 0, 10, dt);
  };
  leg(rig.legL, rig.shinL, -1, seed + 21);
  leg(rig.legR, rig.shinR, 1, seed + 31);
  // The head up against the arch, looking ahead and down; it turns into a turn first.
  rig.head.rotation.x = damp(rig.head.rotation.x, -0.72 - fwd * 0.2 + gust(t, seed + 41, 0.8) * 0.04, 6, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.max(-0.4, Math.min(0.4, p.turn * 0.25)), 6, dt);
};

export interface ChutePose {
  dt: number;
  time: number;
  seed: number;
  /** Seconds since the pull (see DROP.stretch, DROP.deployTime). */
  canopy: number;
  /** Toggle pulls, 0..1 each (both: the flare). */
  brakeL: number;
  brakeR: number;
  /** The canopy's turn, -1..1 (positive turns towards the rig's L side), and its bank and pitch (rad). */
  turn: number;
  bank: number;
  pitch: number;
  /** Near the ground: 0..1 into the flare and landing stance. */
  flare: number;
  /** Diving the canopy (Shift), 0..1 by airspeed: the legs stream back and together. */
  dive?: number;
  /** The settings' reduced motion: a calmer swing, half the idle leg noise. */
  reducedMotion?: boolean;
  shooting: boolean;
}

/**
 * The opening and the canopy flight, in one pose so the stages blend:
 * - the pull (until the lines stretch): still in the arch, the right hand reaches back to the pack, throws the pilot
 *   chute out to the side and comes back up, the left arm holding the body level;
 * - the opening shock: the body swings on its spring from flat to hanging upright under the harness, the legs kick
 *   down and forward with it, the hands go up to the toggles, the head looks up to check the canopy;
 * - flying: hanging from the harness, the swing follows the canopy's bank and pitch with a pendulum's lag, the legs
 *   dangle each on its own and trail the swing, a turn pulls that side's toggle down and twists the body and head into
 *   the turn; near the ground both toggles come down (the flare) and the legs come together for the touchdown.
 * With the gun out the right hand brings the pistol down and forward while the left keeps its toggle.
 */
export const poseChute = (rig: Rig, p: ChutePose) => {
  const { dt, time: t, seed, canopy: k } = p;
  const stretched = k >= 0.5;
  // Body: flat (a little head-up as you look for the handle) until the lines stretch, then hanging, following the canopy.
  const sw = rig.chuteSwing;
  if (!stretched) airBody(rig, dt, 1.1, 0, 0, 5.5, 0.75, 0);
  else {
    // The body swings under the wing on a spring that rings only while the canopy opens, then settles in about a swing.
    const sp = swingSpring(k, p.reducedMotion);
    airBody(rig, dt, p.pitch * 0.7 + gust(t, seed, 0.35) * 0.03, p.bank * BODY_ROLL + gust(t, seed + 3, 0.3) * 0.03, clampN(p.turn * 0.18, 0.1745), sp.w, sp.zeta, 1, BODY_ROLL_MAX);
  }
  // Head: down at the handle during the pull, up at the canopy as it opens, then looking ahead and into turns.
  const check = k > 0.6 && k < 2.2 ? 1 : 0;
  rig.head.rotation.x = damp(rig.head.rotation.x, !stretched ? -0.2 : check ? -0.75 : 0.12 + p.flare * 0.25, 5, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, stretched ? clampN(p.turn * 0.45, 0.436) : 0, 7, dt);

  // Legs.
  if (!stretched) {
    toward(rig.legL, 0.15, 0, -0.12, 8, dt);
    toward(rig.legR, 0.15, 0, 0.12, 8, dt);
    toward(rig.shinL, 0.9, 0, 0, 8, dt);
    toward(rig.shinR, 0.9, 0, 0, 8, dt);
  } else {
    // Sitting in the leg straps: hips flexed, knees softly bent, the legs a little apart and not mirrored. The wind
    // works each joint on its own noise; the legs trail the swing (thrown back when the body swings forward), the
    // inside knee comes up in a turn and both feet drift to the outside; a dive streams them back and together; the
    // flare brings the feet forward and together, knees bent to absorb.
    const fe = smoothN(p.flare);
    const dv = clampN(p.dive ?? 0, 1, 0);
    const life = (p.reducedMotion ? 0.5 : 1) * (1 - 0.8 * fe);
    const swingS = clampN(sw.vx / 1.5, 1);
    const turn = clampN(p.turn, 1);
    const leg = (side: 1 | -1, hipBase: number, kneeBase: number, s: number) => {
      const inside = Math.max(0, -side * turn);
      const outside = Math.max(0, side * turn);
      let hip = hipBase + (-0.15 - hipBase) * dv + gust(t, s, 0.5) * 0.08 * life + 0.3 * swingS - 0.2 * inside;
      let knee = kneeBase + (0.35 - kneeBase) * dv + gust(t, s + 6, 0.8) * 0.12 * life + (swingS > 0 ? -0.2 * swingS : -0.3 * swingS) + 0.35 * inside - 0.15 * outside;
      hip = clampN(hip + (-0.75 - hip) * fe, 0.15, -0.95);
      knee = clampN(knee + (0.55 - knee) * fe, 1.3, 0.15);
      return { hip, knee, spread: side * (0.1 + (0.03 - 0.1) * dv) + 0.12 * turn };
    };
    const L = leg(-1, -0.42, 0.62, seed + 7);
    const R = leg(1, -0.58, 0.85, seed + 13);
    let zL = L.spread * (1 - fe) - 0.03 * fe;
    let zR = R.spread * (1 - fe) + 0.03 * fe;
    // The feet never cross or touch.
    if (zR - zL < 0.06) {
      const push = (0.06 - (zR - zL)) / 2;
      zL -= push;
      zR += push;
    }
    toward(rig.legL, L.hip, 0, zL, 5, dt);
    toward(rig.legR, R.hip, 0, zR, 5, dt);
    toward(rig.shinL, L.knee, 0, 0, 6, dt);
    toward(rig.shinR, R.knee, 0, 0, 6, dt);
  }

  // Arms.
  if (!stretched) {
    // The pull: the right hand goes to the pilot chute's pouch at the bottom of the pack, then throws it out wide.
    const reachBack = k < 0.18;
    if (reachBack) vT.set(0.2, rig.legLen + 0.12, HARNESS_BACK - 0.12);
    else vT.set(0.75, rig.shoulderR.y + 0.25, -0.35);
    pole.set(0.8, -0.6, -0.4);
    reachToward(rig.armR, rig.foreR, rig.shoulderR, vT, rig.armLen, 1, 16, dt, pole);
    vT.set(-0.52, rig.shoulderL.y + 0.3, -0.12);
    pole.set(-0.7, -0.8, -0.45);
    reachToward(rig.armL, rig.foreL, rig.shoulderL, vT, rig.armLen, -1, 10, dt, pole);
    rig.weapon.visible = false;
    return;
  }
  const up = k < 0.9 ? 9 : 12;
  reachToward(rig.armL, rig.foreL, rig.shoulderL, toggleGrip(-1, rig.shoulderL.y, Math.min(1, p.brakeL + p.flare), vT), rig.armLen, -1, up, dt);
  rig.weapon.visible = p.shooting;
  if (p.shooting) {
    const h = HOLD.pistol;
    rig.weapon.position.set(h.x + 0.1, rig.chestY + h.y, 0);
    rig.weapon.rotation.set(0, 0, 0);
    rig.hand.position.set(0, 0, h.grip);
    rig.weapon.updateMatrix();
    tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
    reachToward(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1, 18, dt);
  } else {
    reachToward(rig.armR, rig.foreR, rig.shoulderR, toggleGrip(1, rig.shoulderR.y, Math.min(1, p.brakeR + p.flare), vT), rig.armLen, 1, up, dt);
  }
};

/** Upright again (on the ground, or a pose that is not an air pose): the air pivot and springs let go. */
export const leaveAir = (rig: Rig) => {
  rig.airPivot = 0;
  rig.chuteSwing.vx = 0;
  rig.chuteSwing.vz = 0;
};

/**
 * Knocked out: the body folds and falls back over 0.6 s, then lies still, arms flung out,
 * one knee up. `t` is seconds since the knock-out; `seed` varies which way it twists.
 */
export const poseDeath = (rig: Rig, t: number, seed: number) => {
  const k = Math.min(1, t / 0.6);
  const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
  const bounce = k >= 1 ? 0 : Math.sin(k * Math.PI) * 0.05;
  const twist = (seed % 2 ? 1 : -1) * 0.35;
  rig.body.rotation.set(-1.52 * e, twist * e, 0);
  rig.body.position.set(0, 0.16 * e + bounce, 0);
  rig.weapon.visible = false;
  rig.head.rotation.y = twist * 0.8 * e;
  rig.armL.quaternion.setFromEuler(tmpE.set(-0.4 * e, 0, -1.3 * e));
  rig.armR.quaternion.setFromEuler(tmpE.set(-0.9 * e, 0, 1.1 * e));
  rig.foreL.quaternion.setFromEuler(tmpE.set(-0.5 * e, 0, 0));
  rig.foreR.quaternion.setFromEuler(tmpE.set(-0.2 * e, 0, 0));
  rig.legL.rotation.set(-0.6 * e, 0, -0.1 * e);
  rig.legR.rotation.set(0.05 * e, 0, 0.12 * e);
  rig.shinL.rotation.set(1.1 * e, 0, 0);
  rig.shinR.rotation.set(0.1 * e, 0, 0);
};

/**
 * Swimming. Moving, it is a front crawl: the body lies face down along the water with the back
 * just breaking the surface, the arms turn over one after the other (reach far ahead, pull down
 * and back under the body to the hip, then swing forward again through the air), the legs flutter
 * from the hips and the head turns to one side to breathe every other stroke. Still, you tread
 * water: upright with only the head and shoulders out, the hands sculling flat at the sides and
 * the legs cycling slowly. `speed` (m/s) blends the two. The water surface (drawn opaque) hides
 * whatever is under it, so the body only has to sit at the right depth.
 */
export const poseSwim = (rig: Rig, p: { dt: number; time: number; speed: number; seed: number }) => {
  const { dt, time } = p;
  const s = Math.min(1, p.speed / 1.6);
  rig.weapon.visible = false;
  // One stroke cycle (both arms) takes ~1.3 s at full swimming speed.
  rig.phase += dt * (2.2 + 2.6 * s);
  const a = rig.phase;
  // Lying flat at speed, upright when treading water.
  rig.body.rotation.x = damp(rig.body.rotation.x, 0.25 + 1.22 * s, 5, dt);
  rig.body.rotation.y = 0;
  // Roll from side to side with the strokes (the shoulders lead each pull).
  rig.body.rotation.z = damp(rig.body.rotation.z, Math.sin(a) * 0.32 * s, 10, dt);
  // Depth: treading, the water is at the collarbones; swimming, the back just breaks the surface
  // and the body is shifted back so the chest sits where the player is.
  const tread = 0.12 - (rig.chestY + 0.05);
  const swim = -0.18;
  rig.body.position.set(0, tread + (swim - tread) * s + Math.sin(a * 2) * 0.03, -rig.chestY * 0.75 * s);
  // Head: tucked, turned to breathe on every other stroke; looking ahead when treading.
  const breathe = Math.max(0, Math.sin(a)) ** 3;
  rig.head.rotation.y = damp(rig.head.rotation.y, breathe * 0.9 * s, 8, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, -0.6 * s, 8, dt);
  // Arms. In the body frame an arm angle of PI points past the head, 3PI/2 down under the belly,
  // 2PI back at the hip and PI/2 up out of the water behind: one crawl stroke is a full turn.
  const arm = (upper: THREE.Group, fore: THREE.Group, phase: number, side: 1 | -1) => {
    const crawl = Math.PI + phase;
    const recovering = Math.sin(crawl) > 0; // in the air: elbow high, forearm hanging
    const bend = recovering ? 1.1 * Math.sin(crawl) : 0.35;
    const scull = Math.sin(time * 5 + (side > 0 ? 0 : Math.PI)) * 0.35;
    // Treading: arms out to the sides just under the surface, hands sweeping in and out.
    const tx = -0.35;
    const tz = side * (1.25 + scull);
    upper.quaternion.setFromEuler(tmpE.set(tx + (crawl - tx) * s, 0, tz * (1 - s) + side * 0.18 * s));
    fore.quaternion.setFromEuler(tmpE.set(-(bend * s + 0.5 * (1 - s)), 0, 0));
  };
  arm(rig.armR, rig.foreR, a, 1);
  arm(rig.armL, rig.foreL, a + Math.PI, -1);
  // Legs: a quick flutter kick from the hips, or slow cycling when treading water.
  const kick = Math.sin(time * (6 + 4 * s) + p.seed);
  rig.legL.rotation.set(kick * (0.28 * s + 0.45 * (1 - s)), 0, -0.06);
  rig.legR.rotation.set(-kick * (0.28 * s + 0.45 * (1 - s)), 0, 0.06);
  rig.shinL.rotation.set(0.25 + Math.max(0, kick) * 0.5, 0, 0);
  rig.shinR.rotation.set(0.25 + Math.max(0, -kick) * 0.5, 0, 0);
};

/** A fighter's skin and sleeve colours (the first-person arms wear them). */
/** The skin and sleeve colours (first-person arms): the sleeve follows the outfit's top. */
export const fighterLook = (id: CharacterId, outfit = 'standard') => {
  const top = outfitParts(outfit, id).top;
  return { skin: SPECS[id].skin, top: typeof top === 'number' ? top : SPECS[id].top };
};
