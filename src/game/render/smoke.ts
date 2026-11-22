import * as THREE from 'three';

import { canopyById } from '../canopies';

import type { Tier } from './quality';

/**
 * Drop Smoke (the Level 5 reward): a coloured trail behind a jumper, in free fall and under the canopy only. One instanced
 * mesh draws every puff of every jumper, so the whole feature is one draw call (none while nobody leaves a trail). It
 * never marks anyone on the ground: emitting stops at touchdown and the puffs already in the air fade over their life.
 * Looks only: nothing here reads or writes the sim.
 */

export const PUFF = { life: 2.5, from: 0.6, to: 2.2, opacity: 0.55, rise: 0.3, away: 0.3 };
/** Seconds between puffs in free fall and under the canopy. */
export const EVERY = { fall: 0.05, canopy: 0.08 };
/** Live puffs per jumper, by tier (low tier: only your own smoke). */
export const PER_JUMPER = { high: 40, medium: 40, low: 20 } as const;
/** You plus the three nearest bots that have it. */
export const MAX_JUMPERS = 4;

/** The trail's colour for a smoke setting: the canopy's `a` (the fighter's own colour for Classic), or a full turn of hue every 3 s. */
export const smokeColor = (smoke: string, canopy: string, fighterColor: number, time: number): number => {
  const c = canopyById(canopy);
  if (smoke === 'rainbow' || c.pattern === 'rainbow') return new THREE.Color().setHSL((time / 3) % 1, 0.85, 0.6).getHex();
  return canopy === 'classic' ? fighterColor : c.a;
};

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** A soft white disc, tinted per puff. */
const discTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

interface Puff {
  jumper: number;
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: THREE.Color;
}

export const createDropSmoke = (scene: THREE.Scene, tier: Tier = 'high') => {
  const per = PER_JUMPER[tier];
  const cap = per * MAX_JUMPERS;
  const geo = new THREE.PlaneGeometry(1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', alpha);
  const mat = new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;').replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'drop-smoke';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'drop-smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  scene.add(mesh);

  const puffs: Puff[] = [];
  const acc = new Map<number, number>();
  const live = new Map<number, number>();
  const m4 = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();

  /**
   * Called every frame for a jumper that has smoke and is in the air: lays puffs at `at` (the feet) for the time that passed.
   * `fall` is true in free fall, false under the canopy. The caller keeps to MAX_JUMPERS.
   */
  const emit = (jumper: number, at: THREE.Vector3, color: number, fall: boolean, dt: number, camera: THREE.Camera) => {
    const every = fall ? EVERY.fall : EVERY.canopy;
    let a = (acc.get(jumper) ?? 0) + dt;
    let n = live.get(jumper) ?? 0;
    // Away from the camera on the ground plane, plus the rise.
    let ax = at.x - camera.position.x;
    let az = at.z - camera.position.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len;
    az /= len;
    while (a >= every && n < per) {
      a -= every;
      n++;
      puffs.push({ jumper, age: 0, x: at.x, y: at.y, z: at.z, vx: ax * PUFF.away, vy: PUFF.rise, vz: az * PUFF.away, color: new THREE.Color(color) });
    }
    acc.set(jumper, Math.min(a, every));
    live.set(jumper, n);
  };

  /** Ages every puff and draws the live ones facing the camera. */
  const update = (dt: number, camera: THREE.Camera) => {
    live.clear();
    let w = 0;
    for (let r = 0; r < puffs.length; r++) {
      const p = puffs[r];
      p.age += dt;
      if (p.age >= PUFF.life) continue;
      puffs[w++] = p;
      live.set(p.jumper, (live.get(p.jumper) ?? 0) + 1);
    }
    puffs.length = w;
    const n = Math.min(w, cap);
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.age / PUFF.life;
      const s = PUFF.from + (PUFF.to - PUFF.from) * easeOut(k);
      pos.set(p.x, p.y, p.z);
      m4.compose(pos, camera.quaternion, scale.set(s, s, s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, p.color);
      alpha.setX(i, PUFF.opacity * (1 - k));
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    alpha.needsUpdate = true;
  };

  return {
    emit,
    update,
    /** Live puffs (for tests and the perf overlay). */
    count: () => puffs.length,
    object: mesh,
    dispose: () => {
      scene.remove(mesh);
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
    },
  };
};

export type DropSmoke = ReturnType<typeof createDropSmoke>;
