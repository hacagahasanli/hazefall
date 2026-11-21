import { botCanSee, createBot, VS_HUMAN } from './bot';
import { CROWD, fightCover, guessFromSound, LANDING_GRACE, makePersona, mulberry32, reactionDelay, spotTime, stagePace } from './bot-params';
import { BUILDINGS, DT, HEALS, MAP, PLAYERS, TILE, WORLD } from './constants';
import { createGame, lineOfSight, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

type Bot = ReturnType<typeof createBot>;

const idle = (): Input[] => Array.from({ length: PLAYERS }, () => ({ ...NO_INPUT }));

/** The middle of a stretch of open meadow 30 tiles long: nothing in the way. */
const OPEN = (() => {
  for (let y = 6; y < MAP.length - 6; y++) {
    const x = MAP[y].indexOf('g'.repeat(30));
    if (x >= 0) return { x: x * TILE + 24, y: y * TILE + TILE / 2 };
  }
  throw new Error('no meadow');
})();

const buildingAt = (x: number, y: number) =>
  BUILDINGS.findIndex((b) => x > b.x0 * TILE - 4 && x < (b.x0 + b.w) * TILE + 4 && y > b.y0 * TILE - 4 && y < (b.y0 + b.h) * TILE + 4);

const meanPairwise = (pts: { x: number; y: number }[]) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      sum += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      n += 1;
    }
  }
  return n ? sum / n : 0;
};

/** PLAYERS - 1 bots and an idle player 0 (pushed out of the drone at the end of the route). */
const botMatch = (seed: number) => {
  const s = createGame('hotfix', seed);
  const bots = s.players.map((p) => createBot(p.id, seed * 31 + p.id));
  const tick = () => step(s, s.players.map((p) => (p.id === 0 ? NO_INPUT : bots[p.id](s))));
  return { s, bots, tick };
};

/**
 * Everyone landed, loot gone, eight left, one bot (the first that `want` accepts) alone in open meadow
 * facing `enemy` 8 m ahead, its after-landing grace over, in the middle of the match (fourth
 * circle: early on bots are meant to hold back, see the pacing tests).
 */
const duel = (seed: number, enemy: number, want: (b: Bot) => boolean, phase = 3) => {
  const s = createGame('hotfix', seed);
  for (let i = 0; i < 60 * 60 && s.phase === 'drop'; i++) step(s, idle());
  s.loot = [];
  const bots = s.players.map((p) => createBot(p.id, seed + p.id));
  const id = s.players.findIndex((p) => {
    if (!p.bot || p.id === enemy) return false;
    bots[p.id](s);
    return want(bots[p.id]);
  });
  s.players.forEach((p) => Object.assign(p, { x: 6, y: 6 }));
  // Mid-match: eight still standing (bots hold back in a crowd, see CROWD), the rest out of the round.
  s.players.filter((p) => p.id !== id && p.id !== enemy).slice(6).forEach((p) => (p.alive = false));
  s.tick += 60 * (LANDING_GRACE.human + 6);
  s.zone.phase = phase;
  Object.assign(s.players[id], { x: OPEN.x, y: OPEN.y, heading: 0, vx: 0, vy: 0 });
  Object.assign(s.players[enemy], { x: OPEN.x + 8, y: OPEN.y, vx: 0, vy: 0 });
  return { s, bot: bots[id], me: s.players[id], them: s.players[enemy] };
};

/** Run only this bot (everyone else idle) until it fires; seconds taken. */
const firstShot = (s: GameState, bot: Bot, id: number, seconds: number) => {
  const start = s.tick;
  for (let i = 0; i < 60 * seconds; i++) {
    const inputs = idle();
    inputs[id] = bot(s);
    step(s, inputs);
    if (s.events.some((e) => e.type === 'shot' && e.owner === id)) return (s.tick - start) * DT;
  }
  return Infinity;
};

