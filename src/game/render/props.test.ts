import * as THREE from 'three';

import { tallLandmarks } from './props';

const part = (x: number, z: number) => {
  const g = new THREE.BoxGeometry(4, 10, 4).toNonIndexed();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  g.translate(0, 5, 0);
  return { g, x, z };
};

describe('tall landmark parts', () => {
  const make = () => {
    const t = tallLandmarks();
    for (const p of [part(0, 0), part(50, 0)]) t.add(p.g, p.x, p.z, 0);
    t.build();
    return t;
  };
  const cam = new THREE.Vector3(0, 8, 20);
  const player = new THREE.Vector3(0, 1.2, -20);

  it('ghosts only the part between the camera and the player, to 0.3 in 0.15 s', () => {
    const t = make();
    for (let i = 0; i < 10; i++) t.fade(cam, player, 0.0166, false);
    const [a, b] = t.state().level;
    expect(a).toBeCloseTo(0.3, 2);
    expect(b).toBe(1);
  });

  it('brings it back over 0.3 s, but only after 0.4 s without a hit', () => {
    const t = make();
    for (let i = 0; i < 12; i++) t.fade(cam, player, 0.0166, false);
    const clear = new THREE.Vector3(30, 8, 20);
    const there = new THREE.Vector3(30, 1.2, -20);
    for (let i = 0; i < 20; i++) t.fade(clear, there, 0.0166, false); // 0.33 s: still held
    expect(t.state().level[0]).toBeCloseTo(0.3, 2);
    for (let i = 0; i < 40; i++) t.fade(clear, there, 0.0166, false); // 0.99 s in all: restored
    expect(t.state().level[0]).toBe(1);
  });

  it('is solid again at once when the player is in the plane', () => {
    const t = make();
    for (let i = 0; i < 12; i++) t.fade(cam, player, 0.0166, false);
    t.fade(cam, player, 0.0166, false, false);
    expect(t.state().level.every((l) => l === 1)).toBe(true);
  });
});
