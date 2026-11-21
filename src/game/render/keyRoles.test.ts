import { describe, expect, it } from 'vitest';

import { shootJump } from './keyRoles';

const base = { ground: true, key: false, mouse: false, touchFire: false };

describe('the shoot / jump key (Space)', () => {
  it('only jumps where the mouse shoots (first person, over the shoulder, mouse aim): never fires on the ground', () => {
    expect(shootJump({ ...base, mouseShoots: true, key: true })).toEqual({ fire: false, jump: true });
    expect(shootJump({ ...base, mouseShoots: true, mouse: true })).toEqual({ fire: true, jump: false });
  });

  it('still jumps from the plane and pulls the canopy in the air', () => {
    expect(shootJump({ ...base, ground: false, mouseShoots: true, key: true }).jump).toBe(true);
    expect(shootJump({ ...base, ground: false, mouseShoots: false, key: true }).jump).toBe(true);
    expect(shootJump({ ...base, ground: false, mouseShoots: false, touchFire: true }).jump).toBe(true);
  });

  it('stays the trigger with auto-aim (the mouse does not shoot there) and then never hops', () => {
    expect(shootJump({ ...base, mouseShoots: false, key: true })).toEqual({ fire: true, jump: false });
    expect(shootJump({ ...base, mouseShoots: false, mouse: true })).toEqual({ fire: false, jump: false });
  });

  it('touch FIRE shoots on the ground, with no hop', () => {
    expect(shootJump({ ...base, mouseShoots: false, touchFire: true })).toEqual({ fire: true, jump: false });
  });

  it('the jump key (B, or JUMP on touch) jumps in every view, on foot and in the air, and never fires', () => {
    for (const mouseShoots of [true, false]) {
      for (const ground of [true, false]) expect(shootJump({ ...base, mouseShoots, ground, jumpKey: true })).toEqual({ fire: false, jump: true });
    }
    // With auto-aim, Space still fires while B jumps.
    expect(shootJump({ ...base, mouseShoots: false, key: true, jumpKey: true })).toEqual({ fire: true, jump: true });
  });
});
