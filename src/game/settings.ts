/**
 * The player's settings: key bindings, mouse and touch, camera, graphics, audio and accessibility, in one object that is
 * saved as JSON (through the platform's storage: localStorage on the web, the portal's data module on CrazyGames) and
 * applied live. Pure (no DOM): loading, clamping, rebinding and the key-to-action lookup are tested without a browser.
 */

import type { QualitySetting } from './render/quality';

export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'fire' | 'jump' | 'use' | 'super' | 'roll' | 'reload' | 'leanL' | 'leanR' | 'scope' | 'crouch' | 'look'
  | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'swap' | 'aim' | 'mute' | 'pause';

/** In the order the Controls tab lists them, with the words it shows. */
export const ACTIONS: [Action, string][] = [
  ['up', 'Move forward'],
  ['down', 'Move back'],
  ['left', 'Move left'],
  ['right', 'Move right'],
  ['fire', 'Shoot'],
  ['jump', 'Jump / parachute'],
  ['use', 'Pick up / use'],
  ['super', 'Super'],
  ['roll', 'Roll'],
  ['reload', 'Reload'],
  ['leanL', 'Lean left'],
  ['leanR', 'Lean right'],
  ['crouch', 'Crouch'],
  ['look', 'Look around (hold)'],
  ['scope', 'Scope'],
  ['slot1', 'Gun slot 1'],
  ['slot2', 'Gun slot 2'],
  ['swap', 'Swap guns'],
  ['slot3', 'Heals in hand (shoot to use)'],
  ['slot4', 'Bomb in hand (hold shoot, let go to throw)'],
  ['aim', 'Switch aim mode'],
  ['mute', 'Mute'],
  ['pause', 'Pause'],
];

export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  fire: 'KeyJ',
  jump: 'Space',
  use: 'KeyF',
  super: 'KeyG',
  roll: 'ShiftLeft',
  reload: 'KeyR',
  leanL: 'KeyQ',
  leanR: 'KeyE',
  crouch: 'KeyC',
  look: 'AltLeft',
  scope: 'KeyZ',
  slot1: 'Digit1',
  slot2: 'Digit2',
  swap: 'KeyX',
  slot3: 'Digit3',
  slot4: 'Digit4',
  aim: 'KeyT',
  mute: 'KeyM',
  pause: 'KeyP',
};

/** Free keys handed to a newly added action when an old save already uses its default. */
const SPARE_KEYS = ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'KeyN', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyY'];

/** Always on, whatever the bindings: arrows move, the right Shift rolls too, Esc belongs to menus and the browser. */
export const FIXED_KEYS: Partial<Record<Action, string[]>> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  roll: ['ShiftRight'],
};
/** Keys that can never be bound (menus, the browser, the portal's fullscreen). */
export const RESERVED = new Set(['Escape', 'Tab', 'F11', 'F5', 'MetaLeft', 'MetaRight', ...Object.values(FIXED_KEYS).flat()]);

/**
 * 'third' is the high follow view (auto-aim, phones), 'shoulder' the over-the-shoulder view (mouse aim), 'first' your eyes.
 * The default is 'shoulder': a mouse and keyboard player starts aiming with the mouse. A touch screen never uses it (the round
 * and the settings panel keep the high view there), so phones are on 'third' whatever this says.
 */
export type CameraView = 'third' | 'shoulder' | 'first';

export interface Settings {
  keys: Record<Action, string>;
  /** Mouse look in first person, x the base speed (0.2..3). */
  sensitivity: number;
  invertY: boolean;
  /** Touch buttons: size (0.7..1.4), opacity (0.3..1), and the stick on the right for left-handed play. */
  touchSize: number;
  touchOpacity: number;
  leftHanded: boolean;
  camera: CameraView;
  /** First-person field of view in degrees (60..100). */
  fov: number;
  quality: QualitySetting;
  /** Sun shadows (off saves the most on weak GPUs; the tier may also turn them off). */
  shadows: boolean;
  /** Render resolution as a share of the screen's (0.5..1). */
  resolution: number;
  showFps: boolean;
  /** 0..1 each. There is no music track, so "effects" is everything that is not a gun or a footstep. */
  master: number;
  guns: number;
  steps: number;
  muted: boolean;
  /** No camera shake, no big screen flashes. */
  reducedMotion: boolean;
  /** Blue and orange in place of green and red on the health bar and the danger edge. */
  colorBlind: boolean;
  largeHud: boolean;
  /** The keyboard legend and the keycaps on the HUD (touch buttons always stay). */
  showKeyHints: boolean;
  /** Which default layout the key bindings were saved under (see normalize: older saves move once). */
  keysVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  keys: { ...DEFAULT_KEYS },
  sensitivity: 1,
  invertY: false,
  touchSize: 1,
  touchOpacity: 0.9,
  leftHanded: false,
  camera: 'shoulder',
  fov: 74,
  quality: 'auto',
  shadows: true,
  resolution: 1,
  showFps: false,
  master: 0.8,
  guns: 0.6,
  steps: 0.8,
  muted: false,
  reducedMotion: false,
  colorBlind: false,
  largeHud: false,
  showKeyHints: true,
  keysVersion: 4,
};

