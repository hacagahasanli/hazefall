import * as THREE from 'three';

import { FIGHTERS, WORLD } from '../sim/constants';
import { createGame } from '../sim/step';

import { buildRig, disposeObject, poseTopDown } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';
import { buildPlane } from './plane';
import { buildProps } from './props';
import { buildWorld } from './world';

import type { Rig } from './characters';
import type { Tier } from './quality';
import type { FighterId } from '../sim/types';

/**
 * The pre-match staging scene behind the fighter picker: an airstrip just south of the battleground at golden hour.
 * Your fighter stands in front, the other three wait behind, the cargo plane idles with its propellers turning and the
 * town and the zone wall stand on the horizon. The camera holds a slow cinematic orbit on your fighter; `launch()`
 * starts the final move (the camera cranes up over the squad and turns to the town) that hands over to the match.
 */
export interface Staging {
  setFighter: (id: FighterId) => void;
  /** The last seconds: crane up and turn to the battleground. `seconds` is how long the move takes. */
  launch: (seconds: number) => void;
  dispose: () => void;
}

const IDS = Object.keys(FIGHTERS) as FighterId[];
/**
 * Where the squad stands: on an apron 70 m south of the map, clear of the forest band that rings it (26 m deep), so the
 * plane parks on open ground with the treeline and the town layered behind it.
 */
