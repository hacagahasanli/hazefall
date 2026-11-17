/**
 * Every sound is synthesised with WebAudio at runtime: no audio files, nothing to license.
 * Built to the `web-game-audio` skill:
 * - the context starts on the first key press (autoplay policy);
 * - voices -> category bus (sfx, ui, ambience) -> master -> compressor, plus a room reverb send;
 * - gunshots are layered: crack (high-passed noise), body (band-passed noise), thump (falling sine);
 * - every voice gets random detune and gain, and a stereo pan from its world x;
 * - rapid fire has a voice budget; mute is remembered.
 * No ambience bed: a noise loop read as old-TV static, so the room stays quiet between fights.
 */

export type Sfx = ReturnType<typeof createSfx>;

type Gun = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi' | 'bomb';
type Bus = 'sfx' | 'ui' | 'amb';

const MUTE_KEY = 'merge-conflict:muted';
/** Half the visible width of the arena, for turning world x into stereo pan. */
const HALF_VIEW = 19.5;
/** At most this many gunshot voices at once; extras are skipped. */
const SHOT_BUDGET = 6;

const readMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

export const createSfx = () => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let wet: GainNode | null = null;
  const buses: Partial<Record<Bus, GainNode>> = {};
  let noiseBuf: AudioBuffer | null = null;
  let muted = typeof window !== 'undefined' ? readMuted() : false;
  let shotVoices = 0;

  const MASTER = 0.75;

  /** A small-office impulse response: 0.9 s of decaying noise. */
  const makeRoom = (c: AudioContext) => {
    const len = Math.floor(c.sampleRate * 0.9);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return ir;
  };

  const ensure = () => {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    comp.connect(master).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = makeRoom(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(comp);
    for (const [bus, level] of [['sfx', 1], ['ui', 0.7], ['amb', 0.5]] as const) {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(comp);
      buses[bus] = g;
    }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  interface VoiceOpts {
    delay?: number;
    room?: number;
    pan?: number;
    bus?: Bus;
  }

  /** Route a voice through a panner to its bus, and scaled to the room. */
  const out = (node: AudioNode, { room = 1, pan = 0, bus = 'sfx' }: VoiceOpts) => {
    if (!ctx || !wet) return;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    node.connect(p).connect(buses[bus]!);
    if (room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      p.connect(send).connect(wet);
    }
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  /** Random detune (about ±70 cents) and gain (±10 %) so repeats never sound identical. */
  const vary = () => ({ pitch: Math.pow(2, ((Math.random() - 0.5) * 140) / 1200), gain: 0.9 + Math.random() * 0.2 });

  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, o: VoiceOpts = {}) => {
    const c = ctx;
    if (!c || muted) return;
    const { pitch, gain } = vary();
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
    env(g, t, vol * gain, 0.002, dur);
    osc.connect(g);
    out(g, { room: 0.6, ...o });
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };

  const noise = (filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, o: VoiceOpts = {}) => {
    const c = ctx;
    if (!c || !noiseBuf || muted) return;
    const { pitch, gain } = vary();
    const t = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = pitch;
    const bf = c.createBiquadFilter();
    bf.type = filter;
    bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t);
    bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    env(g, t, vol * gain, 0.0015, dur);
    src.connect(bf).connect(g);
    out(g, o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  };

  /** A mechanical click: slide, pump, magazine. */
  const click = (delay: number, pitch = 3500, vol = 0.25, pan = 0) => {
    noise('bandpass', pitch, pitch * 0.7, 0.025, vol, 6, { delay, room: 0.3, pan });
    tone('square', pitch * 0.3, pitch * 0.2, 0.015, vol * 0.3, { delay, room: 0.2, pan });
  };

  /** Big moments push the room tone down for a beat. */
  const duck = (db = -9, back = 0.6) => {
    const g = buses.amb;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.5 * Math.pow(10, db / 20), t, 0.01);
    g.gain.setTargetAtTime(0.5, t + 0.05, back / 3);
  };

  const panOf = (x?: number) => (x === undefined ? 0 : x / HALF_VIEW);

  const shot = (gun: Gun, x?: number) => {
    if (!ctx || muted) return;
    if (shotVoices >= SHOT_BUDGET) return;
    shotVoices += 1;
    setTimeout(() => (shotVoices = Math.max(0, shotVoices - 1)), 120);
    const pan = panOf(x);
    switch (gun) {
      case 'pistol':
        noise('highpass', 3500, 2000, 0.03, 0.9, 0.7, { pan }); // crack
        noise('bandpass', 1100, 500, 0.12, 0.7, 0.9, { pan }); // body
        tone('sine', 170, 48, 0.14, 0.9, { room: 0.4, pan }); // thump
        click(0.06, 4200, 0.12, pan); // slide
        break;
      case 'uzi':
        noise('highpass', 5000, 3200, 0.015, 0.45, 0.7, { pan });
        noise('bandpass', 1900, 1100, 0.04, 0.35, 1.2, { pan });
        tone('sine', 260, 110, 0.04, 0.35, { room: 0.2, pan });
        break;
      case 'bomb':
        // The throw: a short whoosh and the fuse hiss.
        noise('bandpass', 400, 1800, 0.25, 0.3, 1.4, { room: 0.2, pan });
        noise('highpass', 6000, 5000, 0.4, 0.06, 1, { delay: 0.05, room: 0, pan });
        break;
      case 'smg':
        noise('highpass', 4200, 2600, 0.02, 0.6, 0.7, { pan });
        noise('bandpass', 1500, 800, 0.06, 0.5, 1, { pan });
        tone('sine', 210, 70, 0.06, 0.55, { room: 0.3, pan });
        break;
      case 'shotgun':
        noise('highpass', 2600, 1200, 0.05, 1, 0.6, { pan });
        noise('lowpass', 2400, 180, 0.32, 1, 0.6, { pan });
        tone('sine', 110, 32, 0.3, 1.1, { room: 0.5, pan });
        click(0.38, 2200, 0.35, pan); // pump: chk
        click(0.5, 2800, 0.3, pan); //        -chk
        break;
      case 'railgun':
        tone('sawtooth', 2600, 140, 0.32, 0.35, { pan });
        tone('sine', 5200, 900, 0.22, 0.18, { pan });
        noise('highpass', 6000, 2500, 0.18, 0.45, 0.8, { pan });
        tone('sine', 90, 30, 0.35, 0.9, { room: 0.6, pan });
        break;
      case 'launcher':
        tone('sine', 140, 40, 0.25, 0.9, { room: 0.5, pan });
        noise('lowpass', 1600, 300, 0.15, 0.6, 0.7, { pan });
        noise('bandpass', 500, 2600, 0.5, 0.25, 1.4, { delay: 0.05, pan }); // rocket hiss leaving
        break;
    }
  };

  return {
    unlock: () => ensure(),
    get muted() {
      return muted;
    },
    toggleMute: () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return muted;
    },
    hit: (power: number, x?: number) => {
      const p = Math.min(1, power / 20);
      const pan = panOf(x);
      tone('sine', 140 + p * 40, 45, 0.12 + p * 0.1, 0.6 + p * 0.3, { room: 0.3, pan });
      noise('lowpass', 2200, 300, 0.07 + p * 0.08, 0.5 + p * 0.3, 1, { room: 0.3, pan });
    },
    shot,
    explosion: (x?: number) => {
      const pan = panOf(x);
      duck(-12, 0.9);
      tone('sine', 75, 22, 0.9, 1.2, { room: 0.8, pan });
      noise('lowpass', 2600, 60, 1.0, 1.1, 0.5, { pan });
      noise('highpass', 3000, 1500, 0.08, 0.6, 0.7, { pan });
      for (let i = 0; i < 6; i++) {
        noise('bandpass', 1500 + Math.random() * 2500, 600, 0.04, 0.2, 4, { delay: 0.08 + Math.random() * 0.4, room: 0.6, pan: pan + (Math.random() - 0.5) * 0.4 });
      }
    },
    impact: (x?: number) => noise('bandpass', 4500, 2500, 0.03, 0.12, 3, { room: 0.4, pan: panOf(x) }),
    land: (x?: number) => {
      tone('sine', 90, 50, 0.08, 0.35, { room: 0.2, pan: panOf(x) });
      noise('lowpass', 600, 200, 0.06, 0.2, 1, { room: 0.2, pan: panOf(x) });
    },
    reload: () => {
      click(0, 3000, 0.25);
      click(0.18, 2200, 0.3);
    },
    deflect: (x?: number) => tone('triangle', 1600, 2600, 0.12, 0.2, { pan: panOf(x) }),
    empty: () => click(0, 4000, 0.2),
    push: (x?: number) => {
      tone('sawtooth', 120, 55, 0.3, 0.3, { pan: panOf(x) });
      noise('lowpass', 1400, 200, 0.3, 0.5, 1, { pan: panOf(x) });
    },
    glass: (x?: number) => {
      duck(-8, 0.6);
      noise('highpass', 6000, 3000, 0.4, 0.55, 1, { pan: panOf(x) });
      for (let i = 0; i < 6; i++) tone('sine', 2200 + Math.random() * 3200, 1600 + Math.random() * 2000, 0.3, 0.07, { delay: Math.random() * 0.15, pan: panOf(x) });
    },
    jump: (x?: number) => tone('sine', 300, 520, 0.08, 0.1, { room: 0, pan: panOf(x) }),
    dash: (x?: number) => noise('bandpass', 700, 2800, 0.13, 0.22, 1.2, { room: 0.2, pan: panOf(x) }),
    pickup: () => {
      click(0, 2600, 0.3);
      tone('triangle', 520, 780, 0.08, 0.12, { delay: 0.05, room: 0.2, bus: 'ui' });
    },
    drop: (x?: number) => {
      tone('triangle', 880, 440, 0.15, 0.12, { pan: panOf(x), bus: 'ui' });
      tone('triangle', 660, 330, 0.2, 0.08, { delay: 0.1, pan: panOf(x), bus: 'ui' });
    },
    ko: (x?: number) => {
      duck(-14, 1.2);
      tone('sawtooth', 420, 50, 0.7, 0.3, { pan: panOf(x) });
      noise('lowpass', 3000, 100, 0.6, 0.5, 1, { pan: panOf(x) });
    },
    start: () => {
      tone('square', 440, 440, 0.12, 0.12, { room: 0.3, bus: 'ui' });
      tone('square', 880, 880, 0.25, 0.15, { delay: 0.14, room: 0.3, bus: 'ui' });
    },
  };
};
