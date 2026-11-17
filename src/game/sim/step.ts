import {
  ARMOR,
  BOT_NAMES,
  DROP,
  AMMO_BOX_MAGS,
  DT,
  fenceVertical,
  LEAN,
  ROLL,
  railSides,
  SWIM,
  START_WEAPON,
  THROW,
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
  VAULT,
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
export const inPlant = (x: number, y: number) => 'bch'.includes(tileAt(toTile(x), toTile(y)));
/** In the river or the pond: you swim, slowly, with no gun up. */
export const inWater = (x: number, y: number) => tileAt(toTile(x), toTile(y)) === 'o';

/** The rails of a bridge or pier tile: a thin box on each side that borders water. */
const railBoxes = (tx: number, ty: number) => {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const t = 0.12;
  const out: [number, number, number, number][] = [];
  const r = railSides(tx, ty);
  if (r.w) out.push([x0, y0, x0 + t, y0 + TILE]);
  if (r.e) out.push([x0 + TILE - t, y0, x0 + TILE, y0 + TILE]);
  if (r.n) out.push([x0, y0, x0 + TILE, y0 + t]);
  if (r.s) out.push([x0, y0 + TILE - t, x0 + TILE, y0 + TILE]);
  return out;
};

/** How far a rocket or bomb held for `charge` seconds will go (metres). */
export const throwDistance = (charge: number, range: number) => THROW.min + (range - THROW.min) * Math.min(1, charge / THROW.full);

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
    case 'v':
      return boxHit(x, y, r, x0, y0, x0 + TILE, y0 + TILE);
    case 'd':
      // Bridge and pier rails: thin, on the sides that face the water; bullets pass.
      return !bullet && railBoxes(tx, ty).some((b) => boxHit(x, y, r, b[0], b[1], b[2], b[3]));
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

/**
 * Push a circle out of everything it overlaps (walls, rails, trunks, rocks, crates, furniture,
 * Deprecated walls, the map edge). Pushing along each contact's normal is what makes you slide
 * along walls and glide round trunks instead of stopping dead. Returns the vaultable tile you
 * pressed against, if any.
 */
const pushOut = (state: GameState, pos: { x: number; y: number }, r: number) => {
  let vaultable: string | null = null;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const outBox = (x0: number, y0: number, x1: number, y1: number) => {
      const nx = Math.max(x0, Math.min(pos.x, x1));
      const ny = Math.max(y0, Math.min(pos.y, y1));
      const dx = pos.x - nx;
      const dy = pos.y - ny;
      const d = Math.hypot(dx, dy);
      if (d >= r) return false;
      if (d > 1e-6) {
        pos.x += (dx / d) * (r - d);
        pos.y += (dy / d) * (r - d);
      } else {
        // The centre is inside the box: leave by the nearest side.
        const l = pos.x - x0 + r;
        const rr = x1 - pos.x + r;
        const t = pos.y - y0 + r;
        const b = y1 - pos.y + r;
        const m = Math.min(l, rr, t, b);
        if (m === l) pos.x -= l;
        else if (m === rr) pos.x += rr;
        else if (m === t) pos.y -= t;
        else pos.y += b;
      }
      moved = true;
      return true;
    };
    const outCircle = (cx: number, cy: number, cr: number) => {
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= r + cr) return false;
      const k = d > 1e-6 ? (r + cr - d) / d : 0;
      if (d > 1e-6) {
        pos.x += dx * k;
        pos.y += dy * k;
      } else pos.x += r + cr;
      moved = true;
      return true;
    };
    for (let ty = toTile(pos.y - r) - 1; ty <= toTile(pos.y + r) + 1; ty++) {
      for (let tx = toTile(pos.x - r) - 1; tx <= toTile(pos.x + r) + 1; tx++) {
        const t = tileAt(tx, ty);
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const c = TILE / 2;
        if (t === '#' || t === 'v') outBox(x0, y0, x0 + TILE, y0 + TILE);
        else if (t === 'w') {
          if (outBox(x0, y0, x0 + TILE, y0 + TILE)) vaultable = 'w';
        } else if (t === 'f') {
          const h = SHAPES.fence;
          const hit = fenceVertical(tx, ty) ? outBox(x0 + c - h, y0, x0 + c + h, y0 + TILE) : outBox(x0, y0 + c - h, x0 + TILE, y0 + c + h);
          if (hit) vaultable = 'f';
        } else if (t === 'd') {
          for (const b of railBoxes(tx, ty)) if (outBox(b[0], b[1], b[2], b[3])) vaultable = 'd';
        } else if (t === 'u') {
          const m = SHAPES.furniture;
          if (outBox(x0 + m, y0 + m, x0 + TILE - m, y0 + TILE - m)) vaultable = 'u';
        } else if (t === 't') {
          const sp = treeSpot(tx, ty);
          outCircle(sp.x, sp.y, SHAPES.trunk);
        } else if (t === 'k') outCircle(x0 + c, y0 + c, SHAPES.rock);
        else if (t === 'r' && state.racks[tileIndex(tx, ty)] > 0) outCircle(x0 + c, y0 + c, SHAPES.crate);
      }
    }
    for (const w of state.walls) outBox(w.x - w.w / 2, w.y - w.h / 2, w.x + w.w / 2, w.y + w.h / 2);
    const edge = TILE * 2 + r;
    const cx = Math.min(WORLD - edge, Math.max(edge, pos.x));
    const cy = Math.min(WORLD - edge, Math.max(edge, pos.y));
    if (cx !== pos.x || cy !== pos.y) {
      pos.x = cx;
      pos.y = cy;
      moved = true;
    }
    if (!moved) break;
  }
  return vaultable;
};