const C = WORLD / 2;
const Z0 = WORLD + 70;
/** The three behind you, staggered so every face reads. */
const BACK: [number, number, number][] = [
  [-1.9, -1.6, 0.35],
  [1.9, -1.4, -0.4],
  [0.3, -3.0, 0.1],
];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const startStaging = (
  canvas: HTMLCanvasElement,
  fighter: FighterId,
  onReady: () => void,
  opts: { tier?: Tier; still?: boolean } = {},
): Staging => {
  const low = opts.tier === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) * 0.75 : Math.min(window.devicePixelRatio, opts.tier === 'medium' ? 1.25 : 1.5));
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Golden hour, a shade later than the menu: warm haze low, the sky cooling overhead.
  scene.background = new THREE.Color(0xe7c9a3);
  scene.fog = new THREE.Fog(0xdcc3a2, 60, 240);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.3, 700);

  scene.add(new THREE.HemisphereLight(0xffe6c8, 0x4b5a34, 1.2));
  const sun = new THREE.DirectionalLight(0xffc98a, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  // Low in the west, in front of the squad and to their right: warm light on their faces, long shadows back across the apron.
  sun.position.set(C - 55, 30, Z0 + 38);
  sun.target.position.set(C, 0, Z0);
  scene.add(sun, sun.target);
  // A rim in your fighter's colour from behind, so they separate from the plane.
  const rim = new THREE.DirectionalLight(0xffffff, 2.4);
  rim.position.set(C + 5, 6, Z0 - 10);
  rim.target.position.set(C, 1, Z0);
  scene.add(rim, rim.target);

  const world = buildWorld(scene);
  const props = buildProps(scene);
  const state = createGame(fighter, 7);

  // The apron: asphalt, painted lines, a few crates and two light masts.
  const apron = new THREE.Group();
  const asphalt = mesh(new THREE.PlaneGeometry(70, 30).rotateX(-Math.PI / 2), mat(0x3a3d44), false);
  asphalt.receiveShadow = true;
  asphalt.position.set(C, 0.02, Z0 - 6);
  apron.add(asphalt);
  const paint = mat(0xf2e3b3);
  for (let i = -6; i <= 6; i++) {
    const dash = mesh(new THREE.PlaneGeometry(3, 0.35).rotateX(-Math.PI / 2), paint, false);
    dash.position.set(C + i * 5.5, 0.03, Z0 - 9);
    apron.add(dash);
  }
  const edge = mesh(new THREE.PlaneGeometry(70, 0.3).rotateX(-Math.PI / 2), paint, false);
  edge.position.set(C, 0.03, Z0 + 2.5);
  apron.add(edge);
  const crateMat = mat(0x7a5a36);
  const crateTrim = mat(PALETTE.ink);
  for (const [x, z, s, r] of [
    [-7.5, -1.5, 1.3, 0.2],
    [-8.6, -0.2, 1.0, -0.3],
    [-7.9, -1.5, 0.9, 0.5],
    [7.2, -2.4, 1.2, -0.15],
  ] as [number, number, number, number][]) {
    const crate = mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(C + x, s / 2 + (x === -7.9 ? 1.3 : 0), Z0 + z);
    crate.rotation.y = r;
    apron.add(crate);
    const band = mesh(new THREE.BoxGeometry(s + 0.02, 0.12, s + 0.02), crateTrim);
    band.position.copy(crate.position);
    band.rotation.y = r;
    apron.add(band);
  }
  const lamps: THREE.PointLight[] = [];
  for (const x of [-11, 11]) {
    const mast = mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), mat(PALETTE.inkSoft));
    mast.position.set(C + x, 3.5, Z0 - 3);
    apron.add(mast);
    const head = mesh(new THREE.BoxGeometry(1.2, 0.35, 0.5), mat(0xfff2c8, { emissive: 0xffe0a0 }));
    head.position.set(C + x, 7, Z0 - 3);
    apron.add(head);
    if (!low) {
      const lamp = new THREE.PointLight(0xffd59a, 6, 18, 2);
      lamp.position.set(C + x, 6.6, Z0 - 2.6);
      apron.add(lamp);
      lamps.push(lamp);
    }
  }
  scene.add(apron);

  // The plane idles on the strip behind the squad, nose to the east.
  const plane = buildPlane();
  plane.position.set(C + 8, 2.1, Z0 - 19);
  // Angled away a little: its nose and props read, and the treeline and sky open up behind the squad.
  plane.rotation.y = -0.5;
  scene.add(plane);
  const rotors = plane.children.filter((ch) => ch.userData.rotor);

  // Dust and pollen drifting through the low sun.
  const MOTES = low ? 0 : 160;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = C + (Math.random() - 0.5) * 24;
    motePos[i * 3 + 1] = Math.random() * 6;
    motePos[i * 3 + 2] = Z0 + (Math.random() - 0.5) * 14;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffe9c0, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(motes);

  // The squad: you in front, the others behind. Each keeps its own gun in hand.
  type Member = { rig: Rig; gun: THREE.Object3D; x: number; z: number; turn: number; seed: number };
  const members: Member[] = [];
  const addMember = (id: FighterId, x: number, z: number, turn: number, seed: number) => {
    const rig = buildRig(id);
    rig.vest.visible = true;
    const gun = buildGun(seed === 0 ? 'rifle' : (['shotgun', 'sniper', 'smg'] as const)[(seed - 1) % 3]).root;
    rig.root.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
    gun.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
    scene.add(rig.root, gun);
    members.push({ rig, gun, x, z, turn, seed });
  };
  const buildSquad = (hero: FighterId) => {
    for (const m of members) {
      scene.remove(m.rig.root, m.gun);
      disposeObject(m.rig.root);
      disposeObject(m.gun);
    }
    members.length = 0;
    addMember(hero, 0, 0, 0.18, 0);
    IDS.filter((id) => id !== hero).forEach((id, i) => addMember(id, BACK[i][0], BACK[i][1], BACK[i][2], i + 1));
    rim.color.set(FIGHTERS[hero].color);
  };
  buildSquad(fighter);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // Portrait phones: pull back so the whole squad fits across.
      camera.fov = camera.aspect < 1 ? 52 : 34;
      camera.updateProjectionMatrix();
    }
  };

  // The camera rig: a slow orbit on the hero, then the launch crane.
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const orbitPos = new THREE.Vector3();
  const orbitLook = new THREE.Vector3();
  const cranePos = new THREE.Vector3(C - 3, 24, Z0 + 10);
  const craneLook = new THREE.Vector3(C, 6, WORLD * 0.6);
  let launchAt = -1;
  let launchLen = 3;

  let raf = 0;
  let last = performance.now();
  let time = 0;
  let frames = 0;
  let ready = false;
  const frame = (now: number) => {
    frames++;
    if (opts.still && frames > 20 && launchAt < 0) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (low && frames % 2 === 1 && ready) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    resize();

    // A slow arc in front of the squad, drifting in, the horizon kept just above their heads.
    const portrait = camera.aspect < 1;
    const a = opts.still ? 0.2 : Math.sin(time * 0.12) * 0.22 + 0.06;
    const dist = (portrait ? 9.5 : 6.4) - Math.min(1, time / 14) * 0.8;
    orbitPos.set(C + Math.sin(a) * dist, 1.55 + Math.sin(time * 0.21) * 0.12, Z0 + Math.cos(a) * dist);
    // Wide screens: the hero stands just right of centre, between the picker (left) and the lobby (right).
    orbitLook.set(C - (portrait ? 0 : 0.8), 1.25, Z0 - 1.2);
    if (launchAt >= 0) {
      const k = ease(Math.min(1, (time - launchAt) / launchLen));
      pos.lerpVectors(orbitPos, cranePos, k);
      look.lerpVectors(orbitLook, craneLook, k);
    } else {
      pos.copy(orbitPos);
      look.copy(orbitLook);
    }
    camera.position.copy(pos);
    camera.lookAt(look);

    for (const m of members) {
      // Idle: breathing, weight shifts, and now and then a look round.
      poseTopDown(m.rig, {
        dt, time: time + m.seed * 1.7, vx: 0, vy: 0, yaw: 0, yawRate: 0, onGround: true, dashing: false,
        sinceShot: 9, gun: m.seed === 0 ? 'rifle' : (['shotgun', 'sniper', 'smg'] as const)[(m.seed - 1) % 3], reload: null, lean: 0, vault: null, roll: null,
      });
      const glance = Math.sin(time * 0.37 + m.seed * 2.1) > 0.82 ? Math.sin(time * 0.37 + m.seed * 2.1) - 0.82 : 0;
      // At launch everyone turns to face the battleground.
      const turnAway = launchAt >= 0 ? ease(Math.min(1, (time - launchAt) / (launchLen * 0.7))) * Math.PI : 0;
      m.rig.root.position.set(C + m.x, 0, Z0 + m.z);
      m.rig.root.rotation.y = m.turn + glance * 2.2 + turnAway;
      m.rig.root.updateMatrixWorld(true);
      m.rig.hand.getWorldPosition(m.gun.position);
      m.rig.hand.getWorldQuaternion(m.gun.quaternion);
    }

    for (const r of rotors) r.rotation.x += dt * (launchAt >= 0 ? 70 : 34);
    plane.position.y = 2.1 + Math.sin(time * 9) * 0.015 + (launchAt >= 0 ? 0.02 * Math.sin(time * 31) : 0);
    if (MOTES) {
      const p = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MOTES; i++) {
        let x = p.getX(i) + dt * (0.35 + Math.sin(i + time * 0.3) * 0.15);
        let y = p.getY(i) + Math.sin(time * 0.8 + i) * dt * 0.08;
        if (x > C + 12) x -= 24;
        if (y < 0 || y > 6) y = 3;
        p.setX(i, x);
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    for (const l of lamps) l.intensity = 6 + Math.sin(time * 23) * 0.15;

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
    setFighter: (id) => buildSquad(id),
    launch: (seconds) => {
      if (launchAt >= 0) return;
      launchAt = time;
      launchLen = seconds;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
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
