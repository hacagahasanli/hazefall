/**
 * The menu's sound: a short soft tick on focus and a brighter one on select, synthesised (no files). Silent until the
 * first key press or click (the browser's autoplay rule), when muted, and while the portal mutes the game.
 */
let ctx: AudioContext | null = null;
let level = 0.8;
let silent = false;

export const setUiSound = (volume: number, muted: boolean) => {
  level = volume;
  silent = muted;
};

export const uiTick = (strong = false) => {
  if (silent || level <= 0 || typeof window === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state !== 'running' && !navigator.userActivation?.hasBeenActive) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(strong ? 880 : 1320, t);
    o.frequency.exponentialRampToValueAtTime(strong ? 1320 : 1100, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((strong ? 0.09 : 0.04) * level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 0.12 : 0.06));
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.14);
  } catch {
    /* no audio: the menu works silently */
  }
};
