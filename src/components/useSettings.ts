'use client';

/**
 * The settings as React state, shared by every screen that reads them (menu, settings panel, the round) and saved on each
 * change. One store per storage object, so the menu and the round always agree.
 */
import { useCallback, useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '~/game/settings';

import type { Settings } from '~/game/settings';
import type { KeyValue } from '~/platform/types';

interface Store {
  get: () => Settings;
  set: (s: Settings) => void;
  subscribe: (cb: () => void) => () => void;
}

const stores = new WeakMap<KeyValue, Store>();

export const settingsStore = (storage: KeyValue): Store => {
  let s = stores.get(storage);
  if (s) return s;
  let value = loadSettings(storage);
  const subs = new Set<() => void>();
  s = {
    get: () => value,
    set: (next) => {
      value = next;
      saveSettings(storage, next);
      subs.forEach((cb) => cb());
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
  stores.set(storage, s);
  return s;
};

export const useSettings = (storage: KeyValue): [Settings, (s: Settings) => void] => {
  const store = settingsStore(storage);
  const value = useSyncExternalStore(store.subscribe, store.get, () => DEFAULT_SETTINGS);
  const set = useCallback((s: Settings) => store.set(s), [store]);
  return [value, set];
};
