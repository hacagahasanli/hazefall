/**
 * The whole cycle is shorter than the sniper's fire interval (1.5 rounds/s = 0.667 s): kick, settle, bolt dip, ready.
 * The sniper's kick: one curve of the time since the shot, shared by the rifle and arms (every fighter's model, bots too),
 * the first-person viewmodel and your own camera. It is a pure function of seconds since the shot, so it looks the same at
 * 30, 60 or 144 fps, needs no state and allocates nothing. Render only: the sim never reads it.
 *
 * Shape: a fast rise to 1 (ease-out sine, ATTACK), then an ease-out recovery back to exactly 0 (RECOVER).
 */
export const SNIPER_KICK = {
  /** Seconds from the shot to the peak. */
  attack: 0.06,
  /** Seconds from the peak back to rest (the rifle). */
  recover: 0.24,
  /** The same for your camera: back on aim about 0.3 s after the shot, so aiming is never blocked. */
  camRecover: 0.26,
  /** The bolt-action re-chamber: the rifle rolls and dips between these two times after the shot. */
  boltStart: 0.3,
  boltEnd: 0.64,
  /** The bolt dip at its middle: roll and muzzle drop (radians), rifle lowered and pulled back (metres). */
  boltRoll: 0.45,
  boltPitch: 0.12,
  boltDrop: 0.04,
  boltPull: 0.07,
  /** Rifle pitch at the peak, radians (the other guns kick about 0.1 to 0.2). */
  weaponPitch: 0.62,
  /** How far the rifle is driven back at the peak, metres. */
  weaponPush: 0.26,
  /** Over-the-shoulder camera pitch at the peak, radians (about 3.4 degrees). */
  camPitch: 0.06,
  /** The same through the scope (the lens is 30 degrees there, so the same angle would be a huge jump). */
  camPitchScoped: 0.034,
  /** Camera jitter at the peak, radians, scaled by the curve (the trauma shake on top of it). */
  camShake: 0.01,
  /** Reduced motion keeps a quarter of the kick and no shake. */
  reducedScale: 0.25,
} as const;

/** 0 before and after the kick, 1 at the peak. `since` is seconds since the sniper shot. */
export const sniperKick = (since: number, recover: number = SNIPER_KICK.recover): number => {
  if (!(since > 0) || since >= SNIPER_KICK.attack + recover) return 0;
  if (since < SNIPER_KICK.attack) return Math.sin((since / SNIPER_KICK.attack) * Math.PI * 0.5);
  const u = (since - SNIPER_KICK.attack) / recover;
  return (1 - u) * (1 - u);
};

/** The re-chamber bump: 0 outside boltStart..boltEnd, a smooth 0 to 1 to 0 inside it. */
export const sniperBolt = (since: number): number => {
  if (!(since > SNIPER_KICK.boltStart) || since >= SNIPER_KICK.boltEnd) return 0;
  return Math.sin(((since - SNIPER_KICK.boltStart) / (SNIPER_KICK.boltEnd - SNIPER_KICK.boltStart)) * Math.PI);
};
