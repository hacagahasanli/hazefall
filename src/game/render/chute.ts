import * as THREE from 'three';

/** How far above the hands the canopy hangs. */
export const CHUTE_UP = 4.2;
const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });

/**
 * A parachute in the jumper's colour and white. Its origin is the point the jumper holds (the
 * raised hands), so canopy and body always move together; eight lines run from the canopy rim
 * down to the hands (tagged `line` so a canopy left on the ground can hide them).
 */
export const buildChute = (color: string) => {
  const g = new THREE.Group();
  const colors = [color, '#f4f6fb'];
  for (let i = 0; i < 8; i++) {
    const panel = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: colors[i % 2], flatShading: true, side: THREE.DoubleSide, transparent: true }),
    );
    panel.scale.y = 0.55;
    panel.position.y = CHUTE_UP;
    panel.castShadow = true;
    g.add(panel);
  }
  const end = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const start = new THREE.Vector3(Math.cos(a) * 2.35, CHUTE_UP + 0.35, Math.sin(a) * 2.35);
    const len = start.distanceTo(end);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), lineMat);
    line.position.copy(start).add(end).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize());
    line.userData.line = true;
    g.add(line);
  }
  return g;
};
