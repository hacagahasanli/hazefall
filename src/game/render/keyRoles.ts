/**
 * What the shoot / jump key (Space by default) does. Pure, so it is tested without a browser.
 *  - Wherever the mouse shoots (first person, over the shoulder, mouse aim in the high view), the key only jumps: the hop
 *    on the ground, the jump from the plane and the early canopy in the air. The left button shoots.
 *  - With auto-aim in the high view the mouse does not shoot, so the key is the trigger on the ground (as it always was)
 *    and jumps only in the air.
 *  - Touch: FIRE shoots on the ground and jumps in the air (no hop on a phone).
 */
export const shootJump = (o: { mouseShoots: boolean; ground: boolean; key: boolean; mouse: boolean; touchFire: boolean }) => {
  const fire = o.mouseShoots ? o.mouse || o.touchFire || (!o.ground && o.key) : o.key || o.touchFire;
  const jump = o.ground ? o.mouseShoots && o.key : o.key || o.touchFire;
  return { fire, jump };
};
