/**
 * Performance tiers. The same scene, drawn with less on weaker machines so it stays smooth on mid-range phones and 4 GB
 * Chromebooks (CrazyGames disables games on ChromeOS that do not run smoothly on a 4 GB device).
 *
 *  - high:   device pixel ratio up to 2, sun shadows (2048 map, soft PCF), antialiasing;
 *  - medium: pixel ratio up to 1.5, shadows with a 1024 map, antialiasing;
 *  - low:    pixel ratio 1, no shadows, no antialiasing, a shorter view distance (at eye level the fog closes in to 180 m).
 *
 * Every tier also sets how far grass reaches at eye level and where trees and bushes switch to fewer faces.
 *
 * 'auto' picks one from what the browser says about the device (`autoTier`), then steps down once if the frame rate stays
 * low (`FpsGuard`). The player can pick a tier in the pause menu; that choice is saved and wins over auto.
 * Pure (no DOM): the caller passes the facts, so the choice is tested.
 */
export type Tier = 'low' | 'medium' | 'high';
export type QualitySetting = Tier | 'auto';

export interface TierSpec {
  /** Highest device pixel ratio the canvas renders at. */
  dprCap: number;
  shadows: boolean;
  shadowMap: number;
  /** Antialiasing is fixed when the WebGL context is made: a change applies on the next load. */
  antialias: boolean;
  /** Fog start and end (m): the far edge of the view, so less is drawn on low (nothing past the end is drawn). */
  fogNear: number;
  fogFar: number;
  /** View-distance scale for small things (grass, tall grass): they shrink away at their reach times this. */
  reach: number;
  /** Distance (m) from the camera beyond which trees and bushes are drawn with fewer faces (at eye level and falling). */
  lodNear: number;
  /** At eye level on the ground (first person, over the shoulder): a nearer fog, tree switch and grass reach, when set. */
  eye?: { fogNear: number; fogFar: number; lodNear: number; reach: number };
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dprCap: 2, shadows: true, shadowMap: 2048, antialias: true, fogNear: 120, fogFar: 300, reach: 1, lodNear: 90 },
  medium: { dprCap: 1.5, shadows: true, shadowMap: 1024, antialias: true, fogNear: 120, fogFar: 290, reach: 0.9, lodNear: 90 },
  low: { dprCap: 1, shadows: false, shadowMap: 512, antialias: false, fogNear: 120, fogFar: 260, reach: 0.75, lodNear: 90, eye: { fogNear: 70, fogFar: 180, lodNear: 75, reach: 0.6 } },
};

export interface DeviceFacts {
  /** From the portal SDK if it says, else guessed from the pointer and screen. */
  device: 'desktop' | 'tablet' | 'mobile';
  /** navigator.hardwareConcurrency (undefined when hidden). */
  cores?: number;
  /** navigator.deviceMemory in GB (Chrome only; capped at 8 by the browser). */
  memory?: number;
  /** The WebGL renderer string, when the browser shares it. */
  gpu?: string;
  /** User agent, for ChromeOS. */
  ua?: string;
}

/** Software renderers and old integrated GPUs: always low. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const WEAK_GPU = /mali-[gt][0-9]{2}\b|mali-4|adreno \(tm\) [1-5][0-9]{2}\b|powervr|intel\(r\) (hd|uhd) graphics( [0-9]{3})?\b|intel hd graphics/i;

export const autoTier = (f: DeviceFacts): Tier => {
  const gpu = f.gpu ?? '';
  if (SOFTWARE_GPU.test(gpu)) return 'low';
  const cores = f.cores ?? 4;
  const memory = f.memory ?? 4;
  const chromebook = /\bCrOS\b/.test(f.ua ?? '');
  if (f.device === 'mobile' || f.device === 'tablet') {
    // Phones get medium unless something says the device is weak: a clean, shadowed picture at a sensible pixel count
    // (see `phoneRatio`) beats the old default of low, which drew a third of a modern phone's pixels with no antialiasing.
    // iPhones hide their memory and report a default here, so only an explicit low number or a weak GPU counts against a phone.
    return memory <= 3 || (f.cores !== undefined && f.cores <= 4) || WEAK_GPU.test(gpu) ? 'low' : 'medium';
  }
  if (chromebook) return memory >= 8 && cores >= 8 && !WEAK_GPU.test(gpu) ? 'medium' : 'low';
  if (memory <= 2 || cores <= 2) return 'low';
  if (memory <= 4 || cores <= 4 || WEAK_GPU.test(gpu)) return 'medium';
  return 'high';
};

/** The tier to use: the player's choice, or the automatic one. */
export const resolveTier = (setting: QualitySetting, facts: DeviceFacts): Tier => (setting === 'auto' ? autoTier(facts) : setting);

