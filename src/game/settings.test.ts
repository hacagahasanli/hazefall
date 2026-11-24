import { describe, expect, it } from 'vitest';

import { actionFor, ACTIONS, DEFAULT_KEYS, DEFAULT_SETTINGS, keyLabel, keyMap, loadSettings, normalize, rebind, saveSettings, SETTINGS_KEY } from './settings';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

/** The layout before layout 3: the super on G, heal on C, no crouch or look keys. */
const V2: Record<string, string> = Object.fromEntries(
  Object.entries({ ...DEFAULT_KEYS, super: 'KeyG', heal: 'KeyC', coffee: 'KeyV' }).filter(([a]) => !['crouch', 'look', 'slot3', 'slot4'].includes(a)),
);

describe('settings store', () => {
  it('starts from sane defaults: every action bound to its own key, auto graphics, mouse-aim (over the shoulder) camera', () => {
    const s = loadSettings(mem());
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(new Set(Object.values(s.keys)).size).toBe(ACTIONS.length);
    expect(s.quality).toBe('auto');
    expect(s.camera).toBe('shoulder');
  });

  it('a new player gets the mouse-aim view, a saved camera choice is never overridden', () => {
    expect(normalize({}).camera).toBe('shoulder');
    expect(normalize({ fov: 80 }).camera).toBe('shoulder'); // a save with no camera in it
    for (const camera of ['third', 'shoulder', 'first'] as const) expect(normalize({ camera }).camera).toBe(camera);
    const st = mem();
    saveSettings(st, { ...DEFAULT_SETTINGS, camera: 'third' });
    expect(loadSettings(st).camera).toBe('third');
  });

  it('saves and loads back the same settings', () => {
    const st = mem();
    const s = { ...DEFAULT_SETTINGS, fov: 90, camera: 'first' as const, quality: 'low' as const, muted: true, keys: { ...DEFAULT_KEYS, reload: 'KeyK' } };
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
    expect(s.camera).toBe('shoulder');
    expect(s.keys.up).toBe('KeyW'); // Esc can never be bound
    expect('extra' in s).toBe(false);
    // Two actions on one key in an old save: back to the default keys.
    expect(normalize({ keys: { ...DEFAULT_KEYS, fire: 'KeyW' } }).keys).toEqual(DEFAULT_KEYS);
  });

  it('shows key hints by default, keeps an old save on, and remembers turning them off', () => {
    expect(DEFAULT_SETTINGS.showKeyHints).toBe(true);
    expect(normalize({ fov: 80 }).showKeyHints).toBe(true);
    expect(normalize({ showKeyHints: 'no' }).showKeyHints).toBe(true);
    const st = mem();
    saveSettings(st, { ...DEFAULT_SETTINGS, showKeyHints: false });
    expect(loadSettings(st).showKeyHints).toBe(false);
  });

  it('keeps a layout saved before the gun slot and heal keys existed, giving those a free key', () => {
    const old = Object.fromEntries(Object.entries(V2).filter(([a]) => !['slot1', 'slot2', 'swap', 'heal', 'coffee'].includes(a)));
    const keys = normalize({ keys: { ...old, use: 'Digit1', reload: 'KeyC' } }).keys;
    expect(keys.use).toBe('Digit1');
    expect(keys.reload).toBe('KeyC');
    expect(keys.slot2).toBe('Digit2');
    expect(keys.swap).toBe('KeyX');
    expect(keys.slot1).not.toBe('Digit1');
    expect(keys.bandage).toBe('Digit3');
    expect(new Set(Object.values(keys)).size).toBe(ACTIONS.length);
  });

  it('drops an old save\'s shoot key (the mouse shoots): Space on shoot becomes jump', () => {
    const keys = normalize({ keys: { ...V2, fire: 'Space', jump: 'KeyB' } }).keys as Record<string, string>;
    expect(keys.fire).toBeUndefined();
    expect(keys.jump).toBe('Space');
    expect(new Set(Object.values(keys)).size).toBe(ACTIONS.length);
    const custom = normalize({ keys: { ...DEFAULT_KEYS, fire: 'KeyK' } }).keys as Record<string, string>;
    expect(custom.fire).toBeUndefined();
  });

  it('moves an older save to layout 5: C crouches, Left Alt looks around, G super, H heal, 3 bandage, 4 med kit, 5 bomb', () => {
    const keys = normalize({ keys: V2, keysVersion: 2 }).keys;
    expect(keys).toMatchObject({ crouch: 'KeyC', look: 'AltLeft', super: 'KeyG', heal: 'KeyH', bandage: 'Digit3', medkit: 'Digit4', bomb: 'Digit5' });
    const v3 = normalize({ keys: { ...V2, heal: 'KeyH', crouch: 'KeyG', look: 'KeyC', super: 'KeyB' }, keysVersion: 3 }).keys;
    expect(v3).toMatchObject({ crouch: 'KeyC', look: 'AltLeft', super: 'KeyG' });
    expect(new Set(Object.values(v3)).size).toBe(ACTIONS.length);
    expect(new Set(Object.values(keys)).size).toBe(ACTIONS.length);
    // Layout 4's "heals in hand" on 3 and "bomb in hand" on 4 go; 3 and 4 become the bandage and the med kit.
    const v4 = normalize({ keys: { ...DEFAULT_KEYS, slot3: 'Digit3', slot4: 'Digit4' }, keysVersion: 4 }).keys as Record<string, string>;
    expect(v4.slot3).toBeUndefined();
    expect(v4).toMatchObject({ bandage: 'Digit3', medkit: 'Digit4', bomb: 'Digit5' });
    // A save's own keys stay theirs.
    expect(normalize({ keys: { ...DEFAULT_KEYS, crouch: 'KeyN', super: 'KeyB' }, keysVersion: 5 }).keys).toMatchObject({ crouch: 'KeyN', super: 'KeyB' });
  });

  it('never throws when storage does', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(bad, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('rebinding keys', () => {
  it('binds a free key', () => {
    const r = rebind(DEFAULT_SETTINGS, 'reload', 'KeyK');
    expect(r.ok && r.settings.keys.reload).toBe('KeyK');
    expect(r.ok && r.swapped).toBeNull();
  });

  it('swaps on a conflict so no key is shared and nothing is left unbound', () => {
    const r = rebind(DEFAULT_SETTINGS, 'reload', 'KeyF');
    if (!r.ok) throw new Error('refused');
    expect(r.swapped).toBe('use');
    expect(r.settings.keys.reload).toBe('KeyF');
    expect(r.settings.keys.use).toBe('KeyR');
    expect(new Set(Object.values(r.settings.keys)).size).toBe(ACTIONS.length);
  });

  it('refuses keys that belong to menus, the browser or the fixed arrows', () => {
    for (const k of ['Escape', 'Tab', 'ArrowUp', 'ShiftRight']) expect(rebind(DEFAULT_SETTINGS, 'reload', k).ok).toBe(false);
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
    expect(keyMap(keys).jump).toEqual(['Space']);
  });

  it('labels keys the way players know them', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowLeft')).toBe('←');
  });
});
