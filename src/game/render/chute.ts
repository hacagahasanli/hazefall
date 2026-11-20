import * as THREE from 'three';

import { mergeSiblings } from './merge';

/** How far above the backpack the canopy flies, and where the lines meet the risers. */
export const CHUTE_UP = 4.6;
/** The risers part to the sides: out past the shoulders, so the hands hold on at the sides, elbows bent. */
const JUNCTION = { x: 0.62, y: 1.3 };
/** Where each riser leaves the backpack's shoulder strap (x), relative to the harness point. */
const STRAP_X = 0.17;
/** Where the chute is attached to the body: the top of the backpack, behind the shoulders (body space z). */
export const HARNESS_BACK = -0.25;

const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
const webMat = new THREE.MeshStandardMaterial({ color: 0x2a2d24, roughness: 0.9 });

const strand = (from: THREE.Vector3, to: THREE.Vector3, radius: number, m: THREE.Material) => {
  const len = from.distanceTo(to);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 4), m);
  o.position.copy(from).add(to).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return o;
};

/**
 * A parachute in the jumper's colour and white, rigged like a real one: its origin is the top of
 * the backpack it came out of. Two webbing risers rise from the backpack straps to two junctions
 * over the shoulders (where the hands hold on), and the canopy's lines fan out from those
 * junctions to the rim. `userData.deploy` is the part that unfolds out of the pack when it opens
 * (the canopy and its lines); everything tagged `line` hides when the canopy is left on the ground.
 */
export const buildChute = (color: string) => {
  const g = new THREE.Group();
  const deploy = new THREE.Group();
  g.add(deploy);
  g.userData.deploy = deploy;
  const colors = [color, '#f4f6fb'];
  for (let i = 0; i < 8; i++) {
    const panel = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: colors[i % 2], flatShading: true, side: THREE.DoubleSide, transparent: true }),
    );
    panel.scale.y = 0.55;
    panel.position.y = CHUTE_UP;
    panel.castShadow = true;
    deploy.add(panel);
  }
  const jL = new THREE.Vector3(-JUNCTION.x, JUNCTION.y, 0);
  const jR = new THREE.Vector3(JUNCTION.x, JUNCTION.y, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rim = new THREE.Vector3(Math.cos(a) * 2.35, CHUTE_UP + 0.35, Math.sin(a) * 2.35);
    const line = strand(rim, rim.x < 0 ? jL : jR, 0.025, lineMat);
    line.userData.line = true;
    deploy.add(line);
  }
  // The risers: flat webbing from the backpack's shoulder straps up to the junctions.
  for (const [j, x] of [[jL, -STRAP_X], [jR, STRAP_X]] as const) {
    const riser = strand(new THREE.Vector3(x, 0, 0), j, 0.035, webMat);
    riser.userData.line = true;
    g.add(riser);
  }
  // Panels of one colour, and the lines, as one mesh each (the tags carry over).
  mergeSiblings(g);
  return g;
};

/**
 * A point on a riser, in body space (the chute hangs at (0, shoulderY, HARNESS_BACK) and turns
 * with the body, so this is exactly on the webbing). `t` runs from the strap (0) to the junction
 * (1): the hands hold on high up, and pulling a riser down to steer slides the hand down it.
 */
export const riserGrip = (side: -1 | 1, shoulderY: number, t = 0.5) =>
  new THREE.Vector3(side * (STRAP_X + (JUNCTION.x - STRAP_X) * t), shoulderY + JUNCTION.y * t, HARNESS_BACK + 0.04);
