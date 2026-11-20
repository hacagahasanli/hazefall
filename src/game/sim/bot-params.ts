// Bot tuning and the pure helpers behind it: personalities, where each bot lands, what loot is
// worth, and where to hide. Everything is a function of the match and the bot's own seed, so a
// host replays the same bots.
import { ARMOR, BUILDINGS, DROP, MAP, TILE, WEAPONS, WORLD } from './constants';
import { circleBlocked, inPlant, lineOfSight, solidAt } from './step';

import type { Drone, GameState, Loot, LootKind, Player, WeaponKind } from './types';

export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type PersonaName = 'rusher' | 'camper' | 'looter' | 'tactical';

export interface Persona {
  name: PersonaName;
  /** Seconds from first seeing someone to the first shot at them. */
  react: number;
  /** Aim error in degrees: starts at aim0, settles to aimMin with this time constant (s) while on target. */
  aim0: number;
  aimMin: number;
  decay: number;
  /** Field of view, degrees (360 within 6 m, or when just shot at or hearing shots). */
  fov: number;
  /** 0..1: how readily it starts a fight. */
  aggro: number;
  /** Retreats when (hp + armor) / maxHp drops below this. */
  back: number;
  /** How much it cares about loot (scales scores and search radius). */
  loot: number;
  /** Likes busy landing spots with lots of loot. */
  hot: number;
  /** Walks towards gunfire heard within this many metres (0 = never). */
  chase: number;
}

const BASE: Record<PersonaName, Omit<Persona, 'name'>> = {
  rusher: { react: 0.32, aim0: 12, aimMin: 3.5, decay: 0.6, fov: 150, aggro: 0.8, back: 0.25, loot: 0.6, hot: 0.8, chase: 45 },
  camper: { react: 0.45, aim0: 9, aimMin: 2.5, decay: 0.8, fov: 120, aggro: 0.3, back: 0.45, loot: 1.0, hot: 0.2, chase: 0 },
  looter: { react: 0.55, aim0: 14, aimMin: 4, decay: 1, fov: 130, aggro: 0.4, back: 0.55, loot: 1.4, hot: 0.1, chase: 0 },
  tactical: { react: 0.3, aim0: 10, aimMin: 2.5, decay: 0.5, fov: 150, aggro: 0.6, back: 0.35, loot: 0.9, hot: 0.5, chase: 35 },
};

/**
 * Nine bots: three rushers, three looters, two campers and one tactical player, shuffled per
 * match. The first three take the spots near the middle of the route, the player's likely
 * neighbours, so they are the ones who loot before they fight.
 */
const ROSTER: PersonaName[] = ['looter', 'camper', 'looter', 'rusher', 'tactical', 'rusher', 'camper', 'rusher', 'looter'];

/** A personality with +-15% per-bot jitter, so two rushers differ. */
export const makePersona = (name: PersonaName, rand: () => number): Persona => {
  const out = { name } as Persona;
  for (const [k, v] of Object.entries(BASE[name])) (out as unknown as Record<string, number>)[k] = v * (0.85 + rand() * 0.3);
  return out;
};

/** How far each weapon likes to fight from, and the farthest it opens fire. */
export const PREFERRED: Record<WeaponKind, number> = { fists: 1, pistol: 9, smg: 7, shotgun: 3.5, rifle: 12, sniper: 18, rockets: 10 };
export const FIRE_RANGE: Record<WeaponKind, number> = { fists: 1.6, pistol: 17, smg: 14, shotgun: 9, rifle: 24, sniper: 30, rockets: 18 };
const TIER: Record<WeaponKind, number> = { fists: 0, pistol: 1, smg: 2, shotgun: 2, rifle: 3, sniper: 3, rockets: 2.5 };
export const isAutomatic = (w: WeaponKind) => w === 'smg' || w === 'rifle';

export const tierOf = (me: Player) => (me.weapon === 'fists' || me.mag + me.ammo <= 0 ? 0 : TIER[me.weapon]);

/** What a piece of loot is worth to me right now (0 = leave it). Never a downgrade. */
export const lootValue = (kind: LootKind, me: Player) => {
  if (kind in WEAPONS) {
    const gain = TIER[kind as WeaponKind] - tierOf(me);
    return gain > 0 ? gain : 0;
  }
  if (kind === 'ammo') {
    if (me.weapon === 'fists') return 0;
    const left = me.mag + me.ammo;
    const mag = WEAPONS[me.weapon].mag;
    return left < mag ? 1.5 : left < mag * 2 ? 0.4 : 0;
  }
  if (kind === 'armor') return me.armor < ARMOR.points * 0.7 ? (ARMOR.points - me.armor) / 40 : 0;
  if (me.item !== null) return 0;
  return kind === 'medkit' ? (me.hp < me.maxHp * 0.7 ? 1.6 : 1.2) : 0.8;
};

