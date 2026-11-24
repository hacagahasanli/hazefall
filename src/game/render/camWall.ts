/**
 * Shoulder camera off walls beside the lens (F-018 item 4b): the lens keeps `clearM` metres from a wall to its right or
 * left by easing its side offset (at `rate`), which stays between `minSide` (the crosshair still clears your head) and
 * `maxSide` (the sim's corner-shot limit). Pure: the caller passes the solid test, so it is tested.
 */
export const CAM_WALL = { clearM: 1.0, step: 0.1, rate: 6, minSide: 0.15, maxSide: 0.8 } as const;

/**
 * How far (m) the side offset should move for a lens at (x, z, h) looking along yaw (cos `c`, sin `sn`): + is to the
 * right, away from a wall on the left; - away from a wall on the right; 0 with both sides clear (or equally close).
 */
export const wallSideWant = (solid: (x: number, z: number, h: number) => boolean, x: number, z: number, h: number, c: number, sn: number) => {
  const clear = (dir: number) => {
    for (let d = CAM_WALL.step; d < CAM_WALL.clearM; d += CAM_WALL.step) if (solid(x - sn * d * dir, z + c * d * dir, h)) return d;
    return CAM_WALL.clearM;
  };
  return clear(1) - clear(-1);
};

/** The side offset actually used: the eased one plus the wall push, kept within the limits. */
export const clampSide = (s: number) => Math.max(CAM_WALL.minSide, Math.min(CAM_WALL.maxSide, s));
