/**
 * The menu's sound: a short soft tick on focus and a brighter one on select, synthesised (no files). Silent until the
 * first key press or click (the browser's autoplay rule), when muted, and while the portal mutes the game.
 */
import { BUDGET, createGate } from '~/game/audioBudget';

let ctx: AudioContext | null = null;
const gate = createGate(BUDGET);
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
    // A held arrow key repeats ~30 times a second: one tick per 45 ms (a select always ticks).
    if (!gate.allow('uiTick', ctx.currentTime * 1000) && !strong) return;
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

/** The shared context, running, or null (silent, muted, or before the first key press or click). */
const live = (): AudioContext | null => {
  if (silent || level <= 0 || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state !== 'running' && !navigator.userActivation?.hasBeenActive) return null;
    return ctx;
  } catch {
    return null;
  }
};

let noiseBuf: AudioBuffer | null = null;
const noise = (c: AudioContext) => {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
};

/**
 * A screen wipe going past: a short band of noise swept up through a filter (about 300 ms), quiet, a touch of pitch
 * variety each time. One at a time.
 */
export const uiWhoosh = () => {
  const c = live();
  if (!c || !gate.allow('uiWhoosh', c.currentTime * 1000)) return;
  try {
    const t = c.currentTime;
    const v = 0.9 + Math.random() * 0.2;
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350 * v, t);
    bp.frequency.exponentialRampToValueAtTime(2600 * v, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(900 * v, t + 0.32);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11 * level, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + 0.36);
  } catch {
    /* no audio */
  }
};

/**
 * An impact for the countdown and the round report: a low thump with a little click on top. `strength` 0..1 lifts its
 * pitch and level (3, 2, 1 climb; the last one and a win hit hardest).
 */
export const uiImpact = (strength = 0.5) => {
  const c = live();
  if (!c || !gate.allow('uiImpact', c.currentTime * 1000)) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 + 70 * strength, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((0.16 + 0.1 * strength) * level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.34);
    const n = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.05 * level * (0.6 + strength), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(ng).connect(c.destination);
    n.start(t);
    n.stop(t + 0.06);
  } catch {
    /* no audio */
  }
};

/**
 * The pre-match bed: wind over the airstrip and the cargo plane's engines idling, both synthesised. Kept about
 * -48 dBFS and dark (two low-pass poles, nothing above ~500 Hz) so it reads as a place, not as hiss. Returns a function
 * that fades it out. `rev()` spools the engines up for the launch. Silent under the same rules as the ticks.
 */
export const startHum = (): { stop: () => void; rev: () => void } => {
  const none = { stop: () => {}, rev: () => {} };
  if (silent || level <= 0 || typeof window === 'undefined') return none;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const c = ctx;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.5 * level, t + 1.2);
    out.connect(c.destination);
    // Wind: brown noise through a slowly wandering low-pass.
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 0.5;
    const lp2 = c.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 420;
    lp2.Q.value = 0.5;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain).connect(lp.frequency);
    const windGain = c.createGain();
    windGain.gain.value = 0.03;
    noise.connect(lp).connect(lp2).connect(windGain).connect(out);
    // Engines: two detuned saws, filtered to a distant drone with a slow beat.
    const engGain = c.createGain();
    engGain.gain.value = 0.02;
    const engLp = c.createBiquadFilter();
    engLp.type = 'lowpass';
    engLp.frequency.value = 260;
    const oscs = [62, 63.3].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(engLp);
      return o;
    });
    engLp.connect(engGain).connect(out);
    [noise, lfo, ...oscs].forEach((n) => n.start(t));
    let stopped = false;
    return {
      rev: () => {
        const n = c.currentTime;
        oscs.forEach((o, i) => o.frequency.linearRampToValueAtTime(i ? 118 : 116, n + 2.6));
        engLp.frequency.linearRampToValueAtTime(900, n + 2.6);
        engGain.gain.linearRampToValueAtTime(0.045, n + 2.6);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const n = c.currentTime;
        out.gain.cancelScheduledValues(n);
        out.gain.setValueAtTime(out.gain.value, n);
        out.gain.linearRampToValueAtTime(0, n + 0.5);
        [noise, lfo, ...oscs].forEach((s) => s.stop(n + 0.6));
      },
    };
  } catch {
    return none;
  }
};