/** The loot most worth walking to (none near the enemy I can see); the search shrinks after the first circle. */
export const bestLoot = (state: GameState, me: Player, p: Persona, enemy: Player | null) => {
  const reach = (state.zone.phase === 0 || tierOf(me) === 0 ? 30 : 14) * p.loot;
  let best = 0.15;
  let pick: Loot | null = null;
  for (const k of state.loot) {
    const d = Math.hypot(k.x - me.x, k.y - me.y);
    if (!k.active || d > reach || (enemy && Math.hypot(k.x - enemy.x, k.y - enemy.y) < 8)) continue;
    const score = (lootValue(k.kind, me) * p.loot) / (1 + d / 10);
    if (score > best) {
      best = score;
      pick = k;
    }
  }
  return pick;
};

/** Angular aim error in degrees: loose on a new target, settling the longer I stay on it; worse at a runner. */
export const aimError = (p: Persona, onTarget: number, targetSpeed: number) =>
  (p.aim0 * Math.exp(-onTarget / p.decay) + p.aimMin) * (targetSpeed > 4 ? 1.3 : 1);

/**
 * Pace by stage: how much readier to fight every bot is (added to the fight score), how far it walks towards gunfire
 * (x its own chase distance) and how much sooner it breaks off when hurt, by Deadline phase. Early on bots gear up and
 * leave distant fights alone, so the first circle is not a chain of third parties; from the fourth phase they press.
 * It changes how often fights start and how often they end in a KO, never aim or reaction.
 */
export const STAGE_AGGRO = [-0.35, -0.25, -0.1, 0.1, 0.3, 0.3];
export const STAGE_CHASE = [0.55, 0.8, 1, 1, 1, 1];
/** Added to the personality's retreat threshold: early on a hurt bot breaks off sooner and heals instead of trading to the death. */
export const STAGE_BACK = [0.3, 0.15, 0.05, 0, 0, 0];
/** With this many or fewer alive, everyone hunts: full aggression and chase, and roaming heads for the middle of the circle. */
export const HUNT_ALIVE = 3;
/** Seconds after landing before a bot picks a fight: with another bot, and with a person. */
export const LANDING_GRACE = { bot: 30, human: 34 };
export const stagePace = (phase: number, alive: number) => {
  const k = Math.min(phase, STAGE_AGGRO.length - 1);
  return alive <= HUNT_ALIVE ? { aggro: 0.3, chase: 1, back: 0, hunt: true } : { aggro: STAGE_AGGRO[k], chase: STAGE_CHASE[k], back: STAGE_BACK[k], hunt: false };
};

/** Should I take this fight? 0.85 and up: yes. `stage` is the pace bonus from `stagePace`. */
export const engageScore = (
  p: Persona,
  me: Player,
  enemy: Player,
  d: number,
  why: { stage: number; hurtRecently: boolean; landing: boolean },
) => {
  const weak = (enemy.hp + enemy.armor) / enemy.maxHp < 0.4;
  // Someone already busy with somebody else is an opportunity (rushers don't wait for one).
  const busy = enemy.sinceCombat < 2 && enemy.lastHitBy !== me.id && p.name !== 'rusher';
  const armed = tierOf(me) > 0;
  return (
    p.aggro +
    (why.landing ? -0.6 : 0) +
    why.stage +
    (why.hurtRecently ? 0.6 : 0) +
    (d < 10 ? 0.4 : 0) +
    (weak ? 0.3 : 0) +
    (busy ? 0.3 : 0) +
    (armed || d < 3 ? 0 : -2)
  );
};
export const ENGAGE_AT = 0.85;

// ---------- landing spots

const CENTRES = BUILDINGS.map((b) => {
  let loot = 0;
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) if (MAP[y]?.[x] === 'l') loot += 1;
  return { x: (b.x0 + b.w / 2) * TILE, y: (b.y0 + b.h / 2) * TILE, loot };
});

const droneAt = (d: Drone, t: number) => ({ x: d.x0 + (d.x1 - d.x0) * t, y: d.y0 + (d.y1 - d.y0) * t });
const overCampus = (p: { x: number; y: number }) => p.x > 4 && p.y > 4 && p.x < WORLD - 4 && p.y < WORLD - 4;
/** Bots jump by this point of the route at the latest (the drone forces everyone out a little later). */
export const LAST_JUMP = DROP.forceJump - 0.03;
/** How far a bot can steer on the way down (free fall plus parachute, with some margin). */
const REACH = 68;

/** How far from the middle of the route the player's two or three neighbours land (m): far enough to loot in peace first. */
export const NEAR_BAND = { min: 32, max: 62 };

export interface Landing {
  x: number;
  y: number;
  /** When to jump: the point of the route nearest the spot. */
  t: number;
  persona: PersonaName;
}

