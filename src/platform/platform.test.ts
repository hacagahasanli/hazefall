import { describe, expect, it } from 'vitest';

import { BREAK_RULES, BreakScheduler } from './breaks';
import { createCrazyGamesPlatform } from './crazygames';
import { detectPlatform } from './index';
import { createWebPlatform, memoryStore } from './web';

import type { CrazySdk } from './crazygames';

/** A fake SDK that records calls; `ad` decides what each requestAd does. */
const fakeSdk = (opts: { where?: string; init?: () => Promise<void>; ad?: CrazySdk['ad']['requestAd']; muted?: boolean; device?: string } = {}) => {
  const calls: string[] = [];
  let listener: ((s: { muteAudio?: boolean }) => void) | null = null;
  const sdk: CrazySdk = {
    init: opts.init ?? (async () => void calls.push('init')),
    environment: opts.where ?? 'crazygames',
    game: {
      loadingStart: () => void calls.push('loadingStart'),
      loadingStop: () => void calls.push('loadingStop'),
      gameplayStart: () => void calls.push('gameplayStart'),
      gameplayStop: () => void calls.push('gameplayStop'),
      happytime: () => void calls.push('happytime'),
      settings: { muteAudio: opts.muted ?? false },
      addSettingsChangeListener: (l) => void (listener = l),
      removeSettingsChangeListener: () => void (listener = null),
    },
    ad: {
      requestAd:
        opts.ad ??
        ((type, cb) => {
          calls.push(`ad:${type}`);
          cb.adStarted?.();
          cb.adFinished?.();
        }),
    },
    user: { systemInfo: { device: { type: opts.device ?? 'mobile' } } },
    data: memoryStore(),
  };
  return { sdk, calls, fire: (s: { muteAudio?: boolean }) => listener?.(s) };
};

describe('choosing the platform', () => {
  it('falls back to the no-op web adapter when the SDK is missing', async () => {
    expect((await detectPlatform({})).id).toBe('web');
    expect((await detectPlatform(undefined)).id).toBe('web');
  });

  it('falls back when the SDK says the domain is not CrazyGames, when init fails, or when init hangs', async () => {
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ where: 'disabled' }).sdk } })).id).toBe('web');
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ init: () => Promise.reject(new Error('x')) }).sdk } })).id).toBe('web');
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ init: () => new Promise(() => undefined) }).sdk } }, 20)).id).toBe('web');
  });

  it('uses CrazyGames on its own domains and locally ("local")', async () => {
    const f = fakeSdk({ where: 'local' });
    const p = await detectPlatform({ CrazyGames: { SDK: f.sdk } });
    expect(p.id).toBe('crazygames');
    expect(f.calls).toContain('init');
  });
});

describe('the web fallback', () => {
  it('does nothing, skips every break and never throws', async () => {
    const p = createWebPlatform(memoryStore());
    expect(p.ads).toBe(false);
    p.loadingStart();
    p.loadingStop();
    p.gameplayStart();
    p.gameplayStop();
    p.happytime();
    expect(await p.commercialBreak()).toBe('skipped');
    expect(await p.rewardedBreak()).toBe('skipped');
    expect(p.muted()).toBe(false);
    expect(p.deviceType()).toBeNull();
    p.storage.setItem('k', 'v');
    expect(p.storage.getItem('k')).toBe('v');
  });
});

