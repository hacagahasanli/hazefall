import { aimError, bestLoot, campSpot, coverPoint, ENGAGE_AT, engageScore, fallbackPersona, FIRE_RANGE, isAutomatic, landingPlan, makePersona, mulberry32, PREFERRED, tierOf } from './bot-params';
import { DT, WEAPONS } from './constants';
import { canSee, lineOfSight, lootUnder } from './step';
import { NO_INPUT } from './types';

import type { Persona } from './bot-params';
import type { GameState, Input, Loot, Player } from './types';

export type BotMode = 'drop' | 'loot' | 'roam' | 'engage' | 'retreat';

export interface BotInfo {
  persona: Persona | null;
  mode: BotMode;
  target: number;
  /** When the current target was first seen (match seconds). */
  seenAt: number;
}

const VIEW = 26;
const NEAR = 6;
const deg = Math.PI / 180;
/** Reaction time and aim error against a person, relative to against a bot. */
export const VS_HUMAN = 1.45;

/**
 * A battle-royale bot with a personality (rusher, camper, looter or tactical). It jumps over its
 * own landing spot, loots, roams its own way through the next circle, only sees what is in front
 * of it (unless shot at or hearing shots), takes a moment to react and settles its aim over time,
 * picks its fights, falls back to cover to heal, and runs from the Deadline. Thinks every 8 ticks;
 * aims and fires every tick. Uses only its own seeded random numbers, so a host replay matches.
 */
