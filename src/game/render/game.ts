import * as THREE from 'three';

import { createSfx } from '../sfx';
import { createBot } from '../sim/bot';
import { AUTO_AIM_RANGE, DISTRICTS, DROP, DT, FIGHTERS, MAP, SIZE, SUPERS, TILE, WEAPONS, WORLD, ZONE_PHASES } from '../sim/constants';
import { canSee, createGame, inPlant, lineOfSight, lootUnder, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import { buildRig, poseRig } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';
import { createVfx } from './vfx';
import { buildWorld } from './world';

import type { Rig } from './characters';
import type { GunKind } from './guns';
import type { FighterId, GameEvent, GameState, Input, ItemKind, LootKind, Player, WeaponKind } from '../sim/types';

// ---------------------------------------------------------------------------
// HUD snapshot for React (throttled to 10 Hz)
// ---------------------------------------------------------------------------

export interface HudState {
  phase: GameState['phase'];
  stage: Player['stage'];
  alive: number;
  hp: number;
  maxHp: number;
  armor: number;
  weapon: string;
  ammo: number;
  item: ItemKind | null;
  superCharge: number;
  superName: string;
  fighter: FighterId;
  zone: { label: string; seconds: number; outside: boolean };
  feed: { id: number; text: string }[];
  prompt: string | null;
  dead: boolean;
  placement: number;
  kills: number;
  damage: number;
  won: boolean;
  fps: number;
  muted: boolean;
  aimMode: AimMode;
  paused: boolean;
}

export type AimMode = 'auto' | 'mouse';

export interface MatchOptions {
  fighter: FighterId;
  name: string;
  /** Auto-aim (Space shoots the nearest visible enemy) or mouse aim (point and click). */
  aimMode: AimMode;
  minimap: HTMLCanvasElement;
  onHud: (hud: HudState) => void;
}

const GUN_MODEL: Record<Exclude<WeaponKind, 'fists'>, GunKind> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'smg', sniper: 'railgun', rockets: 'launcher',
};
const SOUND: Record<Exclude<WeaponKind, 'fists' | 'rockets'>, 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper'> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper',
};
const LOOT_NAME: Record<LootKind, string> = {
  pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper', rockets: 'Rockets',
  armor: 'Armor vest', medkit: 'Med kit', bomb: 'Bomb',
};

const randomSeed = () => (Math.random() * 1e9) | 0;
/** Map (x, y) is the ground plane (x, z) in Three.js. */
const v3 = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y);
/** Place an object (Three.js `position` is read-only, so it can't be assigned). */
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

// ---------------------------------------------------------------------------