/** Move by (dx, dy) in small steps (so nothing thin is skipped), sliding along whatever is hit. */
const moveBy = (state: GameState, p: Player, dx: number, dy: number) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
  const pos = { x: p.x, y: p.y };
  let vaultable: string | null = null;
  for (let i = 0; i < steps; i++) {
    pos.x += dx / steps;
    pos.y += dy / steps;
    vaultable = pushOut(state, pos, PLAYER_RADIUS) ?? vaultable;
  }
  p.x = pos.x;
  p.y = pos.y;
  return vaultable;
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
/** On the ground, or hanging under an open parachute: you can be seen, aimed at and hit. */
export const targetable = (p: Player) => p.alive && (p.stage === 'ground' || (p.stage === 'falling' && p.fall <= DROP.chute));

/** Where a player's body is for bullets: leaning out moves the exposed shoulder sideways. */
export const hitPoint = (p: Player) => ({
  x: p.x - Math.sin(p.heading) * p.lean * LEAN.offset * 0.7,
  y: p.y + Math.cos(p.heading) * p.lean * LEAN.offset * 0.7,
});

export const canSee = (state: GameState, viewer: Player, target: Player) => {
  if (!targetable(target)) return false;
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
  weapon: START_WEAPON.kind,
  mag: START_WEAPON.mag,
  ammo: START_WEAPON.spare,
  reload: 0,
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
  vault: 0,
  vaultFrom: { x, y },
  vaultTo: { x, y },
  pushing: 0,
  lean: 0,
  rolling: 0,
  rollDir: 0,
  rollCooldown: 0,
  zoneSum: 0,
  zoneClock: 0,
  charge: 0,
  charging: null,
  kills: 0,
  damage: 0,
  placement: 0,
  lastHitBy: null,
  lastHitWith: null,
  killedBy: null,
  killedWith: null,
  diedAt: 0,
  shots: 0,
  hits: 0,
  distance: 0,
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
      const chute = p.fall <= DROP.chute;
      const speed = chute ? DROP.chuteSpeed : DROP.freefallSpeed;
      p.vx = len > 0.01 ? (input.mx / Math.max(1, len)) * speed : 0;
      p.vy = len > 0.01 ? (input.my / Math.max(1, len)) * speed : 0;
      p.x = Math.min(WORLD - 4, Math.max(4, p.x + p.vx * DT));
      p.y = Math.min(WORLD - 4, Math.max(4, p.y + p.vy * DT));
      if (chute) {
        // Under the canopy you can aim and shoot at whoever is in the air or below.
        p.cooldown = Math.max(0, p.cooldown - DT);
        updateReload(p);
        if (Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.05) p.heading = Math.atan2(input.aimY - p.y, input.aimX - p.x);
        if (input.fire && p.cooldown <= 0) shoot(state, p, input);
      } else if (len > 0.01) p.heading = Math.atan2(input.my, input.mx);
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
      if (!p.alive) continue;
      if (Math.hypot(p.x - z.cx, p.y - z.cy) > z.r) {
        // Armor first, then health; reported once a second so it can be shown.
        const before = p.hp + p.armor;
        p.lastHitWith = 'zone';
        hurt(state, p, z.dps * DT, null, true, false);
        p.zoneSum += before - (p.hp + p.armor);
        p.zoneClock += DT;
        if (p.zoneClock >= 1 || !p.alive) {
          state.events.push({ type: 'zoneHurt', player: p.id, x: p.x, y: p.y, amount: Math.round(p.zoneSum) });
          p.zoneSum = 0;
          p.zoneClock = 0;
        }
      } else {
        p.zoneSum = 0;
        p.zoneClock = 0;
      }
    }
  }
};

