'use client';

/**
 * Settings: a panel that slides in from the left with five tabs (Controls, Camera, Graphics, Audio, Accessibility).
 * Every change is applied at once and saved (see useSettings); Back and Esc close it, Reset all goes back to the defaults.
 * The same panel opens from the main menu and from the pause menu.
 */
import { useEffect, useRef, useState } from 'react';

import { AimChoice } from '~/components/AimChoice';
import { uiTick } from '~/components/uiSound';
import { ACTIONS, DEFAULT_KEYS, DEFAULT_SETTINGS, keyLabel, rebind } from '~/game/settings';

import type { AimMode } from '~/game/render/game';
import type { QualitySetting, Tier } from '~/game/render/quality';
import type { Action, Settings } from '~/game/settings';
import type { ReactNode } from 'react';

type Tab = 'controls' | 'camera' | 'graphics' | 'audio' | 'access';
const TABS: [Tab, string][] = [
  ['controls', 'Controls'],
  ['camera', 'Camera'],
  ['graphics', 'Graphics'],
  ['audio', 'Audio'],
  ['access', 'Accessibility'],
];

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-[10px] font-bold tracking-[0.3em] text-cream/45">{title}</h3>
    {children}
  </section>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex min-h-11 items-center justify-between gap-4 border-b border-cream/5 py-1.5">
    <div className="flex min-w-0 flex-col">
      <span className="text-sm text-cream/90">{label}</span>
      {hint && <span className="text-[11px] text-cream/45">{hint}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
);

const Toggle = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      uiTick();
      onChange(!on);
    }}
    className={`relative h-7 w-12 rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:opacity-35 ${on ? 'border-green bg-green/80' : 'border-cream/25 bg-cream/10'}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow transition-all ${on ? 'left-6' : 'left-0.5'}`} />
  </button>
);

const Slider = ({ value, min, max, step, onChange, label, format, disabled }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string; disabled?: boolean }) => (
  <>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-32 cursor-pointer accent-[#3ddc84] disabled:opacity-35 sm:w-40"
    />
    <span className="w-12 text-right text-xs tabular-nums text-cream/60">{format(value)}</span>
  </>
);

const Choice = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div className="flex gap-1" role="radiogroup" aria-label={label}>
    {options.map(([v, text]) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={value === v}
        onClick={() => {
          uiTick();
          onChange(v);
        }}
        className={`panel-cut px-3 py-1.5 text-xs font-bold uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-green ${value === v ? 'bg-green text-ink-deep' : 'bg-cream/10 text-cream/75 hover:bg-cream/20'}`}
      >
        {text}
      </button>
    ))}
  </div>
);

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The rebinding list: click a key, press the new one (Esc cancels). A key in use is swapped, and the panel says so. */
const KeyBindings = ({ s, set }: { s: Settings; set: (s: Settings) => void }) => {
  const [listening, setListening] = useState<Action | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setListening(null);
        setNote(null);
        return;
      }
      const r = rebind(s, listening, e.code);
      if (!r.ok) {
        setNote(`${keyLabel(e.code)} is kept for menus and moving. Pick another key, or Esc to cancel.`);
        return;
      }
      set(r.settings);
      uiTick(true);
      const label = (a: Action) => ACTIONS.find(([x]) => x === a)?.[1] ?? a;
      setNote(r.swapped ? `${keyLabel(e.code)} was on "${label(r.swapped)}": that moved to ${keyLabel(r.settings.keys[r.swapped])}.` : null);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, s, set]);

  return (
    <Section title="KEYBOARD">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {ACTIONS.map(([a, label]) => (
          <Row key={a} label={label}>
            <button
              type="button"
              onClick={() => {
                uiTick();
                setNote(null);
                setListening(a);
              }}
              aria-label={`${label}: ${keyLabel(s.keys[a])}. Press to change.`}
              className={`min-w-20 rounded-sm border border-b-[3px] px-2 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-green ${listening === a ? 'animate-pulse border-green bg-green/20 text-green' : s.keys[a] !== DEFAULT_KEYS[a] ? 'border-blue/60 bg-blue/10 text-cream' : 'border-cream/30 bg-cream/10 text-cream'}`}
            >
              {listening === a ? 'Press a key…' : keyLabel(s.keys[a])}
            </button>
          </Row>
        ))}
      </div>
      <p className="min-h-5 text-xs text-green/90" role="status" aria-live="polite">
        {note ?? 'Arrow keys always move too. Esc is kept for menus.'}
      </p>
      <div>
        <button
          type="button"
          onClick={() => {
            uiTick();
            set({ ...s, keys: { ...DEFAULT_KEYS } });
            setNote('Keys reset to default.');
          }}
          className="panel-cut bg-cream/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream/85 hover:bg-cream/20 focus-visible:outline-2 focus-visible:outline-green"
        >
          Reset keys to default
        </button>
      </div>
    </Section>
  );
};

