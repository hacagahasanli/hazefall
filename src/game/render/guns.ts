import * as THREE from 'three';

import { mat, mesh, PALETTE } from './palette';

export type GunKind = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi' | 'bomb';

/**
 * Low-poly guns built from boxes and cylinders. They point down +z, grip at the
 * origin, so they sit in the rig's hand anchor as-is. `length` is the muzzle.
 */
export interface GunView {
  kind: GunKind;
  root: THREE.Group;
  length: number;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const barrel = (r: number, len: number) => {
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  g.rotateX(Math.PI / 2);
  return g;
};
const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

export const buildGun = (kind: GunKind): GunView => {
  const root = new THREE.Group();
  let length = 0.4;
  const body = mat(PALETTE.ink);
  const trim = mat(PALETTE.stone);

  switch (kind) {
    case 'pistol':
      root.add(put(mesh(box(0.07, 0.1, 0.32), body), 0, 0.05, 0.12));
      root.add(put(mesh(box(0.06, 0.14, 0.07), trim), 0, -0.05, 0.02));
      root.add(put(mesh(box(0.02, 0.02, 0.04), mat(PALETTE.gold), false), 0, 0.11, 0.24));
      length = 0.3;
      break;
    case 'smg':
      root.add(put(mesh(box(0.08, 0.12, 0.5), body), 0, 0.04, 0.15));
      root.add(put(mesh(box(0.05, 0.22, 0.07), mat(PALETTE.blue)), 0, -0.1, 0.18));
      root.add(put(mesh(box(0.06, 0.12, 0.07), trim), 0, -0.05, -0.02));
      root.add(put(mesh(barrel(0.025, 0.16), trim), 0, 0.06, 0.46));
      root.add(put(mesh(box(0.05, 0.06, 0.2), trim), 0, 0.02, -0.15));
      length = 0.55;
      break;
    case 'shotgun':
      root.add(put(mesh(box(0.08, 0.1, 0.42), mat(0x8a6a4a)), 0, 0, -0.08));
      for (const x of [-0.03, 0.03]) root.add(put(mesh(barrel(0.03, 0.7), body), x, 0.05, 0.42));
      root.add(put(mesh(box(0.1, 0.08, 0.2), mat(PALETTE.red)), 0, 0.0, 0.3));
      length = 0.78;
      break;
    case 'railgun':
      root.add(put(mesh(box(0.1, 0.14, 0.7), body), 0, 0.04, 0.2));
      root.add(put(mesh(barrel(0.03, 0.6), trim), 0, 0.05, 0.75));
      for (let i = 0; i < 4; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 10), new THREE.MeshBasicMaterial({ color: 0x6aa8ff }));
        root.add(put(coil, 0, 0.05, 0.5 + i * 0.12));
      }
      root.add(put(mesh(box(0.06, 0.14, 0.07), trim), 0, -0.08, 0.0));
      length = 1.05;
      break;
    case 'launcher':
      root.add(put(mesh(barrel(0.1, 0.9), mat(PALETTE.green)), 0, 0.08, 0.25));
      root.add(put(mesh(barrel(0.11, 0.08), body), 0, 0.08, 0.7));
      root.add(put(mesh(box(0.06, 0.16, 0.08), trim), 0, -0.06, 0.05));
      root.add(put(mesh(box(0.04, 0.08, 0.1), mat(PALETTE.gold), false), 0, 0.22, 0.15));
      length = 0.74;
      break;
    case 'uzi':
      root.add(put(mesh(box(0.07, 0.11, 0.3), body), 0, 0.04, 0.1));
      root.add(put(mesh(box(0.045, 0.3, 0.06), mat(PALETTE.gold)), 0, -0.13, 0.08)); // long magazine in the grip
      root.add(put(mesh(barrel(0.02, 0.1), trim), 0, 0.06, 0.29));
      length = 0.34;
      break;
    case 'bomb': {
      root.add(put(mesh(new THREE.IcosahedronGeometry(0.15, 1), mat(0x2b3045)), 0, 0, 0.12));
      root.add(put(mesh(barrel(0.04, 0.06), mat(PALETTE.stone)), 0, 0.15, 0.12));
      const fuse = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      root.add(put(fuse, 0, 0.2, 0.12));
      length = 0.2;
      break;
    }
  }
  return { kind, root, length };
};
