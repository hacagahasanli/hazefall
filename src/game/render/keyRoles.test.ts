import { describe, expect, it } from 'vitest';

import { shootJump } from './keyRoles';

const base = { ground: true, key: false, mouse: false, touchFire: false };

describe('the shoot key (J), the left button and the jump key (Space)', () => {
  it('the shoot key and the left button shoot on the ground and never hop', () => {
    expect(shootJump({ ...base, key: true })).toEqual({ fire: true, jump: false });
    expect(shootJump({ ...base, mouse: true })).toEqual({ fire: true, jump: false });
  });

  it('the jump key (Space, or JUMP on touch) jumps on foot and in the air, and never fires', () => {
    for (const ground of [true, false]) expect(shootJump({ ...base, ground, jumpKey: true })).toEqual({ fire: false, jump: true });
  });

  it('shooting and jumping at once both happen', () => {
    expect(shootJump({ ...base, key: true, jumpKey: true })).toEqual({ fire: true, jump: true });
    expect(shootJump({ ...base, mouse: true, jumpKey: true })).toEqual({ fire: true, jump: true });
  });

  it('in the air the shoot key and touch FIRE also jump from the plane and pull the canopy; the left button does not', () => {
    expect(shootJump({ ...base, ground: false, key: true }).jump).toBe(true);
    expect(shootJump({ ...base, ground: false, touchFire: true }).jump).toBe(true);
    expect(shootJump({ ...base, ground: false, mouse: true }).jump).toBe(false);
  });

  it('touch FIRE shoots on the ground, with no hop', () => {
    expect(shootJump({ ...base, touchFire: true })).toEqual({ fire: true, jump: false });
  });
});
