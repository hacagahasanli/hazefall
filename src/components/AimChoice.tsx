import { isTouchUi } from '~/lib/device';

import type { AimMode } from '~/game/render/game';

/**
 * Mouse aim is the default with a mouse; a touch screen has no pointer to aim with and starts on auto-aim. A choice made in
 * the menu is kept in this browser and wins.
 */
export const AIM_KEY = 'lcs:aim';

export const readAim = (): AimMode => {
  const fallback: AimMode = isTouchUi() ? 'auto' : 'mouse';
  try {
    const v = window.localStorage.getItem(AIM_KEY);
    return v === 'mouse' || v === 'auto' ? v : fallback;
  } catch {
    return fallback;
  }
};

export const AimChoice = ({ value, onChange }: { value: AimMode; onChange: (m: AimMode) => void }) => (
  <div className="flex w-full flex-col gap-1.5 text-left">
    <span className="text-xs text-cream/60">Aim</span>
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Aim and shoot">
      {(
        [
          ['auto', 'Auto-aim', 'Left click shoots the nearest enemy you can see'],
          ['mouse', 'Mouse', 'Point to aim, left click to shoot'],
        ] as const
      ).map(([id, label, hint]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`panel-cut flex flex-col gap-0.5 px-3 py-2 text-left ${value === id ? 'bg-green text-ink-deep' : 'bg-cream/10 text-cream hover:bg-cream/15'}`}
        >
          <span className="text-sm font-bold">{label}</span>
          <span className={`text-[10px] leading-tight ${value === id ? 'text-ink-deep/75' : 'text-cream/50'}`}>{hint}</span>
        </button>
      ))}
    </div>
  </div>
);

export const saveAim = (m: AimMode) => {
  try {
    window.localStorage.setItem(AIM_KEY, m);
  } catch {
    /* no storage */
  }
};
