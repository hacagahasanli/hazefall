/**
 * Headless bot report: plays N full matches (PLAYERS - 1 bots and one passive stand-in for the player)
 * and prints how the bots spread, when the first fights happen, how long rounds last and who
 * wins, plus the pacing numbers: match length percentiles, how many are alive each minute, fights per minute in each
 * stage, dead air (20 s stretches after the first minute of ground play in which nobody damages anybody) and Deadline
 * deaths. Run: npx tsx scripts/bot-sim.ts [matches=20] [firstSeed=1]
 *
 * Definitions: times "from Play" count from the moment the match starts (the drone takes off); "ground time" counts from
 * the moment the last player lands (when the Deadline starts). A fight is a run of hits between the same two players with
 * gaps under 6 s; stages are ground time 0-2 min (early), 2-5 min (mid) and 5 min on (late).
 */
import { createBot } from '../src/game/sim/bot';
import { loadoutScore, lootValue } from '../src/game/sim/bot-params';
import { BUILDINGS, DT, PLAYERS, TILE, WEAPONS } from '../src/game/sim/constants';
import { canSee, createGame, lineOfSight, step } from '../src/game/sim/step';
import { NO_INPUT } from '../src/game/sim/types';

import type { GameState, Input, Player } from '../src/game/sim/types';

/** One number for how geared someone is: the gun pair, the vest's points (per 50) and the backpack. */
const gear = (p: Player) => loadoutScore({ weapon: p.weapon, rarity: p.rarity, mag: p.mag, ammo: p.ammo }, p.holster) + p.armor / 50 + p.pack * 0.3;

const matches = Number(process.argv[2] ?? 20);
const firstSeed = Number(process.argv[3] ?? 1);

const buildingAt = (x: number, y: number) =>
  BUILDINGS.findIndex((b) => x > b.x0 * TILE - 4 && x < (b.x0 + b.w) * TILE + 4 && y > b.y0 * TILE - 4 && y < (b.y0 + b.h) * TILE + 4);

/** Per landing, the distance to the nearest other bot's landing (m). */
const nearestOther = (pts: { x: number; y: number }[]) =>
  pts.map((a, i) => Math.min(...pts.filter((_, j) => j !== i).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));

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
      const v = k.active && kd < 20 ? lootValue(k, me) / (1 + kd / 10) : 0;
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

const FIGHT_GAP = 6;
const DEAD_WINDOW = 20;
const STAGES = [
  { name: 'early 0-2', from: 0, to: 120 },
  { name: 'mid 2-5', from: 120, to: 300 },
  { name: 'late 5+', from: 300, to: Infinity },
];
const MINUTES = 12;

