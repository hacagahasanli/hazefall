import { describe, expect, it } from 'vitest';

import { createBot } from './bot';
import { deployProgress, dragAt, DROP, DT } from './constants';
import { createGame, step, updateFall, windOf } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input, Player } from './types';

const idle = (n: number): Input[] => Array.from({ length: n }, () => ({ ...NO_INPUT }));

/** A match with player 0 just out of the door (everyone else still aboard), and the drone parked over the map. */
const jumped = (seed = 3): { s: GameState; p: Player } => {
  const s = createGame('hotfix', seed);
  s.drone.t = 0.5;
  const inputs = idle(s.players.length);
  inputs[0] = { ...NO_INPUT, jump: true };
  step(s, inputs);
  const p = s.players[0];
  expect(p.stage).toBe('falling');
  return { s, p };
};

/** Fly player 0 alone (no drone, no others) with `input` until `until` says stop; returns the samples. */
const fly = (s: GameState, p: Player, input: (t: number) => Input, until: (p: Player, t: number) => boolean) => {
  const samples: { t: number; alt: number; vz: number; canopy: number; vx: number; vy: number }[] = [];
  let t = 0;
  while (p.stage === 'falling' && !until(p, t) && t < 30) {
    const i = input(t);
    updateFall(s, p, i);
    p.prev = { ...i };
    s.tick += 1;
    t += DT;
    samples.push({ t, alt: p.alt, vz: p.vz, canopy: p.canopy, vx: p.vx, vy: p.vy });
  }
  return samples;
};

