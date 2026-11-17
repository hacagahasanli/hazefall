'use client';

import { useEffect, useRef, useState } from 'react';

import { startMatch } from '~/game/render/game';
import { FIGHTERS } from '~/game/sim/constants';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import type { HudState } from '~/game/render/game';
import type { VolumeKind } from '~/game/sfx';
import type { FighterId } from '~/game/sim/types';

const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="panel-cut h-3 w-64 bg-ink-deep/80">
    <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }} />
  </div>
);

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

const VOLUME_LABELS: { kind: VolumeKind; label: string }[] = [
  { kind: 'master', label: 'All sound' },
  { kind: 'guns', label: 'Gunshots' },
  { kind: 'steps', label: 'Footsteps' },
];

/** Volume sliders, applied at once and remembered in this browser. */
const SoundSliders = ({ game }: { game: ReturnType<typeof startMatch> | null }) => {
  const [v, setV] = useState(() => game?.volumes() ?? { master: 0.8, guns: 0.6, steps: 0.8 });
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <span className="text-[10px] font-semibold tracking-widest text-cream/50">SOUND</span>
      {VOLUME_LABELS.map(({ kind, label }) => (
        <label key={kind} className="flex items-center gap-3 text-sm text-cream/80">
          <span className="w-24 shrink-0">{label}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(v[kind] * 100)}
            onChange={(e) => {
              const value = Number(e.target.value) / 100;
              game?.setVolume(kind, value);
              setV((old) => ({ ...old, [kind]: value }));
            }}
            className="h-1.5 flex-1 cursor-pointer accent-[#ffd23f]"
            aria-label={label}
          />
          <span className="w-9 text-right text-xs tabular-nums text-cream/60">{Math.round(v[kind] * 100)}</span>
        </label>
      ))}
    </div>
  );
};

