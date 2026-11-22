import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FIGHTER_ORDER, FINISHES, OUTFITS } from '../cosmetics';

import { buildRig } from './characters';
import { buildGun } from './guns';
import { createDropSmoke, EVERY, PER_JUMPER, PUFF, smokeColor } from './smoke';

import type { GunKind } from './guns';

/** Draw calls of a model: the visible meshes under it, each drawn once. */
const draws = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) n++;
  });
  return n;
};
const GUNS: GunKind[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher', 'bomb'];

describe('draw calls of an outfit', () => {
  it('Standard and the colour-only sets add nothing; Terminal and Legend add at most one per fighter', () => {
    for (const id of FIGHTER_ORDER) {
      const base = draws(buildRig(id, 'standard').root);
      for (const o of OUTFITS) {
        const extra = draws(buildRig(id, o.key).root) - base;
        expect(extra, `${o.key} ${id}`).toBeLessThanOrEqual(o.key === 'terminal' || o.key === 'legend' ? 1 : 0);
      }
    }
  });

  it('20 fighters in any one set cost no more than 20 Standard fighters plus 20 (Terminal, Legend) or plus 0', () => {
    const total = (key: string) => Array.from({ length: 20 }, (_, i) => draws(buildRig(FIGHTER_ORDER[i % 4], key).root)).reduce((a, b) => a + b, 0);
    const base = total('standard');
    for (const o of OUTFITS) expect(total(o.key)).toBeLessThanOrEqual(base + (o.key === 'terminal' || o.key === 'legend' ? 20 : 0));
  });

  it('the silhouette never changes: every set has the same parts in the same places', () => {
    const boxOf = (key: string, id: (typeof FIGHTER_ORDER)[number]) => {
      const rig = buildRig(id, key);
      rig.root.updateMatrixWorld(true);
      const b = new THREE.Box3();
      rig.root.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) {
          o.geometry.computeBoundingBox();
          b.union(o.geometry.boundingBox!);
        }
      });
      return b.min.toArray().concat(b.max.toArray()).map((n) => Math.round(n * 1000) / 1000);
    };
    for (const id of FIGHTER_ORDER) for (const o of OUTFITS) expect(boxOf(o.key, id)).toEqual(boxOf('standard', id));
  });
});

describe('gun finishes', () => {
  it('a finish adds no draw calls to any gun and ground loot (the default) is Factory', () => {
    for (const kind of GUNS) {
      const base = draws(buildGun(kind).root);
      for (const f of FINISHES) expect(draws(buildGun(kind, f.key).root), `${f.key} ${kind}`).toBe(base);
      const factoryMats = new Set<THREE.Material>();
      buildGun(kind).root.traverse((o) => o instanceof THREE.Mesh && factoryMats.add(o.material as THREE.Material));
      const explicit = new Set<THREE.Material>();
      buildGun(kind, 'factory').root.traverse((o) => o instanceof THREE.Mesh && explicit.add(o.material as THREE.Material));
      expect([...factoryMats].every((m) => explicit.has(m))).toBe(true);
    }
  });

  it('finishes share one cached material set and change the colours the spec lists', () => {
    // Guns are baked: each part's colour lives in the vertices of the merged mesh.
    const matOf = (finish: string, kind: GunKind, color: number) => {
      const want = new THREE.Color(color);
      let found = false;
      buildGun(kind, finish).root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const col = o.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        const m = o.material as THREE.MeshStandardMaterial;
        if (col) {
          for (let i = 0; i < col.count && !found; i++) if (Math.abs(col.getX(i) - want.r) < 1e-4 && Math.abs(col.getY(i) - want.g) < 1e-4 && Math.abs(col.getZ(i) - want.b) < 1e-4) found = true;
        } else if (m.color.getHex() === color) found = true;
      });
      return found;
    };
    expect(matOf('gold', 'rifle', 0xffc23d)).toBe(true);
    expect(matOf('cherry', 'rifle', 0xc8202f)).toBe(true);
    expect(matOf('factory', 'rifle', 0xc8202f)).toBe(false);
    const mats = (finish: string) => buildGun('rifle', finish).root.children.map((c) => (c as THREE.Mesh).material);
    // Baked into vertices: every finish draws with the same shared material, so guns in different finishes still batch.
    expect(mats('arctic')[0]).toBe(mats('factory')[0]);
    // The launcher's warning band takes the trim colour of the finish.
    expect(matOf('terminal', 'launcher', 0x39ff88)).toBe(true);
  });
});