export const createBot = (id: number, seed: number) => {
  const rand = mulberry32(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  let p: Persona | null = null;
  let spot = { x: 0, y: 0, t: 0.5 };
  let mode: BotMode = 'drop';
  let plan: Input = { ...NO_INPUT };
  let tick = 0;
  // What I know.
  let target: Player | null = null;
  let targetId = -1;
  let td = Infinity;
  let seenAt = 0;
  let lastSeen = -99;
  let lastTX = 0;
  let lastTY = 0;
  let hitAt = -99;
  let hitBy = -1;
  let heard: { x: number; y: number; t: number } | null = null;
  let chased = -99;
  // Where I'm going.
  let wpX = -1;
  let wpY = -1;
  let wpKey = '';
  let holdUntil = 0;
  let cover: { x: number; y: number } | null = null;
  let retreatAt = -99;
  let landedAt = -99;
  let noRetreatUntil = 0;
  let loot: Loot | null = null;
  // How I fight.
  let strafe = 1;
  let strafeUntil = 0;
  let burstOn = true;
  let burstUntil = 0;
  let wobble = 0;
  let lead = 0.75;
  let engaged = false;
  // Stuck on a wall? Walk round it for a bit.
  let lastX = 0;
  let lastY = 0;
  let detour = 0;
  let detourAngle = 0;

  const init = (state: GameState) => {
    const mine = landingPlan(state).get(id);
    p = makePersona(mine?.persona ?? fallbackPersona(id), rand);
    if (mine) spot = { x: mine.x, y: mine.y, t: mine.t };
  };

  /** Hits and shots from the last tick: being shot or hearing a gun wakes me up. */
  const listen = (state: GameState, me: Player, now: number) => {
    for (const e of state.events) {
      if (e.type === 'hit' && e.target === id && e.by !== null && e.by !== id) {
        hitAt = now;
        hitBy = e.by;
      } else if (e.type === 'shot' && e.owner !== id && Math.hypot(e.x - me.x, e.y - me.y) < 45) {
        heard = { x: e.x, y: e.y, t: now };
      }
    }
  };

  const perceive = (state: GameState, me: Player, now: number) => {
    const alert = now - hitAt < 1.5 || (heard !== null && now - heard.t < 1.5);
    let best: Player | null = null;
    let bestD = Infinity;
    for (const o of state.players) {
      if (o.id === id || !canSee(state, me, o)) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d > (o.id === hitBy && now - hitAt < 3 ? VIEW + 8 : VIEW)) continue;
      if (d > NEAR && !alert && !(o.id === targetId && now - lastSeen < 1.5)) {
        let off = Math.atan2(o.y - me.y, o.x - me.x) - me.heading;
        off = Math.atan2(Math.sin(off), Math.cos(off));
        if (Math.abs(off) > (p!.fov / 2) * deg) continue;
      }
      // Stick with whoever I'm fighting, and answer whoever is shooting me.
      const rank = d - (o.id === targetId ? 6 : 0) - (o.id === hitBy && now - hitAt < 3 ? 8 : 0);
      if (rank < bestD && lineOfSight(state, me.x, me.y, o.x, o.y)) {
        best = o;
        bestD = rank;
      }
    }
    target = best;
    if (!best) {
      td = Infinity;
      return;
    }
    td = Math.hypot(best.x - me.x, best.y - me.y);
    if (best.id !== targetId || now - lastSeen > 2) {
      // Someone new: a moment to react, and the aim starts loose again.
      targetId = best.id;
      seenAt = now;
      lead = between(0.5, 1);
    }
    lastSeen = now;
    lastTX = best.x;
    lastTY = best.y;
  };

  /** A waypoint of my own inside the next circle; campers pick a wall or bush and sit there. */
  const roamTo = (state: GameState, me: Player, now: number) => {
    const z = state.zone;
    const key = `${z.phase}${z.state}`;
    const reached = Math.hypot(wpX - me.x, wpY - me.y) < 3;
    if (p!.aggro > 0.5 && now - lastSeen < 3 && targetId >= 0 && state.players[targetId].alive) {
      // Lost sight of who I was fighting: push to where they were.
      wpX = lastTX;
      wpY = lastTY;
      wpKey = '';
      return;
    }
    if (p!.chase > 0 && heard && now - heard.t < 2 && heard.t > chased && Math.hypot(heard.x - me.x, heard.y - me.y) < p!.chase) {
      // Gunfire: rushers and tactical players go and see.
      chased = heard.t;
      wpX = heard.x;
      wpY = heard.y;
      wpKey = key;
      return;
    }
    if (key === wpKey && !(reached && now > holdUntil) && Math.hypot(wpX - z.toX, wpY - z.toY) < z.toR + 4) return;
    wpKey = key;
    // My own side of the circle, so bots don't all meet on one ring.
    const a = Math.atan2(me.y - z.toY, me.x - z.toX) + between(-1, 1);
    const r = Math.max(2, z.toR) * between(0.3, 0.8);
    wpX = z.toX + Math.cos(a) * r;
    wpY = z.toY + Math.sin(a) * r;
    if (p!.name === 'camper') {
      const c = campSpot(state, wpX, wpY);
      wpX = c.x;
      wpY = c.y;
      holdUntil = now + between(8, 15);
    } else holdUntil = 0;
  };

  const think = (state: GameState, me: Player, now: number): Input => {
    const z = state.zone;
    const out: Input = { ...NO_INPUT };
    perceive(state, me, now);
    const ratio = (me.hp + me.armor) / me.maxHp;
    const endgame = z.phase >= 3 || state.players.filter((o) => o.alive).length <= 3;
    const hurtRecently = now - hitAt < 2;
    const armed = tierOf(me) > 0;

    // Fight, fall back, or leave them be?
    engaged = false;
    if (mode === 'retreat' && (ratio > 0.8 || now - retreatAt > 10)) {
      mode = 'roam';
      noRetreatUntil = now + 5;
    }
    if (target) {
      const tRatio = (target.hp + target.armor) / target.maxHp;
      const finish = p!.name === 'rusher' && tRatio < 0.3;
      if (mode !== 'retreat' && ratio < p!.back && now > noRetreatUntil && !finish) {
        mode = 'retreat';
        retreatAt = now;
        cover = null;
      }
      if (mode !== 'retreat') {
        // Fresh off the parachute everyone grabs a gun first, unless someone starts it. A person gets a few seconds more
        // than a bot before anyone picks a fight with them: the first minute is where new players decide to stay.
        const landing = now - landedAt < (target.bot ? 20 : 28) && !hurtRecently;
        const score = engageScore(p!, me, target, td, { endgame, hurtRecently, landing });
        const ambush = p!.name === 'camper' && armed && !landing && td < FIRE_RANGE[me.weapon] * 0.7;
        engaged = score >= ENGAGE_AT || ambush;
        mode = engaged ? 'engage' : 'roam';
      }
    } else if (mode !== 'retreat') mode = 'roam';
    if (mode === 'roam') {
      loot = bestLoot(state, me, p!, target);
      if (loot) mode = 'loot';
    }

    // Where do I want to be?
    const zoneD = Math.hypot(me.x - z.toX, me.y - z.toY);
    const mustRun = zoneD > z.toR * 0.85 && (z.state === 'shrink' || z.timer < 12 || Math.hypot(me.x - z.cx, me.y - z.cy) > z.r);
    let wantX = me.x;
    let wantY = me.y;
    if (mustRun) {
      wantX = z.toX;
      wantY = z.toY;
    } else if (mode === 'retreat') {
      if (!cover || (target && lineOfSight(state, target.x, target.y, cover.x, cover.y))) cover = coverPoint(state, me, lastTX, lastTY, p!.name === 'camper');
      if (cover) {
        wantX = cover.x;
        wantY = cover.y;
      } else {
        const d = Math.max(0.1, Math.hypot(me.x - lastTX, me.y - lastTY));
        wantX = me.x + ((me.x - lastTX) / d) * 5;
        wantY = me.y + ((me.y - lastTY) / d) * 5;
      }
    } else if (mode === 'engage' && target) {
      if (now > strafeUntil) {
        strafe = rand() < 0.5 ? 1 : -1;
        strafeUntil = now + between(0.6, 1.4);
      }
      const pref = PREFERRED[me.weapon] * (p!.name === 'rusher' ? 0.75 : 1);
      const push = p!.name === 'tactical' && target.reload > 0;
      const away = push ? 1 : td < pref * 0.7 ? -1 : td > pref * 1.2 && p!.name !== 'camper' ? 1 : 0;
      const side = p!.name === 'camper' ? 0.5 : 2;
      const ax = (target.x - me.x) / td;
      const ay = (target.y - me.y) / td;
      wantX = me.x + ax * away * 4 - ay * strafe * side;
      wantY = me.y + ay * away * 4 + ax * strafe * side;
    } else if (mode === 'loot' && loot) {
      wantX = loot.x;
      wantY = loot.y;
      const under = lootUnder(state, me);
      out.use = under !== null && under.id === loot.id;
    } else {
      roamTo(state, me, now);
      wantX = wpX;
      wantY = wpY;
    }

    const moved = Math.hypot(me.x - lastX, me.y - lastY);
    lastX = me.x;
    lastY = me.y;
    if (moved < 0.15 && Math.hypot(wantX - me.x, wantY - me.y) > 1.5 && detour <= 0) {
      detour = 25 + Math.floor(rand() * 30);
      detourAngle = Math.atan2(wantY - me.y, wantX - me.x) + (rand() < 0.5 ? 1 : -1) * (Math.PI / 2 + rand() * 0.6);
    }
    let dx = wantX - me.x;
    let dy = wantY - me.y;
    if (detour > 0) {
      dx = Math.cos(detourAngle);
      dy = Math.sin(detourAngle);
    }
    const len = Math.hypot(dx, dy);
    if (len > 0.4) {
      out.mx = dx / len;
      out.my = dy / len;
    }

    // Look where I'm going, or towards the shots I heard; one-shot buttons.
    const look = heard && now - heard.t < 1.5 && !target ? heard : { x: me.x + out.mx * 5, y: me.y + out.my * 5 };
    out.aimX = look.x;
    out.aimY = look.y;
    wobble = rand() * 2 - 1;
    if (target && engaged) {
      out.super = me.superCharge >= 1 && td < 9;
      out.use = me.item === 'bomb' && td < 11 && td > 4;
    } else if (me.item === 'medkit' && me.healLeft <= 0 && (mode === 'retreat' ? !target : me.hp < me.maxHp * 0.6)) out.use = true;
    else if (!target && armed && me.reload <= 0 && me.ammo > 0 && me.mag < WEAPONS[me.weapon].mag * 0.4) out.reload = true;
    return out;
  };

  /** Every tick: track the target with an error that shrinks the longer I stay on it, and fire in bursts. */
  const aimAndFire = (me: Player, now: number, out: Input) => {
    out.fire = false;
    if (!target || !target.alive) return out;
    const shootBack = mode === 'retreat' && now - hitAt < 1 && td < 10;
    if (!engaged && !shootBack) return out;
    const w = WEAPONS[me.weapon];
    const t = Math.min(1, td / w.speed) * lead;
    const lx = target.x + target.vx * t;
    const ly = target.y + target.vy * t;
    // A little kinder to people than to other bots (as PUBG and Fortnite bots are): slower and looser.
    const human = target.bot ? 1 : VS_HUMAN;
    const err = aimError(p!, now - seenAt, Math.hypot(target.vx, target.vy)) * human * deg;
    const a = Math.atan2(ly - me.y, lx - me.x) + err * wobble;
    const d = Math.hypot(lx - me.x, ly - me.y);
    out.aimX = me.x + Math.cos(a) * d;
    out.aimY = me.y + Math.sin(a) * d;
    if (isAutomatic(me.weapon) && now > burstUntil) {
      burstOn = !burstOn;
      burstUntil = now + (burstOn ? w.rate * between(3, 6) : between(0.25, 0.5));
    }
    const ready = now - seenAt >= p!.react * human;
    out.fire = ready && td <= FIRE_RANGE[me.weapon] && (burstOn || !isAutomatic(me.weapon)) && !(me.weapon === 'rockets' && td < 4);
    return out;
  };

  const bot = (state: GameState): Input => {
    const me = state.players[id];
    tick += 1;
    if (!p) init(state);
    if (!me.alive) return NO_INPUT;
    const now = state.tick * DT;
    listen(state, me, now);
    if (me.stage === 'drone') return { ...NO_INPUT, jump: state.drone.t >= spot.t };
    if (me.stage === 'falling') {
      // Steer straight for my landing spot.
      const dx = spot.x - me.x;
      const dy = spot.y - me.y;
      const len = Math.hypot(dx, dy);
      return len < 0.6 ? NO_INPUT : { ...NO_INPUT, mx: dx / len, my: dy / len };
    }
    if (mode === 'drop') {
      mode = 'roam';
      landedAt = now;
    }
    if (detour > 0) detour -= 1;
    const thinking = (tick + id) % 8 === 0;
    if (thinking) plan = think(state, me, now);
    else if (target && !target.alive) target = null;
    // One-shot buttons: press on one tick only.
    const out = { ...plan };
    if (!thinking) {
      out.use = false;
      out.super = false;
      out.reload = false;
    }
    if (target) {
      td = Math.hypot(target.x - me.x, target.y - me.y);
      aimAndFire(me, now, out);
    }
    return out;
  };

  const info = (): BotInfo => ({ persona: p, mode, target: target?.id ?? -1, seenAt });
  return Object.assign(bot, { info });
};
