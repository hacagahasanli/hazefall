import * as THREE from 'three';

/**
 * Guns built in code with realistic proportions and materials: gunmetal, black polymer,
 * walnut and olive furniture, a scoped bolt-action, a pump shotgun with a tube magazine.
 * Original designs, not copies of real-world models. They point down +z with the grip at the
 * origin, so they sit in the rig's hand anchor as-is. Sizes are about 1.3x life so they read
 * from the top-down camera. `length` is the muzzle distance.
 */

export type GunKind = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'launcher' | 'bomb';

export interface GunView {
  kind: GunKind;
  root: THREE.Group;
  length: number;
}

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.55, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d1f23, metalness: 0.2, roughness: 0.7 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.85 }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.6 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x4f5638, roughness: 0.8 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x9a8662, roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x5a8fb0, metalness: 0.3, roughness: 0.1, emissive: 0x0d2230 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08d3c, metalness: 0.6, roughness: 0.35 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa02a22, roughness: 0.6 }),
  fuse: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
};

const S = 1.3;
const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x * S, y * S, z * S);
  o.rotation.set(rx, ry, rz);
  o.scale.setScalar(S);
  o.castShadow = true;
  return o;
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** A cylinder along z. */
const tube = (r: number, len: number, r2 = r, seg = 10) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2);

const pistol = (g: THREE.Group) => {
  g.add(part(box(0.034, 0.042, 0.2), M.steel, 0, 0.055, 0.075)); // slide
  g.add(part(box(0.03, 0.006, 0.12), M.dark, 0, 0.078, 0.06)); // top
  g.add(part(box(0.031, 0.028, 0.16), M.polymer, 0, 0.02, 0.07)); // frame
  g.add(part(box(0.03, 0.105, 0.048), M.polymer, 0, -0.03, -0.005, -0.22)); // grip
  g.add(part(box(0.006, 0.03, 0.05), M.polymer, 0, -0.005, 0.045)); // trigger guard
  g.add(part(tube(0.007, 0.01), M.dark, 0, 0.055, 0.177)); // muzzle
  g.add(part(box(0.008, 0.01, 0.01), M.dark, 0, 0.081, 0.165)); // front sight
  return 0.24;
};

const smg = (g: THREE.Group) => {
  g.add(part(box(0.045, 0.06, 0.3), M.steel, 0, 0.045, 0.1)); // receiver
  g.add(part(tube(0.022, 0.16), M.polymer, 0, 0.045, 0.32)); // shroud
  g.add(part(tube(0.01, 0.06), M.dark, 0, 0.045, 0.42)); // barrel tip
  g.add(part(box(0.028, 0.15, 0.035), M.dark, 0, -0.06, 0.16, 0.25)); // magazine
  g.add(part(box(0.03, 0.09, 0.04), M.polymer, 0, -0.03, 0.0, -0.25)); // grip
  g.add(part(box(0.006, 0.006, 0.2), M.steel, 0.018, 0.045, -0.14)); // stock rods
  g.add(part(box(0.006, 0.006, 0.2), M.steel, -0.018, 0.045, -0.14));
  g.add(part(box(0.045, 0.07, 0.015), M.polymer, 0, 0.035, -0.24)); // butt plate
  g.add(part(box(0.012, 0.022, 0.02), M.dark, 0, 0.085, 0.2)); // sight
  return 0.45;
};

const shotgun = (g: THREE.Group) => {
  g.add(part(box(0.045, 0.06, 0.2), M.steel, 0, 0.04, 0.06)); // receiver
  g.add(part(tube(0.012, 0.5), M.steel, 0, 0.06, 0.41)); // barrel
  g.add(part(tube(0.012, 0.4), M.steel, 0, 0.032, 0.36)); // tube magazine
  g.add(part(box(0.042, 0.04, 0.14), M.walnut, 0, 0.034, 0.34)); // pump
  g.add(part(box(0.034, 0.075, 0.24), M.walnut, 0, 0.0, -0.15, 0.12)); // stock
  g.add(part(box(0.036, 0.09, 0.02), M.dark, 0, -0.012, -0.27, 0.12)); // recoil pad
  g.add(part(box(0.006, 0.025, 0.045), M.dark, 0, 0.0, 0.03)); // trigger guard
  g.add(part(box(0.006, 0.006, 0.006), M.brass, 0, 0.074, 0.65)); // bead sight
  return 0.68;
};

