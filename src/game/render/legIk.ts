import * as THREE from 'three';

/**
 * Analytic two-bone leg IK for the procedural rig. A thigh pivots at the hip and a shin hinges at the knee about the
 * thigh's own x axis, both of equal length `half`. Given where the hip and the ankle are (body space) and which way the
 * knee points, it returns the thigh orientation and the knee flexion that put the ankle exactly there (or as close as a
 * fully straight leg gets). Positive flexion carries the foot backwards, like the rig's `shin.rotation.x`.
 */

const u = new THREE.Vector3();
const p = new THREE.Vector3();
const k = new THREE.Vector3();
const n = new THREE.Vector3();
const yA = new THREE.Vector3();
const zA = new THREE.Vector3();
const f = new THREE.Vector3();
const m = new THREE.Matrix4();
const qInv = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Longest the hip-to-ankle distance may get, as a fraction of a straight leg: a locked knee never pops. */
export const MAX_REACH = 0.998;

/** Where the ankle ends up for a thigh and shin orientation (forward kinematics, body space). */
export const ankleOf = (hip: THREE.Vector3, qThigh: THREE.Quaternion, qShin: THREE.Quaternion, half: number, out: THREE.Vector3) => {
  out.copy(DOWN).multiplyScalar(half).applyQuaternion(qThigh).add(hip);
  p.copy(DOWN).multiplyScalar(half).applyQuaternion(qInv.copy(qThigh).multiply(qShin));
  return out.add(p);
};

/** The knee (body space) for a thigh orientation. */
export const kneeOf = (hip: THREE.Vector3, qThigh: THREE.Quaternion, half: number, out: THREE.Vector3) =>
  out.copy(DOWN).multiplyScalar(half).applyQuaternion(qThigh).add(hip);

/** Pulls `hip` towards `ankle` until a leg of two `half` bones can span it. */
export const clampHip = (hip: THREE.Vector3, ankle: THREE.Vector3, half: number) => {
  const max = 2 * half * MAX_REACH;
  const d = hip.distanceTo(ankle);
  if (d > max) hip.lerpVectors(ankle, hip, max / d);
  return hip;
};

/**
 * `kneeDir` is any vector from the hip towards where the knee should bend (it is made perpendicular to the leg; a
 * degenerate one falls back to `fallback`). Writes the thigh orientation into `qThigh` and returns the knee flexion.
 */
export const solveLeg = (hip: THREE.Vector3, ankle: THREE.Vector3, kneeDir: THREE.Vector3, fallback: THREE.Vector3, half: number, qThigh: THREE.Quaternion) => {
  u.subVectors(ankle, hip);
  let d = u.length();
  if (d < 1e-5) {
    u.copy(DOWN);
    d = 1e-5;
  } else u.multiplyScalar(1 / d);
  d = Math.min(d, 2 * half * MAX_REACH);
  const cosA = d / (2 * half);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  p.copy(kneeDir).addScaledVector(u, -kneeDir.dot(u));
  if (p.lengthSq() < 1e-6 * half * half) p.copy(fallback).addScaledVector(u, -fallback.dot(u));
  if (p.lengthSq() < 1e-8) p.set(1, 0, 0).addScaledVector(u, -u.x);
  p.normalize();
  k.copy(u).multiplyScalar(cosA).addScaledVector(p, sinA); // unit hip -> knee
  n.crossVectors(p, u).normalize(); // the knee's hinge axis: the thigh's own +x
  yA.copy(k).negate();
  zA.crossVectors(n, yA);
  qThigh.setFromRotationMatrix(m.makeBasis(n, yA, zA));
  // The ankle, seen from the knee, in the thigh's frame: its tilt about x is the flexion.
  f.copy(u).multiplyScalar(d).addScaledVector(k, -half).applyQuaternion(qInv.copy(qThigh).invert());
  return Math.atan2(-f.z, -f.y);
};

/** Critically damped spring, exact for any `dt`: `s` = [value, velocity] eases to `target` with angular rate `w`. */
export const spring = (s: { x: number; v: number }, target: number, w: number, dt: number) => {
  if (dt <= 0) return s.x;
  const d = s.x - target;
  const e = Math.exp(-w * dt);
  const t = s.v + w * d;
  s.x = target + (d + t * dt) * e;
  s.v = (s.v - t * w * dt) * e;
  return s.x;
};
