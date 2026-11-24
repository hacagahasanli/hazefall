# Online latency: findings and plan (2026-11-22)

Scope: measurement and diagnosis only. No game code edited, nothing deployed. Branch `portal-build`.
Owner report: playing online, the HUD "ms" never drops below ~120.
Measured from the owner's machine (Apple M1 Pro, home Wi-Fi, Azerbaijan: Cloudflare trace says `loc=KZ colo=FRA`, first hops are private 10.52.x ranges) on 2026-11-22 against the deployed apps. Scripts are in the session scratchpad (`wsping2.cjs`, `roomping2.mjs`, `bench.ts`); the commands are quoted next to each number.

## 1. Summary

1. The architecture is not what the netcode skill's default describes. LCS is **host-authoritative over WebRTC**: the Fly server (`server/LcsRoom.ts`, 199 lines) never runs the match; it only runs the lobby, passes WebRTC handshakes and relays packets when the direct line fails. The host's browser runs the sim for everyone (`createHostSession`, `src/game/net/session.ts`); guests predict and reconcile (`createGuestSession`).
2. The HUD number is a **peer-to-peer round trip over the in-use line** (direct WebRTC, else the Fly relay), sampled once a second. It is not the server ping and not a one-way figure.
3. The ~120 floor matches the measured **browser-to-Fly round trip from here: 123-143 ms over WebSocket (p50 131-133), 120-138 ms TCP over IPv6**. The relay path costs that on each leg.
4. The biggest single finding: from this machine **IPv4 to the Fly edge is ~94 ms but IPv6 is ~127 ms**. Browsers prefer IPv6, so players here get the slow path by default (~30 ms free to win).
5. Whether the owner saw "DIRECT" or "VIA SERVER" in the HUD is not known and decides which of two different problems he had (section 3).
6. Fly has no region closer to Baku than Frankfurt/Amsterdam (`flyctl platform regions`: nothing in the Middle East, Caucasus or Turkey). More regions will not help Baku; they help Western Europe, the US and Asia.

## 2. What the "ms" measures (code evidence)

- `src/game/net/peer.ts:173`: every second each link sends `{t:'ping', n: performance.now()}`; the other end answers `pong` with the same `n` (`peer.ts:72-78`); `rtt = now - n`. Sent over the `game` channel if open, else through `room.send('relay')` and the Fly server (`peer.ts:104-112`).
- Guest HUD: that link's rtt. Host HUD: the **maximum** over all guests (`session.ts:168`). Shown in `src/components/Match.tsx:1045-1046` as `DIRECT · N MS` / `VIA SERVER · N MS` (host: `HOST · a/b DIRECT · N MS`; no guests shows `SOLO` with no number).
- It includes: network both ways, the main-thread delay at both ends (the pong runs in `onmessage`, so a slow frame or a 20-player render delays it, up to a frame or more), and relay hops. It excludes snapshot wait (up to 50 ms) and render interpolation, so it understates what the player feels for other fighters.
- Weaknesses: the channel is unordered with `maxRetransmits: 0`, so a lost ping/pong leaves the last value on screen for a second or more; there is no smoothing, no jitter figure, and the Colyseus `room.ping` to the Fly server is not used at all.
- Consequence: **if the line is "VIA SERVER", the number is guest to Fly to host and back, i.e. the sum of two browser-to-Frankfurt legs** (about 190-260 ms for two players in Baku). If it is "DIRECT", it is the real distance between the two browsers and should be a few ms to ~30 ms for two players in the same country. A steady 120-130 therefore looks like one guest in Baku and a host about one Fly leg away, or relay with a host that is well connected to Fly. We need the HUD label from the owner's session (cheap question, answers most of this).

## 3. Measurements

