import {
  ARMOR,
  BOT_NAMES,
  DROP,
  AMMO_BOX_MAGS,
  DT,
  fenceVertical,
  LEAN,
  CROUCH,
  ROCK_TOP,
  CRATE_TOP,
  chuteSink,
  dragAt,
  ROCKET,
  ROLL,
  railSides,
  SWIM,
  START_WEAPON,
  THROW,
  MOVE,
  SHAPES,
  treeSpot,
  FIGHTERS,
  foundRounds,
  HEALS,
  ITEMS,
  LOOT_SPOTS,
  LOOT_TABLES,
  lootTierAt,
  magOf,
  MAP,
  PACK,
  RARITY,
  SWAP_TIME,
  VEST,
  PLANT_REVEAL,
  PLAYER_RADIUS,
  PLAYERS,
  PROPS,
  RACK_HP,
  SIZE,
  SUPERS,
  TILE,
  tileAt,
  VAULT,
  WEAPONS,
  WORLD,
  ZONE_EDGE_SPEED,
  ZONE_PHASES,
  ZONE_RULES,
  ZONE_START_RADIUS,
} from './constants';
import { BODY, buildingAt, CLIMB, EAVE, FEET, inRoofSlab, ladderAt, roofAt, roofBetween, ROOF_LAYER, roofHeightOf, supportAt } from './roofs';
import { propOnTile, propTopAt } from './propSolids';
import { NO_INPUT } from './types';

import type { Field, FighterId, GameEvent, GameState, Gun, HealKind, Input, Loot, LootKind, Player, Projectile, WeaponKind } from './types';

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

/**
 * Landmarks on legs (the harbour cranes, the water tower, the fire lookout): only the legs stand on the ground. You walk
 * and shoot between them; everything above (beams, cab, tank, cabin) is out of reach. Posts in metres, from the drawn
 * models in render/props.ts; each tile of the footprint lists every post of its landmark.
 */
const OPEN_FRAME: Partial<Record<string, { posts: [number, number][]; r: number }>> = {
  crane: { posts: [[-2.6, -1.5], [2.6, -1.5], [-2.6, 1.5], [2.6, 1.5]], r: 0.2 },
  tower: { posts: [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]], r: 0.17 },
  lookout: { posts: [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]], r: 0.2 },
};
const POSTS = new Map<number, { x: number; y: number; r: number }[]>();
for (const pr of PROPS) {
  const f = OPEN_FRAME[pr.kind];
  if (!f) continue;
  const cx = (pr.x0 + pr.w / 2) * TILE;
  const cy = (pr.y0 + pr.h / 2) * TILE;
  const list = f.posts.map(([px, py]) => ({ x: cx + px, y: cy + py, r: f.r }));
  for (let y = pr.y0; y < pr.y0 + pr.h; y++) for (let x = pr.x0; x < pr.x0 + pr.w; x++) POSTS.set(y * SIZE + x, list);
}
/** The legs standing on tile (tx, ty), when it is under a landmark on legs. */
export const postsAt = (tx: number, ty: number) => POSTS.get(tileIndex(tx, ty));

/** Bushes and crops hide you. */
export const inPlant = (x: number, y: number) => 'bch'.includes(tileAt(toTile(x), toTile(y)));
/** Hidden by plants: a bush or crops hide anyone in them; tall grass (waist to chest high) hides you only crouched. */
export const plantHides = (p: { x: number; y: number; crouch?: number }) => {
  const t = tileAt(toTile(p.x), toTile(p.y));
  return t === 'b' || t === 'c' || (t === 'h' && (p.crouch ?? 0) > 0.5);
};
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
 * How tall each obstacle is: you only bump into it while your feet are below its top (a hop clears none of them; on a
 * roof the walls are under you), and a bullet only stops on it below its bullet top. Trunks stop you at any height;
 * rounds fly over everything else above 3 m as before, except a roof (see `inRoofSlab`).
 */
const MOVE_TOP: Record<string, number> = { '#': EAVE, w: EAVE, d: 1.1, u: 0.9, f: 1.1, t: Infinity, k: ROCK_TOP, r: CRATE_TOP };
const BULLET_TOP: Record<string, number> = { '#': EAVE, w: 0.9, t: 3, k: ROCK_TOP, r: CRATE_TOP };
const TEMP_WALL_TOP = 3;

/** The top of what a big prop's tile holds at (x, y) for a body or a round at height z: its own box and height (propSolids.ts). */
const propHit = (tx: number, ty: number, x: number, y: number, r: number, z: number) => {
  const s = propOnTile(tx, ty);
  if (!s) return boxHit(x, y, r, tx * TILE, ty * TILE, tx * TILE + TILE, ty * TILE + TILE) && z < EAVE - 0.05;
  return z < s.top - 0.05 && boxHit(x, y, r, s.x0, s.y0, s.x1, s.y1);
};

/**
 * Does a circle (x, y, r) overlap what stands on tile (tx, ty)? Each obstacle has its real shape
 * (see SHAPES). `bullet` leaves out windows and fences, which stop you but not bullets.
 */
const tileHit = (state: GameState, tx: number, ty: number, x: number, y: number, r: number, bullet: boolean, z = 0) => {
  const t = tileAt(tx, ty);
  // Above its top an obstacle is not in the way (on a roof, the walls are under your feet).
  if (z >= ((bullet ? BULLET_TOP : MOVE_TOP)[t] ?? Infinity) - 0.05) return false;
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const c = TILE / 2;
  switch (t) {
    case 'v': {
      // A landmark on legs: only its legs; any other prop as big as it is drawn.
      const posts = POSTS.get(tileIndex(tx, ty));
      if (posts) return posts.some((q) => circleHit(x, y, r, q.x, q.y, q.r));
      return propHit(tx, ty, x, y, r, z);
    }
    case '#':
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

/**
 * Walls, trunks, rocks, standing crates, Deprecated walls and roofs stop bullets, each up to its own top; windows let them
 * through above the sill; fences and plants never stop them. `h` is the height of the point (chest height by default,
 * where every obstacle but a window sill and a roof is in the way, as before roofs had a height).
 */
export const solidAt = (state: GameState, x: number, y: number, h = 1.1) => {
  const tx = toTile(x);
  const ty = toTile(y);
  // Trunks can stand up to 0.4 m off their tile, so check the neighbours too.
  for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) if (tileHit(state, i, j, x, y, 0, true, h)) return true;
  if (inRoofSlab(x, y, h)) return true;
  return h < TEMP_WALL_TOP && state.walls.some((w) => Math.abs(x - w.x) <= w.w / 2 && Math.abs(y - w.y) <= w.h / 2);
};

/** A step of a bullet or a sight line from one point to the next: anything solid at the end, or a roof crossed between. */
export const solidStep = (state: GameState, x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) =>
  solidAt(state, x1, y1, h1) || roofBetween(x0, y0, h0, x1, y1, h1);

export const circleBlocked = (state: GameState, x: number, y: number, r: number, z = 0) => {
  // The tree line around the map is the edge of the world, whatever gaps its trunks leave.
  const edge = TILE * 2;
  if (x < edge + r || y < edge + r || x > WORLD - edge - r || y > WORLD - edge - r) return true;
  for (let ty = toTile(y - r) - 1; ty <= toTile(y + r) + 1; ty++) {
    for (let tx = toTile(x - r) - 1; tx <= toTile(x + r) + 1; tx++) if (tileHit(state, tx, ty, x, y, r, false, z)) return true;
  }
  return z < TEMP_WALL_TOP && state.walls.some((w) => Math.abs(x - w.x) < w.w / 2 + r && Math.abs(y - w.y) < w.h / 2 + r);
};

/**
 * Push a circle out of everything it overlaps (walls, rails, trunks, rocks, crates, furniture,
 * Deprecated walls, the map edge). Pushing along each contact's normal is what makes you slide
 * along walls and glide round trunks instead of stopping dead. Returns the vaultable tile you
 * pressed against, if any.
 */
const pushOut = (state: GameState, pos: { x: number; y: number }, r: number, z = 0) => {
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
        if (z >= (MOVE_TOP[t] ?? Infinity) - 0.05) continue;
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const c = TILE / 2;
        const posts = t === 'v' ? POSTS.get(tileIndex(tx, ty)) : undefined;
        if (t === '#') outBox(x0, y0, x0 + TILE, y0 + TILE);
        else if (posts) {
          // A landmark on legs: only its legs stop you.
          for (const q of posts) outCircle(q.x, q.y, q.r);
        } else if (t === 'v') {
          const s = propOnTile(tx, ty);
          if (!s) {
            if (z < EAVE - 0.05) outBox(x0, y0, x0 + TILE, y0 + TILE);
          } else if (z < s.top - 0.05) outBox(s.x0, s.y0, s.x1, s.y1);
        }
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
    if (z < TEMP_WALL_TOP) for (const w of state.walls) outBox(w.x - w.w / 2, w.y - w.h / 2, w.x + w.w / 2, w.y + w.h / 2);
    // Off the ground (higher than a hop) a house is solid from outside up to its roof, doorways included (your head
    // would meet the lintel, and the gable ends rise to the ridge): you step onto a roof only from as high as its edge
    // (less a small step), never into it from below.
    if (z > 0.8) {
      const here = buildingAt(pos.x, pos.y);
      for (let ty = toTile(pos.y - r); ty <= toTile(pos.y + r); ty++) {
        for (let tx = toTile(pos.x - r); tx <= toTile(pos.x + r); tx++) {
          const b = buildingAt(tx * TILE + 1, ty * TILE + 1);
          if (b < 0 || b === here) continue;
          const nx = Math.max(tx * TILE, Math.min(pos.x, tx * TILE + TILE));
          const ny = Math.max(ty * TILE, Math.min(pos.y, ty * TILE + TILE));
          if (z < roofHeightOf(b, nx, ny) - 0.35) outBox(tx * TILE, ty * TILE, tx * TILE + TILE, ty * TILE + TILE);
        }
      }
    }
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
    const bx = pos.x;
    const by = pos.y;
    pos.x += dx / steps;
    pos.y += dy / steps;
    vaultable = pushOut(state, pos, PLAYER_RADIUS, p.z) ?? vaultable;
    // Off the ground, never into a roof from the side (jumping onto a pitched roof lower than its slope there): the
    // roof is a wall to you, so you come down beside it or land on it, never fall through it into the house.
    if (p.z > 0.8) {
      const r = roofAt(pos.x, pos.y);
      if (r >= 0 && p.z < r - 0.35 && !(roofAt(bx, by) >= 0 && p.z < roofAt(bx, by) - 0.35)) {
        pos.x = bx;
        pos.y = by;
      }
    }
  }
  p.x = pos.x;
  p.y = pos.y;
  return vaultable;
};

