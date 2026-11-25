import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildRig, poseTopDown } from './characters';
import { ankleOf, clampHip, solveLeg, spring } from './legIk';

import type { Rig, TopDownPose } from './characters';
import type { FighterId, WeaponKind } from '../sim/types';

const HALF = 0.45;
const FWD = new THREE.Vector3(0, 0, 1);

describe('two-bone leg IK', () => {
  it('puts the ankle exactly on any reachable target, knee forward and bent the right way', () => {
    const hip = new THREE.Vector3(0.12, 0.9, 0);
    const q = new THREE.Quaternion();
    const qs = new THREE.Quaternion();
    const out = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      const a = new THREE.Vector3((Math.random() - 0.5) * 0.4, -(0.4 + Math.random() * 0.4), (Math.random() - 0.5) * 0.4).add(hip);
      const knee = solveLeg(hip, a, FWD, FWD, HALF, q);
      qs.setFromAxisAngle(new THREE.Vector3(1, 0, 0), knee);
      ankleOf(hip, q, qs, HALF, out);
      expect(out.distanceTo(a)).toBeLessThan(1e-5);
      expect(knee).toBeGreaterThanOrEqual(-1e-6);
      expect(knee).toBeLessThan(Math.PI);
      // The knee points forward of the hip-ankle line.
      const kneePos = new THREE.Vector3(0, -HALF, 0).applyQuaternion(q).add(hip);
      const line = a.clone().sub(hip);
      const t = kneePos.clone().sub(hip).dot(line) / line.lengthSq();
      expect(kneePos.z - (hip.z + line.z * t)).toBeGreaterThan(-1e-6);
    }
  });

  it('straightens towards a target out of reach instead of overstretching, and clampHip brings the hip within reach', () => {
    const hip = new THREE.Vector3(0, 0.95, 0);
    const far = new THREE.Vector3(0, 0, 0);
    const q = new THREE.Quaternion();
    expect(solveLeg(hip, far, FWD, FWD, HALF, q)).toBeLessThan(0.15);
    clampHip(hip, far, HALF);
    expect(hip.distanceTo(far)).toBeLessThan(2 * HALF);
  });

  it('springs settle without overshoot for any frame time, and agree between frame rates', () => {
    const run = (fps: number) => {
      const s = { x: 0, v: 0 };
      let peak = 0;
      for (let i = 0; i < fps; i++) peak = Math.max(peak, spring(s, 1, 13, 1 / fps));
      return { x: s.x, peak };
    };
    const a = run(30);
    const b = run(240);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(b.x).toBeGreaterThan(0.999);
  });
});

// ---- the whole poser, on real rigs

const FIGHTERS = ['hotfix', 'legacy', 'standup', 'intern'] as FighterId[];
const base = (o: Partial<TopDownPose> = {}): TopDownPose => ({
  dt: 1 / 60, time: 0, vx: 0, vy: 0, yaw: 0, yawRate: 0, onGround: true, dashing: false, sinceShot: 9, gun: 'rifle', reload: null, lean: 0, vault: null, roll: null, ...o,
});
const run = (rig: Rig, seconds: number, fps: number, at: (t: number) => Partial<TopDownPose>, t0 = 0) => {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    const time = t0 + (i + 1) / fps;
    poseTopDown(rig, base({ dt: 1 / fps, time, ...at(time) }));
  }
  rig.root.updateMatrixWorld(true);
};
const ankles = (rig: Rig) => [rig.footL, rig.footR].map((f) => f.getWorldPosition(new THREE.Vector3()));
const endOf = (fore: THREE.Group, len: number) => fore.localToWorld(new THREE.Vector3(0, -len / 2, 0));

