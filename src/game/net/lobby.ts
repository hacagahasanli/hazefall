// The room's lobby protocol, shared by the game server and the browser. No game rules here:
// the server never runs the match (the host's browser does), it only gathers the players,
// starts the round and introduces the browsers to each other.

export const ROOM_NAME = 'lcs';
export const MAX_PLAYERS = 10;
export const FIGHTER_IDS = ['hotfix', 'legacy', 'standup', 'intern'] as const;
export type LobbyFighter = (typeof FIGHTER_IDS)[number];

export interface JoinOptions {
  name: string;
  fighter: LobbyFighter;
}

export interface LobbyMember {
  id: string;
  name: string;
  fighter: LobbyFighter;
  ready: boolean;
  host: boolean;
}

/** Sent to everyone whenever anything in the room changes. */
export interface LobbyState {
  roomId: string;
  members: LobbyMember[];
  /** Fill the empty places up to ten with bots (the host decides). */
  bots: boolean;
  /** A round is being played: nobody can join until it ends. */
  inMatch: boolean;
}

/** One place in the round: the people first (the host is seat 0), then bots if they're on. */
export interface StartSeat {
  name: string;
  fighter: LobbyFighter | null;
  bot: boolean;
}

export interface StartMessage {
  /** Your seat (= your player id in the match). */
  slot: number;
  seats: StartSeat[];
  seed: number;
}

/** WebRTC handshake and fallback relay messages are addressed by seat. */
export interface Addressed<T> {
  to: number;
  from?: number;
  data: T;
}

export const cleanName = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/[^\p{L}\p{N} _.-]/gu, '')
        .trim()
        .slice(0, 14) || 'player'
    : 'player';
export const isFighter = (v: unknown): v is LobbyFighter =>
  typeof v === 'string' && (FIGHTER_IDS as readonly string[]).includes(v);
