// Bot tuning and the pure helpers behind it: personalities, where each bot lands, what loot is
// worth, and where to hide. Everything is a function of the match and the bot's own seed, so a
// host replays the same bots.
import { BUILDINGS, DROP, HEALS, magOf, MAP, PLACE_TIER, placeAt, PLAYERS, TILE, WORLD } from './constants';
import { carried, carryCap, chestHeight, circleBlocked, inPlant, lineOfSight, solidAt, spareCap, vestPoints } from './step';

import type { Drone, GameState, Gun, HealKind, Loot, LootKind, Player, WeaponKind } from './types';

/**
 * The one line-of-sight check every bot decision goes through: a clear straight 3D line (walls, trunks and roofs block
 * it, doorways and windows do not) from one point to another at the given heights, chest height on the ground by default.
 */
export const botSight = (state: GameState, ax: number, ay: number, bx: number, by: number, ah = 1.1, bh = 1.1) => lineOfSight(state, ax, ay, bx, by, ah, bh);
/** Can bot `a` see fighter `b`: chest to chest, through the same check. */
export const botSees = (state: GameState, a: Player, b: Player) => botSight(state, a.x, a.y, b.x, b.y, chestHeight(a), chestHeight(b));

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
  /** 0..1: sure of itself. High: pushes and fights in the open; low: holds cover and peeks, heals sooner and fuller. */
  confidence: number;
  /** How quickly it notices someone (x the base spotting speed): the watchful ones see you sooner. */
  eyes: number;
  /** Chance per fight of a human slip: a late reaction, staying in the open, a reload mid-fight, a long loose burst. */
  mistake: number;
  /** Movement style: how far (m) and how often (s) it sidesteps in a fight, and the chance it rolls away when hit. */
  strafeW: number;
  strafeT: number;
  dodge: number;
}

const BASE: Record<PersonaName, Omit<Persona, 'name'>> = {
  rusher: { react: 0.24, aim0: 10, aimMin: 3, decay: 0.5, fov: 160, aggro: 1.05, back: 0.16, loot: 0.5, hot: 0.8, chase: 60, confidence: 0.75, eyes: 1.0, mistake: 0.12, strafeW: 2.6, strafeT: 0.75, dodge: 0.3 },
  camper: { react: 0.32, aim0: 8, aimMin: 2.2, decay: 0.7, fov: 130, aggro: 0.6, back: 0.3, loot: 0.9, hot: 0.3, chase: 25, confidence: 0.45, eyes: 1.15, mistake: 0.07, strafeW: 1.0, strafeT: 1.2, dodge: 0.12 },
  looter: { react: 0.38, aim0: 12, aimMin: 3.4, decay: 0.8, fov: 140, aggro: 0.7, back: 0.3, loot: 1.1, hot: 0.2, chase: 35, confidence: 0.5, eyes: 0.95, mistake: 0.14, strafeW: 1.8, strafeT: 1, dodge: 0.18 },
  tactical: { react: 0.22, aim0: 9, aimMin: 2.2, decay: 0.45, fov: 160, aggro: 0.9, back: 0.22, loot: 0.8, hot: 0.5, chase: 55, confidence: 0.65, eyes: 1.1, mistake: 0.05, strafeW: 2.2, strafeT: 0.9, dodge: 0.25 },
};

/**
 * The bots' personalities, nine at a time (four rushers, two tactical players, two looters and one camper), repeated for
 * more bots (nineteen: eight rushers, four tactical, five looters, two campers) and shuffled per match: mostly fighters,
 * still a few who gear up or sit and wait. The first three take the spots near the middle of the route, the player's
 * likely neighbours: a looter, a rusher and a tactical player, so a person meets a fight soon after landing.
 */
const ROSTER: PersonaName[] = ['looter', 'rusher', 'tactical', 'rusher', 'camper', 'rusher', 'tactical', 'rusher', 'looter'];

/** A personality with +-15% per-bot jitter (+-30% for how sure of itself and how slip-prone it is), so two rushers differ. */
export const makePersona = (name: PersonaName, rand: () => number): Persona => {
  const out = { name } as Persona;
  for (const [k, v] of Object.entries(BASE[name])) {
    const wide = k === 'confidence' || k === 'mistake';
    (out as unknown as Record<string, number>)[k] = v * (wide ? 0.7 + rand() * 0.6 : 0.85 + rand() * 0.3);
  }
  out.confidence = Math.min(1, out.confidence);
  return out;
};