export const startMatch = (canvas: HTMLCanvasElement, opts: MatchOptions) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, 120, 300);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);

  const state: GameState = createGame(opts.fighter, randomSeed(), opts.name);
  const me = 0;
  const bots = state.players.map((p) => (p.bot ? createBot(p.id, randomSeed()) : null));
  const sfx = createSfx();
  const vfx = createVfx(scene);

  // ---------- light
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x55703f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  scene.add(sun, sun.target);

  // ---------- the world: ground, houses, trees, bushes, rocks, fences, crates
  const world = buildWorld(scene);

  // ---------- the Deadline
  const zoneWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 30, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2f8cff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(zoneWall);
  const nextRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  nextRing.rotation.x = -Math.PI / 2;
  scene.add(nextRing);

  // ---------- the plane: a high-wing cargo plane in studio colours, four props
  const drone = new THREE.Group();
  {
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
  }
  scene.add(drone);

  // ---------- players
  const rigs: Rig[] = state.players.map((p) => {
    const r = buildRig(p.fighter);
    scene.add(r.root);
    return r;
  });
  const chutes = state.players.map((p) => {
    const g = new THREE.Group();
    const colors = [FIGHTERS[p.fighter].color, '#f4f6fb'];
    for (let i = 0; i < 8; i++) {
      const panel = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.6),
        new THREE.MeshStandardMaterial({ color: colors[i % 2], flatShading: true, side: THREE.DoubleSide }),
      );
      panel.scale.y = 0.55;
      g.add(panel);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pts = [new THREE.Vector3(Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2), new THREE.Vector3(0, -3.4, 0)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0a0d18 })));
    }
    g.visible = false;
    scene.add(g);
    return g;
  });
  const guns: (THREE.Group | null)[] = state.players.map(() => null);
  const gunKinds: (WeaponKind | null)[] = state.players.map(() => null);
  const bars = state.players.map((p) => {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x0a0d18, depthTest: false, transparent: true }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: p.id === me ? 0x3ddc84 : 0xff3d6e, depthTest: false }));
    const armor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.08), new THREE.MeshBasicMaterial({ color: 0x3ec5ff, depthTest: false }));
    armor.position.y = -0.14;
    bg.renderOrder = 20;
    fill.renderOrder = 21;
    armor.renderOrder = 21;
    g.add(bg, fill, armor);
    scene.add(g);
    return { g, fill, armor };
  });

  // ---------- loot, projectiles, temp walls and fields (pooled / keyed)
  const lootViews = new Map<number, THREE.Object3D>();
  const lootModel = (kind: LootKind): THREE.Object3D => {
    const g = new THREE.Group();
    if (kind in GUN_MODEL) {
      const gun = buildGun(GUN_MODEL[kind as keyof typeof GUN_MODEL]).root;
      gun.scale.setScalar(1.6);
      gun.rotation.y = Math.PI / 2;
      g.add(gun);
    } else if (kind === 'armor') {
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.9, 0.35), mat(PALETTE.blue)));
    } else if (kind === 'medkit') {
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), mat(PALETTE.paper)));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3d6e })));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.4), new THREE.MeshBasicMaterial({ color: 0xff3d6e })));
    } else {
      g.add(mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(0x2b3045)));
      g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 })), 0, 0.42, 0));
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: kind === 'sniper' || kind === 'rockets' ? 0xff3d6e : 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.55;
    g.add(ring);
    return g;
  };
  const tracers = Array.from({ length: 90 }, () => {
    // A bright streak with a glowing core: reads as a bullet even from far away.
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.visible = false;
    scene.add(m);
    return m;
  });
  const lobs = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0x2b3045));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const tempWalls = Array.from({ length: 10 }, () => {
    const m = mesh(new THREE.BoxGeometry(1, 2.2, 1), mat(PALETTE.green));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const fields = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x3ec5ff, transparent: true, opacity: 0.22, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return m;
  });

  // ---------- input: keyboard; aim is automatic unless mouse aim is on
  const keys = new Set<string>();
  let aimMode: AimMode = opts.aimMode;
  let paused = false;
  /** The mouse on the canvas in normalised device coordinates, and the left button. */
  const mouse = new THREE.Vector2(0, 0);
  let mouseDown = false;
  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onMouseDown = (e: MouseEvent) => {
    sfx.unlock();
    if (e.button === 0) mouseDown = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false;
  };
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  const raycaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
  const aimHit = new THREE.Vector3();
  /** Where the mouse points on the battlefield, at chest height. */
  const mouseAim = () => {
    raycaster.setFromCamera(mouse, camera);
    return raycaster.ray.intersectPlane(aimPlane, aimHit) ? { x: aimHit.x, y: aimHit.z } : null;
  };
  let muted = sfx.muted;
  const onDown = (e: KeyboardEvent) => {
    sfx.unlock();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') muted = sfx.toggleMute();
    if (e.code === 'KeyT' && !e.repeat) aimMode = aimMode === 'auto' ? 'mouse' : 'auto';
    keys.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  const autoAim = (p: Player) => {
    let best: Player | null = null;
    let bd = AUTO_AIM_RANGE;
    for (const o of state.players) {
      if (o.id === p.id || !canSee(state, p, o)) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd && lineOfSight(state, p.x, p.y, o.x, o.y)) {
        best = o;
        bd = d;
      }
    }
    return best;
  };
  let lastMove = { x: 1, y: 0 };
  const readInput = (): Input => {
    const p = state.players[me];
    const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    if (mx || my) lastMove = { x: mx, y: my };
    const pointed = aimMode === 'mouse' && p.stage === 'ground' ? mouseAim() : null;
    const target = p.stage === 'ground' && !pointed ? autoAim(p) : null;
    const aim = pointed ?? (target ? { x: target.x, y: target.y } : { x: p.x + lastMove.x * 6, y: p.y + lastMove.y * 6 });
    return {
      mx, my,
      fire: keys.has('Space') || (aimMode === 'mouse' && mouseDown),
      jump: keys.has('Space'),
      super: keys.has('KeyQ'),
      use: keys.has('KeyE'),
      aimX: aim.x,
      aimY: aim.y,
    };
  };

  // ---------- events -> effects and sound
  const feed: { id: number; text: string; at: number }[] = [];
  let feedId = 0;
  let trauma = 0;
  const camX = () => camera.position.x;
  const handle = (e: GameEvent) => {
    switch (e.type) {
      case 'shot': {
        const d = Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y);
        if (e.weapon !== 'fists') {
          // Muzzle flash at the barrel, a brass casing kicked out to the side.
          const mx = e.x + Math.cos(e.angle) * 0.9;
          const my = e.y + Math.sin(e.angle) * 0.9;
          vfx.burst(mx, 1.15, 5, 'spark', { z: my, speed: 3, up: 0.5, gravity: 0, life: 0.07, size: 1.6 });
          vfx.burst(e.x - Math.sin(e.angle) * 0.4, 1.1, 1, 'ko', { z: e.y + Math.cos(e.angle) * 0.4, speed: 2.5, up: 3, gravity: 18, life: 0.6, size: 0.45 });
        }
        if (d < 60) {
          // Fists: a short swoosh. Rockets: the synthesised launch. Guns: recorded shots.
          if (e.weapon === 'fists') sfx.dash(e.x - camX());
          else if (e.weapon === 'rockets') sfx.shot('launcher', e.x - camX());
          else sfx.gunshot(SOUND[e.weapon], e.x - camX(), d);
        }
        if (e.owner === me && (e.weapon === 'shotgun' || e.weapon === 'sniper')) trauma = Math.min(1, trauma + 0.2);
        break;
      }
      case 'hit':
        vfx.burst(e.x, 1.1, 5 + Math.round(e.damage / 60), e.armor ? 'guard' : 'spark', { speed: 3, life: 0.3 });
        if (e.target === me) trauma = Math.min(1, trauma + 0.25);
        sfx.hit(Math.min(20, e.damage / 30), e.x - camX());
        hitFlash[e.target] = 0.08;
        break;
      case 'impact':
        vfx.burst(e.x, 1, 3, 'dust', { z: e.y,  speed: 2, up: 1, gravity: 6, life: 0.25, size: 0.7 });
        break;
      case 'explosion':
        vfx.burst(e.x, 1, 40, 'hot', { z: e.y,  speed: 9, up: 4, life: 0.6, size: 1.6 });
        vfx.burst(e.x, 1, 18, 'dust', { z: e.y,  speed: 4, up: 2, gravity: -1, life: 1, size: 2.4 });
        if (Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y) < 20) trauma = Math.min(1, trauma + 0.5);
        sfx.explosion(e.x - camX());
        break;
      case 'rackBroken':
        vfx.burst(e.x, 1, 20, 'spark', { z: e.y,  speed: 5, up: 3, life: 0.5 });
        sfx.glass(e.x - camX());
        break;
      case 'super':
        vfx.ring(e.x, 0.2, 0xffd23f, { grow: 8, life: 0.4, z: e.y, flat: true });
        sfx.push(e.x - camX());
        break;
      case 'pickup':
        if (e.player === me) sfx.pickup();
        break;
      case 'land':
        vfx.burst(e.x, 0.2, 12, 'dust', { z: e.y,  speed: 3, up: 1, gravity: 4, life: 0.4 });
        if (e.player === me) sfx.land();
        break;
      case 'ko': {
        const v = state.players[e.victim];
        const by = e.by !== null ? state.players[e.by] : null;
        feed.push({ id: feedId++, text: by ? `${by.name} ⟶ ${v.name}` : `${v.name} missed the Deadline`, at: time });
        vfx.burst(e.x, 1, 30, 'ko', { z: e.y,  speed: 7, up: 4, life: 0.8 });
        sfx.ko(e.x - camX());
        if (e.victim === me || e.by === me) trauma = 1;
        break;
      }
      case 'zone':
        if (e.state === 'shrink') sfx.drop();
        break;
      case 'win':
        sfx.start();
        break;
    }
  };
  const hitFlash = state.players.map(() => 0);

  // ---------- minimap
  const mm = opts.minimap;
  const mmCtx = mm.getContext('2d')!;
  const mmBase = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE * 4;
    const g = c.getContext('2d')!;
    for (let ty = 0; ty < SIZE; ty++) {
      for (let tx = 0; tx < SIZE; tx++) {
        const t = MAP[ty][tx];
        g.fillStyle =
          t === '#' || t === 'w' ? '#e8dcc4' : t === '.' || t === 'l' ? '#b89a72' : t === 't' ? '#2f6a32' : t === 'b' ? '#4f9a48'
            : t === 'c' ? '#c9c06a' : t === 'k' ? '#8a8a8a' : t === 'a' ? '#4a4f5e' : t === 'p' ? '#a8865a' : t === 'f' ? '#7a5a3a' : '#5a9a50';
        g.fillRect(tx * 4, ty * 4, 4, 4);
      }
    }
    return c;
  })();
  const drawMinimap = () => {
    const s = mm.width / WORLD;
    mmCtx.drawImage(mmBase, 0, 0, mm.width, mm.height);
    const z = state.zone;
    mmCtx.strokeStyle = 'rgba(47,140,255,0.95)';
    mmCtx.lineWidth = 2;
    mmCtx.beginPath();
    mmCtx.arc(z.cx * s, z.cy * s, z.r * s, 0, Math.PI * 2);
    mmCtx.stroke();
    if (z.state !== 'done') {
      mmCtx.strokeStyle = 'rgba(255,255,255,0.8)';
      mmCtx.lineWidth = 1;
      mmCtx.beginPath();
      mmCtx.arc(z.toX * s, z.toY * s, Math.max(0.5, z.toR) * s, 0, Math.PI * 2);
      mmCtx.stroke();
    }
    if (state.phase === 'drop') {
      const d = state.drone;
      mmCtx.strokeStyle = 'rgba(255,210,63,0.6)';
      mmCtx.setLineDash([4, 4]);
      mmCtx.beginPath();
      mmCtx.moveTo(d.x0 * s, d.y0 * s);
      mmCtx.lineTo(d.x1 * s, d.y1 * s);
      mmCtx.stroke();
      mmCtx.setLineDash([]);
    }
    const self = state.players[me];
    // Only you on the map: never where the others are.
    mmCtx.save();
    mmCtx.translate(self.x * s, self.y * s);
    mmCtx.rotate(self.heading);
    mmCtx.fillStyle = '#3ddc84';
    mmCtx.beginPath();
    mmCtx.moveTo(6, 0);
    mmCtx.lineTo(-4, -4);
    mmCtx.lineTo(-4, 4);
    mmCtx.fill();
    mmCtx.restore();
  };

  // ---------- render
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };

  const prev = state.players.map((p) => ({ x: p.x, y: p.y }));
  const camFocus = new THREE.Vector3(state.players[me].x, 0, state.players[me].y);
  const camPos = new THREE.Vector3(state.drone.x0, DROP.height + 20, state.drone.y0 + 30);
  const camLook = new THREE.Vector3(state.drone.x0, DROP.height, state.drone.y0);
  let time = 0;
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const setFlash = (rig: Rig, on: boolean) =>
    rig.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (on && !o.userData.orig) {
        o.userData.orig = o.material;
        o.material = WHITE;
      } else if (!on && o.userData.orig) {
        o.material = o.userData.orig;
        o.userData.orig = undefined;
      }
    });

  const renderFrame = (dt: number, alpha: number) => {
    resize();
    const self = state.players[me];
    const droneX = state.drone.x0 + (state.drone.x1 - state.drone.x0) * state.drone.t;
    const droneY = state.drone.y0 + (state.drone.y1 - state.drone.y0) * state.drone.t;
    drone.visible = state.phase === 'drop' && state.drone.t < 1;
    drone.position.set(droneX, DROP.height, droneY);
    drone.rotation.y = -Math.atan2(state.drone.y1 - state.drone.y0, state.drone.x1 - state.drone.x0);
    drone.children.forEach((c) => c.userData.rotor && (c.rotation.x += dt * 40));

    state.players.forEach((p, i) => {
      const rig = rigs[i];
      const x = prev[i].x + (p.x - prev[i].x) * alpha;
      const y = prev[i].y + (p.y - prev[i].y) * alpha;
      const visible = p.alive && p.stage !== 'drone' && (i === me || p.stage === 'falling' || canSee(state, self, p));
      rig.root.visible = visible;
      const chuteOpen = p.stage === 'falling' && p.fall <= DROP.chute;
      chutes[i].visible = visible && chuteOpen;
      // Free fall from the plane down to chute height, then drift slowly under the canopy.
      let h = 0;
      if (p.stage === 'falling') {
        h = chuteOpen
          ? 1 + (DROP.chuteHeight - 1) * (p.fall / DROP.chute)
          : DROP.chuteHeight + (DROP.height - DROP.chuteHeight) * ((p.fall - DROP.chute) / DROP.freefall);
      }
      rig.root.position.set(x, h, y);
      const speed = Math.hypot(p.x - prev[i].x, p.y - prev[i].y) / DT;
      poseRig(rig, {
        dt, time, vx: p.stage === 'ground' ? speed : 0, vy: 0, onGround: p.stage === 'ground', facing: 1, aim: 0, sideways: false,
        wall: 0, dashing: p.dashTime > 0, stunned: false, twoHanded: p.weapon !== 'pistol' && p.weapon !== 'fists',
        sinceShot: p.cooldown > 0 ? 0.05 : 1, recoil: 0.5, reloading: false, pushing: 0,
      });
      rig.root.rotation.y = Math.PI / 2 - p.heading;
      if (p.stage === 'falling' && !chuteOpen) rig.body.rotation.x = 1.2; // spread out, head first
      // Your own fighter turns see-through inside plants, so you know you're hidden.
      rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.orig) o.visible = true;
      });
      hitFlash[i] = Math.max(0, hitFlash[i] - dt);
      setFlash(rig, hitFlash[i] > 0);
      rig.root.updateMatrixWorld(true);
      if (chutes[i].visible) {
        chutes[i].position.set(x, h + 5.2, y);
        chutes[i].rotation.z = Math.sin(time * 1.3 + i) * 0.08;
      }

      // Gun in hand.
      if (gunKinds[i] !== p.weapon) {
        if (guns[i]) scene.remove(guns[i]!);
        guns[i] = p.weapon === 'fists' ? null : buildGun(GUN_MODEL[p.weapon]).root;
        if (guns[i]) scene.add(guns[i]!);
        gunKinds[i] = p.weapon;
      }
      const gun = guns[i];
      if (gun) {
        rig.hand.getWorldPosition(tmpV);
        rig.hand.getWorldQuaternion(tmpQ);
        gun.position.copy(tmpV);
        gun.quaternion.copy(tmpQ);
        gun.visible = visible && p.stage === 'ground';
      }

      // Health bar over the head, facing the camera.
      const bar = bars[i];
      bar.g.visible = visible && p.stage === 'ground';
      bar.g.position.set(x, 2.7, y);
      bar.g.quaternion.copy(camera.quaternion);
      const k = Math.max(0.001, p.hp / p.maxHp);
      bar.fill.scale.x = k;
      bar.fill.position.x = -0.8 * (1 - k);
      const a = Math.max(0.001, p.armor / 500);
      bar.armor.scale.x = a;
      bar.armor.position.x = -0.8 * (1 - a);
      bar.armor.visible = p.armor > 0;
    });
    world.update(state, self.x, self.y);

    // Loot.
    const seen = new Set<number>();
    for (const l of state.loot) {
      seen.add(l.id);
      let v = lootViews.get(l.id);
      if (!v) {
        v = lootModel(l.kind);
        scene.add(v);
        lootViews.set(l.id, v);
      }
      v.position.set(l.x, 0.6 + Math.sin(time * 3 + l.id) * 0.08, l.y);
      v.rotation.y = time * 0.8 + l.id;
    }
    for (const [id, v] of lootViews) {
      if (!seen.has(id)) {
        scene.remove(v);
        lootViews.delete(id);
      }
    }

    // Projectiles.
    let t = 0;
    let lb = 0;
    for (const pr of state.projectiles) {
      if (pr.kind === 'bullet') {
        const m = tracers[t++];
        if (!m) continue;
        m.visible = true;
        m.position.set(pr.x, 1.1, pr.y);
        m.rotation.set(0, -Math.atan2(pr.vy, pr.vx), 0);
      } else {
        const m = lobs[lb++];
        if (!m) continue;
        m.visible = true;
        m.position.set(pr.x, 1 + 4 * pr.t * (1 - pr.t) * 5, pr.y);
      }
    }
    for (; t < tracers.length; t++) tracers[t].visible = false;
    for (; lb < lobs.length; lb++) lobs[lb].visible = false;
    tempWalls.forEach((m, i) => {
      const w = state.walls[i];
      m.visible = !!w;
      if (w) {
        m.position.set(w.x, 1.1, w.y);
        m.scale.set(w.w, 1, w.h);
      }
    });
    fields.forEach((m, i) => {
      const f = state.fields[i];
      m.visible = !!f;
      if (f) {
        m.position.set(f.x, 0.05, f.y);
        m.scale.setScalar(f.r);
      }
    });

    // The Deadline.
    const z = state.zone;
    zoneWall.position.set(z.cx, 15, z.cy);
    zoneWall.scale.set(Math.max(0.01, z.r), 1, Math.max(0.01, z.r));
    nextRing.visible = z.state !== 'done' && state.phase !== 'drop';
    nextRing.position.set(z.toX, 0.06, z.toY);
    nextRing.scale.setScalar(Math.max(0.5, z.toR));

    // Camera: chase the plane from behind, follow the fall from above, and on the ground sit
    // high and far so the fighters read small and you see what's coming.
    const shake = trauma * trauma;
    const n = (f: number, ph: number) => Math.sin(time * f + ph) * 0.6 + Math.sin(time * f * 2.3 + ph) * 0.4;
    const kf = 1 - Math.exp(-3 * dt);
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (self.stage === 'drone' && state.phase === 'drop') {
      const dirX = state.drone.x1 - state.drone.x0;
      const dirY = state.drone.y1 - state.drone.y0;
      const len = Math.hypot(dirX, dirY) || 1;
      want = new THREE.Vector3(droneX - (dirX / len) * 34 + (dirY / len) * 10, DROP.height + 14, droneY - (dirY / len) * 34 - (dirX / len) * 10);
      look = new THREE.Vector3(droneX + (dirX / len) * 10, DROP.height - 8, droneY + (dirY / len) * 10);
    } else if (self.stage === 'falling') {
      const hh = self.fall <= DROP.chute ? 1 + (DROP.chuteHeight - 1) * (self.fall / DROP.chute) : DROP.chuteHeight + 10;
      want = new THREE.Vector3(self.x, hh + 22, self.y + 22);
      look = new THREE.Vector3(self.x, hh * 0.4, self.y);
    } else {
      want = new THREE.Vector3(self.x, 36, self.y + 22);
      look = new THREE.Vector3(self.x, 0, self.y + 1);
    }
    camPos.lerp(want, self.stage === 'ground' ? 1 - Math.exp(-6 * dt) : kf);
    camLook.lerp(look, self.stage === 'ground' ? 1 - Math.exp(-6 * dt) : kf);
    camera.position.set(camPos.x + n(23, 1) * 0.5 * shake, camPos.y, camPos.z + n(19, 4) * 0.4 * shake);
    camera.lookAt(camLook);
    camFocus.set(camLook.x, 0, camLook.z);
    trauma = Math.max(0, trauma - dt * 1.5);
    sun.position.set(camFocus.x - 20, 60, camFocus.z + 14);
    sun.target.position.set(camFocus.x, 0, camFocus.z);

    vfx.update(dt);
    renderer.render(scene, camera);
  };

  // ---------- HUD
  let fps = 60;
  const emitHud = () => {
    const self = state.players[me];
    const z = state.zone;
    const outside = self.alive && Math.hypot(self.x - z.cx, self.y - z.cy) > z.r;
    const zone =
      state.phase === 'drop'
        ? self.stage === 'drone'
          ? { label: 'Jump with Space', seconds: Math.ceil((1 - state.drone.t) * DROP.flight), outside: false }
          : { label: 'Everyone is landing', seconds: 0, outside: false }
        : z.state === 'wait'
          ? { label: 'Deadline moves in', seconds: Math.ceil(z.timer), outside }
          : z.state === 'shrink'
            ? { label: 'Deadline closing', seconds: Math.ceil(z.timer), outside }
            : { label: 'Final Deadline', seconds: 0, outside };
    const k = self.stage === 'ground' ? lootUnder(state, self) : null;
    const prompt = !self.alive
      ? null
      : self.stage === 'drone'
        ? 'Space · jump'
        : k
          ? `E · pick up ${LOOT_NAME[k.kind]}`
          : self.item
            ? `E · use ${self.item === 'bomb' ? 'bomb' : 'med kit'}`
            : null;
    opts.onHud({
      phase: state.phase,
      stage: self.stage,
      alive: state.players.filter((p) => p.alive).length,
      hp: Math.max(0, self.hp),
      maxHp: self.maxHp,
      armor: self.armor,
      weapon: WEAPONS[self.weapon].name,
      ammo: self.ammo,
      item: self.item,
      superCharge: self.superCharge,
      superName: FIGHTERS[self.fighter].superName,
      fighter: self.fighter,
      zone,
      feed: feed.filter((f) => time - f.at < 6).map(({ id, text }) => ({ id, text })),
      prompt,
      dead: !self.alive,
      placement: self.placement,
      kills: self.kills,
      damage: Math.round(self.damage),
      won: state.winner === me,
      fps: Math.round(fps),
      muted,
      aimMode,
      paused,
    });
  };

  // ---------- loop
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let hudTimer = 0;
  let mmTimer = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    // Paused (offline only): the world freezes, the camera and effects keep drawing.
    acc = paused ? 0 : acc + dt;
    while (acc >= DT) {
      state.players.forEach((p, i) => Object.assign(prev[i], { x: p.x, y: p.y }));
      const inputs = state.players.map((p) => (p.id === me ? (p.alive ? readInput() : NO_INPUT) : bots[p.id]!(state)));
      step(state, inputs);
      state.events.forEach(handle);
      acc -= DT;
    }
    renderFrame(dt, acc / DT);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      emitHud();
    }
    mmTimer -= dt;
    if (mmTimer <= 0) {
      mmTimer = 0.1;
      drawMinimap();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  if (process.env.NODE_ENV !== 'production') (window as unknown as { __lcs?: unknown }).__lcs = { state: () => state };

  return {
    setPaused: (on: boolean) => {
      paused = on;
      keys.clear();
      mouseDown = false;
      emitHud();
    },
    setAimMode: (m: AimMode) => {
      aimMode = m;
      emitHud();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
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

export { SUPERS, ZONE_PHASES };
