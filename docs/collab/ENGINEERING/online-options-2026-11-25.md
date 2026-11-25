# Hazefall online: options for low latency (decision memo, 2026-11-25)

Research only, no code changed. Builds on `online-latency-plan-2026-11-22.md` (measurements). Labels: **[M]** measured by us, **[V]** vendor claim/docs, **[E]** our estimate.

## 1. Architecture
- **Host-authoritative WebRTC (today):** the best case is two friends near each other on a direct link. For strangers on portals it is a lottery. The host's location sets everyone's ping, the host gets 0 ms and can cheat, the match ends if the host leaves, and NAT-blocked pairs fall back to the relay at about 2x the server leg (~250 ms from Baku [E from M]). It does not work for public 20-player rooms.
- **Dedicated server-authoritative per match, in the region nearest the players:** every player gets one leg to a nearby server. Movement feels like 0 ms with prediction, which Hazefall already has. Others are drawn about RTT/2 + 66-100 ms in the past through an interpolation buffer, and lag compensation makes shots that look right count. This gives the **lowest felt latency and is fair**. Floor 42 already has this design: `floor-42/src/game/net/authority.ts`, `timeline.ts`, and `server/DuelRoom.ts` with its 60 Hz authority, numbered snapshots and 150 ms rewind. The sim is cheap: 0.5 ms/step, 0.33 ms/encode [M].
- **Hybrid:** server-authoritative for Quick Play, with friend rooms kept on WebRTC P2P plus TURN. Do this only if friend rooms matter. It is not needed for portals.

## 2. Transport (browser, 2026)
- **WebSocket (wss):** works everywhere and runs on every host. TCP head-of-line blocking only hurts under packet loss (Wi-Fi/mobile). Edgegap's web docs recommend it as the default [V].
- **WebRTC DataChannel, unordered with `maxRetransmits:0`, from client to server:** avoids head-of-line blocking. It needs a server-side stack (node-datachannel/geckos.io), ICE and UDP ports, so it is harder to run on Fly. It is a later upgrade, not step 1.
- **WebTransport:** Baseline "newly available" since 2026-03-24, when Safari 26.4 shipped it [V]. Older iOS versions still lack it, and Node has no mature HTTP/3 server. Use it only as a later option with a WebSocket fallback.

## 3. Hosting comparison