/**
 * Seconds from spotting someone to the first shot: the personality's reaction time with a spread round it (people are
 * not metronomes: mostly near their own speed, now and then slow), longer against a person (`human`), and a slip adds a
 * proper hesitation.
 */
export const reactionDelay = (p: Persona, rand: () => number, human: number, slip: boolean) => {
  const spread = 0.75 + rand() * 0.35 + (rand() < 0.2 ? rand() * 0.45 : 0);
  return p.react * spread * human + (slip ? 0.3 + rand() * 0.35 : 0);
};

/** How far each weapon likes to fight from, and the farthest it opens fire. */
export const PREFERRED: Record<WeaponKind, number> = { fists: 1, pistol: 9, smg: 7, shotgun: 3.5, rifle: 12, sniper: 18, rockets: 10 };
export const FIRE_RANGE: Record<WeaponKind, number> = { fists: 1.6, pistol: 17, smg: 14, shotgun: 9, rifle: 24, sniper: 30, rockets: 18 };
const TIER: Record<WeaponKind, number> = { fists: 0, pistol: 1, smg: 2, shotgun: 2, rifle: 3, sniper: 3, rockets: 2.5 };
/** Close-range guns (in your face to a few metres) against long-range ones: a good loadout has one of each. */
export const CLOSE: Record<WeaponKind, boolean> = { fists: true, pistol: true, smg: true, shotgun: true, rifle: false, sniper: false, rockets: false };
export const isAutomatic = (w: WeaponKind) => w === 'smg' || w === 'rifle';
/** Each grade of rarity is worth about a third of a step up in gun. */
const RARITY_WORTH = 0.35;

const usable = (g: Gun | null) => !!g && g.weapon !== 'fists' && g.mag + g.ammo > 0;
/** What a gun is worth on its own: its tier plus its grade (0 when it is empty or fists). */
export const gunScore = (g: Gun | null) => (g && usable(g) ? TIER[g.weapon] + RARITY_WORTH * g.rarity : 0);
const hand = (me: Player): Gun => ({ weapon: me.weapon, rarity: me.rarity, mag: me.mag, ammo: me.ammo });

/** My best gun's tier (0 = nothing that shoots), counting both slots. */
export const tierOf = (me: Player) => Math.max(usable(hand(me)) ? TIER[me.weapon] : 0, usable(me.holster) ? TIER[me.holster!.weapon] : 0);

/** A pair of guns: the better one counts in full, the other a good deal when it covers the other range, little when it does not. */
export const loadoutScore = (a: Gun | null, b: Gun | null) => {
  const [hi, lo] = gunScore(a) >= gunScore(b) ? [a, b] : [b, a];
  if (!lo || gunScore(lo) === 0) return gunScore(hi);
  return gunScore(hi) + gunScore(lo) * (CLOSE[hi!.weapon] !== CLOSE[lo.weapon] ? 0.4 : 0.1);
};

/** What a piece of loot is worth to me right now (0 = leave it). Never a downgrade. */
export const lootValue = (k: Pick<Loot, 'kind' | 'ammo'> & { tier?: number }, me: Player) => {
  const kind: LootKind = k.kind;
  const tier = k.tier ?? 0;
  if (kind in TIER) {
    const gun: Gun = { weapon: kind as WeaponKind, rarity: tier, mag: 1, ammo: Math.max(0, k.ammo - 1) };
    const now = loadoutScore(hand(me), me.holster);
    const mine = hand(me);
    // It goes into the empty slot, or (both full) replaces the worse of my two.
    const after = !usable(mine)
      ? loadoutScore(gun, me.holster)
      : !me.holster || !usable(me.holster)
        ? loadoutScore(mine, gun)
        : Math.max(loadoutScore(mine, gun), loadoutScore(gun, me.holster));
    const gain = after - now;
    return gain > 0.05 ? gain : 0;
  }
  if (kind === 'ammo') {
    const low = (g: Gun | null) => {
      if (!g || g.weapon === 'fists' || g.ammo >= spareCap(me, g)) return 0;
      const left = g.mag + g.ammo;
      const mag = magOf(g.weapon, g.rarity);
      return left < mag ? 1.5 : left < mag * 2 ? 0.4 : 0;
    };
    return Math.max(low(hand(me)), low(me.holster));
  }
  if (kind === 'armor') {
    const pts = vestPoints({ ...k, tier: k.tier } as Loot);
    return pts > me.armor + 10 ? (pts - me.armor) / 40 : 0;
  }
  if (kind === 'backpack') return tier > me.pack ? 0.45 * (tier - me.pack) : 0;
  const item = kind as HealKind | 'bomb';
  const have = carried(me, item);
  const cap = carryCap(me, item);
  if (have >= cap) return 0;
  // Supplies are worth a short detour, not a trip: the first of each counts, more of them barely.
  const hurt = me.hp < me.maxHp * 0.7;
  if (item === 'medkit') return (have === 0 ? 0.6 : 0.15) + (hurt ? 0.5 : 0);
  if (item === 'bandage') return (have === 0 ? 0.5 : 0.12) + (hurt && me.hp < HEALS.bandage.upTo ? 0.4 : 0);
  if (item === 'coffee') return have === 0 ? 0.3 : 0;
  return have === 0 ? 0.35 : 0;
};

