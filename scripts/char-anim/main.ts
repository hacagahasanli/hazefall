/**
 * Dev tool (not part of the game): drives the real rig and poser (poseTopDown) through scripted movement with the sim's
 * own smoothing, at any frame rate, and renders contact sheets from a side, a back (over-the-shoulder) or a front view.
 * Playwright calls `window.__anim.sheet(scenario, opts)` and screenshots the canvas; `window.__anim.measure(scenario)`
 * returns numbers (foot drift while planted, hand-to-grip gap, lowest point of the body, ...).
 */
import * as THREE from 'three';

import { buildRig, poseTopDown } from '~/game/render/characters';
import { buildGun } from '~/game/render/guns';

import type { Rig, TopDownPose } from '~/game/render/characters';
import type { FighterId, WeaponKind } from '~/game/sim/types';

interface Input {
  /** Wanted velocity on the map (m/s) and where the aim points (radians, 0 = +x). */
  vx: number;
  vy: number;
  yaw: number;
  lean: number;
  crouch: number;
  gun: WeaponKind;
  /** Air: height speed; null = on the ground. */
  air: number | null;
  /** 0..1 through a roll, or null. */
  roll: number | null;
  /** 0..1 landing impact. */
  land: number;
  reload: number | null;
  sinceShot: number;
  reduced: boolean;
}
type Script = (t: number) => Partial<Input>;

const DEF: Input = { vx: 0, vy: 0, yaw: 0, lean: 0, crouch: 0, gun: 'rifle', air: null, roll: null, land: 0, reload: null, sinceShot: 9, reduced: false };
const sm = (a: number, b: number, t: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

const SCENARIOS: Record<string, { dur: number; script: Script }> = {
  idle: { dur: 4, script: () => ({}) },
  walk: { dur: 2.4, script: (t) => ({ vx: t > 0.4 && t < 1.8 ? 3 : 0 }) },
  run: { dur: 2.4, script: (t) => ({ vx: t > 0.4 && t < 1.8 ? 6.5 : 0 }) },
  back: { dur: 2.4, script: (t) => ({ vx: t > 0.4 && t < 1.8 ? -3.5 : 0 }) },
  strafe: { dur: 2.4, script: (t) => ({ vy: t > 0.4 && t < 1.8 ? 4 : 0 }) },
  diagonal: { dur: 2.4, script: (t) => ({ vx: t > 0.4 && t < 1.8 ? 3.5 : 0, vy: t > 0.4 && t < 1.8 ? 3.5 : 0 }) },
  leanL: { dur: 3, script: (t) => ({ lean: t > 0.5 && t < 2 ? -1 : 0 }) },
  leanR: { dur: 3, script: (t) => ({ lean: t > 0.5 && t < 2 ? 1 : 0 }) },
  leanMove: { dur: 3.2, script: (t) => ({ lean: t > 0.5 && t < 2.4 ? 1 : 0, vx: t > 0.9 && t < 2 ? 3 : 0 }) },
  leanFlip: { dur: 3, script: (t) => ({ lean: t < 0.5 ? 0 : t < 1.4 ? 1 : t < 2.3 ? -1 : 0 }) },
  turnStand: { dur: 2.4, script: (t) => ({ yaw: 0.4 * 0 + Math.PI * 0.75 * sm(0.4, 0.75, t) - Math.PI * 0.75 * sm(1.4, 1.75, t) }) },
  turnMove: { dur: 2.4, script: (t) => ({ vx: 5, yaw: Math.PI * 0.4 * sm(0.5, 1, t) }) },
  crouch: { dur: 3, script: (t) => ({ crouch: sm(0.4, 0.9, t) - sm(1.8, 2.3, t), vx: t > 1.1 && t < 1.7 ? 2 : 0 }) },
  jump: { dur: 2, script: (t) => (t > 0.4 && t < 0.9 ? { air: 4.5 - (t - 0.4) * 18 } : t >= 0.9 && t < 1.5 ? { land: Math.max(0, 1 - (t - 0.9) / 0.35) } : {}) },
  roll: { dur: 1.6, script: (t) => ({ vx: t > 0.4 && t < 0.9 ? 8 : 0, roll: t > 0.4 && t < 0.9 ? (t - 0.4) / 0.5 : null }) },
  rollReduced: { dur: 1.6, script: (t) => ({ vx: t > 0.4 && t < 0.9 ? 8 : 0, roll: t > 0.4 && t < 0.9 ? (t - 0.4) / 0.5 : null, reduced: true }) },
  landRoll: { dur: 2, script: (t) => ({ vx: t > 0.3 && t < 1.05 ? 5 : 0, roll: t > 0.3 && t < 1.05 ? (t - 0.3) / 0.75 : null }) },
  reload: { dur: 3, script: (t) => ({ reload: t > 0.5 && t < 2 ? (t - 0.5) / 1.5 : null }) },
};

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);

