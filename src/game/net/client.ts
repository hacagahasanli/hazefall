import { Client } from '@colyseus/sdk';

import { ROOM_NAME } from './lobby';

import type { JoinOptions } from './lobby';
import type { Room } from '@colyseus/sdk';

/** The lobby server on Fly.io. Point a build at a local one with NEXT_PUBLIC_LOBBY_SERVER. */
export const LOBBY_SERVER = process.env.NEXT_PUBLIC_LOBBY_SERVER ?? 'wss://lcs-game.fly.dev';

/** Dev only: ?server=ws://localhost:2568 points this tab at a local lobby server. */
const serverUrl = () => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return LOBBY_SERVER;
  return new URLSearchParams(window.location.search).get('server') ?? LOBBY_SERVER;
};

/** A new room for you and your friends (private: only the invite link gets in). */
export const createRoom = (options: JoinOptions): Promise<Room> =>
  new Client(serverUrl()).create(ROOM_NAME, options);

/** Join a friend's room from their link or code. */
export const joinRoom = (roomId: string, options: JoinOptions): Promise<Room> =>
  new Client(serverUrl()).joinById(roomId, options);

/** The link a friend opens to join. */
export const inviteLink = (roomId: string) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', roomId);
  const server = new URLSearchParams(window.location.search).get('server');
  if (server && process.env.NODE_ENV !== 'production') url.searchParams.set('server', server);
  return url.toString();
};
