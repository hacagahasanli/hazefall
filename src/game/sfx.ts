/**
 * Every sound is synthesised with WebAudio at runtime: no audio files, nothing to license.
 * Built to the `web-game-audio` skill:
 * - the context starts on the first key press (autoplay policy);
 * - voices -> category bus (sfx, ui, ambience) -> master -> compressor, plus a room reverb send;
 * - gunshots are layered: crack (high-passed noise), body (band-passed noise), thump (falling sine);
 * - every voice gets random detune and gain, and a stereo pan from its world x;
 * - rapid fire has a voice budget; mute is remembered;
 * - every other repeatable sound asks the budget gate (audioBudget.ts, docs/SOUND.md); a limiter sits after the master.
 * No ambience bed: a noise loop read as old-TV static, so the room stays quiet between fights.
 */
import { assetUrl } from '../lib/assets';

import { BUDGET, createGate } from './audioBudget';

import type { SoundName } from './audioBudget';

export type Sfx = ReturnType<typeof createSfx>;

type Gun = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi' | 'bomb';
type Bus = 'sfx' | 'ui' | 'amb' | 'guns';

const MUTE_KEY = 'merge-conflict:muted';
const VOLUME_KEY = 'lcs:volume';

export type VolumeKind = 'master' | 'guns' | 'steps';
export type Volumes = Record<VolumeKind, number>;
const DEFAULT_VOLUMES: Volumes = { master: 0.8, guns: 0.6, steps: 0.8 };