/**
 * The loot most worth walking to (none near the enemy I can see, none I have given up on: `skip`); the search shrinks
 * after the first circle.
 */
export const bestLoot = (state: GameState, me: Player, p: Persona, enemy: Player | null, skip: (k: Loot) => boolean = () => false) => {
  const reach = (state.zone.phase === 0 || tierOf(me) === 0 ? 30 : 14) * p.loot;
  // After the first circle a bot wants a better reason to walk off.
  let best = state.zone.phase === 0 ? 0.15 : 0.25;
  let pick: Loot | null = null;
  for (const k of state.loot) {
    const d = Math.hypot(k.x - me.x, k.y - me.y);
    if (!k.active || d > reach || (enemy && Math.hypot(k.x - enemy.x, k.y - enemy.y) < 8) || skip(k)) continue;
    const v = lootValue(k, me);
    // Late on, only a real upgrade is worth the walk; after the first circle, supplies only close by.
    if (state.zone.phase >= 3 && v < 1) continue;
    if (state.zone.phase >= 1 && v < 0.6 && d > 8) continue;
    if (state.zone.phase >= 1 && v < 1 && d > 12) continue;
    const score = (v * p.loot) / (1 + d / 10);
    if (score > best) {
      best = score;
      pick = k;
    }
  }
  return pick;
};

/**
 * Angular aim error in degrees: loose on a new target, settling the longer I stay on it; worse at a runner, while I am
 * moving myself (0..1 of my top speed), while I am being hit, and out near the end of my gun's range (0..1 of it).
 */
export const aimError = (p: Persona, onTarget: number, targetSpeed: number, how: { moving?: number; underFire?: boolean; range?: number } = {}) =>
  (p.aim0 * Math.exp(-onTarget / p.decay) + p.aimMin) *
  (targetSpeed > 4 ? 1.3 : 1) *
  (1 + AIM_PENALTY.moving * Math.min(1, how.moving ?? 0)) *
  (how.underFire ? AIM_PENALTY.underFire : 1) *
  (1 + AIM_PENALTY.range * Math.max(0, ((how.range ?? 0) - 0.6) / 0.4));
/** How much worse the aim gets: at full own speed (+), when being hit (x), at the very end of the gun's range (+). */
export const AIM_PENALTY = { moving: 0.2, underFire: 1.2, range: 0.3 };

// ---------- perception

/**
 * How far a bot can make someone out at all (m), the distance inside which it notices anyone, whichever way it faces, and
 * how far out it spots someone in the open quickly (beyond that it takes a long look).
 */
export const VIEW = 38;
export const NEAR = 6;
export const QUICK = 30;

/**
 * Seconds of looking before a bot notices someone it has a clear line to: a fifth of a second or so out to `QUICK` (30 m)
 * in the open, then slow far out; sooner when the other one moves or shoots, later at the edge of its view, in the dark
 * (indoors), or half hidden in a bush. Never instant: even up close it takes more than one look (a think, 8 ticks) unless
 * the other one moves or shoots. A bot that has just been shot at is on edge and quicker. Pure, so tests can check each
 * factor.
 */
export const spotTime = (
  p: Persona,
  c: { d: number; edge: number; moving: boolean; firing: boolean; light: number; plant: boolean; alert: boolean },
) => {
  const k = Math.min(1, c.d / QUICK);
  const far = Math.max(0, Math.min(c.d, VIEW) - QUICK) / (VIEW - QUICK);
  let t = 0.18 + 0.22 * k * k + 1.4 * far;
  if (c.moving) t *= 0.6;
  if (c.firing) t *= 0.3;
  if (c.plant) t *= 2;
  if (c.alert) t *= 0.6;
  t *= 1 + 0.6 * Math.max(0, c.edge - 0.5) * 2;
  t /= Math.max(0.25, c.light);
  return t / p.eyes;
};

