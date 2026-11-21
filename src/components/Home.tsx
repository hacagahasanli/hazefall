'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { DISTRICTS, FIGHTERS, PLAYERS, WORLD } from '~/game/sim/constants';

import { Support } from '~/components/SupportLink';

import type { FighterId } from '~/game/sim/types';

const IDS = Object.keys(FIGHTERS) as FighterId[];

/**
 * A tactical map like the one you see from the plane: the whole battleground, the plane's route
 * with the plane on it, district names, and the Deadline closing phase by phase in a loop.
 */
const TacticalMap = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    let raf = 0;
    let base: HTMLCanvasElement | null = null;
    // The map image is built on the next frame so the page paints first.
    void import('~/game/render/mapImage').then(({ paintMapImage }) => {
      base = paintMapImage(3);
    });
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const W = c.width;
      const s = W / WORLD;
      g.fillStyle = '#0a0d18';
      g.fillRect(0, 0, W, W);
      if (base) {
        g.globalAlpha = 0.92;
        g.drawImage(base, 0, 0, W, W);
        g.globalAlpha = 1;
      }
      // Grid lines, like a field map.
      g.strokeStyle = 'rgba(10,13,24,0.25)';
      g.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        g.beginPath();
        g.moveTo((i * W) / 8, 0);
        g.lineTo((i * W) / 8, W);
        g.moveTo(0, (i * W) / 8);
        g.lineTo(W, (i * W) / 8);
        g.stroke();
      }
      // The Deadline: shrinks over 16 s through four circles, then starts again.
      const phases = [0.62, 0.42, 0.24, 0.1, 0.03];
      const cx = [0.5, 0.54, 0.5, 0.47, 0.49];
      const cy = [0.5, 0.47, 0.44, 0.47, 0.45];
      const p = (t % 16) / 4;
      const i = Math.min(3, Math.floor(p));
      const f = Math.min(1, (p - i) * 1.6);
      const lerp = (a: number, b: number) => a + (b - a) * f;
      const zr = lerp(phases[i], phases[i + 1]) * W;
      const zx = lerp(cx[i], cx[i + 1]) * W;
      const zy = lerp(cy[i], cy[i + 1]) * W;
      // Outside the Deadline: tinted blue.
      g.save();
      g.beginPath();
      g.rect(0, 0, W, W);
      g.arc(zx, zy, zr, 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(47,140,255,0.28)';
      g.fill('evenodd');
      g.restore();
      g.strokeStyle = '#3ea0ff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(zx, zy, zr, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx[i + 1] * W, cy[i + 1] * W, phases[i + 1] * W, 0, Math.PI * 2);
      g.stroke();
      // The plane's route across the map, the plane on it.
      const ax = 0.04 * W;
      const ay = 0.82 * W;
      const bx = 0.96 * W;
      const by = 0.12 * W;
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(255,210,63,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
      const k = (t % 9) / 9;
      const px = ax + (bx - ax) * k;
      const py = ay + (by - ay) * k;
      g.save();
      g.translate(px, py);
      g.rotate(Math.atan2(by - ay, bx - ax));
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(9, 0);
      g.lineTo(-6, -7);
      g.lineTo(-3, 0);
      g.lineTo(-6, 7);
      g.closePath();
      g.fill();
      g.restore();
      // District names.
      g.font = '600 10px "Chakra Petch", system-ui, sans-serif';
      g.textAlign = 'center';
      for (const d of DISTRICTS) {
        const x = ((d.x0 + d.x1) / 2) * s;
        const y = ((d.y0 + d.y1) / 2) * s;
        g.fillStyle = 'rgba(10,13,24,0.7)';
        const w = g.measureText(d.name.toUpperCase()).width + 8;
        g.fillRect(x - w / 2, y - 7, w, 14);
        g.fillStyle = '#e6ebf5';
        g.fillText(d.name.toUpperCase(), x, y + 3.5);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={300} height={300} className="block h-full w-full" aria-label="Map of the battleground" role="img" />;
};

export const Home = () => {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [portraits, setPortraits] = useState<Record<FighterId, string> | null>(null);

  // The live battleground behind everything, built after the page has painted.
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ renderPortraits, startShowcase }) => {
          if (cancelled) return;
          setPortraits(renderPortraits());
          dispose = startShowcase(canvas, () => setLive(true)).dispose;
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dispose?.();
    };
  }, []);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-ink-deep text-cream">
      <canvas
        ref={bgRef}
        className={`fixed inset-0 h-full w-full transition-opacity duration-1000 ${live ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      />
      {/* Darken the left for the title, and the bottom for the cards. */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.92)_0%,rgba(10,13,24,0.7)_34%,rgba(10,13,24,0.1)_62%,rgba(10,13,24,0)_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-72 bg-gradient-to-t from-ink-deep via-ink-deep/80 to-transparent" />
      {/* Narrow screens: the text runs the full width, so darken the whole backdrop a little. */}
      <div className="pointer-events-none fixed inset-0 bg-ink-deep/55 lg:hidden" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-between gap-10 px-5 pb-8 pt-8 sm:px-8">

        <section className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-xl flex-col gap-6">
            <h1 className="font-display text-6xl leading-[0.95] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-8xl">
              LAST COMMIT
              <br />
              <span className="text-gold">STANDING</span>
            </h1>
            <p className="max-w-md text-lg text-cream/85">
              Twenty developers jump from the cargo plane over the countryside. Land, loot a gun, take cover, and stay inside the
              Deadline as it closes in. The last commit standing ships.
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
              {[
                [String(PLAYERS), 'players drop'],
                ['176 m', 'battleground'],
                ['~4 min', 'to the last circle'],
                ['1', 'winner'],
              ].map(([n, label]) => (
                <div key={label} className="flex flex-col">
                  <span className="font-display text-2xl text-cream">{n}</span>
                  <span className="text-[11px] uppercase tracking-widest text-cream/55">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/play"
                className="panel-cut group flex items-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110"
              >
                Drop in
                <span className="transition group-hover:translate-x-1">→</span>
              </Link>
              <a href="#how" className="panel-cut bg-cream/10 px-6 py-4 font-bold uppercase tracking-wider text-cream/90 hover:bg-cream/20">
                How to play
              </a>
            </div>
            <Support variant="menu" className="w-full max-w-md" />
          </div>

          <aside className="panel-cut hidden w-[320px] flex-col gap-2 bg-ink-deep/80 p-3 backdrop-blur lg:flex">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
              <span className="text-gold">Flight path</span>
              <span className="text-blue">Deadline closing</span>
            </div>
            <div className="aspect-square w-full overflow-hidden">
              <TacticalMap />
            </div>
            <div className="flex justify-between text-[10px] text-cream/50">
              <span>Jump anywhere on the line</span>
              <span>Stay inside the circle</span>
            </div>
          </aside>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-xl">Choose who you drop as</h2>
            <span className="text-xs text-cream/50">Everyone gets the same guns: the super is yours</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {IDS.map((id) => {
              const f = FIGHTERS[id];
              return (
                <Link
                  key={id}
                  href="/play"
                  className="panel-cut group relative flex h-44 overflow-hidden border border-cream/10 bg-ink/80 backdrop-blur transition hover:border-cream/30"
                >
                  <div className="absolute inset-0 opacity-30 transition group-hover:opacity-50" style={{ background: `radial-gradient(circle at 75% 60%, ${f.color}, transparent 65%)` }} />
                  <div className="relative z-10 flex flex-1 flex-col justify-end gap-1 p-4">
                    <span className="font-display text-2xl leading-none" style={{ color: f.color }}>
                      {f.name}
                    </span>
                    <span className="text-xs text-cream/60">{f.role}</span>
                    <span className="mt-1 text-xs text-cream/85">
                      <b className="text-cream">G · {f.superName}</b>: {f.superText}
                    </span>
                  </div>
                  {portraits && (
                    // A rendered portrait, not a photo: plain <img> is right here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portraits[id]} alt="" className="relative -mr-4 h-full w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] transition group-hover:scale-105" />
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        <section id="how" className="grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Drop', 'The plane crosses the map. Jump when you like, free-fall through the clouds, steer your parachute down. You land with a pistol and one magazine.'],
            ['02', 'Loot', 'Guns, armor, ammo, med kits and bombs lie in the houses, barns and the yards. Walk over them or press F. Every gun sounds and kicks like itself.'],
            ['03', 'Survive', 'The Deadline closes in phase by phase and hurts more each time. Hide in tall grass, lean round corners with Q and E, vault fences. Be the last one.'],
          ].map(([n, title, text]) => (
            <div key={n} className="panel-cut flex gap-4 bg-ink/80 p-4 backdrop-blur">
              <span className="font-display text-3xl text-gold/80">{n}</span>
              <div className="flex flex-col gap-1">
                <span className="font-display text-lg">{title}</span>
                <span className="text-sm text-cream/75">{text}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
};
