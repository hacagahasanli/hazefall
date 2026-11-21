import * as THREE from 'three';

import { TILE } from '../sim/constants';
import { EAVE, LADDERS } from '../sim/roofs';

import { mat } from './palette';

/**
 * The roof ladders (see sim/roofs.ts LADDERS): two wooden rails and rungs against the outside of the wall, from the
 * ground to a little above the eave, where the sim lets you climb. Two instanced draw calls for all of them.
 */
export const buildLadders = () => {
  const g = new THREE.Group();
  g.name = 'ladders';
  if (!LADDERS.length) return g;
  const top = EAVE + 0.55;
  const rungStep = 0.32;
  const rungsPer = Math.floor((top - 0.25) / rungStep);
  const wood = mat(0x8a5a32);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, top, 0.09), wood, LADDERS.length * 2);
  const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.05, 0.06), mat(0xa8774a), LADDERS.length * rungsPer);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const at = new THREE.Vector3();
  LADDERS.forEach((l, i) => {
    // On the wall's outer face, a hand's width off it, rungs running along the wall.
    const cx = (l.tx + 0.5) * TILE + l.nx * (TILE / 2 + 0.1);
    const cz = (l.ty + 0.5) * TILE + l.ny * (TILE / 2 + 0.1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(l.nx, l.ny));
    const side = { x: l.ny, z: -l.nx };
    for (const s of [-1, 1]) rails.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m.compose(at.set(cx + side.x * 0.33 * s, top / 2, cz + side.z * 0.33 * s), q, one));
    for (let k = 0; k < rungsPer; k++) rungs.setMatrixAt(i * rungsPer + k, m.compose(at.set(cx, 0.3 + k * rungStep, cz), q, one));
  });
  for (const im of [rails, rungs]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  return g;
};
