'use client';

import { useEffect, useState } from 'react';

import { inviteLink } from '~/game/net/client';
import { MAX_PLAYERS } from '~/game/net/lobby';
import { FIGHTERS } from '~/game/sim/constants';

import type { LobbyState } from '~/game/net/lobby';
import type { Room } from '@colyseus/sdk';

/**
 * The room with your friends: the invite link, who is in, who is ready, bots on or off (the host
 * decides), and the start. Lives in the lobby's right-hand column, beside the fighter you pick.
 */
export const OnlinePanel = ({
  room,
  lobby,
  name,
  onName,
  onLeave,
}: {
  room: Room;
  lobby: LobbyState | null;
  name: string;
  onName: (n: string) => void;
  onLeave: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  // The bots switch flips at once; the server's word replaces it when it arrives.
  const [bots, setBots] = useState(true);
  useEffect(() => {
    if (lobby) setBots(lobby.bots);
  }, [lobby]);

  const me = lobby?.members.find((m) => m.id === room.sessionId);
  const host = !!me?.host;
  const link = typeof window === 'undefined' ? '' : inviteLink(room.roomId);
  const people = lobby?.members ?? [];
  const waiting = people.filter((m) => !m.host && !m.ready).length;
  const canStart = !!lobby && !lobby.inMatch && waiting === 0 && (people.length >= 2 || bots);

  const copy = async () => {
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({
          title: 'Last Commit Standing',
          text: 'Drop in with me:',
          url: link,
        });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* share sheet closed */
    }
  };
  const saveName = () => {
    const n = draft.trim().slice(0, 14);
    if (n && n !== name) onName(n);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="panel-cut flex flex-col gap-2 bg-ink/80 p-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold tracking-widest text-cream/50">
            INVITE YOUR FRIENDS
          </span>
          <span className="text-[10px] tracking-widest text-cream/40">ROOM {room.roomId}</span>
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate bg-ink-deep/80 px-2 py-2 text-xs text-cream/80 outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="panel-cut shrink-0 bg-blue px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-deep"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-cream/60">
          Your name
          <input
            value={draft}
            maxLength={14}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="min-w-0 flex-1 bg-ink-deep/80 px-2 py-1.5 text-sm text-cream outline-none focus:ring-1 focus:ring-gold"
          />
        </label>
      </div>

      <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold tracking-widest text-cream/50">
            IN THIS ROOM · {people.length} / {MAX_PLAYERS}
          </span>
          {host ? (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-cream/75">
              <input
                type="checkbox"
                checked={bots}
                onChange={(e) => {
                  setBots(e.target.checked);
                  room.send('bots', e.target.checked);
                }}
                className="accent-[#ffd23f]"
              />
              Fill empty places with bots
            </label>
          ) : (
            <span className="text-[10px] text-cream/45">
              {lobby?.bots ? 'Bots fill the empty places' : 'No bots: only people'}
            </span>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const m = people[i];
            if (!m) {
              return (
                <li
                  key={`empty${i}`}
                  className="flex items-center gap-1.5 truncate border border-dashed border-cream/10 px-2 py-1 text-cream/30"
                >
                  {bots ? 'bot' : 'empty'}
                </li>
              );
            }
            const color = FIGHTERS[m.fighter].color;
            return (
              <li
                key={m.id}
                className={`flex items-center gap-1.5 truncate px-2 py-1 ${m.id === room.sessionId ? 'bg-gold/15 text-cream' : 'bg-cream/5 text-cream/80'}`}
                title={`${m.name} · ${FIGHTERS[m.fighter].name}`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{m.name}</span>
                <span
                  className={`ml-auto shrink-0 text-[9px] font-bold tracking-wider ${m.host ? 'text-gold' : m.ready ? 'text-green' : 'text-cream/35'}`}
                >
                  {m.host ? 'HOST' : m.ready ? 'READY' : '…'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {lobby?.inMatch && (
        <p className="panel-cut bg-ink/80 p-3 text-sm text-cream/75">
          A round is on. When it ends you will all be back here, and the next one starts with you in
          it.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onLeave}
          className="text-xs font-semibold uppercase tracking-wider text-cream/50 hover:text-cream"
        >
          Leave room
        </button>
        {host ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => room.send('start')}
            className="panel-cut group fixed inset-x-4 bottom-4 z-20 flex flex-col items-center bg-gold px-10 py-3 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition enabled:hover:brightness-110 disabled:opacity-50 sm:static"
          >
            Start the round →
            <span className="font-sans text-[10px] font-bold normal-case tracking-wide text-ink-deep/70">
              {lobby?.inMatch
                ? 'A round is on'
                : waiting > 0
                  ? `Waiting for ${waiting} to be ready`
                  : people.length < 2 && !bots
                    ? 'Invite a friend or switch bots on'
                    : `${people.length} ${people.length === 1 ? 'person' : 'people'}${bots && people.length < MAX_PLAYERS ? ` + ${MAX_PLAYERS - people.length} bots` : ''}`}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!!lobby?.inMatch}
            onClick={() => room.send('ready', !me?.ready)}
            className={`panel-cut fixed inset-x-4 bottom-4 z-20 px-10 py-4 font-display text-xl uppercase shadow-[0_0_40px_rgba(255,210,63,0.25)] transition disabled:opacity-50 sm:static ${
              me?.ready ? 'bg-green text-ink-deep' : 'bg-gold text-ink-deep hover:brightness-110'
            }`}
          >
            {me?.ready ? 'Ready ✓ (tap to undo)' : "I'm ready"}
          </button>
        )}
      </div>
    </div>
  );
};
