import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHUNK, chunkedInstances } from './chunks';

import type { ChunkView } from './chunks';

/** A grid of instances, one every 4 m over 0..160 m. */
const grid = () => {
  const items = [];
  for (let x = 2; x < 160; x += 4) for (let z = 2; z < 160; z += 4) items.push({ x, z, matrix: new THREE.Matrix4().makeTranslation(x, 0, z) });
  return items;
};

/** A camera at (x, h, z) looking at (tx, 0, tz), and the view the chunks get from it. */
const view = (x: number, h: number, z: number, tx: number, tz: number, extra: Partial<ChunkView> = {}): ChunkView => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 600);
  cam.position.set(x, h, z);
  cam.lookAt(tx, 0, tz);
  cam.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return { frustum, x, y: h, z, shadow: null, reach: 1, far: Infinity, lodNear: Infinity, frame: 0, ...extra };
};

/** The instance positions a mesh draws now. */
const drawn = (im: THREE.InstancedMesh) => {
  const m = new THREE.Matrix4();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m);
    out.push(new THREE.Vector3().setFromMatrixPosition(m));
  }
  return out;
};

describe('chunked instancing', () => {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();

  it('draws everything until the first cull, then only the chunks in view', () => {
    const items = grid();
    const k = chunkedInstances(geo, mat, items, { height: 3 });
    const [im] = k.meshes;
    expect(im.count).toBe(items.length);
    // The high camera over (80, 80): about a sixth of the grid is near enough to be in view.
    k.update(view(80, 36, 102, 80, 81));
    expect(im.count).toBeGreaterThan(0);
    expect(im.count).toBeLessThan(items.length / 2);
    // Every instance it should see (inside the frustum) is drawn.
    const v = view(80, 36, 102, 80, 81);
    const want = items.filter((it) => v.frustum.containsPoint(new THREE.Vector3(it.x, 0.5, it.z))).length;
    const got = drawn(im).filter((p) => v.frustum.containsPoint(new THREE.Vector3(p.x, 0.5, p.z))).length;
    expect(got).toBe(want);
  });

  it('keeps one draw call per kind and hides the mesh when nothing is in view', () => {
    const k = chunkedInstances(geo, mat, grid(), { height: 3 });
    expect(k.meshes).toHaveLength(1);
    // Looking away from the map, up into the sky.
    k.update(view(80, 2, 300, 80, 900));
    expect(k.meshes[0].visible).toBe(false);
  });

  it('puts the chunks inside the shadow box first, and the shadow pass draws only those', () => {
    const k = chunkedInstances(geo, mat, grid(), { height: 3 });
    const [im] = k.meshes;
    k.update(view(80, 2, 160, 80, 0, { shadow: { x: 80, z: 150, half: 12 } }));
    const shadowCount = im.userData.shadowCount as number;
    expect(shadowCount).toBeGreaterThan(0);
    expect(shadowCount).toBeLessThan(im.count);
    const pos = drawn(im);
    // The first `shadowCount` instances are in chunks that touch the box.
    for (const p of pos.slice(0, shadowCount)) expect(Math.abs(p.z - 150)).toBeLessThan(12 + CHUNK + 4);
    im.onBeforeShadow(null as never, null as never, null as never, null as never, null as never, null as never, null as never);
    expect(im.count).toBe(shadowCount);
    im.onAfterShadow(null as never, null as never, null as never, null as never, null as never, null as never, null as never);
    expect(im.count).toBe(pos.length);
  });

  it('drops a kind beyond its reach and swaps to the far geometry past lodNear', () => {
    const far = new THREE.BoxGeometry(1, 1, 1);
    const grass = chunkedInstances(geo, mat, grid(), { height: 1, reach: 30 });
    const trees = chunkedInstances(geo, mat, grid(), { height: 10, farGeo: far });
    // At eye level looking along the grid.
    const v = view(80, 1.6, 158, 80, 0, { lodNear: 40 });
    grass.update(v);
    trees.update(v);
    for (const p of drawn(grass.meshes[0])) expect(Math.hypot(p.x - 80, p.z - 158)).toBeLessThan(30 + CHUNK * 1.5);
    const [near, farMesh] = trees.meshes;
    expect(near.count).toBeGreaterThan(0);
    expect(farMesh.count).toBeGreaterThan(0);
    expect(near.count + farMesh.count).toBeLessThanOrEqual(grid().length);
    for (const p of drawn(near)) expect(Math.hypot(p.x - 80, p.z - 158)).toBeLessThan(40 + CHUNK * 1.5);
  });
});
