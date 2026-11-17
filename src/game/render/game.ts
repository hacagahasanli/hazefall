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
}

export interface MatchOptions {
  fighter: FighterId;
  name: string;
  minimap: HTMLCanvasElement;
  onHud: (hud: HudState) => void;
}

const GUN_MODEL: Record<Exclude<WeaponKind, 'fists'>, GunKind> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'smg', sniper: 'railgun', rockets: 'launcher',
};
const SOUND: Record<WeaponKind, 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi'> = {
  fists: 'uzi', pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'pistol', sniper: 'railgun', rockets: 'launcher',
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
  scene.background = new THREE.Color(0x10142a);
  scene.fog = new THREE.Fog(0x10142a, 90, 220);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);

  const state: GameState = createGame(opts.fighter, randomSeed(), opts.name);
  const me = 0;
  const bots = state.players.map((p) => (p.bot ? createBot(p.id, randomSeed()) : null));
  const sfx = createSfx();
  const vfx = createVfx(scene);

  // ---------- light
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x404660, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  scene.add(sun, sun.target);

  // ---------- the campus floor, painted from the map
  const floorTex = (() => {
    const px = 16;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE * px;
    const g = c.getContext('2d')!;
    for (let ty = 0; ty < SIZE; ty++) {
      for (let tx = 0; tx < SIZE; tx++) {
        const t = MAP[ty][tx];
        g.fillStyle = t === ',' || t === 's' ? '#2d3247' : t === 'b' ? '#2f6b4a' : '#c9cfdb';
        g.fillRect(tx * px, ty * px, px, px);
        if (t === '.' || t === 'l' || t === 'r') {
          g.strokeStyle = 'rgba(0,0,0,0.06)';
          g.strokeRect(tx * px + 0.5, ty * px + 0.5, px - 1, px - 1);
        }
      }
    }
    // Street markings between blocks.
    g.strokeStyle = 'rgba(255,210,63,0.35)';
    g.setLineDash([6, 8]);
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const k = (1 + i * 12) * px + px / 2;
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, SIZE * px);
      g.moveTo(0, k);
      g.lineTo(SIZE * px, k);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(WORLD / 2, 0, WORLD / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x0c1022 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD / 2, -0.05, WORLD / 2);
  scene.add(ground);

  // ---------- walls, plants and racks as instanced meshes
  const tiles = (c: string) => {
    const out: { x: number; y: number }[] = [];
    MAP.forEach((row, ty) => [...row].forEach((t, tx) => t === c && out.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 })));
    return out;
  };
  const m4 = new THREE.Matrix4();
  const wallTiles = tiles('#');
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 2.6, TILE), mat(PALETTE.lilac), wallTiles.length);
  wallTiles.forEach((t, i) => walls.setMatrixAt(i, m4.makeTranslation(t.x, 1.3, t.y)));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(walls);
  const wallTops = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.06, TILE), mat(PALETTE.inkSoft), wallTiles.length);
  wallTiles.forEach((t, i) => wallTops.setMatrixAt(i, m4.makeTranslation(t.x, 2.63, t.y)));
  scene.add(wallTops);

  const plantTiles = tiles('b');
  const plantMat = new THREE.MeshStandardMaterial({ color: PALETTE.green, flatShading: true, roughness: 0.9, transparent: true, opacity: 0.92 });
  const plants = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 0), plantMat, plantTiles.length);
  plantTiles.forEach((t, i) => plants.setMatrixAt(i, new THREE.Matrix4().compose(v3(t.x, t.y, 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.x * 3 + t.y, 0)), new THREE.Vector3(1, 0.75, 1))));
  plants.castShadow = true;
  scene.add(plants);

  const rackTiles: { x: number; y: number; i: number }[] = [];
  MAP.forEach((row, ty) => [...row].forEach((t, tx) => t === 'r' && rackTiles.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, i: ty * SIZE + tx })));
  const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 2, 1.2), mat(PALETTE.ink), rackTiles.length);
  const rackLights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.62, 0.08, 1.22), new THREE.MeshBasicMaterial({ color: 0x3ddc84 }), rackTiles.length);
  const setRack = (k: number, alive: boolean) => {
    const t = rackTiles[k];
    racks.setMatrixAt(k, alive ? m4.makeTranslation(t.x, 1, t.y) : m4.makeScale(0, 0, 0));
    rackLights.setMatrixAt(k, alive ? m4.makeTranslation(t.x, 1.5, t.y) : m4.makeScale(0, 0, 0));
  };
  rackTiles.forEach((_, k) => setRack(k, true));
  racks.castShadow = true;
  scene.add(racks, rackLights);
  const rackAlive = rackTiles.map(() => true);

  // District names painted on the ground.
  for (const d of DISTRICTS) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.font = 'bold 54px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.name.toUpperCase(), 256, 48);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2;
    label.position.set((d.x0 + d.x1) / 2, 0.03, d.y1 + 0.6);
    scene.add(label);
  }

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
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
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

  // ---------- input: keyboard; aim is automatic
  const keys = new Set<string>();
  let muted = sfx.muted;
  const onDown = (e: KeyboardEvent) => {
    sfx.unlock();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') muted = sfx.toggleMute();
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
    const target = p.stage === 'ground' ? autoAim(p) : null;
    const aim = target ? { x: target.x, y: target.y } : { x: p.x + lastMove.x * 6, y: p.y + lastMove.y * 6 };
    return {
      mx, my,
      fire: keys.has('Space'),
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
        if (d < 40) sfx.shot(SOUND[e.weapon], e.x - camX());
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
        g.fillStyle = t === '#' ? '#8b93ad' : t === 'b' ? '#2f6b4a' : t === ',' || t === 's' ? '#1c2136' : '#3a4060';
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
    plantMat.opacity = inPlant(self.x, self.y) && self.stage === 'ground' ? 0.45 : 0.92;

    // Racks broken since last frame.
    rackTiles.forEach((t, k) => {
      const alive = state.racks[t.i] > 0;
      if (alive !== rackAlive[k]) {
        rackAlive[k] = alive;
        setRack(k, alive);
        racks.instanceMatrix.needsUpdate = true;
        rackLights.instanceMatrix.needsUpdate = true;
      }
    });

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
        ? { label: 'Jump with Space', seconds: Math.ceil((1 - state.drone.t) * DROP.flight), outside: false }
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
    acc += dt;
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
    dispose: () => {
      cancelAnimationFrame(raf);
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
