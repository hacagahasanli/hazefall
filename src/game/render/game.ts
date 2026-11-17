import * as THREE from 'three';

import { createSfx } from '../sfx';

import type { VolumeKind } from '../sfx';
import { createBot } from '../sim/bot';
import { ARMOR, BUILDINGS, DISTRICTS, DROP, DT, fallHeight, FIGHTERS, ITEMS, MAP, SIZE, SUPERS, TILE, VAULT, WEAPONS, WORLD, ZONE_PHASES } from '../sim/constants';
import { canSee, createGame, inPlant, lineOfSight, lootUnder, step, throwDistance } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import { buildRig, poseChute, poseFreefall, poseRig, poseTopDown } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';
import { createVfx } from './vfx';
import { setPeople } from './nature';
import { buildChute, HARNESS_BACK } from './chute';
import { paintMapImage } from './mapImage';
import { buildPlane } from './plane';
import { buildProps } from './props';
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
  /** Rounds in the magazine and spare; Infinity for fists. */
  mag: number;
  ammo: number;
  /** 0..1 while reloading, else null. */
  reloading: number | null;
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
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper', rockets: 'launcher',
};
/** Loot rarity colours: common white, uncommon green, rare blue, epic violet. */
const RARITY: Record<LootKind, number> = {
  pistol: 0xe8eef7, medkit: 0xe8eef7,
  smg: 0x3ddc84, shotgun: 0x3ddc84, bomb: 0x3ddc84,
  rifle: 0x3ec5ff, armor: 0x3ec5ff, ammo: 0x3ddc84,
  sniper: 0xc77dff, rockets: 0xc77dff,
};

