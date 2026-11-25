import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildRig, poseTopDown } from './characters';
import { buildGun } from './guns';
import { gunAim, toBodyFrame } from './muzzleLine';
import { LEAN, MAP, MUZZLE, TILE } from '../sim/constants';
import { createGame, hitPoint, muzzleOf, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import type { TopDownPose } from './characters';
import type { GunKind } from './guns';
import type { FighterId, Input, WeaponKind } from '../sim/types';

// Reis, 2026-11-25: (1) raising the aim did not raise the gun; (2) a round left the barrel, swerved right and only then flew
// straight. These tests drive the sim and the real rig the way game.ts does: the drawn muzzle goes to the sim (Input.muzzle),
// the gun is posed with the sim's muzzle-to-aim angles (gunAim), and the round must start at the barrel and run along it.

const FIGHTERS: FighterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const GUNS: Exclude<WeaponKind, 'fists' | 'rockets'>[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];
const MODEL: Record<string, GunKind> = { pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper' };

const openSpot = () => {
  const ty = MAP.findIndex((row) => row.includes('....'));
  return { x: MAP[ty].indexOf('....') * TILE + 4, y: ty * TILE + 1 };
};

interface Case { fighter: FighterId; gun: (typeof GUNS)[number]; lean: number; crouch: number; aim: { dx: number; dy: number; h: number } }

/** One shot, as the game makes it: returns the drawn muzzle and barrel (world), and the round's start and line. */
const shoot = (c: Case) => {
  const s = createGame(c.fighter, 1);
  const a = s.players[0];
  const o = openSpot();
  s.players.slice(1).forEach((p) => Object.assign(p, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
  s.drone.t = 1;
  // The body faces the aim (the sim turns it there with snap); the gun toes in from the right shoulder.
  const heading = Math.atan2(c.aim.dy, c.aim.dx);
  Object.assign(a, { stage: 'ground', x: o.x, y: o.y, z: 0, heading, lean: c.lean, crouch: c.crouch, cooldown: 0, weapon: c.gun, mag: 5, ammo: 0, rarity: 0 });
  const aim = { x: a.x + c.aim.dx, y: a.y + c.aim.dy, h: c.aim.h };
  const rig = buildRig(c.fighter);
  rig.root.position.set(a.x, 0, a.y);
  rig.root.rotation.y = Math.PI / 2 - heading;
  const gun = buildGun(MODEL[c.gun]);
  const muzzle = new THREE.Vector3();
  const barrel = new THREE.Vector3();
  let prev: Input = { ...NO_INPUT, aimX: aim.x, aimY: aim.y, aimH: aim.h };
  // A second to settle: each frame the gun is posed at the sim's line, and the drawn muzzle is sent back (as game.ts does).
  for (let i = 0; i < 60; i++) {
    const g = gunAim(muzzleOf(s, a, prev), aim, heading);
    poseTopDown(rig, { dt: 1 / 60, time: i / 60, vx: 0, vy: 0, yaw: heading, yawRate: 0, onGround: true, dashing: false, sinceShot: 9, gun: c.gun, reload: null, lean: c.lean, crouch: c.crouch, vault: null, roll: null, aimPitch: g.pitch, aimYaw: g.yaw } as TopDownPose);
    rig.root.updateMatrixWorld(true);
    rig.hand.getWorldPosition(gun.root.position);
    rig.hand.getWorldQuaternion(gun.root.quaternion);
    gun.root.updateMatrixWorld(true);
    gun.root.localToWorld(muzzle.set(0, 0.03, gun.length));
    barrel.set(0, 0, 1).applyQuaternion(gun.root.quaternion);
    prev = { ...prev, muzzle: toBodyFrame(muzzle, rig.root.position, heading) };
  }
  a.prev = prev;
  const inputs: Input[] = Array.from({ length: 10 }, () => ({ ...NO_INPUT }));
  inputs[0] = { ...prev, fire: true, snap: true, lean: c.lean, crouch: c.crouch > 0.5 };
  // The sim keeps the heading on the aim (snap) and fires this tick.
  a.heading = heading;
  const before = s.nextId;
  step(s, inputs);
  const shot = s.events.find((e) => e.type === 'shot');
  const pr = s.projectiles.find((p) => p.owner === 0 && p.id >= before);
  return { s, a, aim, muzzle, barrel, shot, pr };
};

describe('the round leaves the barrel you see and flies straight into the crosshair', () => {
  it('starts at the drawn muzzle: every fighter, every gun, lean L/R, crouched, aim up and down', () => {
    let worst = 0;
    let where = '';
    for (const fighter of FIGHTERS) for (const gun of GUNS) for (const lean of [-1, 0, 1]) for (const crouch of [0, 1]) {
      for (const aim of [{ dx: 25, dy: 10, h: 1.4 }, { dx: 8, dy: 4, h: 7 }, { dx: 12, dy: -3, h: 0 }]) {
        const r = shoot({ fighter, gun, lean, crouch, aim });
        expect(r.shot, `${fighter} ${gun}`).toBeDefined();
        const e = r.shot!.type === 'shot' ? r.shot! : null;
        // The start of the round's line (x, y and height) against the drawn muzzle (world: x, y up, z = map y).
        const d = Math.hypot(e!.x - r.muzzle.x, (e as { h?: number }).h! - r.muzzle.y, e!.y - r.muzzle.z);
        if (d > worst) [worst, where] = [d, `${fighter} ${gun} lean ${lean} crouch ${crouch} aim h ${aim.h}`];
      }
    }
    expect(worst, where).toBeLessThan(0.02);
  });

  it('runs from the muzzle through the crosshair point (no swerve): the line is straight and hits the aim height there', () => {
    for (const lean of [-1, 0, 1]) {
      const r = shoot({ fighter: 'hotfix', gun: 'rifle', lean, crouch: 0, aim: { dx: 20, dy: 6, h: 3.5 } });
      const pr = r.pr!;
      // Along the line at the aim point's distance the round is at the aim point's height...
      const k = Math.hypot(r.aim.x - pr.sx, r.aim.y - pr.sy) / pr.hd!;
      expect(pr.h0! + (pr.h1! - pr.h0!) * k).toBeCloseTo(3.5, 2);
      // ...and its bearing goes through the aim point (within the rifle's spread).
      const want = Math.atan2(r.aim.y - pr.sy, r.aim.x - pr.sx);
      expect(Math.abs(Math.atan2(pr.vy, pr.vx) - want)).toBeLessThanOrEqual(0.035 / 2 + 1e-9);
    }
  });

  it('the drawn barrel points at the crosshair point: raised at a roof, lowered at the street, leaning, crouched (bug 1)', () => {
    let worst = 0;
    let where = '';
    for (const fighter of FIGHTERS) for (const gun of GUNS) for (const lean of [-1, 0, 1]) for (const crouch of [0, 1]) {
      for (const aim of [{ dx: 10, dy: 0, h: 6 }, { dx: 6, dy: 3, h: 4 }, { dx: 15, dy: -4, h: 0 }, { dx: 30, dy: 2, h: 1.3 }]) {
        const r = shoot({ fighter, gun, lean, crouch, aim });
        const want = new THREE.Vector3(r.aim.x - r.muzzle.x, r.aim.h - r.muzzle.y, r.aim.y - r.muzzle.z).normalize();
        const err = r.barrel.angleTo(want);
        if (err > worst) [worst, where] = [err, `${fighter} ${gun} lean ${lean} crouch ${crouch} aim ${JSON.stringify(aim)}`];
      }
    }
    // The drawn rifle rests ~2.5 deg muzzle-down (its idle sway); allow 4 deg in all.
    expect(worst, where).toBeLessThan(0.07);
  });

  it('aiming up at a roof from the street raises the gun (it used to stay level: aimPitch was 0 off a roof)', () => {
    const level = shoot({ fighter: 'hotfix', gun: 'rifle', lean: 0, crouch: 0, aim: { dx: 10, dy: 0, h: 1.3 } });
    const up = shoot({ fighter: 'hotfix', gun: 'rifle', lean: 0, crouch: 0, aim: { dx: 10, dy: 0, h: 6 } });
    expect(Math.asin(up.barrel.y) - Math.asin(level.barrel.y)).toBeGreaterThan(0.35);
  });
});

describe('the sim never takes a muzzle on trust', () => {
  it('a muzzle sent far from the body is held to MUZZLE.reach of the modelled one; bots use the model', () => {
    const s = createGame('hotfix', 1);
    const a = s.players[0];
    const o = openSpot();
    Object.assign(a, { stage: 'ground', x: o.x, y: o.y, z: 0, heading: 0, lean: 0 });
    const model = muzzleOf(s, a);
    const far = muzzleOf(s, a, { ...NO_INPUT, muzzle: [9, 9, 9] });
    expect(Math.hypot(far.x - model.x, far.y - model.y, far.h - model.h)).toBeLessThan(MUZZLE.reach + 1e-6);
    a.bot = true;
    expect(muzzleOf(s, a, { ...NO_INPUT, muzzle: [0.5, 1.5, 1] })).toEqual(model);
  });

  it('a muzzle inside a wall is not used: the round leaves from the shoulder', () => {
    const s = createGame('hotfix', 1);
    const a = s.players[0];
    // A wall tile with open ground to its west; the shooter faces it from 0.9 m, so a 1 m muzzle would be in the wall.
    let spot: { x: number; y: number } | null = null;
    for (let y = 10; y < 110 && !spot; y++) for (let x = 10; x < 100 && !spot; x++) {
      if (MAP[y][x] === '#' && 'gpa.'.includes(MAP[y][x - 1]) && 'gpa.'.includes(MAP[y][x - 2])) spot = { x, y };
    }
    Object.assign(a, { stage: 'ground', x: spot!.x * TILE - 0.9, y: spot!.y * TILE + 1, z: 0, heading: 0, lean: 0 });
    const m = muzzleOf(s, a, { ...NO_INPUT, muzzle: [0.1, 1.3, 1.0] });
    const body = hitPoint(a);
    expect(m.x).toBeCloseTo(body.x, 6);
    expect(m.y).toBeCloseTo(body.y, 6);
  });
});

describe('lean: the sim body moves out as far as the drawn one (fair peeking)', () => {
  it('LEAN.offset * 0.7 sits between the drawn chest and head at a full lean, for every fighter', () => {
    const out = LEAN.offset * 0.7;
    for (const fighter of FIGHTERS) {
      const rig = buildRig(fighter);
      const at = (lean: number) => {
        for (let i = 0; i < 90; i++) poseTopDown(rig, { dt: 1 / 60, time: i / 60, vx: 0, vy: 0, yaw: 0, yawRate: 0, onGround: true, dashing: false, sinceShot: 9, gun: 'rifle', reload: null, lean, vault: null, roll: null } as TopDownPose);
        rig.root.updateMatrixWorld(true);
        return { head: rig.head.getWorldPosition(new THREE.Vector3()).x, chest: rig.upper.localToWorld(new THREE.Vector3(0, rig.chestY, 0)).x };
      };
      const rest = at(0);
      const lean = at(1);
      // The model's right is -x.
      const chest = -(lean.chest - rest.chest);
      const head = -(lean.head - rest.head);
      expect(out, fighter).toBeGreaterThan(chest - 0.08);
      expect(out, fighter).toBeLessThan(head + 0.08);
    }
  });
});