export const Match = ({ fighter, onExit }: { fighter: FighterId; onExit: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startMatch> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastEsc = useRef(0);

  // Building the map takes a moment and blocks the page: let the loading screen paint first
  // (two animation frames), then build. The screen goes when the first HUD update arrives.
  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = mapRef.current;
    if (!canvas || !minimap) return;
    let m: ReturnType<typeof startMatch> | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        m = startMatch(canvas, { fighter, name: 'you', aimMode: readAim(), minimap, onHud: setHud });
        gameRef.current = m;
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gameRef.current = null;
      m?.dispose();
    };
  }, [fighter]);

  const f = FIGHTERS[fighter];
  const over = hud && (hud.dead || hud.phase === 'over');

  // Esc twice opens the menu and pauses the match (it's offline, so pausing is fair). Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      const now = performance.now();
      const double = now - lastEsc.current < 450;
      lastEsc.current = double ? 0 : now;
      if (double) setMenuOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    gameRef.current?.setPaused(menuOpen);
  }, [menuOpen]);

  // Remember the aim choice, whether it was made in the menu or with T.
  useEffect(() => {
    if (!hud) return;
    saveAim(hud.aimMode);
  }, [hud?.aimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-ink-deep">
      {!hud && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink-deep" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cream/15 border-t-gold" />
          <div className="font-display text-2xl text-gold">Loading the map</div>
          <p className="text-sm text-cream/60">Boarding the plane with nine others…</p>
        </div>
      )}
      {/* Outside the Deadline: the screen turns blue, and the edges flash red with every bite. */}
      {hud?.zone.outside && !hud.dead && hud.phase !== 'over' && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ background: 'radial-gradient(ellipse at center, rgba(47,140,255,0.12) 35%, rgba(30,90,220,0.42) 100%)' }}
          />
          <div
            key={hud.zoneHits}
            className="pointer-events-none absolute inset-0 z-20 animate-[zonePulse_0.7s_ease-out_forwards]"
            style={{ boxShadow: 'inset 0 0 140px 40px rgba(255,40,60,0.75)' }}
          />
        </>
      )}
      <canvas ref={canvasRef} className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`} />

      {/* Minimap */}
      <div className="panel-cut absolute bottom-3 right-3 bg-ink-deep/80 p-1.5">
        {/* Big while you're on the plane choosing where to jump. */}
        <canvas
          ref={mapRef}
          width={hud?.stage === 'drone' ? 340 : 192}
          height={hud?.stage === 'drone' ? 340 : 192}
          className={hud?.stage === 'drone' ? 'block h-[340px] w-[340px]' : 'block h-48 w-48'}
        />
      </div>

      {hud && (
        <>
          {/* You */}
          <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg" style={{ color: f.color }}>
                {f.name}
              </span>
              <span className="text-xs text-cream/60">{hud.weapon}</span>
              {hud.mag !== Infinity && (
                <span className={`font-display text-sm ${hud.mag === 0 ? 'text-orange' : 'text-cream'}`}>
                  {hud.mag}
                  <span className="text-cream/50"> / {hud.ammo}</span>
                </span>
              )}
              {hud.reloading !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-gold">
                  RELOADING
                  <span className="h-1 w-12 overflow-hidden rounded bg-cream/15">
                    <span className="block h-full bg-gold" style={{ width: `${hud.reloading * 100}%` }} />
                  </span>
                </span>
              )}
              {hud.item && <span className="rounded bg-cream/10 px-1.5 text-xs">{hud.item === 'bomb' ? 'Bomb' : 'Med kit'}</span>}
            </div>
            <Bar value={hud.hp} max={hud.maxHp} color={hud.hp / hud.maxHp > 0.35 ? '#3ddc84' : '#ff3d6e'} />
            {hud.armor > 0 && <Bar value={hud.armor} max={100} color="#3ec5ff" />}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">G · {hud.superName}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div className="h-full" style={{ width: `${hud.superCharge * 100}%`, background: hud.superCharge >= 1 ? '#ffd23f' : '#8b93ad' }} />
              </div>
              {hud.superCharge >= 1 && <span className="font-bold text-gold">ready</span>}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">Shift · Roll</span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div className="h-full" style={{ width: `${Math.min(1, hud.roll) * 100}%`, background: hud.roll >= 1 ? '#3ec5ff' : '#8b93ad' }} />
              </div>
            </div>
          </div>

          {/* Deadline and players left */}
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="panel-cut flex items-center gap-4 bg-ink-deep/85 px-4 py-1.5">
              <span className="font-display text-xl text-cream">{hud.alive}</span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">LEFT</span>
              <span className={`text-sm ${hud.zone.outside ? 'font-bold text-orange' : 'text-cream/80'}`}>
                {hud.zone.outside ? 'Outside the Deadline!' : hud.zone.label}
                {hud.zone.seconds > 0 && <span className="ml-2 font-display text-gold">{hud.zone.seconds}s</span>}
              </span>
            </div>
          </div>

          {/* Kill feed */}
          <div className="pointer-events-none absolute right-4 top-3 flex flex-col items-end gap-1 text-xs">
            {hud.feed.map((k) => (
              <span key={k.id} className="rounded bg-ink-deep/80 px-2 py-0.5 text-cream/80">
                {k.text}
              </span>
            ))}
          </div>

          {/* Prompt */}
          {hud.prompt && !over && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
              <span className="panel-cut bg-ink-deep/85 px-4 py-1.5 text-sm text-cream">{hud.prompt}</span>
            </div>
          )}

          {/* Controls */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
            <span className="flex items-center gap-1">
              <Key k="W" />
              <Key k="A" />
              <Key k="S" />
              <Key k="D" /> move
            </span>
            <span className="flex items-center gap-1">
              <Key k="Space" /> shoot / jump
            </span>
            <span className="flex items-center gap-1">
              <Key k="Q" />
              <Key k="E" /> lean
            </span>
            <span className="flex items-center gap-1">
              <Key k="G" /> super
            </span>
            <span className="flex items-center gap-1">
              <Key k="F" /> pick up / use
            </span>
            <span className="flex items-center gap-1">
              <Key k="R" /> reload
            </span>
            <span className="flex items-center gap-1">
              <Key k="Shift" /> roll
            </span>
            <span className="flex items-center gap-1">
              <Key k="T" /> {hud.aimMode === 'mouse' ? 'mouse aim' : 'auto-aim'}
            </span>
            <span className="flex items-center gap-1">
              <Key k="M" /> mute
            </span>
            <span className="flex items-center gap-1">
              <Key k="Esc" />
              <Key k="Esc" /> menu
            </span>
            <span>{hud.fps} fps</span>
          </div>

          {/* Esc Esc menu */}
          {menuOpen && !over && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-deep/70">
              <div role="dialog" aria-label="Paused" className="panel-cut flex w-[22rem] flex-col items-center gap-4 bg-ink p-7 text-center">
                <div className="font-display text-4xl text-gold">Paused</div>
                <AimChoice value={hud.aimMode} onChange={(m) => gameRef.current?.setAimMode(m)} />
                <SoundSliders game={gameRef.current} />
                <button
                  type="button"
                  autoFocus
                  onClick={() => setMenuOpen(false)}
                  className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  Resume
                </button>
                <button type="button" onClick={onExit} className="panel-cut w-full bg-orange/90 px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                  Leave match
                </button>
                <p className="text-[10px] text-cream/40">Esc to resume</p>
              </div>
            </div>
          )}

          {/* Result */}
          {over && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-deep/70">
              <div className="panel-cut flex w-[26rem] flex-col items-center gap-3 bg-ink p-8 text-center">
                <div className="text-xs font-bold tracking-[0.3em] text-blue">{hud.won ? 'SHIPPED' : 'ROUND OVER FOR YOU'}</div>
                <div className="font-display text-4xl text-gold">{hud.won ? 'Last commit standing' : `#${hud.placement} of 10`}</div>
                <div className="flex gap-6 text-sm text-cream/80">
                  <span>
                    <b className="font-display text-xl text-cream">{hud.kills}</b> KOs
                  </span>
                  <span>
                    <b className="font-display text-xl text-cream">{hud.damage}</b> damage
                  </span>
                </div>
                <button type="button" onClick={onExit} className="panel-cut mt-2 w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                  Back to lobby
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
};
