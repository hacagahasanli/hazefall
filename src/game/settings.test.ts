import { describe, expect, it } from 'vitest';

import { actionFor, ACTIONS, DEFAULT_KEYS, DEFAULT_SETTINGS, keyLabel, keyMap, loadSettings, normalize, rebind, saveSettings, SETTINGS_KEY } from './settings';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('settings store', () => {
  it('starts from sane defaults: every action bound to its own key, auto graphics, third person', () => {
    const s = loadSettings(mem());
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(new Set(Object.values(s.keys)).size).toBe(ACTIONS.length);
    expect(s.quality).toBe('auto');
    expect(s.camera).toBe('third');
  });

  it('saves and loads back the same settings', () => {
    const st = mem();
    const s = { ...DEFAULT_SETTINGS, fov: 90, camera: 'first' as const, quality: 'low' as const, muted: true, keys: { ...DEFAULT_KEYS, fire: 'KeyJ' } };
    saveSettings(st, s);
    expect(loadSettings(st)).toEqual(s);
  });

  it('survives broken, old or hand-edited saves', () => {
    const st = mem();
    st.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    const s = normalize({ fov: 400, sensitivity: -2, resolution: 'x', quality: 'ultra', camera: 'drone', extra: 1, keys: { up: 'Escape' } });
    expect(s.fov).toBe(100);
    expect(s.sensitivity).toBe(0.2);
    expect(s.resolution).toBe(1);
    expect(s.quality).toBe('auto');
    expect(s.camera).toBe('third');
    expect(s.keys.up).toBe('KeyW'); // Esc can never be bound
    expect('extra' in s).toBe(false);
    // Two actions on one key in an old save: back to the default keys.
    expect(normalize({ keys: { ...DEFAULT_KEYS, fire: 'KeyW' } }).keys).toEqual(DEFAULT_KEYS);
  });

  it('keeps a layout saved before the gun slot and heal keys existed, giving those a free key', () => {
    const old = Object.fromEntries(Object.entries(DEFAULT_KEYS).filter(([a]) => !['slot1', 'slot2', 'swap', 'heal', 'coffee'].includes(a)));
    const keys = normalize({ keys: { ...old, use: 'Digit1', reload: 'KeyC' } }).keys;
    expect(keys.use).toBe('Digit1');
    expect(keys.reload).toBe('KeyC');
    expect(keys.slot2).toBe('Digit2');
    expect(keys.swap).toBe('KeyX');
    expect(keys.slot1).not.toBe('Digit1');
    expect(keys.heal).not.toBe('KeyC');
    expect(new Set(Object.values(keys)).size).toBe(ACTIONS.length);
  });

  it('never throws when storage does', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(bad, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('rebinding keys', () => {
  it('binds a free key', () => {
    const r = rebind(DEFAULT_SETTINGS, 'fire', 'KeyJ');
    expect(r.ok && r.settings.keys.fire).toBe('KeyJ');
    expect(r.ok && r.swapped).toBeNull();
  });

  it('swaps on a conflict so no key is shared and nothing is left unbound', () => {
    const r = rebind(DEFAULT_SETTINGS, 'fire', 'KeyF');
    if (!r.ok) throw new Error('refused');
    expect(r.swapped).toBe('use');
    expect(r.settings.keys.fire).toBe('KeyF');
    expect(r.settings.keys.use).toBe('Space');
    expect(new Set(Object.values(r.settings.keys)).size).toBe(ACTIONS.length);
  });

  it('refuses keys that belong to menus, the browser or the fixed arrows', () => {
    for (const k of ['Escape', 'Tab', 'ArrowUp', 'ShiftRight']) expect(rebind(DEFAULT_SETTINGS, 'fire', k).ok).toBe(false);
  });

  it('does not change the settings it was given', () => {
    rebind(DEFAULT_SETTINGS, 'up', 'KeyI');
    expect(DEFAULT_SETTINGS.keys.up).toBe('KeyW');
  });
});

describe('applying key bindings', () => {
  it('maps a key press to its action, arrows always moving', () => {
    const keys = { ...DEFAULT_KEYS, up: 'KeyI' };
    expect(actionFor(keys, 'KeyI')).toBe('up');
    expect(actionFor(keys, 'KeyW')).toBeNull();
    expect(actionFor(keys, 'ArrowUp')).toBe('up');
    expect(actionFor(keys, 'ShiftRight')).toBe('roll');
    expect(keyMap(keys).up).toEqual(['KeyI', 'ArrowUp']);
    expect(keyMap(keys).fire).toEqual(['Space']);
  });

  it('labels keys the way players know them', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowLeft')).toBe('←');
  });
});
