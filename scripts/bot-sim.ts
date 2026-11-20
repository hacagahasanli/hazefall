/**
 * Headless bot report: plays N full matches (nine bots and one passive stand-in for the player)
 * and prints how the bots spread, when the first fights happen, how long rounds last and who
 * wins. Run: npx tsx scripts/bot-sim.ts [matches=20] [firstSeed=1]
 */
import { createBot } from '../src/game/sim/bot';
import { lootValue } from '../src/game/sim/bot-params';
import { BUILDINGS, DT, TILE, WEAPONS } from '../src/game/sim/constants';
import { canSee, createGame, lineOfSight, step } from '../src/game/sim/step';
import { NO_INPUT } from '../src/game/sim/types';

import type { GameState, Input } from '../src/game/sim/types';

const matches = Number(process.argv[2] ?? 20);
const firstSeed = Number(process.argv[3] ?? 1);

const buildingAt = (x: number, y: number) =>
  BUILDINGS.findIndex((b) => x > b.x0 * TILE - 4 && x < (b.x0 + b.w) * TILE + 4 && y > b.y0 * TILE - 4 && y < (b.y0 + b.h) * TILE + 4);

const meanPairwise = (pts: { x: number; y: number }[]) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    sum += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    n += 1;
  }
  return n ? sum / n : 0;
};

/** The stand-in player: jumps mid-route, picks up a better gun or armor within 20 m, otherwise holds where it lands, walks in with the Deadline, and only shoots back (at whoever it sees within 24 m, for 5 s after being hit). */
const passive = (s: GameState): Input => {
  const me = s.players[0];
  if (!me.alive) return NO_INPUT;
  if (me.stage === 'drone') return { ...NO_INPUT, jump: s.drone.t >= 0.5 };
  if (me.stage === 'falling') return NO_INPUT;
  const out: Input = { ...NO_INPUT, aimX: me.x + 1, aimY: me.y };
  const z = s.zone;
  const d = Math.hypot(me.x - z.toX, me.y - z.toY);
  if (d > z.toR * 0.7 && (z.state === 'shrink' || z.timer < 15 || Math.hypot(me.x - z.cx, me.y - z.cy) > z.r)) {
    out.mx = (z.toX - me.x) / d;
    out.my = (z.toY - me.y) / d;
  }
  // Like a newcomer: grab a better gun or armor close by, then stay put.
  if (!out.mx && !out.my) {
    let bestLoot = 0;
    for (const k of s.loot) {
      const kd = Math.hypot(k.x - me.x, k.y - me.y);
      const v = k.active && kd < 20 ? lootValue(k.kind, me) / (1 + kd / 10) : 0;
      if (v > bestLoot && (k.kind in WEAPONS || k.kind === 'armor')) {
        bestLoot = v;
        out.mx = (k.x - me.x) / Math.max(0.5, kd);
        out.my = (k.y - me.y) / Math.max(0.5, kd);
        out.use = kd < 1 && s.tick % 2 === 0;
      }
    }
  }
  // Passive: only shoots back, for a few seconds after being hit.
  let best = me.sinceCombat < 5 ? 24 : 0;
  for (const o of s.players) {
    if (o.id === 0 || !canSee(s, me, o)) continue;
    const od = Math.hypot(o.x - me.x, o.y - me.y);
    if (od < best && lineOfSight(s, me.x, me.y, o.x, o.y)) {
      best = od;
      out.aimX = o.x;
      out.aimY = o.y;
      out.fire = true;
    }
  }
  return out;
};

type Row = {
  buildings: number;
  inBuilding: number;
  landSpread: number;
  spread60: number;
  firstBvB: number;
  firstBvP: number;
  firstAny: number;
  length: number;
  zoneDeaths: number;
  placement: number;
  crowd: number;
  playerLife: number;
  attackers: number;
  firstAbs: number;
  kills: Record<string, number>;
  bots: Record<string, number>;
};

