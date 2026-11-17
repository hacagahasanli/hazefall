import * as THREE from 'three';

import { mat, mesh, PALETTE } from './palette';

/** The high-wing cargo plane in studio colours, four propellers (children tagged `rotor`). */
export const buildPlane = () => {
  const drone = new THREE.Group();

  const body = mat(PALETTE.paper);
  const trim = mat(0xff3d6e);
  const fuselage = mesh(new THREE.CylinderGeometry(1.5, 1.3, 16, 12), body);
  fuselage.rotation.z = Math.PI / 2;
  drone.add(fuselage);
  const nose = mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 8;
  drone.add(nose);
  const cockpit = mesh(new THREE.BoxGeometry(1.6, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.2, metalness: 0.4 }));
  cockpit.position.set(7.4, 0.9, 0);
  drone.add(cockpit);
  const tail = mesh(new THREE.ConeGeometry(1.3, 5, 12), body);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-10.5, 0.4, 0);
  drone.add(tail);
  const stripe = mesh(new THREE.CylinderGeometry(1.52, 1.52, 1.2, 12), trim);
  stripe.rotation.z = Math.PI / 2;
  stripe.position.x = 3;
  drone.add(stripe);
  const wing = mesh(new THREE.BoxGeometry(3.4, 0.35, 26), body);
  wing.position.set(1.5, 1.4, 0);
  drone.add(wing);
  for (const z of [-12.6, 12.6]) {
    const tip = mesh(new THREE.BoxGeometry(3.4, 0.38, 0.6), trim);
    tip.position.set(1.5, 1.4, z);
    drone.add(tip);
  }
  const fin = mesh(new THREE.BoxGeometry(3, 4, 0.3), body);
  fin.position.set(-11, 2.6, 0);
  drone.add(fin);
  const finTip = mesh(new THREE.BoxGeometry(3, 0.9, 0.32), trim);
  finTip.position.set(-11, 4.2, 0);
  drone.add(finTip);
  const stab = mesh(new THREE.BoxGeometry(2.4, 0.25, 9), body);
  stab.position.set(-11.3, 0.8, 0);
  drone.add(stab);
  for (const z of [-8.5, -4.2, 4.2, 8.5]) {
    const nacelle = mesh(new THREE.CylinderGeometry(0.6, 0.55, 3, 10), mat(PALETTE.inkSoft));
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(2.6, 1, z);
    drone.add(nacelle);
    const prop = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    prop.rotation.y = Math.PI / 2;
    prop.position.set(4.15, 1, z);
    prop.userData.rotor = true;
    drone.add(prop);
  }
  drone.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  return drone;
};
