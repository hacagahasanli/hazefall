import { createBot, VS_HUMAN } from './bot';
import { BUILDINGS, DT, MAP, TILE } from './constants';
import { createGame, lineOfSight, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

type Bot = ReturnType<typeof createBot>;

const idle = (): Input[] => Array.from({ length: 10 }, () => ({ ...NO_INPUT }));

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

/** Nine bots and an idle player 0 (pushed out of the drone at the end of the route). */
const botMatch = (seed: number) => {
  const s = createGame('hotfix', seed);
  const bots = s.players.map((p) => createBot(p.id, seed * 31 + p.id));
  const tick = () => step(s, s.players.map((p) => (p.id === 0 ? NO_INPUT : bots[p.id](s))));
  return { s, bots, tick };
};

/**
 * Everyone landed, loot gone, one bot (the first that `want` accepts) alone in open meadow
 * facing `enemy` 8 m ahead, its after-landing grace over.
 */
const duel = (seed: number, enemy: number, want: (b: Bot) => boolean) => {
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
  s.tick += 60 * 25;
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
  it('land spread over the map: at least 6 different buildings, never more than 2 bots in one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s, tick } = botMatch(seed);
      const lands: number[] = [];
      while (s.phase === 'drop') {
        tick();
        for (const e of s.events) if (e.type === 'land' && e.player !== 0) lands.push(buildingAt(e.x, e.y));
      }
      expect(lands).toHaveLength(9);
      const used = lands.filter((b) => b >= 0);
      expect(new Set(used).size).toBeGreaterThanOrEqual(6);
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
      const react = bot.info().persona!.react * (them.bot ? 1 : VS_HUMAN);
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

    const fine = duel(8, 2, (b) => b.info().persona!.name === 'rusher');
    for (let i = 0; i < 60; i++) {
      const inputs = idle();
      inputs[fine.me.id] = fine.bot(fine.s);
      step(fine.s, inputs);
    }
    expect(fine.bot.info().mode).toBe('engage');
  });

  it('come in four personalities, each a parameter set with its own jitter', () => {
    const { s, bots } = botMatch(9);
    bots.slice(1).forEach((b) => b(s));
    const names = bots.slice(1).map((b) => b.info().persona!.name);
    expect(new Set(names)).toEqual(new Set(['rusher', 'camper', 'looter', 'tactical']));
    const rushers = bots.slice(1).filter((b) => b.info().persona!.name === 'rusher').map((b) => b.info().persona!.react);
    expect(new Set(rushers).size).toBe(rushers.length);
  });

  it('play exactly the same way twice from the same seeds', () => {
    const run = () => {
      const { s, tick } = botMatch(12);
      for (let i = 0; i < 60 * 90; i++) tick();
      return s.players.map((p) => [p.x, p.y, p.hp, p.kills]);
    };
    expect(run()).toEqual(run());
  });
});