/**
 * A clear straight line from (x0, y0) at height h0 to (x1, y1) at height h1 (chest heights by default): nothing solid
 * on it, walls and roofs included, both ways the same. Doorways and windows are open.
 */
export const lineOfSight = (state: GameState, x0: number, y0: number, x1: number, y1: number, h0 = 1.1, h1 = 1.1) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 0.5);
  let px = x0;
  let py = y0;
  let ph = h0;
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    const x = x0 + (x1 - x0) * k;
    const y = y0 + (y1 - y0) * k;
    const h = h0 + (h1 - h0) * k;
    if (solidStep(state, px, py, ph, x, y, h)) return false;
    px = x;
    py = y;
    ph = h;
  }
  // The last stretch: a roof between the last sample and the end (someone on the far side of a roof slab).
  return !roofBetween(px, py, ph, x1, y1, h1);
};

/** Sight from one player's eyes (chest) to another's chest. */
export const seesBody = (state: GameState, a: Player, b: Player) => lineOfSight(state, a.x, a.y, b.x, b.y, chestHeight(a), chestHeight(b));

/** Can `viewer` see `target`? Plants hide you unless someone is very close or you just fired. */
/** On the ground, or hanging under an open parachute: you can be seen, aimed at and hit. */
export const targetable = (p: Player) => p.alive && (p.stage === 'ground' || p.stage === 'falling');
/** How high a player's chest is above the ground (in the air: on the way down). */
export const chestHeight = (p: Player) => feetOf(p) + 1.1 - CROUCH.drop * (p.crouch ?? 0);
/** The top of a player's body for rounds: lower while crouched. */
export const bodyTop = (p: Player) => BODY.top - CROUCH.bodyDrop * (p.crouch ?? 0);
/** How high a player's feet are: in the air their height, on the ground the roof or hop they are on. */
export const feetOf = (p: Player) => (p.stage === 'falling' ? Math.max(0, p.alt) : p.z ?? 0);

/** Where a player's body is for bullets: leaning out moves the exposed shoulder sideways. */
export const hitPoint = (p: Player) => ({
  x: p.x - Math.sin(p.heading) * p.lean * LEAN.offset * 0.7,
  y: p.y + Math.cos(p.heading) * p.lean * LEAN.offset * 0.7,
});

export const canSee = (state: GameState, viewer: Player, target: Player) => {
  if (!targetable(target)) return false;
  if (viewer.id === target.id) return true;
  const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
  // Plants hide people standing in them, not the ones floating down over them.
  if (target.stage === 'ground' && plantHides(target) && target.revealed <= 0 && d > PLANT_REVEAL) return false;
  return true;
};

/** Nearest open spot to (x, y) outside every house (you come down beside one, not inside), searching outwards. */
const freeSpot = (state: GameState, x: number, y: number) => {
  for (let ring = 0; ring < 12; ring++) {
    for (let i = 0; i < Math.max(1, ring * 8); i++) {
      const a = (i / Math.max(1, ring * 8)) * Math.PI * 2;
      const cx = Math.min(WORLD - 3, Math.max(3, x + Math.cos(a) * ring * 0.8));
      const cy = Math.min(WORLD - 3, Math.max(3, y + Math.sin(a) * ring * 0.8));
      if (!circleBlocked(state, cx, cy, PLAYER_RADIUS + 0.1) && buildingAt(cx, cy) < 0) return { x: cx, y: cy };
    }
  }
  return { x: CENTER, y: CENTER };
};

// ---------- setup

/** Index picked from weights (they need not sum to 1). */
const pickWeighted = (state: GameState, weights: number[]) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = nextRandom(state) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0 && weights[i] > 0) return i;
  }
  return weights.length - 1;
};

/** A piece of loot for a place of loot tier `tier` (1 quiet .. 3 risky): its kind, grade and how much of it. */
export const rollLoot = (state: GameState, tier: number): { kind: LootKind; tier: number; ammo: number } => {
  const t = LOOT_TABLES[Math.max(1, Math.min(LOOT_TABLES.length - 1, tier))];
  const kinds = Object.keys(t.kinds) as LootKind[];
  const kind = kinds[pickWeighted(state, kinds.map((k) => t.kinds[k] ?? 0))];
  if (isWeapon(kind)) {
    const rarity = pickWeighted(state, t.rarity);
    return { kind, tier: rarity, ammo: foundRounds(kind, rarity) };
  }
  if (kind === 'armor') {
    const v = pickWeighted(state, t.vest);
    return { kind, tier: v, ammo: VEST.points[v] };
  }
  if (kind === 'backpack') return { kind, tier: pickWeighted(state, t.pack), ammo: 0 };
  if (kind === 'bandage') return { kind, tier: 0, ammo: HEALS.bandage.stack };
  return { kind, tier: 0, ammo: kind === 'ammo' ? 0 : 1 };
};

const addLoot = (state: GameState, kind: LootKind, x: number, y: number, ammo?: number, tier = 0, z = 0) => {
  const k: Loot = { id: state.nextId++, kind, x, y, ammo: ammo ?? (isWeapon(kind) ? foundRounds(kind, tier) : 0), tier, active: true };
  if (z > 0) k.z = z;
  state.loot.push(k);
};
/** Drop loot where a player stands: on a roof it stays on the roof (kept inside its edges), else on the ground. */
const dropAt = (state: GameState, p: Player, kind: LootKind, x: number, y: number, ammo?: number, tier = 0) => {
  const b = p.z >= ROOF_LAYER ? buildingAt(p.x, p.y) : -1;
  if (b >= 0 && buildingAt(x, y) !== b) {
    x = p.x;
    y = p.y;
  }
  addLoot(state, kind, x, y, ammo, tier, b >= 0 ? roofHeightOf(b, x, y) : 0);
};
/** Close enough in height to reach: loot on a roof from the roof, loot on the floor from the floor. */
const withinReach = (p: Player, k: Loot) => Math.abs((k.z ?? 0) - p.z) < 1.2;
const addRolled = (state: GameState, x: number, y: number) => {
  const r = rollLoot(state, lootTierAt(x, y));
  addLoot(state, r.kind, x, y, r.ammo, r.tier);
};

/** One place in a match: a person (online or this browser) or a bot. `fighter: null` = pick at random. */
export interface Seat {
  name: string;
  fighter: FighterId | null;
  bot: boolean;
}

/** Offline: you and nineteen bots (PLAYERS - 1). */
export const createGame = (you: FighterId, seed = 1, youName = 'you', others: FighterId[] = [], rookie = false): GameState => {
  const state = createMatch(
    Array.from({ length: PLAYERS }, (_, i) => (i === 0 ? { name: youName, fighter: you, bot: false } : { name: BOT_NAMES[i - 1], fighter: others[i - 1] ?? null, bot: true })),
    seed,
  );
  if (rookie) state.rookie = true;
  return state;
};

/** Crate health on a fresh map. */
export const initialRacks = () => {
  const racks = new Array(SIZE * SIZE).fill(0);
  MAP.forEach((row, ty) => [...row].forEach((c, tx) => c === 'r' && (racks[tileIndex(tx, ty)] = RACK_HP)));
  return racks;
};

/** Any match: up to PLAYERS seats in the given order (player i is seat i), everyone on one plane. */
export const createMatch = (seats: Seat[], seed = 1): GameState => {
  const racks = initialRacks();
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
      calm: 0, halved: false,
    },
    winner: null,
    events: [],
  };
  pickNextCircle(state);

  // The drone flies a random line across the campus.
  const a = nextRandom(state) * Math.PI * 2;
  const off = (nextRandom(state) - 0.5) * WORLD * 0.24;
  const reach = WORLD * 0.62;
  state.drone = {
    x0: CENTER - Math.cos(a) * reach - Math.sin(a) * off,
    y0: CENTER - Math.sin(a) * reach + Math.cos(a) * off,
    x1: CENTER + Math.cos(a) * reach - Math.sin(a) * off,
    y1: CENTER + Math.sin(a) * reach + Math.cos(a) * off,
    t: 0,
  };

  seats.slice(0, PLAYERS).forEach((seat, i) => {
    const fighter = seat.fighter ?? FIGHTER_IDS[Math.floor(nextRandom(state) * FIGHTER_IDS.length)];
    state.players.push(newPlayer(i, seat.name, fighter, seat.bot, state.drone.x0, state.drone.y0));
  });

  MAP.forEach((row, ty) =>
    [...row].forEach((c, tx) => {
      if (c === 'l' || (c === 's' && nextRandom(state) < LOOT_SPOTS.supply)) addRolled(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      if (c === 'l' && nextRandom(state) < LOOT_SPOTS.second) {
        // The second piece goes on an open floor tile next to the first (or beside it on the same tile).
        const k = Math.floor(nextRandom(state) * 4);
        const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][k];
        const open = MAP[ty + dy]?.[tx + dx] === '.';
        addRolled(state, (tx + (open ? dx : 0)) * TILE + TILE / 2 + (open ? 0 : 0.6), (ty + (open ? dy : 0)) * TILE + TILE / 2);
      }
    }),
  );
  return state;
};

