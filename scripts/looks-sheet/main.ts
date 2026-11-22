/**
 * Dev tool (not part of the game): a contact sheet of the real rigs and guns, drawn with the game's own lights and a
 * gameplay-like tilted camera. `?mode=outfits` (every outfit set on all four fighters), `?mode=finishes` (every gun finish,
 * the fighters in Standard, each holding a rifle), `?mode=guns` (every gun in every finish, close up).
 * Run `npm run looks:sheet` (port 3207) and capture with Playwright at 390x844 and 1280x720.
 */
import * as THREE from 'three';

import { FIGHTER_ORDER, FINISHES, OUTFITS } from '~/game/cosmetics';
import { buildRig, poseTopDown } from '~/game/render/characters';
import { buildGun } from '~/game/render/guns';
import { FIGHTERS } from '~/game/sim/constants';

import type { GunKind } from '~/game/render/guns';

const mode = new URLSearchParams(location.search).get('mode') ?? 'outfits';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f5);
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x55703f, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.castShadow = true;
sun.position.set(-20, 40, 30);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f8f4e, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

const portrait = innerWidth < innerHeight;
const caps: { text: string; at: THREE.Vector3 }[] = [];
const GUNS: GunKind[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher'];
let cols = 0;
let rows = 0;
let dx = 2;
let dz = 2.6;
const place = (obj: THREE.Object3D, c: number, r: number) => obj.position.set((c - (cols - 1) / 2) * dx - 0.25, 0, (r - (rows - 1) / 2) * dz);

const dress = (id: (typeof FIGHTER_ORDER)[number], outfit: string, finish: string, c: number, r: number) => {
  const rig = buildRig(id, outfit);
  rig.vest.visible = false;
  const gun = buildGun('rifle', finish).root;
  rig.root.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  gun.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  scene.add(rig.root, gun);
  poseTopDown(rig, { dt: 0.016, time: 0, vx: 0, vy: 0, yaw: 0, yawRate: 0, onGround: true, dashing: false, sinceShot: 9, gun: 'rifle', reload: null, lean: 0, vault: null, roll: null });
  place(rig.root, c, r);
  rig.root.rotation.y = 0.55;
  rig.root.updateMatrixWorld(true);
  rig.hand.getWorldPosition(gun.position);
  rig.hand.getWorldQuaternion(gun.quaternion);
};

if (mode === 'outfits') {
  // Portrait: fighters across, sets down. Landscape: sets across, fighters down.
  const sets = OUTFITS;
  if (portrait) { cols = 4; rows = sets.length; } else { cols = sets.length; rows = 4; }
  sets.forEach((o, si) => FIGHTER_ORDER.forEach((id, fi) => dress(id, o.key, 'factory', portrait ? fi : si, portrait ? si : fi)));
  sets.forEach((o, si) => caps.push({ text: o.name, at: portrait ? new THREE.Vector3(-(cols - 1) / 2 * dx - 0.2, 1.9, (si - (rows - 1) / 2) * dz) : new THREE.Vector3((si - (cols - 1) / 2) * dx, 0, ((rows - 1) / 2) * dz + 0.9) }));
} else if (mode === 'finishes') {
  const f = FINISHES;
  if (portrait) { cols = 4; rows = f.length; } else { cols = f.length; rows = 4; }
  f.forEach((x, si) => FIGHTER_ORDER.forEach((id, fi) => dress(id, 'standard', x.key, portrait ? fi : si, portrait ? si : fi)));
  f.forEach((x, si) => caps.push({ text: x.name, at: portrait ? new THREE.Vector3(-(cols - 1) / 2 * dx - 0.2, 1.9, (si - (rows - 1) / 2) * dz) : new THREE.Vector3((si - (cols - 1) / 2) * dx, 0, ((rows - 1) / 2) * dz + 0.9) }));
} else {
  // Close up: every gun in every finish, side on.
  dx = 1.7;
  dz = 0.9;
  if (portrait) { cols = GUNS.length > 4 ? 3 : GUNS.length; rows = FINISHES.length * 2; } else { cols = GUNS.length; rows = FINISHES.length; }
  FINISHES.forEach((x, r) => GUNS.forEach((k, c) => {
    const g = buildGun(k, x.key).root;
    g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
    const cc = portrait ? c % 3 : c;
    const rr = portrait ? r * 2 + Math.floor(c / 3) : r;
    g.position.set((cc - (cols - 1) / 2) * dx, 1.0, (rr - (rows - 1) / 2) * dz);
    g.rotation.y = Math.PI / 2 - 0.3;
    g.scale.setScalar(1.3);
    scene.add(g);
  }));
  FINISHES.forEach((x, r) => caps.push({ text: x.name, at: new THREE.Vector3(-(cols - 1) / 2 * dx - 0.4, 1.1, ((portrait ? r * 2 : r) - (rows - 1) / 2) * dz - 0.2) }));
}

const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.5, 400);
const w = (cols - 1) * dx + 3.6;
const d = (rows - 1) * dz + 2.4;
const fit = Math.max((w / 2) / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), (d * 0.55 + 1.2) / (2 * Math.tan((camera.fov * Math.PI) / 360)));
const tilt = 0.62;
camera.position.set(0, 0.9 + Math.sin(tilt) * fit, Math.cos(tilt) * fit);
camera.lookAt(0, 0.9, 0);
camera.updateMatrixWorld(true);
renderer.setSize(innerWidth, innerHeight, false);
renderer.render(scene, camera);
const capsEl = document.getElementById('caps')!;
for (const c of caps) {
  const p = c.at.clone().project(camera);
  const el = document.createElement('div');
  el.className = 'cap';
  el.textContent = c.text;
  el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
  el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  capsEl.appendChild(el);
}
(window as unknown as { __ready: boolean }).__ready = true;
void FIGHTERS;