| What | Result | Command |
|---|---|---|
| ICMP to Fly anycast v4 (66.241.125.15) | min 87, avg 93.5, max 101 ms (n=20, 0% loss) | `ping -c 20 -q 66.241.125.15` |
| TCP connect to `lcs-game.fly.dev` over **IPv4** | 87-106 ms, median ~96 (n=15) | `curl -4 -s -o /dev/null -w "%{time_connect}" https://lcs-game.fly.dev/` |
| TCP connect over **IPv6** | 120-138 ms, median ~127 (n=15); `ping6` avg 123.5 | `curl -6 ...`, `ping6 -c 10 2a09:8280:1::20f:1d48:0` |
| TCP connect, default (what a browser does) | n=30: 28 of 30 took the IPv6 address, 116-139 ms; 2 outliers at 303-305 ms | loop of `curl -s -w "%{time_connect} %{remote_ip}"` |
| Colyseus `room.ping` to the lobby server (WebSocket, TLS, via Fly edge) | n=40 x2 runs: min 123-124, **p50 131-133**, p90 142-143, max 151 and 467 | `node roomping2.mjs wss://lcs-game.fly.dev` (creates and leaves one private room) |
| Floor 42 WS control-frame ping | n=5: min 87, p50 95, max 102 (tiny sample; its server closes idle sockets) | `node wsping2.cjs wss://floor42-game.fly.dev` |
| Request served by Fly edge | `fly-request-id ...-ams`: the edge is Amsterdam, machine is in `fra` | `curl -D - https://lcs-game.fly.dev/` |
| Reference: Cloudflare 1.1.1.1 | avg 57 ms (trace colo FRA) | `ping -c 10 1.1.1.1` |
| **Cold start** (machine stopped by autostop) | first request 7.72 s (lcs-game) and 5.79 s (floor42-game); warm requests ~0.41-0.64 s with TLS | `curl -w "%{time_starttransfer}"` first call after idle |
| Server CPU per 20-player match (this M1; Fly shared-cpu-1x will be slower) | `step` p50 0.43-0.56 ms, p99 1.5-2.7 ms, max 9-35 ms (3 runs x 2 min, 19 bots including bot AI); `encodeSnapshot` p50 0.33 ms; **~10.1 KB per snapshot** | `npx tsx bench.ts` |

Notes: all from one machine on Wi-Fi at one time of day, so treat as an indication (spread shown). The 2 x ~305 ms connects and the 467 ms ping max show occasional route flaps. No second peer was available, so **direct WebRTC RTT was not measured**; no WebRTC numbers in this document are measurements.

Expected from elsewhere (typical physical-distance figures, not measured here; verify with the same script from those places): Western Europe to fra ~10-30 ms; US East to fra ~85-100 ms (to a US-East machine ~10-30 ms); Baku to fra 95-130 ms as measured above. Baku to Singapore would be worse than fra, so `sin` is for Asia players only.

Floor 42 reading: that server is authoritative at 60 Hz with snapshots at 30 Hz (`floor-42/src/game/net/protocol.ts:8`), reports a lag-compensation `rtt` message (`floor-42/server/DuelRoom.ts:59`), has direct mode and an optional TURN env. Same Fly region (fra), same IPv6-path effect, same 6 s cold start. LCS has none of: lag compensation, TURN, rival timeline buffer.

## 4. Netcode inventory (LCS)

