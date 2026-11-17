import * as THREE from 'three';

import { PALETTE } from './palette';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  gravity: number;
  spin: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  grow: number;
}

const COLORS = {
  spark: 0xfff1a8,
  hot: PALETTE.orange,
  coffee: 0x5a3420,
  glass: 0xd8ecff,
  dust: 0xe8e2d6,
  guard: 0x7ea6e0,
  ko: PALETTE.gold,
  dirt: 0x6a4a30,
  leaf: PALETTE.green,
  foam: 0xf4f6fa,
} as const;

export type ParticleColor = keyof typeof COLORS;

/** Pooled particles and shockwave rings. No allocation per frame. */
export const createVfx = (scene: THREE.Scene) => {
  const geo = new THREE.TetrahedronGeometry(0.07, 0);
  const mats = Object.fromEntries(
    Object.entries(COLORS).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true })]),
  ) as Record<ParticleColor, THREE.MeshBasicMaterial>;

  const pool: Particle[] = [];
  for (let i = 0; i < 360; i++) {
    const m = new THREE.Mesh(geo, mats.spark);
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, gravity: 0, spin: 0 });
  }
  let next = 0;

  const rings: Ring[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.06, 4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
    );
    m.visible = false;
    scene.add(m);
    rings.push({ mesh: m, life: 0, max: 1, grow: 1 });
  }
  let nextRing = 0;

  const burst = (
    x: number,
    y: number,
    count: number,
    color: ParticleColor,
    opts: { speed?: number; up?: number; gravity?: number; life?: number; size?: number; dirX?: number } = {},
  ) => {
    const { speed = 6, up = 3, gravity = 18, life = 0.5, size = 1, dirX = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const p = pool[next++ % pool.length];
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.vx = Math.cos(a) * s + dirX * speed * 0.8;
      p.vy = Math.sin(a) * s + up;
      p.vz = (Math.random() - 0.5) * s;
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.gravity = gravity;
      p.spin = (Math.random() - 0.5) * 20;
      p.mesh.material = mats[color];
      p.mesh.position.set(x, y, (Math.random() - 0.5) * 0.4);
      p.mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      p.mesh.visible = true;
    }
  };

  const ring = (x: number, y: number, color: number, opts: { grow?: number; life?: number; facing?: number } = {}) => {
    const r = rings[nextRing++ % rings.length];
    r.life = r.max = opts.life ?? 0.35;
    r.grow = opts.grow ?? 8;
    r.mesh.position.set(x, y, 0.2);
    // A push ring stands up facing the push direction; others face the camera.
    r.mesh.rotation.set(0, opts.facing ? Math.PI / 2 : 0, 0);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.mesh.scale.setScalar(0.3);
    r.mesh.visible = true;
    r.mesh.userData.vx = (opts.facing ?? 0) * 9;
  };

  const update = (dt: number) => {
    for (const p of pool) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vy *= -0.3;
        p.vx *= 0.6;
      }
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt;
    }
    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.3 + k * r.grow * 0.25);
      r.mesh.position.x += (r.mesh.userData.vx as number) * dt;
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }
  };

  return { burst, ring, update };
};

export type Vfx = ReturnType<typeof createVfx>;
