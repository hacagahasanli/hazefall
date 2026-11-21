import * as THREE from 'three';

import { COPY } from '../copy/studio';
import { createSfx } from '../sfx';
import { actionFor, DEFAULT_SETTINGS, keyLabel, keyMap } from '../settings';

import type { VolumeKind } from '../sfx';
import type { Action, Settings } from '../settings';
import { ARMOR, HEALS, VEST, ROLL, BUILDINGS, DISTRICTS, DROP, DT, fallHeight, FIGHTERS, ITEMS, MAP, PLAYERS, SIZE, SUPERS, TILE, tileAt, VAULT, WEAPONS, WORLD, ZONE_PHASES } from '../sim/constants';
import { canSee, carryCap, healChoice, inPlant, inWater, lineOfSight, lootUnder, reloadTime, solidAt, throwDistance } from '../sim/step';
import { createOfflineSession } from '../net/session';
import { NO_INPUT } from '../sim/types';

import { buildRig, fighterLook, poseChute, poseDeath, poseFreefall, poseRig, poseSwim, poseTopDown } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';
import { createVfx } from './vfx';
import { createHitOverlay } from './feedback';
import { setPeople, updateNature } from './nature';
import { buildChute, HARNESS_BACK } from './chute';
import { PICKUP_ICON } from './icons';
import { paintMapImage } from './mapImage';
import { buildPlane } from './plane';
import { buildProps, DECK_Y, WATER_Y } from './props';
import { chunkedInstances } from './chunks';
import { mergeRigid } from './merge';
import { createPerfOverlay, PERF_KEY, perfRequested } from './perfOverlay';
import { FpsGuard, lowerTier, TIERS } from './quality';
import { buildWorld } from './world';

import type { Rig } from './characters';
import type { GunKind } from './guns';
import type { Tier } from './quality';
import type { NetStatus, Session } from '../net/session';
import type { FighterId, GameEvent, GameState, HealKind, Input, Loot, LootKind, Player, WeaponKind } from '../sim/types';

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
  /** Both gun slots in key order (slot 1, slot 2): what is in it (null = empty), its grade, rounds, and which one is in your hands. */
  slots: { name: string | null; rarity: number; mag: number; ammo: number; active: boolean }[];
  /** Seconds left of drawing the other gun (0 = ready). */
  swapping: number;
  /** Vest tier (0..3) and its full points; backpack tier (0..2). */
  vest: number;
  vestMax: number;
  pack: number;
  /** What you carry, and how much of each the backpack holds. */
  bag: { bandages: number; medkits: number; coffees: number; bombs: number; cap: { bandage: number; medkit: number; coffee: number; bomb: number } };
  /** A heal in progress: which and how far along (0..1), else null. */
  using: { kind: HealKind; name: string; progress: number } | null;
  /** Seconds of coffee left. */
  buzz: number;
  /** What the heal button would use now (its label), or null. */
  healNext: string | null;
  /** The grade of the loot the prompt names (0 common, 1 tuned, 2 prime), to colour it; null for anything else. */
  promptGrade: number | null;
  superCharge: number;
  superName: string;
  /** 0..1 how recharged the dodge roll is. */
  roll: number;
  fighter: FighterId;
  zone: { label: string; seconds: number; outside: boolean };
  /** Counts up each time the Deadline takes a bite out of you (drives the red pulse). */
  zoneHits: number;
  feed: { id: number; text: string }[];
  prompt: string | null;
  dead: boolean;
  /** Seconds since you went down (the result screen waits a moment). */
  deadFor: number;
  accuracy: number;
  /** Seconds alive this round, metres moved on foot. */
  survived: number;
  distance: number;
  killedBy: string | null;
  killedWith: string | null;
  killerFighter: FighterId | null;
  placement: number;
  kills: number;
  damage: number;
  won: boolean;
  fps: number;
  muted: boolean;
  aimMode: AimMode;
  paused: boolean;
  /** Online: how the line is doing (null offline). */
  net: NetStatus | null;
  host: boolean;
  /** How many dropped into this round. */
  total: number;
  /** Seconds since the round started (the title card shows for the first few). */
  planeTime: number;
  /** Looking through the sniper's scope. */
  scoped: boolean;
  /** Holding a sniper (the touch SCOPE button shows). */
  sniper: boolean;
  /** First person on the ground (the crosshair shows), and whether the mouse is captured. */
  firstPerson: boolean;
  /** Over the shoulder: crosshair in the middle, mouse look. */
  shoulder: boolean;
  mouseLocked: boolean;
  /** The quality tier being drawn. */
  tier: Tier;
  /** Your latest elimination, while its banner shows (about 1.4 s): who, and how many are left. */
  elim: { id: number; name: string; left: number } | null;
}

export type AimMode = 'auto' | 'mouse';
export type TouchButton = 'fire' | 'use' | 'super' | 'roll' | 'reload' | 'leanL' | 'leanR' | 'scope' | 'swap' | 'heal';

export interface MatchOptions {
  fighter: FighterId;
  /**
   * Built behind the pre-match screen: the map loads and draws a few frames (so shaders are compiled), then the match
   * waits frozen, silent and undrawn until `setHeld(false)`, so the launch cuts straight into the plane.
   */
  held?: boolean;
  name: string;
  /** Auto-aim (Space shoots the nearest visible enemy) or mouse aim (point and click). */
  aimMode: AimMode;
  minimap: HTMLCanvasElement;
  onHud: (hud: HudState) => void;
  /** An online round (host or guest). Without one, an offline round with bots. */
  session?: Session;
  /** The quality tier to start with (default 'high'), and whether it was picked automatically (then a low frame rate steps it down once per step). */
  tier?: Tier;
  autoTier?: boolean;
  /** Called when the frame-rate guard steps the tier down. */
  onTier?: (tier: Tier) => void;
  /** The player's settings (keys, camera, graphics, audio, accessibility); change them live with `applySettings`. */
  settings?: Settings;
  /** The mute key was pressed: the owner of the settings flips `muted` (without it the game mutes by itself). */
  onMuteKey?: () => void;
}

const GUN_MODEL: Record<Exclude<WeaponKind, 'fists'>, GunKind> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper', rockets: 'launcher',
};
/**
 * Loot beams by grade: common white, tuned blue, prime gold (a gun's rarity, a vest's tier I/II/III, a backpack's I/II).
 * Heals, ammo and bombs are supplies: a soft green. Higher grades also get a taller, brighter beam, so it reads without colour.
 */
export const GRADE_COLOR = [0xe8eef7, 0x3ec5ff, 0xffb020];
export const GRADE_CSS = ['#e8eef7', '#3ec5ff', '#ffb020'];
const SUPPLY_COLOR = 0x3ddc84;
/** 0 common, 1 tuned / Vest II / Backpack II, 2 prime / Vest III; null for supplies. */
const lootGrade = (l: Pick<Loot, 'kind' | 'tier'>): number | null =>
  l.kind in WEAPONS ? Math.min(2, l.tier ?? 0) : l.kind === 'armor' ? Math.max(0, (l.tier ?? 3) - 1) : l.kind === 'backpack' ? Math.max(0, (l.tier ?? 1) - 1) : null;

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
  armor: 'Vest', medkit: COPY.items.medkit, bomb: 'Bomb', ammo: 'Ammo box', bandage: COPY.items.bandage, coffee: COPY.items.coffee, backpack: 'Backpack',
};
const ROMAN = ['', 'I', 'II', 'III'];
/** What a piece of loot is called on the prompt: "Tuned Rifle", "Vest III", "Backpack II", "Bandage x2". */
export const lootLabel = (l: Pick<Loot, 'kind' | 'tier' | 'ammo'>) =>
  l.kind in WEAPONS
    ? (l.tier ?? 0) > 0 ? `${COPY.items.rarity[l.tier ?? 0]} ${LOOT_NAME[l.kind]}` : LOOT_NAME[l.kind]
    : l.kind === 'armor'
      ? `${LOOT_NAME.armor} ${ROMAN[l.tier ?? 3]}`
      : l.kind === 'backpack'
        ? `${LOOT_NAME.backpack} ${ROMAN[l.tier ?? 1]}`
        : l.kind === 'bandage' && l.ammo > 1 ? `${LOOT_NAME.bandage} x${l.ammo}` : LOOT_NAME[l.kind];
const HEAL_NAME: Record<HealKind, string> = { bandage: COPY.items.bandage, medkit: COPY.items.medkit, coffee: COPY.items.coffee };

/** Map (x, y) is the ground plane (x, z) in Three.js. */
const v3 = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y);
/** Place an object (Three.js `position` is read-only, so it can't be assigned). */
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

// ---------------------------------------------------------------------------