// ---------- damage and KOs

const alivePlayers = (state: GameState) => state.players.filter((p) => p.alive);

const hurt = (state: GameState, target: Player, amount: number, by: number | null, quiet = false, ignoreArmor = false) => {
  if (state.phase === 'over' || !targetable(target)) return;
  if (target.dashTime > 0 && by !== null) return;
  // Early in a dodge roll, bullets and blasts from players miss.
  if (target.rolling > ROLL.time - ROLL.iframes && by !== null) return;
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
  p.diedAt = state.tick;
  p.killedWith = p.lastHitWith;
  // The Deadline's last bite: nobody gets the kill.
  const by = p.lastHitWith === 'zone' ? null : p.lastHitBy;
  p.killedBy = by;
  if (by !== null && state.players[by].alive) state.players[by].kills += 1;
  state.events.push({ type: 'ko', victim: p.id, by, with: p.killedWith, x: p.x, y: p.y });
  // Everything you carried is up for grabs.
  if (p.weapon !== 'fists' && roundsLeft(p) > 0) addLoot(state, p.weapon, p.x + 0.8, p.y, roundsLeft(p));
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
    o.lastHitWith = 'explosion';
    hurt(state, o, damage * self * (1 - 0.7 * Math.min(1, d / radius)), owner === o.id ? null : owner);
  }
  damageRacksAround(state, x, y, radius * 0.6, damage);
};

// ---------- weapons, supers and items

const fireBullet = (state: GameState, p: Player, angle: number) => {
  const w = WEAPONS[p.weapon];
  // Leaning out, the muzzle is out past the corner too.
  const o = hitPoint(p);
  const x = o.x + Math.cos(angle) * 0.6;
  const y = o.y + Math.sin(angle) * 0.6;
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'bullet', weapon: p.weapon,
    x, y,
    vx: Math.cos(angle) * w.speed, vy: Math.sin(angle) * w.speed,
    damage: w.damage, life: w.range / w.speed,
    sx: x, sy: y, tx: 0, ty: 0, t: 0, duration: 0, radius: 0,
  });
};

/** Damage after the distance the bullet flew: full up close, down to `min` of it far away. */
export const falloffDamage = (weapon: WeaponKind, damage: number, distance: number) => {
  const f = WEAPONS[weapon].falloff;
  if (distance <= f.start) return damage;
  const k = Math.min(1, (distance - f.start) / Math.max(0.01, f.end - f.start));
  return damage * (1 - (1 - f.min) * k);
};

const lob = (state: GameState, p: Player, aimX: number, aimY: number, range: number, damage: number, radius: number) => {
  const a = Math.atan2(aimY - p.y, aimX - p.x);
  const d = Math.min(range, Math.hypot(aimX - p.x, aimY - p.y));
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'lob', weapon: 'rockets',
    x: p.x, y: p.y, vx: 0, vy: 0, damage, life: 99,
    sx: p.x, sy: p.y, tx: p.x + Math.cos(a) * d, ty: p.y + Math.sin(a) * d,
    t: 0, duration: 0.35 + d / 22, radius,
  });
};

