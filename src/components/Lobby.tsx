'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { FighterCard, FighterGrid, FIGHTER_IDS as IDS, HowTo, PICK_KEY, usePortraits } from '~/components/FighterSelect';
import { Match } from '~/components/Match';
import { OnlineInterest } from '~/components/OnlineInterest';
import { OnlinePanel } from '~/components/OnlinePanel';
import { Support, SupportLink } from '~/components/SupportLink';
import { createRoom, joinRoom } from '~/game/net/client';
import { createGuestSession, createHostSession } from '~/game/net/session';
import { COPY } from '~/game/copy/studio';
import { BOT_NAMES, FIGHTERS } from '~/game/sim/constants';
import { ONLINE_PLAY } from '~/lib/studio';
import { loadDone, track } from '~/lib/telemetry';

import type { LobbyState, StartMessage } from '~/game/net/lobby';
import type { Session } from '~/game/net/session';
import type { AimMode } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';

const NAME_KEY = 'lcs:name';
const randomName = () => `${COPY.guestPrefix}${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * The lobby between rounds. Offline: nineteen bots are always ready, you press Ready. With friends:
 * "Play with friends" opens a room and gives you a link; whoever opens it lands in the same
 * room (?room=...), picks a fighter and says ready, and the host starts the round. Same look as
 * the home page (cut panels, rendered portraits, gold call to action) but a calm backdrop.
 */
export const Lobby = () => {
  const [fighter, setFighter] = useState<FighterId>('hotfix');
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aim, setAim] = useState<AimMode>('auto');
  // Online: the room, what it says, and the round being played.
  const [room, setRoom] = useState<Room | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('player');
  const joinedFromLink = useRef(false);
  const fighterRef = useRef(fighter);
  fighterRef.current = fighter;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PICK_KEY) as FighterId | null;
      if (saved && IDS.includes(saved)) setFighter(saved);
      setAim(readAim());
      const n = window.localStorage.getItem(NAME_KEY) || randomName();
      window.localStorage.setItem(NAME_KEY, n);
      setName(n);
    } catch {
      setName(randomName());
    }
  }, []);

  const enter = useCallback(async (roomId: string | null) => {
    setConnecting(true);
    setNotice(null);
    let n = 'player';
    try {
      n = window.localStorage.getItem(NAME_KEY) || randomName();
    } catch {
      /* no storage */
    }
    try {
      const options = { name: n, fighter: fighterRef.current };
      const r = roomId ? await joinRoom(roomId, options) : await createRoom(options);
      setRoom(r);
      const url = new URL(window.location.href);
      url.searchParams.set('room', r.roomId);
      window.history.replaceState(null, '', url);
    } catch {
      setNotice(
        roomId
          ? 'That room is closed, full, or in the middle of a round. Ask for a new link.'
          : 'Could not reach the game server. Try again in a moment.',
      );
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState(null, '', url);
    } finally {
      setConnecting(false);
    }
  }, []);

  // Opened from a friend's link: join their room (once, even under React's double effects).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('room');
    if (!ONLINE_PLAY || !id || joinedFromLink.current) return;
    joinedFromLink.current = true;
    void enter(id);
  }, [enter]);

  // The round being played lives in a ref too, so room messages can end it without stale state.
  const sessionRef = useRef<Session | null>(null);
  const play = useCallback((next: Session | null) => {
    if (sessionRef.current !== next) sessionRef.current?.dispose();
    sessionRef.current = next;
    setSession(next);
  }, []);

  // The room's messages: the lobby list, the start of a round, the host leaving or ending it.
  useEffect(() => {
    if (!room) return;
    const offs = [
      room.onMessage('lobby', (s: LobbyState) => setLobby(s)),
      room.onMessage('start', (msg: StartMessage) => {
        setNotice(null);
        play(msg.slot === 0 ? createHostSession(room, msg) : createGuestSession(room, msg));
        setRound((r) => r + 1);
      }),
      room.onMessage('hostLeft', () => {
        setNotice('The host left, so the round ended. You are still in the room.');
        play(null);
      }),
      // The round is over. Anyone still on the result screen stays there; a round the host cut
      // short ends for everyone still playing it.
      room.onMessage('ended', () => {
        const cur = sessionRef.current;
        if (!cur || cur.host) return;
        if (cur.state.phase === 'over' || !cur.state.players[cur.me]?.alive) return;
        setNotice('The host ended the round.');
        play(null);
      }),
      room.onMessage('left', () => undefined),
      room.onMessage('signal', () => undefined),
      room.onMessage('relay', () => undefined),
    ];
    room.onLeave(() => {
      setRoom(null);
      setLobby(null);
      play(null);
      setNotice('Disconnected from the room.');
    });
    return () => offs.forEach((off) => off());
  }, [room, play]);

  // Leaving the page leaves the room.
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  useEffect(() => () => void roomRef.current?.leave(), []);

  const leaveRoom = () => {
    void room?.leave();
    setRoom(null);
    setLobby(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
  };
  const backToRoom = () => {
    const cur = sessionRef.current;
    if (cur && room) room.send(cur.host ? 'end' : 'quit');
    play(null);
  };
  const rename = (n: string) => {
    setName(n);
    try {
      window.localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
    room?.send('profile', { name: n });
  };

  // Portraits come from the game's own models, rendered once after the page has painted.
  const portraits = usePortraits(playing);

  // Anonymous counting (site only; a no-op unless TelemetryInit started it). Loading starts when /play opens and ends when the
  // lobby's models have rendered: that is the moment the player can pick a fighter.
  useEffect(() => track('load_start'), []);
  const menuSent = useRef(false);
  useEffect(() => {
    if (!portraits || menuSent.current) return;
    menuSent.current = true;
    loadDone();
    track('menu_view');
  }, [portraits]);

  const pick = (id: FighterId) => {
    setFighter(id);
    room?.send('profile', { fighter: id });
    try {
      window.localStorage.setItem(PICK_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const ready = () => {
    setRound((r) => r + 1);
    setPlaying(true);
  };

  if (session) {
    return (
      <Match
        support={SupportLink}
        key={`online${round}`}
        fighter={fighter}
        session={session}
        onExit={backToRoom}
        onPlayAgain={backToRoom}
      />
    );
  }
  if (playing && !room) {
    return (
      <Match
        support={SupportLink}
        key={round}
        fighter={fighter}
        onExit={() => setPlaying(false)}
        onPlayAgain={() => setRound((r) => r + 1)}
      />
    );
  }

  const f = FIGHTERS[fighter];

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-ink-deep text-cream">
      {/* A calm backdrop: the picked fighter's colour glowing behind them, a faint map grid. */}
      <div
        className="pointer-events-none fixed inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 22% 45%, ${f.color}2e, transparent 70%), radial-gradient(ellipse 50% 60% at 100% 100%, #3ec5ff14, transparent 70%)`,
        }}
      />
      <div className="grid-bg pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-8 sm:pb-8">
        <header className="flex items-center justify-between gap-3 whitespace-nowrap text-[10px] font-semibold tracking-[0.2em] text-blue sm:text-xs sm:tracking-[0.3em]">
          <Link href="/" className="hover:text-cream">
            <span className="text-green">&lt;&lt;</span> LAST COMMIT STANDING
          </Link>
          <span className="flex items-center gap-2 text-cream/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green" />{' '}
            {room ? `ROOM · ${lobby?.members.length ?? 1} / 10` : 'LOBBY · 10 / 10'}
          </span>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
          {/* The fighter you drop as, big. */}
          <FighterCard fighter={fighter} portraits={portraits} />

          <div className="flex flex-col gap-4">
            <FighterGrid fighter={fighter} portraits={portraits} onPick={pick} />

            {notice && (
              <p className="panel-cut bg-orange/15 p-3 text-sm text-cream/85" role="status">
                {notice}
              </p>
            )}
            {room ? (
              <OnlinePanel
                room={room}
                lobby={lobby}
                name={name}
                onName={rename}
                onLeave={leaveRoom}
              />
            ) : (
              <>
                <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
                  <AimChoice
                    value={aim}
                    onChange={(m) => {
                      setAim(m);
                      saveAim(m);
                    }}
                  />
                </div>

                <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold tracking-widest text-cream/50">
                      IN THIS LOBBY
                    </span>
                    <span className="text-[10px] text-cream/40">
                      {ONLINE_PLAY ? 'Invite links come with online play' : 'Online play is coming soon'}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-5">
                    <li className="flex items-center gap-1.5 truncate bg-gold/15 px-2 py-1 text-cream">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <span className="truncate">you</span>
                    </li>
                    {BOT_NAMES.map((n) => (
                      <li
                        key={n}
                        className="flex items-center gap-1.5 truncate bg-cream/5 px-2 py-1 text-cream/65"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
                        <span className="truncate">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  {ONLINE_PLAY ? (
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => void enter(null)}
                      className="panel-cut bg-blue/90 px-6 py-4 font-display text-base uppercase text-ink-deep transition hover:brightness-110 disabled:opacity-60"
                    >
                      {connecting ? 'Opening a room…' : 'Play with friends'}
                    </button>
                  ) : (
                    // Online play is not open yet: a clearly disabled tile, nothing to click into.
                    <button
                      type="button"
                      disabled
                      aria-disabled
                      title="Online play is coming soon"
                      className="panel-cut flex cursor-not-allowed items-center gap-3 border border-cream/15 bg-cream/5 px-6 py-3 text-left"
                    >
                      <span className="font-display text-base uppercase text-cream/45">Play with friends</span>
                      <span className="rounded-sm bg-gold/90 px-2 py-0.5 text-xs font-bold text-ink-deep">Coming soon</span>
                    </button>
                  )}
                  {!ONLINE_PLAY && <OnlineInterest />}
                  {/* Desktop: the big button sits here; on phones it rides along at the bottom. */}
                  <button
                    type="button"
                    onClick={ready}
                    className="panel-cut group fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110 sm:static"
                  >
                    Solo with bots
                    <span className="transition group-hover:translate-x-1">→</span>
                  </button>
                </div>

                {/* The studio's support card, out of the way under the buttons. */}
                <Support variant="menu" className="self-end" />
              </>
            )}
          </div>
        </section>

        <HowTo />
      </div>
    </main>
  );
};
