import {
  aimError, bestLoot, botSight, campSpot, CLOSE, coverPoint, EARSHOT, ENGAGE_AT, engageScore, fallbackPersona, fightCover, FIRE_RANGE, guessFromSound,
  gunScore, isAutomatic, landingPlan, lightAt, LOW_HP, lootValue, GRACE_BY_PERSONA, makePersona, mulberry32, NEAR, PREFERRED, LANDING_GRACE, reactionDelay, spotTime, stagePace, tierOf, VIEW,
} from './bot-params';
import { DROP, DT, FIGHTERS, HEALS, magOf, NEWBIE, SUPERS, WEAPONS, WORLD } from './constants';
import { buildingAt, doorstep, ROOF_LAYER } from './roofs';
import { canSee, chestHeight, healChoice, hitPoint, inPlant, lootUnder, targetable } from './step';
import { NO_INPUT } from './types';

import type { Persona } from './bot-params';
import type { GameState, Input, Loot, Player } from './types';

/**
 * What a bot is doing. The five ways of playing: attack (`engage`), defend (`cover`: fight from cover and peek),
 * explore (`roam`, `loot`), under pressure (`pressure`: shot at by someone it cannot see) and heal (`retreat` to break
 * off, then `heal` out of sight).
 */
export type BotMode = 'drop' | 'loot' | 'roam' | 'engage' | 'cover' | 'pressure' | 'retreat' | 'heal';

/** A human slip a bot makes now and then, at most one per fight. */
export type Slip = 'hesitate' | 'open' | 'reload' | 'spray' | 'tunnel';
const SLIPS: Slip[] = ['hesitate', 'open', 'reload', 'spray', 'tunnel'];

export interface BotInfo {
  persona: Persona | null;
  mode: BotMode;
  target: number;
  /** When the current target was first seen (match seconds). */
  seenAt: number;
  /** Seconds from spotting the current target to the first shot it is allowed (drawn per target). */
  react: number;
  /** What I am walking to pick up (loot mode). */
  loot: Loot | null;
  /** Where I think the last gunfire I heard came from (a guess, not the shooter's position). */
  heard: { x: number; y: number; t: number } | null;
  /** Fighting from cover: hiding behind it or peeking out. */
  peek: 'hide' | 'peek' | null;
  /** The cover I fight from, and the spot beside it I peek from. */
  post: { x: number; y: number; peek: { x: number; y: number; side: number } } | null;
  slip: Slip | null;
}

const deg = Math.PI / 180;
const THINK_DT = 8 * DT;

/**
 * Can this bot see (and so shoot at) that player? The one question every bot decision about seeing or shooting someone
 * goes through: they must be up to be seen, not hidden in a bush, and in a clear line from the bot's eyes (leaning out
 * moves the eyes and the exposed shoulder), chest to chest in 3D through walls, roofs and floors (`botSight`).
 */
export const botCanSee = (state: GameState, viewer: Player, target: Player) => {
  if (!targetable(target) || !canSee(state, viewer, target)) return false;
  const eye = hitPoint(viewer);
  const body = hitPoint(target);
  const h0 = chestHeight(viewer);
  const h1 = chestHeight(target);
  return botSight(state, eye.x, eye.y, body.x, body.y, h0, h1) || (Math.abs(target.lean) > 0.05 && botSight(state, eye.x, eye.y, target.x, target.y, h0, h1));
};
/** Reaction time and aim error against a person, relative to against a bot: a little kinder, never a free pass. */
export const VS_HUMAN = 1.3;

/** A new player (round 1-3) in the air or in their first seconds on the ground: no bot picks them as a target. */
export const sparedRookie = (state: GameState, o: Player) =>
  !!state.rookie && !o.bot && (o.stage !== 'ground' || state.tick - (o.landedTick ?? 0) < NEWBIE.spareSeconds / DT);
/** After breaking off to heal, a bot goes back to where it last saw its enemy for this long (s). */
export const COMEBACK = 15;
/**
 * How far below the fight threshold a bot still takes shots at someone `POKE_FROM` m or more off, without pushing in.
 * 0.33 -> 0.55: more of the long-range chip damage that fills the quiet stretches (dead air 14 % -> 4.5 % over 50 matches;
 * 0.40 to 0.50 did not move it under 10 %), at the cost of rounds about 25 s shorter.
 */