export const newPlayer = (id: number, name: string, fighter: FighterId, bot: boolean, x: number, y: number): Player => ({
  id, name, fighter, bot,
  stage: 'drone',
  alt: 0,
  vz: 0,
  canopy: -1,
  x, y,
  vx: 0,
  vy: 0,
  z: 0,
  jz: 0,
  climb: 0,
  heading: 0,
  hp: FIGHTERS[fighter].hp,
  maxHp: FIGHTERS[fighter].hp,
  armor: 0,
  alive: true,
  weapon: START_WEAPON.kind,
  rarity: 0,
  mag: START_WEAPON.mag,
  ammo: START_WEAPON.spare,
  slot: 0,
  holster: null,
  swapping: 0,
  chuteArmed: false,
  vest: 0,
  pack: 0,
  bandages: 0,
  medkits: 0,
  coffees: 0,
  bombs: 0,
  using: null,
  useLeft: 0,
  buzz: 0,
  reload: 0,
  cooldown: 0,
  superCharge: 0,
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
  crouch: 0,
  item: null,
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

/** The per-match wind: from the drone's route (no random draw, so the map's dice stay as they were), across it. */
export const windOf = (state: GameState) => {
  const d = state.drone;
  const a = Math.atan2(d.y1 - d.y0, d.x1 - d.x0) + 1.2;
  return { x: Math.cos(a) * DROP.wind, y: Math.sin(a) * DROP.wind };
};

/**
 * One tick of a jumper in the air. Vertical: gravity against quadratic drag (`dragAt`), so you speed up to terminal
 * velocity and the canopy's opening slows you hard over about a second; the open canopy sinks faster the faster it
 * flies (`chuteSink`). Horizontal: momentum that follows the stick at the response rate, the wind once the canopy
 * flies, and a small deterministic turbulence wobble. The open canopy never stops in the air: hands off it glides on
 * the way it was going, and holding the dive (the roll key) it speeds up and drops faster. Space after a second of
 * free fall pulls early; at `deployAlt` it opens by itself.
 */
export const updateFall = (state: GameState, p: Player, input: Input) => {
  const out = DROP.height - p.alt;
  const pressed = input.jump && !p.prev.jump;
  // No firing in free fall (the first magazine used to be gone before landing): a fresh press tells the player why.
  // Under the open canopy you can shoot (below).
  if (input.fire && !p.prev.fire && !p.bot && p.canopy < DROP.deployTime) state.events.push({ type: 'fireBlocked', player: p.id });
  if (p.canopy < 0 && (p.alt <= DROP.deployAlt || (pressed && out >= DROP.minFreefallDrop))) p.canopy = 0;
  else if (p.canopy >= 0) p.canopy += DT;
  // How far the canopy has inflated (its numbers blend in), and its speed through the air (relative to the wind).
  const open = p.canopy < DROP.stretch ? 0 : Math.min(1, (p.canopy - DROP.stretch) / (DROP.deployTime - DROP.stretch));
  const w = windOf(state);
  const ux = p.vx - w.x * open;
  const uy = p.vy - w.y * open;
  const air = Math.hypot(ux, uy);
  // Vertical.
  const k = dragAt(p.canopy, p.alt, chuteSink(air));
  p.vz += (DROP.gravity - k * p.vz * Math.abs(p.vz)) * DT;
  p.alt -= p.vz * DT;
  // Horizontal. Free fall: the stick asks for a velocity. Canopy: the stick (or, hands off, the way it already flies)
  // gives the direction, never slower than trim; the dive asks for its top speed.
  const response = DROP.freefallResponse + (DROP.chuteResponse - DROP.freefallResponse) * open;
  const len = Math.hypot(input.mx, input.my);
  const m = Math.min(1, len);
  const steered = len > 0.01;
  const fs = steered ? DROP.freefallSpeed / Math.max(1, len) : 0;
  const diving = input.roll && open >= 1;
  const dir = steered ? { x: input.mx / len, y: input.my / len } : air > 0.3 ? { x: ux / air, y: uy / air } : { x: 0, y: 0 };
  const cs = diving ? DROP.chuteDiveSpeed * (steered ? Math.max(m, 0.5) : 1) : Math.max(DROP.chuteTrim, steered ? DROP.chuteSpeed * m : 0);
  const want = {
    x: input.mx * fs * (1 - open) + (dir.x * cs + w.x) * open,
    y: input.my * fs * (1 - open) + (dir.y * cs + w.y) * open,
  };
  // Turbulence: two incommensurate sines per axis, different for everyone, scaled by how fast the air rushes past.
  const t = state.tick * DT;
  const gust = DROP.turbulence * Math.min(1, p.vz / DROP.freefallTerminal + 0.3);
  const ax = (Math.sin(t * 1.9 + p.id * 2.1) + 0.6 * Math.sin(t * 4.7 + p.id)) * gust;
  const ay = (Math.sin(t * 2.3 + p.id * 1.3) + 0.6 * Math.sin(t * 5.3 + p.id * 0.7)) * gust;
  const r = 1 - Math.exp(-response * DT);
  p.vx += (want.x - p.vx) * r + ax * DT;
  p.vy += (want.y - p.vy) * r + ay * DT;
  p.x = Math.min(WORLD - 4, Math.max(4, p.x + p.vx * DT));
  p.y = Math.min(WORLD - 4, Math.max(4, p.y + p.vy * DT));
  if (p.canopy >= DROP.deployTime) {
    // Under the open canopy you look where you aim and can shoot (people only: bots save their rounds for the ground).
    p.cooldown = Math.max(0, p.cooldown - DT);
    p.swapping = Math.max(0, p.swapping - DT);
    updateReload(p);
    if (Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.05) p.heading = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    // A fresh press under the open canopy arms the trigger, so a trigger held all the way from the plane spends nothing.
    if (input.fire && !p.prev.fire) p.chuteArmed = true;
    if (input.fire && p.chuteArmed && !p.bot && p.cooldown <= 0 && p.weapon !== 'rockets' && p.weapon !== 'fists' && p.mag + p.ammo > 0) shoot(state, p, input);
  } else if (Math.hypot(p.vx, p.vy) > 1) {
    // Falling, you face the way you are going (the body turns to track).
    p.heading = Math.atan2(p.vy, p.vx);
  }
};

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
      if ((jump && overCampus) || d.t >= DROP.forceJump) {
        p.stage = 'falling';
        p.alt = DROP.height;
        p.vz = 0;
        p.canopy = -1;
        // Out of the door with part of the plane's speed: it bleeds off as the air takes you.
        const throwK = (DROP.exitThrow * Math.hypot(d.x1 - d.x0, d.y1 - d.y0)) / DROP.flight;
        const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) || 1;
        p.vx = ((d.x1 - d.x0) / len) * throwK;
        p.vy = ((d.y1 - d.y0) / len) * throwK;
        p.heading = Math.atan2(d.y1 - d.y0, d.x1 - d.x0);
        p.x = Math.min(WORLD - 4, Math.max(4, p.x));
        p.y = Math.min(WORLD - 4, Math.max(4, p.y));
        state.events.push({ type: 'jump', player: p.id });
      }
    } else if (p.stage === 'falling') {
      const was = { x: p.x, y: p.y, alt: p.alt };
      updateFall(state, p, input);
      // A house is solid in the air too: coming down over it you land on its roof; drifting into its walls below the
      // eaves you are stopped there (and come down beside it, never inside).
      // The flat tops of containers, boxcars and the HQ block hold you the same way.
      const roof = Math.max(roofAt(p.x, p.y), propTopAt(p.x, p.y));
      if (roof >= 0 && p.alt <= roof && was.alt > roof - 0.01) {
        land(state, p, roof);
      } else if (roof >= 0 && p.alt <= roof) {
        p.x = was.x;
        p.y = was.y;
        p.vx = 0;
        p.vy = 0;
        if (p.alt <= 0) land(state, p, 0);
      } else if (p.alt <= 0) land(state, p, 0);
    }
    p.prev = { ...input };
  }
  if (state.players.every((p) => p.stage === 'ground')) state.phase = 'play';
};

/** Touch down from the sky: on a roof at its height (`z` > 0), else on the nearest open spot of the ground. */
const land = (state: GameState, p: Player, z: number) => {
  if (z <= 0) {
    const spot = freeSpot(state, p.x, p.y);
    p.x = spot.x;
    p.y = spot.y;
  }
  p.alt = 0;
  p.z = z;
  p.jz = 0;
  p.vz = 0;
  p.vx = 0;
  p.vy = 0;
  p.canopy = -1;
  p.stage = 'ground';
  p.landedTick = state.tick;
  state.events.push(z > 0 ? { type: 'land', player: p.id, x: p.x, y: p.y, z } : { type: 'land', player: p.id, x: p.x, y: p.y });
};

// ---------- the Deadline

/** Tiles that stop a bullet or hide you: rocks, crates, props, walls, fences and trees (a house wall counts). */
const COVER_TILES = 'krv#ftw';

