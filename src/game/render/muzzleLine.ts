/**
 * The line a round flies, shared by the drawn gun and the sim: the sim fires from the muzzle (Input.muzzle, the drawn one)
 * straight through the crosshair's point, and the drawn gun points along that same line.
 */

/** A world point (three.js axes: x, y up, z = map y) relative to a body at `root` facing map angle `yaw`: [right, up, forward]. */
export const toBodyFrame = (p: { x: number; y: number; z: number }, root: { x: number; y: number; z: number }, yaw: number): [number, number, number] => {
  const dx = p.x - root.x;
  const dz = p.z - root.z;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [-dx * sn + dz * c, p.y - root.y, dx * c + dz * sn];
};

/**
 * Where the gun must point from muzzle `m` (map x, y and height h) to hit `aim`, for a body facing `yaw`: elevation and
 * bearing relative to the facing (radians, + up, + right). Under `near` metres it just points ahead.
 */
export const gunAim = (m: { x: number; y: number; h: number }, aim: { x: number; y: number; h: number }, yaw: number, near = 1.5) => {
  const dx = aim.x - m.x;
  const dy = aim.y - m.y;
  const d = Math.hypot(dx, dy);
  if (d <= near) return { pitch: 0, yaw: 0 };
  const turn = Math.atan2(dy, dx) - yaw;
  return { pitch: Math.atan2(aim.h - m.h, d), yaw: Math.atan2(Math.sin(turn), Math.cos(turn)) };
};
