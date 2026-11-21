/**
 * What the shoot / jump key (Space by default) and the jump key (B by default, the touch JUMP button) do. Pure, so it is
 * tested without a browser. There is one jump on foot (the sim's, roof-aware); this only decides which keys ask for it.
 *  - Wherever the mouse shoots (first person, over the shoulder, mouse aim in the high view), Space only jumps: on foot,
 *    from the plane and the early canopy in the air. The left button shoots.
 *  - With auto-aim in the high view the mouse does not shoot, so Space is the trigger on the ground (as it always was)
 *    and jumps only in the air.
 *  - Touch: FIRE shoots on the ground and jumps in the air.
 *  - The jump key (and JUMP on touch) always jumps: on foot and in the air, in every view.
 */
export const shootJump = (o: { mouseShoots: boolean; ground: boolean; key: boolean; mouse: boolean; touchFire: boolean; jumpKey?: boolean }) => {
  const fire = o.mouseShoots ? o.mouse || o.touchFire || (!o.ground && o.key) : o.key || o.touchFire;
  const jump = (o.ground ? o.mouseShoots && o.key : o.key || o.touchFire) || !!o.jumpKey;
  return { fire, jump };
};