/**
 * Does a circle centred here pass the centre rules (map-v2.md section 7)? `phase` counts from 0 (the first circle is phase 0):
 *  1. the centre is not water, not a prop and not inside a building;
 *  2. from the third circle on, at most a quarter of its area is water (the river must not eat the late game);
 *  3. from the fourth on, at least 6 cover tiles lie within 15 m of the centre, and the centre is not on a bridge deck or the Weir;
 *  (rule 4, 12 m inside the edge tree ring, is applied when the centre is drawn).
 */
export const circleCentreOk = (x: number, y: number, radius: number, phase: number) => {
  const t = tileAt(toTile(x), toTile(y));
  if (t === 'o' || t === 'd' || t === 'v' || buildingAt(x, y) >= 0) return false;
  if (phase >= 2) {
    // Sample the disc on a grid (at most 8 per radius): the share of samples that are water.
    let wet = 0;
    let all = 0;
    const step = Math.max(TILE, radius / 8);
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        if (dx * dx + dy * dy > radius * radius) continue;
        all += 1;
        if (tileAt(toTile(x + dx), toTile(y + dy)) === 'o') wet += 1;
      }
    }
    if (all && wet / all > 0.25) return false;
  }
  if (phase >= 3) {
    let cover = 0;
    for (let ty = toTile(y - 15); ty <= toTile(y + 15); ty++) {
      for (let tx = toTile(x - 15); tx <= toTile(x + 15); tx++) {
        if (COVER_TILES.includes(tileAt(tx, ty)) && Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) <= 15) cover += 1;
      }
    }
    if (cover < 6) return false;
  }
  return true;
};