/** Gunfire heard this far away (m) tells a bot where to look; the farther it is, the vaguer the guess. */
export const EARSHOT = 45;
/** Where a heard shot seems to come from: the true bearing off by up to `bearing` degrees and the distance by up to `range`. */
export const HEARING = { bearing: 14, range: 0.3 };
export const guessFromSound = (mx: number, my: number, sx: number, sy: number, rand: () => number) => {
  const d = Math.hypot(sx - mx, sy - my);
  const a = Math.atan2(sy - my, sx - mx) + (rand() * 2 - 1) * HEARING.bearing * (0.5 + d / EARSHOT) * (Math.PI / 180);
  const r = d * (1 + (rand() * 2 - 1) * HEARING.range);
  return { x: mx + Math.cos(a) * r, y: my + Math.sin(a) * r };
};

const INDOORS = BUILDINGS.map((b) => ({ x0: b.x0 * TILE, y0: b.y0 * TILE, x1: (b.x0 + b.w) * TILE, y1: (b.y0 + b.h) * TILE }));
/**
 * How well lit a spot is for spotting someone there, 0..1: daylight outside, dimmer under a roof. The lighting work will
 * replace this with the real light level; the bots only read it here.
 */
export const lightAt = (x: number, y: number) => (INDOORS.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) ? 0.6 : 1);

/**
 * Pace by stage: how much readier to fight every bot is (added to the fight score), how far it walks towards gunfire
 * (x its own chase distance) and how much sooner it breaks off when hurt, by Deadline phase. Bots fight from the start
 * (a quiet first circle is boring) and press harder from the fourth phase. It changes how often fights start and how
 * often they end in a KO, never aim or reaction.
 */
export const STAGE_AGGRO = [-0.6, -0.35, 0, 0.2, 0.35, 0.35];
export const STAGE_CHASE = [0.7, 0.9, 1, 1, 1, 1];
/** Added to the personality's retreat threshold: early on a hurt bot breaks off a little sooner and heals instead of trading to the death. */
export const STAGE_BACK = [0.15, 0.1, 0.05, 0, 0, 0];
/** With this many or fewer alive, everyone hunts: full aggression and chase, and roaming heads for the middle of the circle. */
export const HUNT_ALIVE = 4;
/**
 * Seconds after landing before a bot picks a fight: with another bot (x its personality's share, `GRACE_BY_PERSONA`, so
 * the field does not all start at once and empty in a minute), and with a person, sooner: the player is who the match is
 * for, and a quiet first minute is what makes it boring. Long enough to grab the gun by the door. 50 s for bots (each bot's
 * own +-40 %, see `GJ` in bot.ts): at 90 s some bots could not start a fight until 2:15, which is dead air by construction.
 */
export const LANDING_GRACE = { bot: 50, human: 18 };
export const GRACE_BY_PERSONA: Record<PersonaName, number> = { rusher: 0.6, tactical: 0.8, camper: 1, looter: 1.1 };
/**
 * A crowd holds back: with more than `from` alive, every bot is less ready to fight another bot (never a person), walks
 * less far towards gunfire and breaks off sooner, by up to these amounts with a full match (PLAYERS alive), easing off as the field thins (never a
 * switch, which turns into a bloodbath the moment it flips). Twenty fighters on this map meet each other twice as often
 * as ten, so without it a quarter of them are gone a minute in.
 */
