/** Landing with no loot within `radius` metres: the nearest gun is pointed out for `seconds` (a prompt with an arrow, a ring on the minimap). */
export const LOOT_HINT = { radius: 25, seconds: 4 };

/** The arrow glyph for a direction on the map (north up, east right: the top-down view's screen axes, map y growing downwards). */
export const arrowTo = (dx: number, dy: number) => {
  const a = Math.atan2(dy, dx); // 0 = east, +90 degrees = south
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  return arrows[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
};
