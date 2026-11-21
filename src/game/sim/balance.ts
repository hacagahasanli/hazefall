/**
 * Weapon balance maths: a pure model of one gun against one standing target, built from the same constants and rules the
 * sim uses (fixed 60 Hz ticks, the cooldown countdown, magazine and reload, spread, pellet fans, linear falloff, the
 * player's hit radius, bullet flight time, rarity, armour as extra hit points). No randomness: a single bullet's random
 * jitter becomes a hit chance and damage becomes expected damage per trigger pull.
 *
 * It answers "how long does this gun take to finish someone at this distance" so docs/BALANCE.md and balance.test.ts can
 * hold every gun to its role. Assumes perfect aim at the centre of a target that stands still and the gun starting with a
 * full magazine; real fights are slower, but the order between guns is what matters.
 */
import { ARMOR, DT, PLAYER_RADIUS, RARITY, WEAPONS } from './constants';

import type { WeaponStats } from './constants';
import type { WeaponKind } from './types';

/** How close a bullet has to pass to the target's centre to hit (step.ts: PLAYER_RADIUS + 0.15). */
export const HIT_RADIUS = PLAYER_RADIUS + 0.15;
/** Bullets start this far in front of the shooter (step.ts fireBullet). */
const MUZZLE = 0.6;
/** A rocket goes off this far from the target's centre on a direct hit (it triggers within PLAYER_RADIUS + 0.25). */
const ROCKET_CONTACT = PLAYER_RADIUS + 0.25;

/** Ticks between two trigger pulls: the sim sets cooldown = rate and fires once a per-tick countdown reaches 0. */
export const shotTicks = (rate: number) => {
  let cooldown = rate;
  let ticks = 0;
  do {
    cooldown = Math.max(0, cooldown - DT);
    ticks += 1;
  } while (cooldown > 0);
  return ticks;
};

/** Seconds between shots as the sim really fires them (rounded up to whole ticks). */
export const shotInterval = (w: WeaponStats) => shotTicks(w.rate) * DT;

/** Damage after the bullet flew `distance` metres (same formula as step.ts falloffDamage). */
export const falloff = (w: WeaponStats, damage: number, distance: number) => {
  const f = w.falloff;
  if (distance <= f.start) return damage;
  const k = Math.min(1, (distance - f.start) / Math.max(0.01, f.end - f.start));
  return damage * (1 - (1 - f.min) * k);
};

/** Metres a bullet has flown when it hits someone `d` metres away (it starts at the muzzle, hits at the body's edge). */
const flown = (d: number) => Math.max(0, d - MUZZLE - HIT_RADIUS);

/** Chance one bullet with random jitter in [-spread/2, spread/2] passes within the hit radius of a target `d` m away. */
export const hitChance = (w: WeaponStats, d: number) => {
  if (d - MUZZLE > w.range) return 0;
  if (d <= HIT_RADIUS) return 1;
  const window = 2 * Math.asin(Math.min(1, HIT_RADIUS / d));
  return w.spread <= 0 ? 1 : Math.min(1, window / w.spread);
};

/** Pellets of a fan (evenly spread over the cone) that pass within the hit radius of a target `d` m away. */
export const pelletsHit = (w: WeaponStats, d: number) => {
  if (w.bullets <= 1) return hitChance(w, d);
  if (d - MUZZLE > w.range) return 0;
  let n = 0;
  for (let i = 0; i < w.bullets; i++) {
    const a = -w.spread / 2 + (w.spread * i) / (w.bullets - 1);
    if (Math.cos(a) > 0 && Math.abs(d * Math.sin(a)) < HIT_RADIUS) n += 1;
  }
  return n;
};

/** Expected damage of one trigger pull at `d` m (all pellets, hit chance, falloff, rarity). */
export const shotDamage = (w: WeaponStats, d: number, rarity = 0, kind?: WeaponKind) => {
  const dmg = w.damage * (kind === 'fists' ? 1 : (RARITY.damage[rarity] ?? 1));
  if (w.lob) {
    if (d - MUZZLE > w.range) return 0;
    // A direct hit: the blast goes off at the body's edge, damage drops 70 % over the blast radius.
    return dmg * (1 - 0.7 * Math.min(1, ROCKET_CONTACT / w.lob.radius));
  }
  if (kind === 'fists' || w.range < 3) return d <= w.range + HIT_RADIUS ? dmg : 0;
  return pelletsHit(w, d) * falloff(w, dmg, flown(d));
}

export interface Ttk {
  /** Trigger pulls needed (Infinity if the gun can't do it with the rounds it's found with). */
  shots: number;
  /** Seconds from the first shot to the killing hit landing, reloads and bullet flight included. */
  seconds: number;
}

/**
 * Time to kill `hp` (health + armour; armour soaks everything 1:1 until it's gone) at `d` m. Counts the expected number of
 * trigger pulls, the whole-tick gaps between them, a reload each time the magazine runs dry, and the last bullet's flight.
 */
export const timeToKill = (w: WeaponStats, d: number, hp: number, rarity = 0, kind?: WeaponKind): Ttk => {
  const per = shotDamage(w, d, rarity, kind);
  if (per <= 0) return { shots: Infinity, seconds: Infinity };
  const shots = Math.ceil(hp / per - 1e-9);
  const mag = Number.isFinite(w.mag) ? Math.max(1, Math.round(w.mag * (RARITY.mag[rarity] ?? 1))) : Infinity;
  const carried = Number.isFinite(w.ammo) ? Math.round(w.ammo * (RARITY.mag[rarity] ?? 1)) : Infinity;
  if (shots > carried) return { shots: Infinity, seconds: Infinity };
  const gap = shotInterval(w);
  const reload = Math.ceil((w.reload * (RARITY.reload[rarity] ?? 1)) / DT - 1e-9) * DT;
  const reloads = Number.isFinite(mag) ? Math.floor((shots - 1) / mag) : 0;
  // Within a magazine shots come every `gap`; across a reload the next shot waits for the reload (or the gap if longer).
  const seconds = (shots - 1 - reloads) * gap + reloads * Math.max(gap, reload) + d / w.speed;
  return { shots, seconds };
};

/** Health alone, and health plus a full Vest III. */
export const BARE = 100;
export const GEARED = 100 + ARMOR.points;

/** Damage per second of sustained fire with every round on target and no falloff (magazine and reload counted). */
export const sustainedDps = (w: WeaponStats, kind?: WeaponKind) => {
  const pull = w.damage * w.bullets;
  if (!Number.isFinite(w.mag)) return pull / shotInterval(w);
  const gap = shotInterval(w);
  const cycle = (w.mag - 1) * gap + Math.max(gap, w.reload);
  return kind === 'fists' ? pull / gap : (pull * w.mag) / cycle;
};

/** Burst damage per second (within one magazine). */
export const burstDps = (w: WeaponStats) => (w.damage * w.bullets) / shotInterval(w);

/** The guns that fight (fists and rockets aside), in the order the docs list them. */
export const GUNS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'] as const;
export const ALL: WeaponKind[] = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rockets'];

/** TTK with the live constants. */
export const ttk = (kind: WeaponKind, d: number, hp: number, rarity = 0) => timeToKill(WEAPONS[kind], d, hp, rarity, kind);

/** The fastest gun (of `among`) to finish `hp` at `d` m, with its TTK. */
export const fastestAt = (d: number, hp: number, among: readonly WeaponKind[] = GUNS) =>
  among.map((k) => ({ kind: k, ...ttk(k, d, hp) })).sort((a, b) => a.seconds - b.seconds)[0];