export const POKE = 0.55;
export const POKE_FROM = 14;
/** Running footsteps are heard this far (m), as a direction only. */
export const FOOTSTEPS = 10;
/** Anyone seen within this distance (m) gets a fight (unless just landed or badly hurt): the crowd holds back the hunt, never a face-off. */
export const FACE_OFF = 1;


/**
 * A battle-royale bot with a personality (rusher, camper, looter or tactical). It jumps over its own landing spot, loots,
 * roams its own way through the next circle, and fights like a person: it only notices what it can really see (in front
 * of it, in the light, sooner when you move or shoot, never through walls) or roughly where it hears gunfire, takes a
 * varying moment to react, settles its aim over time and shoots in bursts. It attacks, or fights from cover and peeks,
 * gets out of the open when shot by someone it cannot see, breaks off when hurt and heals out of sight with what it
 * carries, and runs from the Deadline. Now and then it slips up. Thinks every 8 ticks; aims and fires every tick. Uses
 * only its own seeded random numbers, so a host replay matches.
 */
/** How far a bot wanders its own patch while the first circle waits (x 12-28 m): the map is bigger now, and they should meet. */
const WANDER = 3.5;
/** How widely the landing grace spreads round its personality's share (+- this much), so the field does not all start at once. */
const GJ = 0.4;
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
  /** Gunfire I heard: where I guess it came from, and how far off it sounded (by how loud it was). */
  let heard: { x: number; y: number; t: number; from: number; far: number; steps?: boolean } | null = null;
  let chased = -99;
  /** How close I am to noticing each player (1 = noticed). */
  const aware = new Map<number, number>();
  /** Something half-noticed out of the corner of my eye: I turn to look at it. */
  let glance: { x: number; y: number } | null = null;
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
  // Fighting from cover.
  let post: ReturnType<typeof fightCover> = null;
  let peek: 'hide' | 'peek' = 'hide';
  let peekUntil = 0;
  let peeks = 0;
  let peekMax = 3;
  let ducked = -99;
  // How I fight.
  let strafe = 1;
  let strafeUntil = 0;
  let planted = false;
  let burstOn = true;
  let burstUntil = 0;
  let wobble = 0;
  let lead = 0.75;
  let engaged = false;
  let reactFor = 0;
  let aimSince = 0;
  let wantsCover = false;
  let slip: Slip | null = null;
  let slipReloaded = false;
  let dodgeSeen = -99;
  let healTo = 0.8;
  /** Seconds after landing before I pick a fight with another bot (my own: rushers soon, looters after a proper look round). */
  let botGrace: number = LANDING_GRACE.bot;
  /** Healed up after breaking off: back to where I last saw them, until this time. */
  let comebackUntil = -99;
  /** Who I last actually fought (not just saw). */
  let foughtId = -1;
  /** Shooting from where I stand without pushing in. */
  let poking = false;
  /** Loot I gave up on, until when; when I started for the current one. */
  const skipLoot = new Map<number, number>();
  let lootSince = 0;
  // Stuck on a wall? Walk round it for a bit.
  let lastX = 0;
  let lastY = 0;
  let detour = 0;
  let detourAngle = 0;
  let wasPushing = false;
  let swappedAt = -99;

  const init = (state: GameState) => {
    const mine = landingPlan(state).get(id);
    p = makePersona(mine?.persona ?? fallbackPersona(id), rand);
    if (mine) spot = { x: mine.x, y: mine.y, t: mine.t };
    // The unsure heal up fuller before they go back out.
    healTo = 0.5 + 0.15 * (1 - p.confidence);
    botGrace = LANDING_GRACE.bot * GRACE_BY_PERSONA[p.name] * between(1 - GJ, 1 + GJ);
    // Aim for the doorstep, not the roof: land beside the house and walk straight in.
    const b = buildingAt(spot.x, spot.y);
    if (b >= 0) spot = { ...doorstep(b, spot.x, spot.y), t: spot.t };
  };

  /** Hits and shots from the last tick: being shot wakes me up; gunfire tells me roughly which way to look. */
  const listen = (state: GameState, me: Player, now: number) => {
    for (const e of state.events) {
      if (e.type === 'hit' && e.target === id && e.by !== null && e.by !== id) {
        hitAt = now;
        hitBy = e.by;
      } else if (e.type === 'shot' && e.owner !== id && Math.hypot(e.x - me.x, e.y - me.y) < EARSHOT) {
        // A new guess for a new shooter or every half second, not one per bullet.
        if (heard && heard.from === e.owner && now - heard.t < 0.5) continue;
        const g = guessFromSound(me.x, me.y, e.x, e.y, rand);
        heard = { x: g.x, y: g.y, t: now, from: e.owner, far: Math.hypot(e.x - me.x, e.y - me.y) };
      }
    }
  };

  /** Footsteps: someone running close by, through a wall or not, gives a rough direction (when no gunfire was heard lately). */
  const listenSteps = (state: GameState, me: Player, now: number) => {
    if (heard && now - heard.t < 1) return;
    for (const o of state.players) {
      if (o.id === id || !o.alive || o.stage !== 'ground' || Math.hypot(o.vx, o.vy) < 2.5) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d > FOOTSTEPS) continue;
      const g = guessFromSound(me.x, me.y, o.x, o.y, rand);
      heard = { x: g.x, y: g.y, t: now, from: o.id, far: d, steps: true };
      return;
    }
  };

  /** A new fight: how long before I shoot, whether I want cover for it, and whether I slip up in it. */
  const meet = (state: GameState, me: Player, o: Player, now: number) => {
    targetId = o.id;
    seenAt = now;
    aimSince = now;
    lead = between(0.5, 1);
    slip = rand() < p!.mistake ? SLIPS[Math.floor(rand() * SLIPS.length)] : null;
    slipReloaded = false;
    reactFor = reactionDelay(p!, rand, o.bot ? 1 : VS_HUMAN, slip === 'hesitate');
    const pace = stagePace(state.zone.phase, state.players.filter((q) => q.alive).length);
    const ratio = (me.hp + me.armor) / me.maxHp;
    const bias = 1 - p!.confidence + (CLOSE[me.weapon] ? -0.2 : 0.15) + (me.weapon === 'shotgun' ? -0.3 : 0) - pace.aggro * 0.5 + (ratio < 0.6 ? 0.25 : 0) + between(-0.2, 0.2);
    // Only the unsure, the badly hurt and those with a long gun fight from cover; most push and shoot.
    wantsCover = bias > 0.85 && slip !== 'open';
    post = null;
    peek = 'hide';
    peeks = 0;
    peekMax = 1 + Math.floor(rand() * 2);
  };

  const perceive = (state: GameState, me: Player, now: number) => {
    const shot = now - hitAt < 1.5;
    const listening = heard !== null && now - heard.t < 1.5;
    const fighting = targetId >= 0 && now - lastSeen < 3;
    let best: Player | null = null;
    let bestD = Infinity;
    let glanceA = 0.1;
    glance = null;
    for (const o of state.players) {
      if (o.id === id) continue;
      if (!o.alive || sparedRookie(state, o)) {
        aware.delete(o.id);
        continue;
      }
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      let a = aware.get(o.id) ?? 0;
      const tracking = o.id === targetId && now - lastSeen < 1.5;
      let seen = false;
      if (d <= (o.id === hitBy && now - hitAt < 3 ? VIEW + 8 : VIEW)) {
        let edge = 0;
        let inView = true;
        if (d > NEAR && !shot && !tracking) {
          let off = Math.atan2(o.y - me.y, o.x - me.x) - me.heading;
          off = Math.atan2(Math.sin(off), Math.cos(off));
          // Gunfire turns my head; tunnel vision in a fight narrows what I notice off to the side.
          const half = (p!.fov / 2 + (listening ? 30 : 0)) * (slip === 'tunnel' && fighting && o.id !== targetId ? 0.55 : 1) * deg;
          if (Math.abs(off) > half) inView = false;
          else edge = Math.abs(off) / half;
        }
        if (inView && botCanSee(state, me, o)) {
          seen = true;
          if (a < 1) {
            const t = spotTime(p!, {
              d, edge, moving: Math.hypot(o.vx, o.vy) > 1.5, firing: o.revealed > 0, light: lightAt(o.x, o.y),
              plant: o.stage === 'ground' && inPlant(o.x, o.y), alert: shot || listening,
            });
            a = Math.min(1, a + THINK_DT / t);
          }
        }
      }
      // Out of sight, what I noticed fades over a few seconds.
      if (!seen) a = Math.max(0, a - THINK_DT * 0.35);
      aware.set(o.id, a);
      if (seen && a < 1 && a > glanceA) {
        glanceA = a;
        glance = { x: o.x, y: o.y };
      }
      // Someone I was just fighting I pick up again at once; anyone else I have to notice first.
      const known = a >= 1 || (o.id === targetId && now - lastSeen < 3 && a > 0);
      if (!seen || !known) continue;
      // Stick with whoever I'm fighting, answer whoever is shooting me, and go for a person before a bot.
      const rank = d - (o.id === targetId ? 6 : 0) - (o.id === hitBy && now - hitAt < 3 ? 8 : 0) - (o.bot ? 0 : 5);
      if (rank < bestD) {
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
    if (best.id !== targetId || now - lastSeen > 2) meet(state, me, best, now);
    lastSeen = now;
    lastTX = best.x;
    lastTY = best.y;
  };
  /** A waypoint of my own inside the next circle; campers pick a wall or bush and sit there. */
  const roamTo = (state: GameState, me: Player, now: number, pace: ReturnType<typeof stagePace>) => {
    const z = state.zone;
    const key = `${z.phase}${z.state}`;
    const reached = Math.hypot(wpX - me.x, wpY - me.y) < 3;
    const lost = now - lastSeen < (now < comebackUntil ? COMEBACK : 8) && Math.hypot(lastTX - me.x, lastTY - me.y) > 2.5;
    if (p!.aggro + pace.aggro > 0.5 && lost && foughtId === targetId && targetId >= 0 && state.players[targetId].alive) {
      // Lost sight of who I was fighting (or just patched up after breaking off): push to where they were.
      wpX = lastTX;
      wpY = lastTY;
      wpKey = '';
      return;
    }
    if (heard && chaseable(state, now, pace)) {
      // Gunfire: go and see, like a hunter.
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
      const r = between(12 * WANDER, 28 * WANDER);
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
      const r = Math.max(2, z.toR) * (pace.hunt ? between(0, 0.15) : between(0.3, 0.8));
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

  /** Gunfire I heard just now, near enough for me to go after (a person's shots from farther off). */
  const chaseable = (state: GameState, now: number, pace: ReturnType<typeof stagePace>) =>
    heard !== null && now - heard.t < 2 && heard.t > chased &&
    // The last few go to any gunfire they hear: the end is a fight, not a search.
    // Footsteps turn my head; only the last few walk after them.
    (pace.hunt || (!heard.steps && heard.far < p!.chase * pace.chase * (state.players[heard.from]?.bot === false ? 1.4 : 1)));

  /** A heal worth starting now: a med kit or bandage that would actually help (coffee is not a heal). */
  const canHeal = (me: Player) => {
    const kind = healChoice(me);
    return (kind === 'medkit' || kind === 'bandage') && me.hp < me.maxHp * 0.97;
  };

  const think = (state: GameState, me: Player, now: number): Input => {
    const z = state.zone;
    const out: Input = { ...NO_INPUT };
    perceive(state, me, now);
    const ratio = (me.hp + me.armor) / me.maxHp;
    const pace = stagePace(z.phase, state.players.filter((o) => o.alive).length);
    const hurtRecently = now - hitAt < 2;
    const underFire = now - hitAt < 1.2;
    const armed = tierOf(me) > 0;

    // Fight, fall back, patch up, or leave them be?
    engaged = false;
    poking = false;
    if (mode === 'retreat' && (ratio > 0.65 || now - retreatAt > 6)) {
      mode = 'roam';
      noRetreatUntil = now + 6;
      comebackUntil = now + COMEBACK;
    }
    if (mode === 'heal' && !me.using && (!canHeal(me) || me.hp >= me.maxHp * healTo)) {
      // Patched up: straight back into it.
      mode = 'roam';
      noRetreatUntil = now + 6;
      comebackUntil = now + COMEBACK;
    }
    // Broken off and out of their sight for a moment: now heal, with what I carry and at its own pace.
    if (mode === 'retreat' && !target && canHeal(me) && now - hitAt > 0.6 && now - lastSeen > 0.6) mode = 'heal';
    if (target) {
      const tRatio = (target.hp + target.armor) / target.maxHp;
      const finish = p!.name === 'rusher' && tRatio < 0.3;
      if (mode !== 'retreat' && mode !== 'heal' && ratio < p!.back + pace.back && now > noRetreatUntil && !finish) {
        mode = 'retreat';
        retreatAt = now;
        cover = null;
      }
      // Found while healing: unless the heal is nearly done, get moving again.
      if (mode === 'heal' && (underFire || td < 8) && !(me.using && me.useLeft < 0.7)) {
        mode = 'retreat';
        retreatAt = now;
        cover = null;
      }
      if (mode !== 'retreat' && mode !== 'heal') {
        // Fresh off the parachute everyone grabs a gun first, unless someone starts it. A person gets a few seconds more
        // than a bot before anyone picks a fight with them: the first minute is where new players decide to stay.
        const landing = now - landedAt < (target.bot ? botGrace : state.rookie ? NEWBIE.human : LANDING_GRACE.human) && !hurtRecently;
        const score = engageScore(p!, me, target, td, { stage: target.bot ? pace.aggro : pace.aggro - pace.crowd, hurtRecently, landing });
        // Shots from range are not held back by the crowd: trading from afar is how a busy field fights without emptying.
        const far = td >= POKE_FROM ? engageScore(p!, me, target, td, { stage: pace.aggro - pace.crowd, hurtRecently, landing }) : -Infinity;
        const ambush = p!.name === 'camper' && armed && !landing && td < FIRE_RANGE[me.weapon] * 0.7;
        // Not worth a push, but not right on top of me either: get within my gun's range and take shots from there (a
        // poke), which starts a trade without a rush.
        // Face to face nobody walks on by: anyone armed and not badly hurt fights whoever it meets this close.
        const faceOff = armed && !landing && td < FACE_OFF && (me.hp + me.armor) / me.maxHp >= LOW_HP;
        poking = !(score >= ENGAGE_AT || ambush || faceOff) && armed && far >= ENGAGE_AT - POKE;
        engaged = score >= ENGAGE_AT || ambush || faceOff || poking;
        if (engaged) foughtId = target.id;
        if (!engaged) mode = 'roam';
        else {
          // Fight from cover when that suits me and there is some (and they are not already on top of me).
          if (wantsCover && td > 6 && (!post || botSight(state, target.x, target.y, post.x, post.y, chestHeight(target)))) post = fightCover(state, me, target.x, target.y, post);
          mode = wantsCover && td > 6 && post ? 'cover' : 'engage';
        }
      }
    } else if (mode === 'cover' && now - lastSeen < 6) {
      // Holding my cover: they ducked out of sight, they will be back.
    } else if (mode !== 'retreat' && mode !== 'heal') {
      // Shot by someone I cannot see: get out of the open.
      mode = underFire || (mode === 'pressure' && now - hitAt < 2.5) ? 'pressure' : 'roam';
      if (mode !== 'pressure') post = null;
    }
    if (mode === 'roam') {
      // Armed and hearing a fight I would go to, or going back for someone: that comes before shopping.
      const hunting = armed && (chaseable(state, now, pace) || (now < comebackUntil && now - lastSeen < COMEBACK));
      const was = loot;
      // The last few only pick up what is at their feet: the end is a fight, not a shopping trip.
      const skip = (k: Loot) => (skipLoot.get(k.id) ?? -1) > now || (pace.hunt && armed && Math.hypot(k.x - me.x, k.y - me.y) > 8);
      loot = hunting ? null : bestLoot(state, me, p!, target, skip);
      // Something else lying on top of it is under my feet: take that if I want it, else this one is not for me.
      const under = loot && Math.hypot(loot.x - me.x, loot.y - me.y) < 1.2 ? lootUnder(state, me) : null;
      if (loot && under && under.id !== loot.id) {
        if (lootValue(under, me) > 0) loot = under;
        else {
          skipLoot.set(loot.id, now + 20);
          loot = null;
        }
      }
      if (loot && loot.id !== was?.id) lootSince = now;
      // Could not get to it in all this time (a wall, a stack): leave it for a while.
      if (loot && now - lootSince > 8) {
        skipLoot.set(loot.id, now + 20);
        loot = null;
      }
      if (loot) mode = 'loot';
    }

    // Where do I want to be?
    const zoneD = Math.hypot(me.x - z.toX, me.y - z.toY);
    const mustRun = zoneD > z.toR * 0.85 && (z.state === 'shrink' || z.timer < 12 || Math.hypot(me.x - z.cx, me.y - z.cy) > z.r);
    const threat = target ? { x: target.x, y: target.y } : { x: lastTX, y: lastTY };
    let wantX = me.x;
    let wantY = me.y;
    let lookAt: { x: number; y: number } | null = null;
    if (mustRun) {
      wantX = z.toX;
      wantY = z.toY;
    } else if (mode === 'retreat' || mode === 'heal') {
      if (!cover || (target && botSight(state, target.x, target.y, cover.x, cover.y, chestHeight(target)))) cover = coverPoint(state, me, lastTX, lastTY, p!.name === 'camper');
      if (cover) {
        wantX = cover.x;
        wantY = cover.y;
      } else if (mode === 'retreat') {
        const d = Math.max(0.1, Math.hypot(me.x - lastTX, me.y - lastTY));
        wantX = me.x + ((me.x - lastTX) / d) * 5;
        wantY = me.y + ((me.y - lastTY) / d) * 5;
      }
      if (mode === 'heal') {
        // Heal facing the way they were: whoever comes round that corner gets seen first.
        lookAt = threat;
        if (!me.using && canHeal(me)) out.heal = true;
      }
    } else if (mode === 'cover' && post) {
      lookAt = threat;
      const atPost = Math.hypot(me.x - post.x, me.y - post.y) < 0.45;
      if (peek === 'peek') {
        wantX = post.peek.x;
        wantY = post.peek.y;
        out.lean = post.peek.side;
        // The look starts once I am out there.
        if (Math.hypot(me.x - post.peek.x, me.y - post.peek.y) > 0.4) peekUntil = Math.max(peekUntil, now + 0.5);
        // Done looking, or hit while out there: back behind it (the bold stay out to trade).
        const flinch = hitAt > ducked && underFire && rand() > 0.3 + p!.confidence * 0.6;
        if (now > peekUntil || flinch) {
          ducked = now;
          peek = 'hide';
          peekUntil = now + between(0.3, 0.8);
          peeks += 1;
        }
      } else {
        wantX = post.x;
        wantY = post.y;
        if (atPost) {
          if (armed && me.reload <= 0 && me.ammo > 0 && me.mag < magOf(me.weapon, me.rarity) * 0.7) out.reload = true;
          if (now > peekUntil && me.reload <= 0) {
            peek = 'peek';
            peekUntil = now + between(1.4, 2.6);
          }
        } else peekUntil = Math.max(peekUntil, now + 0.3);
      }
      // Moved on after a few looks, or they have gone quiet: find another angle, or go and find them.
      if (peeks >= peekMax || now - lastSeen > 4) {
        // Mostly they leave the cover and push; only the unsure look for another angle.
        const fresh = now - lastSeen < 4 && p!.confidence < 0.45 ? fightCover(state, me, threat.x, threat.y, post) : null;
        post = fresh;
        peeks = 0;
        peekMax = 1 + Math.floor(rand() * 2);
        peek = 'hide';
        if (!fresh) {
          mode = 'roam';
          wantsCover = false;
        }
      }
    } else if (mode === 'engage' && target) {
      if (now > strafeUntil) {
        // Sidestep this way or that, and now and then plant my feet for a steadier shot (not while being hit).
        planted = !planted && rand() < 0.35 && !underFire;
        strafe = rand() < 0.5 ? 1 : -1;
        strafeUntil = now + (planted ? between(0.3, 0.6) : p!.strafeT * between(0.7, 1.4));
      }
      // Close to my gun's best range and keep shooting while I sidestep; a reloading enemy gets rushed.
      const pref = PREFERRED[me.weapon] * (p!.name === 'rusher' ? 0.75 : 1);
      const push = target.reload > 0 && p!.name !== 'camper';
      const outOfRange = td > FIRE_RANGE[me.weapon] * 0.9;
      // A poke closes to my gun's range, then holds there.
      const away = poking ? (outOfRange ? 1 : td < pref * 0.6 ? -1 : 0) : push || outOfRange ? 1 : td < pref * 0.6 ? -1 : td > pref * 1.1 && p!.name !== 'camper' ? 1 : 0;
      const side = planted ? 0 : p!.strafeW;
      const ax = (target.x - me.x) / td;
      const ay = (target.y - me.y) / td;
      wantX = me.x + ax * away * 4 - ay * strafe * side;
      wantY = me.y + ay * away * 4 + ax * strafe * side;
      // A slip: reloading in the open in the middle of it.
      if (slip === 'reload' && !slipReloaded && me.reload <= 0 && me.ammo > 0 && me.mag < magOf(me.weapon, me.rarity) * 0.6) {
        out.reload = true;
        slipReloaded = true;
      }
    } else if (mode === 'pressure') {
      // Off the line of fire: behind something between me and where the shots came from, or zigzag away.
      const from = heard && now - heard.t < 3 ? heard : { x: me.x + Math.cos(me.heading) * 10, y: me.y + Math.sin(me.heading) * 10 };
      lookAt = from;
      if (!cover || botSight(state, from.x, from.y, cover.x, cover.y)) cover = coverPoint(state, me, from.x, from.y, p!.name === 'camper');
      if (cover) {
        wantX = cover.x;
        wantY = cover.y;
      } else {
        if (now > strafeUntil) {
          strafe = -strafe;
          strafeUntil = now + between(0.4, 0.8);
        }
        const d = Math.max(0.1, Math.hypot(me.x - from.x, me.y - from.y));
        const ax = (me.x - from.x) / d;
        const ay = (me.y - from.y) / d;
        wantX = me.x + ax * 3 - ay * strafe * 3;
        wantY = me.y + ay * 3 + ax * strafe * 3;
      }
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

    // Never stand still while being hit: sidestep across the line of fire.
    if (now - hitAt < 0.8 && Math.hypot(wantX - me.x, wantY - me.y) < 0.6) {
      const from = target ?? heard ?? { x: me.x + Math.cos(me.heading), y: me.y + Math.sin(me.heading) };
      const d = Math.max(0.1, Math.hypot(from.x - me.x, from.y - me.y));
      wantX = me.x - ((from.y - me.y) / d) * strafe * 2;
      wantY = me.y + ((from.x - me.x) / d) * strafe * 2;
      // Standing behind cover and still getting hit: that cover is no good.
      if (mode === 'cover' && peek === 'hide') post = null;
    }
    // Some throw themselves out of the way when a bullet lands.
    if (hitAt > dodgeSeen) {
      dodgeSeen = hitAt;
      if (rand() < p!.dodge && me.rollCooldown <= 0 && !me.using && mode !== 'cover') out.roll = true;
    }
    // Up on a roof with nobody to fight from it: walk off the edge the way I want to go (if what I
    // want is in the house under me: the edge by its door), rather than stand over it.
    if (me.z >= ROOF_LAYER && !(engaged && target)) {
      const b = buildingAt(me.x, me.y);
      if (b >= 0 && buildingAt(wantX, wantY) === b) {
        const out = doorstep(b, me.x, me.y);
        wantX = out.x;
        wantY = out.y;
      }
    }

    const moved = Math.hypot(me.x - lastX, me.y - lastY);
    lastX = me.x;
    lastY = me.y;
    // Stuck only if I was trying to walk last time too (not standing behind cover on purpose).
    const pushing = Math.hypot(wantX - me.x, wantY - me.y) > 1.5;
    const stuck = moved < 0.15 && pushing && wasPushing;
    wasPushing = pushing;
    if (stuck && detour <= 0) {
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
    if (len > (mode === 'cover' ? 0.15 : 0.4)) {
      // Ease into a spot instead of running past it (peeking is a step, not a sprint).
      const k = len < 0.8 && (mode === 'cover' || mode === 'heal') ? Math.max(0.5, len / 0.8) : 1;
      out.mx = (dx / len) * k;
      out.my = (dy / len) * k;
    }

    // Look where I'm going, at the threat, or towards the shots I heard; one-shot buttons.
    const look = lookAt ?? (glance && !target && !mustRun ? glance : null) ?? (heard && now - heard.t < 1.5 && !target ? heard : { x: me.x + out.mx * 5, y: me.y + out.my * 5 });
    out.aimX = look.x;
    out.aimY = look.y;
    wobble = rand() * 2 - 1;
    if (target && engaged) {
      // The slow-field canister is thrown (up to its range, at the aim point, which is on the target): use it on anyone
      // in throwing range; the other supers work up close.
      out.super = me.superCharge >= 1 && (me.fighter === 'standup' ? td < SUPERS.timebox.range - 2 && td > 2.5 && botCanSee(state, me, target) : td < 9);
      out.use = me.bombs > 0 && td < 11 && td > 4;
    } else if (mode !== 'heal' && !me.using && !target && !out.use && wantsHeal(me, mode)) out.heal = true;
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

  /**
   * Every tick: track the target with an error that shrinks the longer I stay on it (worse while I move, while I am hit
   * and far out), and fire in bursts once I have reacted. Only at someone I can see this tick.
   */
  const aimAndFire = (state: GameState, me: Player, now: number, out: Input) => {
    out.fire = false;
    if (!target || !target.alive) return out;
    // Falling back is not running blind: it keeps shooting at whoever is on it while it makes for cover.
    const shootBack = (mode === 'retreat' || (mode === 'heal' && !me.using)) && (now - hitAt < 3 || td < 12);
    if ((!engaged && !shootBack) || me.swapping > 0) return out;
    if (!botCanSee(state, me, target)) {
      // Gone behind something: keep the gun on where they were.
      out.aimX = lastTX;
      out.aimY = lastTY;
      return out;
    }
    lastSeen = now;
    lastTX = target.x;
    lastTY = target.y;
    const w = WEAPONS[me.weapon];
    const t = Math.min(1, td / w.speed) * lead;
    const lx = target.x + target.vx * t;
    const ly = target.y + target.vy * t;
    // A little kinder to people than to other bots (as PUBG and Fortnite bots are): slower and looser.
    const human = target.bot ? 1 : VS_HUMAN * (state.rookie ? NEWBIE.aimError : 1);
    const moving = Math.hypot(me.vx, me.vy) / FIGHTERS[me.fighter].speed;
    const how = { moving, underFire: now - hitAt < 0.6, range: td / FIRE_RANGE[me.weapon] };
    const err = aimError(p!, now - aimSince, Math.hypot(target.vx, target.vy), how) * human * (slip === 'spray' ? 1.6 : 1) * deg;
    const a = Math.atan2(ly - me.y, lx - me.x) + err * wobble;
    const d = Math.hypot(lx - me.x, ly - me.y);
    out.aimX = me.x + Math.cos(a) * d;
    out.aimY = me.y + Math.sin(a) * d;
    // Bursts, not a hose: a few rounds (a couple of shots with a semi-automatic), a breath to re-aim, again.
    const auto = isAutomatic(me.weapon);
    if (now > burstUntil) {
      burstOn = !burstOn;
      burstUntil = now + (burstOn ? w.rate * (auto ? between(3, 6) : between(2, 4)) * (slip === 'spray' ? 1.8 : 1) : auto ? between(0.25, 0.5) : between(0.1, 0.22));
    }
    const ready = now - seenAt >= reactFor;
    out.fire = ready && td <= FIRE_RANGE[me.weapon] && burstOn && !(me.weapon === 'rockets' && td < 4);
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
      // Under the open canopy, dive (as a player would) when the spot is farther than a plain glide still reaches.
      const open = me.canopy >= DROP.stretch;
      const dx = spot.x - me.x;
      const dy = spot.y - me.y;
      const dist = Math.hypot(dx, dy);
      const reach = (Math.max(0, me.alt) / DROP.chuteTerminal) * DROP.chuteSpeed * 0.85;
      const dive = me.canopy >= DROP.deployTime && dist > reach;
      const speed = !open ? DROP.freefallSpeed : dive ? DROP.chuteDiveSpeed : DROP.chuteSpeed;
      const gain = (open ? DROP.chuteResponse : DROP.freefallResponse) / 2;
      let mx = (dx * gain) / speed;
      let my = (dy * gain) / speed;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      // The canopy never hovers: right over the spot, keep a light touch towards it so it circles there.
      if (open && len < 0.01 && dist > 0.05) return { ...NO_INPUT, mx: (dx / dist) * 0.02, my: (dy / dist) * 0.02, roll: dive };
      return len < 0.01 ? NO_INPUT : { ...NO_INPUT, mx, my, roll: dive };
    }
    if (mode === 'drop') {
      mode = 'roam';
      landedAt = now;
    }
    if (detour > 0) detour -= 1;
    const thinking = (tick + id) % 8 === 0;
    if (thinking) {
      listenSteps(state, me, now);
      plan = think(state, me, now);
    }
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
      out.roll = false;
    }
    if (target) {
      td = Math.hypot(target.x - me.x, target.y - me.y);
      aimAndFire(state, me, now, out);
    }
    return out;
  };

  const info = (): BotInfo => ({
    persona: p, mode, target: target?.id ?? -1, seenAt, react: reactFor, loot: mode === 'loot' ? loot : null,
    heard: heard && { x: heard.x, y: heard.y, t: heard.t }, peek: mode === 'cover' && post ? peek : null, post: mode === 'cover' ? post : null, slip,
  });
  return Object.assign(bot, { info });
};