| Option | Nearest to Caucasus/Turkey/C.Asia | Other regions | Cold start / model | Cost at indie scale | Verdict |
|---|---|---|---|---|---|
| **Fly.io** (current) | fra/ams; Baku to fra **94 ms IPv4 / 127 ms IPv6 [M]**. The Sep 2025 consolidation **removed waw, otp and mad** [V] | 18 regions: ams cdg fra lhr arn, iad ewr ord dfw lax sjc yyz, gru, sin nrt bom syd, jnb [V] | 6-8 s cold start [M]; VMs with scale-to-zero | shared-1x 256 MB $2.19/mo; egress $0.02/GB EU/NA, $0.04 Asia/SA, $0.12 India [V]. **Shared CPU baseline is 6.25% with burst credits [V]**, so a 60 Hz room with bots will get throttled; plan on performance VMs [E] | Good for the US, Asia and LATAM edges |
| **Hetzner Cloud** | Nuremberg/Falkenstein/Helsinki (~same as fra for Baku [E]) | Ashburn, Hillsboro, Singapore [V] | Always-on VM, no cold start, real UDP | CPX02 (1 vCPU/1 GB) €6.49 with **20 TB included**, €1/TB after (EU); Singapore €7.99 with 0.5 TB; US CPX11 €17.99 with 1 TB [V]. Prices rose in June 2026, and there is a "limited availability" notice [V] | **Cheapest EU hub by far once bandwidth counts** |
| Vultr | Warsaw, Tel Aviv (both since 2022-23); no Istanbul [V] | ~32 regions incl. Mumbai [V] | Always-on VM | ~$5-6/mo small VM with pooled bandwidth (verify) | Alternative to Hetzner; Tel Aviv suits MENA |
| DigitalOcean | Frankfurt/Amsterdam only | 13 regions incl. Bangalore, Sydney, Atlanta [V] | Always-on VM | Similar to Vultr | No advantage |
| Gcore | **Istanbul, Baku, Almaty, Tashkent, Dubai** [V] | 50+ locations [V] | Always-on VM | "Basic VM from €3.2/mo", not offered in every city [V] | The only realistic option *inside* Turkey/Caucasus/C.Asia. Add later if telemetry shows demand |
| **Edgegap** | 615+ edge locations, placed per match from player pings; no public Istanbul/Caucasus list [V] | Worldwide [V] | Per-match container, $0 when idle; browser via WS + "TLS Upgrade" (wss) [V]; three.js and Colyseus samples [V] | $0.00115/vCPU-min (~$0.069/h, min 0.25 vCPU), **egress $0.10/GB** [V] | Best placement, but egress costs ~5x Fly. Fallback if regions do not cover players |
| Hathora | - | - | **Shut down** (bought by Fireworks AI; game hosting ended Apr/May 2026, customers sent to Nitrado GameFabric) [V] | - | Out |
| Rivet | Not documented | Not documented | Actors platform, now aimed at AI/agents [V] | $0.05 per 1k actor-hours plus $0.15/GB egress [V] | Too uncertain for games |
| Cloudflare Durable Objects | Region hint `eeur`/`me` (a `me` hint actually places "nearby"); best effort, the object never moves [V] | Global [V] | Lives in one location; billed for wall time while sockets are open, 128 MB [V] | Always-on room ≈ 0.125 GB × 2.6 M s ≈ $4/room-month + messages [E from V] | No published proof of a 60 Hz sim; placement is not controllable. Not for the match sim |
| Colyseus Cloud | No official region list found | Unverified "32 regions" (3rd party) | Managed | From $15/mo, unlimited bandwidth, no autoscale [V] | Unclear regions; skip |

## 4. Quick wins on the current stack (in order)
Each needs about 0 to 2 days.
1. **IPv4-only hostname:** -30 ms from Baku [M].
2. **Warm-up fetch** when the Online menu opens, plus `min_machines_running=1` in the main region. Removes the 6-8 s cold start [M].
3. **Remote interpolation buffer:** about 100 ms, with corrections smoothed. The biggest gain in how it feels.
4. **Binary quantized snapshots:** delta plus interest radius, at 30 Hz. Today's 10 KB JSON at 20 Hz [M] should drop to about 0.5-1.5 KB [E], i.e. ~0.1 GB per player-hour instead of 0.72 [E]. Bandwidth is the main cost driver everywhere.
5. **TURN** for the P2P fallback (Cloudflare: $0.05/GB, 1 TB/mo free [V]).
6. **Region pick by ping:** 3 WebSocket probes per region.

## 5. Recommendation (one path)
**Server-authoritative rooms per match, run as one Node process per region over binary wss at 30 Hz.** Snapshots, with a 60 Hz sim that includes bots, reuse Floor 42's authority, timeline and lag compensation. The client picks a region by ping.
- **Regions:** an always-on **Hetzner Nuremberg/Falkenstein hub** for Europe, Turkey, MENA, the Caucasus and Central Asia. Scale-to-zero **Fly iad / sin / gru / bom** for the Americas and Asia. Bots fill thin regions, so small regions still play.
- **Later:** a Gcore Istanbul or Baku VM once Turkey/Caucasus traffic justifies it. Edgegap only if region coverage fails.

Expected RTT [E unless marked]:

| Players from | Server | RTT |
|---|---|---|
| W/C Europe | DE hub | 15-35 |
| Turkey | DE hub | 45-65 |
| Baku/Caucasus | DE hub | ~95 [M via fra, IPv4] |
| Kazakhstan/C. Asia | DE hub | 90-130 |
| Gulf/Egypt | DE hub | 60-100 |
| US East | iad | 10-30 |
| US West | iad | 60-75 |
| Brazil | gru | 10-40 |
| Rest of LATAM | gru | 40-90 |
| SE Asia | sin | 20-60 |
| India | bom | 10-40 |
| Later: Turkey/Caucasus | Gcore | 10-40 |

Movement is predicted, so it feels instant at any of these.

Monthly cost [E]. Assumptions: about 8 humans per 20-slot room, 0.1 GB per player-hour after the binary change, 60% of players in EU/TR/MENA.
- **0 CCU:** about **$10**: Hetzner €6.49, stopped Fly rootfs at a few cents, plus the existing lobby machine.
- **100 CCU:** about **$80-150**. One 2-vCPU Hetzner box (4.3 TB, inside the 20 TB included) plus Fly iad and sin performance VMs, with ~$40 of egress each.
- **1,000 CCU:** about **$400-600** if the US and Asia also move to flat-bandwidth VMs (Hetzner Ashburn/Singapore or Vultr). About **$900-1,200** if they stay on Fly, because egress reaches ~$800. Edgegap would cost ~$7k in egress alone [E from V].

Steps, in order:
1. IPv4 hostname and warm-up fetch.
2. Telemetry: RTT p50/p95 and region.
3. Interpolation buffer.
4. Binary delta snapshots at 30 Hz.
5. Port the Floor 42 authority and timeline into `server/LcsRoom.ts`, so the server runs the sim with bots.
6. Lag compensation (150 ms rewind cap).
7. Deploy the Hetzner EU hub with the same Docker image, Caddy/wss and a load test of rooms per vCPU.
8. Ping-based region pick, plus Fly iad and sin.
9. Ship Quick Play as server-authoritative. Keep friend rooms on P2P with TURN.
10. Review telemetry, then decide on Gcore Istanbul/Baku and WebRTC/WebTransport.

## Sources
- Fly region consolidation: https://fly.io/blog/the-region-consolidation-project/ ; pricing: https://docs.fly.io/about/pricing ; CPU quotas: https://www.fly.io/docs/machines/cpu-performance
- Edgegap pricing: https://edgegap.com/pricing ; web games (wss/TLS Upgrade): https://docs.edgegap.com/web-games.md ; 615 locations: https://edgegap.com/blog/world-s-largest-distributed-network-edgegap-continues-to-expand-with-615-locations-worldwide
- Hathora exit: https://gamesbeat.com/hathora-acquired-will-exit-game-infrastructure-biz-and-hand-over-customers-to-nitrado/ ; https://docs.edgegap.com/docs/tools-and-integrations/switch-from-hathora
- Rivet: https://www.rivet.dev/cloud/
- Cloudflare DO pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/ ; placement: https://developers.cloudflare.com/durable-objects/reference/data-location/ ; limits: https://developers.cloudflare.com/durable-objects/platform/limits ; TURN: https://developers.cloudflare.com/realtime/turn/faq/
- Hetzner: https://www.hetzner.com/cloud/regular-performance/ ; https://docs.hetzner.com/cloud/general/locations/
- Vultr Tel Aviv/Warsaw/Mumbai: https://www.vultr.com/company/about-us/ ; https://blogs.vultr.com/vultr-tel-aviv
- DigitalOcean regions: https://docs.digitalocean.com/platform/regional-availability/
- Gcore Baku/Istanbul/Tashkent/Basic VM: https://gcore.com/news/cloud-baku ; https://gcore.com/news/looking-for-a-virtual-server-in-turkey-order-it-in-istanbul ; https://gcore.com/news/basic-vm-dubai-almaty
- Colyseus Cloud: https://colyseus.io/pricing
- WebTransport Baseline: https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/ ; https://caniuse.com/webtransport
- WebRTC vs WebSocket (HOL under loss): https://github.com/Sh3b0/realtime-web ; https://web.dev/articles/webrtc-datachannels