const pickNextCircle = (state: GameState, roomShare = 0.6) => {
  const z = state.zone;
  const def = ZONE_PHASES[z.phase];
  if (!def) return;
  const room = Math.max(0, z.r - def.radius) * roomShare;
  // Up to 8 draws; the first centre that passes the rules wins, else the last one drawn.
  const lo = def.radius + 12;
  const hi = WORLD - def.radius - 12;
  // The first draw is the match's own random stream (as before, two numbers); the redraws come from a stream of their own, so
  // a rejected centre does not shift every other random number of the match.
  let redraw = (state.seed ^ 0x9e3779b9) | 0;
  const again = () => {
    let t = (redraw = (redraw + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // (The first circle, drawn when the match is made, is 109 m wide and its centre is within 38 m of the map's middle: it keeps its one draw.)
  for (let draw = 0; draw < (z.phase === 0 ? 1 : 8); draw++) {
    const a = (draw === 0 ? nextRandom(state) : again()) * Math.PI * 2;
    const d = Math.sqrt(draw === 0 ? nextRandom(state) : again()) * room;
    const x = z.cx + Math.cos(a) * d;
    const y = z.cy + Math.sin(a) * d;
    // The circle stays 12 m inside the edge tree ring (the first circle is too big for that and keeps the old 8 m margin).
    const [min, max] = lo <= hi ? [lo, hi] : [8, WORLD - 8];
    z.toX = Math.min(max, Math.max(min, x));
    z.toY = Math.min(max, Math.max(min, y));
    if (circleCentreOk(z.toX, z.toY, def.radius, z.phase)) break;
  }
  z.toR = def.radius;
};

/** How long this shrink lasts: its phase's `shrink`, or longer if the far edge would outpace `ZONE_EDGE_SPEED`. */
export const shrinkTime = (z: GameState['zone'], shrink: number) =>
  Math.max(shrink, (z.fromR - z.toR + Math.hypot(z.toX - z.fromX, z.toY - z.fromY)) / ZONE_EDGE_SPEED);

/** The last few left: skip a Deadline still on an earlier phase ahead to a circle sized for them (see `ZONE_RULES`). */
const rushZone = (state: GameState, alive: number) => {
  const z = state.zone;
  if (z.state === 'done') return;
  let target = -1;
  for (const r of ZONE_RULES.rush) if (alive <= r.alive) target = Math.max(target, r.phase);
  if (target <= z.phase || target >= ZONE_PHASES.length) return;
  const left = z.state === 'wait' ? z.timer : Infinity;
  z.phase = target;
  z.state = 'wait';
  z.timer = Math.min(left, ZONE_RULES.rushWait, ZONE_PHASES[target].wait);
  z.halved = false;
  z.fromX = z.cx;
  z.fromY = z.cy;
  z.fromR = z.r;
  pickNextCircle(state, ZONE_RULES.rushRoom);
  state.events.push({ type: 'zone', phase: z.phase, state: 'wait' });
};

const updateZone = (state: GameState) => {
  const z = state.zone;
  const alive = alivePlayers(state).length;
  rushZone(state, alive);
  const def = ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)];
  z.timer -= DT;
  z.calm += DT;
  if (z.state === 'wait') {
    // A quiet stretch brings the next squeeze forward (never in the first phase, which is for landing and gearing up),
    // and sooner once only a few are left.
    const lull = alive <= ZONE_RULES.squeezeAlive ? ZONE_RULES.lullLate : ZONE_RULES.lull;
    if (z.phase >= 1 && z.calm >= lull && z.timer > ZONE_RULES.lullWait) {
      z.timer = ZONE_RULES.lullWait;
      state.events.push({ type: 'zone', phase: z.phase, state: 'wait' });
    }
    // The last few: every wait from here on is half as long.
    if (!z.halved && alive <= ZONE_RULES.squeezeAlive) {
      z.halved = true;
      z.timer /= 2;
    }
  }
  if (z.state === 'wait' && z.timer <= 0) {
    Object.assign(z, { state: 'shrink', fromX: z.cx, fromY: z.cy, fromR: z.r, dps: def.dps });
    z.timer = shrinkTime(z, def.shrink);
    state.events.push({ type: 'zone', phase: z.phase, state: 'shrink' });
  } else if (z.state === 'shrink') {
    const k = 1 - Math.max(0, z.timer) / shrinkTime(z, def.shrink);
    z.cx = z.fromX + (z.toX - z.fromX) * k;
    z.cy = z.fromY + (z.toY - z.fromY) * k;
    z.r = z.fromR + (z.toR - z.fromR) * k;
    if (z.timer <= 0) {
      z.phase += 1;
      if (z.phase >= ZONE_PHASES.length) z.state = 'done';
      else {
        z.state = 'wait';
        z.timer = ZONE_PHASES[z.phase].wait;
        z.halved = false;
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
    state.zone.calm = 0;
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
  // Everything you carried is up for grabs, in a ring round where you fell.
  const drops: [LootKind, number, number][] = [];
  if (p.weapon !== 'fists' && roundsLeft(p) > 0) drops.push([p.weapon, roundsLeft(p), p.rarity]);
  if (p.holster && p.holster.weapon !== 'fists' && p.holster.mag + p.holster.ammo > 0) drops.push([p.holster.weapon, p.holster.mag + p.holster.ammo, p.holster.rarity]);
  if (p.armor >= 1 && p.vest > 0) drops.push(['armor', Math.round(p.armor), p.vest]);
  if (p.pack > 0) drops.push(['backpack', 0, p.pack]);
  if (p.bandages > 0) drops.push(['bandage', p.bandages, 0]);
  if (p.medkits > 0) drops.push(['medkit', p.medkits, 0]);
  if (p.coffees > 0) drops.push(['coffee', p.coffees, 0]);
  if (p.bombs > 0) drops.push(['bomb', p.bombs, 0]);
  drops.forEach(([kind, ammo, tier], i) => {
    const a = (i / drops.length) * Math.PI * 2;
    const r = drops.length > 1 ? 0.9 : 0;
    dropAt(state, p, kind, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, ammo, tier);
  });
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
    if (nextRandom(state) < 0.4) addRolled(state, x, y);
  }
};

/**
 * How far a blast at (x, y), height `h` (0 = on the ground), is from a fighter on foot: the height apart beyond the body's
 * own height counts too (on the same level it is the plain distance, as before), and through a roof it never reaches
 * (Infinity). Every blast (bombs, rockets, the slow-field canister and its field) measures with this.
 */
export const blastDistance = (o: Player, x: number, y: number, h: number) => {
  const dz = Math.max(0, Math.abs(o.z + 0.9 - (h + 0.9)) - 0.9);
  if (dz > 0 && roofBetween(x, y, h + 0.3, o.x, o.y, o.z + 1.1)) return Infinity;
  return Math.hypot(o.x - x, o.y - y, dz);
};

/** A blast at (x, y) at height `h` (0 = on the ground): it reaches up and down too, but never through a roof. */
const explode = (state: GameState, owner: number, x: number, y: number, radius: number, damage: number, h = 0) => {
  state.events.push(h > 0.5 ? { type: 'explosion', x, y, radius, z: h } : { type: 'explosion', x, y, radius });
  for (const o of state.players) {
    if (!o.alive || o.stage !== 'ground') continue;
    const d = blastDistance(o, x, y, h);
    if (d > radius + PLAYER_RADIUS) continue;
    const self = o.id === owner ? 0.5 : 1;
    o.lastHitWith = 'explosion';
    hurt(state, o, damage * self * (1 - 0.7 * Math.min(1, d / radius)), owner === o.id ? null : owner);
  }
  damageRacksAround(state, x, y, radius * 0.6, damage);
};

// ---------- weapons, supers and items

/** Who the aim point is on, if anyone (within 2.5 m of it): rounds climb or dip to their height. */
const aimedAt = (state: GameState, p: Player, aimX: number, aimY: number) => {
  let best: Player | null = null;
  let bd = 2.5;
  for (const o of state.players) {
    if (o.id === p.id || !targetable(o)) continue;
    let d = Math.hypot(o.x - aimX, o.y - aimY);
    // Two people near the aim point at different heights (one on a roof, one under it): the one in sight.
    if (d < bd && feetOf(o) !== feetOf(p) && !seesBody(state, p, o)) d += 2.5;
    if (d < bd) {
      best = o;
      bd = d;
    }
  }
  return best;
};

/** A gun's damage per bullet at the rarity in hand (fists are fists). */
const gunDamage = (p: Player) => WEAPONS[p.weapon].damage * (p.weapon === 'fists' ? 1 : (RARITY.damage[p.rarity] ?? 1));

/**
 * Rounds that land the tick they are fired. The sniper's round flies at 80 m/s, so at 100 m it would hit more than a second
 * after the contrail was drawn, and the target would die long after the line had passed through it. It is resolved with
 * the same flight, wall, height and falloff rules as any bullet, just all at once, so the hit, the damage number and a
 * kill all land on the frame of the shot, and the line ends where the round did.
 */
const INSTANT: ReadonlySet<WeaponKind> = new Set<WeaponKind>(['sniper']);

/** Fires one round. Returns how far it flew if it was resolved at once (INSTANT), else undefined. */
/**
 * Where a person's round leaves from. With a 3D aim (the crosshair's point) it is the camera's side line: over the shoulder
 * the camera sits ~0.6 m to the side, so what the crosshair clears round a corner the round clears too (Reis, 2026-11-24:
 * leaning out, the crosshair was past the corner but the round hit the wall in front). Never through a wall: if anything
 * solid stands between the body and that point, the round leaves from the body as before.
 */
const muzzleOf = (state: GameState, p: Player, input?: Input) => {
  const o = hitPoint(p);
  if (!input || input.aimH === undefined || !input.camSide || p.bot) return o;
  const side = Math.max(-0.8, Math.min(0.8, input.camSide));
  const m = { x: o.x - Math.sin(p.heading) * side, y: o.y + Math.cos(p.heading) * side };
  const h = chestHeight(p);
  return lineOfSight(state, o.x, o.y, m.x, m.y, h, h) && !circleBlocked(state, m.x, m.y, 0.15, feetOf(p)) ? m : o;
};

const fireBullet = (state: GameState, p: Player, angle: number, aim?: { x: number; y: number; h?: number }, from?: { x: number; y: number }): number | undefined => {
  const w = WEAPONS[p.weapon];
  // Leaning out, the muzzle is out past the corner too.
  const o = from ?? hitPoint(p);
  const x = o.x + Math.cos(angle) * 0.6;
  const y = o.y + Math.sin(angle) * 0.6;
  const h0 = chestHeight(p);
  const toAim = aim ? Math.max(1, Math.hypot(aim.x - x, aim.y - y)) : 1;
  const pr: Projectile = {
    id: state.nextId++, owner: p.id, kind: 'bullet', weapon: p.weapon,
    x, y,
    vx: Math.cos(angle) * w.speed, vy: Math.sin(angle) * w.speed,
    damage: gunDamage(p), life: w.range / w.speed,
    sx: x, sy: y, tx: 0, ty: 0, t: 0, duration: 0, radius: 0,
    h: h0, h0, h1: h0, hd: toAim,
  };
  if (aim?.h !== undefined) {
    // Aimed in 3D: a straight line from the muzzle through the crosshair point and on (up at the sky, down off a roof).
    // Very close points are pushed out along the same line so a point under your nose does not give a wild slope.
    pr.h1 = aim.h;
    pr.ext = true;
    if (toAim < 2) {
      pr.h1 = h0 + ((aim.h - h0) * 2) / toAim;
      pr.hd = 2;
    }
  } else {
    // At nobody: the round goes to chest height over the aim point (from a roof, down at what you point at).
    const target = aim ? aimedAt(state, p, aim.x, aim.y) : null;
    pr.h1 = target ? chestHeight(target) : aim ? 1.1 : h0;
    if (target) pr.hd = Math.max(1, Math.hypot(target.x - x, target.y - y));
  }
  state.projectiles.push(pr);
  if (!INSTANT.has(p.weapon)) return undefined;
  while (updateProjectile(state, pr)) {
    /* keep flying until it hits something or runs out of range */
  }
  state.projectiles.pop();
  lastEndH = pr.h ?? h0;
  return Math.hypot(pr.x - pr.sx, pr.y - pr.sy);
};
/** Where the last instant round ended (its height), for the contrail. */
let lastEndH = 0;

/** Damage after the distance the bullet flew: full up close, down to `min` of it far away. */
export const falloffDamage = (weapon: WeaponKind, damage: number, distance: number) => {
  const f = WEAPONS[weapon].falloff;
  if (distance <= f.start) return damage;
  const k = Math.min(1, (distance - f.start) / Math.max(0.01, f.end - f.start));
  return damage * (1 - (1 - f.min) * k);
};

/**
 * A rocket leaves the launcher on your shoulder and flies straight where you aim, like any gun:
 * level from the top-down view (sinking slowly over long distances), up or down with your view
 * in first person. It explodes on the first wall, tree or person it meets, or the ground.
 */
const fireRocket = (state: GameState, p: Player, angle: number, pitch: number) => {
  const w = WEAPONS.rockets;
  const o = hitPoint(p);
  const x = o.x + Math.cos(angle) * 0.8;
  const y = o.y + Math.sin(angle) * 0.8;
  const pt = Math.max(-0.6, Math.min(0.9, pitch));
  const flat = Math.cos(pt) * w.speed;
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'rocket', weapon: 'rockets',
    x, y, vx: Math.cos(angle) * flat, vy: Math.sin(angle) * flat,
    damage: gunDamage(p), life: w.range / w.speed,
    sx: x, sy: y, tx: 0, ty: 0, t: 0, duration: 0, radius: w.lob!.radius, rocket: true,
    h: chestHeight(p) + (ROCKET.launchHeight - 1.1), vh: Math.sin(pt) * w.speed,
  });
};

const lob = (state: GameState, p: Player, aimX: number, aimY: number, range: number, damage: number, radius: number, rocket = false) => {
  const a = Math.atan2(aimY - p.y, aimX - p.x);
  const d = Math.min(range, Math.hypot(aimX - p.x, aimY - p.y));
  state.projectiles.push({
    id: state.nextId++, owner: p.id, kind: 'lob', weapon: 'rockets',
    x: p.x, y: p.y, vx: 0, vy: 0, damage, life: 99,
    sx: p.x, sy: p.y, tx: p.x + Math.cos(a) * d, ty: p.y + Math.sin(a) * d,
    t: 0, duration: 0.35 + d / 22, radius, rocket,
  });
  // It comes down on whatever is there: a roof, unless you threw it from that house's floor (then it lands inside).
  const pr = state.projectiles[state.projectiles.length - 1];
  const b = buildingAt(pr.tx, pr.ty);
  if (b >= 0 && !(buildingAt(p.x, p.y) === b && p.z < ROOF_LAYER)) pr.h1 = roofHeightOf(b, pr.tx, pr.ty);
};

/**
 * Where the slow-field canister comes down: at the aim point, at least 2 m out and at most its range (along the facing
 * when the aim point is on top of you). The HUD's landing preview uses the same rule.
 */
export const superThrowTarget = (p: { x: number; y: number; heading: number }, aimX: number, aimY: number) => {
  const toAim = Math.hypot(aimX - p.x, aimY - p.y);
  const a = toAim > 0.3 ? Math.atan2(aimY - p.y, aimX - p.x) : p.heading;
  const d = Math.max(2, Math.min(SUPERS.timebox.range, toAim));
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
};

const throwCanister = (state: GameState, p: Player, aimX: number, aimY: number) => {
  const s = SUPERS.timebox;
  const at = superThrowTarget(p, aimX, aimY);
  lob(state, p, at.x, at.y, s.range, s.damage, s.burst);
  state.projectiles[state.projectiles.length - 1].field = true;
};

/** The canister lands (on a roof at height `h`, else the ground): a modest burst (never the thrower) and the slow field, both kept to its side of a roof. */
const slowBurst = (state: GameState, owner: number, x: number, y: number, h = 0) => {
  const s = SUPERS.timebox;
  state.events.push(h > 0.5 ? { type: 'slowBurst', owner, x, y, burst: s.burst, radius: s.radius, z: h } : { type: 'slowBurst', owner, x, y, burst: s.burst, radius: s.radius });
  for (const o of state.players) {
    if (!o.alive || o.stage !== 'ground' || o.id === owner) continue;
    const d = blastDistance(o, x, y, h);
    if (d > s.burst + PLAYER_RADIUS) continue;
    o.lastHitWith = 'super';
    hurt(state, o, s.damage * (1 - 0.7 * Math.min(1, d / s.burst)), owner);
  }
  const f: Field = { x, y, r: s.radius, life: s.life, owner };
  if (h > 0.5) f.z = h;
  state.fields.push(f);
};

/** Rounds this player has for the gun in hand (magazine + spare). */
export const roundsLeft = (p: Player) => (p.weapon === 'fists' ? Infinity : p.mag + p.ammo);

/** Seconds a full reload of the gun in hand takes (quicker on better grades). */
export const reloadTime = (p: Player) => WEAPONS[p.weapon].reload * (RARITY.reload[p.rarity] ?? 1);

const startReload = (state: GameState, p: Player) => {
  if (p.weapon === 'fists' || p.reload > 0 || p.ammo <= 0 || p.mag >= magOf(p.weapon, p.rarity)) return;
  p.reload = reloadTime(p);
  state.events.push({ type: 'reload', player: p.id, weapon: p.weapon, x: p.x, y: p.y });
};

const pr3d = (input: Input) => input.aimH !== undefined;

const shoot = (state: GameState, p: Player, input: Input) => {
  if (p.reload > 0 || p.swapping > 0) return;
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
  // Bullets go straight at the aim point; the body catches up with its turn a moment later. They leave from the shoulder
  // (out past the corner while leaning) and go to the aim point from there, so a leaned shot still lands on the crosshair.
  const from = muzzleOf(state, p, input);
  const aim = Math.hypot(input.aimX - from.x, input.aimY - from.y) > 1.2
    ? Math.atan2(input.aimY - from.y, input.aimX - from.x)
    : Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.3 ? Math.atan2(input.aimY - p.y, input.aimX - p.x) : p.heading;
  const spread = w.spread * (1 - (1 - CROUCH.spread) * p.crouch);
  const keep = p.weapon;
  p.weapon = kind; // fireBullet reads the weapon
  const at = input.aimH === undefined ? { x: input.aimX, y: input.aimY } : { x: input.aimX, y: input.aimY, h: input.aimH };
  // The shot comes first in the event list, so a hit or a kill it causes this tick reads as its result.
  const shot: GameEvent = { type: 'shot', owner: p.id, x: from.x, y: from.y, angle: aim, weapon: kind };
  state.events.push(shot);
  if (kind === 'rockets') fireRocket(state, p, aim, input.pitch ?? 0);
  else if (w.bullets > 1) {
    for (let i = 0; i < w.bullets; i++) fireBullet(state, p, aim - spread / 2 + (spread * i) / (w.bullets - 1), at, from);
  } else {
    const len = fireBullet(state, p, aim + (nextRandom(state) - 0.5) * spread, at, from);
    if (len !== undefined && shot.type === 'shot') {
      shot.len = len;
      if (pr3d(input)) shot.endH = Math.round(lastEndH * 100) / 100;
    }
  }
  p.weapon = keep;
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
  const take = Math.min(magOf(p.weapon, p.rarity) - p.mag, p.ammo);
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
    case 'standup':
      throwCanister(state, p, input.aimX, input.aimY);
      break;
    case 'intern': {
      const s = SUPERS.push;
      state.events.push({ type: 'explosion', x: p.x, y: p.y, radius: s.radius });
      for (const o of state.players) {
        if (!o.alive || o.id === p.id || o.stage !== 'ground' || Math.abs(o.z - p.z) > 1.5) continue;
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
    if (k.active && d < bestD && withinReach(p, k)) {
      best = k;
      bestD = d;
    }
  }
  return best;
};

/** Spare rounds a gun can hold with this backpack. */
export const spareCap = (p: Player, g: { weapon: WeaponKind; rarity: number }) => (g.weapon === 'fists' ? 0 : magOf(g.weapon, g.rarity) * PACK.spareMags[p.pack]);
/** How many of a carried item (heals, bombs) this backpack holds. */
export const carryCap = (p: Player, kind: HealKind | 'bomb') => PACK[kind][p.pack];
const CARRIED = { bandage: 'bandages', medkit: 'medkits', coffee: 'coffees', bomb: 'bombs' } as const;
/** How many of a carried item you have. */
export const carried = (p: Player, kind: HealKind | 'bomb') => p[CARRIED[kind]];
/** Points a vest on the floor still has. */
export const vestPoints = (k: Loot) => (k.ammo > 0 ? k.ammo : VEST.points[k.tier ?? 3] ?? VEST.points[3]);

const handGun = (p: Player): Gun => ({ weapon: p.weapon, rarity: p.rarity, mag: p.mag, ammo: p.ammo });
const toHand = (p: Player, g: Gun) => {
  p.weapon = g.weapon;
  p.rarity = g.rarity;
  p.mag = g.mag;
  p.ammo = g.ammo;
  p.reload = 0;
};
const gunRounds = (g: Gun | null) => (g ? g.mag + g.ammo : 0);

/** Draw the other gun: what is in your hands goes to its slot. Cancels a heal and a reload; a moment before you can fire. */
const swapGuns = (state: GameState, p: Player) => {
  if (!p.holster) return;
  const was = handGun(p);
  toHand(p, p.holster);
  p.holster = was;
  p.slot = 1 - p.slot;
  p.swapping = SWAP_TIME;
  p.using = null;
  p.useLeft = 0;
  p.charging = null;
  p.charge = 0;
  state.events.push({ type: 'swap', player: p.id, weapon: p.weapon });
};

/**
 * Take a piece of loot. A gun goes into an empty slot (and into your hands); with both slots full it replaces the gun in your
 * hands, which drops. Ammo tops up the gun in your hands (else the other) to what the backpack holds. A vest replaces yours
 * (yours drops if anything is left of it). A backpack only ever upgrades. Heals and bombs stack up to the backpack's room;
 * whatever does not fit stays on the floor. Returns false when nothing could be taken.
 */
const takeLoot = (state: GameState, p: Player, k: Loot) => {
  const tier = k.tier ?? 0;
  if (isWeapon(k.kind)) {
    const mag = Math.min(magOf(k.kind, tier), k.ammo);
    const gun: Gun = { weapon: k.kind, rarity: tier, mag, ammo: k.ammo - mag };
    if (p.weapon === 'fists') toHand(p, gun);
    else if (!p.holster) {
      p.holster = handGun(p);
      toHand(p, gun);
      p.slot = 1 - p.slot;
      p.swapping = SWAP_TIME;
    } else {
      // Both slots full: swap the one in your hands for it, and drop yours where you stand.
      if (roundsLeft(p) > 0) dropAt(state, p, p.weapon, p.x, p.y + 0.4, roundsLeft(p), p.rarity);
      toHand(p, gun);
    }
    p.using = null;
  } else if (k.kind === 'ammo') {
    const box = (g: { weapon: WeaponKind; rarity: number; ammo: number }) => {
      if (g.weapon === 'fists') return 0;
      const room = spareCap(p, g) - g.ammo;
      return room > 0 ? Math.min(room, magOf(g.weapon, g.rarity) * AMMO_BOX_MAGS) : 0;
    };
    const inHand = box(p);
    if (inHand > 0) {
      p.ammo += inHand;
      if (p.mag <= 0) startReload(state, p);
    } else if (p.holster && box(p.holster) > 0) p.holster.ammo += box(p.holster);
    else return false;
  } else if (k.kind === 'armor') {
    if (p.armor >= 1 && p.vest > 0) dropAt(state, p, 'armor', p.x, p.y + 0.4, Math.round(p.armor), p.vest);
    p.vest = k.tier ?? 3;
    p.armor = vestPoints(k);
  } else if (k.kind === 'backpack') {
    if (tier <= p.pack) return false;
    p.pack = tier;
  } else {
    const kind = k.kind as HealKind | 'bomb';
    const have = carried(p, kind);
    const count = Math.max(1, k.ammo);
    const take = Math.min(count, carryCap(p, kind) - have);
    if (take <= 0) return false;
    p[CARRIED[kind]] = have + take;
    if (take < count) {
      // The rest of the stack stays where it was.
      k.ammo = count - take;
      state.events.push({ type: 'pickup', player: p.id, kind: k.kind });
      return true;
    }
  }
  k.active = false;
  state.events.push({ type: 'pickup', player: p.id, kind: k.kind });
  return true;
};

/**
 * Picked up without pressing anything: a gun when you have only fists, an empty gun or a free slot (not a second of the
 * kind in your hands), ammo when you run low, a vest or backpack that is better than yours, heals and bombs you have room for.
 */
export const autoTakes = (p: Player, k: Loot) => {
  if (isWeapon(k.kind)) return p.weapon === 'fists' || roundsLeft(p) === 0 || (!p.holster && k.kind !== p.weapon);
  if (k.kind === 'ammo') {
    const low = (g: Gun) => g.weapon !== 'fists' && g.ammo < Math.min(spareCap(p, g), magOf(g.weapon, g.rarity) * 2);
    return low(handGun(p)) || (!!p.holster && low(p.holster));
  }
  if (k.kind === 'armor') return vestPoints(k) > p.armor + 0.5;
  if (k.kind === 'backpack') return (k.tier ?? 0) > p.pack;
  const kind = k.kind as HealKind | 'bomb';
  return carried(p, kind) < carryCap(p, kind);
};

/** Throw a bomb (bots throw at once at the aim point; people hold to charge, see updatePlayer). */
const useItem = (state: GameState, p: Player, input: Input) => {
  if (p.bombs <= 0) return;
  lob(state, p, input.aimX, input.aimY, ITEMS.bomb.range, ITEMS.bomb.damage, ITEMS.bomb.radius);
  p.revealed = 1;
  p.bombs -= 1;
};

/** Which heal the heal button uses now: a med kit when badly hurt, else a bandage, else coffee (null = nothing to use). */
export const healChoice = (p: Player): HealKind | null => {
  const missing = p.maxHp - p.hp;
  const bandageOk = p.bandages > 0 && p.hp < HEALS.bandage.upTo;
  if (missing >= 40 && p.medkits > 0) return 'medkit';
  if (bandageOk) return 'bandage';
  if (missing > 0.5 && p.medkits > 0) return 'medkit';
  if (p.coffees > 0) return 'coffee';
  return null;
};

const startHeal = (state: GameState, p: Player, kind: HealKind) => {
  if (p.using || carried(p, kind) <= 0) return;
  if (kind === 'bandage' && p.hp >= HEALS.bandage.upTo) return;
  if (kind === 'medkit' && p.hp >= p.maxHp) return;
  p.using = kind;
  p.useLeft = HEALS[kind].time;
  p.reload = 0;
  p.charging = null;
  p.charge = 0;
  state.events.push({ type: 'heal', player: p.id, kind, done: false });
};

const finishHeal = (state: GameState, p: Player) => {
  const kind = p.using!;
  p.using = null;
  p.useLeft = 0;
  p[CARRIED[kind]] -= 1;
  if (kind === 'bandage') p.hp = Math.max(p.hp, Math.min(HEALS.bandage.upTo, p.hp + HEALS.bandage.heal));
  else if (kind === 'medkit') p.hp = Math.min(p.maxHp, p.hp + HEALS.medkit.heal);
  else p.buzz = HEALS.coffee.buzz;
  state.events.push({ type: 'heal', player: p.id, kind, done: true });
  // Done: the gun comes back up.
  p.item = null;
};

// ---------- per tick

/**
 * Feet: on a surface they follow it (up and down a roof's slope); off it (a hop, or walking off a roof's edge) gravity
 * pulls them down to whatever is under them, the ground or another roof. A drop of more than a metre is a thud.
 */
/** What holds your feet at (x, y) coming from height z: a roof, a container's or the HQ's flat top, else the ground. */
const standAt = (x: number, y: number, z: number) => {
  const r = supportAt(x, y, z);
  const t = propTopAt(x, y);
  return t >= 0 && z >= t - 0.6 ? Math.max(r, t) : r;
};

const updateFeet = (state: GameState, p: Player, hop: boolean) => {
  const under = standAt(p.x, p.y, p.z);
  if (p.jz === 0 && p.z <= under + 0.35 && p.z >= under - 0.6) {
    p.z = under;
    if (!hop) return;
    p.jz = FEET.jump;
    state.events.push({ type: 'hop', player: p.id, x: p.x, y: p.y });
  }
  const was = p.z;
  p.jz -= FEET.gravity * DT;
  p.z += p.jz * DT;
  // You come down onto a roof only from above it; under it (never reached from the side) the floor is what holds you.
  let below = standAt(p.x, p.y, was);
  if (below > was + 0.35) below = 0;
  if (p.z <= below) {
    if (p.jz * p.jz > 2 * FEET.gravity * FEET.landDrop) state.events.push(below > 0 ? { type: 'thud', player: p.id, x: p.x, y: p.y, z: below } : { type: 'thud', player: p.id, x: p.x, y: p.y });
    p.z = below;
    p.jz = 0;
  }
};

/** Start up a ladder: from its foot (in line with its rungs) to the roof just inside the wall. */
const startClimb = (state: GameState, p: Player, l: NonNullable<ReturnType<typeof ladderAt>>) => {
  const cx = l.tx * TILE + TILE / 2;
  const cy = l.ty * TILE + TILE / 2;
  p.climb = CLIMB.time;
  p.vaultFrom = { x: cx + l.nx * (TILE / 2 + PLAYER_RADIUS + 0.05), y: cy + l.ny * (TILE / 2 + PLAYER_RADIUS + 0.05) };
  p.vaultTo = { x: cx - l.nx * 0.3, y: cy - l.ny * 0.3 };
  p.vx = 0;
  p.vy = 0;
  p.jz = 0;
  p.pushing = 0;
  p.using = null;
  state.events.push({ type: 'vault', player: p.id, x: p.x, y: p.y });
};

const updatePlayer = (state: GameState, p: Player, input: Input) => {
  const pressed = (k: 'super' | 'use' | 'reload' | 'roll') => input[k] && !p.prev[k];
  p.cooldown = Math.max(0, p.cooldown - DT);
  p.revealed = Math.max(0, p.revealed - DT);
  p.slowed = Math.max(0, p.slowed - DT);
  p.sinceCombat += DT;

  p.swapping = Math.max(0, p.swapping - DT);
  if (p.buzz > 0) {
    // Coffee: a steady trickle of health, fight or no fight.
    p.buzz = Math.max(0, p.buzz - DT);
    p.hp = Math.min(p.maxHp, p.hp + HEALS.coffee.perSecond * DT);
  }
  // No healing by itself (Reis, 2026-11-24): health comes back only from a bandage, a med kit or coffee you use.

  // Turn towards the aim at a limited rate, never snapping. Swimming, you face where you swim.
  const swimming = inWater(p.x, p.y);
  const swimTurn = swimming && Math.hypot(p.vx, p.vy) > 0.4;
  if (swimTurn || Math.hypot(input.aimX - p.x, input.aimY - p.y) > 0.05) {
    const want = swimTurn ? Math.atan2(p.vy, p.vx) : Math.atan2(input.aimY - p.y, input.aimX - p.x);
    let d = want - p.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxTurn = input.snap && !swimTurn ? Math.PI : MOVE.turn * DT;
    p.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
  }

  // Two gun slots: 1 / 2 draw one, X (or the wheel, or SWAP) the other one. 3 takes the heals in hand, 4 a bomb: then
  // shoot uses them (no extra key); 1, 2, X or the wheel put them away. Swimming, both hands swim.
  const slotPress = input.slot && input.slot !== (p.prev.slot ?? 0) ? input.slot - 1 : -1;
  const cyclePress = !!input.cycle && !p.prev.cycle;
  if (swimming && p.item) p.item = null;
  if (slotPress === 2 || slotPress === 3) {
    const want = slotPress === 2 ? 'heal' : 'bomb';
    const has = want === 'heal' ? healChoice(p) !== null : p.bombs > 0;
    if (has && !swimming && p.item !== want) {
      p.item = want;
      p.charging = null;
      p.charge = 0;
      p.reload = 0;
      if (p.using && want !== 'heal') p.using = null;
      state.events.push({ type: 'swap', player: p.id, weapon: p.weapon });
    }
  } else if (p.item && (cyclePress || slotPress >= 0)) {
    // Back to the gun (the other one if that slot was asked for).
    p.item = null;
    p.charging = null;
    p.charge = 0;
    p.swapping = SWAP_TIME * 0.5;
    if (slotPress >= 0 && slotPress !== p.slot) swapGuns(state, p);
    else state.events.push({ type: 'swap', player: p.id, weapon: p.weapon });
  } else if (cyclePress || (slotPress >= 0 && slotPress !== p.slot)) swapGuns(state, p);
  if (p.item === 'bomb' && p.bombs <= 0 && p.charging !== 'bomb') p.item = null;
  if (p.item === 'heal' && !p.using && healChoice(p) === null) p.item = null;

  // Heals: a moment of standing nearly still with something in your hands that is not a gun.
  if (swimming && p.using) p.using = null;
  if (p.using) {
    p.useLeft -= DT;
    if (p.useLeft <= 0) finishHeal(state, p);
  } else if (!swimming && input.bandage && !p.prev.bandage) startHeal(state, p, 'bandage');
  else if (!swimming && input.medkit && !p.prev.medkit) startHeal(state, p, 'medkit');
  else if (!swimming && input.heal && !p.prev.heal) {
    const kind = healChoice(p);
    if (kind) startHeal(state, p, kind);
  } else if (!swimming && input.coffee && !p.prev.coffee && p.coffees > 0) startHeal(state, p, 'coffee');

  // 5 takes a bomb in hand, or puts it back (Reis, 2026-11-24: 3 bandage, 4 med kit, 5 bomb); a heal puts it away too.
  if (input.bomb && !p.prev.bomb && !swimming) {
    if (p.item === 'bomb') {
      p.item = null;
      p.swapping = SWAP_TIME * 0.5;
      state.events.push({ type: 'swap', player: p.id, weapon: p.weapon });
    } else if (p.bombs > 0) {
      p.item = 'bomb';
      p.reload = 0;
      state.events.push({ type: 'swap', player: p.id, weapon: p.weapon });
    }
    p.charging = null;
    p.charge = 0;
  }
  if (p.item === 'bomb' && p.using) {
    p.item = null;
    p.charging = null;
    p.charge = 0;
  }

  updateReload(p);
  if (pressed('reload') && !p.using) startReload(state, p);
  p.rollCooldown = Math.max(0, p.rollCooldown - DT);

  // The dodge roll: the way you're moving (or facing), sliding along whatever it meets.
  if (pressed('roll') && !swimming && p.rollCooldown <= 0 && p.rolling <= 0 && p.vault <= 0 && p.dashTime <= 0 && !p.charging) {
    const len = Math.hypot(input.mx, input.my);
    p.rollDir = len > 0.01 ? Math.atan2(input.my, input.mx) : p.heading;
    p.rolling = ROLL.time;
    p.using = null;
    p.rollCooldown = ROLL.cooldown;
    state.events.push({ type: 'roll', player: p.id, x: p.x, y: p.y });
  }
  if (p.rolling > 0 || p.climb > 0 || p.vault > 0) p.crouch = 0; // a roll, a ladder or a vault stands you up
  if (p.rolling > 0) {
    p.rolling = Math.max(0, p.rolling - DT);
    const v = ROLL.distance / ROLL.time;
    p.vx = Math.cos(p.rollDir) * v;
    p.vy = Math.sin(p.rollDir) * v;
    moveBy(state, p, p.vx * DT, p.vy * DT);
    updateFeet(state, p, false);
    p.heading = p.rollDir;
    p.prev = { ...input };
    return;
  }

  if (p.climb > 0) {
    // Up the ladder (three quarters of the time), then over the eave onto the roof. No shooting meanwhile.
    p.climb = Math.max(0, p.climb - DT);
    const k = 1 - p.climb / CLIMB.time;
    const top = roofAt(p.vaultTo.x, p.vaultTo.y);
    const up = Math.min(1, k / 0.75);
    const over = Math.max(0, (k - 0.75) / 0.25);
    p.x = p.vaultFrom.x + (p.vaultTo.x - p.vaultFrom.x) * over;
    p.y = p.vaultFrom.y + (p.vaultTo.y - p.vaultFrom.y) * over;
    p.z = top * up;
    p.jz = 0;
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
      if (!o.alive || o.id === p.id || p.dashHit.includes(o.id) || Math.abs(feetOf(o) - p.z) > 1.5) continue;
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
    // Crouched: down on the ground only (a hop, a ladder, the water or a roll stand you up).
    const down = !!input.crouch && !swimming && p.jz === 0;
    p.crouch = Math.max(0, Math.min(1, p.crouch + (down ? 1 : -1) * CROUCH.rate * DT));
    const top =
      FIGHTERS[p.fighter].speed * (p.slowed > 0 ? SUPERS.timebox.slow : 1) * (Math.abs(p.lean) > 0.3 ? LEAN.speed : 1) * (swimming ? SWIM.speed : 1) *
      (1 - (1 - CROUCH.speed) * p.crouch) *
      (p.using ? HEALS.walk : 1) * (p.buzz > 0 ? HEALS.coffee.speed : 1);
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
    // Keep pushing into a fence, window or low furniture and you climb over it; into a ladder, and you climb up it.
    // Only from your feet (the floor or a hop): falling past a window off a roof you do not dive in through it.
    const pushingInto = vaultable && p.z < 1 && len > 0.01 && c > 1e-5 && (input.mx * cx + input.my * cy) / (len * c) < -0.6;
    const ladder = p.z < 0.3 && p.jz === 0 && len > 0.01 && !swimming ? ladderAt(p.x, p.y, PLAYER_RADIUS + 0.3) : null;
    const climbing = !!ladder && -(input.mx * ladder.nx + input.my * ladder.ny) / len > 0.6;
    p.pushing = pushingInto || climbing ? p.pushing + DT : 0;
    if (climbing && p.pushing >= CLIMB.after) startClimb(state, p, ladder);
    else if (pushingInto && p.pushing >= VAULT.after) tryVault(state, p, -cx / c, -cy / c);
  }
  if (p.climb <= 0) updateFeet(state, p, !swimming && input.jump && !p.prev.jump);

  // People charge rockets and bombs: hold to throw farther, let go to throw. Bots throw at once.
  if (swimming) {
    // Both hands are swimming: no shooting, no throwing.
    p.charging = null;
    p.charge = 0;
  } else if (p.item === 'heal') {
    // Heals in hand: shoot starts the one that fits now (a med kit when badly hurt, else a bandage, else coffee).
    if (input.fire && !p.prev.fire && !p.using) {
      const kind = healChoice(p);
      if (kind) startHeal(state, p, kind);
    }
  } else if (p.item === 'bomb') {
    // A bomb in hand: hold shoot to wind up (farther), let go to throw; with the mouse it goes to the aim point.
    if (input.fire && p.bombs > 0) {
      p.charging = 'bomb';
      p.charge += DT;
    } else if (p.charging === 'bomb') {
      const toAim = Math.hypot(input.aimX - p.x, input.aimY - p.y);
      const d = input.throwAt || input.aimH !== undefined ? Math.min(ITEMS.bomb.range, Math.max(THROW.min, toAim)) : throwDistance(p.charge, ITEMS.bomb.range);
      const a = toAim > 0.3 ? Math.atan2(input.aimY - p.y, input.aimX - p.x) : p.heading;
      lob(state, p, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, ITEMS.bomb.range, ITEMS.bomb.damage, ITEMS.bomb.radius);
      state.events.push({ type: 'throw', player: p.id });
      p.revealed = 1;
      p.bombs -= 1;
      p.charge = 0;
      p.charging = null;
      // Thrown: the gun comes back up.
      p.item = null;
      p.swapping = SWAP_TIME * 0.5;
    }
  } else if (input.fire && p.using) {
    // Pulling the trigger puts the heal away (a fresh press, so holding fire through a heal you started does not).
    if (!p.prev.fire) p.using = null;
  } else if (input.fire && p.cooldown <= 0) shoot(state, p, input);
  else if (input.fire && p.weapon !== 'fists' && p.mag <= 0 && p.ammo <= 0 && !p.prev.fire) state.events.push({ type: 'dryFire', player: p.id });
  if (p.charging === 'rockets') {
    p.charging = null;
    p.charge = 0;
  }
  // The slow-field canister (people): hold G to aim (the HUD shows the arc and where it lands), let go to throw.
  // Bots, and every other super, go off on the press.
  const aimsSuper = !p.bot && p.fighter === 'standup';
  if (p.charging === 'super' && (swimming || p.superCharge < 1)) p.charging = null;
  if (aimsSuper && p.charging === 'super' && !input.super) {
    p.charging = null;
    useSuper(state, p, input);
  } else if (pressed('super') && !swimming && p.superCharge >= 1 && p.dashTime <= 0) {
    if (aimsSuper) p.charging = 'super';
    else useSuper(state, p, input);
  }

  const k = lootUnder(state, p);
  // Walking over a pile, take whatever of it is wanted (the nearest first).
  let auto: Loot | null = k && autoTakes(p, k) ? k : null;
  if (!auto) {
    for (const o of state.loot) if (o.active && Math.hypot(o.x - p.x, o.y - p.y) < 1.2 && withinReach(p, o) && autoTakes(p, o)) {
      auto = o;
      break;
    }
  }
  if (auto) takeLoot(state, p, auto);
  else if (pressed('use')) {
    // F picks up, never throws (a bomb is thrown from the hand, see 5). Bots still throw theirs with it.
    if (k) takeLoot(state, p, k);
    else if (p.bot && p.bombs > 0 && !swimming && !p.using) useItem(state, p, input);
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
      if (pr.field) slowBurst(state, pr.owner, pr.tx, pr.ty, pr.h1 ?? 0);
      else explode(state, pr.owner, pr.tx, pr.ty, pr.radius, pr.damage, pr.h1 ?? 0);
      return false;
    }
    return true;
  }
  if (pr.kind === 'rocket') return updateRocket(state, pr);
  pr.life -= DT;
  if (pr.life <= 0) return false;
  const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * DT) / 0.4));
  for (let s = 0; s < steps; s++) {
    const px = pr.x;
    const py = pr.y;
    const ph = pr.h ?? 1.1;
    pr.x += (pr.vx * DT) / steps;
    pr.y += (pr.vy * DT) / steps;
    // A round climbs to someone higher up (in the air, on a roof) or dips to someone lower, in a straight line.
    if (pr.h0 !== undefined) {
      const k = Math.hypot(pr.x - pr.sx, pr.y - pr.sy) / (pr.hd ?? 1);
      pr.h = pr.h0 + ((pr.h1 ?? pr.h0) - pr.h0) * (pr.ext ? k : Math.min(1, k));
    }
    const ht = pr.h ?? 1.1;
    if (ht <= 0.02 || solidStep(state, px, py, ph, pr.x, pr.y, ht)) {
      hitRack(state, toTile(pr.x), toTile(pr.y), pr.damage);
      state.events.push(ht === 1.1 ? { type: 'impact', x: pr.x, y: pr.y } : { type: 'impact', x: pr.x, y: pr.y, z: ht });
      return false;
    }
    for (const o of state.players) {
      if (o.id === pr.owner || !targetable(o)) continue;
      const h = hitPoint(o);
      // The body runs from the feet to the top of the head: a round over or under it misses.
      const feet = feetOf(o);
      if (ht < feet - 0.1 || ht > feet + bodyTop(o)) continue;
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

const updateRocket = (state: GameState, pr: Projectile) => {
  pr.life -= DT;
  const boom = () => {
    explode(state, pr.owner, pr.x, pr.y, pr.radius, pr.damage, Math.max(0, (pr.h ?? 0) - 1.1));
    return false;
  };
  if (pr.life <= 0) return boom();
  const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * DT) / 0.3));
  for (let s = 0; s < steps; s++) {
    const px = pr.x;
    const py = pr.y;
    const ph = pr.h ?? ROCKET.launchHeight;
    pr.x += (pr.vx * DT) / steps;
    pr.y += (pr.vy * DT) / steps;
    pr.vh = (pr.vh ?? 0) - (ROCKET.gravity * DT) / steps;
    pr.h = (pr.h ?? ROCKET.launchHeight) + (pr.vh * DT) / steps;
    if (pr.h <= 0.05) return boom();
    if (solidStep(state, px, py, ph, pr.x, pr.y, pr.h)) {
      hitRack(state, toTile(pr.x), toTile(pr.y), pr.damage);
      return boom();
    }
    for (const o of state.players) {
      if (o.id === pr.owner || !targetable(o)) continue;
      if (Math.abs(chestHeight(o) - pr.h) > 1.6) continue;
      const h = hitPoint(o);
      if (Math.hypot(h.x - pr.x, h.y - pr.y) < PLAYER_RADIUS + 0.25) {
        o.lastHitWith = 'rockets';
        state.players[pr.owner].hits += 1;
        return boom();
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
    for (const o of state.players) if (o.alive && o.id !== fld.owner && o.stage === 'ground' && blastDistance(o, fld.x, fld.y, fld.z ?? 0) < fld.r) o.slowed = 0.2;
  }
  state.fields = state.fields.filter((fld) => fld.life > 0);
  for (const w of state.walls) w.life -= DT;
  state.walls = state.walls.filter((w) => w.life > 0);
  state.loot = state.loot.filter((k) => k.active);
  if (state.phase === 'play') updateZone(state);
  return state;
};