| Item | Value | Where |
|---|---|---|
| Sim tick | 60 Hz fixed (`DT = 1/60`), run inside `requestAnimationFrame` accumulator, so the sim is paced by the host's frame rate | `sim/constants.ts:5`, `render/game.ts:2940` |
| Snapshot rate | every 3 ticks = **20 Hz**, JSON string, ~10 KB with 20 players, i.e. ~200 KB/s (~1.6 Mbit/s) per guest; host with 9 guests ~15 Mbit/s upload (the repo's own comment) | `protocol.ts:7`, `lobby.ts` |
| Client input send | every tick (60 Hz), JSON array carrying the last up to 6 unconfirmed inputs | `session.ts` guest `tick` |
| Prediction + reconciliation | **Yes, for the local player**, active in online mode (guest): adopts snapshot, drops acked inputs, replays the rest, steps with own input immediately. Host plays with zero delay | `session.ts` `createGuestSession` |
| Other fighters on a guest | **No interpolation buffer.** The snapshot state replaces the local state every 50 ms and the others are dead-reckoned with their last known input; `prev` is overwritten each tick so the correction shows as a pop. They are drawn ~one-way latency plus up to 50 ms snapshot gap behind, with no smoothing | `session.ts` reconcile, `game.ts:2941-2947` |
| Hit/KO/pickup confirmation | Only from host's event log, so costs one full RTT (+ up to 50 ms) after the shot; no lag compensation, no rewind | `protocol.ts` AUTHORITATIVE |
| Input queue on authority | one per tick, folds when >4 queued | `protocol.ts` `createInputQueue` |
| Transport | WebRTC `game` channel unordered/no-retransmit (good, no head-of-line blocking); relay fallback is WebSocket/TCP via Fly (head-of-line blocking, `perMessageDeflate` not set so no compression delay; Nagle: ws library enables noDelay by default, not an issue) | `peer.ts`, `server/index.ts` |
| ICE | Google + Cloudflare **STUN only, no TURN**; strict/mobile NATs (common on carrier CGNAT) fall back to the relay silently | `peer.ts:26-33` |
| Ping | 1 Hz, main-thread, no smoothing | `peer.ts:173` |
| Hosting | Fly `lcs-game`, `fra`, shared-cpu-1x 256 MB, `auto_stop_machines = "stop"`, `min_machines_running = 0`; one machine (state `started` at test time) | `fly.toml` |

Avoidable added delay found, with size where measured:
- IPv6 path to Fly edge: ~+30 ms from Baku (measured).
- Relay mode: doubles the server leg (arithmetic from the measured ~130 ms one leg; not measured end to end).
- Cold start: 5.8-7.7 s on first join after idle (measured).
- No remote interpolation: not a latency but the main reason others look jerky; up to 50 ms snapshot quantisation plus one-way delay.
- 10 KB JSON snapshots at 20 Hz: no latency on a good line, but on a mobile link they raise jitter/loss; easily 5-10x smaller (binary delta + interest radius). Not measured on a throttled link.
- Tick quantisation on the host is frame-rate dependent (accumulator in rAF): a host at 30 fps ticks in bursts; not measured here.

## 5. How other browser games get low perceived latency

(General industry practice; the points below are knowledge, not measurements from this repo.)
- Authoritative servers in several regions, client pings regions and picks the lowest RTT; matchmaking only fills a room in that region (agar/slither-style .io games, Krunker, Venge, Shell Shockers all list regions or auto-pick).
- Client-side prediction for the local player so input is never felt as lag; the lag is felt on others and on hit confirm.
- Remote interpolation with ~100 ms buffer (2 snapshots at 20 Hz) so other players glide instead of popping, accepted as "everyone is 100 ms in the past".
- Server lag compensation (rewind targets by the shooter's RTT, cap ~150-200 ms) so a shot that looked like a hit is a hit; plus client-side hit markers and effects from prediction.
- Compact binary snapshots with interest radius; 30-60 Hz tick.
- Players read "ping" as a number; below ~60 looks great, 100-130 is normal in browser games when the movement is predicted and others are interpolated. So the target for Baku is not 20 ms (impossible with no nearer region); it is a **stable 90-110 ms that feels smooth**, with 10-30 ms available to players near a region and to nearby friends via direct WebRTC.
- Small ping numbers shown by games are often **one-way or server-processing** figures; do not compare our RTT HUD against them.

## 6. Ranked fix list

| # | Fix | Gain | Effort | Fly cost |
|---|---|---|---|---|
| 0 | Ask the owner (or add a one-line debug readout) for DIRECT vs VIA SERVER and the number on both HUDs | Decides everything below | minutes | 0 |
| 1 | **Serve the lobby/relay hostname over IPv4 only** (drop the AAAA / dedicated v4, or a separate IPv4-only hostname for the client) and re-measure from Baku | ~-30 ms (127 to 94 measured on TCP, from this machine; may differ per ISP, verify with a test app first) | 0.5 h | shared v4 free; dedicated v4 ~$2/mo (verify on Fly pricing) |
| 2 | **Remote interpolation buffer** (render others ~100 ms in the past between two snapshots; snap on teleport/respawn) and smoothing of reconcile corrections | No ms change; biggest *feel* gain: removes pop/jitter on other fighters | 1-2 days incl. tests | 0 |
| 3 | **Add TURN** (Cloudflare Realtime TURN or coturn) to `ICE`, plus `iceCandidatePoolSize`, so fewer matches fall to the relay | Relay (~250 ms) to direct (few ms-30 ms) for NAT-blocked pairs; share unknown until we log the direct rate | 0.5-1 day | Cloudflare TURN is metered by GB (verify current free tier); only used by blocked pairs |
| 4 | **Telemetry**: log `direct` vs `relay` rate, rtt p50/p95, snapshot gaps to the existing stats endpoint (not the portal build) | Makes every later decision measured | 0.5 day | 0 |
| 5 | **Server-authoritative regional rooms for public/quick match.** The sim is pure and cheap: 0.5 ms/step, 0.33 ms/encode, so one room is ~4% of an M1 core (estimate a shared-cpu-1x at 15-25% of its burst per room; measure on Fly before sizing). Move the host loop into `server/LcsRoom.ts` (bots included), keep predict+reconcile on the client. P2P-host cannot serve public play: host leaving ends the round, hosts can cheat, strangers' NATs fail | Fair public games, no host advantage, no host-NAT lottery; latency to a Baku player ~95-130 ms hidden by prediction | 3-5 days | one 256 MB machine per region, see below |
| 6 | **Regions + nearest-region matchmaking**: start with `fra` (Baku, Europe), add `iad` (Americas) and `sin` (Asia) with `auto_stop`; client probes each region's `/` over WebSocket (3 samples) and creates/joins there. Rooms live in one process, so use one Fly app per region (`lcs-eu`, `lcs-us`, `lcs-asia`) or one app with Fly `fly-replay` by instance; per-region apps are the simplest and avoid cross-machine room lookup | EU/US/Asia players 10-40 ms instead of 90-200 ms | 2 days after #5 | machine ~$2/mo list if always on (verify); stopped = rootfs storage only (cents); egress per player-hour ~0.7 GB at today's 200 KB/s (so shrinking snapshots saves money) |
| 7 | **Shrink snapshots**: binary or delta + interest radius, 20 to 30 Hz | 5-10x less data; fewer stalls on mobile; allows 30 Hz (-17 ms average one-way) | 2-3 days | lowers egress |
| 8 | **Lag compensation** for hits once the server decides them (rewind by shooter RTT, cap 150 ms) | Shots that looked right register; hit confirm still one RTT | 2-4 days, needs checking how weapons resolve (hitscan vs projectile) in `sim/step.ts` | 0 |
| 9 | **Cold start**: on opening the Online menu, fire a `fetch` to the server (wake it while the player picks a name); for launch periods set `min_machines_running = 1` in `fra` | 5.8-7.7 s to <1 s for the first joiner | 1 h | ~$2/mo list for one always-on 256 MB machine |
| 10 | HUD ping: smooth (median of last 5), show jitter, use `RTCPeerConnection.getStats().currentRoundTripTime` when direct so main-thread load does not inflate it | Honest number; no ms gain | 2 h | 0 |

What will not help: moving the machine within Fly (nothing closer to Baku than fra/ams), higher tick rate before interpolation exists, memoising/optimising the sim (0.5 ms is already cheap).

## 7. Recommended first slice (about 2 days)

1. #0 and #4: add the direct/relay + rtt telemetry and a debug readout so the next playtest returns numbers, not feelings.
2. #1: IPv4-only A/B on a throwaway Fly app, then switch if it holds from Baku (the cheapest real ms).
3. #2: remote interpolation + correction smoothing (the thing players call "laggy" in a predicted game).
4. #9 warm-up fetch (one line, kills the 6-8 s first-join wait).

Then, before enabling public online: #5 and #6 (server-authoritative, regional), #3 TURN, #7 and #8. Public play should not ship on the host-browser model; friend rooms can stay on direct WebRTC with TURN.

## 8. Open questions for the owner

- What did the HUD say on both sides (DIRECT or VIA SERVER, and who was host)?
- Wi-Fi or cable, and which ISP? IPv6 vs IPv4 path quality is carrier-specific; the +30 ms is measured only on this line.
- Pricing figures above are from memory of Fly's list prices: confirm at fly.io pricing before committing to regions.