/**
 * Pixels the phone draws per frame, by tier (CSS size times the ratio squared). A phone's screen is 3x or more in each
 * direction, which no mid phone can fill at 60 fps; this spends a fixed pixel budget instead of a fixed ratio, so a
 * small iframe is drawn sharper than a full screen and neither is ever blurry. About 0.95 MP is a 844 x 390 screen at 1.7x.
 */
const PHONE_BUDGET: Record<Tier, number> = { low: 0.6e6, medium: 0.95e6, high: 1.4e6 };

/** The pixel ratio for a touch device: the budget's, never above 2 or the screen's own, never below 1 (or the screen's, if less). */
export const phoneRatio = (tier: Tier, cssW: number, cssH: number, dpr: number): number => {
  const area = Math.max(1, cssW * cssH);
  const k = Math.sqrt(PHONE_BUDGET[tier] / area);
  return Math.max(Math.min(1, dpr), Math.min(k, dpr, 2));
};

/** The tier a phone's menu and lobby scenes draw at: never above medium (a backdrop does not need more). */
export const sceneTier = (t: Tier): Tier => (t === 'high' ? 'medium' : t);

/**
 * Dynamic resolution for touch devices: when the frame rate stays low the picture is drawn at a slightly lower
 * resolution (`scale` 1 down to 0.7 in steps of 0.1, each step 3 s after the last), which is invisible at this pixel density.
 * It never goes back up (so the picture does not pump) and it is what the game tries before ever switching shadows off.
 */
export class ResolutionGuard {
  scale = 1;
  private low = 0;
  private seen = 0;
  private cool = 0;

  constructor(
    private minFps = 45,
    private window = 2.5,
    private grace = 3,
    private floor = 0.7,
  ) {}

  /** Feed one frame; returns the new scale when it just changed, else null. */
  frame(dt: number): number | null {
    if (!(dt > 0) || dt > 0.5) return null;
    this.seen += dt;
    this.cool = Math.max(0, this.cool - dt);
    if (this.seen < this.grace || this.scale <= this.floor + 1e-6) return null;
    if (1 / dt < this.minFps) this.low += dt;
    else this.low = Math.max(0, this.low - dt * 0.5);
    if (this.low >= this.window && this.cool <= 0) {
      this.low = 0;
      this.cool = 3;
      this.scale = Math.max(this.floor, Math.round((this.scale - 0.1) * 10) / 10);
      return this.scale;
    }
    return null;
  }

  /** True once the resolution cannot go lower: only then may the tier step down. */
  get exhausted(): boolean {
    return this.scale <= this.floor + 1e-6;
  }
}

export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'medium' : 'low');

export const parseSetting = (v: string | null | undefined): QualitySetting => (v === 'low' || v === 'medium' || v === 'high' || v === 'auto' ? v : 'auto');

/**
 * Watches the frame rate on 'auto' and steps the tier down once it has stayed under `minFps` for `window` seconds of play
 * (never during the first `grace` seconds, while shaders compile). It never steps up again, so the picture does not pump.
 */
export class FpsGuard {
  private low = 0;
  private seen = 0;

  constructor(
    private minFps = 40,
    private window = 4,
    private grace = 3,
  ) {}

  /** Feed one frame (its length in seconds); true when it is time to step down. */
  frame(dt: number): boolean {
    if (!(dt > 0) || dt > 0.5) return false; // a hidden tab or a breakpoint
    this.seen += dt;
    if (this.seen < this.grace) return false;
    if (1 / dt < this.minFps) this.low += dt;
    else this.low = Math.max(0, this.low - dt * 0.5);
    if (this.low >= this.window) {
      this.low = 0;
      this.seen = 0;
      return true;
    }
    return false;
  }
}