const readVolumes = (): Volumes => {
  try {
    const v = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? '{}') as Partial<Volumes>;
    return { ...DEFAULT_VOLUMES, ...v };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
};
/** Half the visible width of the arena, for turning world x into stereo pan. */
const HALF_VIEW = 19.5;
/** At most this many gunshot voices at once; extras are skipped. */
const SHOT_BUDGET = 5;
/** Level of the recorded gunshots against everything else (about -8 dB). */
const GUN_LEVEL = 0.4;

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
  /** Reasons the game is silenced on top of the player's own mute ('ad' while a video ad plays, 'portal' for the portal's mute). */
  const silenced = new Set<string>();
  const level = () => (muted || silenced.size ? 0 : MASTER * volumes.master);
  const volumes: Volumes = typeof window !== 'undefined' ? readVolumes() : { ...DEFAULT_VOLUMES };
  /** While a gun voice is being scheduled, everything it plays goes to the guns bus. */
  let busOverride: Bus | null = null;
  let shotVoices = 0;
  const gate = createGate(BUDGET);
  /** Over budget: the sound is dropped. */
  const may = (name: SoundName) => !!ctx && gate.allow(name, ctx.currentTime * 1000);
  /** The last hit-confirm tick (audio clock) and how strong it was, for its voice limit. */
  const lastTick = { at: -1, rank: 0 };
  /** Recorded sounds (see ASSETS.md), decoded once the audio context exists. */
  const samples = new Map<string, AudioBuffer>();
  const SAMPLE_NAMES = [
    'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'pump', 'bolt', 'reload', 'dryfire',
    'reload_pistol', 'reload_smg', 'reload_rifle', 'reload_sniper', 'reload_shotgun',
  ];
  const loadSamples = (c: AudioContext) => {
    for (const n of SAMPLE_NAMES) {
      fetch(assetUrl(`sounds/${n}.m4a`))
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((buf) => samples.set(n, buf))
        .catch(() => undefined);
    }
  };

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
    master.gain.value = level();
    // A fast limiter after the master: the compressor shapes the mix, this only catches a stray peak.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.1;
    comp.connect(master).connect(limit).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = makeRoom(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(comp);
    for (const [bus, level] of [['sfx', 1], ['ui', 0.7], ['amb', 0.5], ['guns', volumes.guns]] as const) {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(comp);
      buses[bus] = g;
    }
    loadSamples(ctx);
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
    node.connect(p).connect(buses[busOverride ?? bus]!);
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

  /** Play a recorded sound with a little pitch and level variation, panned and attenuated. */
  const sample = (
    name: string,
    o: { pan?: number; gain?: number; delay?: number; room?: number; bus?: Bus; lowpass?: number; echo?: number } = {},
  ) => {
    const c = ctx;
    const buf = samples.get(name);
    if (!c || !buf || muted) return false;
    const rate = 0.95 + Math.random() * 0.1;
    const play = (gain: number, delay: number, lowpass: number) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = gain;
      if (lowpass < 18000) {
        // Air eats the highs: far shots are duller.
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        src.connect(lp).connect(g);
      } else src.connect(g);
      out(g, { pan: o.pan ?? 0, room: o.room ?? 0.15, bus: o.bus });
      src.start(c.currentTime + delay);
    };
    const gain = (o.gain ?? 1) * (0.9 + Math.random() * 0.15);
    play(gain, o.delay ?? 0, o.lowpass ?? 20000);
    // Outdoors a shot comes back off the houses and the tree line: a dull, late slap.
    if (o.echo) play(gain * o.echo, (o.delay ?? 0) + 0.22 + Math.random() * 0.12, 1400);
    return true;
  };

  const panOf = (x?: number) => (x === undefined ? 0 : x / HALF_VIEW);

  const shot = (gun: Gun, x?: number) => {
    if (!ctx || muted) return;
    if (shotVoices >= SHOT_BUDGET) return;
    busOverride = 'guns';
    try {
      shotVoice(gun, x);
    } finally {
      busOverride = null;
    }
  };
  const shotVoice = (gun: Gun, x?: number) => {
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
    /** A recorded gunshot; falls back to synthesis until the files are loaded. */
    gunshot: (kind: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper', x = 0, distance = 0) => {
      if (shotVoices >= SHOT_BUDGET) return;
      // Recorded shots are mastered hot: play them well under the rest of the mix (Reis: "too loud").
      const gain = GUN_LEVEL * Math.max(0.12, 1 - distance / 45);
      const ok = sample(kind, {
        pan: panOf(x), gain, room: 0.1 + Math.min(0.5, distance / 60), bus: 'guns',
        lowpass: 18000 - Math.min(14500, distance * 260), echo: kind === 'sniper' || kind === 'shotgun' ? 0.3 : 0.2,
      });
      if (!ok) shot(kind === 'rifle' ? 'pistol' : kind === 'sniper' ? 'railgun' : kind, x);
      else {
        shotVoices += 1;
        setTimeout(() => (shotVoices = Math.max(0, shotVoices - 1)), 90);
      }
      if (kind === 'shotgun') sample('pump', { pan: panOf(x), gain: gain * 0.8, delay: 0.45, bus: 'guns' });
      if (kind === 'sniper') sample('bolt', { pan: panOf(x), gain: gain * 0.8, delay: 0.6, bus: 'guns' });
    },
    /** The reload of that gun (each has its own recording), panned and quieter with distance. */
    reloadAt: (weapon: string, x = 0, distance = 0) => {
      if (distance > 30 || !may('reload')) return;
      const o = { pan: panOf(x), gain: 0.7 * Math.max(0.15, 1 - distance / 30), bus: 'guns' as Bus };
      if (!sample(`reload_${weapon}`, o) && !sample('reload', o)) {
        click(0, 3000, 0.25, panOf(x));
        click(0.25, 2200, 0.3, panOf(x));
      }
    },
    /** The trigger on an empty gun. */
    dryFire: () => {
      if (!may('dryFire')) return;
      if (sample('dryfire', { gain: 0.6 })) return;
      click(0, 4200, 0.18);
      click(0.05, 2400, 0.12);
    },
    /**
     * One footstep. Surface decides the colour (grass is a soft brush, asphalt and floors a
     * click and a heel thud, bushes and crops a rustle); far steps are quieter and duller.
     */
    footstep: (surface: 'grass' | 'hard' | 'wood' | 'dirt' | 'leaves' | 'water', x = 0, distance = 0, heavy = 1, gear = false) => {
      if (!ctx || muted || distance > 28) return;
      // Your own steps always play; everyone else's share a small pool.
      if (distance > 0 && !may('step')) return;
      const v = volumes.steps * Math.max(0.08, 1 - distance / 28) * heavy;
      const pan = panOf(x);
      const dull = Math.max(0.35, 1 - distance / 30);
      const o = (delay = 0, room = 0.05) => ({ pan, room, delay });
      // Every step is a heel strike, then the rest of the foot ~40 ms later.
      const heel = 0;
      const toe = 0.035 + Math.random() * 0.015;
      switch (surface) {
        case 'grass':
          // Blades crushed: a soft, bright swish over a muffled thud.
          noise('bandpass', 3800 * dull, 2200, 0.09, 0.18 * v, 0.9, o(heel));
          noise('bandpass', 2600 * dull, 1500, 0.07, 0.12 * v, 1.2, o(toe));
          tone('sine', 95, 55, 0.05, 0.12 * v, o(heel, 0));
          break;
        case 'dirt':
          // Grit: a crunch of tiny grains, then the scuff.
          for (let i = 0; i < 5; i++) noise('bandpass', (2500 + Math.random() * 2500) * dull, 1800, 0.008, 0.12 * v, 4, o(heel + i * 0.009 + Math.random() * 0.006));
          noise('lowpass', 1400 * dull, 400, 0.06, 0.16 * v, 0.8, o(toe));
          tone('sine', 110, 60, 0.05, 0.14 * v, o(heel, 0));
          break;
        case 'hard':
          // Asphalt: a sharp heel click with a short scuff.
          noise('bandpass', 4200 * dull, 3000, 0.018, 0.28 * v, 3, o(heel, 0.12));
          tone('sine', 160, 80, 0.04, 0.16 * v, o(heel, 0));
          noise('highpass', 3000 * dull, 2500, 0.05, 0.1 * v, 0.7, o(toe));
          break;
        case 'wood':
          // Floorboards: a hollow knock with a little ring, then the toe.
          noise('bandpass', 700 * dull, 500, 0.07, 0.3 * v, 6, o(heel, 0.3));
          tone('triangle', 240, 170, 0.08, 0.12 * v, o(heel, 0.3));
          noise('bandpass', 1600 * dull, 1200, 0.03, 0.14 * v, 3, o(toe, 0.2));
          break;
        case 'water':
          // A swimming stroke: the hand slapping in, a gulp of water, a trickle off the arm.
          noise('bandpass', 1800 * dull, 900, 0.05, 0.22 * v, 1.4, o(heel, 0.15));
          noise('lowpass', 700 * dull, 300, 0.16, 0.2 * v, 0.7, o(0.02, 0.15));
          tone('sine', 420, 180, 0.07, 0.05 * v, o(0.05, 0.2));
          for (let i = 0; i < 4; i++) noise('bandpass', (3000 + Math.random() * 2500) * dull, 2000, 0.012, 0.05 * v, 5, o(0.12 + i * 0.04 + Math.random() * 0.03));
          break;
        case 'leaves':
          noise('highpass', 3500 * dull, 2500, 0.16, 0.24 * v, 0.6, o(heel));
          noise('bandpass', 1400, 900, 0.12, 0.14 * v, 1, o(toe));
          break;
      }
      // Kit on a running body: a faint rattle of the gun and gear every step.
      if (gear) noise('bandpass', 5200 * dull, 4200, 0.03, 0.05 * v, 5, o(heel + 0.02, 0));
    },
    /** Climbing over a fence or sill: cloth, a hand slap, the landing. */
    vault: (x = 0, distance = 0) => {
      if (distance > 28 || !may('vault')) return;
      const v = Math.max(0.1, 1 - distance / 28);
      const pan = panOf(x);
      noise('bandpass', 900, 2400, 0.18, 0.25 * v, 1, { pan, room: 0.1 });
      noise('bandpass', 2600, 1800, 0.03, 0.2 * v, 3, { pan, room: 0.1, delay: 0.1 });
      tone('sine', 110, 55, 0.08, 0.35 * v, { pan, room: 0.1, delay: 0.36 });
      noise('lowpass', 900, 200, 0.07, 0.25 * v, 1, { pan, room: 0.1, delay: 0.36 });
    },
    /** Dev meter: plays and drops per gated sound. */
    stats: () => gate.stats(),
    get volumes() {
      return { ...volumes };
    },
    /** Change a volume (0..1) now and remember it in this browser. */
    setVolume: (kind: VolumeKind, value: number) => {
      volumes[kind] = Math.max(0, Math.min(1, value));
      if (master) master.gain.value = level();
      if (buses.guns) buses.guns.gain.value = volumes.guns;
      try {
        window.localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
      } catch {
        /* storage unavailable */
      }
    },
    unlock: () => ensure(),
    /** Silence (or un-silence) everything for a reason, without touching the player's own mute or volumes. */
    setMuted: (reason: string, on: boolean) => {
      if (on) silenced.add(reason);
      else silenced.delete(reason);
      if (master) master.gain.value = level();
    },
    get muted() {
      return muted;
    },
    toggleMute: () => {
      muted = !muted;
      if (master) master.gain.value = level();
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return muted;
    },
    hit: (power: number, x?: number) => {
      if (!may('hit')) return;
      const p = Math.min(1, power / 20);
      const pan = panOf(x);
      tone('sine', 140 + p * 40, 45, 0.12 + p * 0.1, 0.6 + p * 0.3, { room: 0.3, pan });
      noise('lowpass', 2200, 300, 0.07 + p * 0.08, 0.5 + p * 0.3, 1, { room: 0.3, pan });
    },
    shot,
    explosion: (x?: number) => {
      if (!may('explosion')) return;
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
      if (!may('push')) return;
      tone('sawtooth', 120, 55, 0.3, 0.3, { pan: panOf(x) });
      noise('lowpass', 1400, 200, 0.3, 0.5, 1, { pan: panOf(x) });
    },
    glass: (x?: number) => {
      if (!may('glass')) return;
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
    /**
     * The hit confirm for a hit YOU land: a short, dry tick in the middle of the stereo field (not
     * placed in the world), so you know it connected even when the target is off to one side.
     * A plain hit ticks; a hit on armor rings a little higher and metallic; the hit that strips
     * the last of the armor jumps up in pitch with a small shatter. Rapid fire: one tick per
     * 45 ms at most (a stronger tick always gets through). Under every tick sits a dry body layer: a 2 ms crack and a
     * short low thump, so the hit lands with weight and not only a click.
     */
    hitTick: (kind: 'body' | 'armor' | 'break') => {
      const c = ctx;
      if (!c || muted) return;
      const rank = kind === 'break' ? 2 : kind === 'armor' ? 1 : 0;
      if (c.currentTime - lastTick.at < 0.045 && rank <= lastTick.rank) return;
      lastTick.at = c.currentTime;
      lastTick.rank = rank;
      const o = { room: 0, bus: 'ui' as Bus };
      noise('highpass', 3200, 2400, 0.012, 0.2, 0.7, o);
      tone('sine', 210, 62, 0.06, kind === 'body' ? 0.3 : 0.2, o);
      if (kind === 'body') {
        tone('triangle', 1900, 1500, 0.045, 0.22, o);
        noise('bandpass', 5200, 4200, 0.012, 0.14, 4, o);
      } else if (kind === 'armor') {
        tone('square', 2700, 2500, 0.04, 0.07, o);
        tone('sine', 4100, 3800, 0.06, 0.1, o);
        noise('highpass', 6500, 6000, 0.015, 0.1, 1, o);
      } else {
        tone('triangle', 2300, 3600, 0.07, 0.2, o);
        tone('sine', 3600, 5200, 0.09, 0.1, { ...o, delay: 0.035 });
        noise('highpass', 7000, 4500, 0.16, 0.22, 0.8, { ...o, room: 0.2 });
        for (let i = 0; i < 4; i++) tone('sine', 3800 + Math.random() * 2600, 3000, 0.07, 0.04, { ...o, delay: 0.02 + Math.random() * 0.08 });
      }
    },
    /**
     * You eliminated someone: a heavy low punch and a bright two-note rise, in the middle (not
     * placed in the world) and on the ui bus, so it reads over the gunfight.
     */
    elim: () => {
      const c = ctx;
      if (!c || muted) return;
      duck(-10, 0.8);
      const o = { room: 0.25, bus: 'ui' as Bus };
      // The crack that opens it: a bright snap over a hard knock, dry, before the low punch blooms.
      noise('highpass', 4800, 2600, 0.025, 0.42, 0.8, { ...o, room: 0 });
      tone('square', 1500, 420, 0.03, 0.12, { ...o, room: 0 });
      tone('sine', 150, 42, 0.32, 0.9, o);
      noise('lowpass', 1800, 120, 0.12, 0.45, 0.8, o);
      tone('triangle', 784, 784, 0.12, 0.2, { ...o, delay: 0.05 });
      tone('triangle', 1175, 1175, 0.1, 0.1, { ...o, delay: 0.05 });
      tone('triangle', 1047, 1047, 0.32, 0.24, { ...o, delay: 0.14 });
      tone('triangle', 1568, 1568, 0.28, 0.12, { ...o, delay: 0.14 });
      noise('highpass', 8000, 6000, 0.2, 0.06, 1, { ...o, delay: 0.14 });
    },
    ko: (x?: number) => {
      if (!may('ko')) return;
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