describe('bots behave like separate people', () => {
  it('land spread over the map: at least 12 different buildings, never more than 2 bots in one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s, tick } = botMatch(seed);
      const lands: number[] = [];
      while (s.phase === 'drop') {
        tick();
        for (const e of s.events) if (e.type === 'land' && e.player !== 0) lands.push(buildingAt(e.x, e.y));
      }
      expect(lands).toHaveLength(PLAYERS - 1);
      const used = lands.filter((b) => b >= 0);
      expect(new Set(used).size).toBeGreaterThanOrEqual(12);
      for (const b of new Set(used)) expect(used.filter((x) => x === b).length).toBeLessThanOrEqual(2);
    }
  });

  it('stay spread out a minute after landing instead of gathering in one place', () => {
    const spreads = [1, 2, 3, 4].map((seed) => {
      const { s, tick } = botMatch(seed);
      while (s.phase === 'drop') tick();
      for (let i = 0; i < 60 * 60 && s.phase === 'play'; i++) tick();
      return meanPairwise(s.players.filter((p) => p.alive && p.id !== 0));
    });
    // The old bots came to about 34 m here (all drifting to one corner on the way down).
    expect(spreads.reduce((a, b) => a + b, 0) / spreads.length).toBeGreaterThan(44);
  });

  it('take a moment to react before the first shot at someone new (longer against a person)', () => {
    for (const [seed, enemy] of [[3, 2], [4, 5], [5, 0], [6, 0]]) {
      const { s, bot, me, them } = duel(seed, enemy, (b) => ['rusher', 'tactical'].includes(b.info().persona!.name));
      const t = firstShot(s, bot, me.id, 3);
      // The delay drawn for this target: never faster than three quarters of the personality's own speed.
      const react = bot.info().react;
      expect(react).toBeGreaterThanOrEqual(bot.info().persona!.react * (them.bot ? 1 : VS_HUMAN) * 0.75 - 1e-9);
      expect(t).toBeGreaterThanOrEqual(react);
      expect(t).toBeLessThan(react + 0.6);
    }
  });

  it('do not see someone standing behind them, until that someone opens fire', () => {
    const { s, bot, me, them } = duel(7, 2, (b) => b.info().persona!.name === 'rusher');
    Object.assign(them, { x: OPEN.x - 12 });
    const inputs = idle();
    for (let i = 0; i < 30; i++) {
      inputs[me.id] = { ...bot(s), mx: 0, my: 0, fire: false, aimX: me.x + 5, aimY: me.y };
      step(s, inputs);
    }
    expect(bot.info().target).toBe(-1);
    inputs[them.id] = { ...NO_INPUT, fire: true, aimX: me.x, aimY: me.y };
    for (let i = 0; i < 30; i++) {
      inputs[me.id] = bot(s);
      step(s, inputs);
    }
    expect(bot.info().target).toBe(them.id);
  });

  it('fall back when badly hurt, and fight on when healthy', () => {
    const hurt = duel(8, 2, () => true);
    Object.assign(hurt.me, { hp: 10, armor: 0 });
    const d0 = Math.hypot(hurt.me.x - hurt.them.x, hurt.me.y - hurt.them.y);
    let retreated = false;
    for (let i = 0; i < 60 * 1.5; i++) {
      const inputs = idle();
      inputs[hurt.me.id] = hurt.bot(hurt.s);
      step(hurt.s, inputs);
      retreated ||= hurt.bot.info().mode === 'retreat';
    }
    expect(retreated).toBe(true);
    // Behind something, or well away.
    const hidden = !lineOfSight(hurt.s, hurt.me.x, hurt.me.y, hurt.them.x, hurt.them.y);
    expect(hidden || Math.hypot(hurt.me.x - hurt.them.x, hurt.me.y - hurt.them.y) > d0 + 3).toBe(true);
    expect(Math.hypot(hurt.me.x - OPEN.x, hurt.me.y - OPEN.y)).toBeGreaterThan(3);

    // Healthy, it takes the fight and never falls back (it may lose sight of them as it strafes).
    const fine = duel(8, 2, (b) => b.info().persona!.name === 'rusher');
    const modes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const inputs = idle();
      inputs[fine.me.id] = fine.bot(fine.s);
      step(fine.s, inputs);
      modes.add(fine.bot.info().mode);
    }
    expect(modes.has('engage')).toBe(true);
    expect(modes.has('retreat')).toBe(false);
  });

  it('come in four personalities, each a parameter set with its own jitter', () => {
    const { s, bots } = botMatch(9);
    bots.slice(1).forEach((b) => b(s));
    const names = bots.slice(1).map((b) => b.info().persona!.name);
    expect(new Set(names)).toEqual(new Set(['rusher', 'camper', 'looter', 'tactical']));
    const rushers = bots.slice(1).filter((b) => b.info().persona!.name === 'rusher').map((b) => b.info().persona!.react);
    expect(new Set(rushers).size).toBe(rushers.length);
  });

  it('early on a rusher leaves gunfire 34 m away alone; from the fourth circle it goes to see', () => {
    const closest = (phase: number, seed: number) => {
      const { s, bot, me, them } = duel(seed, 2, (b) => b.info().persona!.name === 'rusher', phase);
      // The shooter is out of sight (26 m) but within earshot, off to the side of the way to the next circle (so roaming
      // there does not lead to it), firing away from the bot.
      // (Whichever side keeps it on the map, so it really is 34 m away.)
      const k = 34 / Math.hypot(s.zone.toX - me.x, s.zone.toY - me.y);
      const side = [1, -1].find((g) => {
        const x = me.x - (s.zone.toY - me.y) * k * g;
        const y = me.y + (s.zone.toX - me.x) * k * g;
        return x > 8 && y > 8 && x < WORLD - 8 && y < WORLD - 8;
      })!;
      Object.assign(them, { x: me.x - (s.zone.toY - me.y) * k * side, y: me.y + (s.zone.toX - me.x) * k * side });
      let best = Infinity;
      for (let i = 0; i < 60 * 8; i++) {
        const inputs = idle();
        inputs[me.id] = bot(s);
        inputs[them.id] = { ...NO_INPUT, fire: i % 30 === 0, aimX: them.x + (them.x - me.x), aimY: them.y + (them.y - me.y) };
        step(s, inputs);
        best = Math.min(best, Math.hypot(me.x - them.x, me.y - them.y));
        if (process.env.DBG && i % 60 === 0) console.log(phase, i, s.events.map((e) => e.type).join(), bot.info().mode, me.x.toFixed(1), me.y.toFixed(1), them.mag, s.zone.state, s.zone.timer.toFixed(1));
      }
      return best;
    };
    // (Seed 4 dropped: since bots draw more of their own random numbers, its rusher's own wander in the first circle
    // happens to lead it past that spot, gunfire or not.)
    for (const seed of [3, 5, 6]) {
      expect(closest(0, seed)).toBeGreaterThan(18);
      expect(closest(3, seed)).toBeLessThan(18);
    }
  });

  it('hold back in a crowd, easing off smoothly as the field thins', () => {
    const full = stagePace(0, PLAYERS);
    const thin = stagePace(0, CROWD.from);
    expect(full.aggro).toBeCloseTo(thin.aggro + CROWD.aggro, 5);
    expect(full.back).toBeGreaterThan(thin.back);
    expect(full.chase).toBeLessThan(thin.chase);
    // No jump anywhere between a full match and `from` alive.
    for (let n = CROWD.from; n < PLAYERS; n++) expect(Math.abs(stagePace(0, n + 1).aggro - stagePace(0, n).aggro)).toBeLessThan(0.05);
  });

  it('play exactly the same way twice from the same seeds', () => {
    const run = () => {
      const { s, bots, tick } = botMatch(12);
      const modes: string[] = [];
      for (let i = 0; i < 60 * 150; i++) {
        tick();
        if (i % 60 === 0) modes.push(bots.slice(1).map((b) => b.info().mode).join());
      }
      return { players: s.players.map((p) => [p.x, p.y, p.hp, p.kills]), modes };
    };
    expect(run()).toEqual(run());
  });
});