const rifle = (g: THREE.Group) => {
  g.add(part(box(0.05, 0.075, 0.3), M.dark, 0, 0.045, 0.08)); // receiver
  g.add(part(box(0.052, 0.062, 0.24), M.tan, 0, 0.045, 0.33)); // handguard
  for (let i = 0; i < 5; i++) g.add(part(box(0.054, 0.012, 0.02), M.dark, 0, 0.045, 0.24 + i * 0.045)); // vents
  g.add(part(tube(0.009, 0.14), M.steel, 0, 0.05, 0.52)); // barrel
  g.add(part(tube(0.016, 0.05), M.dark, 0, 0.05, 0.6)); // muzzle brake
  g.add(part(box(0.03, 0.14, 0.045), M.dark, 0, -0.06, 0.15, 0.32)); // magazine, angled forward
  g.add(part(box(0.03, 0.06, 0.045), M.dark, 0, -0.13, 0.19, 0.55)); // its curve
  g.add(part(box(0.032, 0.09, 0.04), M.polymer, 0, -0.03, 0.0, -0.3)); // grip
  g.add(part(box(0.045, 0.085, 0.22), M.tan, 0, 0.03, -0.17, 0.06)); // stock
  g.add(part(box(0.02, 0.008, 0.28), M.dark, 0, 0.086, 0.2)); // top rail
  g.add(part(box(0.034, 0.04, 0.06), M.dark, 0, 0.11, 0.12)); // red-dot body
  g.add(part(box(0.024, 0.026, 0.004), M.glass, 0, 0.112, 0.152));
  return 0.64;
};

const sniper = (g: THREE.Group) => {
  g.add(part(box(0.06, 0.07, 0.62), M.olive, 0, 0.02, 0.08)); // stock and fore-end
  g.add(part(box(0.05, 0.05, 0.12), M.olive, 0, 0.065, -0.14)); // cheek rest
  g.add(part(box(0.062, 0.09, 0.03), M.dark, 0, 0.0, -0.24)); // butt pad
  g.add(part(box(0.04, 0.05, 0.16), M.steel, 0, 0.07, 0.07)); // action
  g.add(part(tube(0.011, 0.6), M.steel, 0, 0.07, 0.62)); // long barrel
  g.add(part(tube(0.02, 0.06), M.dark, 0, 0.07, 0.93)); // muzzle brake
  g.add(part(new THREE.SphereGeometry(0.014, 8, 6), M.dark, 0.04, 0.07, 0.02)); // bolt knob
  g.add(part(box(0.04, 0.006, 0.006), M.steel, 0.02, 0.07, 0.02));
  g.add(part(tube(0.02, 0.26), M.dark, 0, 0.13, 0.08)); // scope tube
  g.add(part(tube(0.03, 0.06, 0.02), M.dark, 0, 0.13, 0.23)); // objective bell
  g.add(part(tube(0.026, 0.05, 0.02), M.dark, 0, 0.13, -0.07)); // eyepiece
  g.add(part(new THREE.CircleGeometry(0.026, 12), M.glass, 0, 0.13, 0.261));
  g.add(part(box(0.012, 0.03, 0.02), M.steel, 0, 0.1, 0.02)); // scope rings
  g.add(part(box(0.012, 0.03, 0.02), M.steel, 0, 0.1, 0.14));
  g.add(part(box(0.008, 0.008, 0.2), M.steel, 0.015, -0.01, 0.38, 0.2)); // folded bipod
  g.add(part(box(0.008, 0.008, 0.2), M.steel, -0.015, -0.01, 0.38, 0.2));
  g.add(part(box(0.025, 0.06, 0.035), M.dark, 0, -0.03, 0.1)); // magazine
  return 0.96;
};

const launcher = (g: THREE.Group) => {
  g.add(part(tube(0.055, 0.85), M.olive, 0, 0.08, 0.2)); // tube
  g.add(part(tube(0.07, 0.08, 0.055), M.olive, 0, 0.08, 0.66)); // front bell
  g.add(part(tube(0.06, 0.05), M.dark, 0, 0.08, -0.24)); // rear ring
  g.add(part(new THREE.ConeGeometry(0.045, 0.12, 10).rotateX(Math.PI / 2), M.olive, 0, 0.08, 0.76)); // warhead
  g.add(part(box(0.03, 0.1, 0.04), M.polymer, 0, -0.02, 0.05, -0.2)); // grip
  g.add(part(box(0.03, 0.08, 0.04), M.polymer, 0, -0.01, 0.25)); // fore grip
  g.add(part(box(0.025, 0.05, 0.08), M.dark, -0.06, 0.12, 0.1)); // sight
  g.add(part(box(0.06, 0.004, 0.3), M.red, 0, 0.138, 0.2)); // warning band
  return 0.8;
};

const bomb = (g: THREE.Group) => {
  g.add(part(new THREE.SphereGeometry(0.1, 12, 10), M.dark, 0, 0, 0.1));
  g.add(part(tube(0.03, 0.04).rotateX(Math.PI / 2), M.steel, 0, 0.1, 0.1));
  g.add(part(new THREE.IcosahedronGeometry(0.02, 0), M.fuse, 0, 0.14, 0.1));
  return 0.15;
};

const BUILDERS: Record<GunKind, (g: THREE.Group) => number> = { pistol, smg, shotgun, rifle, sniper, launcher, bomb };

export const buildGun = (kind: GunKind): GunView => {
  const root = new THREE.Group();
  const length = BUILDERS[kind](root) * S;
  return { kind, root, length };
};
