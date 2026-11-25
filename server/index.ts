import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { ROOM_NAME } from '../src/game/net/lobby';

import { LcsRoom } from './LcsRoom';

const port = Number(process.env.PORT ?? 2568);

// Snapshots relayed for a guest whose direct line won't open are ~10 KB: far over the
// transport's default 4 KB limit, which would cut the host off.
const server = new Server({ transport: new WebSocketTransport({ maxPayload: 256 * 1024 }) });
server.define(ROOM_NAME, LcsRoom);

server.listen(port, '0.0.0.0').then(() => {
  console.log(`Hazefall lobby server on :${port}`);
});
