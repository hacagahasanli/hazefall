'use client';

import { useEffect, useRef, useState } from 'react';

import { startMatch } from '~/game/render/game';
import { FIGHTERS } from '~/game/sim/constants';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { TouchControls, useTouch } from '~/components/TouchControls';
import type { Session } from '~/game/net/session';
import type { HudState } from '~/game/render/game';
import type { VolumeKind } from '~/game/sfx';
import type { FighterId } from '~/game/sim/types';

const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="panel-cut h-3 w-44 bg-ink-deep/80 sm:w-64">
    <div
      className="h-full transition-[width] duration-150"
      style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }}
    />
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
          <span className="w-9 text-right text-xs tabular-nums text-cream/60">
            {Math.round(v[kind] * 100)}
          </span>
        </label>
      ))}
    </div>
  );
};

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The round report: where you placed, who took you out and with what, and how your round went,
 * then straight into the next match or back to the lobby.
 */
const Result = ({
  hud,
  onPlayAgain,
  onExit,
  online,
}: {
  hud: HudState;
  onPlayAgain: () => void;
  onExit: () => void;
  online: boolean;
}) => {
  // The host's browser runs the round: it must stay until the round is over.
  const hostWaits = online && hud.host && hud.phase !== 'over';
  const stats: [string, string][] = [
    ['Kills', String(hud.kills)],
    ['Damage dealt', String(hud.damage)],
    ['Accuracy', `${hud.accuracy}%`],
    ['Survived', fmtTime(hud.survived)],
    ['Distance', `${hud.distance} m`],
  ];
  const killerColor = hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff';
  return (
    <div className="absolute inset-0 z-30 flex animate-[fadeIn_0.6s_ease-out] items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.72),rgba(10,13,24,0.95))] px-6 py-4 backdrop-blur-sm">
      <div className="flex w-full max-w-4xl flex-col gap-8 [@media(max-height:520px)]:gap-3">
        <div className="flex flex-wrap items-end gap-8 [@media(max-height:520px)]:gap-4">
          <div className="flex items-baseline font-display leading-none">
            <span
              className={`text-[7rem] sm:text-[11rem] [@media(max-height:520px)]:text-[5.5rem] ${hud.won ? 'text-gold' : 'text-cream'}`}
            >
              #{hud.won ? 1 : hud.placement}
            </span>
            <span className="text-4xl text-cream/40">/{hud.total}</span>
          </div>
          <div className="flex flex-col gap-2 pb-6 [@media(max-height:520px)]:pb-2">
            <span
              className={`text-xs font-bold tracking-[0.35em] ${hud.won ? 'text-green' : 'text-orange'}`}
            >
              {hud.won ? 'ROUND WON' : 'ELIMINATED'}
            </span>
            <h2 className="font-display text-3xl leading-none sm:text-5xl [@media(max-height:520px)]:text-3xl">
              {hud.won ? 'MERGED TO MAIN' : 'YOUR COMMIT WAS REVERTED'}
            </h2>
            <p className="text-lg text-cream/80">
              {hud.won ? (
                <>{hud.total - 1} down, one standing. You shipped it.</>
              ) : hud.killedBy ? (
                <>
                  Taken out by{' '}
                  <b className="font-display" style={{ color: killerColor }}>
                    {hud.killedBy}
                  </b>{' '}
                  with {hud.killedWith}.
                </>
              ) : (
                <>Caught outside by {hud.killedWith ?? 'the Deadline'}.</>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 [@media(max-height:520px)]:grid-cols-5 [@media(max-height:520px)]:gap-2">
          {stats.map(([label, value], i) => (
            <div
              key={label}
              className="panel-cut flex animate-[riseIn_0.5s_ease-out_both] flex-col gap-1 bg-ink/90 p-4 [@media(max-height:520px)]:p-2.5"
              style={{ animationDelay: `${0.25 + i * 0.08}s` }}
            >
              <span className="font-display text-3xl text-cream [@media(max-height:520px)]:text-2xl">
                {value}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-cream/55">
                {label}
              </span>
            </div>
          ))}
        </div>

        {hostWaits && (
          <p className="text-sm text-cream/70">
            You are the host: the round runs on your device, so it goes on for the others until
            there is a winner. {hud.alive} still standing.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            disabled={hostWaits}
            onClick={onPlayAgain}
            className="panel-cut flex items-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase disabled:opacity-40 [@media(max-height:520px)]:py-3 text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.3)] hover:brightness-110"
          >
            {online ? 'Back to the room →' : 'Play again →'}
          </button>
          {!online && (
            <button
              type="button"
              onClick={onExit}
              className="panel-cut bg-cream/10 px-8 py-4 font-bold uppercase tracking-wider text-cream/90 hover:bg-cream/20 [@media(max-height:520px)]:py-3"
            >
              Back to lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const Match = ({
  fighter,
  session,
  onExit,
  onPlayAgain,
}: {
  fighter: FighterId;
  session?: Session;
  onExit: () => void;
  onPlayAgain: () => void;
}) => {
  const online = !!session?.online;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startMatch> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastEsc = useRef(0);
  const touch = useTouch();

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
        m = startMatch(canvas, {
          fighter,
          name: 'you',
          aimMode: readAim(),
          minimap,
          onHud: setHud,
          session,
        });
        gameRef.current = m;
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gameRef.current = null;
      m?.dispose();
    };
  }, [fighter, session]);

  const f = FIGHTERS[fighter];
  const over = hud && (hud.dead || hud.phase === 'over');
  // Let the fall play out first (or the win sink in) before the report comes up.
  const showResult =
    !!hud && ((hud.dead && hud.deadFor > 1.6) || (hud.won && hud.phase === 'over'));

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
    <main className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
      {!hud && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink-deep"
          role="status"
          aria-live="polite"
        >
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
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(47,140,255,0.12) 35%, rgba(30,90,220,0.42) 100%)',
            }}
          />
          <div
            key={hud.zoneHits}
            className="pointer-events-none absolute inset-0 z-20 animate-[zonePulse_0.7s_ease-out_forwards]"
            style={{ boxShadow: 'inset 0 0 140px 40px rgba(255,40,60,0.75)' }}
          />
        </>
      )}
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`}
      />

      {/* Minimap */}
      {/* On phones it sits top right, out of the thumbs' way. */}
      <div
        className={`panel-cut absolute bg-ink-deep/80 p-1.5 ${touch ? 'right-2 top-2' : 'bottom-3 right-3'}`}
        style={touch ? { marginRight: 'env(safe-area-inset-right)' } : undefined}
      >
        {/* Big while you're on the plane choosing where to jump. */}
        <canvas
          ref={mapRef}
          width={hud?.stage === 'drone' ? 340 : 192}
          height={hud?.stage === 'drone' ? 340 : 192}
          className={
            hud?.stage === 'drone'
              ? touch
                ? 'block h-[min(340px,62vh,62vw)] w-[min(340px,62vh,62vw)]'
                : 'block h-[340px] w-[340px]'
              : touch
                ? 'block h-[min(120px,28vh,30vw)] w-[min(120px,28vh,30vw)]'
                : 'block h-48 w-48'
          }
        />
      </div>

      {hud && (
        <>
          {/* You */}
          <div
            className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1.5"
            style={touch ? { marginLeft: 'env(safe-area-inset-left)' } : undefined}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg" style={{ color: f.color }}>
                {f.name}
              </span>
              <span className="text-xs text-cream/60">{hud.weapon}</span>
              {hud.mag !== Infinity && (
                <span
                  className={`font-display text-sm ${hud.mag === 0 ? 'text-orange' : 'text-cream'}`}
                >
                  {hud.mag}
                  <span className="text-cream/50"> / {hud.ammo}</span>
                </span>
              )}
              {hud.reloading !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-gold">
                  RELOADING
                  <span className="h-1 w-12 overflow-hidden rounded bg-cream/15">
                    <span
                      className="block h-full bg-gold"
                      style={{ width: `${hud.reloading * 100}%` }}
                    />
                  </span>
                </span>
              )}
              {hud.item && (
                <span className="rounded bg-cream/10 px-1.5 text-xs">
                  {hud.item === 'bomb' ? 'Bomb' : 'Med kit'}
                </span>
              )}
            </div>
            <Bar
              value={hud.hp}
              max={hud.maxHp}
              color={hud.hp / hud.maxHp > 0.35 ? '#3ddc84' : '#ff3d6e'}
            />
            {hud.armor > 0 && <Bar value={hud.armor} max={100} color="#3ec5ff" />}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">
                {touch ? 'Super' : 'G'} · {hud.superName}
              </span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div
                  className="h-full"
                  style={{
                    width: `${hud.superCharge * 100}%`,
                    background: hud.superCharge >= 1 ? '#ffd23f' : '#8b93ad',
                  }}
                />
              </div>
              {hud.superCharge >= 1 && <span className="font-bold text-gold">ready</span>}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">{touch ? 'Roll' : 'Shift · Roll'}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(1, hud.roll) * 100}%`,
                    background: hud.roll >= 1 ? '#3ec5ff' : '#8b93ad',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Deadline and players left */}
          <div
            className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[124px] sm:top-3' : 'top-3'}`}
          >
            <div className="panel-cut flex items-center gap-3 bg-ink-deep/85 px-3 py-1 sm:gap-4 sm:px-4 sm:py-1.5">
              <span className="font-display text-xl text-cream">{hud.alive}</span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">LEFT</span>
              <span
                className={`text-sm ${hud.zone.outside ? 'font-bold text-orange' : 'text-cream/80'}`}
              >
                {hud.zone.outside ? 'Outside the Deadline!' : hud.zone.label}
                {hud.zone.seconds > 0 && (
                  <span className="ml-2 font-display text-gold">{hud.zone.seconds}s</span>
                )}
              </span>
            </div>
          </div>

          {/* First person: a crosshair, and how to take the mouse. */}
          {hud.firstPerson && !over && (
            <>
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" />
              </div>
              {!hud.mouseLocked && !touch && (
                <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
                  <span className="panel-cut bg-ink-deep/85 px-4 py-2 text-sm text-cream">Click to look around with the mouse · Esc lets it go</span>
                </div>
              )}
            </>
          )}

          {/* Online: how the line is doing. */}
          {hud.net && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[158px] sm:top-12' : 'top-12'}`}
            >
              <span className="rounded bg-ink-deep/70 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-cream/60">
                {hud.host
                  ? `HOST · ${hud.net.total ? `${hud.net.direct}/${hud.net.total} DIRECT` : 'SOLO'}${hud.net.total ? ` · ${hud.net.rtt} MS` : ''}`
                  : `${hud.net.direct ? 'DIRECT' : 'VIA SERVER'} · ${hud.net.rtt} MS`}
              </span>
            </div>
          )}

          {/* Kill feed */}
          <div
            className={`pointer-events-none absolute flex flex-col items-end gap-1 text-xs ${touch ? 'right-2 top-[176px] sm:top-[min(140px,32vh,33vw)]' : 'right-4 top-3'}`}
          >
            {hud.feed.map((k) => (
              <span key={k.id} className="rounded bg-ink-deep/80 px-2 py-0.5 text-cream/80">
                {k.text}
              </span>
            ))}
          </div>

          {/* Prompt */}
          {hud.prompt && !over && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'bottom-[150px] sm:bottom-6' : 'bottom-24'}`}
            >
              <span className="panel-cut bg-ink-deep/85 px-4 py-1.5 text-sm text-cream">
                {hud.prompt}
              </span>
            </div>
          )}

          {touch && !over && !menuOpen && (
            <TouchControls
              press={(b, on) => gameRef.current?.press(b, on)}
              onMove={(x, y) => gameRef.current?.setStick(x, y)}
              onPause={() => setMenuOpen(true)}
              onPlane={hud.stage === 'drone'}
              superReady={hud.superCharge}
              rollReady={Math.min(1, hud.roll)}
            />
          )}

          {/* Controls */}
          {!touch && (
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
          )}

          {/* Esc Esc menu */}
          {menuOpen && !over && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-deep/70">
              <div
                role="dialog"
                aria-label="Paused"
                className="panel-cut flex max-h-[94vh] w-[22rem] max-w-[94vw] flex-col items-center gap-4 overflow-y-auto bg-ink p-6 text-center sm:p-7"
              >
                <div className="font-display text-4xl text-gold">{online ? 'Menu' : 'Paused'}</div>
                {online && (
                  <p className="text-xs text-cream/60">
                    Online the round keeps going while this menu is open.
                  </p>
                )}
                {touch ? (
                  <p className="text-xs text-cream/60">
                    On a touch screen FIRE aims by itself at whoever you can see.
                  </p>
                ) : (
                  <AimChoice value={hud.aimMode} onChange={(m) => gameRef.current?.setAimMode(m)} />
                )}
                <SoundSliders game={gameRef.current} />
                <button
                  type="button"
                  autoFocus
                  onClick={() => setMenuOpen(false)}
                  className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="panel-cut w-full bg-orange/90 px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  {online && hud.host ? 'End the round for everyone' : 'Leave match'}
                </button>
                {!touch && <p className="text-[10px] text-cream/40">Esc to resume</p>}
              </div>
            </div>
          )}

          {/* Result: after the fall (or the win) settles, a full-screen round report. */}
          {showResult && (
            <Result hud={hud} onPlayAgain={onPlayAgain} onExit={onExit} online={online} />
          )}
        </>
      )}
    </main>
  );
};
