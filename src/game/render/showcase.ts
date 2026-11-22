import * as THREE from 'three';

import { DROP, FIGHTERS, WORLD } from '../sim/constants';
import { createGame } from '../sim/step';

import { buildRig, poseChute, poseTopDown } from './characters';
import { buildChute, chuteQuaternion, hangChute, newChuteMotion } from './chute';
import { buildGun } from './guns';
import { buildPlane } from './plane';
import { buildProps } from './props';
import { buildWorld } from './world';

import type { Look } from '../cosmetics';
import type { Tier } from './quality';
import type { FighterId } from '../sim/types';

/**
 * The home page's live backdrop: the real battleground, seen from a slow camera drifting high
 * over the town, the cargo plane crossing overhead, the four fighters drifting down under their
 * parachutes, and the blue Deadline standing round the map.
 */
export const startShowcase = (canvas: HTMLCanvasElement, onReady: () => void, opts: { tier?: Tier; still?: boolean } = {}) => {
  // Kept cheap behind a menu: on the low tier a lighter picture without shadows at half the frame rate; `still` (reduced
  // motion) draws a few frames and then holds the picture.
  const low = opts.tier === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) * 0.75 : Math.min(window.devicePixelRatio, opts.tier === 'medium' ? 1.25 : 1.5));
  renderer.shadowMap.enabled = !low;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Late-afternoon sky: warm haze over the fields.
  scene.background = new THREE.Color(0xa9cbe6);
  scene.fog = new THREE.Fog(0xc9d6df, 90, 260);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 700);

  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x5a6b3a, 1.4));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -WORLD * 0.62, right: WORLD * 0.62, top: WORLD * 0.62, bottom: -WORLD * 0.62, near: 1, far: 400 });
  sun.position.set(WORLD / 2 - 70, 140, WORLD / 2 + 40);
  sun.target.position.set(WORLD / 2, 0, WORLD / 2);
  scene.add(sun, sun.target);

  const state = createGame('hotfix', 7);
  const world = buildWorld(scene);
  const props = buildProps(scene);

  // The Deadline: a pale blue wall round most of the map.
  const zone = new THREE.Mesh(
    new THREE.CylinderGeometry(WORLD * 0.46, WORLD * 0.46, 40, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2f8cff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  zone.position.set(WORLD / 2 + 8, 20, WORLD / 2 - 6);
  scene.add(zone);

  const plane = buildPlane();
  scene.add(plane);

  // The four fighters under their canopies, in front of the camera, drifting down in a loop.
  const ids = Object.keys(FIGHTERS) as FighterId[];
  const jumpers = ids.map((id, i) => {
    const rig = buildRig(id);
    const chute = buildChute(FIGHTERS[id].color);
    scene.add(rig.root, chute);
    // Spread over the right of the view, clear of the title on the left.
    return { rig, chute, motion: newChuteMotion(0), q: new THREE.Quaternion(), i, offset: [2, 11, 20, 29][i], depth: [6, -4, 10, -1][i], phase: i * 0.27 };
  });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };

  let raf = 0;
  let last = performance.now();
  let time = 0;
  let ready = false;
  const look = new THREE.Vector3();
  let frames = 0;
  const frame = (now: number) => {
    frames++;
    if (opts.still && frames > 20) return;
    if (low && frames % 2 === 1 && ready) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    resize();
    // A slow drift high over the town.
    const c = WORLD / 2;
    const t = time * 0.025;
    camera.position.set(c + Math.sin(t) * 34, 62, c + 92 + Math.cos(t * 0.7) * 8);
    look.set(c + Math.sin(t) * 22, 6, c + 18);
    camera.lookAt(look);

    // The plane crosses overhead every 26 s.
    const k = (time % 26) / 26;
    plane.position.set(-80 + k * (WORLD + 160), DROP.height - 8, c + 34);
    plane.rotation.set(0, 0, Math.sin(time * 0.6) * 0.04);
    plane.children.forEach((ch) => ch.userData.rotor && (ch.rotation.x += dt * 40));

    for (const j of jumpers) {
      // Each one comes down from 44 m to 12 m over 18 s, then starts again from the top.
      const f = ((time / 18 + j.phase) % 1 + 1) % 1;
      const h = 44 - f * 32;
      const x = look.x + j.offset + Math.sin(time * 0.4 + j.i) * 1.5;
      const z = look.z + 24 + j.depth;
      const turn = Math.sin(time * 0.4 + j.i) * 0.5;
      j.rig.root.position.set(x, h, z);
      j.rig.root.rotation.y = Math.PI + Math.sin(time * 0.3 + j.i) * 0.4; // facing the camera, turning a little
      j.motion.yaw = Math.PI / 2 - j.rig.root.rotation.y;
      j.motion.bank = turn * 0.3;
      j.motion.pitch = Math.sin(time * 0.9 + j.i) * 0.03;
      poseChute(j.rig, { dt, time, seed: j.i, canopy: 9, brakeL: Math.max(0, turn), brakeR: Math.max(0, -turn), turn, bank: j.motion.bank, pitch: j.motion.pitch, flare: 0, shooting: false });
      j.rig.root.updateMatrixWorld(true);
      hangChute(j.chute, j.rig, chuteQuaternion(j.motion, j.q), { canopy: 9, time, seed: j.i, brakeL: Math.max(0, turn), brakeR: Math.max(0, -turn) });
    }
    world.update(state, -999, -999);
    props.update(time, dt);
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    dispose: () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
};

/**
 * Portraits of the four fighters for the menu cards: each one standing ready with a rifle,
 * rendered once offscreen to an image.
 */
export const renderPortraits = (look?: Look): Record<FighterId, string> => {
  const W = 360;
  const H = 440;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  camera.position.set(1.7, 1.55, 3.6);
  camera.lookAt(0, 1.05, 0);
  const out = {} as Record<FighterId, string>;
  for (const id of Object.keys(FIGHTERS) as FighterId[]) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30384a, 1.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(new THREE.Color(FIGHTERS[id].color), 2.2);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);
    const rig = buildRig(id, look?.outfit[id]);
    scene.add(rig.root);
    rig.vest.visible = true;
    // Let the pose settle (it eases into place).
    for (let i = 0; i < 90; i++) {
      poseTopDown(rig, {
        dt: 1 / 60, time: i / 60, vx: 0, vy: 0, yaw: 0, yawRate: 0, onGround: true, dashing: false,
        sinceShot: 9, gun: 'rifle', reload: null, lean: 0, vault: null, roll: null,
      });
    }
    rig.root.rotation.y = 0.35;
    rig.root.updateMatrixWorld(true);
    const gun = buildGun('rifle', look?.finish).root;
    rig.hand.getWorldPosition(gun.position);
    rig.hand.getWorldQuaternion(gun.quaternion);
    scene.add(gun);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
  }
  renderer.dispose();
  return out;
};
