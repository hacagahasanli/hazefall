import {
  ARMOR,
  BOT_NAMES,
  DROP,
  DT,
  fenceVertical,
  MOVE,
  SHAPES,
  treeSpot,
  FIGHTERS,
  ITEMS,
  LOOT_TABLE,
  MAP,
  PLANT_REVEAL,
  PLAYER_RADIUS,
  PLAYERS,
  RACK_HP,
  REGEN,
  SIZE,
  SUPERS,
  TILE,
  tileAt,
  WEAPONS,
  WORLD,
  ZONE_PHASES,
  ZONE_START_RADIUS,
} from './constants';
import { NO_INPUT } from './types';

import type { FighterId, GameState, Input, Loot, LootKind, Player, Projectile, WeaponKind } from './types';

const CENTER = WORLD / 2;

/** Deterministic PRNG kept in the state, so a server and a replay agree. */
export const nextRandom = (state: GameState) => {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FIGHTER_IDS: FighterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const tileIndex = (tx: number, ty: number) => ty * SIZE + tx;
const toTile = (v: number) => Math.floor(v / TILE);
const isWeapon = (k: LootKind): k is Exclude<WeaponKind, 'fists'> => k in WEAPONS;

// ---------- the map

/** Bushes and crops hide you. */
export const inPlant = (x: number, y: number) => 'bc'.includes(tileAt(toTile(x), toTile(y)));

const boxHit = (x: number, y: number, r: number, x0: number, y0: number, x1: number, y1: number) => {
  if (r === 0) return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const nx = Math.max(x0, Math.min(x, x1));
  const ny = Math.max(y0, Math.min(y, y1));
  return (nx - x) ** 2 + (ny - y) ** 2 < r * r;
};
const circleHit = (x: number, y: number, r: number, cx: number, cy: number, cr: number) => (x - cx) ** 2 + (y - cy) ** 2 < (r + cr) ** 2;

/**
 * Does a circle (x, y, r) overlap what stands on tile (tx, ty)? Each obstacle has its real shape
 * (see SHAPES). `bullet` leaves out windows and fences, which stop you but not bullets.
 */
const tileHit = (state: GameState, tx: number, ty: number, x: number, y: number, r: number, bullet: boolean) => {
  const t = tileAt(tx, ty);
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const c = TILE / 2;
  switch (t) {
    case '#':
      return boxHit(x, y, r, x0, y0, x0 + TILE, y0 + TILE);
    case 'w':
      return !bullet && boxHit(x, y, r, x0, y0, x0 + TILE, y0 + TILE);
    case 'u': {
      // Furniture: a little smaller than its tile, low enough to shoot over.
      const m = SHAPES.furniture;
      return !bullet && boxHit(x, y, r, x0 + m, y0 + m, x0 + TILE - m, y0 + TILE - m);
    }
    case 'f': {
      if (bullet) return false;
      const h = SHAPES.fence;
      return fenceVertical(tx, ty)
        ? boxHit(x, y, r, x0 + c - h, y0, x0 + c + h, y0 + TILE)
        : boxHit(x, y, r, x0, y0 + c - h, x0 + TILE, y0 + c + h);
    }
    case 't': {
      const s = treeSpot(tx, ty);
      return circleHit(x, y, r, s.x, s.y, SHAPES.trunk);
    }
    case 'k':
      return circleHit(x, y, r, x0 + c, y0 + c, SHAPES.rock);
    case 'r':
      return state.racks[tileIndex(tx, ty)] > 0 && circleHit(x, y, r, x0 + c, y0 + c, SHAPES.crate);
    default:
      return false;
  }
};

/** Walls, trunks, rocks, standing crates and Deprecated walls stop bullets. Windows, fences and plants don't. */
export const solidAt = (state: GameState, x: number, y: number) => {
  const tx = toTile(x);
  const ty = toTile(y);
  // Trunks can stand up to 0.4 m off their tile, so check the neighbours too.
  for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) if (tileHit(state, i, j, x, y, 0, true)) return true;
  return state.walls.some((w) => Math.abs(x - w.x) <= w.w / 2 && Math.abs(y - w.y) <= w.h / 2);
};