export const startMatch = (canvas: HTMLCanvasElement, opts: MatchOptions) => {
  /** Performance tier (see quality.ts): pixel ratio, shadows, antialiasing and view distance. */
  // ?perf&tier=low forces a tier from the start (measuring only: antialiasing is fixed when the context is made).
  const perfTier = perfRequested() ? new URLSearchParams(window.location.search).get('tier') : null;
  let tier: Tier = perfTier === 'low' || perfTier === 'medium' || perfTier === 'high' ? perfTier : (opts.tier ?? 'high');
  let settings: Settings = opts.settings ?? DEFAULT_SETTINGS;
  let bound = keyMap(settings.keys);
  const pixelRatio = () => Math.min(window.devicePixelRatio, TIERS[tier].dprCap, touch ? 1.5 : 2) * settings.resolution;
  const shadowsOn = () => TIERS[tier].shadows && settings.shadows;
  const fpsGuard = new FpsGuard();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: TIERS[tier].antialias, powerPreference: 'high-performance' });
  /** Phones and tablets: touch controls, always auto-aim, a lighter pixel ratio. */
  const touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  renderer.setPixelRatio(pixelRatio());
  renderer.shadowMap.enabled = shadowsOn();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /** Developer readout (?perf, or F8 in a development build): fps, frame time, draw calls, triangles. */
  const perf = createPerfOverlay(renderer, () => tier);
  if (perfRequested()) perf.show(true);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, TIERS[tier].fogNear, TIERS[tier].fogFar);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);

  // Offline the match runs here with bots; online the session is the host's or a guest's.
  const session: Session = opts.session ?? createOfflineSession(opts.fighter, opts.name);
  let state: GameState = session.state;
  const me = session.me;
  const sfx = createSfx();
  if (opts.settings) {
    // The settings own the sound levels and the mute (the old per-sound mute key is cleared once).
    if (sfx.muted) sfx.toggleMute();
    sfx.setVolume('master', settings.master);
    sfx.setVolume('guns', settings.guns);
    sfx.setVolume('steps', settings.steps);
    sfx.setMuted('player', settings.muted);
  }
  const vfx = createVfx(scene);
  /** The hitmarker and the damage-direction arcs, on a DOM layer over the canvas. */
  const hitFx = canvas.parentElement ? createHitOverlay(canvas.parentElement) : null;

  // ---------- light
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x55703f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.castShadow = shadowsOn();
  sun.shadow.mapSize.set(TIERS[tier].shadowMap, TIERS[tier].shadowMap);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  scene.add(sun, sun.target);

  // ---------- the world: ground, houses, trees, bushes, rocks, fences, crates
  const buildT0 = performance.now();
  const world = buildWorld(scene);
  const buildMs = performance.now() - buildT0;
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
    // Chunked like the trees: only the puffs the camera can see are drawn.
    const set = chunkedInstances(puff, cloudMat, parts.map((m) => ({ x: m.elements[12], z: m.elements[14], matrix: m })), {
      height: DROP.cloudHigh + 10,
      bottom: DROP.cloudLow - 10,
      radius: 14,
      castShadow: false,
    });
    set.meshes.forEach((m) => {
      m.receiveShadow = false;
      clouds.add(m);
    });
    world.track(set);
  }
  scene.add(clouds);

  // ---------- players
  const rigs: Rig[] = state.players.map((p) => {
    const r = buildRig(p.fighter);
    r.root.name = 'rig';
    scene.add(r.root);
    return r;
  });
  // Parachutes hang from a point at the jumper's raised hands (see chute.ts).
  const chutes = state.players.map((p) => {
    const g = buildChute(FIGHTERS[p.fighter].color);
    g.name = 'chute';
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
    g.name = 'bar';
    scene.add(g);
    return { g, fill, armor };
  });

  // ---------- loot, projectiles, temp walls and fields (pooled / keyed)
  const lootModel = (l: Pick<Loot, 'kind' | 'tier'>): THREE.Object3D => {
    // Root sits on the ground; `item` floats and turns (see the loot loop), `glow` pulses.
    const kind = l.kind;
    const g = new THREE.Group();
    const item = new THREE.Group();
    item.name = 'item';
    const grade = lootGrade(l);
    const color = grade === null ? SUPPLY_COLOR : GRADE_COLOR[grade];
    if (kind in GUN_MODEL) {
      const gun = buildGun(GUN_MODEL[kind as keyof typeof GUN_MODEL]).root;
      gun.scale.setScalar(1.7);
      // Tilted up so the whole silhouette shows from the high camera.
      gun.rotation.set(-0.5, Math.PI / 2, 0);
      item.add(gun);
    } else if (kind === 'armor') {
      // Vest I olive canvas, II slate, III black with a gold-edged plate.
      const vest = new THREE.MeshStandardMaterial({ color: [0x4a5a3a, 0x4a5a3a, 0x3b4656, 0x23262c][l.tier ?? 3], roughness: 0.85 });
      const strap = new THREE.MeshStandardMaterial({ color: 0x2a2f24, roughness: 0.9 });
      const body = mesh(new THREE.BoxGeometry(0.75, 0.85, 0.3), vest);
      const collar = mesh(new THREE.BoxGeometry(0.4, 0.12, 0.32), strap);
      collar.position.y = 0.45;
      const plate = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.06), mat([0x3a4a2e, 0x3a4a2e, 0x55606e, 0x8a6a22][l.tier ?? 3]));
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
    } else if (kind === 'bandage') {
      // A white roll of bandage with a loose end.
      const roll = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 16).rotateZ(Math.PI / 2), mat(0xf4f1ea));
      const tail = mesh(new THREE.BoxGeometry(0.24, 0.02, 0.3), mat(0xe8e3d8));
      tail.position.set(0, -0.16, 0.16);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.06, 0.37), new THREE.MeshBasicMaterial({ color: 0xd8312a }));
      item.add(roll, tail, band);
      item.scale.setScalar(1.3);
    } else if (kind === 'coffee') {
      // A takeaway cup: sleeve, lid.
      const cup = mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.5, 16), mat(0xf1ede4));
      const sleeve = mesh(new THREE.CylinderGeometry(0.185, 0.165, 0.2, 16), mat(0x8a5a32));
      sleeve.position.y = -0.02;
      const lid = mesh(new THREE.CylinderGeometry(0.205, 0.2, 0.07, 16), mat(0x2a2f38));
      lid.position.y = 0.28;
      item.add(cup, sleeve, lid);
    } else if (kind === 'backpack') {
      // A rucksack: body, flap, two side pockets; II is darker with a gold buckle.
      const two = (l.tier ?? 1) >= 2;
      const body = mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), mat(two ? 0x33414f : 0x5b6b3e));
      const flap = mesh(new THREE.BoxGeometry(0.62, 0.3, 0.38), mat(two ? 0x26313c : 0x4a5832));
      flap.position.y = 0.26;
      const buckle = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), mat(two ? 0xd8a23a : 0x9aa0a8));
      buckle.position.set(0, 0.12, 0.2);
      const pockets = [-0.34, 0.34].map((x) => at(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.24), mat(two ? 0x26313c : 0x4a5832)), x, -0.15, 0));
      item.add(body, flap, buckle, ...pockets);
      item.rotation.x = -0.4;
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
    mergeRigid(item);
    item.position.y = 0.75;
    g.add(item);
    // The glow and the beam are drawn for all loot at once (see lootFx): the model carries their colour and size.
    // Better grades stand taller and brighter: 2.6 m, 3.9 m, 5.2 m; supplies stay low.
    g.userData.color = new THREE.Color(color);
    g.userData.beam = grade === null ? 0.4 : [0.5, 0.65, 0.8][grade];
    g.userData.beamH = grade === null ? 0.7 : [1, 1.5, 2][grade];
    g.userData.glowS = grade === 2 ? 1.25 : 1;
    return g;
  };
  /**
   * The glow on the ground and the light beam over every item, for all loot at once: two instanced meshes, the rarity
   * colour per instance. Both blend additively, so the glow's pulse is its colour scaled (the same as its opacity).
   */
  const lootFx = (() => {
    let cap = 0;
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const glowGeo = new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2).translate(0, 0.04, 0);
    let glows: THREE.InstancedMesh | null = null;
    let beams: THREE.InstancedMesh | null = null;
    const grow = (n: number) => {
      if (n <= cap) return;
      cap = Math.max(64, n * 2);
      for (const old of [glows, beams]) if (old) {
        scene.remove(old);
        old.dispose();
      }
      glows = new THREE.InstancedMesh(glowGeo, glowMat, cap);
      beams = new THREE.InstancedMesh(beamGeometry, beamMat, cap);
      for (const im of [glows, beams]) {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        im.frustumCulled = false;
        im.count = 0;
        scene.add(im);
      }
    };
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    type Fx = { x: number; y: number; id: number; color: THREE.Color; beam: number; beamH: number; glowS: number };
    return (list: Fx[]) => {
      grow(list.length);
      if (!glows || !beams) return;
      list.forEach((l, i) => {
        glows!.setMatrixAt(i, m.makeScale(l.glowS, 1, l.glowS).setPosition(l.x, 0, l.y));
        beams!.setMatrixAt(i, m.makeScale(1, l.beamH, 1).setPosition(l.x, 0, l.y));
        glows!.setColorAt(i, c.copy(l.color).multiplyScalar(0.6 + Math.sin(time * 3 + l.id) * 0.2));
        // Additive: the beam's opacity is its colour scaled.
        beams!.setColorAt(i, c.copy(l.color).multiplyScalar(l.beam));
      });
      for (const im of [glows, beams]) {
        im.count = list.length;
        im.visible = list.length > 0;
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
      }
    };
  })();
  const lootFxList: Parameters<typeof lootFx>[0] = [];
  /**
   * The items themselves, instanced per kind (and tier, which changes a vest's or a backpack's look): each one's model is built once (merged to a mesh or two), and every
   * frame each item's place, bob and turn go into that kind's instances. Loot costs a draw call or two per kind on
   * screen, not per item.
   */
  const lootLooks = new Map<string, { tilt: THREE.Euler; color: THREE.Color; beam: number; beamH: number; glowS: number; add: (m: THREE.Matrix4) => void; flush: () => void }>();
  const lootLook = (l: Pick<Loot, 'kind' | 'tier'>) => {
    const key = `${l.kind}|${l.tier ?? ''}`;
    let look = lootLooks.get(key);
    if (look) return look;
    const model = lootModel(l);
    const item = model.getObjectByName('item')!;
    const parts = item.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    let cap = 0;
    let n = 0;
    let meshes: THREE.InstancedMesh[] = [];
    const grow = () => {
      cap = Math.max(16, cap * 2);
      meshes.forEach((im) => {
        scene.remove(im);
        im.dispose();
      });
      meshes = parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, cap);
        im.castShadow = p.castShadow;
        im.receiveShadow = p.receiveShadow;
        im.frustumCulled = false;
        im.count = 0;
        im.name = 'loot';
        scene.add(im);
        return im;
      });
    };
    const local = parts.map((p) => {
      p.updateMatrix();
      return p.matrix.clone();
    });
    const tmp = new THREE.Matrix4();
    look = {
      tilt: item.rotation.clone(),
      color: model.userData.color as THREE.Color,
      beam: model.userData.beam as number,
      beamH: model.userData.beamH as number,
      glowS: model.userData.glowS as number,
      add: (m) => {
        if (n >= cap) {
          // Growing drops what was written this frame: keep it.
          const keep = meshes.map((im) => (im.instanceMatrix.array as Float32Array).slice(0, n * 16));
          grow();
          meshes.forEach((im, i) => (im.instanceMatrix.array as Float32Array).set(keep[i] ?? []));
        }
        meshes.forEach((im, i) => im.setMatrixAt(n, tmp.multiplyMatrices(m, local[i])));
        n++;
      },
      flush: () => {
        for (const im of meshes) {
          im.count = n;
          im.visible = n > 0;
          im.instanceMatrix.needsUpdate = true;
        }
        n = 0;
      },
    };
    lootLooks.set(key, look);
    return look;
  };
  const lootDraw = () => lootLooks.forEach((l) => l.flush());
  const lootEuler = new THREE.Euler();
  const lootM = new THREE.Matrix4();
  const lootQ = new THREE.Quaternion();
  const lootPos = new THREE.Vector3();
  const lootOne = new THREE.Vector3(1, 1, 1);
  const lootFrustum = new THREE.Frustum();
  const tmpM4 = new THREE.Matrix4();
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
  /**
   * A sniper round is too fast to see in flight, so every shot leaves a contrail: a thin bright
   * streak from the muzzle to wherever the round stops (the first wall, tree or person), fading
   * out over half a second. Scoped or not, you always see where it went.
   */
  const contrailMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const contrails = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05).translate(0.5, 0, 0), contrailMat.clone());
    m.visible = false;
    m.userData.life = 0;
    scene.add(m);
    return m;
  });
  let nextContrail = 0;
  const contrail = (x: number, y: number, angle: number, h: number) => {
    // March along the line until something solid or someone stops the round.
    let d = 0.8;
    for (; d < 160; d += 0.5) {
      const px = x + Math.cos(angle) * d;
      const py = y + Math.sin(angle) * d;
      if (h < 3 && solidAt(state, px, py)) break;
      if (state.players.some((o) => o.alive && o.stage !== 'drone' && Math.hypot(o.x - px, o.y - py) < 0.6 && Math.hypot(o.x - x, o.y - y) > 1)) break;
    }
    const m = contrails[nextContrail++ % contrails.length];
    m.position.set(x + Math.cos(angle) * 0.8, h, y + Math.sin(angle) * 0.8);
    m.rotation.set(0, -angle, 0);
    m.scale.set(d - 0.8, 1, 1);
    m.visible = true;
    m.userData.life = 0.5;
  };
  const lobs = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0x2b3045));
    m.visible = false;
    scene.add(m);
    return m;
  });
  /**
   * A rocket you can see coming: an olive body with a red nose and four fins, a flickering
   * flame out of the back, and a trail of smoke behind it. Built along +z.
   */
  const rocketMeshes = Array.from({ length: 8 }, () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.85, 12).rotateX(Math.PI / 2), mat(0x5a6a3a));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 12).rotateX(Math.PI / 2), mat(0xe9c46a));
    band.position.z = 0.22;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 12).rotateX(Math.PI / 2), mat(0xc0392b));
    nose.position.z = 0.58;
    g.add(body, band, nose);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), mat(0x3a4428));
      fin.position.set(Math.cos((k * Math.PI) / 2) * 0.16, Math.sin((k * Math.PI) / 2) * 0.16, -0.36);
      fin.rotation.z = (k * Math.PI) / 2;
      g.add(fin);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }));
    flame.position.z = -0.7;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    core.position.z = -0.58;
    g.add(flame, core);
    const light = new THREE.PointLight(0xff9a3c, 3, 6);
    light.position.z = -0.7;
    g.add(light);
    g.userData.flame = flame;
    g.scale.setScalar(1.3); // readable from the top-down camera
    g.traverse((o) => (o.castShadow = o instanceof THREE.Mesh && o !== flame && o !== core));
    g.visible = false;
    scene.add(g);
    return g;
  });
  let smokeClock = 0;
  // One wall and one slow field per fighter: enough even if everyone uses their super at once.
  const tempWalls = Array.from({ length: PLAYERS }, () => {
    const m = mesh(new THREE.BoxGeometry(1, 2.2, 1), mat(PALETTE.green));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const fields = Array.from({ length: PLAYERS }, () => {
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
  // Drawn over everything (grass, plants, rugs), so the landing spot is never hidden.
  for (const m of [landRing, landDisc, ...arcDots]) {
    (m.material as THREE.Material).depthTest = false;
    m.renderOrder = 10;
  }
  scene.add(landRing, landDisc);
  const updateThrowPreview = (self: Player, x: number, y: number) => {
    // Only a bomb gets the landing circle: rockets fly straight where you aim, like a gun.
    const on = self.alive && self.stage === 'ground' && self.charging === 'bomb';
    landRing.visible = landDisc.visible = on;
    arcDots.forEach((d) => (d.visible = on));
    if (!on) return;
    const range = ITEMS.bomb.range;
    const radius = ITEMS.bomb.radius;
    // With the mouse the bomb lands under the cursor (up to its range); otherwise hold to throw farther.
    const toCursor = lastThrowAim ? Math.hypot(lastThrowAim.x - self.x, lastThrowAim.y - self.y) : 0;
    const d = lastThrowAim ? Math.min(range, toCursor) : throwDistance(self.charge, range);
    const a = lastThrowAim && toCursor > 0.3 ? Math.atan2(lastThrowAim.y - self.y, lastThrowAim.x - self.x) : self.heading;
    const tx = x + Math.cos(a) * d;
    const ty = y + Math.sin(a) * d;
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
  /** Keys pressed since the last input read: a tap shorter than a frame (or a slow frame) still counts once. */
  const tapped = new Set<string>();
  let aimMode: AimMode = opts.aimMode;
  let paused = false;
  let holding = !!opts.held;
  let heldFrames = 0;
  if (holding) sfx.setMuted('held', true);
  /** The mouse on the canvas in normalised device coordinates, and the left button. */
  const mouse = new THREE.Vector2(0, 0);
  let mouseDown = false;
  /** Right mouse button held: look through the sniper's scope (Z does the same). */
  let rightDown = false;
  /** Mouse aim with a bomb: where it will land (null when throwing by holding). */
  let lastThrowAim: { x: number; y: number } | null = null;
  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onMouseDown = (e: MouseEvent) => {
    sfx.unlock();
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rightDown = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightDown = false;
  };
  const onContext = (e: Event) => e.preventDefault();
  /** The mouse wheel swaps guns: one press per notch (a trackpad's flood of small deltas counts once per 250 ms). */
  let wheelSwap = false;
  let wheelAt = 0;
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) < 4 || performance.now() - wheelAt < 250) return;
    wheelAt = performance.now();
    wheelSwap = true;
  };
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', onContext);
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
    const action = actionFor(settings.keys, e.code);
    if (action && action !== 'pause' && action !== 'mute' && action !== 'aim') e.preventDefault();
    if (action === 'mute' && !e.repeat) {
      if (opts.onMuteKey) opts.onMuteKey();
      else muted = sfx.toggleMute();
    }
    if (action === 'aim' && !e.repeat) aimMode = aimMode === 'auto' ? 'mouse' : 'auto';
    if (e.code === PERF_KEY && !e.repeat && process.env.NODE_ENV !== 'production') perf.toggle();
    keys.add(e.code);
    if (!e.repeat) tapped.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => {
    keys.clear();
    tapped.clear();
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  // ---------- first person (prototype: ?view=fpp). On the ground the camera is your eyes, the
  // mouse is your neck (pointer lock), WASD walks the way you look, and you see your own arms
  // and gun. The drop (plane, free fall, parachute) stays in third person.
  // First person is a setting (mouse and keyboard only: on a touch screen the camera stays above); ?view=fpp still forces it.
  const fppParam = new URLSearchParams(window.location.search).get('view') === 'fpp';
  let fpp = !touch && (fppParam || settings.camera === 'first');
  /**
   * Over the shoulder (a third view, mouse and keyboard only): the camera sits on a short arm behind your right shoulder,
   * the mouse turns it (pointer lock) exactly as in first person, WASD walks the way it looks, and the crosshair in the
   * middle of the screen is where your shots go. The arm pulls in at once when a wall or a ceiling is in the way and
   * eases back out, so the camera never ends up inside a wall or hides you behind one.
   */
  const tpsParam = new URLSearchParams(window.location.search).get('view') === 'tps';
  let shoulder = !touch && !fpp && (tpsParam || settings.camera === 'shoulder');
  let viewYaw = 0;
  let viewPitch = -0.04;
  let viewInit = false;
  let locked = false;
  /** First person once you're out of the plane: falling, under the canopy and on the ground. */
  /** Looking through the sniper's scope this frame (set every frame from the input). */
  let scoped = false;
  const firstPerson = () => fpp && state.players[me].stage !== 'drone' && state.players[me].alive;
  /** Over the shoulder once you're out of the plane. */
  const shoulderView = () => shoulder && state.players[me].stage !== 'drone' && state.players[me].alive;
  /** The mouse turns the view (first person or over the shoulder). */
  const mouseLook = () => firstPerson() || shoulderView();
  /** The shoulder camera's arm: how far out it is now (pulled in by walls, eased back out). */
  let armNow = 3.2;
  /** Where the crosshair points on the map this frame (the shoulder view aims there, not straight ahead of you). */
  const crossAim = { x: 0, y: 0 };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
  };
  const onLook = (e: MouseEvent) => {
    if (!locked) return;
    // Through the scope the view moves as much less as it is zoomed, so aiming stays steady.
    const sens = 0.0022 * settings.sensitivity * (scoped ? 0.25 : 1);
    viewYaw += e.movementX * sens;
    viewPitch = Math.max(-1.1, Math.min(1.1, viewPitch - e.movementY * sens * (settings.invertY ? -1 : 1)));
  };
  const onLockClick = () => {
    if ((fpp || shoulder) && !locked && mouseLook()) void canvas.requestPointerLock();
  };
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onLook);
  canvas.addEventListener('click', onLockClick);
  scene.add(camera);
  /** Your own arms and gun in front of the camera. */
  const viewmodel = new THREE.Group();
  viewmodel.visible = false;
  camera.add(viewmodel);
  const look = fighterLook(opts.session ? state.players[me].fighter : opts.fighter);
  const vmMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
  const vmLimb = (from: THREE.Vector3, to: THREE.Vector3, r: number, c: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, from.distanceTo(to), 8), vmMat(c));
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return m;
  };
  /**
   * The view model is rebuilt for each gun: the gun low and to the right, turned a little in
   * towards the crosshair so its side shows; the right hand on the grip, the left hand under
   * the fore-end (both on the grip for a pistol); forearms coming up from below the screen with
   * the elbows bent, in your fighter's sleeves.
   */
  const GRIP = new THREE.Vector3(0.19, -0.23, -0.46);
  const GUN_YAW = 0.09;
  const vmArms = new THREE.Group();
  viewmodel.add(vmArms);
  const buildArms = (support: number) => {
    vmArms.clear();
    const fwd = new THREE.Vector3(-Math.sin(GUN_YAW), 0, -Math.cos(GUN_YAW));
    const fore = support > 0 ? GRIP.clone().addScaledVector(fwd, support).add(new THREE.Vector3(-0.01, -0.035, 0)) : GRIP.clone().add(new THREE.Vector3(-0.045, -0.02, 0.02));
    for (const [hand, elbow] of [
      [GRIP, GRIP.clone().add(new THREE.Vector3(0.13, -0.22, 0.24))],
      [fore, fore.clone().add(new THREE.Vector3(-0.16, -0.24, 0.22))],
    ] as const) {
      vmArms.add(vmLimb(elbow, hand, 0.034, look.top));
      vmArms.add(vmLimb(elbow.clone().add(new THREE.Vector3(Math.sign(elbow.x - 0.05) * 0.08, -0.3, 0.3)), elbow, 0.045, look.top));
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.085), vmMat(look.skin));
      h.position.copy(hand);
      h.rotation.y = GUN_YAW;
      vmArms.add(h);
    }
  };
  /**
   * Swimming in first person: your own arms doing breaststroke in front of you (reach forward
   * together, sweep out to the sides, pull back to the chest); treading water, small sculling
   * circles at the sides.
   */
  const swimArms = new THREE.Group();
  swimArms.visible = false;
  camera.add(swimArms);
  const unitLimb = (r: number, c: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 1, 8), vmMat(c));
    swimArms.add(m);
    return m;
  };
  const swimParts = [-1, 1].map(() => {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.1), vmMat(look.skin));
    swimArms.add(hand);
    return { fore: unitLimb(0.034, look.top), upper: unitLimb(0.045, look.top), hand };
  });
  const UP = new THREE.Vector3(0, 1, 0);
  const limbDir = new THREE.Vector3();
  const placeLimb = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, a.distanceTo(b), 1);
    m.quaternion.setFromUnitVectors(UP, limbDir.copy(b).sub(a).normalize());
  };
  const poseSwimArms = (phase: number, moving: number) => {
    const c = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
    swimParts.forEach((part, k) => {
      const side = k === 0 ? -1 : 1;
      // Breaststroke path in camera space: chest -> forward -> out -> back to the chest.
      let x: number;
      let y: number;
      let z: number;
      if (c < 0.35) {
        const t = c / 0.35;
        x = side * (0.06 + 0.02 * t);
        y = -0.31 + 0.1 * t;
        z = -0.3 - 0.42 * t;
      } else if (c < 0.7) {
        const t = (c - 0.35) / 0.35;
        x = side * (0.08 + 0.4 * Math.sin(t * Math.PI * 0.5));
        y = -0.21 - 0.06 * t;
        z = -0.72 + 0.2 * t;
      } else {
        const t = (c - 0.7) / 0.3;
        x = side * (0.48 - 0.42 * t);
        y = -0.27 - 0.04 * t;
        z = -0.52 + 0.22 * t;
      }
      // Treading water: small circles out at the sides instead.
      const tx = side * 0.36 + Math.cos(phase * 1.5 + k) * 0.06;
      const tz = -0.42 + Math.sin(phase * 1.5 + k) * 0.06;
      const hand = new THREE.Vector3(x * moving + tx * (1 - moving), y * moving - 0.31 * (1 - moving), z * moving + tz * (1 - moving));
      const elbow = hand.clone().add(new THREE.Vector3(side * 0.16, -0.18, 0.26));
      const shoulder = new THREE.Vector3(side * 0.22, -0.42, 0.25);
      placeLimb(part.fore, elbow, hand);
      placeLimb(part.upper, shoulder, elbow);
      part.hand.position.copy(hand);
      part.hand.rotation.y = side * 0.4 * (1 - c);
    });
  };
  /** How far along the gun the left hand holds it (m from the grip), by gun. */
  const HOLD_SUPPORT: Partial<Record<WeaponKind, number>> = { smg: 0.24, shotgun: 0.3, rifle: 0.28, sniper: 0.32, rockets: 0.22 };
  buildArms(0);
  let lastStageAir = false;
  let vmGun: THREE.Object3D | null = null;
  /** The tip of the barrel in first person: your shots leave from here. */
  const vmMuzzle = new THREE.Object3D();
  const muzzleAt = new THREE.Vector3();
  let vmGunKind: WeaponKind | null = null;

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
  /**
   * Touch: the stick (analog, -1..1 each way) and the buttons. A press is latched until the game
   * has read it once, so a tap shorter than a tick still counts.
   */
  const stick = { x: 0, y: 0 };
  const touchHeld = new Set<TouchButton>();
  const touchLatched = new Set<TouchButton>();
  const btn = (b: TouchButton) => touchHeld.has(b) || touchLatched.has(b);
  let lastMove = { x: 1, y: 0 };
  /** Is any key bound to this action held? */
  const held = (a: Action) => bound[a].some((k) => keys.has(k) || tapped.has(k));
  const readInput = (): Input => {
    const p = state.players[me];
    if (mouseLook()) {
      if (!viewInit) {
        viewYaw = p.stage === 'falling' ? Math.atan2(state.drone.y1 - state.drone.y0, state.drone.x1 - state.drone.x0) : p.heading;
        // Out of the plane you look down at the ground you're falling towards.
        viewPitch = p.stage === 'falling' ? (shoulder ? -0.45 : -0.75) : shoulder ? -0.12 : -0.04;
        viewInit = true;
      }
      const fwd = (held('up') ? 1 : 0) - (held('down') ? 1 : 0) - stick.y;
      const side = (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + stick.x;
      const c = Math.cos(viewYaw);
      const sn = Math.sin(viewYaw);
      let mx = fwd * c - side * sn;
      let my = fwd * sn + side * c;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      const input: Input = {
        mx, my,
        fire: held('fire') || mouseDown || btn('fire'),
        jump: held('fire') || btn('fire'),
        super: held('super') || btn('super'),
        use: held('use') || btn('use'),
        lean: (held('leanR') || btn('leanR') ? 1 : 0) - (held('leanL') || btn('leanL') ? 1 : 0),
        roll: held('roll') || btn('roll'),
        reload: held('reload') || btn('reload'),
        ...slotKeys(),
        snap: true,
        scope: scopeHeld(p),
        pitch: viewPitch,
        aimX: shoulder ? crossAim.x : p.x + c * 30,
        aimY: shoulder ? crossAim.y : p.y + sn * 30,
      };
      lastThrowAim = null;
      touchLatched.clear();
      tapped.clear();
      return input;
    }
    if (fpp || shoulder) viewInit = false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const mx = clamp((held('right') ? 1 : 0) - (held('left') ? 1 : 0) + stick.x);
    const my = clamp((held('down') ? 1 : 0) - (held('up') ? 1 : 0) + stick.y);
    // Facing with no target: the direction you're actually moving (the velocity turns smoothly);
    // standing still, a tapped key turns you; after stopping you keep facing where you went.
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.8) lastMove = { x: p.vx / sp, y: p.vy / sp };
    else if (mx || my) lastMove = { x: mx, y: my };
    // On the ground or under the parachute you aim (and auto-aim) at people.
    const canAim = p.stage === 'ground' || (p.stage === 'falling' && p.fall <= DROP.chute);
    const pointed = aimMode === 'mouse' && !touch && canAim ? mouseAim() : null;
    const target = canAim && !pointed ? autoAim(p) : null;
    const aim = pointed ?? (target ? { x: target.x, y: target.y } : { x: p.x + lastMove.x * 6, y: p.y + lastMove.y * 6 });
    const input = {
      mx, my,
      fire: held('fire') || (aimMode === 'mouse' && mouseDown) || btn('fire'),
      jump: held('fire') || btn('fire'),
      // Battle-royale keys: Q / E lean, F picks up or uses, G is the super.
      super: held('super') || btn('super'),
      use: held('use') || btn('use'),
      lean: clamp((held('leanR') || btn('leanR') ? 1 : 0) - (held('leanL') || btn('leanL') ? 1 : 0)),
      roll: held('roll') || btn('roll'),
      reload: held('reload') || btn('reload'),
      ...slotKeys(),
      scope: scopeHeld(p),
      // Mouse aim: a bomb lands under the cursor.
      throwAt: !!pointed,
      aimX: aim.x,
      aimY: aim.y,
    };
    lastThrowAim = pointed ? { x: pointed.x, y: pointed.y } : null;
    touchLatched.clear();
    tapped.clear();
    return input;
  };
  /** Gun slots and heals: 1 / 2 draw a slot, X or the mouse wheel (one notch, latched until read) the other gun; C heals, V drinks coffee. */
  const slotKeys = () => {
    const cycle = held('swap') || btn('swap') || wheelSwap;
    wheelSwap = false;
    return {
      slot: held('slot1') ? 1 : held('slot2') ? 2 : 0,
      cycle,
      heal: held('heal') || btn('heal'),
      coffee: held('coffee'),
    };
  };
  /** Looking through the scope: a sniper in hand, on your feet, right mouse / Z / the touch button held. */
  const scopeHeld = (p: Player) =>
    p.weapon === 'sniper' && p.alive && p.stage === 'ground' && !inWater(p.x, p.y) && (rightDown || held('scope') || btn('scope'));

  // ---------- events -> effects and sound
  const feed: { id: number; text: string; at: number }[] = [];
  let feedId = 0;
  let trauma = 0;
  /**
   * Hitstop, render only: for this long (real seconds) poses and particles hold still, the person
   * hit shudders. The sim, your input and the camera never stop.
   */
  let hitstop = 0;
  let hitstopVictim = -1;
  const stopFor = (s: number, victim: number) => {
    if (s >= hitstop) hitstopVictim = victim;
    hitstop = Math.max(hitstop, s);
  };
  /** The strongest hit-confirm tick of this tick's hits (played once, after the events). */
  const TICK_RANK = { body: 0, armor: 1, break: 2 } as const;
  let pendingTick: keyof typeof TICK_RANK | null = null;
  let killedThisTick = false;
  /** Your eliminations, for the banner. */
  let elim: { id: number; name: string; left: number; at: number } | null = null;
  let elimId = 0;
  let hudNow = false;
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
          if (e.owner === me && firstPerson() && vmGun) {
            vmMuzzle.getWorldPosition(muzzleAt);
            vfx.burst(muzzleAt.x, muzzleAt.y, 4, 'spark', { z: muzzleAt.z, speed: 1.2, up: 0.2, gravity: 0, life: 0.05, size: 0.5 });
          } else vfx.burst(mx, 1.15, 5, 'spark', { z: my, speed: 3, up: 0.5, gravity: 0, life: 0.07, size: 1.6 });
          vfx.burst(e.x - Math.sin(e.angle) * 0.4, 1.1, 1, 'ko', { z: e.y + Math.cos(e.angle) * 0.4, speed: 2.5, up: 3, gravity: 18, life: 0.6, size: 0.45 });
        }
        if (d < 60) {
          // Fists: a short swoosh. Rockets: the synthesised launch. Guns: recorded shots.
          if (e.weapon === 'fists') sfx.dash(e.x - camX());
          else if (e.weapon === 'rockets') sfx.shot('launcher', e.x - camX());
          else sfx.gunshot(SOUND[e.weapon], e.x - camX(), d);
        }
        if (e.owner === me && (e.weapon === 'shotgun' || e.weapon === 'sniper')) trauma = Math.min(1, trauma + 0.2);
        if (e.weapon === 'sniper') contrail(e.x, e.y, e.angle, 1.15);
        break;
      }
      case 'hit':
        vfx.burst(e.x, 1.1, 5 + Math.round(e.damage / 60), e.armor ? 'guard' : 'spark', { z: e.y, speed: 3, life: 0.3 });
        // Damage numbers for the hits you land, and for the ones you take.
        if (e.by === me || e.target === me) popDamage(e.target, e.x, e.y, e.damage, e.target === me ? 'taken' : e.ko ? 'ko' : e.armor ? 'armor' : 'dealt');
        if (e.target === me) trauma = Math.min(1, trauma + 0.25);
        sfx.hit(Math.min(20, e.damage / 30), e.x - camX());
        hitFlash[e.target] = 0.08;
        if (e.by === me && e.target !== me) {
          // A hit you landed: a small nudge, the 2D tick, the hitmarker, and a short freeze on a heavy gun.
          trauma = Math.min(1, trauma + 0.05);
          const broke = e.armor && state.players[e.target].armor <= 0;
          const tick = broke ? 'break' : e.armor ? 'armor' : 'body';
          if (!e.ko && (pendingTick === null || TICK_RANK[tick] > TICK_RANK[pendingTick])) pendingTick = tick;
          hitFx?.hit(e.ko ? 'kill' : e.armor ? 'armor' : 'hit', e.target);
          const w = state.players[me].weapon;
          if (w === 'shotgun' || w === 'sniper' || w === 'rockets') stopFor(0.05, e.target);
        }
        if (e.target === me && e.by !== null && e.by !== me) {
          const from = state.players[e.by];
          hitFx?.hurt(e.by, from.x, from.y);
        }
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
      case 'zoneHurt':
        if (e.player === me && e.amount > 0) {
          popDamage(me, e.x, e.y, e.amount, 'zone');
          zoneHits += 1;
          sfx.hit(4, 0);
        }
        break;
      case 'reload':
        sfx.reloadAt(e.weapon, e.x - camX(), e.player === me ? 0 : Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y));
        break;
      case 'dryFire':
        if (e.player === me) sfx.dryFire();
        break;
      case 'roll':
        sfx.vault(e.x - camX(), e.player === me ? 0 : Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y));
        vfx.burst(e.x, 0.2, 8, 'dust', { z: e.y, speed: 2.5, up: 0.8, gravity: 5, life: 0.4, size: 0.7 });
        break;
      case 'vault':
        sfx.vault(e.x - camX(), e.player === me ? 0 : Math.hypot(e.x - state.players[me].x, e.y - state.players[me].y));
        vfx.burst(e.x, 0.3, 6, 'dust', { z: e.y, speed: 2, up: 1, gravity: 5, life: 0.35, size: 0.6 });
        break;
      case 'pickup':
        if (e.player === me) sfx.pickup();
        break;
      case 'swap':
        if (e.player === me) sfx.reload();
        break;
      case 'heal':
        if (e.player === me && e.done) sfx.pickup();
        break;
      case 'land':
        landAt[e.player] = time;
        vfx.burst(e.x, 0.2, 12, 'dust', { z: e.y,  speed: 3, up: 1, gravity: 4, life: 0.4 });
        if (e.player === me) sfx.land();
        break;
      case 'ko': {
        deadAt[e.victim] = time;
        const v = state.players[e.victim];
        const by = e.by !== null ? state.players[e.by] : null;
        feed.push({ id: feedId++, text: by ? `${by.name} ⟶ ${v.name}` : COPY.zone.caught(v.name), at: time });
        vfx.burst(e.x, 1, 30, 'ko', { z: e.y,  speed: 7, up: 4, life: 0.8 });
        sfx.ko(e.x - camX());
        if (e.victim === me) {
          trauma = 1;
          hudNow = true;
        } else if (e.by === me) {
          // Your elimination: a solid jolt (not the full one you get going down), a 90 ms freeze,
          // the kill sound and the banner, at once.
          trauma = Math.min(1, Math.max(trauma, 0.6));
          stopFor(0.09, e.victim);
          killedThisTick = true;
          sfx.elim();
          elim = { id: elimId++, name: v.name, left: state.players.filter((p) => p.alive).length, at: time };
          hudNow = true;
        }
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
  const deck = state.players.map(() => 0);
  /** How deep a body sinks in the water before it is gone (m). */
  const SINK_DEPTH = 1.6;
  const steps = state.players.map(() => 0);
  const surfaceAt = (x: number, y: number) => {
    const t = MAP[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] ?? 'g';
    return t === 'o' ? 'water' : t === 'a' ? 'hard' : '.lud'.includes(t) ? 'wood' : t === 'p' ? 'dirt' : 'bch'.includes(t) ? 'leaves' : 'grass';
  };
  /** Visual yaw per player (angle and angular velocity) and when each last fired. */
  const yaw = state.players.map((p) => ({ a: p.heading, v: 0 }));
  const lastShot: number[] = [];
  const deadAt: number[] = [];
  const chuteAt: number[] = [];
  const harness = new THREE.Vector3();
  /** When each player touched down (for the landing roll), and the canopies left on the ground. */
  const landAt: number[] = [];
  const ROLL_TIME = 0.75;
  /**
   * Canopies let go: the moment a canopy stops hanging over its fighter (touchdown, or knocked out in the air) a copy is
   * left where it was drawn and collapses there in 0.7 s: it keels over ahead of the fighter, deflates (flattens and
   * shrinks towards the harness), fades and is gone. It never turns about its own axis and never lies on the ground
   * as an open disc. Knocked out in the air it also drops as it goes.
   */
  const COLLAPSE = 0.7;
  const collapsing: { g: THREE.Group; deploy: THREE.Object3D; t: number; q0: THREE.Quaternion; p0: THREE.Vector3; s0: number; air: boolean }[] = [];
  const keel = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const releaseChute = (i: number, air: boolean) => {
    const src = chutes[i];
    // userData.deploy is a scene node: keep it out of the clone (Object3D.clone serialises userData to JSON).
    const deploy = src.userData.deploy as THREE.Object3D;
    delete src.userData.deploy;
    const g = src.clone(true);
    src.userData.deploy = deploy;
    g.name = 'chute (collapsing)';
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // Lines and risers go at once; the fabric gets its own material so it can fade alone.
      if (o.userData.line) o.visible = false;
      else {
        const m = (o.material as THREE.Material).clone();
        m.transparent = true;
        o.material = m;
      }
    });
    g.visible = true;
    scene.add(g);
    collapsing.push({ g, deploy: g.children[0], t: 0, q0: src.quaternion.clone(), p0: src.position.clone(), s0: deploy.scale.x, air });
  };
  const updateCollapsing = (dt: number) => {
    for (let k = collapsing.length - 1; k >= 0; k--) {
      const c = collapsing[k];
      c.t += dt;
      const f = Math.min(1, c.t / COLLAPSE);
      const e = 1 - Math.pow(1 - f, 3);
      // Keels over ahead of the fighter (away from an over-the-shoulder camera), about its own left-right axis; no turn about the vertical.
      c.g.quaternion.copy(c.q0).multiply(keel.setFromAxisAngle(xAxis, 1.3 * e));
      c.g.position.copy(c.p0);
      if (c.air) c.g.position.y = Math.max(0.1, c.p0.y - 6 * f * f);
      // Deflates: the dome flattens and pulls in towards the harness.
      c.deploy.scale.set(c.s0 * (1 - 0.55 * e), c.s0 * (1 - 0.85 * e), c.s0 * (1 - 0.55 * e));
      const fade = f < 0.35 ? 1 : 1 - (f - 0.35) / 0.65;
      c.g.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).opacity = fade;
      });
      if (f >= 1) {
        scene.remove(c.g);
        c.g.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
        collapsing.splice(k, 1);
      }
    }
  };

  // ---------- damage numbers: a pool of text sprites that rise and fade; quick hits on the same
  // target add up into one number (an SMG burst reads as -225, not five overlapping numbers)
  type DamageKind = 'dealt' | 'armor' | 'ko' | 'taken' | 'zone';
  const DAMAGE_STYLE: Record<DamageKind, { color: string; size: number }> = {
    zone: { color: '#6fb6ff', size: 1.05 },
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

  /**
   * The pick-up hint: a small keycap floating over the piece of loot you stand on that needs a press to take (a gun when
   * both slots are full, say), with the pick-up key on it, or the USE button's icon on a phone. No words and no prompt.
   */
  const keycapCache = new Map<string, THREE.Texture>();
  const keycapTexture = (label: string) => {
    let tex = keycapCache.get(label);
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    const box = (y: number, fill: string) => {
      g.beginPath();
      g.roundRect(10, y, 76, 70, 14);
      g.fillStyle = fill;
      g.fill();
    };
    box(18, 'rgba(10,13,24,0.85)');
    box(8, '#e6ebf5');
    g.fillStyle = g.strokeStyle = '#0a0d18';
    if (label === 'touch') {
      g.save();
      g.translate(24, 19);
      g.scale(2, 2);
      g.lineWidth = 2.6;
      g.lineCap = g.lineJoin = 'round';
      g.stroke(new Path2D(PICKUP_ICON));
      g.restore();
    } else {
      g.font = `900 ${label.length > 2 ? 26 : 46}px "Bungee", "Chakra Petch", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 48, 45);
    }
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    keycapCache.set(label, tex);
    return tex;
  };
  const keycap = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  keycap.renderOrder = 29;
  keycap.visible = false;
  keycap.scale.set(0.85, 0.85, 1);
  scene.add(keycap);
  const showKeycap = (k: Loot | null) => {
    keycap.visible = !!k;
    if (!k) return;
    const label = touch ? 'touch' : keyLabel(settings.keys.use);
    const m = keycap.material as THREE.SpriteMaterial;
    if (m.map !== keycapTexture(label)) {
      m.map = keycapTexture(label);
      m.needsUpdate = true;
    }
    // At the item, drawn just to the right of it on screen (the sprite's own anchor), so your fighter standing on it never
    // covers it; in first person low and centred, where you look down at your feet.
    keycap.position.set(k.x, fpp ? 0.3 : 0.9, k.y);
    keycap.center.set(fpp ? 0.5 : -0.55, 0.5);
  };

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
      let hgt = (n.sprite.userData.base as number) * (1 + Math.max(0, 0.12 - n.age) * 3);
      // Sized for the high camera (~40 m away); up close in first person the same number would
      // fill the screen, so there it keeps about the same size on screen at any distance.
      if (firstPerson()) hgt *= Math.min(1, camera.position.distanceTo(n.sprite.position) / 34);
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
  /** 0 in free fall, eases to 1 once the canopy is open: the camera backs off and tilts up to keep the canopy in view. */
  let chuteCam = 0;
  /** The high camera leans ahead: a few metres the way you move and aim, eased (half-life ~0.35 s). */
  const ahead = new THREE.Vector2();
  let shadowHalf = 0;
  /** Dev only: ?zoom=0.6 brings the top-down camera that much closer (for trailer clips). */
  const camZoom = process.env.NODE_ENV !== 'production' ? Number(new URLSearchParams(window.location.search).get('zoom') ?? 1) || 1 : 1;
  /** Dev only: ?cam=near brings the camera close to check animation. */
  const camNear = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).get('cam') === 'near' ? 0.12 : 1;
  const camFocus = new THREE.Vector3(state.players[me].x, 0, state.players[me].y);
  /** Dev close-up offset under the parachute: ?orbit=x,y,z (metres from the jumper). */
  const camOrbit = (() => {
    const o = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('orbit');
    const [x, y, z] = (o ?? '4,0.5,5').split(',').map(Number);
    return new THREE.Vector3(x, y, z);
  })();
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

  /** The hitmarker and damage arcs follow you (and the one you hit) on the screen. */
  const fxAt = new THREE.Vector3();
  const toScreen = (x: number, h: number, y: number) => {
    fxAt.set(x, h, y).project(camera);
    if (fxAt.z > 1) return null;
    return { x: (fxAt.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - fxAt.y * 0.5) * canvas.clientHeight };
  };
  const updateHitFx = (dt: number, selfX: number, selfH: number, selfY: number) => {
    if (!hitFx) return;
    // Over the shoulder works like first person here: the marker on the crosshair, the arcs turned with the view.
    const fp = mouseLook();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const centre = { x: w / 2, y: h / 2 };
    const me2 = fp ? centre : toScreen(selfX, selfH + 1, selfY) ?? centre;
    hitFx.update(dt, settings, {
      self: { x: state.players[me].x, y: state.players[me].y, sx: me2.x, sy: me2.y },
      yaw: fp ? viewYaw : null,
      // First person on the crosshair; from above on the body of the one you hit.
      markAt: (t) => {
        if (fp) return centre;
        const r = rigs[t]?.root;
        return r ? toScreen(r.position.x, r.position.y + 1.2, r.position.z) : null;
      },
    });
  };

  const renderFrame = (dt: number, alpha: number) => {
    resize();
    const self = state.players[me];
    const frozen = hitstop > 0;
    hitstop = Math.max(0, hitstop - dt);
    scoped = !paused && scopeHeld(self);
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
      // The fallen stay where they fell (you can see who went down where).
      const fallen = !p.alive && p.stage === 'ground' && deadAt[i] !== undefined;
      const visible = fallen || (p.alive && p.stage !== 'drone' && (i === me || p.stage === 'falling' || canSee(state, self, p)));
      rig.root.visible = visible && !(i === me && firstPerson());
      const chuteOpen = p.stage === 'falling' && p.fall <= DROP.chute;
      const hadChute = chutes[i].visible;
      chutes[i].visible = visible && chuteOpen;
      // The canopy stops hanging over this fighter (landed, or knocked out in the air): it collapses where it was.
      if (hadChute && !chutes[i].visible) releaseChute(i, p.stage === 'falling');
      // Free fall from the plane down to chute height, then drift slowly under the canopy.
      // Height interpolated between ticks like x and y, so the fall is smooth at any frame rate.
      const fall = prev[i].fall + (p.fall - prev[i].fall) * alpha;
      let h = p.stage === 'falling' ? fallHeight(Math.max(0, fall)) : 0;
      // Standing on a bridge or the pier lifts you onto its deck, smoothly at its ends.
      const onDeck = p.stage === 'ground' && MAP[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === 'd' ? DECK_Y : 0;
      deck[i] += (onDeck - deck[i]) * Math.min(1, dt * 14);
      if (p.stage === 'ground') h += deck[i];
      if (p.vault > 0) h = Math.sin((1 - p.vault / VAULT.time) * Math.PI) * 0.7 + deck[i]; // the hop over
      // Knocked out in the water: the body floats for a moment, then slowly sinks out of sight,
      // a few bubbles coming up as it goes.
      if (fallen && inWater(p.x, p.y)) {
        const t = time - deadAt[i];
        const sink = t < 1.4 ? 0 : Math.min(SINK_DEPTH, (t - 1.4) * 0.38);
        h = -0.1 - sink;
        rig.root.visible = sink < SINK_DEPTH;
        if (sink > 0 && sink < SINK_DEPTH && Math.floor(t / 0.35) !== Math.floor((t - dt) / 0.35)) {
          vfx.burst(x + (Math.random() - 0.5) * 0.8, WATER_Y + 0.05, 2, 'foam', { z: y + (Math.random() - 0.5) * 0.8, speed: 0.3, up: 0.8, gravity: 2, life: 0.4, size: 0.3 });
          if (Math.random() < 0.4) vfx.ring(x, WATER_Y + 0.03, 0xdff2ff, { z: y, flat: true, life: 1.2, grow: 2 });
        }
      }
      rig.root.position.set(x, h, y);
      // Hitstop: the one who was hit shudders while everything else holds still.
      if (frozen && i === hitstopVictim && !settings.reducedMotion) rig.root.position.x += Math.sin(time * 120) * 0.07;
      if (i === me) {
        selfX = x;
        selfY = y;
        selfH = h;
      }
      // The body turns on a critically damped spring towards the sim heading: it starts and
      // settles smoothly instead of rotating at a constant rate and stopping dead.
      const yw = yaw[i];
      if (frozen) {
        // Hitstop: the body holds its turn too.
      } else if (p.stage === 'drone') {
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
      if (frozen) {
        // Hitstop: every pose holds for a beat.
      } else if (fallen) {
        poseDeath(rig, time - deadAt[i], i);
      } else if (p.stage === 'ground' && p.vault <= 0 && inWater(p.x, p.y)) {
        const before = Math.floor(rig.phase / Math.PI);
        poseSwim(rig, { dt, time, speed: Math.hypot(p.vx, p.vy), seed: i });
        // Each arm entering the water: a splash, a ripple ring, foam.
        if (Math.floor(rig.phase / Math.PI) !== before) {
          const d = Math.hypot(p.x - self.x, p.y - self.y);
          sfx.footstep('water', p.x - camX(), i === me ? 0 : d, i === me ? 0.8 : 1);
          if (visible) {
            vfx.ring(x, WATER_Y + 0.03, 0xdff2ff, { z: y, flat: true, life: 1.1, grow: 2.6 });
            vfx.burst(x + Math.cos(yw.a) * 0.7, WATER_Y + 0.1, 4, 'foam', { z: y + Math.sin(yw.a) * 0.7, speed: 1.2, up: 1.5, gravity: 8, life: 0.35, size: 0.4 });
          }
        }
      } else if (p.stage === 'ground') {
        poseTopDown(rig, {
          dt, time, vx: p.vx, vy: p.vy, yaw: yw.a, yawRate: yw.v, onGround: true, dashing: p.dashTime > 0,
          gun: p.weapon, sinceShot,
          reload: p.reload > 0 ? 1 - p.reload / reloadTime(p) : null,
          lean: p.lean,
          vault: p.vault > 0 ? 1 - p.vault / VAULT.time : null,
          // The landing roll, or a dodge roll (Shift).
          roll: p.rolling > 0 ? 1 - p.rolling / ROLL.time : sinceLand < ROLL_TIME ? sinceLand / ROLL_TIME : null,
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
      if (p.stage === 'ground' && p.alive && p.vault <= 0 && !inWater(p.x, p.y)) {
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
        // Rigidly attached to the top of the backpack: the rig hangs from the canopy, so the canopy
        // takes the body's own position and tilt (its swing and its banking into turns), and the
        // risers always leave from the shoulder straps, through the hands, to the lines. The
        // canopy unfolds out of the pack over 0.7 s when it opens.
        rig.body.localToWorld(harness.set(0, rig.shoulderL.y, HARNESS_BACK));
        chutes[i].position.copy(harness);
        rig.body.getWorldQuaternion(chutes[i].quaternion);
        if (chuteAt[i] === undefined) chuteAt[i] = time;
        const k = Math.min(1, (time - chuteAt[i]) / 0.7);
        const open = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease out with a little overshoot
        (chutes[i].userData.deploy as THREE.Group).scale.setScalar(Math.max(0.08, open));
      }

      // Gun in hand.
      if (gunKinds[i] !== p.weapon) {
        if (guns[i]) scene.remove(guns[i]!);
        guns[i] = p.weapon === 'fists' ? null : buildGun(GUN_MODEL[p.weapon]).root;
        if (guns[i]) scene.add(Object.assign(guns[i]!, { name: 'gun' }));
        gunKinds[i] = p.weapon;
      }
      const gun = guns[i];
      if (gun) {
        rig.hand.getWorldPosition(tmpV);
        rig.hand.getWorldQuaternion(tmpQ);
        gun.position.copy(tmpV);
        gun.quaternion.copy(tmpQ);
        gun.visible = !(i === me && firstPerson()) && visible && p.alive && (p.stage === 'ground' ? p.vault <= 0 && sinceLand >= ROLL_TIME : chuteOpen && sinceShot < 1.5);
      }

      // Health bar over the head, facing the camera.
      const bar = bars[i];
      bar.g.visible = visible && p.alive && p.stage === 'ground' && !(i === me && mouseLook());
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
    // Over the shoulder the camera can be indoors with you: buildings are drawn as in first person (ceilings, no lifted roofs).
    world.update(state, self.x, self.y, firstPerson() || shoulderView());
    updateThrowPreview(self, selfX, selfY);
    // By id: online the state object is replaced on every correction from the host.
    const tgt = aimMode === 'auto' && self.alive && self.stage !== 'drone' && aimTarget ? state.players[aimTarget.id] : null;
    reticle.visible = !!tgt && tgt.alive && !mouseLook();
    if (tgt) {
      const ti = tgt.id;
      reticle.position.set(prev[ti].x + (tgt.x - prev[ti].x) * alpha, 0.1, prev[ti].y + (tgt.y - prev[ti].y) * alpha);
      reticle.rotation.y = time * 1.5;
      reticle.scale.setScalar(1 + Math.sin(time * 8) * 0.05);
    }
    setPeople(state.players.filter((q) => q.alive && q.stage === 'ground').map((q) => ({ x: q.x, y: q.y })));

    // Loot: every item floats and turns; all items of a kind are drawn together (see lootDraw).
    for (const l of state.loot) {
      const look = lootLook(l);
      lootFxList.push({ x: l.x, y: l.y, id: l.id, color: look.color, beam: look.beam, beamH: look.beamH, glowS: look.glowS });
      // Off screen (last frame's view, with a margin): not drawn.
      lootPos.set(l.x, 0.8, l.y);
      if (lootFrustum.planes.some((pl) => pl.distanceToPoint(lootPos) < -3)) continue;
      lootEuler.set(look.tilt.x, time * 0.9 + l.id, look.tilt.z, look.tilt.order);
      lootM.compose(lootPos.set(l.x, 0.75 + Math.sin(time * 2.6 + l.id) * 0.1, l.y), lootQ.setFromEuler(lootEuler), lootOne);
      look.add(lootM);
    }
    lootDraw();
    lootFx(lootFxList);
    lootFxList.length = 0;

    // Projectiles.
    let t = 0;
    let lb = 0;
    let rk = 0;
    smokeClock += dt;
    const smokeTick = smokeClock > 0.035;
    if (smokeTick) smokeClock = 0;
    for (const pr of state.projectiles) {
      if (pr.kind === 'bullet') {
        const m = tracers[t++];
        if (!m) continue;
        m.visible = true;
        m.position.set(pr.x, pr.h ?? 1.1, pr.y);
        // Fired up at a parachute (or down from one), the round climbs or dips along its line.
        const climb = pr.h0 !== undefined && pr.h1 !== undefined ? Math.atan2(pr.h1 - pr.h0, pr.hd ?? 1) : 0;
        m.rotation.set(0, -Math.atan2(pr.vy, pr.vx), climb, 'YZX');
        if (pr.owner === me && firstPerson() && vmGun) {
          // First person: the round leaves your own barrel and merges into its true line
          // (chest height, where the game counts hits) over the first 10 m.
          vmMuzzle.getWorldPosition(muzzleAt);
          const k = Math.max(0, 1 - Math.hypot(pr.x - pr.sx, pr.y - pr.sy) / 10);
          m.position.x += (muzzleAt.x - pr.sx) * k;
          m.position.y += (muzzleAt.y - 1.1) * k;
          m.position.z += (muzzleAt.z - pr.sy) * k;
        }
      } else if (pr.kind === 'rocket') {
        // Straight where it was aimed, nose along the flight, sinking a little when it goes far.
        const m = rocketMeshes[rk++];
        if (!m) continue;
        m.visible = true;
        m.position.set(pr.x, pr.h ?? 1.3, pr.y);
        m.lookAt(pr.x + pr.vx, (pr.h ?? 1.3) + (pr.vh ?? 0), pr.y + pr.vy);
        const f = m.userData.flame as THREE.Mesh;
        f.scale.set(1, 1, 0.8 + Math.random() * 0.5);
        if (smokeTick) {
          tmpV.set(0, 0, -0.75).applyQuaternion(m.quaternion).add(m.position);
          vfx.burst(tmpV.x, tmpV.y, 2, 'dust', { z: tmpV.z, speed: 0.4, up: 0.6, gravity: -0.5, life: 0.9, size: 1.1 });
        }
      } else {
        const m = lobs[lb++];
        if (!m) continue;
        m.visible = true;
        m.position.set(pr.x, 1 + 4 * pr.t * (1 - pr.t) * 5, pr.y);
      }
    }
    for (; rk < rocketMeshes.length; rk++) rocketMeshes[rk].visible = false;
    for (; t < tracers.length; t++) tracers[t].visible = false;
    for (const c of contrails) {
      if (!c.visible) continue;
      c.userData.life -= dt;
      c.visible = c.userData.life > 0;
      (c.material as THREE.MeshBasicMaterial).opacity = Math.max(0, c.userData.life / 0.5) * 0.9;
      c.scale.y = c.scale.z = 1 + (0.5 - c.userData.life) * 3;
    }
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
    const shake = settings.reducedMotion ? 0 : trauma * trauma;
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
      chuteCam += ((chute ? 1 : 0) - chuteCam) * (1 - Math.exp(-5 * dt));
      // Under the canopy the camera backs off and looks at a point above the jumper, so the canopy sits in the
      // picture (not under the top of the HUD); a phone held upright backs off further. Eased, so opening never jumps.
      const back = camera.aspect < 1.3 ? Math.min(1.5, 1.3 / camera.aspect) : 1;
      const c = chuteCam;
      // Looking steeply down past the jumper: you see yourself in the middle and the ground below.
      want = new THREE.Vector3(selfX, hh + 12 + (17 * back - 12) * c, selfY + 7 + (15 * back - 7) * c);
      look = new THREE.Vector3(selfX, hh - 4 + 5.5 * c, selfY);
      if (camNear < 1) {
        // Dev close-up: beside and a little below the jumper, looking up at body, risers and canopy.
        want = new THREE.Vector3(selfX + camOrbit.x, hh + camOrbit.y, selfY + camOrbit.z);
        look = new THREE.Vector3(selfX, hh + 2.2, selfY);
      }
    } else {
      // Narrow screens (a phone held upright) pull the camera up so you still see around you.
      const k = (camera.aspect < 1.3 ? Math.min(1.75, 1.3 / camera.aspect) : 1) * camZoom;
      // Look-ahead: 0.35 s of your velocity plus 2.5 m the way you face, capped at 4 m, so more of the screen shows where
      // you are going and shooting. Off while standing still and aiming nowhere in particular: the view settles on you.
      const lx = self.vx * 0.35 + Math.cos(self.heading) * 2.5;
      const ly = self.vy * 0.35 + Math.sin(self.heading) * 2.5;
      const ll = Math.hypot(lx, ly);
      const cap = ll > 4 ? 4 / ll : 1;
      const still = Math.hypot(self.vx, self.vy) < 0.5 && !(mouseDown || held('fire'));
      const ka = 1 - Math.exp(-2 * dt);
      ahead.x += ((still ? 0 : lx * cap) - ahead.x) * ka;
      ahead.y += ((still ? 0 : ly * cap) - ahead.y) * ka;
      const ax0 = settings.reducedMotion ? 0 : ahead.x;
      const ay0 = settings.reducedMotion ? 0 : ahead.y;
      want = camNear < 1 ? new THREE.Vector3(selfX + 2, 3.2, selfY + 4) : new THREE.Vector3(selfX + ax0, 36 * k, selfY + ay0 + 22 * k);
      look = camNear < 1 ? new THREE.Vector3(selfX, 1.1, selfY) : new THREE.Vector3(selfX + ax0, 0, selfY + ay0 + 1);
      if (scoped && camNear >= 1) {
        // Through the scope from above: the view slides far out the way you aim and pulls up,
        // so you see (and auto-aim reaches) people well past the normal screen.
        const ax = Math.cos(self.heading) * 30;
        const ay = Math.sin(self.heading) * 30;
        want.set(selfX + ax, 54 * k, selfY + ay + 33 * k);
        look.set(selfX + ax, 0, selfY + ay + 1);
      }
    }
    // Falling: blend in from the plane view for a moment, then stay locked to the jumper (no lag,
    // no wobble). Ground: a soft follow.
    fallTime = self.stage === 'falling' ? fallTime + dt : 0;
    if (self.stage !== 'falling') chuteCam = 0;
    const follow =
      self.stage === 'ground' ? 1 - Math.exp(-6 * dt) : self.stage === 'falling' ? (fallTime > 0.9 ? 1 : 1 - Math.exp(-6 * dt)) : kf;
    camPos.lerp(want, follow);
    camLook.lerp(look, follow);
    // Wider lens and see-through clouds while you pick your spot from the plane.
    const overview = self.stage === 'drone' && state.phase === 'drop';
    const fp = firstPerson();
    const sv = shoulderView();
    const fov = fp
      ? THREE.MathUtils.damp(camera.fov, scoped ? 16 : settings.fov, 18, dt)
      : sv
        ? THREE.MathUtils.damp(camera.fov, scoped ? 30 : Math.min(settings.fov, 78), 14, dt)
        : THREE.MathUtils.damp(camera.fov, overview ? 52 : 42, 3, dt);
    // Far away above the map, a nearer near-plane wastes depth precision and the ground and the
    // roads fight (flicker); push it out while in the overview.
    const near = overview ? 4 : camNear < 1 || fp || sv ? 0.05 : 0.5;
    if (Math.abs(fov - camera.fov) > 0.001 || camera.near !== near) {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    // Clouds: see-through from the plane, a thin mist while you fall through them (no white-out),
    // solid again once you're on the ground and they're only sky.
    cloudMat.opacity = THREE.MathUtils.damp(cloudMat.opacity, overview ? 0.22 : self.stage === 'falling' ? 0.1 : 0.92, 5, dt);
    cloudMat.depthWrite = false;
    if (fp) {
      // Your eyes: head height (plus the deck or the water), a little bob with each stride,
      // leaning out sideways with Q/E, the hit shake as a small jolt.
      const rig = rigs[me];
      const speed = Math.hypot(self.vx, self.vy);
      const swim = inWater(self.x, self.y);
      const bob = swim ? Math.sin(time * 2) * 0.05 : Math.sin(rig.phase * 2) * 0.035 * Math.min(1, speed / 5);
      const air = self.stage === 'falling';
      // Swimming, the eyes are just above the surface, the hands working at the waterline.
      const eyeY = selfH + (swim ? 0.45 : rig.chestY + 0.42) + bob;
      // Touching down from the sky, the view comes back up to the horizon.
      if (!air && lastStageAir) viewPitch = Math.max(viewPitch, -0.08);
      lastStageAir = air;
      const c = Math.cos(viewYaw);
      const sn = Math.sin(viewYaw);
      // Leaning (Q/E) puts your head out past the corner and tilts the world, like a real lean.
      const lean = self.lean * 0.72;
      camera.position.set(selfX - sn * lean, eyeY, selfY + c * lean);
      if (air) {
        // Falling or under the canopy: your eyes are wherever your head is (lying flat in free
        // fall, hanging from the harness under the canopy), with the wind's flutter.
        rig.head.getWorldPosition(camera.position);
        camera.position.y += 0.05 + (self.fall > DROP.chute ? Math.sin(time * 31) * 0.01 : 0);
      }
      tmpV.set(camera.position.x + c * Math.cos(viewPitch), camera.position.y + Math.sin(viewPitch), camera.position.z + sn * Math.cos(viewPitch));
      camera.lookAt(tmpV);
      camera.rotateZ(-self.lean * 0.3);
      // The shake in first person turns the view a little (about a degree at most) instead of
      // moving your eyes: a jolt, not a slide. Only the view: where you aim does not move.
      camera.rotateY(n(13, 5) * 0.02 * shake);
      camera.rotateX(n(17, 2) * 0.015 * shake);
      camera.rotateZ(n(19, 4) * 0.012 * shake);
      camPos.copy(camera.position);
      camLook.copy(tmpV);
      camFocus.set(selfX, 0, selfY);
      // The arms and gun: they sway with the stride, kick back by the gun's weight, dip to reload.
      if (vmGunKind !== self.weapon) {
        if (vmGun) viewmodel.remove(vmGun);
        const built = self.weapon === 'fists' ? null : buildGun(GUN_MODEL[self.weapon]);
        vmGun = built?.root ?? null;
        if (vmGun && built) {
          vmMuzzle.position.set(0, 0.03, built.length);
          vmGun.add(vmMuzzle);
          vmGun.rotation.y = Math.PI + GUN_YAW;
          vmGun.position.copy(GRIP).add(tmpV.set(0, 0.03, 0));
          buildArms(self.weapon === 'pistol' ? 0 : HOLD_SUPPORT[self.weapon] ?? 0.3);
          vmGun.traverse((o) => (o.castShadow = false));
          viewmodel.add(vmGun);
        }
        vmGunKind = self.weapon;
      }
      const since = lastShot[me] === undefined ? 9 : time - lastShot[me];
      const kick = Math.max(0, 1 - since / 0.14);
      const reload = self.reload > 0 ? Math.sin((1 - self.reload / reloadTime(self)) * Math.PI) : 0;
      viewmodel.visible = !swim && !air && !scoped;
      swimArms.visible = swim && !air;
      if (swim) poseSwimArms(rig.phase, Math.min(1, speed / 1.6));
      viewmodel.position.set(Math.sin(rig.phase) * 0.012 * Math.min(1, speed / 5), bob * 0.5 - reload * 0.12, kick * 0.07);
      viewmodel.rotation.set(kick * 0.12 - reload * 0.5, 0, reload * 0.3);
    } else if (shoulderView()) {
      viewmodel.visible = false;
      swimArms.visible = false;
      // The pivot: just above your head, where the eyes of a third-person player would be.
      const air = self.stage === 'falling';
      const c = Math.cos(viewYaw);
      const sn = Math.sin(viewYaw);
      const cp = Math.cos(viewPitch);
      const pivotY = selfH + (air ? 1.2 : 1.62);
      // Right of the shoulder, so you see past yourself; scoped the arm comes in and the lens narrows (aim down sights).
      const side = air ? 0 : scoped ? 0.45 : 0.62;
      const px = selfX - sn * side;
      const pz = selfY + c * side;
      const wantArm = air ? 7 : scoped ? 1.4 : 3.2;
      // Walls and ceilings: march out along the arm and stop short of the first wall (2D walls, the 2.6 m ceiling indoors).
      const bx = -c * cp;
      const bz = -sn * cp;
      const by = -Math.sin(viewPitch);
      let reach = wantArm;
      if (!air) {
        const indoor = tileAt(Math.floor(selfX / TILE), Math.floor(selfY / TILE)) === '.';
        for (let d = 0.25; d <= wantArm; d += 0.25) {
          const x = px + bx * d;
          const z = pz + bz * d;
          const y = pivotY + by * d;
          if (solidAt(state, x, z) || y < 0.25 || (indoor && y > 2.35)) {
            reach = Math.max(0.35, d - 0.3);
            break;
          }
        }
      }
      // In at once, out gently (half-life ~0.2 s): a wall never sits between you and the camera, and it never pops.
      armNow = reach < armNow ? reach : THREE.MathUtils.damp(armNow, reach, 3.5, dt);
      camera.position.set(px + bx * armNow, pivotY + by * armNow, pz + bz * armNow);
      // The view turns with the mouse unsmoothed (the crosshair is the aim); only the hit shake adds a small jolt.
      tmpV.set(camera.position.x + c * cp, camera.position.y + Math.sin(viewPitch), camera.position.z + sn * cp);
      camera.lookAt(tmpV);
      if (shake > 0) camera.rotateZ(n(17, 2) * 0.02 * shake);
      // Too close (a tight corner): hide your own body rather than fill the screen with it.
      rigs[me].root.visible = rigs[me].root.visible && armNow > 0.75;
      camPos.copy(camera.position);
      camLook.copy(tmpV);
      camFocus.set(selfX, 0, selfY);
      // Tree canopies: the dithered cut-out sits on the line from the camera to you (not on you), so leaves never come
      // between you and the lens, under the canopy on the way down or walking through the woods.
      updateNature(performance.now() / 1000, (camera.position.x + selfX) / 2, (camera.position.z + selfY) / 2, armNow / 2 + 3);
      // Where the crosshair lands: the first fighter near the ray, else the ground, else 60 m out. Shots go from you
      // to that point, so what is under the crosshair is what you hit even though the camera is off to the side.
      const dx = c * cp;
      const dy = Math.sin(viewPitch);
      const dz = sn * cp;
      let hitT = dy < -0.01 ? Math.min(60, -camera.position.y / dy) : 60;
      for (let i = 0; i < state.players.length; i++) {
        const o = state.players[i];
        if (i === me || !o.alive || o.stage === 'drone') continue;
        const ox = o.x - camera.position.x;
        const oy = (o.stage === 'falling' ? fallHeight(Math.max(0, o.fall)) : 0) + 1.1 - camera.position.y;
        const oz = o.y - camera.position.z;
        const along = ox * dx + oy * dy + oz * dz;
        if (along <= armNow || along >= hitT) continue;
        const off = Math.hypot(ox - dx * along, oy - dy * along, oz - dz * along);
        if (off < 0.9) hitT = along;
      }
      crossAim.x = camera.position.x + dx * hitT;
      crossAim.y = camera.position.z + dz * hitT;
      // Never aim behind yourself (looking steeply down past your own feet).
      if ((crossAim.x - self.x) * c + (crossAim.y - self.y) * sn < 1.5) {
        crossAim.x = self.x + c * 30;
        crossAim.y = self.y + sn * 30;
      }
    } else {
      viewmodel.visible = false;
      swimArms.visible = false;
      camera.position.set(camPos.x + n(23, 1) * 0.5 * shake, camPos.y, camPos.z + n(19, 4) * 0.4 * shake);
      camera.lookAt(camLook);
      camFocus.set(camLook.x, 0, camLook.z);
    }
    trauma = Math.max(0, trauma - dt * 1.5);
    // Shadows: from the plane one fixed box over the whole map (a box that followed the camera made
    // shadows pop in and out across the map: the flicker); on the ground a box around you that
    // moves in steps of one shadow texel, so edges don't shimmer.
    // First person: a tighter box, so the shadows at your feet are crisp.
    const wide = overview;
    const half = wide ? WORLD * 0.62 : fp ? 24 : 40;
    if (half !== shadowHalf) {
      shadowHalf = half;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: wide ? 400 : 160 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    const texel = (half * 2) / 2048;
    const fxs = wide ? WORLD / 2 : Math.round(camFocus.x / texel) * texel;
    const fzs = wide ? WORLD / 2 : Math.round(camFocus.z / texel) * texel;
    sun.position.set(fxs - 20, wide ? 160 : 60, fzs + 14);
    sun.target.position.set(fxs, 0, fzs);

    vfx.update(frozen ? 0 : dt);
    updateDamage(dt);
    updateHitFx(dt, selfX, selfH, selfY);
    updateCollapsing(dt);
    props.update(time, dt);
    // Trees, bushes, rocks and grass: only the chunks this camera sees, the far ones cheaper, shadows only near the box.
    const spec = TIERS[tier];
    // At eye level on the ground the low tier closes the fog in (eased, so landing or switching views never jumps).
    const eye = (fp || sv) && self.stage === 'ground' && spec.eye ? spec.eye : null;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = THREE.MathUtils.damp(scene.fog.near, eye ? eye.fogNear : spec.fogNear, 2, dt);
      scene.fog.far = THREE.MathUtils.damp(scene.fog.far, eye ? eye.fogFar : spec.fogFar, 2, dt);
    }
    world.cull(camera, {
      shadow: shadowsOn() ? { x: fxs, z: fzs, half: wide ? WORLD : half * 1.15 + 5 } : null,
      // From above (the high camera) the view itself is small: grass is drawn wherever the frustum reaches. At eye level
      // (first person, over the shoulder) and from the plane it thins out with distance, per tier.
      reach: eye ? eye.reach : fp || sv || overview ? spec.reach : 4,
      // Trees switch to fewer faces only where the switch can't be seen: everywhere from the plane, past the start of
      // the fog at eye level and on the way down, never in the high view (its whole frustum is close).
      lodNear: overview ? 0 : eye ? eye.lodNear : fp || sv || self.stage === 'falling' ? spec.lodNear : Infinity,
      // Fog is by depth, not distance: a little past its end so nothing at the edge of the screen pops.
      far: (scene.fog instanceof THREE.Fog ? scene.fog.far : spec.fogFar) * 1.3,
    });
    lootFrustum.setFromProjectionMatrix(tmpM4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    renderer.render(scene, camera);
  };

  // ---------- HUD
  let fps = 60;
  let zoneHits = 0;
  /** In words, what took a player out. */
  const causeName = (p: Player) => {
    const w = p.killedWith;
    if (w === 'zone') return COPY.zone.name;
    if (w === 'explosion') return 'an explosion';
    if (w === 'super' && p.killedBy !== null) return FIGHTERS[state.players[p.killedBy].fighter].superName;
    if (w === 'fists') return 'bare hands';
    if (w === 'rockets') return 'a rocket';
    if (w && w in WEAPONS) {
      // "an SMG", "a shotgun".
      const n = WEAPONS[w as WeaponKind].name;
      return n === n.toUpperCase() ? `an ${n}` : `a ${n.toLowerCase()}`;
    }
    return 'something';
  };
  const emitHud = () => {
    const self = state.players[me];
    const z = state.zone;
    const outside = self.alive && Math.hypot(self.x - z.cx, self.y - z.cy) > z.r;
    const zone =
      state.phase === 'drop'
        ? self.stage === 'drone'
          ? { label: touch ? 'Tap JUMP to jump' : 'Jump with Space', seconds: Math.ceil(Math.max(0, DROP.forceJump - state.drone.t) * DROP.flight), outside: false }
          : { label: 'Everyone is landing', seconds: 0, outside: false }
        : z.state === 'wait'
          ? { label: COPY.zone.waiting, seconds: Math.ceil(z.timer), outside }
          : z.state === 'shrink'
            ? { label: COPY.zone.closing, seconds: Math.ceil(z.timer), outside }
            : { label: COPY.zone.final, seconds: 0, outside };
    const k = self.stage === 'ground' ? lootUnder(state, self) : null;
    const healNext = healChoice(self);
    // Loot to take: a keycap over it in the world instead of a line of text.
    showKeycap(self.alive && !self.using ? k : null);
    const prompt = !self.alive
      ? null
      : self.stage === 'drone'
        ? (touch ? 'Tap JUMP' : 'Space · jump')
        : self.stage === 'ground' && inWater(self.x, self.y)
          ? 'Swimming · no shooting in the water'
        : self.using
          ? `${HEAL_NAME[self.using]}… · shoot or roll to stop`
        : self.charging
            ? lastThrowAim ? `Point where it lands · let go of ${keyLabel(settings.keys.use)} to throw` : 'Hold to throw farther · let go to throw'
            : self.weapon === 'sniper' && self.mag + self.ammo > 0 && !scoped && !touch
              ? `${aimMode === 'mouse' || fpp ? 'Right click' : 'Z'} · scope`
          : self.weapon !== 'fists' && self.mag + self.ammo === 0
            ? 'Out of ammo · find an ammo box or another gun'
            : self.hp < self.maxHp * 0.6 && healNext && healNext !== 'coffee' && self.sinceCombat > 1.5
              ? `${touch ? 'HEAL' : keyLabel(settings.keys.heal)} · use ${HEAL_NAME[healNext].toLowerCase()}`
              : self.bombs > 0 && self.sinceCombat < 4 && !k
                ? `Hold ${touch ? 'the pick-up button' : keyLabel(settings.keys.use)} to throw a bomb`
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
      reloading: self.reload > 0 ? 1 - self.reload / reloadTime(self) : null,
      slots: slotsOf(self),
      swapping: self.swapping,
      vest: self.vest,
      vestMax: VEST.points[self.vest] || ARMOR.points,
      pack: self.pack,
      bag: {
        bandages: self.bandages, medkits: self.medkits, coffees: self.coffees, bombs: self.bombs,
        cap: { bandage: carryCap(self, 'bandage'), medkit: carryCap(self, 'medkit'), coffee: carryCap(self, 'coffee'), bomb: carryCap(self, 'bomb') },
      },
      using: self.using ? { kind: self.using, name: HEAL_NAME[self.using], progress: 1 - self.useLeft / HEALS[self.using].time } : null,
      buzz: self.buzz,
      healNext: healNext ? HEAL_NAME[healNext] : null,
      promptGrade: k && !self.using && self.alive ? lootGrade(k) : null,
      superCharge: self.superCharge,
      roll: 1 - self.rollCooldown / ROLL.cooldown,
      superName: FIGHTERS[self.fighter].superName,
      fighter: self.fighter,
      zone,
      // The last five of the past 6 s: twenty fighters can drop several at once early on.
      feed: feed.filter((f) => time - f.at < 6).slice(-5).map(({ id, text }) => ({ id, text })),
      prompt,
      dead: !self.alive,
      placement: self.placement,
      kills: self.kills,
      damage: Math.round(self.damage),
      deadFor: deadAt[me] === undefined ? 0 : time - deadAt[me],
      accuracy: self.shots > 0 ? Math.round((self.hits / self.shots) * 100) : 0,
      survived: Math.round(((self.alive ? state.tick : self.diedAt) * DT)),
      distance: Math.round(self.distance),
      killedBy: self.killedBy !== null ? state.players[self.killedBy].name : null,
      killedWith: !self.alive ? causeName(self) : null,
      killerFighter: self.killedBy !== null ? state.players[self.killedBy].fighter : null,
      won: state.winner === me,
      fps: Math.round(fps),
      zoneHits,
      muted: muted || settings.muted,
      aimMode,
      paused,
      net: session.net,
      host: session.host,
      total: state.players.length,
      planeTime: state.tick * DT,
      firstPerson: firstPerson(),
      shoulder: shoulderView(),
      scoped,
      sniper: self.weapon === 'sniper' && self.alive,
      mouseLocked: locked,
      tier,
      elim: elim && time - elim.at < 1.4 ? { id: elim.id, name: elim.name, left: elim.left } : null,
    });
  };

  /** Slot 1 and slot 2 for the HUD, whichever is in your hands. */
  const slotsOf = (p: Player): HudState['slots'] => {
    const inHand = { name: p.weapon === 'fists' ? null : WEAPONS[p.weapon].name, rarity: p.rarity, mag: p.mag, ammo: p.ammo, active: true };
    const h = p.holster;
    const other = h && h.weapon !== 'fists' ? { name: WEAPONS[h.weapon].name, rarity: h.rarity, mag: h.mag, ammo: h.ammo, active: false } : { name: null, rarity: 0, mag: 0, ammo: 0, active: false };
    return p.slot === 0 ? [inHand, other] : [other, inHand];
  };
  /** Draw at another quality tier: pixel ratio, shadows and view distance change at once (antialiasing on the next load). */
  const setTier = (next: Tier) => {
    const spec = TIERS[next];
    const hadShadows = renderer.shadowMap.enabled;
    tier = next;
    renderer.setPixelRatio(pixelRatio());
    renderer.shadowMap.enabled = shadowsOn();
    sun.castShadow = shadowsOn();
    if (sun.shadow.mapSize.x !== spec.shadowMap) {
      sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    // (The fog follows the tier each frame: see the cull before rendering.)
    // Turning shadows on or off changes the shaders: every material must recompile once.
    if (hadShadows !== shadowsOn())
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    resize();
    emitHud();
  };

  // ---------- loop
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let hudTimer = 0;
  let mmTimer = 0;
  const frame = (now: number) => {
    const cpu0 = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    // Auto quality: a frame rate that stays low during real play steps the tier down (never up, so the picture does not pump).
    if (opts.autoTier && !perfTier && !paused && state.phase !== 'drop' && tier !== 'low' && fpsGuard.frame(dt)) {
      setTier(lowerTier(tier));
      opts.onTier?.(tier);
    }
    if (holding) {
      // Waiting behind the pre-match screen: draw the first frames (compiles shaders, uploads textures), report ready,
      // then sleep until released.
      if (heldFrames < 3) {
        heldFrames++;
        renderFrame(dt, 0);
        if (heldFrames === 3) emitHud();
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    // Paused (offline only): the world freezes, the camera and effects keep drawing.
    acc = paused && !session.online ? 0 : acc + dt;
    while (acc >= DT) {
      state.players.forEach((p, i) => Object.assign(prev[i], { x: p.x, y: p.y, fall: p.fall }));
      const events = session.tick(state.players[me].alive ? readInput() : NO_INPUT);
      // A guest's state is replaced by the host's on every correction: always read it back.
      state = session.state;
      events.forEach(handle);
      // One hit-confirm tick per tick, the strongest; a kill has its own sound instead.
      if (pendingTick && !killedThisTick) sfx.hitTick(pendingTick);
      pendingTick = null;
      killedThisTick = false;
      acc -= DT;
    }
    renderFrame(dt, acc / DT);
    hudTimer -= dt;
    // An elimination shows on the HUD at once, not at the next 10 Hz update.
    if (hudTimer <= 0 || hudNow) {
      hudNow = false;
      hudTimer = 0.1;
      emitHud();
    }
    mmTimer -= dt;
    if (mmTimer <= 0) {
      mmTimer = 0.1;
      drawMinimap();
    }
    perf.frame(dt, performance.now() - cpu0);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  if (process.env.NODE_ENV !== 'production') (window as unknown as { __lcs?: unknown }).__lcs = { state: () => state, buildings: BUILDINGS, map: MAP, animals: props.animals, preview: () => ({ ring: landRing.visible, x: landRing.position.x, y: landRing.position.y, z: landRing.position.z, s: landRing.scale.x, parent: !!landRing.parent, op: (landRing.material as THREE.MeshBasicMaterial).opacity, dots: arcDots.filter((d) => d.visible).length, aim: lastThrowAim }) };

  // Measuring (?perf only, any build): draw calls and triangles of the last frame, the world's build time, a synchronous
  // render benchmark, and a way to put the player at a fixed spot with the sim frozen, so before/after shots match.
  if (perfRequested()) {
    (window as unknown as { __lcsPerf?: unknown }).__lcsPerf = {
      buildMs,
      scene,
      camera,
      tier: () => tier,
      /** The live tier table (to try other view distances while measuring). */
      tiers: TIERS,
      setTier: (t: Tier) => setTier(t),
      stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
      state: () => state,
      pause: (on: boolean) => {
        paused = on;
      },
      place: (x: number, y: number, yaw: number, pitch = -0.04) => {
        const p = state.players[me];
        Object.assign(p, { x, y, vx: 0, vy: 0, heading: yaw });
        Object.assign(prev[me], { x, y });
        viewYaw = yaw;
        viewPitch = pitch;
        viewInit = true;
      },
      /** Puts the plane at a fixed point of a fixed route (with the sim paused, for the same view from the plane). */
      drone: (d: { x0: number; y0: number; x1: number; y1: number; t: number }) => Object.assign(state.drone, d),
      /** Renders the current view n times, waiting for the GPU each time: ms per frame, shadows included. */
      bench: (n = 30) => {
        const gl = renderer.getContext();
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          renderer.render(scene, camera);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        }
        return (performance.now() - t0) / n;
      },
    };
  }

  return {
    touch,
    /** The touch stick, -1..1 each way (y down the screen = down the map). */
    setStick: (x: number, y: number) => {
      stick.x = x;
      stick.y = y;
    },
    /** A touch button went down (true) or up (false). */
    press: (b: TouchButton, on: boolean) => {
      sfx.unlock?.();
      if (on) {
        touchHeld.add(b);
        touchLatched.add(b);
      } else touchHeld.delete(b);
    },
    /** Release (or hold) a match built behind the pre-match screen. */
    setHeld: (on: boolean) => {
      holding = on;
      sfx.setMuted('held', on);
      last = performance.now();
    },
    setPaused: (on: boolean) => {
      paused = on;
      keys.clear();
      touchHeld.clear();
      stick.x = 0;
      stick.y = 0;
      mouseDown = false;
      emitHud();
    },
    setTier,
    /** New settings, applied at once: keys, mouse, camera, picture, sound. */
    applySettings: (next: Settings) => {
      const prev = settings;
      settings = next;
      bound = keyMap(next.keys);
      const wantFpp = !touch && (fppParam || next.camera === 'first');
      const wantShoulder = !touch && !wantFpp && (tpsParam || next.camera === 'shoulder');
      if (wantFpp !== fpp || wantShoulder !== shoulder) {
        fpp = wantFpp;
        shoulder = wantShoulder;
        viewInit = false;
        if (!fpp && !shoulder && document.pointerLockElement === canvas) document.exitPointerLock();
      }
      sfx.setVolume('master', next.master);
      sfx.setVolume('guns', next.guns);
      sfx.setVolume('steps', next.steps);
      sfx.setMuted('player', next.muted);
      if (prev.resolution !== next.resolution || prev.shadows !== next.shadows) setTier(tier);
      emitHud();
    },
    /** Silence everything for a reason ('ad' while a video ad plays, 'portal' for the portal's mute button). */
    setMuted: (reason: string, on: boolean) => sfx.setMuted(reason, on),
    volumes: () => sfx.volumes,
    setVolume: (kind: VolumeKind, value: number) => sfx.setVolume(kind, value),
    setAimMode: (m: AimMode) => {
      aimMode = m;
      emitHud();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      hitFx?.dispose();
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onLook);
      canvas.removeEventListener('click', onLockClick);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
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
      perf.dispose();
    },
  };
};

export { SUPERS, ZONE_PHASES };