const rows: Row[] = [];
const modeTime: Record<string, number> = {};
for (let m = 0; m < matches; m++) {
  const seed = firstSeed + m * 7919;
  const s = createGame('hotfix', seed);
  const bots = s.players.map((p) => (p.id === 0 ? null : createBot(p.id, seed * 31 + p.id)));
  const personaOf = (id: number) => (bots[id] as unknown as { info?: () => { persona: { name: string } | null } }).info?.().persona?.name ?? 'bot';
  const lands: { x: number; y: number }[] = [];
  let playerLanded = -1;
  let playStart = -1;
  let spread60 = 0;
  let firstBvB = -1;
  let firstBvP = -1;
  let crowd = 0;
  const attackers = new Set<number>();
  let playerFirstShot = -1;
  for (let i = 0; i < 60 * 900 && s.phase !== 'over'; i++) {
    step(s, s.players.map((p) => (p.id === 0 ? passive(s) : bots[p.id]!(s))));
    const t = s.tick * DT;
    for (const e of s.events) {
      if (e.type === 'land' && e.player !== 0) lands.push({ x: e.x, y: e.y });
      if (e.type === 'land' && e.player === 0) playerLanded = t;
      if (e.type === 'shot' && e.owner === 0 && playerFirstShot < 0) playerFirstShot = t;
      if (e.type === 'hit' && e.by !== null && e.by !== 0 && e.by !== e.target) {
        if (e.target === 0 && firstBvP < 0) firstBvP = t;
        if (e.target === 0) attackers.add(e.by);
        if (e.target !== 0 && firstBvB < 0) firstBvB = t;
      }
    }
    if (s.phase === 'play' && playStart < 0) playStart = t;
    if (s.tick % 30 === 0) for (const p of s.players) {
      const info = (bots[p.id] as unknown as { info?: () => { mode: string } } | null)?.info;
      if (p.alive && p.stage === 'ground' && info) modeTime[info().mode] = (modeTime[info().mode] ?? 0) + 1;
    }
    if (playStart >= 0 && spread60 === 0 && t >= playStart + 60) spread60 = meanPairwise(s.players.filter((p) => p.alive && p.id !== 0));
    if (playerLanded >= 0 && t < playerLanded + 60 && s.players[0].alive) {
      const me = s.players[0];
      crowd = Math.max(crowd, s.players.filter((p) => p.id !== 0 && p.alive && p.stage === 'ground' && Math.hypot(p.x - me.x, p.y - me.y) < 30).length);
    }
  }
  const kills: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const p of s.players) {
    if (p.id === 0) continue;
    const k = personaOf(p.id);
    kills[k] = (kills[k] ?? 0) + p.kills;
    count[k] = (count[k] ?? 0) + 1;
  }
  if (process.env.VERBOSE) {
    const me = s.players[0];
    const k = me.killedBy;
    console.log(`seed ${seed}: player first shot ${(playerFirstShot - playerLanded).toFixed(1)} s, first hit on it ${(firstBvP - playerLanded).toFixed(1)} s, placed ${me.placement}, killed by ${k === null ? me.killedWith : `${personaOf(k)} (${s.players[k].weapon})`}, player hits ${me.hits}/${me.shots}, damage ${me.damage.toFixed(0)}, weapon ${me.weapon}, armor ${me.armor}`);
  }
  const blds = lands.map((l) => buildingAt(l.x, l.y));
  rows.push({
    buildings: new Set(blds.filter((b) => b >= 0)).size,
    inBuilding: blds.filter((b) => b >= 0).length,
    landSpread: meanPairwise(lands),
    spread60,
    firstBvB: firstBvB < 0 ? NaN : firstBvB - playerLanded,
    firstBvP: firstBvP < 0 ? NaN : firstBvP - playerLanded,
    firstAny: Math.min(...[firstBvB, firstBvP].filter((v) => v >= 0)) - playerLanded,
    length: s.tick * DT,
    zoneDeaths: s.players.filter((p) => p.id !== 0 && !p.alive && p.killedWith === 'zone').length,
    placement: s.players[0].placement,
    playerLife: (s.players[0].alive ? s.tick : s.players[0].diedAt) * DT - playerLanded,
    attackers: attackers.size,
    firstAbs: Math.min(...[firstBvB, firstBvP].filter((v) => v >= 0)),
    crowd,
    kills,
    bots: count,
  });
}

const avg = (f: (r: Row) => number) => {
  const v = rows.map(f).filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};
const med = (f: (r: Row) => number) => {
  const v = rows.map(f).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const f1 = (n: number) => n.toFixed(1);
console.log(`${rows.length} matches`);
console.log(`landing: distinct buildings ${f1(avg((r) => r.buildings))} / 9 bots (min ${Math.min(...rows.map((r) => r.buildings))}), in/next to a building ${f1(avg((r) => r.inBuilding))}, mean pairwise distance ${f1(avg((r) => r.landSpread))} m`);
console.log(`spread 60 s after everyone landed: mean pairwise distance ${f1(avg((r) => r.spread60))} m`);
console.log(`first fight after the player lands (s): any avg ${f1(avg((r) => r.firstAny))} / median ${f1(med((r) => r.firstAny))}; bot-vs-bot avg ${f1(avg((r) => r.firstBvB))} median ${f1(med((r) => r.firstBvB))}; bot-vs-player avg ${f1(avg((r) => r.firstBvP))} median ${f1(med((r) => r.firstBvP))} (never in ${rows.filter((r) => !Number.isFinite(r.firstBvP)).length})`);
console.log(`first fight after Play is pressed (s): avg ${f1(avg((r) => r.firstAbs))}`);
console.log(`match length (from Play): avg ${f1(avg((r) => r.length))} s, min ${f1(Math.min(...rows.map((r) => r.length)))}, max ${f1(Math.max(...rows.map((r) => r.length)))}`);
console.log(`bots killed by the Deadline: ${f1(avg((r) => r.zoneDeaths))} per match`);
console.log(`passive player: avg placement ${f1(avg((r) => r.placement))}, survives ${f1(avg((r) => r.playerLife))} s after landing (median ${f1(med((r) => r.playerLife))}), shot at by ${f1(avg((r) => r.attackers))} different bots, won ${rows.filter((r) => r.placement === 1).length}, most bots within 30 m in first 60 s: avg ${f1(avg((r) => r.crowd))}, max ${Math.max(...rows.map((r) => r.crowd))}`);
const totals: Record<string, [number, number]> = {};
for (const r of rows) for (const k of Object.keys(r.bots)) {
  totals[k] = totals[k] ?? [0, 0];
  totals[k][0] += r.kills[k];
  totals[k][1] += r.bots[k];
}
console.log('kills per bot by personality: ' + Object.entries(totals).map(([k, [kills, n]]) => `${k} ${(kills / n).toFixed(2)} (${n} bots)`).join(', '));
const modeTotal = Object.values(modeTime).reduce((a, b) => a + b, 0);
if (modeTotal) console.log('bot time on the ground by state: ' + Object.entries(modeTime).map(([k, v]) => `${k} ${((v / modeTotal) * 100).toFixed(0)}%`).join(', '));