export const circleBlocked = (state: GameState, x: number, y: number, r: number) => {
  // The tree line around the map is the edge of the world, whatever gaps its trunks leave.
  const edge = TILE * 2;
  if (x < edge + r || y < edge + r || x > WORLD - edge - r || y > WORLD - edge - r) return true;
  for (let ty = toTile(y - r) - 1; ty <= toTile(y + r) + 1; ty++) {
    for (let tx = toTile(x - r) - 1; tx <= toTile(x + r) + 1; tx++) if (tileHit(state, tx, ty, x, y, r, false)) return true;
  }
  return state.walls.some((w) => Math.abs(x - w.x) < w.w / 2 + r && Math.abs(y - w.y) < w.h / 2 + r);
};

const moveBy = (state: GameState, p: Player, dx: number, dy: number) => {
  if (!circleBlocked(state, p.x + dx, p.y, PLAYER_RADIUS)) p.x += dx;
  if (!circleBlocked(state, p.x, p.y + dy, PLAYER_RADIUS)) p.y += dy;
};

export const lineOfSight = (state: GameState, x0: number, y0: number, x1: number, y1: number) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 0.5);
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    if (solidAt(state, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false;
  }
  return true;
};

/** Can `viewer` see `target`? Plants hide you unless someone is very close or you just fired. */
export const canSee = (state: GameState, viewer: Player, target: Player) => {
  if (!target.alive || target.stage !== 'ground') return false;
  if (viewer.id === target.id) return true;
  const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
  if (inPlant(target.x, target.y) && target.revealed <= 0 && d > PLANT_REVEAL) return false;
  return true;
};

/** Nearest open spot to (x, y), searching outwards. */
const freeSpot = (state: GameState, x: number, y: number) => {
  for (let ring = 0; ring < 12; ring++) {
    for (let i = 0; i < Math.max(1, ring * 8); i++) {
      const a = (i / Math.max(1, ring * 8)) * Math.PI * 2;
      const cx = Math.min(WORLD - 3, Math.max(3, x + Math.cos(a) * ring * 0.8));
      const cy = Math.min(WORLD - 3, Math.max(3, y + Math.sin(a) * ring * 0.8));
      if (!circleBlocked(state, cx, cy, PLAYER_RADIUS + 0.1)) return { x: cx, y: cy };
    }
  }
  return { x: CENTER, y: CENTER };
};

// ---------- setup

const rollLoot = (state: GameState): LootKind => LOOT_TABLE[Math.floor(nextRandom(state) * LOOT_TABLE.length)] as LootKind;

const addLoot = (state: GameState, kind: LootKind, x: number, y: number, ammo?: number) => {
  state.loot.push({ id: state.nextId++, kind, x, y, ammo: ammo ?? (isWeapon(kind) ? WEAPONS[kind].ammo : 0), active: true });
};