type Row = {
  buildings: number;
  inBuilding: number;
  landSpread: number;
  /** Median distance from a bot's landing to the nearest other bot's, and pairs of bots landing within 10 m. */
  landNearest: number;
  landClose: number;
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
  /** Ground time when the Deadline starts, from Play. */
  playStart: number;
  /** Players alive at each whole minute from Play (1..MINUTES); a finished match counts its winner. */
  alive: number[];
  /** Ground time of every fight's first hit. */
  fights: number[];
  ground: number;
  deadWindows: number;
  windows: number;
  /** Deadline phase the match ended in, and how often the lull breaker cut a wait short. */
  endPhase: number;
  lulls: number;
  /** Gun, vest and backpack pickups per bot alive at 3:00 from Play (by then), and all pickups. */
  gearBy3: number;
  allBy3: number;
  heals: number;
  swaps: number;
  /** KOs between two players where the less-geared one won, and all such KOs. */
  upsets: number;
  duels: number;
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
  const alive: number[] = [];
  const fightLast = new Map<number, number>();
  const fightStarts: number[] = [];
  const damageAt: number[] = [];
  let lulls = 0;
  const gearPicks = new Array(s.players.length).fill(0);
  const allPicks = new Array(s.players.length).fill(0);
  let survivors3: number[] | null = null;
  let heals = 0;
  let swaps = 0;
  let upsets = 0;
  let duels = 0;
  const gearAt = new Map<number, number>();
  for (let i = 0; i < 60 * 900 && s.phase !== 'over'; i++) {
    const zBefore = { state: s.zone.state, phase: s.zone.phase, timer: s.zone.timer };
    for (const p of s.players) gearAt.set(p.id, gear(p));
    step(s, s.players.map((p) => (p.id === 0 ? passive(s) : bots[p.id]!(s))));
    const t = s.tick * DT;
    if (survivors3 === null && t >= 180) survivors3 = s.players.filter((p) => p.alive && p.bot).map((p) => p.id);
    for (const e of s.events) {
      if (e.type === 'pickup' && t < 180) {
        allPicks[e.player] += 1;
        if (e.kind in WEAPONS || e.kind === 'armor' || e.kind === 'backpack') gearPicks[e.player] += 1;
      }
      if (e.type === 'heal' && e.done) heals += 1;
      if (e.type === 'swap') swaps += 1;
      if (e.type === 'ko' && e.by !== null && e.by !== e.victim) {
        const gk = gearAt.get(e.by)!;
        const gv = gearAt.get(e.victim)!;
        if (Math.abs(gk - gv) >= 0.5) {
          duels += 1;
          if (gk < gv) upsets += 1;
        }
      }
    }
    if (s.zone.state === 'wait' && zBefore.state === 'wait' && zBefore.phase === s.zone.phase && zBefore.timer - s.zone.timer > DT * 2) lulls += 1;
    if (s.tick % 3600 === 0) alive[s.tick / 3600 - 1] = s.players.filter((p) => p.alive).length;
    for (const e of s.events) {
      if (e.type === 'hit' && e.by !== null && e.by !== e.target) {
        damageAt.push(t);
        const key = Math.min(e.by, e.target) * 100 + Math.max(e.by, e.target);
        const lastHit = fightLast.get(key);
        if (lastHit === undefined || t - lastHit > FIGHT_GAP) fightStarts.push(t);
        fightLast.set(key, t);
      }
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
  const end = s.tick * DT;
  for (let k = 0; k < MINUTES; k++) alive[k] ??= (k + 1) * 60 > end ? s.players.filter((p) => p.alive).length : 0;
  // Dead air: whole 20 s windows of ground time after the first minute with no player-on-player damage.
  let windows = 0;
  let deadWindows = 0;
  for (let w = playStart + 60; w + DEAD_WINDOW <= end; w += DEAD_WINDOW) {
    windows += 1;
    if (!damageAt.some((d) => d >= w && d < w + DEAD_WINDOW)) deadWindows += 1;
  }
  rows.push({
    buildings: new Set(blds.filter((b) => b >= 0)).size,
    inBuilding: blds.filter((b) => b >= 0).length,
    landSpread: meanPairwise(lands),
    landNearest: (() => {
      const v = nearestOther(lands).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    })(),
    landClose: nearestOther(lands).filter((d) => d < 10).length / 2,
    spread60,
    firstBvB: firstBvB < 0 ? NaN : firstBvB - playerLanded,
    firstBvP: firstBvP < 0 ? NaN : firstBvP - playerLanded,
    firstAny: Math.min(...[firstBvB, firstBvP].filter((v) => v >= 0)) - playerLanded,
    length: s.tick * DT,
    zoneDeaths: s.players.filter((p) => !p.alive && p.killedWith === 'zone').length,
    placement: s.players[0].placement,
    playerLife: (s.players[0].alive ? s.tick : s.players[0].diedAt) * DT - playerLanded,
    attackers: attackers.size,
    firstAbs: Math.min(...[firstBvB, firstBvP].filter((v) => v >= 0)),
    crowd,
    kills,
    bots: count,
    playStart,
    alive,
    fights: fightStarts.map((f) => f - playStart),
    ground: end - playStart,
    deadWindows,
    windows,
    endPhase: s.zone.phase,
    lulls,
    gearBy3: survivors3 && survivors3.length ? survivors3.reduce((a, id) => a + gearPicks[id], 0) / survivors3.length : NaN,
    allBy3: survivors3 && survivors3.length ? survivors3.reduce((a, id) => a + allPicks[id], 0) / survivors3.length : NaN,
    heals,
    swaps,
    upsets,
    duels,
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
console.log(`landing: distinct buildings ${f1(avg((r) => r.buildings))} / ${PLAYERS - 1} bots (min ${Math.min(...rows.map((r) => r.buildings))}), in/next to a building ${f1(avg((r) => r.inBuilding))}, mean pairwise distance ${f1(avg((r) => r.landSpread))} m, nearest other bot median ${f1(avg((r) => r.landNearest))} m, bots landing within 10 m of another ${f1(avg((r) => r.landClose * 2))}`);
console.log(`spread 60 s after everyone landed: mean pairwise distance ${f1(avg((r) => r.spread60))} m`);
console.log(`first fight after the player lands (s): any avg ${f1(avg((r) => r.firstAny))} / median ${f1(med((r) => r.firstAny))}; bot-vs-bot avg ${f1(avg((r) => r.firstBvB))} median ${f1(med((r) => r.firstBvB))}; bot-vs-player avg ${f1(avg((r) => r.firstBvP))} median ${f1(med((r) => r.firstBvP))} (never in ${rows.filter((r) => !Number.isFinite(r.firstBvP)).length})`);
console.log(`first fight after Play is pressed (s): avg ${f1(avg((r) => r.firstAbs))}`);
console.log(`match length (from Play): avg ${f1(avg((r) => r.length))} s, min ${f1(Math.min(...rows.map((r) => r.length)))}, max ${f1(Math.max(...rows.map((r) => r.length)))}`);
console.log(`killed by the Deadline (bots and stand-in): ${f1(avg((r) => r.zoneDeaths))} per match, max ${Math.max(...rows.map((r) => r.zoneDeaths))}`);
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

// ---------- pacing
const pct = (v: number[], q: number) => {
  const sorted = [...v].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const lengths = rows.map((r) => r.length);
console.log('');
console.log('pacing');
console.log(`match length from Play: p10 ${mmss(pct(lengths, 0.1))}, median ${mmss(pct(lengths, 0.5))}, p90 ${mmss(pct(lengths, 0.9))} (avg ${mmss(avg((r) => r.length))}, min ${mmss(Math.min(...lengths))}, max ${mmss(Math.max(...lengths))}); Deadline starts ${f1(avg((r) => r.playStart))} s after Play`);
const buckets = [90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480, Infinity];
console.log(`length histogram (from Play): ${buckets.map((b, i) => {
  const lo = i ? buckets[i - 1] : 0;
  const n = lengths.filter((l) => l >= lo && l < b).length;
  return n ? `${mmss(lo)}-${b === Infinity ? '' : mmss(b)} ${n}` : '';
}).filter(Boolean).join(' | ')}`);
console.log(`alive at each minute from Play (avg): ${Array.from({ length: MINUTES }, (_, k) => k).filter((k) => rows.some((r) => r.length > k * 60)).map((k) => `${k + 1}:00 ${f1(avg((r) => r.alive[k]))}`).join(', ')}`);
console.log(`first fight: ${f1(avg((r) => r.firstAny))} s after the stand-in lands (median ${f1(med((r) => r.firstAny))}, p90 ${f1(pct(rows.map((r) => r.firstAny).filter(Number.isFinite), 0.9))})`);
console.log(`fights per minute of ground time: ${STAGES.map((st) => {
  let fights = 0;
  let minutes = 0;
  for (const r of rows) {
    minutes += Math.max(0, Math.min(r.ground, st.to) - st.from) / 60;
    fights += r.fights.filter((f) => f >= st.from && f < st.to).length;
  }
  return `${st.name} ${minutes ? (fights / minutes).toFixed(2) : '-'} (${f1(minutes)} min)`;
}).join(', ')}`);
const windows = rows.reduce((a, r) => a + r.windows, 0);
const dead = rows.reduce((a, r) => a + r.deadWindows, 0);
console.log(`dead air after the first ground minute: ${windows ? ((dead / windows) * 100).toFixed(1) : '-'}% of ${windows} 20 s windows (matches with any: ${rows.filter((r) => r.deadWindows > 0).length})`);
const phases: Record<number, number> = {};
for (const r of rows) phases[r.endPhase] = (phases[r.endPhase] ?? 0) + 1;
console.log(`Deadline phase at the end: ${Object.entries(phases).map(([k, v]) => `${k}: ${v}`).join(', ')}; lull breaker fired ${f1(avg((r) => r.lulls))} times per match`);

console.log('');
console.log('progression');
const ups = rows.reduce((a, r) => a + r.upsets, 0);
const duels = rows.reduce((a, r) => a + r.duels, 0);
console.log(`per bot alive at 3:00 from Play: ${f1(avg((r) => r.gearBy3))} gun / vest / backpack pickups by then, ${f1(avg((r) => r.allBy3))} pickups of anything (matches with a bot alive at 3:00: ${rows.filter((r) => Number.isFinite(r.gearBy3)).length})`);
console.log(`heals used ${f1(avg((r) => r.heals))} per match, gun swaps ${f1(avg((r) => r.swaps))} per match`);
console.log(`KOs between unevenly geared players (gear gap >= 0.5) won by the less-geared one: ${duels ? ((ups / duels) * 100).toFixed(0) : '-'}% of ${duels}`);