const makeScene = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x55703f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.castShadow = true;
  sun.position.set(-8, 14, 10);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f8f4e, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // A metre grid so sliding feet are visible against it.
  const pts: number[] = [];
  for (let i = -60; i <= 60; i++) {
    pts.push(i * 0.5, 0.004, -6, i * 0.5, 0.004, 6);
  }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  scene.add(grid);
  return scene;
};

interface Sim {
  rig: Rig;
  gun: THREE.Group;
  gunKind: WeaponKind | null;
  scene: THREE.Scene;
  x: number;
  z: number;
  vx: number;
  vy: number;
  yaw: number;
  yawV: number;
  lean: number;
  crouch: number;
  jz: number;
  t: number;
  fd: { at: number; k: number };
}

const make = (id: FighterId): Sim => {
  const scene = makeScene();
  const rig = buildRig(id);
  rig.vest.visible = true;
  scene.add(rig.root);
  return { rig, gun: new THREE.Group(), gunKind: null, scene, x: 0, z: 0, vx: 0, vy: 0, yaw: 0, yawV: 0, lean: 0, crouch: 0, jz: 0, t: 0, fd: { at: -9, k: 0 } };
};

/** One frame of the game's pipeline: the sim's smoothing, then poseTopDown, then the model placed on the map. */
const step = (s: Sim, inp: Input, dt: number) => {
  const acc = 40 * dt;
  const mv = (cur: number, want: number) => cur + Math.max(-acc, Math.min(acc, want - cur));
  s.vx = mv(s.vx, inp.vx);
  s.vy = mv(s.vy, inp.vy);
  s.x += s.vx * dt;
  s.z += s.vy * dt;
  const dy = Math.atan2(Math.sin(inp.yaw - s.yaw), Math.cos(inp.yaw - s.yaw));
  // The game's critically damped yaw follower (w = 13).
  const w = 13;
  s.yawV += (w * w * dy - 2 * 0.72 * w * s.yawV) * dt;
  s.yaw += s.yawV * dt;
  s.lean += (inp.lean - s.lean) * (1 - Math.exp(-6 * dt));
  s.crouch += (inp.crouch - s.crouch) * (1 - Math.exp(-10 * dt));
  s.t += dt;
  if (inp.land > 0 && s.fd.k === 0) s.fd = { at: s.t, k: inp.land };
  const pose: TopDownPose = {
    dt, time: s.t, vx: s.vx, vy: s.vy, yaw: s.yaw, yawRate: s.yawV, onGround: inp.air === null, dashing: false, sinceShot: inp.sinceShot,
    gun: inp.gun, reduced: undefined as never, reload: inp.reload, lean: s.lean, vault: null, roll: inp.roll, crouch: s.crouch,
    airV: inp.air ?? 0, land: inp.land, reducedMotion: inp.reduced,
  } as unknown as TopDownPose;
  poseTopDown(s.rig, pose);
  s.rig.root.position.set(s.x, inp.air === null ? 0 : Math.max(0, 1.2 * Math.sin(Math.PI * Math.max(0, Math.min(1, (s.t - 0.4) / 0.5)))), s.z);
  s.rig.root.rotation.y = Math.PI / 2 - s.yaw;
  s.rig.root.updateMatrixWorld(true);
  if (s.gunKind !== inp.gun) {
    if (s.gun.parent) s.gun.parent.remove(s.gun);
    s.gun = buildGun(inp.gun === 'rockets' ? 'launcher' : (inp.gun as never)).root;
    s.gunKind = inp.gun;
    s.scene.add(s.gun);
  }
  s.rig.hand.getWorldPosition(s.gun.position);
  s.rig.hand.getWorldQuaternion(s.gun.quaternion);
  s.gun.visible = inp.gun !== 'fists' && inp.roll === null;
};

const merged = (base: Input, extra: Partial<Input>): Input => ({ ...base, ...extra });

const run = (id: FighterId, name: string, fps: number, opts: { gun?: WeaponKind } = {}, onFrame?: (s: Sim, i: number, t: number) => void) => {
  const sc = SCENARIOS[name];
  const s = make(id);
  const n = Math.round(sc.dur * fps);
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / fps;
    const inp = merged({ ...DEF, gun: opts.gun ?? 'rifle' }, sc.script(t));
    step(s, inp, 1 / fps);
    onFrame?.(s, i, t);
  }
  return s;
};

