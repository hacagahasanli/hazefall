// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classOf, detectFallback, deviceType, installDevice, isTouchUi, resetDeviceForTests, resolveDevice, setPlatformDevice, subscribe, touchUiFor } from './device';

const PIXEL = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

afterEach(() => {
  resetDeviceForTests();
  vi.unstubAllGlobals();
});

describe('platform answer wins (CrazyGames system info)', () => {
  it('desktop + a touch screen is still the mouse UI', () => {
    // A touch laptop: ontouchstart exists, maxTouchPoints > 0, even a coarse any-pointer; the primary pointer is a mouse.
    expect(resolveDevice('desktop', { userAgent: WIN_CHROME, maxTouchPoints: 10, coarsePrimary: false, screenShort: 900 })).toBe('desktop');
    expect(touchUiFor('desktop')).toBe(false);
  });
  it('desktop wins even over a coarse primary pointer', () => {
    expect(resolveDevice('desktop', { coarsePrimary: true, uaMobile: true, userAgent: PIXEL })).toBe('desktop');
  });
  it('mobile and tablet are the touch UI even with a fine pointer', () => {
    expect(resolveDevice('mobile', { coarsePrimary: false, userAgent: WIN_CHROME })).toBe('mobile');
    expect(resolveDevice('tablet', { coarsePrimary: false })).toBe('tablet');
    expect(touchUiFor('mobile')).toBe(true);
    expect(touchUiFor('tablet')).toBe(true);
  });
});

describe('fallback without a platform answer', () => {
  it('null + coarse primary pointer on a small screen is a phone (touch)', () => {
    expect(resolveDevice(null, { coarsePrimary: true, screenShort: 390 })).toBe('mobile');
  });
  it('null + coarse primary pointer on a big screen is a tablet (touch)', () => {
    expect(resolveDevice(null, { coarsePrimary: true, screenShort: 820 })).toBe('tablet');
  });
  it('null + fine pointer is the mouse UI', () => {
    expect(resolveDevice(null, { coarsePrimary: false, screenShort: 1080, userAgent: WIN_CHROME })).toBe('desktop');
    expect(resolveDevice(undefined, {})).toBe('desktop');
  });
  it('null + a touch laptop (touch points, fine primary pointer) is desktop', () => {
    expect(detectFallback({ userAgent: WIN_CHROME, maxTouchPoints: 10, coarsePrimary: false, screenShort: 900 })).toBe('desktop');
  });
  it('UA Client Hints and the UA string tell phone from tablet', () => {
    expect(detectFallback({ uaMobile: true, userAgent: PIXEL, coarsePrimary: false })).toBe('mobile');
    expect(detectFallback({ userAgent: IPHONE })).toBe('mobile');
    expect(detectFallback({ userAgent: ANDROID_TABLET })).toBe('tablet');
    expect(detectFallback({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })).toBe('tablet');
  });
  it('a Mac with no touch points is desktop', () => {
    expect(detectFallback({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBe('desktop');
  });
  it('maps to the spec class names', () => {
    expect(classOf('mobile')).toBe('phone');
    expect(classOf('tablet')).toBe('tablet');
    expect(classOf('desktop')).toBe('desktop');
  });
});

describe('runtime state', () => {
  const stubBrowser = (coarse: boolean, ua = WIN_CHROME) => {
    const listeners: Array<() => void> = [];
    const mq = { matches: coarse, addEventListener: (_: string, l: () => void) => listeners.push(l), removeEventListener: () => undefined };
    vi.stubGlobal('window', { matchMedia: () => mq, screen: { width: 1920, height: 1080 } });
    vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: 10 });
    return { mq, fire: () => listeners.forEach((l) => l()) };
  };

  it('setPlatformDevice decides and notifies subscribers only on a change', () => {
    stubBrowser(true);
    expect(isTouchUi()).toBe(true); // fallback: coarse primary
    const seen = vi.fn();
    const off = subscribe(seen);
    setPlatformDevice('desktop');
    expect(deviceType()).toBe('desktop');
    expect(isTouchUi()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    setPlatformDevice('desktop');
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setPlatformDevice('mobile');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(isTouchUi()).toBe(true);
  });

  it('follows the primary pointer while the platform has no answer, and ignores it once it has', () => {
    const b = stubBrowser(false);
    const off = installDevice();
    expect(isTouchUi()).toBe(false);
    const seen = vi.fn();
    subscribe(seen);
    b.mq.matches = true;
    b.fire();
    expect(isTouchUi()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    setPlatformDevice('desktop');
    b.fire();
    expect(isTouchUi()).toBe(false);
    off();
  });

  it('answers desktop when there is no window at all', () => {
    expect(deviceType()).toBe('desktop');
    expect(isTouchUi()).toBe(false);
  });
});