/**
 * Where every bot in the match lands, worked out the same way by each bot from the drone's route:
 * two or three next to the middle of the route (so wherever the player jumps there are
 * neighbours), the rest spread over the other reachable buildings, at most two per building.
 */
export const landingPlan = (state: GameState): Map<number, Landing> => {
  const d = state.drone;
  const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) || 1;
  let tMin = 0;
  while (tMin < LAST_JUMP && !overCampus(droneAt(d, tMin))) tMin += 0.01;
  const tOf = (x: number, y: number) => Math.min(LAST_JUMP, Math.max(tMin + 0.02, ((x - d.x0) * (d.x1 - d.x0) + (y - d.y0) * (d.y1 - d.y0)) / (len * len)));
  const hash = Math.floor(Math.abs(d.x0 * 7919 + d.y0 * 104729 + d.x1 * 13 + d.y1 * 31)) | 0;
  const rand = mulberry32(hash);
  const cands = CENTRES.map((c, i) => {
    const t = tOf(c.x, c.y);
    const p = droneAt(d, t);
    return { ...c, i, t, off: Math.hypot(c.x - p.x, c.y - p.y), n: 0 };
  }).filter((c) => c.off < REACH);
  const bots = state.players.filter((p) => p.bot).map((p) => p.id);
  for (let i = bots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bots[i], bots[j]] = [bots[j], bots[i]];
  }
  const mid = droneAt(d, tOf(WORLD / 2, WORLD / 2));
  // Neighbours for the player: near the route's middle, but not on top of it.
  const fromMid = (c: { x: number; y: number }) => Math.hypot(c.x - mid.x, c.y - mid.y);
  const near = cands.filter((c) => fromMid(c) > NEAR_BAND.min && fromMid(c) < NEAR_BAND.max).sort((a, b) => fromMid(a) - fromMid(b));
  const nNear = 2 + (hash & 1);
  const chosen: { x: number; y: number }[] = [];
  const plan = new Map<number, Landing>();
  bots.forEach((id, k) => {
    const persona = ROSTER[k % ROSTER.length];
    let pick = k < nNear ? near.find((c) => c.n === 0 && chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 20)) : undefined;
    if (!pick) {
      let best = -Infinity;
      for (const c of cands) {
        if (c.n >= 2) continue;
        const gap = chosen.length ? Math.min(60, ...chosen.map((o) => Math.hypot(o.x - c.x, o.y - c.y))) : 30;
        const score = gap + BASE[persona].hot * c.loot * 3 + rand() * 20 - c.n * 80;
        if (score > best) {
          best = score;
          pick = c;
        }
      }
    }
    if (!pick) {
      // Nothing reachable (cannot happen on this map): land under the route's middle.
      plan.set(id, { x: mid.x, y: mid.y, t: 0.5, persona });
      return;
    }
    pick.n += 1;
    const x = pick.x + (pick.n === 2 ? 3 : 0);
    chosen.push({ x, y: pick.y });
    plan.set(id, { x, y: pick.y, t: pick.t, persona });
  });
  return plan;
};

export const fallbackPersona = (id: number) => ROSTER[id % ROSTER.length];

// ---------- cover

/**
 * A spot near me that the threat cannot see: 8 points 5 m out and 4 at 9 m, inside the next
 * Deadline, open to stand on, with a wall between it and the threat (a bush counts for campers).
 */
export const coverPoint = (state: GameState, me: Player, tx: number, ty: number, plants: boolean) => {
  const z = state.zone;
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const r = i < 8 ? 5 : 9;
    const a = i < 8 ? (i / 8) * Math.PI * 2 : (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = me.x + Math.cos(a) * r;
    const y = me.y + Math.sin(a) * r;
    if (circleBlocked(state, x, y, 0.7) || solidAt(state, x, y)) continue;
    if (Math.hypot(x - z.toX, y - z.toY) > Math.max(z.toR, 6) && Math.hypot(x - z.cx, y - z.cy) > z.r) continue;
    const hidden = !lineOfSight(state, tx, ty, x, y) || (plants && inPlant(x, y) && Math.hypot(x - tx, y - ty) > 4);
    if (!hidden) continue;
    const score = -r + 0.5 * Math.hypot(x - tx, y - ty);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
};

/** Somewhere to sit and wait: next to a wall or in a bush near (x, y). */
export const campSpot = (state: GameState, x: number, y: number) => {
  for (let ring = 1; ring <= 4; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = x + Math.cos(a) * ring * 2.5;
      const cy = y + Math.sin(a) * ring * 2.5;
      if (circleBlocked(state, cx, cy, 0.7)) continue;
      const wall = [0, 1, 2, 3].some((k) => solidAt(state, cx + Math.cos((k * Math.PI) / 2) * 1.3, cy + Math.sin((k * Math.PI) / 2) * 1.3));
      if (wall || inPlant(cx, cy)) return { x: cx, y: cy };
    }
  }
  return { x, y };
};