/** A house wall running north-south with open ground for 4 tiles west of it and floor east of it (tile coordinates). */
const WALL = (() => {
  for (let y = 6; y < MAP.length - 6; y++) {
    for (let x = 8; x < MAP[y].length - 4; x++) {
      if (MAP[y][x] !== '#' || MAP[y - 1][x] !== '#' || MAP[y + 1][x] !== '#') continue;
      if (!'.lu'.includes(MAP[y][x + 1]) || !'.lu'.includes(MAP[y][x + 2])) continue;
      if ([1, 2, 3, 4].every((k) => 'gpas'.includes(MAP[y][x - k]))) return { x, y };
    }
  }
  throw new Error('no wall');
})();

/** Somewhere in the open that has fighting cover (with a spot to peek from) within reach, against a threat 13 m east. */
const coverSpot = (s: GameState, me: GameState['players'][number]) => {
  for (let y = 8; y < MAP.length - 8; y++) {
    for (let x = 8; x < MAP[y].length - 16; x++) {
      if (!'gp'.includes(MAP[y][x]) || !'gp'.includes(MAP[y][x + 6]) || !'gpa'.includes(MAP[y][x + 7])) continue;
      const at = { x: x * TILE + 1, y: y * TILE + 1 };
      const them = { x: at.x + 13, y: at.y };
      if (!lineOfSight(s, at.x, at.y, them.x, them.y)) continue;
      Object.assign(me, at);
      const c = fightCover(s, me, them.x, them.y);
      if (c && Math.hypot(c.x - at.x, c.y - at.y) < 6) return { at, them };
    }
  }
  throw new Error('no cover');
};