export const CROWD = { from: 5, aggro: -0.72, chase: 0.5, back: 0.1 };
export const stagePace = (phase: number, alive: number) => {
  const k = Math.min(phase, STAGE_AGGRO.length - 1);
  if (alive <= HUNT_ALIVE) return { aggro: 0.3, crowd: 0, chase: 1, back: 0, hunt: true };
  const c = Math.min(1, Math.max(0, (alive - CROWD.from) / Math.max(1, PLAYERS - CROWD.from)));
  return {
    aggro: STAGE_AGGRO[k] + CROWD.aggro * c,
    /** The crowd's share of `aggro`: it holds bots back from each other, not from a person. */
    crowd: CROWD.aggro * c,
    // A thinned-out field (eight or fewer) goes to every fight it hears within its range, whatever the stage.
    chase: alive <= 8 ? 1 : STAGE_CHASE[k] * (1 - (1 - CROWD.chase) * c),
    back: STAGE_BACK[k] + CROWD.back * c,
    hunt: false,
  };
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
  // Badly hurt, a bot does not go looking for a fight (it still answers one that finds it).
  const low = (me.hp + me.armor) / me.maxHp < LOW_HP && !why.hurtRecently;
  return (
    p.aggro +
    (low ? -2 : 0) +
    (why.landing ? -1 : 0) +
    why.stage +
    // Shot at up close: fight back hard; shot at from afar: shoot back, not necessarily charge.
    (why.hurtRecently ? (d < 14 ? 0.6 : 0.2) : 0) +
    (d < 10 ? 0.4 : d < 22 ? 0.1 : 0) +
    (enemy.bot ? 0 : HUNT_HUMAN) +
    (weak ? 0.3 : 0) +
    (busy ? 0.3 : 0) +
    (armed || d < 3 ? 0 : -2)
  );
};
export const ENGAGE_AT = 0.85;
/** How much readier a bot is to fight a person than another bot: never ignore the player. */
export const HUNT_HUMAN = 0.3;
/** Below this share of health plus armor a bot would rather patch up than start something. */
export const LOW_HP = 0.35;

// ---------- landing spots

const CENTRES = BUILDINGS.map((b) => {
  let loot = 0;
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) if (MAP[y]?.[x] === 'l') loot += 1;
  const x = (b.x0 + b.w / 2) * TILE;
  const y = (b.y0 + b.h / 2) * TILE;
  return { x, y, loot, place: placeAt(x, y)?.name ?? null };
});

/** The most bots that land in one place: the hot places hold the crowd (Old Town 5, the Yard and the Campus 4), the quiet ones few. */
const PLACE_CAPS: Record<string, number> = { 'Old Town': 5, 'Container Yard': 4, 'The Campus': 4, 'Mast Hill': 2 };
export const placeCap = (name: string | null) => (name === null ? 2 : PLACE_CAPS[name] ?? ((PLACE_TIER[name] ?? 1) >= 2 ? 3 : 2));
/** Places within reach of the route that get no bot at all, so a person who wants quiet can find it. */
export const QUIET_PLACES = 3;

const droneAt = (d: Drone, t: number) => ({ x: d.x0 + (d.x1 - d.x0) * t, y: d.y0 + (d.y1 - d.y0) * t });
const overCampus = (p: { x: number; y: number }) => p.x > 4 && p.y > 4 && p.x < WORLD - 4 && p.y < WORLD - 4;
/** Bots jump by this point of the route at the latest (the drone forces everyone out a little later). */
export const LAST_JUMP = DROP.forceJump - 0.03;
/** How far a bot can steer on the way down (free fall plus parachute, with some margin). */
const REACH = 90;

