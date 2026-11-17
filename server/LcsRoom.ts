import { Room } from '@colyseus/core';

import { cleanName, isFighter, MAX_PLAYERS } from '../src/game/net/lobby';

import type {
  Addressed,
  JoinOptions,
  LobbyMember,
  LobbyState,
  StartMessage,
  StartSeat,
} from '../src/game/net/lobby';
import type { Client } from '@colyseus/core';

const BOT_NAMES = [
  'merge_bot',
  'lint_fail',
  'null_ptr',
  'race_cond',
  'off_by_1',
  'rm_rf',
  'yolo_push',
  'flaky_test',
  'tech_debt',
];

interface Member extends LobbyMember {
  client: Client;
  /** Seat in the current round, or -1 between rounds / if not in it. */
  slot: number;
}

/**
 * One group of friends: a lobby, then rounds. The server does not run the match: the host's
 * browser (seat 0) does, and the others connect to it directly over WebRTC. This room gathers
 * the players (up to ten), lets the host switch bots on or off and start when everyone is
 * ready, passes the WebRTC handshake between host and guests, relays game messages for anyone
 * whose direct line won't open, and brings everyone back to the lobby after the round.
 */
export class LcsRoom extends Room {
  maxClients = MAX_PLAYERS;
  private members: Member[] = [];
  private bots = true;
  private inMatch = false;

  onCreate() {
    // Only the invite link gets in: rooms are never listed.
    void this.setPrivate(true);
    this.onMessage('profile', (client: Client, msg: { name?: unknown; fighter?: unknown }) => {
      const m = this.member(client);
      if (!m) return;
      if (msg?.name !== undefined) m.name = cleanName(msg.name);
      if (isFighter(msg?.fighter)) m.fighter = msg.fighter;
      this.sync();
    });
    this.onMessage('ready', (client: Client, on: unknown) => {
      const m = this.member(client);
      if (!m || this.inMatch) return;
      m.ready = !!on;
      this.sync();
    });
    this.onMessage('bots', (client: Client, on: unknown) => {
      if (!this.member(client)?.host || this.inMatch) return;
      this.bots = !!on;
      this.sync();
    });
    this.onMessage('start', (client: Client) => {
      if (!this.member(client)?.host || !this.canStart()) return;
      this.start();
    });
    // The host's browser says the round is over: everyone back to the lobby.
    this.onMessage('end', (client: Client) => {
      if (!this.member(client)?.host || !this.inMatch) return;
      this.endMatch();
    });
    // A guest leaves the round but stays in the room: a bot plays their player from now on.
    this.onMessage('quit', (client: Client) => {
      const m = this.member(client);
      if (!m || m.host || !this.inMatch || m.slot < 0) return;
      this.broadcast('left', { slot: m.slot });
      m.slot = -1;
    });
    // WebRTC introductions and the fallback relay: addressed by seat, passed on as they are.
    const forward = (type: string) => (client: Client, msg: Addressed<unknown>) => {
      const from = this.member(client);
      if (!from || from.slot < 0 || typeof msg?.to !== 'number') return;
      if (type === 'relay' && (typeof msg.data !== 'string' || msg.data.length > 200_000)) return;
      this.members
        .find((m) => m.slot === msg.to)
        ?.client.send(type, { from: from.slot, to: msg.to, data: msg.data });
    };
    this.onMessage('signal', forward('signal'));
    this.onMessage('relay', forward('relay'));
  }

  onJoin(client: Client, options: JoinOptions) {
    this.members.push({
      client,
      id: client.sessionId,
      name: cleanName(options?.name),
      fighter: isFighter(options?.fighter) ? options.fighter : 'hotfix',
      ready: false,
      host: this.members.length === 0,
      slot: -1,
    });
    if (this.members.length >= MAX_PLAYERS) void this.lock();
    this.sync();
  }

  onLeave(client: Client) {
    const i = this.members.findIndex((m) => m.client === client);
    if (process.env.NODE_ENV !== 'production')
      console.log(
        `leave ${client.sessionId} member=${i} inMatch=${this.inMatch} slot=${this.members[i]?.slot}`,
      );
    if (i < 0) return;
    const [gone] = this.members.splice(i, 1);
    if (gone.host) {
      // The host's browser was running the round: it ends for everyone.
      if (this.inMatch) {
        this.broadcast('hostLeft', {});
        this.endMatch();
      }
      if (this.members[0]) this.members[0].host = true;
    } else if (this.inMatch && gone.slot >= 0) {
      // The host hands their player to a bot.
      this.broadcast('left', { slot: gone.slot });
    }
    if (!this.inMatch && this.members.length < MAX_PLAYERS) void this.unlock();
    this.sync();
  }

  private member(client: Client) {
    return this.members.find((m) => m.client === client) ?? null;
  }

  private canStart() {
    if (this.inMatch || !this.members.every((m) => m.ready || m.host)) return false;
    return this.members.length >= 2 || this.bots;
  }

  private start() {
    this.inMatch = true;
    void this.lock();
    const seats: StartSeat[] = this.members.map((m) => ({
      name: m.name,
      fighter: m.fighter,
      bot: false,
    }));
    if (this.bots)
      for (let i = 0; seats.length < MAX_PLAYERS; i++)
        seats.push({ name: BOT_NAMES[i % BOT_NAMES.length], fighter: null, bot: true });
    const seed = (Math.random() * 1e9) | 0;
    this.members.forEach((m, slot) => {
      m.slot = slot;
      const msg: StartMessage = { slot, seats, seed };
      m.client.send('start', msg);
    });
    this.sync();
  }

  private endMatch() {
    this.inMatch = false;
    for (const m of this.members) {
      m.slot = -1;
      m.ready = false;
    }
    if (this.members.length < MAX_PLAYERS) void this.unlock();
    this.broadcast('ended', {});
    this.sync();
  }

  private sync() {
    const state: LobbyState = {
      roomId: this.roomId,
      members: this.members.map(({ id, name, fighter, ready, host }) => ({
        id,
        name,
        fighter,
        ready,
        host,
      })),
      bots: this.bots,
      inMatch: this.inMatch,
    };
    this.broadcast('lobby', state);
  }
}