describe('bots fight like people', () => {
  it('never notice anyone through a wall, however long they look; across open ground they do', () => {
    const { s, bot, me, them } = duel(21, 2, () => true);
    // Me facing the wall from 3 tiles outside, them moving about 2 tiles inside it: 10 m apart, straight ahead.
    Object.assign(me, { x: (WALL.x - 3) * TILE + 1, y: WALL.y * TILE + 1, heading: 0 });
    Object.assign(them, { x: (WALL.x + 2) * TILE + 1, y: WALL.y * TILE + 1 });
    expect(lineOfSight(s, me.x, me.y, them.x, them.y)).toBe(false);
    for (let i = 0; i < 60 * 4; i++) {
      const inputs = idle();
      inputs[me.id] = { ...bot(s), mx: 0, my: 0 };
      // They shuffle up and down the room, but never come out.
      inputs[them.id] = { ...NO_INPUT, my: Math.sin(i / 20) };
      step(s, inputs);
      expect(bot.info().target).toBe(-1);
      expect(s.events.some((e) => e.type === 'shot' && e.owner === me.id)).toBe(false);
    }
    expect(botCanSee(s, me, them)).toBe(false);

    // The same 10 m across a meadow: noticed, and not on the very first look.
    const open = duel(21, 2, () => true);
    let noticed = -1;
    for (let i = 0; i < 60 * 2 && noticed < 0; i++) {
      const inputs = idle();
      inputs[open.me.id] = { ...open.bot(open.s), mx: 0, my: 0 };
      step(open.s, inputs);
      if (open.bot.info().target === open.them.id) noticed = i;
    }
    expect(noticed).toBeGreaterThan(8);
    expect(noticed).toBeLessThan(60);
  });

  it('notice a near, moving or shooting player sooner than a far, still one; later in a bush, indoors or at the edge of view', () => {
    const p = makePersona('tactical', () => 0.5);
    const base = { d: 18, edge: 0, moving: false, firing: false, light: 1, plant: false, alert: false };
    const t = spotTime(p, base);
    expect(spotTime(p, { ...base, d: 5 })).toBeLessThan(t / 3);
    expect(spotTime(p, { ...base, moving: true })).toBeLessThan(t);
    expect(spotTime(p, { ...base, firing: true })).toBeLessThan(t / 2);
    expect(spotTime(p, { ...base, plant: true })).toBeGreaterThan(t * 1.5);
    expect(spotTime(p, { ...base, light: 0.6 })).toBeGreaterThan(t * 1.5);
    expect(spotTime(p, { ...base, edge: 0.95 })).toBeGreaterThan(t * 1.5);
    // A sharp-eyed camper sees the same thing sooner than a looter.
    expect(spotTime(makePersona('camper', () => 0.5), base)).toBeLessThan(spotTime(makePersona('looter', () => 0.5), base));
  });

  it('hear gunfire as a rough direction, never the exact spot, vaguer the farther it is', () => {
    const rand = mulberry32(5);
    const miss = (d: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const g = guessFromSound(0, 0, d, 0, rand);
        const err = Math.hypot(g.x - d, g.y);
        expect(err).toBeGreaterThan(0);
        // The right side of the bot, though: the bearing is off by at most about 21 degrees.
        expect(Math.abs(Math.atan2(g.y, g.x))).toBeLessThan((22 * Math.PI) / 180);
        sum += err;
      }
      return sum / 200;
    };
    expect(miss(40)).toBeGreaterThan(miss(10) * 2);
    expect(miss(40)).toBeGreaterThan(4);
  });

  it('take a different moment to react each time, mostly near their own speed and now and then slow', () => {
    const p = makePersona('rusher', () => 0.5);
    const rand = mulberry32(9);
    const draws = Array.from({ length: 300 }, () => reactionDelay(p, rand, 1, false));
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(p.react * 0.75);
    expect(Math.max(...draws) - Math.min(...draws)).toBeGreaterThan(p.react * 0.4);
    expect(draws.filter((d) => d > p.react * 1.25).length).toBeGreaterThan(10);
    // A slip is a proper hesitation.
    const slow = Array.from({ length: 50 }, () => reactionDelay(p, rand, 1, true));
    expect(Math.min(...slow)).toBeGreaterThan(p.react * 0.75 + 0.29);
  });

  it('break off when badly hurt, then heal out of sight at the items\' own pace, and fight again once healthier', () => {
    const { s, bot, me, them } = duel(8, 2, () => true);
    Object.assign(them, { x: me.x + 12, weapon: 'rifle', mag: 30, ammo: 0 });
    // It has seen them; then it is badly hurt.
    for (let i = 0; i < 60 && bot.info().target !== them.id; i++) {
      const inputs = idle();
      inputs[me.id] = { ...bot(s), fire: false };
      step(s, inputs);
    }
    expect(bot.info().target).toBe(them.id);
    Object.assign(me, { hp: 22, armor: 0, medkits: 1, bandages: 2 });
    let started = -1;
    let done = -1;
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 25 && done < 0; i++) {
      const inputs = idle();
      inputs[me.id] = bot(s);
      step(s, inputs);
      modes.add(bot.info().mode);
      for (const e of s.events) {
        if (e.type === 'heal' && e.player === me.id && !e.done && started < 0) {
          started = s.tick;
          // Out of their sight (or out of their view range) when it starts.
          expect(!botCanSee(s, them, me) || Math.hypot(me.x - them.x, me.y - them.y) > 24).toBe(true);
        }
        if (e.type === 'heal' && e.player === me.id && e.done) done = s.tick;
      }
    }
    expect(modes.has('retreat')).toBe(true);
    expect(modes.has('heal')).toBe(true);
    expect(started).toBeGreaterThan(0);
    expect(done).toBeGreaterThan(0);
    expect((done - started) * DT).toBeGreaterThanOrEqual(Math.min(HEALS.medkit.time, HEALS.bandage.time) - 1e-6);
    expect(me.hp).toBeGreaterThan(22);
    // Never shot first at them while it was low.
    expect(them.hp).toBe(100);
  });

  it('at critical health with nothing to heal with, keep out of a fight nobody has started', () => {
    const { s, bot, me, them } = duel(8, 2, (b) => b.info().persona!.name === 'rusher');
    Object.assign(me, { hp: 18, armor: 0, medkits: 0, bandages: 0, coffees: 0 });
    for (let i = 0; i < 60 * 3; i++) {
      const inputs = idle();
      inputs[me.id] = bot(s);
      step(s, inputs);
      expect(bot.info().mode).not.toBe('engage');
    }
    expect(them.hp).toBe(100);
  });

  it('fight from cover when unsure of themselves: get behind it, lean out to shoot, duck back', () => {
    const { s, bot, me, them } = duel(14, 2, () => true);
    const { at, them: tp } = coverSpot(s, me);
    Object.assign(me, { ...at, heading: 0, weapon: 'rifle', mag: 30, ammo: 60, hp: 100, armor: 0 });
    Object.assign(them, { ...tp, weapon: 'pistol', mag: 12, ammo: 0 });
    Object.assign(bot.info().persona!, { confidence: 0.05, mistake: 0, aggro: 1 });
    const seen = { cover: false, peek: false, hide: false, lean: false, hiddenBehind: false, shot: false };
    for (let i = 0; i < 60 * 8; i++) {
      const inputs = idle();
      inputs[me.id] = bot(s);
      step(s, inputs);
      const info = bot.info();
      seen.cover ||= info.mode === 'cover';
      seen.peek ||= info.peek === 'peek';
      seen.hide ||= info.peek === 'hide';
      seen.lean ||= Math.abs(me.lean) > 0.3;
      seen.hiddenBehind ||= info.mode === 'cover' && !lineOfSight(s, them.x, them.y, me.x, me.y);
      seen.shot ||= s.events.some((e) => e.type === 'shot' && e.owner === me.id);
    }
    expect(seen).toEqual({ cover: true, peek: true, hide: true, lean: true, hiddenBehind: true, shot: true });
  });

  it('never stand still while being hit, even by someone out of sight: get off the line and look that way', () => {
    const { s, bot, me, them } = duel(15, 2, () => true);
    // A shooter 38 m off across open ground, beyond what a bot can make out: it hears and feels the shots, nothing more.
    const a = Array.from({ length: 32 }, (_, k) => (k * Math.PI) / 16).find((r) => {
      const x = me.x + Math.cos(r) * 38;
      const y = me.y + Math.sin(r) * 38;
      return x > 8 && y > 8 && x < WORLD - 8 && y < WORLD - 8 && lineOfSight(s, me.x, me.y, x, y) && 'gpa'.includes(MAP[Math.floor(y / TILE)][Math.floor(x / TILE)]);
    });
    expect(a).toBeDefined();
    Object.assign(them, { x: me.x + Math.cos(a!) * 38, y: me.y + Math.sin(a!) * 38, weapon: 'rifle', mag: 30, ammo: 90 });
    // Tough enough to stay up through it (and too healthy to think of running).
    Object.assign(me, { hp: 5000, maxHp: 5000 });
    let firstHit = -1;
    let moving = 0;
    let ticks = 0;
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 6; i++) {
      const inputs = idle();
      inputs[me.id] = bot(s);
      inputs[them.id] = { ...NO_INPUT, fire: true, aimX: me.x, aimY: me.y };
      step(s, inputs);
      if (firstHit < 0 && s.events.some((e) => e.type === 'hit' && e.target === me.id)) firstHit = i;
      if (firstHit >= 0 && i > firstHit + 20 && i < firstHit + 140) {
        ticks += 1;
        if (Math.hypot(me.vx, me.vy) > 1) moving += 1;
        modes.add(bot.info().mode);
      }
      if (!me.alive) break;
    }
    expect(firstHit).toBeGreaterThanOrEqual(0);
    expect(moving / ticks).toBeGreaterThan(0.8);
    expect(modes.has('pressure')).toBe(true);
    // It knows roughly where from, not exactly.
    const h = bot.info().heard!;
    expect(Math.hypot(h.x - them.x, h.y - them.y)).toBeGreaterThan(0.5);
  });

  it('differ from each other: reaction, eyes, confidence, slips and movement all spread, rushers surer than looters', () => {
    const { s, bots } = botMatch(9);
    bots.slice(1).forEach((b) => b(s));
    const ps = bots.slice(1).map((b) => b.info().persona!);
    for (const k of ['react', 'eyes', 'confidence', 'mistake', 'strafeW', 'strafeT', 'aggro', 'aim0'] as const) {
      expect(new Set(ps.map((p) => p[k])).size).toBe(ps.length);
    }
    const mean = (name: string, k: 'confidence' | 'strafeW') => {
      const v = ps.filter((p) => p.name === name).map((p) => p[k]);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean('rusher', 'confidence')).toBeGreaterThan(mean('looter', 'confidence') + 0.2);
    expect(mean('rusher', 'strafeW')).toBeGreaterThan(mean('camper', 'strafeW') * 2);
  });

  it('slip up now and then over a match, and spend time in every way of playing', () => {
    const { s, bots, tick } = botMatch(4);
    const slips = new Set<string>();
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 240 && s.phase !== 'over'; i++) {
      tick();
      if (i % 8 === 0) for (const b of bots.slice(1)) {
        const info = b.info();
        if (info.slip) slips.add(info.slip);
        modes.add(info.mode);
      }
    }
    expect(slips.size).toBeGreaterThanOrEqual(2);
    for (const m of ['roam', 'loot', 'engage', 'cover', 'retreat', 'heal', 'pressure']) expect(modes).toContain(m);
  });
});