describe('leaning (Q/E)', () => {
  for (const id of FIGHTERS) {
    it(`${id}: leans from the hips, keeps both feet planted, never pushes a foot through the floor`, () => {
      const ref = buildRig(id);
      run(ref, 1.5, 60, () => ({ lean: 0 }));
      const feet0 = ankles(ref);
      for (const lean of [-1, 1]) {
        const rig = buildRig(id);
        run(rig, 1.5, 60, () => ({ lean }));
        const feet = ankles(rig);
        feet.forEach((f, i) => expect(f.distanceTo(feet0[i])).toBeLessThan(0.02));
        // The top really leans, and the belt tilts less than the spine.
        const roll = new THREE.Euler().setFromQuaternion(rig.upper.quaternion).z;
        expect(Math.sign(roll)).toBe(lean);
        expect(Math.abs(roll)).toBeGreaterThan(0.4);
        expect(Math.abs(rig.pelvis.rotation.z)).toBeLessThan(Math.abs(roll));
        // The hips moved towards the lean and are connected (thighs start at the pelvis, knees only bend forward).
        const hipX = rig.legL.position.x + rig.legR.position.x;
        expect(Math.sign(hipX)).toBe(-lean);
        for (const s of [rig.shinL, rig.shinR]) {
          expect(s.rotation.x).toBeGreaterThan(-1e-3);
          expect(s.rotation.x).toBeLessThan(2.6);
        }
        for (const f of feet) expect(f.y).toBeGreaterThan(-0.03);
        expect(Math.min(...feet.map((f) => f.y))).toBeLessThan(0.03);
      }
    });
  }

  it('keeps both hands on the gun while leaning, as well as standing (every gun, every fighter)', () => {
    const guns: WeaponKind[] = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'rockets'];
    const gap = (id: FighterId, gun: WeaponKind, lean: number) => {
      const rig = buildRig(id);
      run(rig, 1.2, 60, () => ({ lean, gun }));
      const h = gun === 'pistol' ? 0.46 : gun === 'rockets' ? 0.18 : 0.24;
      const grip = rig.weapon.localToWorld(new THREE.Vector3(0, -0.02, h));
      return endOf(rig.foreL, rig.armLen).distanceTo(grip);
    };
    for (const id of FIGHTERS) {
      for (const gun of guns) {
        const rest = gap(id, gun, 0);
        for (const lean of [-1, 1]) expect(gap(id, gun, lean), `${id} ${gun} ${lean}`).toBeLessThan(rest + 0.02);
      }
    }
  });

  it('does not depend on the frame rate', () => {
    const script = (t: number): Partial<TopDownPose> => ({ lean: t < 0.6 ? 0 : t < 1.4 ? 1 : t < 2.2 ? -1 : 0, vx: t > 2.6 ? 4 : 0, yaw: 0 });
    const a = buildRig('hotfix');
    const b = buildRig('hotfix');
    run(a, 3.5, 30, script);
    run(b, 3.5, 120, script);
    const pa = [...ankles(a), a.head.getWorldPosition(new THREE.Vector3())];
    const pb = [...ankles(b), b.head.getWorldPosition(new THREE.Vector3())];
    pa.forEach((p, i) => expect(p.distanceTo(pb[i])).toBeLessThan(0.08));
  });

  it('eases in and out: no joint jumps between frames when the lean flips from one side to the other', () => {
    const rig = buildRig('hotfix');
    run(rig, 1, 60, () => ({ lean: 1 }));
    let prev = rig.upper.quaternion.clone();
    let worst = 0;
    const feet = ankles(rig);
    let drift = 0;
    for (let i = 0; i < 90; i++) {
      poseTopDown(rig, base({ time: 1 + i / 60, lean: -1 }));
      rig.root.updateMatrixWorld(true);
      worst = Math.max(worst, prev.angleTo(rig.upper.quaternion));
      prev = rig.upper.quaternion.clone();
      ankles(rig).forEach((f, j) => (drift = Math.max(drift, f.distanceTo(feet[j]))));
    }
    expect(worst).toBeLessThan(0.1); // rad per frame at the fastest of a hard 1 rad flip (the sim already eases real input)
    expect(drift).toBeLessThan(0.02); // feet never slide during the swing
  });

  it('standing and breathing: feet do not move, the head does not bob off the aim', () => {
    const rig = buildRig('hotfix');
    run(rig, 1, 60, () => ({}));
    const f0 = ankles(rig);
    let drift = 0;
    for (let i = 0; i < 360; i++) {
      poseTopDown(rig, base({ time: 1 + i / 60 }));
      rig.root.updateMatrixWorld(true);
      ankles(rig).forEach((f, j) => (drift = Math.max(drift, f.distanceTo(f0[j]))));
    }
    expect(drift).toBeLessThan(0.005);
  });

  it('crouched, the feet lie flat instead of pointing the toes into the floor', () => {
    const rig = buildRig('hotfix');
    run(rig, 1.5, 60, () => ({ crouch: 1 }));
    const toe = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.footL.getWorldQuaternion(new THREE.Quaternion()));
    expect(Math.abs(toe.y)).toBeLessThan(0.05);
  });
});
