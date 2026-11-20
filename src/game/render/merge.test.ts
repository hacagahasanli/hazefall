import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { collectParts, mergeParts, mergeRigid, mergeStatic, skinRig } from './merge';

const box = (x: number, m: THREE.Material) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
  o.position.x = x;
  return o;
};
const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => c instanceof THREE.Mesh && out.push(c));
  return out;
};
const worldBox = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

describe('static batching', () => {
  it('merges meshes per material and keeps the shape where it was', () => {
    const red = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const same = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x0000ff, map: new THREE.Texture() });
    const g = new THREE.Group();
    g.add(box(0, red), box(3, same), box(6, blue), box(9, blue));
    const merged = mergeStatic(g);
    // The two reds are the same material in all but name: one batch; the textured blues another.
    expect(meshes(merged)).toHaveLength(2);
    expect(worldBox(merged).equals(worldBox(g))).toBe(true);
  });

  it('bakes plain colours into the vertices, so different colours share one batch', () => {
    const g = new THREE.Group();
    g.add(box(0, new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.2 })), box(3, new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 1 })));
    const merged = mergeStatic(g, { bake: true });
    const [m] = meshes(merged);
    expect(meshes(merged)).toHaveLength(1);
    const col = m.geometry.getAttribute('color');
    const rm = m.geometry.getAttribute('aRM');
    // The first box is red with roughness 0.2, the second green and metal.
    expect(col.getX(0)).toBeCloseTo(1);
    expect(col.getY(0)).toBeCloseTo(0);
    expect(rm.getX(0)).toBeCloseTo(0.2);
    const last = col.count - 1;
    expect(col.getY(last)).toBeCloseTo(1);
    expect(rm.getY(last)).toBeCloseTo(1);
  });

  it('hides and shows one tag of a batch without touching the others', () => {
    const mat = new THREE.MeshStandardMaterial();
    const a = new THREE.Group().add(box(0, mat));
    const b = new THREE.Group().add(box(5, mat));
    const [batch] = mergeParts([...collectParts(a, 0), ...collectParts(b, 1)]);
    const idx = batch.mesh.geometry.index!;
    const before = Array.from(idx.array);
    batch.setHidden(1, true);
    const half = before.length / 2;
    expect(Array.from(idx.array).slice(0, half)).toEqual(before.slice(0, half));
    expect(Array.from(idx.array).slice(half).every((v) => v === 0)).toBe(true);
    batch.setHidden(1, false);
    expect(Array.from(idx.array)).toEqual(before);
  });

  it('flattens a rigid model into one mesh where it stood', () => {
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.set(0.3, 0.8, 0);
    inner.scale.set(1.7, 0.6, 1.2);
    inner.add(box(1, new THREE.MeshStandardMaterial({ color: 0x223344 })), box(-1, new THREE.MeshStandardMaterial({ color: 0x884422 })));
    root.add(inner);
    const before = worldBox(root);
    mergeRigid(root);
    expect(meshes(root)).toHaveLength(1);
    const after = worldBox(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-4);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-4);
  });
});

describe('skinned fighters', () => {
  it('turn rigid parts on animated groups into one skinned mesh that still follows the groups', () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.position.set(0.5, 1.4, 0);
    const hand = box(0, new THREE.MeshStandardMaterial({ color: 0xffcc99 }));
    hand.position.y = -0.6;
    arm.add(hand);
    root.add(box(0, new THREE.MeshStandardMaterial({ color: 0x3355ff })), arm);
    skinRig(root, new Set());
    const skinned = meshes(root).filter((m) => m instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh[];
    expect(skinned).toHaveLength(1);
    expect(meshes(root)).toHaveLength(1);
    // Swing the arm and move the fighter: the hand's vertices go with them.
    arm.rotation.z = Math.PI / 2;
    root.position.set(10, 0, 5);
    root.updateMatrixWorld(true);
    skinned[0].skeleton.update();
    const sm = skinned[0];
    const v = new THREE.Vector3();
    const handVertex = sm.geometry.getAttribute('skinIndex').count - 1;
    sm.getVertexPosition(handVertex, v);
    v.applyMatrix4(sm.matrixWorld);
    // Expected: the same corner of the hand box, carried by the turned arm and the moved root.
    const expected = new THREE.Vector3().fromBufferAttribute(sm.geometry.getAttribute('position') as THREE.BufferAttribute, handVertex);
    const bindArm = new THREE.Matrix4().makeTranslation(0.5, 1.4, 0);
    expected.applyMatrix4(bindArm.clone().invert()).applyMatrix4(arm.matrixWorld);
    expect(v.distanceTo(expected)).toBeLessThan(1e-4);
  });
});