/** A soft round glow, drawn once, shared by every loot spot. */
const glowTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();
/** A vertical beam that fades upwards. */
const beamGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.22, 0.32, 2.6, 12, 1, true);
  g.translate(0, 1.3, 0);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - pos.getY(i) / 2.6;
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
const SOUND: Record<Exclude<WeaponKind, 'fists' | 'rockets'>, 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper'> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper',
};
const LOOT_NAME: Record<LootKind, string> = {
  pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper', rockets: 'Rockets',
  armor: 'Armor vest', medkit: 'Med kit', bomb: 'Bomb', ammo: 'Ammo box',
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
  // Cars, containers, tents, the windmill, the pond, animals and birds.
  const props = buildProps(scene);

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
  const drone = buildPlane();
  scene.add(drone);

  // ---------- clouds: a broken layer between the plane and the ground; you fall through it
  const clouds = new THREE.Group();
  let cloudMat: THREE.MeshStandardMaterial;
  {
    const puff = new THREE.IcosahedronGeometry(1, 1);
    cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92, depthWrite: true });
    const rnd = (() => {
      let k = 4242;
      return () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646;
    })();
    const parts: THREE.Matrix4[] = [];
    for (let c = 0; c < 70; c++) {
      // Spread wider than the map so the edges don't show from the plane.
      const cx = -60 + rnd() * (WORLD + 120);
      const cz = -60 + rnd() * (WORLD + 120);
      const cy = DROP.cloudLow + 3 + rnd() * (DROP.cloudHigh - DROP.cloudLow - 6);
      const size = 5 + rnd() * 7;
      for (let i = 0; i < 7; i++) {
        const s = size * (0.45 + rnd() * 0.55);
        parts.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(cx + (rnd() - 0.5) * size * 2.4, cy + (rnd() - 0.3) * size * 0.4, cz + (rnd() - 0.5) * size * 1.6),
            new THREE.Quaternion(),
            new THREE.Vector3(s, s * 0.55, s),
          ),
        );
      }
    }
    const im = new THREE.InstancedMesh(puff, cloudMat, parts.length);
    parts.forEach((m, i) => im.setMatrixAt(i, m));
    clouds.add(im);
  }
  scene.add(clouds);

  // ---------- players
  const rigs: Rig[] = state.players.map((p) => {
    const r = buildRig(p.fighter);
    scene.add(r.root);
    return r;
  });
  // Parachutes hang from a point at the jumper's raised hands (see chute.ts).
  const chutes = state.players.map((p) => {
    const g = buildChute(FIGHTERS[p.fighter].color);
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
    // Root sits on the ground; `item` floats and turns (see the loot loop), `glow` pulses.
    const g = new THREE.Group();
    const item = new THREE.Group();
    item.name = 'item';
    const color = RARITY[kind];
    if (kind in GUN_MODEL) {
      const gun = buildGun(GUN_MODEL[kind as keyof typeof GUN_MODEL]).root;
      gun.scale.setScalar(1.7);
      // Tilted up so the whole silhouette shows from the high camera.
      gun.rotation.set(-0.5, Math.PI / 2, 0);
      item.add(gun);
    } else if (kind === 'armor') {
      const vest = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.85 });
      const strap = new THREE.MeshStandardMaterial({ color: 0x2a2f24, roughness: 0.9 });
      const body = mesh(new THREE.BoxGeometry(0.75, 0.85, 0.3), vest);
      const collar = mesh(new THREE.BoxGeometry(0.4, 0.12, 0.32), strap);
      collar.position.y = 0.45;
      const plate = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.06), mat(0x3a4a2e));
      plate.position.set(0, 0.05, 0.17);
      const pouches = [-0.22, 0, 0.22].map((x) => at(mesh(new THREE.BoxGeometry(0.17, 0.2, 0.08), strap), x, -0.25, 0.18));
      item.add(body, collar, plate, ...pouches);
      item.rotation.x = -0.6;
    } else if (kind === 'medkit') {
      const caseM = mesh(new THREE.BoxGeometry(0.7, 0.42, 0.24), mat(0xf1ede4));
      const handle = mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), mat(0x2a2f38));
      handle.position.y = 0.25;
      const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xd8312a }));
      const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: 0xd8312a }));
      crossA.position.z = crossB.position.z = 0.13;
      item.add(caseM, handle, crossA, crossB);
      item.rotation.x = -0.6;
    } else if (kind === 'ammo') {
      // A green metal ammo can with a handle and stencil band.
      const can = mesh(new THREE.BoxGeometry(0.62, 0.4, 0.3), mat(0x4f5a34));
      const lid = mesh(new THREE.BoxGeometry(0.64, 0.06, 0.32), mat(0x3e4828));
      lid.position.y = 0.23;
      const handle = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), mat(0x2a2f24));
      handle.position.y = 0.29;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.01), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      band.position.set(0, 0.02, 0.156);
      item.add(can, lid, handle, band);
      item.rotation.x = -0.5;
    } else {
      const bomb = buildGun('bomb').root;
      bomb.scale.setScalar(2.4);
      item.add(bomb);
    }
    item.position.y = 0.75;
    g.add(item);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.name = 'glow';
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    const beam = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    g.add(glow, beam);
    return g;
  };
  // Bullets: a brass round with a copper tip, and a short faint heat trail behind it.
  const bulletGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8).rotateZ(Math.PI / 2);
  const tipGeo = new THREE.ConeGeometry(0.055, 0.12, 8).rotateZ(-Math.PI / 2).translate(0.21, 0, 0);
  const trailGeo = new THREE.BoxGeometry(1, 0.035, 0.035).translate(-0.65, 0, 0);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a046, metalness: 0.7, roughness: 0.3, emissive: 0x3a2a08 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb8653a, metalness: 0.7, roughness: 0.35, emissive: 0x2a1006 });
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = Array.from({ length: 90 }, () => {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(bulletGeo, brass), new THREE.Mesh(tipGeo, copper), new THREE.Mesh(trailGeo, trailMat));
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

  // ---------- throw preview: while you hold a rocket or a bomb, a dotted arc and a red landing
  // circle the size of the blast show where it will come down
  const arcDots = Array.from({ length: 22 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a3d, transparent: true, opacity: 0.85 }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3d3d, transparent: true, opacity: 0.9, depthWrite: false }));
  const landDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3d3d, transparent: true, opacity: 0.2, depthWrite: false }));
  landRing.visible = landDisc.visible = false;
  scene.add(landRing, landDisc);
  const updateThrowPreview = (self: Player, x: number, y: number) => {
    const on = self.alive && self.stage === 'ground' && self.charging !== null;
    landRing.visible = landDisc.visible = on;
    arcDots.forEach((d) => (d.visible = on));
    if (!on) return;
    const range = self.charging === 'bomb' ? ITEMS.bomb.range : WEAPONS[self.weapon].range;
    const radius = self.charging === 'bomb' ? ITEMS.bomb.radius : WEAPONS[self.weapon].lob?.radius ?? 2;
    const d = throwDistance(self.charge, range);
    const tx = x + Math.cos(self.heading) * d;
    const ty = y + Math.sin(self.heading) * d;
    // The same arc the projectile flies (see the lob drawing below).
    arcDots.forEach((dot, k) => {
      const t = (k + 1) / (arcDots.length + 1);
      dot.position.set(x + (tx - x) * t, 1 + 4 * t * (1 - t) * 5, y + (ty - y) * t);
    });
    const pulse = 1 + Math.sin(time * 10) * 0.04;
    landRing.position.set(tx, 0.08, ty);
    landDisc.position.set(tx, 0.07, ty);
    landRing.scale.setScalar(radius * pulse);
    landDisc.scale.setScalar(radius * pulse);
  };

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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'KeyF', 'KeyG', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') muted = sfx.toggleMute();
    if (e.code === 'KeyT' && !e.repeat) aimMode = aimMode === 'auto' ? 'mouse' : 'auto';
    keys.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  /**
   * Auto-aim: anyone you can see on your screen, in any direction (whichever way you're running or
   * facing), with a clear line to them; the nearest wins. Out of sight behind a wall or hidden in
   * plants, no.
   */
  const onScreen = new THREE.Vector3();
  /** A clear shot at any part of them: the centre or either shoulder (a trunk or a car corner
   * on the centre line shouldn't hide someone whose body you can see). */
  const clearShot = (p: Player, o: Player) => {
    const d = Math.hypot(o.x - p.x, o.y - p.y) || 1;
    const sx = (-(o.y - p.y) / d) * 0.45;
    const sy = ((o.x - p.x) / d) * 0.45;
    return [0, 1, -1].some((k) => lineOfSight(state, p.x, p.y, o.x + sx * k, o.y + sy * k));
  };
  let aimTarget: Player | null = null;
  const autoAim = (p: Player) => {
    let best: Player | null = null;
    let bd = Infinity;
    for (const o of state.players) {
      if (o.id === p.id || !canSee(state, p, o)) continue;
      // Anywhere on your screen, and a little past its edges.
      onScreen.set(o.x, 1, o.y).project(camera);
      if (Math.abs(onScreen.x) > 1.25 || Math.abs(onScreen.y) > 1.25 || onScreen.z > 1) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd && clearShot(p, o)) {
        best = o;
        bd = d;
      }
    }
    aimTarget = best;
    return best;
  };
  // A red reticle on the ground under whoever auto-aim has picked.
  const reticle = new THREE.Group();
  {
    const red = new THREE.MeshBasicMaterial({ color: 0xff3d3d, transparent: true, opacity: 0.9, depthWrite: false });
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 40).rotateX(-Math.PI / 2), red));
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.45).rotateX(-Math.PI / 2), red);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
      tick.rotation.y = -a + Math.PI / 2;
      reticle.add(tick);
    }
    reticle.visible = false;
    scene.add(reticle);
  }
  let lastMove = { x: 1, y: 0 };
  const readInput = (): Input => {
    const p = state.players[me];
    const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    // Facing with no target: the direction you're actually moving (the velocity turns smoothly);
    // standing still, a tapped key turns you; after stopping you keep facing where you went.
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.8) lastMove = { x: p.vx / sp, y: p.vy / sp };
    else if (mx || my) lastMove = { x: mx, y: my };
    // On the ground or under the parachute you aim (and auto-aim) at people.
    const canAim = p.stage === 'ground' || (p.stage === 'falling' && p.fall <= DROP.chute);
    const pointed = aimMode === 'mouse' && canAim ? mouseAim() : null;
    const target = canAim && !pointed ? autoAim(p) : null;
    const aim = pointed ?? (target ? { x: target.x, y: target.y } : { x: p.x + lastMove.x * 6, y: p.y + lastMove.y * 6 });
    return {
      mx, my,
      fire: keys.has('Space') || (aimMode === 'mouse' && mouseDown),
      jump: keys.has('Space'),
      // Battle-royale keys: Q / E lean, F picks up or uses, G is the super.
      super: keys.has('KeyG'),
      use: keys.has('KeyF'),
      lean: (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0),
      reload: keys.has('KeyR'),
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
        lastShot[e.owner] = time;
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
        vfx.burst(e.x, 1.1, 5 + Math.round(e.damage / 60), e.armor ? 'guard' : 'spark', { z: e.y, speed: 3, life: 0.3 });
        // Damage numbers for the hits you land, and for the ones you take.
        if (e.by === me || e.target === me) popDamage(e.target, e.x, e.y, e.damage, e.target === me ? 'taken' : e.ko ? 'ko' : e.armor ? 'armor' : 'dealt');
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
      case 'reload':
        sfx.reloadAt(e.weapon, e.x - camX(), e.player === me ? 0 : Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y));
        break;
      case 'dryFire':
        if (e.player === me) sfx.dryFire();
        break;
      case 'vault':
        sfx.vault(e.x - camX(), e.player === me ? 0 : Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y));
        vfx.burst(e.x, 0.3, 6, 'dust', { z: e.y, speed: 2, up: 1, gravity: 5, life: 0.35, size: 0.6 });
        break;
      case 'pickup':
        if (e.player === me) sfx.pickup();
        break;
      case 'land':
        landAt[e.player] = time;
        dropChute(e.player, e.x, e.y);
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
  const steps = state.players.map(() => 0);
  const surfaceAt = (x: number, y: number) => {
    const t = MAP[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] ?? 'g';
    return t === 'a' ? 'hard' : '.lud'.includes(t) ? 'wood' : t === 'p' ? 'dirt' : 'bch'.includes(t) ? 'leaves' : 'grass';
  };
  /** Visual yaw per player (angle and angular velocity) and when each last fired. */
  const yaw = state.players.map((p) => ({ a: p.heading, v: 0 }));
  const lastShot: number[] = [];
  const chuteAt: number[] = [];
  const harness = new THREE.Vector3();
  /** When each player touched down (for the landing roll), and the canopies left on the ground. */
  const landAt: number[] = [];
  const ROLL_TIME = 0.75;
  const groundChutes: { g: THREE.Group; t: number; dir: number }[] = [];
  const dropChute = (i: number, x: number, y: number) => {
    const p = state.players[i];
    const g = chutes[i].clone(true);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
      if (o.userData.line) o.visible = false;
    });
    g.visible = true;
    g.position.set(x, 1, y);
    g.userData.from = { x, y };
    scene.add(g);
    groundChutes.push({ g, t: 0, dir: Math.hypot(p.vx, p.vy) > 0.3 ? Math.atan2(p.vy, p.vx) : p.heading + Math.PI });
  };
  /** The canopy settles down behind you, lies there a while, then fades. */
  const updateGroundChutes = (dt: number) => {
    for (let k = groundChutes.length - 1; k >= 0; k--) {
      const c = groundChutes[k];
      c.t += dt;
      // It drifts on a few metres with the wind and sinks, flattening out as it lands.
      const fall = Math.min(1, c.t / 1.4);
      const e = 1 - (1 - fall) * (1 - fall);
      const from = c.g.userData.from as { x: number; y: number };
      // It drifts on a couple of metres and folds into a long, narrow strip of fabric lying behind
      // you (about 3 x 1.3 m, the long side along the way you came), not a big round sheet.
      c.g.position.set(from.x + Math.cos(c.dir) * 2.2 * e, 1 - e, from.y + Math.sin(c.dir) * 2.2 * e);
      c.g.rotation.set(0, -c.dir, (1 - e) * 0.3);
      c.g.scale.set(1 - e * 0.42, 1 - e * 0.95, 1 - e * 0.75);
      const fade = c.t > 8 ? 1 - (c.t - 8) / 2 : 1;
      c.g.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).opacity = Math.max(0, fade);
      });
      if (fade <= 0) {
        scene.remove(c.g);
        groundChutes.splice(k, 1);
      }
    }
  };

  // ---------- damage numbers: a pool of text sprites that rise and fade; quick hits on the same
  // target add up into one number (an SMG burst reads as -225, not five overlapping numbers)
  type DamageKind = 'dealt' | 'armor' | 'ko' | 'taken';
  const DAMAGE_STYLE: Record<DamageKind, { color: string; size: number }> = {
    dealt: { color: '#ffd23f', size: 1 },
    armor: { color: '#7fd4ff', size: 1 },
    ko: { color: '#ff3d6e', size: 1.5 },
    taken: { color: '#ff6a6a', size: 0.85 },
  };
  const textCache = new Map<string, { tex: THREE.Texture; aspect: number }>();
  const textTexture = (text: string, color: string) => {
    const key = `${text}|${color}`;
    let t = textCache.get(key);
    if (!t) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d')!;
      g.font = '900 64px "Bungee", "Chakra Petch", system-ui, sans-serif';
      const w = Math.ceil(g.measureText(text).width) + 24;
      c.width = w;
      c.height = 84;
      g.font = '900 64px "Bungee", "Chakra Petch", system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(10,13,24,0.9)';
      g.strokeText(text, 12, 44);
      g.fillStyle = color;
      g.fillText(text, 12, 44);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      t = { tex, aspect: w / 84 };
      if (textCache.size > 300) textCache.clear();
      textCache.set(key, t);
    }
    return t;
  };
  const damageNums = Array.from({ length: 24 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 30;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, age: 0, x: 0, y: 0, h: 0, total: 0, target: -1, kind: 'dealt' as DamageKind };
  });
  let nextNum = 0;
  const popDamage = (target: number, x: number, y: number, damage: number, kind: DamageKind) => {
    let n = damageNums.find((d) => d.life > 0 && d.target === target && d.age < 0.35 && (d.kind === 'taken') === (kind === 'taken'));
    if (n) {
      n.total += damage;
      // The colour follows the latest hit (armor gone -> yellow), and a KO stays red.
      if (n.kind !== 'ko') n.kind = kind;
      n.age = 0;
      n.life = 0.9;
    } else {
      n = damageNums[nextNum++ % damageNums.length];
      Object.assign(n, { life: 0.9, age: 0, x: x + (Math.random() - 0.5) * 0.8, y, h: 2.9, total: damage, target, kind });
    }
    const style = DAMAGE_STYLE[n.kind];
    const t = textTexture(`-${Math.round(n.total)}`, style.color);
    const m = n.sprite.material as THREE.SpriteMaterial;
    m.map = t.tex;
    m.needsUpdate = true;
    // About 1.3 m tall at the normal camera distance (~33 px), bigger for bigger hits.
    const hgt = 1.3 * style.size * (1 + Math.min(0.5, n.total / 80));
    n.sprite.userData.base = hgt;
    n.sprite.userData.aspect = t.aspect;
    n.sprite.visible = true;
  };
  const updateDamage = (dt: number) => {
    for (const n of damageNums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.age += dt;
      n.h += dt * 1.6;
      const m = n.sprite.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, n.life / 0.3);
      // A quick pop when it appears or grows.
      const hgt = (n.sprite.userData.base as number) * (1 + Math.max(0, 0.12 - n.age) * 3);
      n.sprite.scale.set(hgt * (n.sprite.userData.aspect as number), hgt, 1);
      n.sprite.position.set(n.x, n.h, n.y);
      if (n.life <= 0) n.sprite.visible = false;
    }
  };

  // ---------- minimap
  const mm = opts.minimap;
  const mmCtx = mm.getContext('2d')!;
  const mmBase = paintMapImage(4);
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

  const prev = state.players.map((p) => ({ x: p.x, y: p.y, fall: p.fall }));
  let fallTime = 0;
  let shadowWide = false;
  /** Dev only: ?cam=near brings the camera close to check animation. */
  const camNear = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).get('cam') === 'near' ? 0.12 : 1;
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

    // Your own position as drawn this frame (interpolated): the camera follows exactly this, so
    // you never see two of yourself from the camera and the body disagreeing.
    let selfX = self.x;
    let selfY = self.y;
    let selfH = 0;
    state.players.forEach((p, i) => {
      const rig = rigs[i];
      const x = prev[i].x + (p.x - prev[i].x) * alpha;
      const y = prev[i].y + (p.y - prev[i].y) * alpha;
      const visible = p.alive && p.stage !== 'drone' && (i === me || p.stage === 'falling' || canSee(state, self, p));
      rig.root.visible = visible;
      const chuteOpen = p.stage === 'falling' && p.fall <= DROP.chute;
      chutes[i].visible = visible && chuteOpen;
      // Free fall from the plane down to chute height, then drift slowly under the canopy.
      // Height interpolated between ticks like x and y, so the fall is smooth at any frame rate.
      const fall = prev[i].fall + (p.fall - prev[i].fall) * alpha;
      let h = p.stage === 'falling' ? fallHeight(Math.max(0, fall)) : 0;
      if (p.vault > 0) h = Math.sin((1 - p.vault / VAULT.time) * Math.PI) * 0.7; // the hop over
      rig.root.position.set(x, h, y);
      if (i === me) {
        selfX = x;
        selfY = y;
        selfH = h;
      }
      // The body turns on a critically damped spring towards the sim heading: it starts and
      // settles smoothly instead of rotating at a constant rate and stopping dead.
      const yw = yaw[i];
      if (p.stage === 'drone') {
        yw.a = p.heading;
        yw.v = 0;
      } else {
        // A spring a little under critical damping: the body swings into a turn and settles with a
        // touch of overshoot, like a person, not a turret.
        const d = Math.atan2(Math.sin(p.heading - yw.a), Math.cos(p.heading - yw.a));
        const w = 13;
        const zeta = 0.72;
        yw.v += (w * w * d - 2 * zeta * w * yw.v) * dt;
        yw.a += yw.v * dt;
      }
      const sinceShot = lastShot[i] === undefined ? 9 : time - lastShot[i];
      const sinceLand = landAt[i] === undefined ? 9 : time - landAt[i];
      if (p.stage === 'ground') {
        poseTopDown(rig, {
          dt, time, vx: p.vx, vy: p.vy, yaw: yw.a, yawRate: yw.v, onGround: true, dashing: p.dashTime > 0,
          gun: p.weapon, sinceShot,
          reload: p.reload > 0 ? 1 - p.reload / WEAPONS[p.weapon].reload : null,
          lean: p.lean,
          vault: p.vault > 0 ? 1 - p.vault / VAULT.time : null,
          // The landing roll, unless you hit the ground already running into a fight.
          roll: sinceLand < ROLL_TIME ? sinceLand / ROLL_TIME : null,
        });
      } else if (chuteOpen) {
        // Steering tilts you, in the body's own frame.
        const c = Math.cos(yw.a);
        const sn = Math.sin(yw.a);
        poseChute(rig, { dt, time, seed: i, steerX: -p.vx * sn + p.vy * c, steerZ: p.vx * c + p.vy * sn, shooting: sinceShot < 1.5 });
      } else if (p.stage === 'falling') {
        poseFreefall(rig, { dt, time, seed: i });
      } else {
        poseRig(rig, {
          dt, time, vx: 0, vy: 0, onGround: false, facing: 1, aim: 0, sideways: false, wall: 0, dashing: false, stunned: false,
          twoHanded: false, sinceShot: 1, recoil: 0, reloading: false, pushing: 0,
        });
      }
      rig.root.rotation.y = Math.PI / 2 - yw.a;
      rig.vest.visible = p.armor > 0;

      // Footsteps, at each footfall of the stride: yours and everyone near you, panned left or right.
      if (p.stage === 'ground' && p.alive && p.vault <= 0) {
        const foot = Math.floor(rig.phase / Math.PI);
        if (foot !== steps[i] && Math.hypot(p.vx, p.vy) > 1) {
          const d = Math.hypot(p.x - self.x, p.y - self.y);
          sfx.footstep(surfaceAt(p.x, p.y), p.x - camX(), i === me ? 0 : d, i === me ? 0.8 : 1, Math.hypot(p.vx, p.vy) > 4);
        }
        steps[i] = foot;
      }
      // Your own fighter turns see-through inside plants, so you know you're hidden.
      rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.orig) o.visible = true;
      });
      hitFlash[i] = Math.max(0, hitFlash[i] - dt);
      setFlash(rig, hitFlash[i] > 0);
      rig.root.updateMatrixWorld(true);
      if (chutes[i].visible) {
        // Attached to the top of the backpack, turned with the body, tipped the way you steer;
        // the canopy unfolds out of the pack over 0.7 s when it opens.
        rig.root.localToWorld(harness.set(0, rig.shoulderL.y, HARNESS_BACK));
        chutes[i].position.copy(harness);
        chutes[i].rotation.set(p.vy * 0.03, Math.PI / 2 - yw.a, Math.sin(time * 1.3 + i) * 0.05 - p.vx * 0.03, 'YXZ');
        if (chuteAt[i] === undefined) chuteAt[i] = time;
        const k = Math.min(1, (time - chuteAt[i]) / 0.7);
        const open = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease out with a little overshoot
        (chutes[i].userData.deploy as THREE.Group).scale.setScalar(Math.max(0.08, open));
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
        gun.visible = visible && (p.stage === 'ground' ? p.vault <= 0 && sinceLand >= ROLL_TIME : chuteOpen && sinceShot < 1.5);
      }

      // Health bar over the head, facing the camera.
      const bar = bars[i];
      bar.g.visible = visible && p.stage === 'ground';
      bar.g.position.set(x, 2.7, y);
      bar.g.quaternion.copy(camera.quaternion);
      const k = Math.max(0.001, p.hp / p.maxHp);
      bar.fill.scale.x = k;
      bar.fill.position.x = -0.8 * (1 - k);
      const a = Math.max(0.001, p.armor / ARMOR.points);
      bar.armor.scale.x = a;
      bar.armor.position.x = -0.8 * (1 - a);
      bar.armor.visible = p.armor > 0;
    });
    world.update(state, self.x, self.y);
    updateThrowPreview(self, selfX, selfY);
    const tgt = aimMode === 'auto' && self.alive && self.stage !== 'drone' ? aimTarget : null;
    reticle.visible = !!tgt && tgt.alive;
    if (tgt) {
      const ti = state.players.indexOf(tgt);
      reticle.position.set(prev[ti].x + (tgt.x - prev[ti].x) * alpha, 0.1, prev[ti].y + (tgt.y - prev[ti].y) * alpha);
      reticle.rotation.y = time * 1.5;
      reticle.scale.setScalar(1 + Math.sin(time * 8) * 0.05);
    }
    setPeople(state.players.filter((q) => q.alive && q.stage === 'ground').map((q) => ({ x: q.x, y: q.y })));

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
      v.position.set(l.x, 0, l.y);
      const item = v.getObjectByName('item')!;
      item.position.y = 0.75 + Math.sin(time * 2.6 + l.id) * 0.1;
      item.rotation.y = time * 0.9 + l.id;
      const glow = v.getObjectByName('glow') as THREE.Mesh;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 3 + l.id) * 0.2;
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
      // High above the plane, looking down over most of the map, so you can choose where to jump.
      // Centred mostly on the plane so it's always on screen, leaning towards the map.
      const fx = droneX + (WORLD / 2 - droneX) * 0.3;
      const fy = droneY + (WORLD / 2 - droneY) * 0.3;
      // Looking at the plane's height keeps it near the middle of the screen.
      want = new THREE.Vector3(fx, 165, fy + 55);
      look = new THREE.Vector3(fx, DROP.height * 0.55, fy);
    } else if (self.stage === 'falling') {
      // Stay close above and behind the jumper the whole way down, so you see yourself from the
      // first frame, falling through the clouds, then the canopy opening below them.
      const hh = selfH;
      const chute = self.fall <= DROP.chute;
      // Looking steeply down past the jumper: you see yourself in the middle and the ground below.
      want = new THREE.Vector3(selfX, hh + (chute ? 17 : 12), selfY + (chute ? 13 : 7));
      look = new THREE.Vector3(selfX, hh - (chute ? 1 : 4), selfY);
    } else {
      want = camNear < 1 ? new THREE.Vector3(selfX + 2, 3.2, selfY + 4) : new THREE.Vector3(selfX, 36, selfY + 22);
      look = camNear < 1 ? new THREE.Vector3(selfX, 1.1, selfY) : new THREE.Vector3(selfX, 0, selfY + 1);
    }
    // Falling: blend in from the plane view for a moment, then stay locked to the jumper (no lag,
    // no wobble). Ground: a soft follow.
    fallTime = self.stage === 'falling' ? fallTime + dt : 0;
    const follow =
      self.stage === 'ground' ? 1 - Math.exp(-6 * dt) : self.stage === 'falling' ? (fallTime > 0.9 ? 1 : 1 - Math.exp(-6 * dt)) : kf;
    camPos.lerp(want, follow);
    camLook.lerp(look, follow);
    // Wider lens and see-through clouds while you pick your spot from the plane.
    const overview = self.stage === 'drone' && state.phase === 'drop';
    const fov = THREE.MathUtils.damp(camera.fov, overview ? 52 : 42, 3, dt);
    // Far away above the map, a nearer near-plane wastes depth precision and the ground and the
    // roads fight (flicker); push it out while in the overview.
    const near = overview ? 4 : camNear < 1 ? 0.05 : 0.5;
    if (Math.abs(fov - camera.fov) > 0.01 || camera.near !== near) {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    // Clouds: see-through from the plane, a thin mist while you fall through them (no white-out),
    // solid again once you're on the ground and they're only sky.
    cloudMat.opacity = THREE.MathUtils.damp(cloudMat.opacity, overview ? 0.22 : self.stage === 'falling' ? 0.1 : 0.92, 5, dt);
    cloudMat.depthWrite = false;
    camera.position.set(camPos.x + n(23, 1) * 0.5 * shake, camPos.y, camPos.z + n(19, 4) * 0.4 * shake);
    camera.lookAt(camLook);
    camFocus.set(camLook.x, 0, camLook.z);
    trauma = Math.max(0, trauma - dt * 1.5);
    // Shadows: from the plane one fixed box over the whole map (a box that followed the camera made
    // shadows pop in and out across the map: the flicker); on the ground a box around you that
    // moves in steps of one shadow texel, so edges don't shimmer.
    const wide = overview;
    if (wide !== shadowWide) {
      shadowWide = wide;
      const half = wide ? WORLD * 0.62 : 40;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: wide ? 400 : 160 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    const texel = (wide ? WORLD * 1.24 : 80) / 2048;
    const fxs = wide ? WORLD / 2 : Math.round(camFocus.x / texel) * texel;
    const fzs = wide ? WORLD / 2 : Math.round(camFocus.z / texel) * texel;
    sun.position.set(fxs - 20, wide ? 160 : 60, fzs + 14);
    sun.target.position.set(fxs, 0, fzs);

    vfx.update(dt);
    updateDamage(dt);
    updateGroundChutes(dt);
    props.update(time, dt);
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
          ? `F · pick up ${LOOT_NAME[k.kind]}`
          : self.charging
            ? 'Hold to throw farther · let go to throw'
            : self.weapon === 'rockets' && self.mag > 0
              ? 'Hold Space to aim the rocket, let go to fire'
          : self.weapon !== 'fists' && self.mag + self.ammo === 0
            ? 'Out of ammo · find an ammo box or another gun'
            : self.item
              ? self.item === 'bomb' ? 'Hold F to throw the bomb' : 'F · use med kit'
              : null;
    opts.onHud({
      phase: state.phase,
      stage: self.stage,
      alive: state.players.filter((p) => p.alive).length,
      hp: Math.max(0, self.hp),
      maxHp: self.maxHp,
      armor: self.armor,
      weapon: WEAPONS[self.weapon].name,
      mag: self.mag,
      ammo: self.ammo,
      reloading: self.reload > 0 ? 1 - self.reload / WEAPONS[self.weapon].reload : null,
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
      state.players.forEach((p, i) => Object.assign(prev[i], { x: p.x, y: p.y, fall: p.fall }));
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
  if (process.env.NODE_ENV !== 'production') (window as unknown as { __lcs?: unknown }).__lcs = { state: () => state, buildings: BUILDINGS, map: MAP, animals: props.animals };

  return {
    setPaused: (on: boolean) => {
      paused = on;
      keys.clear();
      mouseDown = false;
      emitHud();
    },
    volumes: () => sfx.volumes,
    setVolume: (kind: VolumeKind, value: number) => sfx.setVolume(kind, value),
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