describe('the CrazyGames adapter', () => {
  it('forwards gameplay start and stop only when they change', () => {
    const f = fakeSdk();
    const p = createCrazyGamesPlatform(f.sdk);
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    p.loadingStart();
    p.loadingStop();
    p.loadingStop();
    expect(f.calls).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart', 'loadingStart', 'loadingStop']);
  });

  it('mutes only when the ad starts, and reports a finished rewarded ad as shown', async () => {
    const order: string[] = [];
    const f = fakeSdk({
      ad: (_type, cb) => {
        order.push('request');
        setTimeout(() => {
          cb.adStarted?.();
          order.push('playing');
          cb.adFinished?.();
        }, 5);
      },
    });
    const p = createCrazyGamesPlatform(f.sdk);
    const r = await p.rewardedBreak({ onStart: () => order.push('mute') });
    expect(r).toBe('shown');
    expect(order).toEqual(['request', 'mute', 'playing']);
  });

  it('turns ad errors, SDK exceptions and an ad that never starts into "error", and remembers why', async () => {
    const unfilled = createCrazyGamesPlatform(fakeSdk({ ad: (_t, cb) => cb.adError?.({ code: 'unfilled' }) }).sdk);
    expect(await unfilled.commercialBreak()).toBe('error');
    expect(unfilled.lastBreakError()).toBe('unfilled');
    const throws = createCrazyGamesPlatform(
      fakeSdk({
        ad: () => {
          throw new Error('boom');
        },
      }).sdk,
    );
    expect(await throws.rewardedBreak()).toBe('error');
    const silent = createCrazyGamesPlatform(fakeSdk({ ad: () => undefined }).sdk, { timeoutMs: 20 });
    let muted = false;
    expect(await silent.commercialBreak({ onStart: () => (muted = true) })).toBe('error');
    expect(muted).toBe(false);
    expect(silent.lastBreakError()).toBe('timeout');
  });

  it('asks the SDK for a midgame ad between rounds and reports it as shown', async () => {
    const f = fakeSdk();
    const p = createCrazyGamesPlatform(f.sdk);
    let started = 0;
    expect(await p.commercialBreak({ onStart: () => started++ })).toBe('shown');
    expect(f.calls).toEqual(['ad:midgame']);
    expect(started).toBe(1);
  });

  it('never throws when the SDK does', () => {
    const f = fakeSdk();
    f.sdk.game.gameplayStart = () => {
      throw new Error('sdk down');
    };
    const p = createCrazyGamesPlatform(f.sdk);
    expect(() => p.gameplayStart()).not.toThrow();
  });

  it("follows the portal's mute setting, reads the device type and saves through the data module", () => {
    const f = fakeSdk({ muted: true, device: 'tablet' });
    const p = createCrazyGamesPlatform(f.sdk);
    expect(p.muted()).toBe(true);
    const seen: boolean[] = [];
    const off = p.onMutedChange((m) => seen.push(m));
    f.fire({ muteAudio: false });
    f.fire({ muteAudio: true });
    off();
    f.fire({ muteAudio: false });
    expect(seen).toEqual([false, true]);
    expect(p.deviceType()).toBe('tablet');
    p.storage.setItem('q', 'low');
    expect(f.sdk.data!.getItem('q')).toBe('low');
  });
});

describe('midgame ad scheduling', () => {
  const R = BREAK_RULES;
  /** Plays `n` rounds of `secs` seconds each. */
  const play = (s: BreakScheduler, n: number, secs: number) => {
    for (let i = 0; i < n; i++) {
      s.addPlay(secs);
      s.roundEnded();
    }
  };

  it('never asks before a finished round and enough play', () => {
    const s = new BreakScheduler();
    expect(s.shouldBreak(1000)).toBe(false);
    s.addPlay(500);
    expect(s.shouldBreak(1000)).toBe(false); // mid-round: no report yet
    const t = new BreakScheduler();
    play(t, 1, R.firstAfterPlay - 30); // an early death
    expect(t.shouldBreak(1000)).toBe(false);
    play(t, 1, 30);
    expect(t.shouldBreak(1000)).toBe(true);
  });

  it('asks at most once per gap between rounds and once per interval', () => {
    const s = new BreakScheduler();
    play(s, 1, 200);
    expect(s.shouldBreak(500)).toBe(true);
    s.adShown(500);
    expect(s.shouldBreak(500)).toBe(false);
    play(s, 1, 200);
    expect(s.shouldBreak(500 + R.interval - 1)).toBe(false);
    expect(s.shouldBreak(500 + R.interval)).toBe(true);
  });

  it('a gap closed without an ad stays closed until the next round ends', () => {
    const s = new BreakScheduler();
    play(s, 1, 200);
    s.gapClosed();
    expect(s.shouldBreak(1000)).toBe(false);
    play(s, 1, 200);
    expect(s.shouldBreak(1000)).toBe(true);
  });

  it('ignores nonsense play time', () => {
    const s = new BreakScheduler();
    s.addPlay(-5);
    s.addPlay(Number.NaN);
    s.addPlay(Infinity);
    expect(s.stats.play).toBe(0);
  });
});
