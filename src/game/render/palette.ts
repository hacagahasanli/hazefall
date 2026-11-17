import * as THREE from 'three';

/** Merge Conflict palette: night office, git-diff accents (HEAD green, incoming red, conflict yellow). */
export const PALETTE = {
  ink: 0x1b1f2e,
  inkSoft: 0x2b3045,
  cream: 0xd7dce6,
  paper: 0xeef1f6,
  green: 0x2ec27e,
  orange: 0xf2542d,
  red: 0xe23d5c,
  blue: 0x3e7bfa,
  gold: 0xffc93c,
  lilac: 0x9aa3b8,
  stone: 0x7a8296,
  skinA: 0xe9b48f,
  skinB: 0xc68a63,
  skinC: 0x8d5a3b,
  white: 0xfffaf0,
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Flat-shaded low-poly material, cached by colour and options. */
export const mat = (color: number, opts: { emissive?: number; opacity?: number } = {}) => {
  const key = `${color}-${opts.emissive ?? 0}-${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      emissive: opts.emissive ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    cache.set(key, m);
  }
  return m;
};

export const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, shadow = true) => {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
};