/** Rounds this player has for the gun in hand (magazine + spare). */
export const roundsLeft = (p: Player) => (p.weapon === 'fists' ? Infinity : p.mag + p.ammo);

const startReload = (state: GameState, p: Player) => {
  const w = WEAPONS[p.weapon];
  if (p.weapon === 'fists' || p.reload > 0 || p.ammo <= 0 || p.mag >= w.mag) return;
  p.reload = w.reload;
  state.events.push({ type: 'reload', player: p.id, weapon: p.weapon, x: p.x, y: p.y });
};

const shoot = (state: GameState, p: Player, input: Input) => {
  if (p.reload > 0) return;
  // Out of rounds altogether: the empty gun stays in your hands and you hit with it.
  const empty = p.weapon !== 'fists' && p.mag <= 0 && p.ammo <= 0;
  if (p.weapon !== 'fists' && p.mag <= 0 && !empty) {
    startReload(state, p);
    return;
  }
  if (empty && !p.prev.fire) state.events.push({ type: 'dryFire', player: p.id });
  const kind: WeaponKind = empty ? 'fists' : p.weapon;
  const w = WEAPONS[kind];
  p.cooldown = w.rate;
  p.revealed = 1;
  // Bullets go straight at the aim point; the body catches up with its turn a moment later.
  const aim = Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.3 ? Math.atan2(input.aimY - p.y, input.aimX - p.x) : p.heading;
  const keep = p.weapon;
  p.weapon = kind; // fireBullet reads the weapon
  if (w.lob) lob(state, p, input.aimX, input.aimY, w.range, w.damage, w.lob.radius);
  else if (w.bullets > 1) {
    for (let i = 0; i < w.bullets; i++) fireBullet(state, p, aim - w.spread / 2 + (w.spread * i) / (w.bullets - 1));
  } else fireBullet(state, p, aim + (nextRandom(state) - 0.5) * w.spread);
  p.weapon = keep;
  state.events.push({ type: 'shot', owner: p.id, x: p.x, y: p.y, angle: aim, weapon: kind });
  if (kind !== 'fists') p.shots += w.bullets;
  if (kind !== 'fists') {
    p.mag -= 1;
    if (p.mag <= 0) startReload(state, p);
  }
};

