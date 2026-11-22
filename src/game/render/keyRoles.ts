/**
 * What the shoot key (J by default, and the left mouse button) and the jump key (Space by default, the touch JUMP button)
 * do. Pure, so it is tested without a browser. There is one jump on foot (the sim's, roof-aware); this only decides which
 * keys ask for it.
 *  - The jump key always jumps, in every view: the hop on foot, out of the plane, the early canopy in the air.
 *  - The shoot key and the left button shoot in every view (auto-aim or mouse aim, first person, over the shoulder).
 *    In the air the shoot key also jumps (out of the plane, the canopy), as touch FIRE does.
 *  - Touch: FIRE shoots on the ground and jumps in the air; JUMP jumps.
 */
export const shootJump = (o: { ground: boolean; key: boolean; mouse: boolean; touchFire: boolean; jumpKey?: boolean }) => {
  const fire = o.key || o.mouse || o.touchFire;
  const jump = !!o.jumpKey || (!o.ground && (o.key || o.touchFire));
  return { fire, jump };
};
