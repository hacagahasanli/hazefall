import type { Addressed } from './lobby';
import type { Room } from '@colyseus/sdk';

/**
 * A direct WebRTC line between two players' browsers: the host and one guest. The host keeps
 * one per guest (a star), each guest one to the host. The lobby server only introduces them (it
 * passes the offer, the answer and the network candidates along) and stays as a relay: if the
 * line never opens (some mobile networks block it) or drops, messages go through the server.
 *
 * Two data channels:
 * - `game`: unordered, no retransmits, for inputs and snapshots. A late packet is a useless
 *   packet, and each one repeats what matters (inputs carry the last few ticks, snapshots the
 *   whole state).
 * - `ctl`: reliable and ordered, for the rare one-off messages.
 */

/** Dev only: message counters on window.__net, for the multi-browser tests. */
const debug = (k: string) => {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __net?: Record<string, number> };
  w.__net ??= {};
  w.__net[k] = (w.__net[k] ?? 0) + 1;
};

const ICE: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ],
  },
];

export type PeerMessage =
  | { t: 'in'; w: number[][] }
  | { t: 'snap'; raw: string }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number };

export interface PeerLink {
  /** The other end's seat. */
  readonly other: number;
  /** True while the direct line is open (else messages go through the server's relay). */
  readonly direct: boolean;
  /** Round-trip time to the other player in ms, over whichever line is in use. */
  readonly rtt: number;
  send: (m: PeerMessage, reliable?: boolean) => void;
  on: (cb: (m: PeerMessage) => void) => () => void;
  close: () => void;
}

/**
 * Open a line to seat `other`. The host makes the offer. Returns at once: messages go through the
 * relay until (and unless) the direct line opens, and the link switches over by itself.
 */
export const connectPeer = (room: Room, other: number, initiator: boolean): PeerLink => {
  const listeners = new Set<(m: PeerMessage) => void>();
  let game: RTCDataChannel | null = null;
  let ctl: RTCDataChannel | null = null;
  let rtt = 0;
  let closed = false;

  const deliver = (raw: string) => {
    if (process.env.NODE_ENV !== 'production') debug(`in:${other}`);
    let m: PeerMessage;
    try {
      m = JSON.parse(raw) as PeerMessage;
    } catch {
      return;
    }
    if (m.t === 'ping') {
      link.send({ t: 'pong', n: m.n });
      return;
    }
    if (m.t === 'pong') {
      rtt = Math.round(performance.now() - m.n);
      return;
    }
    listeners.forEach((cb) => cb(m));
  };
  const relay = (raw: string) =>
    room.send('relay', { to: other, data: raw } satisfies Addressed<string>);

  const offRelay = room.onMessage('relay', (msg: Addressed<string>) => {
    if (msg.from === other && typeof msg.data === 'string') deliver(msg.data);
  });

  const pc =
    typeof RTCPeerConnection === 'undefined' ? null : new RTCPeerConnection({ iceServers: ICE });
  const signal = (data: unknown) =>
    room.send('signal', { to: other, data } satisfies Addressed<unknown>);
  const offSignal = room.onMessage(
    'signal',
    async (msg: Addressed<{ sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }>) => {
      if (!pc || msg.from !== other) return;
      try {
        if (msg.data.sdp) {
          await pc.setRemoteDescription(msg.data.sdp);
          if (msg.data.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            signal({ sdp: pc.localDescription });
          }
        } else if (msg.data.ice) {
          await pc.addIceCandidate(msg.data.ice);
        }
      } catch {
        /* a stale candidate: ignore */
      }
    },
  );

  const open = (ch: RTCDataChannel | null) => ch?.readyState === 'open';
  const link: PeerLink = {
    other,
    get direct() {
      return open(game);
    },
    get rtt() {
      return rtt;
    },
    send: (m, reliable = false) => {
      if (closed) return;
      if (process.env.NODE_ENV !== 'production') debug(`out:${other}:${m.t}`);
      const raw = JSON.stringify(m);
      const ch = reliable ? ctl : game;
      if (ch && open(ch)) {
        try {
          ch.send(raw);
          return;
        } catch {
          /* fall through to the relay */
        }
      }
      relay(raw);
    },
    on: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    close: () => {
      closed = true;
      clearInterval(pingTimer);
      offRelay();
      offSignal();
      game?.close();
      ctl?.close();
      pc?.close();
    },
  };

  const wire = (ch: RTCDataChannel) => {
    ch.onmessage = (e) => deliver(String(e.data));
    if (ch.label === 'game') game = ch;
    else ctl = ch;
  };
  if (pc) {
    pc.onicecandidate = (e) => {
      if (e.candidate) signal({ ice: e.candidate.toJSON() });
    };
    if (initiator) {
      wire(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
      wire(pc.createDataChannel('ctl', { ordered: true }));
      void pc
        .createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => signal({ sdp: pc.localDescription }));
    } else {
      pc.ondatachannel = (e) => wire(e.channel);
    }
  }
  // Measure the round trip once a second (over the direct line once it is up).
  const pingTimer = setInterval(() => link.send({ t: 'ping', n: performance.now() }), 1000);
  return link;
};