/** Fill the magazine when the reload finishes. */
const updateReload = (p: Player) => {
  if (p.reload <= 0) return;
  p.reload -= DT;
  if (p.reload > 0) return;
  p.reload = 0;
  const take = Math.min(WEAPONS[p.weapon].mag - p.mag, p.ammo);
  p.mag += take;
  p.ammo -= take;
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
        o.lastHitWith = 'super';
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
    // Swap: drop what you hold (if it still has rounds) where you stand.
    if (p.weapon !== 'fists' && roundsLeft(p) > 0) addLoot(state, p.weapon, p.x, p.y + 0.4, roundsLeft(p));
    p.weapon = k.kind;
    p.mag = Math.min(WEAPONS[k.kind].mag, k.ammo);
    p.ammo = k.ammo - p.mag;
    p.reload = 0;
  } else if (k.kind === 'ammo') {
    if (p.weapon === 'fists') return;
    p.ammo += WEAPONS[p.weapon].mag * AMMO_BOX_MAGS;
    if (p.mag <= 0) startReload(state, p);
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
  (isWeapon(k.kind) && (p.weapon === 'fists' || roundsLeft(p) === 0)) ||
  (k.kind === 'ammo' && p.weapon !== 'fists' && p.ammo < WEAPONS[p.weapon].mag * 2) ||
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
  const pressed = (k: 'super' | 'use' | 'reload' | 'roll') => input[k] && !p.prev[k];
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

  // Turn towards the aim at a limited rate, never snapping. Swimming, you face where you swim.
  const swimming = inWater(p.x, p.y);
  const swimTurn = swimming && Math.hypot(p.vx, p.vy) > 0.4;
  if (swimTurn || Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.05) {
    const want = swimTurn ? Math.atan2(p.vy, p.vx) : Math.atan2(input.aimY - p.y, input.aimX - p.x);
    let d = want - p.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxTurn = MOVE.turn * DT;
    p.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
  }

  updateReload(p);
  if (pressed('reload')) startReload(state, p);
  p.rollCooldown = Math.max(0, p.rollCooldown - DT);

  // The dodge roll: the way you're moving (or facing), sliding along whatever it meets.
  if (pressed('roll') && !swimming && p.rollCooldown <= 0 && p.rolling <= 0 && p.vault <= 0 && p.dashTime <= 0 && !p.charging) {
    const len = Math.hypot(input.mx, input.my);
    p.rollDir = len > 0.01 ? Math.atan2(input.my, input.mx) : p.heading;
    p.rolling = ROLL.time;
    p.rollCooldown = ROLL.cooldown;
    state.events.push({ type: 'roll', player: p.id, x: p.x, y: p.y });
  }
  if (p.rolling > 0) {
    p.rolling = Math.max(0, p.rolling - DT);
    const v = ROLL.distance / ROLL.time;
    p.vx = Math.cos(p.rollDir) * v;
    p.vy = Math.sin(p.rollDir) * v;
    moveBy(state, p, p.vx * DT, p.vy * DT);
    p.heading = p.rollDir;
    p.prev = { ...input };
    return;
  }

  if (p.vault > 0) {
    // Climbing over: a short arc from one side to the other, no shooting meanwhile.
    p.vault = Math.max(0, p.vault - DT);
    const k = 1 - p.vault / VAULT.time;
    const e = k * k * (3 - 2 * k);
    p.x = p.vaultFrom.x + (p.vaultTo.x - p.vaultFrom.x) * e;
    p.y = p.vaultFrom.y + (p.vaultTo.y - p.vaultFrom.y) * e;
    p.prev = { ...input };
    return;
  }

  if (p.dashTime > 0) {
    p.dashTime -= DT;
    const v = SUPERS.deploy.distance / SUPERS.deploy.time;
    moveBy(state, p, Math.cos(p.dashAngle) * v * DT, Math.sin(p.dashAngle) * v * DT);
    for (const o of state.players) {
      if (!o.alive || o.id === p.id || p.dashHit.includes(o.id)) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < PLAYER_RADIUS * 2.2) {
        p.dashHit.push(o.id);
        o.lastHitWith = 'super';
        hurt(state, o, SUPERS.deploy.damage, p.id);
      }
    }
  } else {
    // Accelerate towards the wanted velocity, ease off when the keys are released.
    const len = Math.hypot(input.mx, input.my);
    p.lean += ((swimming ? 0 : Math.max(-1, Math.min(1, input.lean))) - p.lean) * Math.min(1, LEAN.rate * DT);
    const top =
      FIGHTERS[p.fighter].speed * (p.slowed > 0 ? SUPERS.timebox.slow : 1) * (Math.abs(p.lean) > 0.3 ? LEAN.speed : 1) * (swimming ? SWIM.speed : 1);
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
    const toX = p.x + p.vx * DT;
    const toY = p.y + p.vy * DT;
    const vaultable = moveBy(state, p, p.vx * DT, p.vy * DT);
    // Whatever was pushed back is the contact normal: drop the velocity going into it and keep
    // the part along it, so you slide.
    const cx = p.x - toX;
    const cy = p.y - toY;
    const c = Math.hypot(cx, cy);
    if (c > 1e-5) {
      const nx = cx / c;
      const ny = cy / c;
      const into = p.vx * nx + p.vy * ny;
      if (into < 0) {
        p.vx -= into * nx;
        p.vy -= into * ny;
      }
    }
    // Keep pushing into a fence, window or low furniture and you climb over it.
    const pushingInto = vaultable && len > 0.01 && c > 1e-5 && (input.mx * cx + input.my * cy) / (len * c) < -0.6;
    p.pushing = pushingInto ? p.pushing + DT : 0;
    if (pushingInto && p.pushing >= VAULT.after) tryVault(state, p, -cx / c, -cy / c);
  }

  // People charge rockets and bombs: hold to throw farther, let go to throw. Bots throw at once.
  const rocketReady = WEAPONS[p.weapon].lob && p.mag > 0 && p.reload <= 0;
  if (swimming) {
    // Both hands are swimming: no shooting, no throwing.
    p.charging = null;
    p.charge = 0;
  } else if (!p.bot && rocketReady && (input.fire || p.charging === 'rockets')) {
    if (input.fire && p.cooldown <= 0) {
      p.charging = 'rockets';
      p.charge += DT;
    } else if (!input.fire && p.charging === 'rockets') {
      const w = WEAPONS[p.weapon];
      const d = throwDistance(p.charge, w.range);
      lob(state, p, p.x + Math.cos(p.heading) * d, p.y + Math.sin(p.heading) * d, w.range, w.damage, w.lob!.radius);
      p.cooldown = w.rate;
      p.revealed = 1;
      p.mag -= 1;
      state.events.push({ type: 'shot', owner: p.id, x: p.x, y: p.y, angle: p.heading, weapon: p.weapon });
      if (p.mag <= 0) startReload(state, p);
      p.charge = 0;
      p.charging = null;
    }
  } else if (input.fire && p.cooldown <= 0) shoot(state, p, input);
  else if (input.fire && p.weapon !== 'fists' && p.mag <= 0 && p.ammo <= 0 && !p.prev.fire) state.events.push({ type: 'dryFire', player: p.id });
  if (p.charging === 'rockets' && !WEAPONS[p.weapon].lob) {
    p.charging = null;
    p.charge = 0;
  }
  if (pressed('super') && !swimming && p.superCharge >= 1 && p.dashTime <= 0) useSuper(state, p, input);

  const k = lootUnder(state, p);
  if (k && autoTakes(p, k)) takeLoot(state, p, k);
  else if (!p.bot && !swimming && p.item === 'bomb' && !k && (input.use || p.charging === 'bomb')) {
    // A bomb: hold F to throw it farther, let go to throw.
    if (input.use) {
      p.charging = 'bomb';
      p.charge += DT;
    } else {
      const d = throwDistance(p.charge, ITEMS.bomb.range);
      lob(state, p, p.x + Math.cos(p.heading) * d, p.y + Math.sin(p.heading) * d, ITEMS.bomb.range, ITEMS.bomb.damage, ITEMS.bomb.radius);
      p.revealed = 1;
      p.item = null;
      p.charge = 0;
      p.charging = null;
    }
  } else if (pressed('use')) {
    if (k) takeLoot(state, p, k);
    else if (p.item && !swimming) useItem(state, p, input);
  }
  p.prev = { ...input };
};