export const createGame = (you: FighterId, seed = 1, youName = 'you', others: FighterId[] = []): GameState => {
  const racks = new Array(SIZE * SIZE).fill(0);
  MAP.forEach((row, ty) => [...row].forEach((c, tx) => c === 'r' && (racks[tileIndex(tx, ty)] = RACK_HP)));
  const state: GameState = {
    tick: 0,
    phase: 'drop',
    seed,
    nextId: 1,
    drone: { x0: 0, y0: 0, x1: 0, y1: 0, t: 0 },
    racks,
    players: [],
    projectiles: [],
    loot: [],
    walls: [],
    fields: [],
    zone: {
      phase: 0, state: 'wait', timer: ZONE_PHASES[0].wait, cx: CENTER, cy: CENTER, r: ZONE_START_RADIUS,
      fromX: CENTER, fromY: CENTER, fromR: ZONE_START_RADIUS, toX: CENTER, toY: CENTER, toR: ZONE_PHASES[0].radius, dps: 0,
    },
    winner: null,
    events: [],
  };
  pickNextCircle(state);

  // The drone flies a random line across the campus.
  const a = nextRandom(state) * Math.PI * 2;
  const off = (nextRandom(state) - 0.5) * WORLD * 0.3;
  const reach = WORLD * 0.62;
  state.drone = {
    x0: CENTER - Math.cos(a) * reach - Math.sin(a) * off,
    y0: CENTER - Math.sin(a) * reach + Math.cos(a) * off,
    x1: CENTER + Math.cos(a) * reach - Math.sin(a) * off,
    y1: CENTER + Math.sin(a) * reach + Math.cos(a) * off,
    t: 0,
  };

  for (let i = 0; i < PLAYERS; i++) {
    const fighter = i === 0 ? you : others[i - 1] ?? FIGHTER_IDS[Math.floor(nextRandom(state) * FIGHTER_IDS.length)];
    state.players.push(newPlayer(i, i === 0 ? youName : BOT_NAMES[i - 1], fighter, i !== 0, state.drone.x0, state.drone.y0));
  }

  MAP.forEach((row, ty) =>
    [...row].forEach((c, tx) => {
      if (c === 'l' || (c === 's' && nextRandom(state) < 0.7)) addLoot(state, rollLoot(state), tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    }),
  );
  return state;
};

const newPlayer = (id: number, name: string, fighter: FighterId, bot: boolean, x: number, y: number): Player => ({
  id, name, fighter, bot,
  stage: 'drone',
  fall: 0,
  x, y,
  vx: 0,
  vy: 0,
  heading: 0,
  hp: FIGHTERS[fighter].hp,
  maxHp: FIGHTERS[fighter].hp,
  armor: 0,
  alive: true,
  weapon: 'fists',
  ammo: Infinity,
  cooldown: 0,
  item: null,
  superCharge: 0,
  healLeft: 0,
  sinceCombat: 99,
  revealed: 0,
  dashTime: 0,
  dashAngle: 0,
  dashHit: [],
  slowed: 0,
  kills: 0,
  damage: 0,
  placement: 0,
  lastHitBy: null,
  prev: { ...NO_INPUT },
});

// ---------- the drop

const updateDrop = (state: GameState, inputs: Input[]) => {
  const d = state.drone;
  d.t = Math.min(1, d.t + DT / DROP.flight);
  const dx = d.x0 + (d.x1 - d.x0) * d.t;
  const dy = d.y0 + (d.y1 - d.y0) * d.t;
  // Past the far fence everyone still aboard is pushed out.
  const overCampus = dx > 4 && dy > 4 && dx < WORLD - 4 && dy < WORLD - 4;
  for (const p of state.players) {
    if (p.stage === 'ground') continue;
    const input = inputs[p.id] ?? NO_INPUT;
    if (p.stage === 'drone') {
      p.x = dx;
      p.y = dy;
      // Holding jump works too: you go as soon as the drone is over the campus.
      const jump = input.jump || input.fire;
      if ((jump && overCampus) || d.t >= 0.92) {
        p.stage = 'falling';
        p.fall = DROP.freefall + DROP.chute;
        p.x = Math.min(WORLD - 4, Math.max(4, p.x));
        p.y = Math.min(WORLD - 4, Math.max(4, p.y));
        state.events.push({ type: 'jump', player: p.id });
      }
    } else if (p.stage === 'falling') {
      // Steer on the way down: fast in free fall, gentle under the parachute.
      const len = Math.hypot(input.mx, input.my);
      const speed = p.fall > DROP.chute ? DROP.freefallSpeed : DROP.chuteSpeed;
      if (len > 0.01) {
        p.x = Math.min(WORLD - 4, Math.max(4, p.x + (input.mx / Math.max(1, len)) * speed * DT));
        p.y = Math.min(WORLD - 4, Math.max(4, p.y + (input.my / Math.max(1, len)) * speed * DT));
        p.heading = Math.atan2(input.my, input.mx);
      }
      p.fall -= DT;
      if (p.fall <= 0) {
        const spot = freeSpot(state, p.x, p.y);
        p.x = spot.x;
        p.y = spot.y;
        p.stage = 'ground';
        state.events.push({ type: 'land', player: p.id, x: p.x, y: p.y });
      }
    }
    p.prev = { ...input };
  }
  if (state.players.every((p) => p.stage === 'ground')) state.phase = 'play';
};

// ---------- the Deadline

const pickNextCircle = (state: GameState) => {
  const z = state.zone;
  const def = ZONE_PHASES[z.phase];
  if (!def) return;
  const room = Math.max(0, z.r - def.radius) * 0.6;
  const a = nextRandom(state) * Math.PI * 2;
  const d = Math.sqrt(nextRandom(state)) * room;
  z.toX = Math.min(WORLD - 8, Math.max(8, z.cx + Math.cos(a) * d));
  z.toY = Math.min(WORLD - 8, Math.max(8, z.cy + Math.sin(a) * d));
  z.toR = def.radius;
};

const updateZone = (state: GameState) => {
  const z = state.zone;
  const def = ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)];
  z.timer -= DT;
  if (z.state === 'wait' && z.timer <= 0) {
    Object.assign(z, { state: 'shrink', timer: def.shrink, fromX: z.cx, fromY: z.cy, fromR: z.r, dps: def.dps });
    state.events.push({ type: 'zone', phase: z.phase, state: 'shrink' });
  } else if (z.state === 'shrink') {
    const k = 1 - Math.max(0, z.timer) / def.shrink;
    z.cx = z.fromX + (z.toX - z.fromX) * k;
    z.cy = z.fromY + (z.toY - z.fromY) * k;
    z.r = z.fromR + (z.toR - z.fromR) * k;
    if (z.timer <= 0) {
      z.phase += 1;
      if (z.phase >= ZONE_PHASES.length) z.state = 'done';
      else {
        z.state = 'wait';
        z.timer = ZONE_PHASES[z.phase].wait;
        pickNextCircle(state);
      }
      state.events.push({ type: 'zone', phase: z.phase, state: z.state });
    }
  }
  if (z.dps > 0) {
    for (const p of state.players) {
      if (p.alive && Math.hypot(p.x - z.cx, p.y - z.cy) > z.r) hurt(state, p, z.dps * DT, null, true, true);
    }
  }
};