describe('the skydive', () => {
  it('free fall: gravity first, then drag holds you at terminal velocity', () => {
    const { s, p } = jumped();
    // Gravity alone at first: about g * t after a quarter second.
    const early = fly(s, p, () => NO_INPUT, (_q, t) => t >= 0.25);
    expect(early[early.length - 1].vz).toBeGreaterThan(DROP.gravity * 0.25 * 0.95);
    // Held high (no pull), the speed approaches terminal and never passes it.
    p.alt = 5000;
    const long = fly(s, p, () => NO_INPUT, (_q, t) => t >= 12);
    for (const k of long) expect(k.vz).toBeLessThanOrEqual(DROP.freefallTerminal + 1e-6);
    expect(long[long.length - 1].vz).toBeGreaterThan(DROP.freefallTerminal * 0.99);
    expect(long[long.length - 1].canopy).toBeLessThan(0);
  });

  it('drag rises through the opening and the canopy settles at its own terminal speed', () => {
    expect(dragAt(-1, 50)).toBeCloseTo(DROP.gravity / DROP.freefallTerminal ** 2);
    const ks = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.1, 2].map((c) => dragAt(c, 30));
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThanOrEqual(ks[i - 1]);
    expect(dragAt(2, 30)).toBeCloseTo(DROP.gravity / DROP.chuteTerminal ** 2);
    expect(deployProgress(-1)).toBe(0);
    expect(deployProgress(DROP.deployTime / 2)).toBeCloseTo(0.5);
    expect(deployProgress(9)).toBe(1);
  });

  it('the canopy opens by itself at its height and slows you hard but smoothly over about a second', () => {
    const { s, p } = jumped();
    const all = fly(s, p, () => NO_INPUT, (q) => q.alt <= 0);
    const pull = all.findIndex((k) => k.canopy >= 0);
    expect(all[pull].alt).toBeLessThanOrEqual(DROP.deployAlt);
    expect(all[pull].alt).toBeGreaterThan(DROP.deployAlt - 1);
    // Free fall to the pull: about 3 s.
    expect(all[pull].t).toBeGreaterThan(2.7);
    expect(all[pull].t).toBeLessThan(3.5);
    // The deceleration: nothing while the bag and lines pay out, then the bite; the peak is a believable 1.5-4 g,
    // reached in the inflation (not as one tick's snap), and by the end of it you are near canopy speed.
    const decel = all.slice(pull + 1).map((k, i) => ({ t: k.canopy, a: -(k.vz - all[pull + i].vz) / DT }));
    const peak = decel.reduce((m, k) => (k.a > m.a ? k : m));
    expect(peak.a / DROP.gravity).toBeGreaterThan(1.5);
    expect(peak.a / DROP.gravity).toBeLessThan(4);
    expect(peak.t).toBeGreaterThan(DROP.stretch);
    expect(peak.t).toBeLessThan(DROP.deployTime + 0.1);
    for (const k of decel.filter((d) => d.t < DROP.stretch * 0.6)) expect(k.a).toBeLessThan(DROP.gravity * 0.5);
    // No jerk spikes: the deceleration changes by under 1.5 g per tick.
    for (let i = 1; i < decel.length; i++) expect(Math.abs(decel[i].a - decel[i - 1].a)).toBeLessThan(DROP.gravity * 1.5);
    const after = all.find((k) => k.canopy >= DROP.deployTime + 0.5)!;
    expect(after.vz).toBeLessThan(DROP.chuteTerminal * 1.1);
  });

  it('the whole drop takes its set time, most of it under the canopy, and the flare softens the touchdown', () => {
    const { s, p } = jumped();
    const all = fly(s, p, () => NO_INPUT, (q) => q.alt <= 0);
    const total = all[all.length - 1].t;
    expect(Math.abs(total - DROP.glide)).toBeLessThan(0.15);
    expect(all[all.length - 1].vz).toBeLessThan(DROP.chuteTerminal * 0.8);
    // The canopy part is the long one now: about 9 s, against about 5 s before the floatier canopy.
    const pull = all.find((k) => k.canopy >= 0)!;
    expect(total - pull.t).toBeGreaterThan(5.05 * 1.5);
    expect(total - pull.t).toBeLessThan(5.05 * 2);
  });

  it('Space pulls early once you have fallen a little, never straight out of the door', () => {
    const { s, p } = jumped();
    const press = (t: number) => ({ ...NO_INPUT, jump: Math.floor(t / 0.1) % 2 === 0 });
    const all = fly(s, p, press, (q) => q.canopy >= 0);
    const pullAt = all[all.length - 1];
    expect(DROP.height - pullAt.alt).toBeGreaterThanOrEqual(DROP.minFreefallDrop);
    expect(pullAt.alt).toBeGreaterThan(DROP.deployAlt + 20);
  });

  it('steering has momentum: the body speeds up and slows down over time, in free fall and under the canopy', () => {
    const { s, p } = jumped();
    p.vx = 0;
    p.vy = 0;
    const right = { ...NO_INPUT, mx: 1 };
    const ff = fly(s, p, () => right, (_q, t) => t >= 0.5);
    // Not instant, but well on its way in half a second.
    expect(ff[0].vx).toBeLessThan(DROP.freefallSpeed * 0.1);
    expect(ff[ff.length - 1].vx).toBeGreaterThan(DROP.freefallSpeed * 0.45);
    expect(ff[ff.length - 1].vx).toBeLessThan(DROP.freefallSpeed);
    // Let go: it coasts rather than stopping dead.
    const coast = fly(s, p, () => NO_INPUT, (_q, t) => t >= 0.2);
    expect(coast[coast.length - 1].vx).toBeGreaterThan(ff[ff.length - 1].vx * 0.6);
    // Under the canopy the push builds over time too: not instant, but most of the way within a second.
    const c = jumped(4);
    Object.assign(c.p, { alt: 30, canopy: DROP.deployTime, vz: DROP.chuteTerminal, vx: 0, vy: 0 });
    const ch = fly(c.s, c.p, () => right, (_q, t) => t >= 1);
    expect(ch[0].vx).toBeLessThan(DROP.chuteSpeed * 0.1);
    expect(ch[ch.length - 1].vx).toBeGreaterThan(DROP.chuteSpeed * 0.7);
    expect(ch[ch.length - 1].vx).toBeLessThan(DROP.chuteSpeed * 1.15);
    // Reversing under the canopy swings through, it does not flip.
    const rev = fly(c.s, c.p, () => ({ ...NO_INPUT, mx: -1 }), (_q, t) => t >= 0.3);
    expect(rev[0].vx).toBeGreaterThan(0);
  });

  /** Player 0 under a fully open canopy at `alt`, flying +x at `speed` from the left edge, wind and all. */
  const flying = (alt: number, speed: number, seed = 5) => {
    const { s, p } = jumped(seed);
    Object.assign(p, { x: 8, y: 88, alt, canopy: DROP.deployTime + 1, vz: DROP.chuteTerminal, vx: speed, vy: 0 });
    return { s, p };
  };

  it('the canopy never stops in the air: hands off it glides on the way it was going, and sinks slowly', () => {
    const { s, p } = flying(40, DROP.chuteSpeed);
    const all = fly(s, p, () => NO_INPUT, (_q, t) => t >= 4);
    const last = all[all.length - 1];
    const w = windOf(s);
    expect(last.vx - w.x).toBeGreaterThan(DROP.chuteTrim * 0.85);
    expect(Math.abs(Math.hypot(last.vx - w.x, last.vy - w.y) - DROP.chuteTrim)).toBeLessThan(0.6);
    expect(last.vz).toBeLessThan(DROP.chuteTerminal * 1.05);
    expect(last.vz).toBeGreaterThan(DROP.chuteTerminal * 0.9);
  });

  it('the canopy turns briskly towards the stick and keeps flying through the turn', () => {
    const { s, p } = flying(40, DROP.chuteSpeed);
    const all = fly(s, p, () => ({ ...NO_INPUT, my: 1 }), (_q, t) => t >= 1);
    // Within a second the heading has come round most of the 90 degrees, without stalling on the way.
    const last = all[all.length - 1];
    expect(Math.atan2(last.vy, last.vx)).toBeGreaterThan((60 * Math.PI) / 180);
    for (const k of all) expect(Math.hypot(k.vx, k.vy)).toBeGreaterThan(DROP.chuteTrim * 1.3);
  });

  it('the dive trades height for speed: faster across the map, a quicker descent, and a longer reach', () => {
    const glide = flying(40, DROP.chuteSpeed);
    const dive = flying(40, DROP.chuteSpeed);
    const a = fly(glide.s, glide.p, () => ({ ...NO_INPUT, mx: 1 }), (q) => q.alt <= 0);
    const b = fly(dive.s, dive.p, () => ({ ...NO_INPUT, mx: 1, roll: true }), (q) => q.alt <= 0);
    const mid = (k: typeof a) => k[Math.floor(k.length / 2)];
    expect(mid(b).vx).toBeGreaterThan(mid(a).vx * 1.4);
    expect(mid(b).vz).toBeGreaterThan(mid(a).vz * 1.3);
    expect(mid(b).vz).toBeLessThanOrEqual(DROP.chuteDiveSink + 0.05);
    // It lands sooner, and farther away.
    expect(b.length).toBeLessThan(a.length * 0.85);
    expect(dive.p.x).toBeGreaterThan(glide.p.x + 5);
    // No dive in free fall: the key does nothing before the canopy is open.
    const ff = jumped(6);
    const ff2 = jumped(6);
    fly(ff.s, ff.p, () => NO_INPUT, (_q, t) => t >= 1.5);
    fly(ff2.s, ff2.p, () => ({ ...NO_INPUT, roll: true }), (_q, t) => t >= 1.5);
    expect(ff2.p.alt).toBe(ff.p.alt);
    expect(ff2.p.x).toBe(ff.p.x);
  });

  it('you can choose a landing spot across a wide circle: about 100 m from the door with the automatic pull', () => {
    const { s, p } = jumped(7);
    Object.assign(p, { x: 8, y: 88 });
    const all = fly(s, p, () => ({ ...NO_INPUT, mx: 1, roll: true }), (q) => q.alt <= 0);
    expect(p.x - 8).toBeGreaterThan(95);
    expect(all.length * DT).toBeGreaterThan(8);
    // Hands off you come down close to where you jumped.
    const still = jumped(7);
    const x0 = still.p.x;
    const y0 = still.p.y;
    fly(still.s, still.p, () => NO_INPUT, (q) => q.alt <= 0);
    expect(Math.hypot(still.p.x - x0, still.p.y - y0)).toBeLessThan(30);
  });

  it('you leave the door with some of the plane’s speed, and the air takes it off', () => {
    const { s, p } = jumped();
    const d = s.drone;
    const along = (q: { vx: number; vy: number }) => (q.vx * (d.x1 - d.x0) + q.vy * (d.y1 - d.y0)) / Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    expect(along(p)).toBeGreaterThan(3);
    fly(s, p, () => NO_INPUT, (_q, t) => t >= 2.5);
    expect(Math.abs(along(p))).toBeLessThan(1);
  });

  it('the same inputs give the same drop, to the bit', () => {
    const run = () => {
      const s = createGame('hotfix', 11);
      const bots = s.players.map((q) => createBot(q.id, 99 + q.id));
      const trace: number[] = [];
      for (let i = 0; i < 60 * 40 && s.phase === 'drop'; i++) {
        const inputs = s.players.map((q, k) => (k === 0 ? { ...NO_INPUT, jump: i > 300, mx: Math.sin(i * 0.05), my: Math.cos(i * 0.03) } : bots[k](s)));
        step(s, inputs);
        for (const q of s.players) trace.push(q.alt, q.vz, q.canopy, q.x, q.y);
      }
      return { trace, phase: s.phase };
    };
    const a = run();
    const b = run();
    expect(a.phase).toBe('play');
    expect(a.trace).toEqual(b.trace);
  });

  it('bots still reach their spots with momentum in the way', () => {
    const s = createGame('hotfix', 21);
    const bots = s.players.map((q) => createBot(q.id, 7 + q.id));
    const landed: { x: number; y: number }[] = [];
    for (let i = 0; i < 60 * 40 && s.phase === 'drop'; i++) {
      step(s, s.players.map((q) => (q.bot ? bots[q.id](s) : { ...NO_INPUT, jump: true })));
      for (const e of s.events) if (e.type === 'land' && s.players[e.player].bot) landed.push({ x: e.x, y: e.y });
    }
    expect(landed.length).toBe(s.players.length - 1);
    // Bots spread out: no two land on top of each other.
    let close = 0;
    for (let i = 0; i < landed.length; i++) for (let j = i + 1; j < landed.length; j++) if (Math.hypot(landed[i].x - landed[j].x, landed[i].y - landed[j].y) < 2) close++;
    expect(close).toBeLessThanOrEqual(1);
  });
});
