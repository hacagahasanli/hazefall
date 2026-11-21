import { aimError, bestLoot, campSpot, CLOSE, coverPoint, ENGAGE_AT, engageScore, fallbackPersona, FIRE_RANGE, gunScore, isAutomatic, landingPlan, makePersona, mulberry32, PREFERRED, LANDING_GRACE, stagePace, tierOf } from './bot-params';
import { DROP, DT, HEALS, magOf, SUPERS, WEAPONS, WORLD } from './constants';
import { canSee, healChoice, lineOfSight, lootUnder } from './step';
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
  /** What I am walking to pick up (loot mode). */
  loot: Loot | null;
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
  let swappedAt = -99;

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
  const roamTo = (state: GameState, me: Player, now: number, pace: ReturnType<typeof stagePace>) => {
    const z = state.zone;
    const key = `${z.phase}${z.state}`;
    const reached = Math.hypot(wpX - me.x, wpY - me.y) < 3;
    if (p!.aggro + pace.aggro > 0.5 && now - lastSeen < 3 && targetId >= 0 && state.players[targetId].alive) {
      // Lost sight of who I was fighting: push to where they were.
      wpX = lastTX;
      wpY = lastTY;
      wpKey = '';
      return;
    }
    if (p!.chase > 0 && heard && now - heard.t < 2 && heard.t > chased && Math.hypot(heard.x - me.x, heard.y - me.y) < p!.chase * pace.chase) {
      // Gunfire: rushers and tactical players go and see.
      chased = heard.t;
      wpX = heard.x;
      wpY = heard.y;
      wpKey = key;
      return;
    }
    if (key === wpKey && !(reached && now > holdUntil) && Math.hypot(wpX - z.toX, wpY - z.toY) < z.toR + 4) return;
    wpKey = key;
    if (z.phase === 0 && z.state === 'wait' && Math.hypot(me.x - z.toX, me.y - z.toY) < z.toR * 0.8) {
      // Already inside the first circle while it waits: wander my own patch of it rather than head for the middle.
      const a = between(0, Math.PI * 2);
      const r = between(12, 28);
      let x = me.x + Math.cos(a) * r;
      let y = me.y + Math.sin(a) * r;
      const d = Math.hypot(x - z.toX, y - z.toY);
      if (d > z.toR * 0.8) {
        x = z.toX + ((x - z.toX) / d) * z.toR * 0.8;
        y = z.toY + ((y - z.toY) / d) * z.toR * 0.8;
      }
      wpX = Math.min(WORLD - 10, Math.max(10, x));
      wpY = Math.min(WORLD - 10, Math.max(10, y));
    } else {
      // My own side of the circle, so bots don't all meet on one ring.
      const a = Math.atan2(me.y - z.toY, me.x - z.toX) + between(-1, 1);
      // The last few head for the middle, where the final circle will be, so the end is a fight and not a search.
      const r = Math.max(2, z.toR) * (pace.hunt ? between(0, 0.3) : between(0.3, 0.8));
      wpX = z.toX + Math.cos(a) * r;
      wpY = z.toY + Math.sin(a) * r;
    }
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
    const pace = stagePace(z.phase, state.players.filter((o) => o.alive).length);
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
      if (mode !== 'retreat' && ratio < p!.back + pace.back && now > noRetreatUntil && !finish) {
        mode = 'retreat';
        retreatAt = now;
        cover = null;
      }
      if (mode !== 'retreat') {
        // Fresh off the parachute everyone grabs a gun first, unless someone starts it. A person gets a few seconds more
        // than a bot before anyone picks a fight with them: the first minute is where new players decide to stay.
        const landing = now - landedAt < (target.bot ? LANDING_GRACE.bot : LANDING_GRACE.human) && !hurtRecently;
        const score = engageScore(p!, me, target, td, { stage: pace.aggro, hurtRecently, landing });
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
      const there = under !== null && under.id === loot.id;
      // Both slots full: a new gun replaces the one in my hands, so hold the worse one before picking it up.
      const gunSwap = there && loot.kind in WEAPONS && me.holster !== null && me.weapon !== 'fists' && me.mag + me.ammo > 0 &&
        gunScore({ weapon: me.weapon, rarity: me.rarity, mag: me.mag, ammo: me.ammo }) > gunScore(me.holster);
      if (gunSwap && me.swapping <= 0) out.cycle = true;
      else out.use = there;
    } else {
      roamTo(state, me, now, pace);
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
      // The slow-field canister is thrown (up to its range, at the aim point, which is on the target): use it on anyone
      // in throwing range; the other supers work up close.
      out.super = me.superCharge >= 1 && (me.fighter === 'standup' ? td < SUPERS.timebox.range - 2 && td > 2.5 : td < 9);
      out.use = me.bombs > 0 && td < 11 && td > 4;
    } else if (!me.using && !target && !out.use && wantsHeal(me, mode)) out.heal = true;
    else if (!me.using && !target && me.coffees > 0 && me.buzz <= 0 && (me.hp < me.maxHp * 0.85 || mustRun)) out.coffee = true;
    else if (!target && armed && !me.using && me.reload <= 0 && me.ammo > 0 && me.mag < magOf(me.weapon, me.rarity) * 0.4) out.reload = true;
    pickGun(me, now, out);
    return out;
  };

  /** Patch up when nobody is in sight: a bandage for small hurts, a med kit for big ones (the sim picks which). */
  const wantsHeal = (me: Player, m: BotMode) => {
    const kind = healChoice(me);
    if (!kind || kind === 'coffee') return false;
    if (kind === 'medkit') return me.hp < me.maxHp * (m === 'retreat' ? 0.75 : 0.6);
    return me.hp < HEALS.bandage.upTo - 5 || m === 'retreat';
  };

  /**
   * The gun for the distance: the close-range one (shotgun, SMG, pistol) up close, the long-range one (rifle, sniper) far
   * out; with nobody about, the better of the two. Out of rounds in the magazine in a fight, draw the other gun rather than
   * reload, if it is loaded.
   */
  const pickGun = (me: Player, now: number, out: Input) => {
    const other = me.holster;
    // Not while picking something up: the swap would happen first and the pickup would replace the wrong gun.
    if (!other || me.swapping > 0 || me.using || now - swappedAt < 1.2 || out.cycle || out.use) return;
    const mine = { weapon: me.weapon, rarity: me.rarity, mag: me.mag, ammo: me.ammo };
    const otherOk = other.weapon !== 'fists' && other.mag + other.ammo > 0;
    if (!otherOk) return;
    const mineOk = me.weapon !== 'fists' && me.mag + me.ammo > 0;
    let want = false;
    if (!mineOk) want = true;
    else if (target && engaged) {
      if (me.mag <= 0 && other.mag > 0 && td < 15) want = true;
      else if (CLOSE[me.weapon] !== CLOSE[other.weapon]) {
        const closeIsOther = CLOSE[other.weapon];
        if (closeIsOther && td < 8) want = true;
        else if (!closeIsOther && td > 13 && td <= FIRE_RANGE[other.weapon]) want = true;
      }
    } else if (!target && gunScore(other) > gunScore(mine) + 0.2) want = true;
    if (want) {
      out.cycle = true;
      swappedAt = now;
    }
  };

  /** Every tick: track the target with an error that shrinks the longer I stay on it, and fire in bursts. */
  const aimAndFire = (me: Player, now: number, out: Input) => {
    out.fire = false;
    if (!target || !target.alive) return out;
    const shootBack = mode === 'retreat' && now - hitAt < 1 && td < 10;
    if ((!engaged && !shootBack) || me.swapping > 0) return out;
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
      // Steer for my landing spot. The body has momentum, so ask for a velocity that shrinks as the spot comes
      // closer (gain = response / 2: damped to ~0.7, a few per cent of overshoot at most) instead of flying at it flat out and overshooting.
      const open = me.canopy >= DROP.stretch;
      const speed = open ? DROP.chuteSpeed : DROP.freefallSpeed;
      const gain = (open ? DROP.chuteResponse : DROP.freefallResponse) / 2;
      let mx = ((spot.x - me.x) * gain) / speed;
      let my = ((spot.y - me.y) * gain) / speed;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      return len < 0.01 ? NO_INPUT : { ...NO_INPUT, mx, my };
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
      out.cycle = false;
      out.heal = false;
      out.coffee = false;
    }
    if (target) {
      td = Math.hypot(target.x - me.x, target.y - me.y);
      aimAndFire(me, now, out);
    }
    return out;
  };

  const info = (): BotInfo => ({ persona: p, mode, target: target?.id ?? -1, seenAt, loot: mode === 'loot' ? loot : null });
  return Object.assign(bot, { info });
};