// ---------- damage and KOs

const alivePlayers = (state: GameState) => state.players.filter((p) => p.alive);

const hurt = (state: GameState, target: Player, amount: number, by: number | null, quiet = false, ignoreArmor = false) => {
  if (!target.alive || state.phase === 'over' || target.stage !== 'ground') return;
  if (target.dashTime > 0 && by !== null) return;
  // Armor soaks part of every hit until it's gone. The Deadline ignores it.
  const soaked = ignoreArmor ? 0 : Math.min(target.armor, amount * ARMOR.absorb);
  target.armor -= soaked;
  target.hp -= amount - soaked;
  target.sinceCombat = 0;
  if (by !== null && by !== target.id) {
    const a = state.players[by];
    a.damage += amount;
    a.sinceCombat = 0;
    a.superCharge = Math.min(1, a.superCharge + amount / FIGHTERS[a.fighter].superCost);
    target.lastHitBy = by;
  }
  if (!quiet) state.events.push({ type: 'hit', target: target.id, by, x: target.x, y: target.y, damage: amount, armor: soaked > 0, ko: target.hp <= 0 });
  if (target.hp <= 0) knockOut(state, target);
};

const knockOut = (state: GameState, p: Player) => {
  p.placement = alivePlayers(state).length;
  p.alive = false;
  p.hp = 0;
  const by = p.lastHitBy;
  if (by !== null && state.players[by].alive) state.players[by].kills += 1;
  state.events.push({ type: 'ko', victim: p.id, by, x: p.x, y: p.y });
  // Everything you carried is up for grabs.
  if (p.weapon !== 'fists' && p.ammo > 0) addLoot(state, p.weapon, p.x + 0.8, p.y, p.ammo);
  if (p.item) addLoot(state, p.item, p.x - 0.8, p.y);
  if (p.armor > 50) addLoot(state, 'armor', p.x, p.y + 0.8);
  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    state.phase = 'over';
    state.winner = alive[0]?.id ?? p.id;
    if (alive[0]) alive[0].placement = 1;
    state.events.push({ type: 'win', player: state.winner });
  }
};

const damageRacksAround = (state: GameState, x: number, y: number, radius: number, amount: number) => {
  for (let ty = toTile(y - radius); ty <= toTile(y + radius); ty++) {
    for (let tx = toTile(x - radius); tx <= toTile(x + radius); tx++) {
      if (Math.hypot(tx * TILE + TILE / 2 - x, ty * TILE + TILE / 2 - y) <= radius + TILE / 2) hitRack(state, tx, ty, amount);
    }
  }
};