export const SETTINGS_KEY = 'lcs:settings';

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Any value (parsed JSON, possibly old or hand-edited) made into valid settings: unknown fields dropped, numbers clamped. */
export const normalize = (raw: unknown): Settings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const keys = { ...DEFAULT_KEYS };
  let rk = (r.keys && typeof r.keys === 'object' ? r.keys : {}) as Record<string, unknown>;
  // Layout 2: Space jumps in every view and J shoots (Space used to be the trigger with auto-aim). A save from before
  // with Space on "shoot" moves once: Space to jump, J (or, if J is taken, the old jump key) to shoot.
  if (r.keysVersion !== DEFAULT_SETTINGS.keysVersion && rk.fire === 'Space') {
    const taken = new Set(Object.entries(rk).filter(([a]) => a !== 'fire' && a !== 'jump').map(([, k]) => k));
    rk = { ...rk, fire: !taken.has('KeyJ') ? 'KeyJ' : typeof rk.jump === 'string' && rk.jump !== 'Space' ? rk.jump : 'KeyJ', jump: 'Space' };
  }
  // Layout 4: C crouches, holding Left Alt looks around, G stays the super and heal moves from C to H. (Layout 3, out for a
  // few hours, had crouch on G, look on C and the super on B.) A save that still has an old default there moves once; a key
  // the player chose themselves stays theirs.
  if (typeof r.keysVersion !== 'number' || r.keysVersion < 4) {
    rk = { ...rk };
    // Left unbound here, they take their new defaults below (or a spare key if the save already uses those).
    if (rk.heal === 'KeyC') delete rk.heal;
    if (r.keysVersion === 3) {
      if (rk.crouch === 'KeyG') delete rk.crouch;
      if (rk.look === 'KeyC') delete rk.look;
      if (rk.super === 'KeyB') delete rk.super;
    }
  }
  const used = new Set<string>();
  const saved = (a: Action) => {
    const k = rk[a];
    return typeof k === 'string' && k && !RESERVED.has(k) ? k : null;
  };
  // Saved bindings first; an action the save doesn't know (added since) gets its default, or a spare key if a saved
  // binding took that, so new actions never wipe a player's own layout.
  for (const [a] of ACTIONS) {
    const k = saved(a);
    if (k && !used.has(k)) {
      keys[a] = k;
      used.add(k);
    }
  }
  for (const [a] of ACTIONS) {
    if (saved(a) && keys[a] === saved(a)) continue;
    keys[a] = !used.has(DEFAULT_KEYS[a]) ? DEFAULT_KEYS[a] : (SPARE_KEYS.find((k) => !used.has(k)) ?? DEFAULT_KEYS[a]);
    used.add(keys[a]);
  }
  // A duplicate left by an old save falls back to the defaults as a whole: never two actions on one key.
  const valid = new Set(Object.values(keys)).size === ACTIONS.length;
  return {
    keys: valid ? keys : { ...DEFAULT_KEYS },
    sensitivity: clamp(r.sensitivity, 0.2, 3, d.sensitivity),
    invertY: bool(r.invertY, d.invertY),
    touchSize: clamp(r.touchSize, 0.7, 1.4, d.touchSize),
    touchOpacity: clamp(r.touchOpacity, 0.3, 1, d.touchOpacity),
    leftHanded: bool(r.leftHanded, d.leftHanded),
    // An old save keeps its own choice (a saved 'third' cannot be told from a chosen one); a missing or broken one gets the default.
    camera: r.camera === 'first' || r.camera === 'shoulder' || r.camera === 'third' ? r.camera : d.camera,
    fov: clamp(r.fov, 60, 100, d.fov),
    quality: r.quality === 'low' || r.quality === 'medium' || r.quality === 'high' ? r.quality : 'auto',
    shadows: bool(r.shadows, d.shadows),
    resolution: clamp(r.resolution, 0.5, 1, d.resolution),
    showFps: bool(r.showFps, d.showFps),
    master: clamp(r.master, 0, 1, d.master),
    guns: clamp(r.guns, 0, 1, d.guns),
    steps: clamp(r.steps, 0, 1, d.steps),
    muted: bool(r.muted, d.muted),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    colorBlind: bool(r.colorBlind, d.colorBlind),
    largeHud: bool(r.largeHud, d.largeHud),
    showKeyHints: bool(r.showKeyHints, d.showKeyHints),
    keysVersion: d.keysVersion,
  };
};

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const loadSettings = (storage: Store): Settings => {
  try {
    const s = storage.getItem(SETTINGS_KEY);
    return normalize(s ? JSON.parse(s) : {});
  } catch {
    return normalize({});
  }
};

export const saveSettings = (storage: Store, s: Settings) => {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the settings last for this visit */
  }
};

export type RebindResult = { ok: true; settings: Settings; swapped: Action | null } | { ok: false; reason: 'reserved' };

/**
 * Binds `code` to `action`. A key another action already uses is swapped (that action takes the old key), so two actions
 * never share a key and nothing is left unbound; `swapped` says which action moved, for the "conflict" note.
 */
export const rebind = (s: Settings, action: Action, code: string): RebindResult => {
  if (RESERVED.has(code)) return { ok: false, reason: 'reserved' };
  const keys = { ...s.keys };
  const other = (Object.keys(keys) as Action[]).find((a) => a !== action && keys[a] === code) ?? null;
  if (other) keys[other] = keys[action];
  keys[action] = code;
  return { ok: true, settings: { ...s, keys }, swapped: other };
};

/** Every key that triggers each action (its binding plus the fixed alternates). */
export const keyMap = (keys: Record<Action, string>): Record<Action, string[]> => {
  const out = {} as Record<Action, string[]>;
  for (const [a] of ACTIONS) out[a] = [keys[a], ...(FIXED_KEYS[a] ?? [])];
  return out;
};

/** Which action a key press means (null for an unbound key). */
export const actionFor = (keys: Record<Action, string>, code: string): Action | null => {
  for (const [a] of ACTIONS) if (keys[a] === code || FIXED_KEYS[a]?.includes(code)) return a;
  return null;
};

/** A key code as the player knows it: "KeyW" -> "W", "ShiftLeft" -> "Left Shift". */
export const keyLabel = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter',
    Backspace: 'Backspace', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return named[code] ?? code;
};