/** Climb over what's in front (direction dx, dy), landing on the first free spot beyond it. */
const tryVault = (state: GameState, p: Player, dx: number, dy: number) => {
  // Snap to the nearest axis: fences, sills and furniture all line up with the grid.
  const ax = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0;
  const ay = ax === 0 ? Math.sign(dy) : 0;
  for (let d = 1.1; d <= VAULT.reach; d += 0.15) {
    const x = p.x + ax * d;
    const y = p.y + ay * d;
    if (!circleBlocked(state, x, y, PLAYER_RADIUS + 0.05)) {
      p.vault = VAULT.time;
      p.vaultFrom = { x: p.x, y: p.y };
      p.vaultTo = { x, y };
      p.vx = ax * 3;
      p.vy = ay * 3;
      p.pushing = 0;
      state.events.push({ type: 'vault', player: p.id, x: p.x, y: p.y });
      return;
    }
  }
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
      if (o.id === pr.owner || !targetable(o)) continue;
      const h = hitPoint(o);
      if (Math.hypot(h.x - pr.x, h.y - pr.y) < PLAYER_RADIUS + 0.15) {
        o.lastHitWith = pr.weapon;
        state.players[pr.owner].hits += 1;
        hurt(state, o, falloffDamage(pr.weapon, pr.damage, Math.hypot(pr.x - pr.sx, pr.y - pr.sy)), pr.owner);
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
  for (const p of state.players) {
    if (!p.alive || p.stage !== 'ground') continue;
    const x0 = p.x;
    const y0 = p.y;
    updatePlayer(state, p, inputs[p.id] ?? NO_INPUT);
    p.distance += Math.hypot(p.x - x0, p.y - y0);
  }
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