const hitRack = (state: GameState, tx: number, ty: number, amount: number) => {
  const i = tileIndex(tx, ty);
  if (tileAt(tx, ty) !== 'r' || state.racks[i] <= 0) return;
  state.racks[i] -= amount;
  if (state.racks[i] <= 0) {
    state.racks[i] = 0;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    state.events.push({ type: 'rackBroken', x, y });
    if (nextRandom(state) < 0.4) addLoot(state, rollLoot(state), x, y);
  }
};

const explode = (state: GameState, owner: number, x: number, y: number, radius: number, damage: number) => {
  state.events.push({ type: 'explosion', x, y, radius });
  for (const o of state.players) {
    if (!o.alive || o.stage !== 'ground') continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d > radius + PLAYER_RADIUS) continue;
    const self = o.id === owner ? 0.5 : 1;
    hurt(state, o, damage * self * (1 - 0.7 * Math.min(1, d / radius)), owner === o.id ? null : owner);
  }
  damageRacksAround(state, x, y, radius * 0.6, damage);
};

// ---------- weapons, supers and items

const fireBullet = (state: GameState, p: Player, angle: number) => {
  const w = WEAPONS[p.weapon];
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'bullet',
    x: p.x + Math.cos(angle) * 0.6, y: p.y + Math.sin(angle) * 0.6,
    vx: Math.cos(angle) * w.speed, vy: Math.sin(angle) * w.speed,
    damage: w.damage, life: w.range / w.speed,
    sx: 0, sy: 0, tx: 0, ty: 0, t: 0, duration: 0, radius: 0,
  });
};

const lob = (state: GameState, p: Player, aimX: number, aimY: number, range: number, damage: number, radius: number) => {
  const a = Math.atan2(aimY - p.y, aimX - p.x);
  const d = Math.min(range, Math.hypot(aimX - p.x, aimY - p.y));
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'lob',
    x: p.x, y: p.y, vx: 0, vy: 0, damage, life: 99,
    sx: p.x, sy: p.y, tx: p.x + Math.cos(a) * d, ty: p.y + Math.sin(a) * d,
    t: 0, duration: 0.35 + d / 22, radius,
  });
};

const shoot = (state: GameState, p: Player, input: Input) => {
  const w = WEAPONS[p.weapon];
  p.cooldown = w.rate;
  p.revealed = 1;
  if (w.lob) lob(state, p, input.aimX, input.aimY, w.range, w.damage, w.lob.radius);
  else if (w.bullets > 1) {
    for (let i = 0; i < w.bullets; i++) fireBullet(state, p, p.heading - w.spread / 2 + (w.spread * i) / (w.bullets - 1));
  } else fireBullet(state, p, p.heading + (nextRandom(state) - 0.5) * w.spread);
  state.events.push({ type: 'shot', owner: p.id, x: p.x, y: p.y, angle: p.heading, weapon: p.weapon });
  if (p.weapon !== 'fists') {
    p.ammo -= 1;
    if (p.ammo <= 0) {
      p.weapon = 'fists';
      p.ammo = Infinity;
    }
  }
};

const useSuper = (state: GameState, p: Player, input: Input) => {
  p.superCharge = 0;
  p.revealed = 1.5;
  const cos = Math.cos(p.heading);
  const sin = Math.sin(p.heading);
  switch (p.fighter) {
    case 'hotfix':
      p.dashTime = SUPERS.deploy.time;
      p.dashAngle = p.heading;
      p.dashHit = [];
      break;
    case 'legacy': {
      const s = SUPERS.deprecated;
      const across = Math.abs(cos) > Math.abs(sin);
      state.walls.push({ x: p.x + cos * s.ahead, y: p.y + sin * s.ahead, w: across ? s.thickness : s.length, h: across ? s.length : s.thickness, life: s.life });
      break;
    }
    case 'standup': {
      const s = SUPERS.timebox;
      const d = Math.min(s.reach, Math.hypot(input.aimX - p.x, input.aimY - p.y));
      state.fields.push({ x: p.x + cos * d, y: p.y + sin * d, r: s.radius, life: s.life, owner: p.id });
      break;
    }
    case 'intern': {
      const s = SUPERS.push;
      state.events.push({ type: 'explosion', x: p.x, y: p.y, radius: s.radius });
      for (const o of state.players) {
        if (!o.alive || o.id === p.id || o.stage !== 'ground') continue;
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > s.radius) continue;
        hurt(state, o, s.damage, p.id);
        const k = (s.knockback * (1 - d / s.radius)) / Math.max(0.3, d);
        for (let i = 0; i < 6; i++) moveBy(state, o, (dx * k) / 6, (dy * k) / 6);
      }
      damageRacksAround(state, p.x, p.y, s.radius * 0.6, s.damage * 3);
      break;
    }
  }
  state.events.push({ type: 'super', owner: p.id, fighter: p.fighter, x: p.x, y: p.y, angle: p.heading });
};