export const SettingsPanel = ({
  settings: s,
  onChange: set,
  onClose,
  touch,
  aim,
  tier,
  portalMuted = false,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  touch: boolean;
  /** The aim mode (a separate saved choice the round also changes with its key). */
  aim?: { value: AimMode; onChange: (m: AimMode) => void };
  /** The tier drawn right now (in a round), to show next to Auto. */
  tier?: Tier;
  /** The portal's own mute is on: it wins over the sliders. */
  portalMuted?: boolean;
}) => {
  const [tab, setTab] = useState<Tab>('controls');
  const panel = useRef<HTMLDivElement>(null);
  const patch = (p: Partial<Settings>) => set({ ...s, ...p });

  // Esc closes (the rebinding list catches Esc first while it listens).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      // Before the pause menu's own Esc (capture phase): Esc closes this panel only.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(), []);

  const tabIndex = TABS.findIndex(([t]) => t === tab);
  return (
    <div className="fixed inset-0 z-40 flex bg-ink-deep/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-label="Settings"
        className="flex h-full w-full max-w-[640px] flex-col border-r border-cream/10 bg-[linear-gradient(100deg,#0a0d18_0%,#121a22_100%)] shadow-[20px_0_60px_rgba(0,0,0,0.5)] [animation:slideIn_0.25s_ease-out]"
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <header className="flex items-end justify-between gap-4 px-5 pb-3 pt-5 sm:px-7">
          <h2 className="font-display text-3xl italic text-green sm:text-4xl">Settings</h2>
        </header>
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto border-b border-cream/10 px-4 sm:px-6"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = TABS[(tabIndex + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
            setTab(next);
            uiTick();
            requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(`#tab-${next}`)?.focus());
          }}
        >
          {TABS.map(([t, label]) => (
            <button
              key={t}
              id={`tab-${t}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => {
                uiTick();
                setTab(t);
              }}
              className={`relative shrink-0 px-3 py-2.5 text-xs font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-green ${tab === t ? 'text-green' : 'text-cream/55 hover:text-cream'}`}
            >
              {label}
              {tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-green" />}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 sm:px-7">
          {tab === 'controls' && (
            <>
              {aim && !touch && (
                <AimChoice value={aim.value} onChange={aim.onChange} />
              )}
              <Section title="MOUSE">
                <Row label="Look sensitivity" hint="First-person camera">
                  <Slider label="Look sensitivity" value={s.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => patch({ sensitivity: v })} format={(v) => `${v.toFixed(2)}x`} />
                </Row>
                <Row label="Invert Y">
                  <Toggle label="Invert Y" on={s.invertY} onChange={(v) => patch({ invertY: v })} />
                </Row>
              </Section>
              {!touch && <KeyBindings s={s} set={set} />}
              <Section title="TOUCH SCREEN">
                <Row label="Button size">
                  <Slider label="Button size" value={s.touchSize} min={0.7} max={1.4} step={0.05} onChange={(v) => patch({ touchSize: v })} format={pct} />
                </Row>
                <Row label="Button opacity">
                  <Slider label="Button opacity" value={s.touchOpacity} min={0.3} max={1} step={0.05} onChange={(v) => patch({ touchOpacity: v })} format={pct} />
                </Row>
                <Row label="Left-handed" hint="Stick on the right, buttons on the left">
                  <Toggle label="Left-handed" on={s.leftHanded} onChange={(v) => patch({ leftHanded: v })} />
                </Row>
              </Section>
            </>
          )}

          {tab === 'camera' && (
            <Section title="CAMERA">
              <Row label="View" hint={touch ? 'First person needs a mouse: on a touch screen the camera stays above.' : 'First person on the ground; the drop stays in third person.'}>
                <Choice
                  label="View"
                  value={touch ? 'third' : s.camera}
                  options={touch ? [['third', 'Third person']] : [['third', 'Third person'], ['first', 'First person']]}
                  onChange={(v) => patch({ camera: v })}
                />
              </Row>
              <Row label="Field of view" hint="First person">
                <Slider label="Field of view" value={s.fov} min={60} max={100} step={1} onChange={(v) => patch({ fov: v })} format={(v) => `${v}°`} disabled={touch || s.camera !== 'first'} />
              </Row>
              <Row label="Mouse sensitivity">
                <Slider label="Mouse sensitivity" value={s.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => patch({ sensitivity: v })} format={(v) => `${v.toFixed(2)}x`} disabled={touch} />
              </Row>
            </Section>
          )}

          {tab === 'graphics' && (
            <Section title="GRAPHICS">
              <Row label="Quality" hint={s.quality === 'auto' ? `Picked for this device${tier ? `: ${tier}` : ''}; steps down if it stutters` : 'Your choice, kept on this device'}>
                <Choice<QualitySetting>
                  label="Quality"
                  value={s.quality}
                  options={[
                    ['auto', 'Auto'],
                    ['low', 'Low'],
                    ['medium', 'Med'],
                    ['high', 'High'],
                  ]}
                  onChange={(v) => patch({ quality: v })}
                />
              </Row>
              <Row label="Shadows" hint="Low quality never draws them">
                <Toggle label="Shadows" on={s.shadows} onChange={(v) => patch({ shadows: v })} />
              </Row>
              <Row label="Resolution" hint="Lower is faster and softer">
                <Slider label="Resolution" value={s.resolution} min={0.5} max={1} step={0.05} onChange={(v) => patch({ resolution: v })} format={pct} />
              </Row>
              <Row label="Show FPS">
                <Toggle label="Show FPS" on={s.showFps} onChange={(v) => patch({ showFps: v })} />
              </Row>
            </Section>
          )}

          {tab === 'audio' && (
            <Section title="AUDIO">
              {portalMuted && <p className="text-xs text-green/90">The game is muted by the page you play it on.</p>}
              <Row label="Master">
                <Slider label="Master volume" value={s.master} min={0} max={1} step={0.01} onChange={(v) => patch({ master: v })} format={pct} />
              </Row>
              <Row label="Gunshots">
                <Slider label="Gunshot volume" value={s.guns} min={0} max={1} step={0.01} onChange={(v) => patch({ guns: v })} format={pct} />
              </Row>
              <Row label="Footsteps">
                <Slider label="Footstep volume" value={s.steps} min={0} max={1} step={0.01} onChange={(v) => patch({ steps: v })} format={pct} />
              </Row>
              <Row label="Mute" hint={`Also ${keyLabel(s.keys.mute)} in a round`}>
                <Toggle label="Mute" on={s.muted} onChange={(v) => patch({ muted: v })} />
              </Row>
            </Section>
          )}

          {tab === 'access' && (
            <Section title="ACCESSIBILITY">
              <Row label="Reduced motion" hint="No camera shake; the menu backdrop holds still">
                <Toggle label="Reduced motion" on={s.reducedMotion} onChange={(v) => patch({ reducedMotion: v })} />
              </Row>
              <Row label="Colour-blind friendly" hint="Blue and orange in place of green and red">
                <Toggle label="Colour-blind friendly" on={s.colorBlind} onChange={(v) => patch({ colorBlind: v })} />
              </Row>
              <Row label="Larger HUD text">
                <Toggle label="Larger HUD text" on={s.largeHud} onChange={(v) => patch({ largeHud: v })} />
              </Row>
            </Section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-cream/10 px-5 py-4 sm:px-7" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={() => {
              uiTick();
              set({ ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } });
            }}
            className="panel-cut bg-cream/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-cream/80 hover:bg-cream/20 focus-visible:outline-2 focus-visible:outline-green"
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={() => {
              uiTick(true);
              onClose();
            }}
            className="panel-cut bg-green px-8 py-2.5 font-display text-base uppercase text-ink-deep hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
          >
            Back
          </button>
        </footer>
      </div>
    </div>
  );
};