/** How far from the middle of the route the player's two or three neighbours land (m): far enough to loot in peace first. */
export const NEAR_BAND = { min: 33, max: 68 };

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
  // Keep QUIET_PLACES of the places the route reaches empty (never the two big drops): chosen the same way by every bot.
  const reachable = [...new Set(cands.map((c) => c.place).filter((n): n is string => n !== null))].filter((n) => n !== 'Old Town' && n !== 'Container Yard').sort();
  const quiet = new Set<string>();
  for (let i = 0; i < QUIET_PLACES && reachable.length > 0; i++) quiet.add(reachable.splice(Math.floor(rand() * reachable.length), 1)[0]);
  const open = cands.filter((c) => c.place === null || !quiet.has(c.place));
  const used = new Map<string, number>();
  const roomIn = (c: { place: string | null }) => c.place === null || (used.get(c.place) ?? 0) < placeCap(c.place);
  const bots = state.players.filter((p) => p.bot).map((p) => p.id);
  for (let i = bots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bots[i], bots[j]] = [bots[j], bots[i]];
  }
  const mid = droneAt(d, tOf(WORLD / 2, WORLD / 2));
  // Neighbours for the player: near the route's middle, but not on top of it.
  const fromMid = (c: { x: number; y: number }) => Math.hypot(c.x - mid.x, c.y - mid.y);
  const near = open.filter((c) => fromMid(c) > NEAR_BAND.min && fromMid(c) < NEAR_BAND.max).sort((a, b) => fromMid(a) - fromMid(b));
  const nNear = 2 + (hash & 1);
  const chosen: { x: number; y: number }[] = [];
  const plan = new Map<number, Landing>();
  bots.forEach((id, k) => {
    const persona = ROSTER[k % ROSTER.length];
    let pick = k < nNear ? near.find((c) => c.n === 0 && roomIn(c) && chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 20)) : undefined;
    if (!pick) {
      let best = -Infinity;
      for (const c of open) {
        if (c.n >= 2 || !roomIn(c)) continue;
        const gap = chosen.length ? Math.min(60, ...chosen.map((o) => Math.hypot(o.x - c.x, o.y - c.y))) : 30;
        const score = gap + BASE[persona].hot * c.loot * 3 + rand() * 20 - c.n * 80;
        if (score > best) {
          best = score;
          pick = c;
        }
      }
    }
    // Every allowed place is full (rare, on a short route): any building still under two bots.
    if (!pick) pick = open.find((c) => c.n < 2) ?? cands.find((c) => c.n < 2);
    if (!pick) {
      // Nothing reachable (cannot happen on this map): land under the route's middle.
      plan.set(id, { x: mid.x, y: mid.y, t: 0.5, persona });
      return;
    }
    pick.n += 1;
    if (pick.place !== null) used.set(pick.place, (used.get(pick.place) ?? 0) + 1);
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
    const hidden = !botSight(state, tx, ty, x, y) || (plants && inPlant(x, y) && Math.hypot(x - tx, y - ty) > 4);
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

/**
 * Where to stand to look round cover at a threat: a step or two to one side of `(x, y)`, across the line to the threat,
 * that is open to stand on and has a clear line to it. `side` is which way to lean there (+1 or -1, the sign the lean
 * input uses when facing the threat).
 */
export const peekFrom = (state: GameState, x: number, y: number, tx: number, ty: number) => {
  const d = Math.max(0.1, Math.hypot(tx - x, ty - y));
  const px = -(ty - y) / d;
  const py = (tx - x) / d;
  for (const s of [0.8, -0.8, 1.4, -1.4, 2.1, -2.1]) {
    const qx = x + px * s;
    const qy = y + py * s;
    if (circleBlocked(state, qx, qy, 0.45)) continue;
    if (!botSight(state, x, y, qx, qy)) continue;
    if (botSight(state, qx, qy, tx, ty)) return { x: qx, y: qy, side: Math.sign(s) };
  }
  return null;
};

/**
 * Cover to fight from: a spot a few metres off, inside the Deadline, that the threat cannot see (a house wall, a rock,
 * a tree trunk) but with a spot beside it to peek from. Prefers close ones and ones not at `avoid` (the last cover, so a
 * bot that moves on really moves).
 */
export const fightCover = (state: GameState, me: Player, tx: number, ty: number, avoid: { x: number; y: number } | null = null) => {
  const z = state.zone;
  let best: { x: number; y: number; peek: { x: number; y: number; side: number } } | null = null;
  let bestScore = -Infinity;
  const td = Math.hypot(tx - me.x, ty - me.y);
  for (let i = 0; i < 20; i++) {
    const r = i < 8 ? 2.5 : i < 16 ? 5 : 8;
    const a = i < 8 ? (i / 8) * Math.PI * 2 : i < 16 ? ((i - 8) / 8) * Math.PI * 2 + Math.PI / 8 : ((i - 16) / 4) * Math.PI * 2 + Math.PI / 4;
    const x = me.x + Math.cos(a) * r;
    const y = me.y + Math.sin(a) * r;
    if (circleBlocked(state, x, y, 0.6) || solidAt(state, x, y)) continue;
    if (Math.hypot(x - z.toX, y - z.toY) > Math.max(z.toR, 6) && Math.hypot(x - z.cx, y - z.cy) > z.r) continue;
    const dt = Math.hypot(x - tx, y - ty);
    // Not right next to them, and not running past them to get there.
    if (dt < 4 || dt < td - 4) continue;
    // Hidden with a body's width to spare on either side, not just its middle.
    const px = -(ty - y) / dt;
    const py = (tx - x) / dt;
    if ([0, 0.45, -0.45].some((k) => botSight(state, tx, ty, x + px * k, y + py * k))) continue;
    const peek = peekFrom(state, x, y, tx, ty);
    if (!peek) continue;
    const score = -r - (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 2 ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y, peek };
    }
  }
  return best;
};