/** The loot you're standing on, if any. */
export const lootUnder = (state: GameState, p: Player): Loot | null => {
  let best: Loot | null = null;
  let bestD = 1.2;
  for (const k of state.loot) {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (k.active && d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best;
};

const takeLoot = (state: GameState, p: Player, k: Loot) => {
  if (isWeapon(k.kind)) {
    // Swap: drop what you hold (if it's a real gun) where you stand.
    if (p.weapon !== 'fists' && p.ammo > 0) addLoot(state, p.weapon, p.x, p.y + 0.4, p.ammo);
    p.weapon = k.kind;
    p.ammo = k.ammo;
  } else if (k.kind === 'armor') {
    p.armor = ARMOR.points;
  } else {
    if (p.item) addLoot(state, p.item, p.x, p.y + 0.4);
    p.item = k.kind;
  }
  k.active = false;
  state.events.push({ type: 'pickup', player: p.id, kind: k.kind });
};

/** Picked up without pressing anything: a gun when you only have fists, armor when you need it, an item into an empty slot. */
const autoTakes = (p: Player, k: Loot) =>
  (isWeapon(k.kind) && p.weapon === 'fists') ||
  (k.kind === 'armor' && p.armor < ARMOR.points * 0.5) ||
  ((k.kind === 'medkit' || k.kind === 'bomb') && p.item === null);

const useItem = (state: GameState, p: Player, input: Input) => {
  if (p.item === 'bomb') {
    lob(state, p, input.aimX, input.aimY, ITEMS.bomb.range, ITEMS.bomb.damage, ITEMS.bomb.radius);
    p.revealed = 1;
  } else if (p.item === 'medkit') {
    p.healLeft += ITEMS.medkit.heal;
  }
  p.item = null;
};

// ---------- per tick

const updatePlayer = (state: GameState, p: Player, input: Input) => {
  const pressed = (k: 'super' | 'use') => input[k] && !p.prev[k];
  p.cooldown = Math.max(0, p.cooldown - DT);
  p.revealed = Math.max(0, p.revealed - DT);
  p.slowed = Math.max(0, p.slowed - DT);
  p.sinceCombat += DT;

  if (p.healLeft > 0) {
    const h = Math.min(p.healLeft, (ITEMS.medkit.heal / ITEMS.medkit.over) * DT);
    p.healLeft -= h;
    p.hp = Math.min(p.maxHp, p.hp + h);
  } else if (p.sinceCombat >= REGEN.after) {
    p.hp = Math.min(p.maxHp, p.hp + REGEN.perSecond * DT);
  }

  // Turn towards the aim at a limited rate, never snapping.
  if (Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.05) {
    const want = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    let d = want - p.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxTurn = MOVE.turn * DT;
    p.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
  }

  if (p.dashTime > 0) {
    p.dashTime -= DT;
    const v = SUPERS.deploy.distance / SUPERS.deploy.time;
    moveBy(state, p, Math.cos(p.dashAngle) * v * DT, Math.sin(p.dashAngle) * v * DT);
    for (const o of state.players) {
      if (!o.alive || o.id === p.id || p.dashHit.includes(o.id)) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < PLAYER_RADIUS * 2.2) {
        p.dashHit.push(o.id);
        hurt(state, o, SUPERS.deploy.damage, p.id);
      }
    }
  } else {
    // Accelerate towards the wanted velocity, ease off when the keys are released.
    const len = Math.hypot(input.mx, input.my);
    const top = FIGHTERS[p.fighter].speed * (p.slowed > 0 ? SUPERS.timebox.slow : 1);
    const wantX = len > 0.01 ? (input.mx / Math.max(1, len)) * top : 0;
    const wantY = len > 0.01 ? (input.my / Math.max(1, len)) * top : 0;
    const rate = (len > 0.01 ? MOVE.accel : MOVE.friction) * DT;
    const dvx = wantX - p.vx;
    const dvy = wantY - p.vy;
    const dv = Math.hypot(dvx, dvy);
    if (dv > 0) {
      const k = Math.min(1, rate / dv);
      p.vx += dvx * k;
      p.vy += dvy * k;
    }
    const bx = p.x;
    const by = p.y;
    moveBy(state, p, p.vx * DT, p.vy * DT);
    // Hitting a wall kills the velocity along it.
    if (Math.abs(p.x - bx) < Math.abs(p.vx * DT) * 0.5) p.vx = 0;
    if (Math.abs(p.y - by) < Math.abs(p.vy * DT) * 0.5) p.vy = 0;
  }

  if (input.fire && p.cooldown <= 0) shoot(state, p, input);
  if (pressed('super') && p.superCharge >= 1 && p.dashTime <= 0) useSuper(state, p, input);

  const k = lootUnder(state, p);
  if (k && autoTakes(p, k)) takeLoot(state, p, k);
  else if (pressed('use')) {
    if (k) takeLoot(state, p, k);
    else if (p.item) useItem(state, p, input);
  }
  p.prev = { ...input };
};

const updateProjectile = (state: GameState, pr: Projectile) => {
  if (pr.kind === 'lob') {
    pr.t = Math.min(1, pr.t + DT / pr.duration);
    pr.x = pr.sx + (pr.tx - pr.sx) * pr.t;
    pr.y = pr.sy + (pr.ty - pr.sy) * pr.t;
    if (pr.t >= 1) {
      explode(state, pr.owner, pr.tx, pr.ty, pr.radius, pr.damage);
      return false;
    }
    return true;
  }
  pr.life -= DT;
  if (pr.life <= 0) return false;
  const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * DT) / 0.4));
  for (let s = 0; s < steps; s++) {
    pr.x += (pr.vx * DT) / steps;
    pr.y += (pr.vy * DT) / steps;
    if (solidAt(state, pr.x, pr.y)) {
      hitRack(state, toTile(pr.x), toTile(pr.y), pr.damage);
      state.events.push({ type: 'impact', x: pr.x, y: pr.y });
      return false;
    }
    for (const o of state.players) {
      if (!o.alive || o.id === pr.owner || o.stage !== 'ground') continue;
      if (Math.hypot(o.x - pr.x, o.y - pr.y) < PLAYER_RADIUS + 0.15) {
        hurt(state, o, pr.damage, pr.owner);
        return false;
      }
    }
  }
  return true;
};

/** Advances the match by one fixed tick. `inputs[i]` belongs to player i. Mutates and returns the state. */
export const step = (state: GameState, inputs: Input[]): GameState => {
  state.events = [];
  state.tick += 1;
  // Landed players play while others are still in the air; the Deadline waits for everyone.
  if (state.phase === 'drop') updateDrop(state, inputs);
  for (const p of state.players) if (p.alive && p.stage === 'ground') updatePlayer(state, p, inputs[p.id] ?? NO_INPUT);
  state.projectiles = state.projectiles.filter((pr) => updateProjectile(state, pr));
  for (const fld of state.fields) {
    fld.life -= DT;
    for (const o of state.players) if (o.alive && o.id !== fld.owner && Math.hypot(o.x - fld.x, o.y - fld.y) < fld.r) o.slowed = 0.2;
  }
  state.fields = state.fields.filter((fld) => fld.life > 0);
  for (const w of state.walls) w.life -= DT;
  state.walls = state.walls.filter((w) => w.life > 0);
  state.loot = state.loot.filter((k) => k.active);
  if (state.phase === 'play') updateZone(state);
  return state;
};