describe('Drop Smoke', () => {
  const stubDocument = () =>
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop: () => undefined }), fillRect: () => undefined, set fillStyle(_v: unknown) {} }) }) });
  beforeAll(stubDocument);
  afterEach(() => undefined);

  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 50, 20);
  const feet = new THREE.Vector3(10, 40, 10);

  it('is one draw call in total however many jumpers leave a trail, and none while nobody does', () => {
    const scene = new THREE.Scene();
    const smoke = createDropSmoke(scene, 'high');
    smoke.update(0.016, cam);
    expect(draws(scene)).toBe(0 + (smoke.object.visible ? 1 : 0));
    for (let j = 0; j < 4; j++) for (let k = 0; k < 40; k++) smoke.emit(j, feet, 0xff6a3d, true, EVERY.fall, cam);
    smoke.update(0.016, cam);
    const visibleDraws = (() => {
      let n = 0;
      scene.traverse((o) => o instanceof THREE.Mesh && o.visible && n++);
      return n;
    })();
    expect(visibleDraws).toBe(1);
    expect(smoke.count()).toBeGreaterThan(0);
  });

  it('puffs every 0.05 s in free fall and 0.08 s under the canopy, at most 40 per jumper (20 on low)', () => {
    const scene = new THREE.Scene();
    const smoke = createDropSmoke(scene, 'high');
    for (let i = 0; i < 20; i++) smoke.emit(0, feet, 0xffffff, true, 0.05, cam);
    expect(smoke.count()).toBe(20);
    const slow = createDropSmoke(new THREE.Scene(), 'high');
    for (let i = 0; i < 10; i++) slow.emit(0, feet, 0xffffff, false, 0.04, cam); // 0.4 s at 0.08 s
    expect(slow.count()).toBe(5);
    const many = createDropSmoke(new THREE.Scene(), 'high');
    for (let i = 0; i < 200; i++) many.emit(0, feet, 0xffffff, true, 0.05, cam);
    expect(many.count()).toBe(PER_JUMPER.high);
    const low = createDropSmoke(new THREE.Scene(), 'low');
    for (let i = 0; i < 200; i++) low.emit(0, feet, 0xffffff, true, 0.05, cam);
    expect(low.count()).toBe(PER_JUMPER.low);
  });

  it('after touchdown nothing is emitted and the puffs in the air fade over 2.5 s', () => {
    const scene = new THREE.Scene();
    const smoke = createDropSmoke(scene, 'high');
    for (let i = 0; i < 10; i++) smoke.emit(0, feet, 0xffffff, true, 0.05, cam);
    expect(smoke.count()).toBe(10);
    // The caller stops emitting at touchdown: only update runs.
    for (let t = 0; t < PUFF.life - 0.1; t += 0.1) smoke.update(0.1, cam);
    expect(smoke.count()).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) smoke.update(0.1, cam);
    expect(smoke.count()).toBe(0);
    expect(smoke.object.visible).toBe(false);
  });

  it('the colour is the canopy colour (the fighter colour for Classic) and Rainbow turns a full hue circle in 3 s', () => {
    expect(smokeColor('canopy', 'classic', 0xff6a3d, 0)).toBe(0xff6a3d);
    expect(smokeColor('canopy', 'mint', 0xff6a3d, 0)).toBe(0x3ddcb0);
    expect(smokeColor('rainbow', 'mint', 0xff6a3d, 0)).not.toBe(smokeColor('rainbow', 'mint', 0xff6a3d, 1.5));
    expect(smokeColor('rainbow', 'mint', 0xff6a3d, 0)).toBe(smokeColor('rainbow', 'mint', 0xff6a3d, 3));
  });
});
