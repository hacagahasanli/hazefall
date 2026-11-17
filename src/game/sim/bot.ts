import { WEAPONS } from './constants';
import { canSee, lineOfSight } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input, Player, WeaponKind } from './types';

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** How far each weapon likes to fight from. */
const PREFERRED: Record<WeaponKind, number> = {
  fists: 1, pistol: 9, smg: 7, shotgun: 3.5, rifle: 12, sniper: 18, rockets: 10,
};

/**
 * A battle-royale bot: jumps somewhere along the drone's path, loots, keeps the range its gun
 * likes, runs from the Deadline, heals and throws bombs. Re-thinks every few ticks; aims with
 * a per-bot error so it can be beaten.
 */
export const createBot = (id: number, seed: number) => {
  const rand = mulberry32(seed);
  const jumpAt = 0.15 + rand() * 0.6;
  const aimError = 0.6 + rand() * 0.8; // metres
  let plan: Input = { ...NO_INPUT };
  let goalX = 0;
  let goalY = 0;
  let lastX = 0;
  let lastY = 0;
  let detour = 0;
  let detourAngle = 0;
  let tick = 0;

  const think = (state: GameState, me: Player): Input => {
    const z = state.zone;
    const out: Input = { ...NO_INPUT };

    // Who can I see?
    let target: Player | null = null;
    let td = Infinity;
    for (const o of state.players) {
      if (o.id === me.id || !canSee(state, me, o)) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < 22 && d < td && lineOfSight(state, me.x, me.y, o.x, o.y)) {
        target = o;
        td = d;
      }
    }

    // Where do I want to be?
    const zoneD = Math.hypot(me.x - z.toX, me.y - z.toY);
    const mustRun = zoneD > z.toR * 0.85 && (z.state === 'shrink' || z.timer < 12 || Math.hypot(me.x - z.cx, me.y - z.cy) > z.r);
    let wantX = me.x;
    let wantY = me.y;
    if (mustRun) {
      wantX = z.toX;
      wantY = z.toY;
    } else if (target && me.weapon !== 'fists') {
      const pref = PREFERRED[me.weapon];
      const away = td < pref * 0.7 ? -1 : td > pref * 1.2 ? 1 : 0;
      const side = Math.sin(tick * 0.05 + id) > 0 ? 1 : -1;
      const ax = (target.x - me.x) / td;
      const ay = (target.y - me.y) / td;
      wantX = me.x + ax * away * 4 - ay * side * 2;
      wantY = me.y + ay * away * 4 + ax * side * 2;
    } else {
      // Loot: a gun if I have none, then armor and items.
      let best = Infinity;
      for (const k of state.loot) {
        if (!k.active) continue;
        const useful =
          ((me.weapon === 'fists' || me.mag + me.ammo === 0) && k.kind in WEAPONS) ||
          (k.kind === 'ammo' && me.weapon !== 'fists' && me.ammo < WEAPONS[me.weapon].mag) ||
          (k.kind === 'armor' && me.armor < 250) ||
          ((k.kind === 'medkit' || k.kind === 'bomb') && me.item === null) ||
          (k.kind === 'sniper' || k.kind === 'rockets' || k.kind === 'rifle');
        if (!useful) continue;
        const d = Math.hypot(k.x - me.x, k.y - me.y);
        if (d < best && d < 30) {
          best = d;
          wantX = k.x;
          wantY = k.y;
        }
      }
      if (best === Infinity) {
        if (target) {
          wantX = target.x;
          wantY = target.y;
        } else {
          wantX = z.toX + Math.cos(id) * z.toR * 0.4;
          wantY = z.toY + Math.sin(id) * z.toR * 0.4;
        }
      }
    }
    goalX = wantX;
    goalY = wantY;

    // Stuck on a wall? Walk around it for a bit.
    const moved = Math.hypot(me.x - lastX, me.y - lastY);
    lastX = me.x;
    lastY = me.y;
    if (moved < 0.15 && Math.hypot(goalX - me.x, goalY - me.y) > 1.5 && detour <= 0) {
      detour = 25 + Math.floor(rand() * 30);
      detourAngle = Math.atan2(goalY - me.y, goalX - me.x) + (rand() < 0.5 ? 1 : -1) * (Math.PI / 2 + rand() * 0.6);
    }
    let dx = goalX - me.x;
    let dy = goalY - me.y;
    if (detour > 0) {
      dx = Math.cos(detourAngle);
      dy = Math.sin(detourAngle);
    }
    const len = Math.hypot(dx, dy);
    if (len > 0.4) {
      out.mx = dx / len;
      out.my = dy / len;
    }

    // Aim and shoot.
    if (target) {
      out.aimX = target.x + (rand() - 0.5) * 2 * aimError;
      out.aimY = target.y + (rand() - 0.5) * 2 * aimError;
      const range = WEAPONS[me.weapon].range;
      out.fire = td < range * 0.95;
      out.super = me.superCharge >= 1 && td < 9;
      out.use = me.item === 'bomb' && td < 11;
    } else {
      out.aimX = me.x + out.mx * 5;
      out.aimY = me.y + out.my * 5;
      out.use = me.item === 'medkit' && me.hp < me.maxHp * 0.55;
    }
    return out;
  };

  return (state: GameState): Input => {
    const me = state.players[id];
    tick += 1;
    if (!me.alive) return NO_INPUT;
    if (me.stage === 'drone') return { ...NO_INPUT, jump: state.drone.t >= jumpAt };
    if (me.stage === 'falling') {
      // Glide towards the middle of the campus, a little.
      return { ...NO_INPUT, mx: Math.sign(48 - me.x) * 0.5, my: Math.sign(48 - me.y) * 0.5 };
    }
    if (detour > 0) detour -= 1;
    if (tick % 8 === 0) plan = think(state, me);
    // One-shot buttons: press on one tick only.
    const now = { ...plan };
    if (tick % 8 !== 0) {
      now.use = false;
      now.super = false;
    }
    return now;
  };
};
