/**
 * One source of truth for "what is this device, and does it get the touch UI or the mouse UI".
 *
 * CrazyGames' technical requirements: "Use CrazyGames system info for device-specific experiences. Don't rely on touch
 * detection to show mobile controls." So on the portal the platform's `user.systemInfo.device.type` (desktop / tablet /
 * mobile) decides, and `isTouchUi()` is true for tablet and mobile only. A touchscreen laptop reports `desktop`: it gets
 * the mouse and keyboard UI and mouse aim by default even though it also has a touch screen.
 *
 * Where the platform gives no answer (our own site, the web build, a blocked SDK) the fallback is, in order:
 *   1. User-Agent Client Hints `mobile` flag, then the UA string (phone vs tablet);
 *   2. the PRIMARY pointer is coarse (`(pointer: coarse)`, not `any-pointer`: a laptop with a touch screen still has a fine
 *      primary pointer), phone if the short screen side is under 600 px, tablet otherwise;
 *   3. otherwise desktop.
 * `'ontouchstart' in window` and `navigator.maxTouchPoints` never decide on their own (a touch laptop has both). The one use
 * of maxTouchPoints is the iPad that calls itself a Mac in its UA.
 *
 * Wire-up: the entry calls `setPlatformDevice(platform.deviceType())` as soon as the platform adapter exists and
 * `installDevice()` once (it keeps the `lcs-touch` / `lcs-mouse` class on <html> and re-evaluates when the pointer media
 * query changes). Readers call `isTouchUi()` / `deviceType()`; anything that must follow a change uses `subscribe`.
 */
import type { DeviceType } from '~/platform/types';

export type { DeviceType } from '~/platform/types';

/** What the fallback looks at; plain data so it can be tested without a browser. */
export interface DeviceEnv {
  /** `navigator.userAgentData?.mobile` (Chromium only). */
  uaMobile?: boolean | null;
  userAgent?: string;
  maxTouchPoints?: number;
  /** `matchMedia('(pointer: coarse)').matches`: the primary pointer is a finger. */
  coarsePrimary?: boolean;
  /** Short side of the physical screen in CSS px. */
  screenShort?: number;
}

/** Below this short screen side a touch-only device is a phone. */
export const PHONE_SHORT_SIDE = 600;

/** Guess the device without the platform's help. */
export const detectFallback = (env: DeviceEnv): DeviceType => {
  const ua = env.userAgent ?? '';
  const iPadAsMac = /Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1;
  if (/iPad|Tablet/i.test(ua) || iPadAsMac || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (env.uaMobile === true || /iPhone|iPod|Android.+Mobile|Windows Phone|Mobile Safari/i.test(ua)) return 'mobile';
  if (env.coarsePrimary) return (env.screenShort ?? 1024) < PHONE_SHORT_SIDE ? 'mobile' : 'tablet';
  return 'desktop';
};

/** The platform's answer wins; the fallback only fills in when it gave none. */
export const resolveDevice = (platformType: DeviceType | null | undefined, env: DeviceEnv): DeviceType => platformType ?? detectFallback(env);

/** Touch buttons and forced auto-aim for tablets and phones; mouse and keyboard UI for desktops, touch screen or not. */
export const touchUiFor = (type: DeviceType): boolean => type !== 'desktop';

/** The spec's naming: phone | tablet | desktop. */
export const classOf = (type: DeviceType): 'phone' | 'tablet' | 'desktop' => (type === 'mobile' ? 'phone' : type);

const readEnv = (): DeviceEnv => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  let coarsePrimary = false;
  try {
    coarsePrimary = !!window.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    /* no matchMedia: treat as a fine pointer */
  }
  return {
    uaMobile: nav.userAgentData?.mobile ?? null,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    coarsePrimary,
    screenShort: Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 768),
  };
};

let platformType: DeviceType | null = null;
let current: DeviceType | null = null;
const listeners = new Set<() => void>();

const compute = (): DeviceType => resolveDevice(platformType, readEnv());

const refresh = () => {
  const next = compute();
  if (next === current) return;
  current = next;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('lcs-touch', touchUiFor(next));
    root.classList.toggle('lcs-mouse', !touchUiFor(next));
  }
  listeners.forEach((l) => l());
};

/** The platform adapter's `deviceType()` (null when it has none). Call it as soon as the platform exists. */
export const setPlatformDevice = (type: DeviceType | null | undefined): void => {
  platformType = type ?? null;
  refresh();
};

export const deviceType = (): DeviceType => {
  if (current === null) refresh();
  return current as DeviceType;
};
export const deviceClass = (): 'phone' | 'tablet' | 'desktop' => classOf(deviceType());
export const isTouchUi = (): boolean => touchUiFor(deviceType());

/** Called when the resolved device type changes (the platform answered late, or the primary pointer changed). */
export const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Once per page: set the <html> class now and follow the primary-pointer media query. Returns the cleanup. */
export const installDevice = (): (() => void) => {
  refresh();
  let mq: MediaQueryList | undefined;
  try {
    mq = window.matchMedia?.('(pointer: coarse)');
  } catch {
    mq = undefined;
  }
  mq?.addEventListener?.('change', refresh);
  return () => mq?.removeEventListener?.('change', refresh);
};

/** Tests only: forget everything. */
export const resetDeviceForTests = (): void => {
  platformType = null;
  current = null;
  listeners.clear();
};