const VIEWS = {
  side: (s: Sim) => ({ pos: new THREE.Vector3(s.x, 1.2, s.z + 4.2), look: new THREE.Vector3(s.x, 0.95, s.z), fov: 30 }),
  // The game's over-the-shoulder camera: behind, a little to the right of where the fighter faces, looking down.
  back: (s: Sim) => ({ pos: new THREE.Vector3(s.x - Math.cos(s.yaw) * 3.4 + Math.sin(s.yaw) * 0.0, 2.2, s.z - Math.sin(s.yaw) * 3.4), look: new THREE.Vector3(s.x + Math.cos(s.yaw) * 2.5, 0.9, s.z + Math.sin(s.yaw) * 2.5), fov: 38 }),
  front: (s: Sim) => ({ pos: new THREE.Vector3(s.x + Math.cos(s.yaw) * 4.2, 1.2, s.z + Math.sin(s.yaw) * 4.2), look: new THREE.Vector3(s.x, 0.95, s.z), fov: 30 }),
};

const draw = (s: Sim, view: keyof typeof VIEWS, x: number, y: number, w: number, h: number, label: string) => {
  const cam = new THREE.PerspectiveCamera(VIEWS[view](s).fov, w / h, 0.1, 100);
  const v = VIEWS[view](s);
  cam.position.copy(v.pos);
  cam.lookAt(v.look);
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.render(s.scene, cam);
  void label;
};

const api = {
  scenarios: () => Object.keys(SCENARIOS),
  /** A contact sheet of `frames` evenly spaced frames of a scenario; one row per view. */
  sheet: (name: string, o: { id?: FighterId; gun?: WeaponKind; views?: (keyof typeof VIEWS)[]; frames?: number; from?: number; to?: number; fps?: number; tile?: number } = {}) => {
    const id = o.id ?? 'hotfix';
    const fps = o.fps ?? 60;
    const sc = SCENARIOS[name];
    const from = o.from ?? 0;
    const to = o.to ?? sc.dur;
    const frames = o.frames ?? 8;
    const views = o.views ?? ['side', 'back'];
    const tile = o.tile ?? 220;
    canvas.width = tile * frames;
    canvas.height = tile * views.length;
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setScissorTest(true);
    const marks = Array.from({ length: frames }, (_, k) => Math.round((from + ((to - from) * k) / Math.max(1, frames - 1)) * fps));
    const s = make(id);
    const n = Math.round(sc.dur * fps);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / fps;
      step(s, merged({ ...DEF, gun: o.gun ?? 'rifle' }, sc.script(t)), 1 / fps);
      const k = marks.indexOf(i + 1);
      if (k >= 0) views.forEach((v, row) => draw(s, v, k * tile, (views.length - 1 - row) * tile, tile, tile, v));
    }
    return { w: canvas.width, h: canvas.height };
  },
  /** Numbers: how far each foot moves while the body is meant to be still, the lowest/hand gaps, joint extremes. */
  measure: (name: string, o: { id?: FighterId; gun?: WeaponKind; fps?: number; from?: number; to?: number } = {}) => {
    const fps = o.fps ?? 60;
    const from = o.from ?? 0;
    const sc = SCENARIOS[name];
    const to = o.to ?? sc.dur;
    let ref: THREE.Vector3[] | null = null;
    let drift = 0;
    let minFoot = Infinity;
    let minAll = Infinity;
    let hand = 0;
    let kneeMin = 9;
    let kneeMax = -9;
    let headMax = 0;
    const p = new THREE.Vector3();
    run(o.id ?? 'hotfix', name, fps, { gun: o.gun }, (s, _i, t) => {
      const { rig } = s;
      // Ankles (the end of each shin): planted checks use their world positions.
      const world = [rig.shinL, rig.shinR].map((f) => f.localToWorld(new THREE.Vector3(0, -rig.legLen / 2, 0)));
      if (t >= from && t <= to) {
        ref ??= world;
        world.forEach((w, j) => (drift = Math.max(drift, Math.hypot(w.x - ref![j].x, w.z - ref![j].z))));
      }
      for (const f of world) minFoot = Math.min(minFoot, f.y);
      const hands = [rig.foreL, rig.foreR].map((f) => f.localToWorld(new THREE.Vector3(0, -rig.armLen / 2, 0)));
      for (const q of [...world, ...hands, rig.head.getWorldPosition(p)]) minAll = Math.min(minAll, q.y);
      kneeMin = Math.min(kneeMin, rig.shinL.rotation.x, rig.shinR.rotation.x);
      kneeMax = Math.max(kneeMax, rig.shinL.rotation.x, rig.shinR.rotation.x);
      headMax = Math.max(headMax, rig.head.getWorldPosition(new THREE.Vector3()).y);
      const grip = rig.weapon.localToWorld(new THREE.Vector3(0, -0.02, 0.24));
      const e = rig.foreL.localToWorld(new THREE.Vector3(0, -rig.armLen / 2, 0));
      hand = Math.max(hand, e.distanceTo(grip));
    });
    return { drift, minFoot, minAll, hand, kneeMin, kneeMax, headMax };
  },
};
(window as unknown as { __anim: typeof api }).__anim = api;
