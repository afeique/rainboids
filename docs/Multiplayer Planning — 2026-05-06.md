A planning document for adding **co-op (PvE) multiplayer** to Rainboids. This is a survey of the design space, a recommendation, and a phased rollout — not an implementation spec.

---

## TL;DR

- **Scope: 2–4 player PvE co-op** with quick-match matchmaking and drop-in/drop-out at safe sync points. No PvP, no friendly fire, no ranked play.
- **Recommended stack:** **Rust authoritative server** running the simulation, **WebSocket transport** for inputs and snapshots, **state-snapshot + client-side prediction** for the player ship.
- **Why not WebRTC P2P:** The added complexity of TURN, NAT traversal, host migration, and trust does not pay off for a co-op shooter where small extra latency is invisible.
- **Why not pure WebSocket P2P:** Same matchmaking + signaling cost as a server, but you lose the server's anti-cheat, persistence, and host-quit resilience for free.
- **Phased path:** ship a server-authoritative MVP for 2 players first; only revisit transport (WebRTC) if real-world latency problems surface.

---

## Goals and non-goals

### Goals

- 2–4 players cooperate against the existing wave-based PvE content.
- A player can hit "Quick Match" and be dropped into a game in under 10 seconds.
- A player can also browse / create / join named rooms.
- A new player can hop into an in-progress run at the next safe boundary (between waves, or with a brief invuln spawn mid-wave).
- A player who quits or disconnects does not break the run for the others.
- The existing single-player experience must not regress. Single-player is just "multiplayer with one slot occupied" — same client, same server, same code path.

### Non-goals (for the first cut)

- PvP. No friendly fire, no team deathmatch, no ranked.
- Cross-region matchmaking. Start with one region; add later if needed.
- Persistence / accounts / friends lists. Anonymous join, ephemeral rooms.
- Voice chat. Text or emote pings only, if anything.
- Mobile multiplayer. Browser-desktop first; mobile may follow.
- Mod support, custom waves, replays. Out of scope.
- A robust anti-cheat suite. Server is authoritative; that's the entire defense for v1.

---

## What actually needs to sync

Rainboids has a *lot* of stuff on screen, but only a fraction of it is gameplay-relevant. The first sanity check before talking transport is to be honest about what crosses the wire.

### Authoritative (server owns; clients receive)

- **Player ships** — position, velocity, facing, health, weapon state, powerup stacks, score, gold, XP.
- **Enemies** — position, velocity, AI target, health, type, charge state.
- **Asteroids** — position, velocity, rotation, health, size tier.
- **Bullets** — origin, velocity, weapon type, owner, lifetime. (See note below — bullets are the high-volume entity and deserve special handling.)
- **Wave state** — current wave index, enemies-remaining counter, wave-clear flag, transition timer.
- **Drops** — money orbs, health orbs (position, value, who can collect, timeout).
- **Boss state** — phase, attack timer.
- **RNG seed** for any decisions that need to be replayable client-side (warp-in animations, particle origins).

### Client-side only (each client runs its own; never crosses the wire)

- **Background starfield** — every star, including parallax drift. Each client renders its own sky from its own seed.
- **Particles** — embers, shrapnel, flash, rings, debris. Cosmetic; runs locally from "explosion happened at (x,y) of type T" events.
- **Damage numbers, hit-flash, screen shake.**
- **Sound effects, music, music player.**
- **HUD animations** — orb count interpolation, level-up flair, kill-streak indicator, power-weapon glow.
- **Cursor / aim reticle.**
- **Pause menu, shop UI, powerup overlay.**

### Predicted on the firing client (reconciled by the server)

- **Own ship movement** — the client integrates input locally each frame and snaps to server position when reconciliation arrives. Without prediction, ship movement feels rubber-bandy at any non-LAN latency.
- **Own bullets** — fire visually instant on the local client; server confirms hit/miss at next snapshot. A small "phantom hit" tolerance is acceptable for PvE since enemies don't push back against the player's expectation the way another player would.

### Bullets are the wire-cost wildcard

Rainboids fires *a lot* of bullets at high tick rates. Sending every bullet's full state every snapshot is wasteful. Better:

- Server sends a bullet-spawn event the moment a fire input is processed: `{owner, weapon, origin, velocity, t}`.
- Both clients integrate bullet position locally from that point — bullets are deterministic projectiles given their initial conditions.
- Server sends a bullet-despawn event on hit / lifetime / wall.
- Hit registration is on the server using authoritative entity positions.

This is the same approach Quake/Source-engine games use for hitscan and projectiles. Bullet state is a stream of *events*, not a stream of *snapshots*.

---

## Transport: WebSocket vs WebRTC

The browser gives you basically two real-time transport options.

### WebSocket (over a Rust server)

**What it is:** A persistent TCP connection from the browser to the server. The server is written in whatever (Rust, here). Clients send small framed messages; the server fans out to other clients.

**Strengths**

- **Operationally trivial.** One process, one port (443), terminates at the load balancer like any HTTPS endpoint. No TURN servers, no STUN, no signaling dance.
- **Reliable ordered delivery.** You don't have to think about packet loss, reordering, duplicate delivery. Send a message; it arrives, in order, exactly once.
- **Browser-native.** No third-party libraries required on the client. `new WebSocket(url)` and you're connected.
- **Trivial to add server-authoritative simulation.** The server is already running anyway; adding a 60Hz simulation tick alongside the WebSocket fanout is straightforward.
- **Easy to debug.** You can watch frames in Chrome DevTools' Network tab. You can dump raw protocol logs with one line of code.

**Weaknesses**

- **TCP head-of-line blocking.** If a single packet is lost on the path, *every subsequent packet* on that connection waits for retransmit before being delivered. On a fast clean connection this is invisible; on a flaky mobile uplink it can spike perceived latency by 100–300ms during a loss event.
- **Per-connection state on the server.** Every connected client holds an open TCP socket. At 4 players per room and modest concurrency this is nothing; at MMO-scale this becomes a real concern. Not a real concern for Rainboids.
- **Hosting cost.** You pay for the server. (Same is true for any centralized model.)

### WebRTC DataChannel

**What it is:** A peer-to-peer (or peer-to-server-via-SFU) UDP-based channel that browsers can open between each other. DataChannels can be configured ordered/unordered, reliable/unreliable.

**Strengths**

- **Unreliable-unordered mode.** No head-of-line blocking. A lost packet stays lost; you move on. For a 60Hz state stream this is exactly what you want — old snapshots are obsolete the moment the next one arrives, so retransmit is wasted effort.
- **Lower jitter on lossy networks.** The flip side of accepting loss instead of retransmitting.
- **Optionally true peer-to-peer.** No game-state server cost. (Big asterisk: see below.)

**Weaknesses**

- **You still need a signaling server.** WebRTC doesn't bootstrap itself — you need *some* server for the two browsers to exchange SDP offers/answers. So "P2P with WebRTC" is really "WebRTC for gameplay, WebSocket for matchmaking." You don't escape the server.
- **You still need STUN, often need TURN.** STUN is cheap (it just bounces a UDP packet so each peer learns its public IP). TURN is a relay — used when symmetric NATs prevent direct P2P — and it's *expensive bandwidth-wise*, since every byte the players send to each other passes through your TURN server. Rough industry numbers: 10–20% of connections require TURN.
- **Connection failures.** Some networks (corporate firewalls, certain mobile carriers, double-NAT setups) flatly refuse WebRTC. You will see ~5–10% of attempted connections fail in the wild. You either build a fallback transport or you tell those players "sorry."
- **API complexity.** ICE candidates, SDP munging, DataChannel state machine, reconnection logic. The lib (`simple-peer`, etc.) helps but it's still 5–10× the code of `new WebSocket(url)`.
- **Harder to debug.** No DevTools Network tab equivalent. You're reading `chrome://webrtc-internals` and console-logging your way through ICE state transitions.

### Verdict on transport

**Use WebSocket.** The latency advantage of WebRTC's unreliable channel only matters if you're in a regime where the head-of-line stalls on TCP are noticeable, *and* you've already paid the operational cost of doing it well (TURN, fallbacks, debugging). For 2–4 player co-op with wave-based pacing, the latency floor is fine on TCP.

If real-world telemetry later shows median latency > 200ms or frequent loss spikes are tanking the experience, WebRTC becomes worth revisiting. But ship the WebSocket version first — it'll cover 95% of the experience and 100% of the connection success rate.

---

## Topology: P2P vs centralized vs hybrid

The other big axis. Where does the simulation live?

### P2P decentralized (host-authoritative)

One client is "the host." It runs the simulation; other clients are visualizers that send inputs and receive state.

**Strengths**

- **No game-state server cost.** The host pays the CPU and bandwidth.
- **Lowest latency for the host.** Host has 0ms simulation latency.
- **Works fine offline-ish** — players on the same LAN don't need any server at all once they're connected (still need a signaling server to *get* connected).

**Weaknesses**

- **Host has unfair advantage** in PvP — moot here since we're PvE-only, but worth flagging.
- **Host quit = run dies.** Unless you build host migration, which is *hard*. The simulation has to be paused, snapshotted, transferred, restarted, all in under a second, with state consistency intact. Host migration is famously the bug-frontier of every P2P co-op title.
- **Trust.** A determined host can cheat the simulation any way they like. For PvE this matters less (no one's leaderboard is hurt by a co-op host who gives themselves 1000 lives), but it does mean leaderboards / achievements have to be local-only or unenforceable.
- **Asymmetric quality.** If the host has a bad uplink, *everyone else* has a bad time. There's no way to "vote for a better host" without doing host migration.
- **Matchmaking still needs a server.** "Find me a game" doesn't work without a coordinator that knows what rooms exist. So you don't actually escape ops cost — you just shift it from "game server" to "matchmaking server."

### Centralized (server-authoritative)

The server runs the canonical simulation. Clients send inputs, receive state.

**Strengths**

- **Trust is solved.** The server is the truth. Anti-cheat is "did the input the client sent obey the rules?" — straightforward for movement (max speed bound) and weapon fire (cooldown / charge state).
- **Symmetric latency.** Every player sees the same delay to the server (modulo their own connection). Nobody has the host's home-field advantage.
- **Host-migration is a non-problem.** If a player quits, the server keeps running. The remaining players continue.
- **Persistence is easy.** Save the run state server-side; let the player rejoin. (Out of scope for v1, but free architecturally.)
- **Simpler client.** The client is closer to a "view" of an authoritative state. Less code, fewer race conditions.

**Weaknesses**

- **You pay for the server.** Even at modest concurrency (a few hundred CCU) a single small VPS is enough; this is a manageable cost but not zero.
- **Latency floor.** Even the player physically next to the data center pays ~5–10ms one-way to the server. Players on the other side of the world pay 100–200ms. Mitigated by client-side prediction.
- **Single point of failure.** If your one region goes down, multiplayer is down. (Acceptable for v1; multi-region is later.)
- **Scaling complexity.** Eventually you need sharding, room-affinity, etc. Not v1's problem.

### Hybrid: server-coordinated P2P

Server handles matchmaking + signaling; gameplay runs P2P over WebRTC. Common in indie games that want to minimize bandwidth costs.

**Strengths**

- **You pay for matchmaking server traffic only**, which is small and bursty.
- **Game-state bandwidth is borne by clients** (host's uplink, in a star topology).

**Weaknesses**

- **Inherits all P2P weaknesses** (host quit, host advantage, host quality dictates room quality, host trust).
- **Inherits WebRTC weaknesses** (signaling complexity, TURN cost when peers can't connect directly, ~5–10% connection-fail rate).
- **Two protocols, two failure modes.** The matchmaking server *and* the WebRTC mesh both have to work for the player to play.

### Verdict on topology

**Use centralized.** For Rainboids' specific shape — co-op, PvE, wave-based, drop-in — the centralized model is dramatically simpler to ship and operate, and the only thing it gives up (server hosting cost) is a known small number.

P2P would be a sensible call if Rainboids were PvP and latency-sensitive, or if it were targeting offline-LAN play, or if hosting cost were prohibitive. None of those apply.

---

## Recommended architecture

### High level

```
+------------+      WebSocket (TLS)       +------------------------+
|  Browser   |  <---------------------->  |  Rust matchmaking      |
|  (client)  |                            |  + game server         |
+------------+                            +------------------------+
                                              ^
                                              | spawns / hosts
                                              v
                                          +------------------------+
                                          | Per-room simulation    |
                                          | task (Rust async)      |
                                          +------------------------+
```

One Rust process. Inside, a matchmaking service plus a pool of room simulations. Each room is its own async task, ticking at 60Hz, holding the canonical state of its 1–4 players' run. WebSockets fan out from each room to its players.

### Wire protocol shape

Two message kinds, both binary-encoded (probably `bincode` or `postcard`; JSON for the matchmaking layer is fine since it's low-volume).

**Client → Server**

- `Hello { client_version, display_name }`
- `MatchmakeRequest { mode: QuickMatch | RoomBrowse | RoomCreate { name } }`
- `JoinRoom { room_id }`
- `LeaveRoom`
- `Input { tick, move_x, move_y, aim_x, aim_y, fire, fire_power, weapon_select }` — sent at high cadence (30Hz)
- `Ping { client_t }`

**Server → Client**

- `Welcome { player_id, server_t }`
- `RoomList { rooms: [...] }`
- `RoomJoined { room_id, your_slot, peers: [...], wave: ..., seed: ... }`
- `Snapshot { tick, ships: [...], enemies: [...], asteroids: [...], drops: [...] }` — sent at 20Hz, delta-compressed against last-acked
- `Event { tick, kind: BulletSpawn | BulletDespawn | EnemyDestroy | OrbCollect | WaveStart | WaveClear | PlayerJoin | PlayerLeave | ... }`
- `Pong { client_t, server_t }`

### Tick rates

| What | Rate | Why |
|---|---|---|
| Server simulation tick | 60Hz | Matches existing client engine; clean math |
| Client input send | 30Hz | Half tick rate is plenty for movement; lowers wire chatter |
| Server snapshot send | 20Hz | Each snapshot interpolated client-side over ~50ms |
| Server event send | as-needed | Events are spawn/despawn moments; cadence-irregular |

### Client-side prediction & reconciliation

The single hardest piece. Sketch:

1. Client buffers its own inputs and assigns each a `tick` number.
2. On input, client immediately applies the input to its local ship state (so the ship feels responsive — no "wait for server" delay).
3. Server processes inputs, runs simulation, sends snapshots.
4. When a snapshot arrives carrying `acked_input_tick = N`, the client:
   - Discards predicted state up to and including tick N.
   - Replays inputs from `N+1` forward, starting from the server's snapshot value.
5. If the snapshot disagrees with what the client predicted at tick N, the client snaps to the snapshot value and re-runs inputs from there. The visible effect is a tiny correction; usually invisible.

For other players' ships, no prediction — interpolate between the last two received snapshots, displaying ~50ms in the past. Standard Quake-3-era netcode.

### Engine refactor required

Right now `js/modules/game-engine.js` is a 2,555-line monolith that mixes simulation tick, input reading, and rendering in one update loop. Multiplayer requires splitting these:

- **Simulation core** — pure function from `(state, inputs) → next_state`. No DOM, no rendering, no audio. Must run on Rust server *and* on JS client (for prediction).
- **Input layer** — captures keys/mouse/gamepad, packages them into the wire format.
- **Render layer** — already mostly separate (`draw()` paths in entities, plus the WebGL renderers); needs to consume snapshot state instead of "the live entity pool."
- **Effect layer** — particles, sound, screen shake. Already mostly cosmetic; just needs to be triggered from server events instead of from inline simulation calls.

This is the largest engineering cost of the project and should not be underestimated. See "Engine refactor" in the rollout phase below.

### Why Rust on the server

- **Memory safety + fearless concurrency.** A long-lived game server is exactly the workload Rust is designed for.
- **Async ecosystem (`tokio`, `axum`, `tokio-tungstenite`)** is mature. WebSocket + room actor pattern is well-trodden territory.
- **CPU efficiency.** Even on a small VPS you can host hundreds of concurrent rooms.
- **Compiles to a single static binary.** Operationally lovely.

Other reasonable choices: Go (similar properties, simpler learning curve, slightly higher per-room memory). Node (familiar to a JS dev, but the GC + single-thread quirks aren't fun under sustained load). Rust is the recommendation but Go is a fine alternative if Rust experience is missing.

---

## Matchmaking and lobby

Three entry paths from the title screen:

1. **Quick Match.** Client tells server "any room with space, any difficulty, any wave." Server returns a room ID; client joins. If no rooms available, server creates one and the client waits in the lobby for others (with a 30s timer; if no one shows, start solo).
2. **Browse.** Server returns a list of public rooms with metadata (player count, current wave, host name). Client picks one and joins.
3. **Create / Join Code.** Client creates a private room, gets a 6-character code, shares with friends; friends type the code on the title screen to join. (Discord-style.)

Difficulty / wave scaling auto-adjusts to active player count. A wave-1 enemy budget for 1 player becomes ~1.6× for 2 players, ~2.2× for 3, ~2.8× for 4. (Roughly; tune by playtest.) Drop-in mid-run inherits the run's current wave; the joiner doesn't get to "rewind."

---

## Drop-in / drop-out semantics

### Drop-in

The cleanest moment to add a player is between waves. The wave-clear screen — already a natural pause where everyone picks powerups — extends a "JOINING" slot. The joining client downloads a room state snapshot (positions are irrelevant since the next wave starts fresh; only player progression matters), spawns at a safe location at wave start, and is in.

Mid-wave joining is also supported but cheaper to do right than wrong:

- The new player spawns at the safest location the server can find (largest empty radius from any enemy/asteroid/bullet).
- They get 3 seconds of invincibility (already exists for wave-start) plus a short warp-in animation.
- They start at level 1 with no powerups for that run, even if the existing players are at level 8 with full builds. The other players' progression is *theirs*; matching difficulty would mean either nerfing them or massively overpowering the joiner. Easier and cleaner: the joiner is just a fresh ship offering an extra gun, and they catch up via gold drops as the run continues.

### Drop-out

A player who hits "Leave" gets a brief warp-out animation, drifts off, and disappears. Their drops on the ground stay (free for everyone). Their score stays in the post-run summary. The remaining players continue uninterrupted; difficulty scaling adjusts down at the next wave boundary.

A player who *disconnects* (browser closed, network blip) is held for a 30-second grace period. Their ship freezes invulnerable in place; if they reconnect within the window, they resume with full state. Otherwise they're treated as "left."

### Server-driven safety

If all players in a room disconnect within the grace window, the server pauses the simulation. If anyone returns within ~5 minutes, the run resumes. After that, the room is destroyed. This costs almost nothing (paused simulation = no tick) and rescues a lot of "my wifi blipped at wave 12" situations.

---

## Co-op design questions

These are gameplay decisions, not netcode, but they shape what state needs to sync.

### Shared or individual?

| Thing | Recommendation | Why |
|---|---|---|
| Health pool | Individual | Each ship has its own HP; downed players can be revived (see below) |
| Score | Individual | Personal pride matters; shared score makes the player who shoots more feel diluted |
| Gold | Individual | Each player picks up their own coins; encourages spreading out |
| XP / level | Individual | Same |
| Powerups | Individual | Each player picks their own at wave clear |
| Wave clear gate | Shared | Wave ends when the room's enemy pool is empty, regardless of who killed what |
| Wave-start invuln | Shared | Everyone gets it |

### Friendly fire

**Off.** No PvP per the goals; bullets pass through allied ships. This also kills any "griefer pushes you into an asteroid" vector.

### Reviving downed players

When a player hits 0 HP, instead of game-over, their ship goes into a downed state — a glowing, drifting wreck. Any other player can fly over it and hold a button for ~2 seconds to revive them at low HP. If all players are downed simultaneously, the run ends. This is the standard *Helldivers / Risk of Rain 2* coop pattern and it works.

### Drop attribution

Money orbs and health orbs drop from kills *near* the killing player but are collectible by anyone. Encourages cooperation; keeps the rich-getting-richer feedback loop in check.

### Loot / shop

Each player has their own shop and their own gold. The shop pause does not pause the run for other players (a mid-wave shop visit means you're ducking out of combat for a moment, which is a fair tradeoff).

### Wave-clear powerup picks

Each player picks individually; the room transitions to the next wave when *all* alive players have picked or skipped. Disconnected players are auto-skipped after the grace window.

---

## Engineering work breakdown

Roughly ordered. Heavy items first; easy items last.

### Phase 1 — Engine refactor (largest cost, no multiplayer yet)

Goal: extract the simulation from the rendering and effects.

- Split `game-engine.js` into a pure simulation module + input layer + render layer + effect layer.
- Define an explicit `GameState` shape (typed; even in JS, document the keys).
- Make every simulation step a pure function: `simulateTick(state, inputs, dt) → newState`.
- Particles, sound, and damage numbers triggered from server events, not from inline sim calls.
- All RNG goes through a seeded source per-room, not `Math.random()`.

This phase ships a single-player game that **is no different to play** but is structured to support a server. The PR for this phase should be invisible to the player.

### Phase 2 — Server skeleton

- Rust crate with `tokio` + `axum` + `tokio-tungstenite`.
- One process, room actor pattern, in-memory state only.
- Wire protocol via `bincode` or `postcard`.
- Matchmaking endpoint (Quick Match / Browse / Create) over a separate small JSON-over-WebSocket channel.
- Simulation tick at 60Hz per room; snapshot fanout at 20Hz.
- Port the simulation logic from JS to Rust. (This is also large, but mechanical given Phase 1's clean state shape.)

### Phase 3 — Client integration

- WebSocket client class wrapping `new WebSocket()` with reconnection + auth.
- Client-side prediction / reconciliation for the local ship.
- Snapshot interpolation for remote ships, enemies, asteroids, drops.
- Bullet event handling (spawn / despawn).
- HUD changes: show partner ships' HP, gold, score.

### Phase 4 — Co-op design

- Reviving mechanic.
- Shared wave-clear + per-player picks UI.
- Drop attribution and orb collection rules.
- Wave-scaling tuning by player count.

### Phase 5 — Matchmaking & lobby UX

- Quick Match button on title screen.
- Browse rooms screen.
- Create / join private room with code.
- Lobby screen with ready toggle, player avatars, mode selection.

### Phase 6 — Drop-in / drop-out

- Mid-run join: safe-spawn algorithm, warp-in, invuln window.
- Disconnect grace: server-side freeze, client-side reconnection.
- Drop-out cleanup: drift-out animation, difficulty re-scale at next wave boundary.

### Phase 7 — Operational hardening

- Metrics endpoint (room count, player count, tick time, snapshot bytes).
- Crash recovery (room state lost on crash is acceptable for v1; document it).
- Logging that's actually useful (per-room structured logs, not a firehose).
- A simple admin endpoint to peek room state.
- Deploy pipeline (single binary on a small VPS; nginx terminating TLS).

### Phase 8 — Closed beta

- Invite-only, friends and family.
- Telemetry on real connections: latency distributions, snapshot loss, disconnect frequency.
- *Then* decide whether WebRTC is worth pursuing for v2.

---

## Risks and open questions

### Big risks

- **Engine refactor is invasive.** `game-engine.js` has years of accreted single-player shortcuts. Extracting a pure simulation will surface many small "this code reaches into the renderer" violations. Budget generously.
- **Determinism is harder than it sounds.** Once the same simulation has to run on Rust and JS for prediction to work, every floating-point inconsistency becomes a bug. The mitigation is to lean *snapshot-heavy* rather than *fully-deterministic-replay*: the server is the truth and the client just gets snapshots. Local prediction only handles input → ship-position; everything else is server-driven.
- **Wave-pool spawn timing.** Each existing wave uses `setTimeout` to spawn enemies over time. Server has to drive these timings authoritatively, ignoring client clocks.
- **Hosting cost is small but ongoing.** A solo project's economics need to handle the server bill even at zero revenue. A $5–10/month VPS handles dozens of concurrent rooms; budget for that and document it as the "minimum viable multiplayer cost."

### Smaller risks

- Audio context resume is per-tab. New player joining mid-run hears music starting fresh. Probably fine; flag if it grates.
- Mobile players on intermittent networks may bounce in and out a lot. The 30s grace should absorb most of this.
- The shop pausing only-for-one-player is a UX novelty; needs playtest validation.

### Open questions

- **Is co-op spectator mode worth it?** A friend who wants to watch but not play. Probably no for v1.
- **How many rooms per server process before sharding?** Empirically, a single Rust process should handle 100+ rooms easily, but this is unmeasured. Plan for "scale by adding processes behind a router" later.
- **Should there be a "host migration" if the server goes down?** No — it's centralized, the server failure is what it is. Document a graceful "you've been disconnected, the server crashed, here's a refund of your run progress" path.
- **Difficulty scaling formula.** Linear in player count is the obvious start; playtest will refine.
- **Shared cosmetic ship colors?** Each player needs to be visually distinguishable. Pre-assign palette colors per slot (P1 red trail, P2 blue, P3 green, P4 yellow), no customization in v1.

---

## What we explicitly choose against, and why

These were considered and rejected for v1; documented so future-us doesn't re-relitigate.

- **WebRTC DataChannels for game state.** Latency/jitter wins are real but the operational cost (TURN, signaling, fallbacks, debugging tooling) is too high for the marginal gain in a PvE shooter. Re-evaluate after closed beta with real telemetry.
- **P2P host-authoritative.** Host migration complexity, host trust, host quit fragility. Even if it saves on hosting cost, it costs more in code and bug surface.
- **Lockstep deterministic simulation.** The classic RTS netcode pattern. Rejected because (a) we have a *lot* of randomness in spawn timing, AI, particles, etc. that would need to be made strictly deterministic, and (b) the latency floor is "slowest player's RTT" which is bad for joiners.
- **Rollback netcode.** Wonderful for fighting games. Overkill for PvE co-op where small server-driven corrections are invisible.
- **Per-region servers in v1.** Latency to a single server is acceptable for most players; multi-region complexity (room affinity, cross-region matchmaking) is a v2 problem.
- **Persistent accounts in v1.** Anonymous + display name + ephemeral rooms. Accounts can come later if there's any reason to want them.
- **Voice chat.** Out of scope. Players use Discord.

---

## Bottom line

A Rust authoritative server speaking WebSocket, with client-side prediction for the local ship and snapshot interpolation for everything else, is the lowest-complexity path to shipping co-op Rainboids. It will absorb 95% of real-world connection conditions on day one, requires no second protocol, no STUN/TURN infrastructure, and no host-migration kabuki. It costs a server bill — a known, small, ongoing number — in exchange for vastly easier debugging, simpler code, and uniform player experience.

The largest engineering cost is *not* the netcode; it's the engine refactor that gives us a clean simulation core. Doing that well makes everything downstream easier — and it's worth doing even if multiplayer slips.

---

# Part II — Implementation Plan

This section is the concrete implementation companion to Part I. It assumes Part I's conclusions (Rust authoritative server, WebSocket transport, server-side simulation with client-side prediction for the local ship) and fleshes out the actual shape of the code, the server, the wire protocol, the JS refactor, and the rollout.

It's still a plan — not a spec. Specifics here are what I'd start coding from; they'll surely shift on contact with reality.

---

## Where the server code lives

The server is a Rust crate, separate from the existing JS game. CLAUDE.md disallows new top-level directories without approval, so this is a decision point for the user. Options:

1. **`server/` (new top-level dir; needs approval).** Cleanest semantically — this is a production deployable, not a development tool.
2. **`tools/server/`.** Fits the existing structure but undersells the role; `tools/` houses dev infra (`benchmark/`, `ai-qa-bot/`, `juice-capture.mjs`), and a deployable game server doesn't quite belong there.
3. **Separate repo entirely.** A `rainboids-server` repo. Common for client/server splits, and lets the server have its own release cadence and CI without entangling the game's. The downside is the two repos drift: schema changes need coordinated PRs.

**Recommendation:** option 1 (`server/`) once approved. Single repo keeps wire-protocol changes atomic — a PR can touch both `js/modules/net/protocol.js` and `server/src/protocol/mod.rs` in lockstep, and CI can verify both sides of the protocol agree.

For the rest of this plan I'll use `server/` as the path.

---

## Crate layout

```
server/
├── Cargo.toml
├── README.md
├── .env.example
├── deploy/
│   ├── nginx.conf.example
│   ├── rainboids-server.service
│   └── Dockerfile
├── benches/
│   └── simulation.rs
├── tests/
│   ├── integration_room.rs
│   ├── integration_matchmaking.rs
│   ├── integration_dropin.rs
│   └── integration_grace.rs
└── src/
    ├── main.rs               -- entry: CLI, config load, signal handling
    ├── config.rs             -- env + CLI -> Config
    ├── error.rs              -- AppError, Result alias
    ├── server/
    │   ├── mod.rs
    │   ├── http.rs           -- axum router; HTTP + WS upgrade endpoints
    │   ├── connection.rs     -- per-WS task; reads frames -> dispatches
    │   └── auth.rs           -- session tokens, reconnect handshake
    ├── protocol/
    │   ├── mod.rs            -- ClientMsg / ServerMsg / GameEvent enums
    │   ├── codec.rs          -- bincode encode/decode helpers
    │   └── version.rs        -- WIRE_VERSION + compat checks
    ├── matchmaking/
    │   ├── mod.rs            -- MatchmakingActor (singleton)
    │   ├── quickmatch.rs     -- find-or-create policy
    │   └── browse.rs         -- public-room listing
    ├── room/
    │   ├── mod.rs            -- RoomActor + per-room state
    │   ├── handle.rs         -- RoomHandle (mpsc sender wrapper)
    │   ├── lifecycle.rs      -- create / join / leave / grace / close
    │   ├── snapshot.rs       -- snapshot construction + delta encoding
    │   └── safe_spawn.rs     -- mid-wave spawn-point picker
    ├── sim/
    │   ├── mod.rs            -- pub use; top-level simulate_tick
    │   ├── state.rs          -- GameState; entity collections
    │   ├── input.rs          -- PlayerInput; bounds validation
    │   ├── ship.rs           -- ship physics; powerup application
    │   ├── enemy.rs          -- enemy types; AI; attack patterns
    │   ├── asteroid.rs       -- asteroid spawn + split
    │   ├── bullet.rs         -- bullet integration; projectile events
    │   ├── wave.rs           -- wave spawn schedule + clear gate
    │   ├── collision.rs      -- broadphase + narrowphase
    │   ├── drops.rs          -- orbs: spawn, attract, collect
    │   ├── difficulty.rs     -- per-player count scaling
    │   └── rng.rs            -- per-room seeded Pcg64
    ├── obs/
    │   ├── mod.rs
    │   ├── metrics.rs        -- Prometheus exporter
    │   └── tracing.rs        -- tracing-subscriber setup
    └── util/
        ├── mod.rs
        ├── id.rs             -- RoomId, PlayerId, BulletId, ...
        └── time.rs           -- monotonic clock helpers
```

The `sim/` module is the heart and the largest part. It mirrors the layout of the JS engine's eventual extracted simulation (`js/modules/sim/`, post-refactor), so concepts and module names line up across languages.

---

## Tech stack

- **Rust** stable, latest at the time of writing.
- **`tokio`** — multi-threaded async runtime.
- **`axum`** — HTTP/WS routing. Plays nicely with `tower` middleware (rate limiting, tracing).
- **`tokio-tungstenite`** — WebSocket protocol; `axum`'s WS extractor wraps it.
- **`serde`** — serialize/deserialize.
- **`bincode` (or `postcard`)** — compact binary encoding for the wire. `postcard` is a hair smaller; `bincode` has wider tooling.
- **`dashmap`** — concurrent map for the room registry.
- **`glam`** — `Vec2` and matrix math.
- **`rand_pcg`** — seeded deterministic PRNG. PCG family is fast, statistically sound, and small state.
- **`tracing` + `tracing-subscriber`** — structured logging.
- **`metrics` + `metrics-exporter-prometheus`** — counters / gauges / histograms.
- **`clap` v4** — CLI args.
- **`dotenvy`** — `.env` file loader.
- **`thiserror`** — typed error enums for libraries.
- **`anyhow`** — error context propagation in app code.
- **`uuid`** — session token generation.
- **`nanoid`** — short, human-friendly room codes.

---

## Wire protocol

Versioned, binary, single-message-per-frame. The whole protocol lives in `server/src/protocol/` and has a JS counterpart in `js/modules/net/protocol.js`. Both sides import a shared `WIRE_VERSION` constant and refuse mismatched peers.

### Versioning

A `WIRE_VERSION: u16` baked into both sides. The client sends a `Hello` as its first message; the server checks the version and either welcomes the client or closes the WS with code `1002` and a JSON body `{"reason":"version_mismatch","server":N,"client":M}`. Bumps to `WIRE_VERSION` accompany every breaking protocol change.

### Frame format

Each WebSocket frame is a single bincode-encoded message — `Vec<u8>` payload, binary opcode. No batching for v1; revisit only if profiling shows wire pressure.

### Message enums (sketch)

```rust
// Client -> Server
pub enum ClientMsg {
    Hello {
        wire_version: u16,
        client_version: String,
        display_name: String,
        session: Option<Uuid>,   // for reconnect
    },
    QuickMatch,
    BrowseRooms,
    CreateRoom { name: String, public: bool, max_players: u8 },
    JoinRoom { room_id: RoomId },
    JoinRoomByCode { code: String },
    LeaveRoom,
    Input { tick: u32, packed: PackedInput },   // 30Hz
    Ack { snapshot_tick: u32 },
    Pong { client_t: u32, server_t: u32 },
    PowerupChoose { powerup: PowerupId },
    Revive { target: PlayerId },
    Chat { text: String },
}

// Server -> Client
pub enum ServerMsg {
    Welcome { player_id: PlayerId, session: Uuid, server_t_ms: u64 },
    Error { code: ErrCode, msg: String },
    RoomList { rooms: Vec<RoomSummary> },
    RoomJoined {
        room_id: RoomId,
        code: String,
        slot: u8,
        peers: Vec<PeerInfo>,
        wave: u32,
        seed: u64,
    },
    RoomLeft { reason: LeaveReason },
    PeerJoined { peer: PeerInfo, slot: u8 },
    PeerLeft { slot: u8, reason: LeaveReason },
    Snapshot { tick: u32, base_tick: Option<u32>, payload: SnapshotPayload },
    Event { tick: u32, event: GameEvent },
    Ping { client_t: u32, server_t: u32 },
}

pub enum GameEvent {
    BulletSpawn { id: BulletId, owner: PlayerId, weapon: WeaponId, x: f32, y: f32, vx: f32, vy: f32 },
    BulletDespawn { id: BulletId, reason: DespawnReason },
    EnemyDestroy { id: EnemyId, by: Option<PlayerId>, drops: Vec<DropId> },
    AsteroidDestroy { id: AsteroidId, by: Option<PlayerId>, fragments: Vec<AsteroidId> },
    OrbCollect { id: DropId, by: PlayerId, value: u32 },
    PlayerDamaged { player: PlayerId, hp: f32 },
    PlayerDowned { player: PlayerId },
    PlayerRevived { player: PlayerId, by: PlayerId },
    WaveStart { wave: u32, enemy_count: u32 },
    WaveClear { wave: u32, time_ms: u32 },
    PowerupOffer { player: PlayerId, picks: u8 },
    PowerupChosen { player: PlayerId, powerup: PowerupId },
    HitFlash { entity: EntityRef, intensity: f32 },     // cosmetic only
    DamageNumber { x: f32, y: f32, value: i32, kind: DmgKind }, // cosmetic only
}
```

The cosmetic events (`HitFlash`, `DamageNumber`) cross the wire because they're *triggered* by simulation moments the client wouldn't otherwise know about. Particles, screen shake, and sound are derived purely from these events plus simulation events; the client never emits its own.

### Snapshots vs events

Two parallel streams from server to client:

- **Snapshots** carry slow-moving high-volume state — positions, velocities, HP, power-cooldowns. Sent at ~20Hz. Each snapshot can reference a `base_tick` (the last tick the receiving client acked); the server XOR-deltas against that base. If the client hasn't acked recently, the server falls back to a full snapshot.
- **Events** are discrete moments — bullet spawns, enemy destroys, wave transitions, collects. Sent immediately as they happen; the client is responsible for catching up.

This split lets us send a lot of small fast events (bullet spawns) without paying snapshot overhead for them, and lets snapshots stay focused on the entities that *can't* be reconstructed from event streams (continuous-state stuff like ship position).

### Input packing

`PackedInput` fits in roughly 6 bytes:

```
move_x: i8                   normalized x axis, -127..127
move_y: i8                   normalized y axis
aim_x:  f16                  world-space aim x (or screen-space delta from ship)
aim_y:  f16                  world-space aim y
buttons: u8                  bitfield: fire | fire_power | weapon_cycle | revive | ...
```

At 30Hz upstream that's ~180 B/s per player. Trivial.

---

## Server architecture (actor model)

```
                 ┌──────────────────────┐
                 │   axum HTTP server   │
                 │   /health  /metrics  │
                 │   /ws                │
                 └─────────┬────────────┘
                           │ WS upgrade
                           ▼
              ┌──────────────────────────┐
              │  ConnectionTask (1/conn) │
              │  reads/writes WS frames  │
              └────┬─────────────────┬───┘
                   │                 ▲
                   ▼              ServerMsg
        ┌──────────────────┐
        │ MatchmakingActor │
        │  (1 global)      │
        └────────┬─────────┘
                 │ enroll
                 ▼
        ┌──────────────────────┐
        │  RoomActor (1/room)  │
        │  60Hz sim tick       │
        │  ~20Hz snapshot      │
        └──────────────────────┘
```

- One `ConnectionTask` per WebSocket; owns the read/write halves and a small outbound mpsc.
- One `MatchmakingActor` (singleton) handles room creation, browse, quick-match, code lookup.
- One `RoomActor` per active room; owns its authoritative `GameState`, runs the simulation tick, fans out snapshots and events.

### Channels

- Connection → Matchmaking: shared `mpsc<MMInbound>`.
- Connection → Room (after join): per-room `mpsc<RoomInbound>`.
- Room → Connection (snapshots, events): each connection holds an `mpsc<ServerMsg>` whose receiver feeds the WS write half. Room broadcasts by iterating its `Vec<PlayerHandle>` and `try_send`-ing.

### Backpressure & slow-client policy

- **Inbound:** ConnectionTask reads frames and routes via bounded mpsc. If the actor is busy, the connection awaits — natural backpressure since channels are async.
- **Outbound:** ConnectionTask drains its outbound mpsc and writes to the WS. If the WS write blocks, the mpsc backs up. When `try_send` returns `Full`, the room flags the client as `lagging` and skips snapshots until the channel drains. After 5s of continuous lag, the room kicks the client.

### Connection lifecycle

```
1. WS upgrade  -> ConnectionTask spawned.
2. ConnectionTask awaits Hello with 3s timeout. Bad/missing Hello -> close.
3. Reply Welcome { player_id, session }.
4. Forward subsequent ClientMsgs to MatchmakingActor.
5. On MM-driven RoomJoined, the connection is given a RoomHandle.
6. Forward Input/Ack/LeaveRoom/etc. to that RoomHandle.
7. On WS close (clean or unclean), notify the room so it can begin grace handling.
```

### Reconnect

`Hello` carries an optional `session: Uuid`. If the matchmaking layer recognizes the session as belonging to a recently disconnected player still within the room's grace window, the new connection is re-attached to that room slot and the room sends a full snapshot to bring it up to speed. Otherwise the session is treated as a fresh connection.

---

## Per-room simulation loop

### Tick pacing

```rust
async fn run_room(mut room: Room) {
    let mut tick_interval = tokio::time::interval(Duration::from_millis(16));
    tick_interval.set_missed_tick_behavior(MissedTickBehavior::Burst);
    let mut tick_counter = 0u32;
    loop {
        tokio::select! {
            _ = tick_interval.tick() => {
                room.drain_inbound();         // apply queued ClientMsgs
                room.simulate_one_tick();      // pure-ish over GameState
                tick_counter = tick_counter.wrapping_add(1);
                if tick_counter % 3 == 0 {     // ~20Hz
                    room.broadcast_snapshot();
                }
                room.broadcast_pending_events();
                if room.should_shutdown() { break; }
            }
            msg = room.cmd_rx.recv() => {
                match msg {
                    Some(cmd) => room.enqueue_inbound(cmd),
                    None => break, // sender dropped -> shutdown
                }
            }
        }
    }
    room.cleanup();
}
```

Inbound messages buffer between ticks; simulation stays in lockstep with its own clock regardless of message-arrival jitter. `MissedTickBehavior::Burst` plus a `max_steps_per_real_frame = 4` guard prevents catch-up loops from compounding.

### Per-room state

```rust
pub struct Room {
    id: RoomId,
    code: String,
    config: RoomConfig,
    state: GameState,
    inputs: HashMap<PlayerId, InputBuffer>,
    rng: Pcg64,
    tick: u32,
    players: Vec<PlayerHandle>,
    cmd_rx: mpsc::Receiver<RoomInbound>,
    pending_events: Vec<GameEvent>,
    snapshot_history: VecDeque<(u32, SnapshotPayload)>,
    grace_disconnects: HashMap<PlayerId, GraceTimer>,
    metrics: RoomMetrics,
}
```

### Simulation function shape

```rust
pub fn simulate_tick(
    state: &mut GameState,
    inputs: &PlayerInputs,
    dt: f32,
    rng: &mut Pcg64,
    events: &mut Vec<GameEvent>,
) {
    ship::update_all(&mut state.ships, inputs, dt, events);
    enemy::update_all(&mut state.enemies, &state.ships, dt, rng, events);
    asteroid::update_all(&mut state.asteroids, dt, events);
    bullet::integrate(&mut state.bullets, dt);
    collision::detect_and_resolve(state, events);
    drops::update(&mut state.drops, &state.ships, dt, events);
    wave::tick(&mut state.wave, &mut state.enemies, dt, rng, events);
    cull::cull_dead(state);
}
```

A pure-ish function — mutates `state` in place but is otherwise deterministic given `(state, inputs, dt, rng-state)`. The same logic runs on the JS client for prediction (only the ship-movement subset has to agree byte-for-byte; everything else is server-driven and reconciled via snapshots).

---

## Drop-in / drop-out implementation

### Drop-in: between waves (clean path)

1. Player joins via matchmaking → `RoomActor::handle_join`.
2. Room is in `WaveTransition` state → join succeeds immediately at the next free slot.
3. Server sends `RoomJoined` with current snapshot, wave info, and the room's RNG seed.
4. New player participates in the next wave-start with everyone else.

### Drop-in: mid-wave

1. Player joins → room is `Playing`.
2. Server runs `find_safe_spawn(state)`:
   - Sample 32 candidate points across the playfield (Halton-sequence sampling for even coverage).
   - For each candidate, compute distance to nearest enemy, asteroid, and enemy bullet.
   - Pick the candidate with the largest minimum distance.
3. Server creates the new ship there with a 3-second invulnerability and a warp-in animation event.
4. New player receives a full snapshot + the spawn event.
5. Server broadcasts `PeerJoined` to existing players; their clients render the warp-in.

### Drop-out: voluntary

1. Player sends `LeaveRoom`.
2. Room emits warp-out event → broadcast → 1s warp-out animation → remove ship from state → broadcast `PeerLeft`.
3. The leaving player's drops on the ground stay (free for everyone).
4. Difficulty re-scales at the next wave-start.

### Drop-out: connection lost

1. ConnectionTask exits (WS error).
2. Room receives `RoomInbound::Disconnected { player_id }`.
3. Room marks the player's ship `frozen_invulnerable` in place; starts a 30s grace timer.
4. If a reconnect arrives within 30s with matching session → un-freeze; full snapshot to catch up.
5. Otherwise → promote to voluntary leave path.

### All-disconnect: room pause

1. If all players grace-out, room transitions to `Paused`.
2. No tick runs while paused (zero CPU cost).
3. If anyone reconnects within 5 minutes, room resumes.
4. After 5 minutes, room is destroyed and matchmaking removes it from the registry.

---

## Matchmaking implementation

### Quick match

```rust
fn quickmatch(rooms: &RoomRegistry) -> QuickmatchResult {
    let candidates: Vec<_> = rooms.iter()
        .filter(|r| r.public
                 && r.players.len() < r.max_players
                 && !matches!(r.state, RoomState::Closing | RoomState::Paused))
        .collect();
    if let Some(best) = candidates.iter().min_by_key(|r| r.wave) {
        QuickmatchResult::Found(best.id)
    } else {
        QuickmatchResult::CreateNew { config: RoomConfig::default_quickmatch() }
    }
}
```

A new quickmatch room sits in `WaitingForPlayers` for 30s. If it fills (or 30s elapses), it transitions to `Playing` with whoever's there — even if just one player.

### Code-based join

6-character alphanumeric codes generated via `nanoid` with a custom alphabet (no `O`/`0`/`I`/`1` ambiguity). Codes are unique among active rooms; reusable after a room destructs.

### Browse

`BrowseRooms` returns rooms with `public = true` and slots available, sorted by wave (lower first). Pagination: 50 per page, accept `offset` parameter.

### Skill matching

Out of scope for v1.

---

## Client-side implementation (JS)

### File layout (new code under `js/modules/net/`)

```
js/modules/net/
├── ws-client.js        -- WebSocket wrapper; reconnect; ping
├── protocol.js         -- ClientMsg / ServerMsg encode/decode (mirrors Rust)
├── prediction.js       -- input buffer + reconciliation (local ship)
├── interpolation.js    -- snapshot lerp (remote entities)
├── matchmaking.js      -- title-screen quick-match / browse / create
└── session.js          -- session token persistence in localStorage
```

### Engine integration

`game-engine.js` gains a `mode` flag — `solo` or `online`. In online mode:

- `update()` no longer mutates simulation state directly. Instead it:
  1. Reads inputs.
  2. Sends `ClientMsg::Input` (coalesced to 30Hz).
  3. Pumps the snapshot buffer; lerps remote entities; reconciles local ship.
  4. Drains the event queue; spawns particles, sounds, damage numbers, screen shake.
- `render()` is unchanged — it renders the entity views regardless of how state arrived.

In solo mode the existing single-player simulation runs in-process (after the Phase 1 refactor extracts it from rendering), bypassing all networking. Same client binary.

### Local prediction

```js
class Predictor {
    pendingInputs = [];      // [{tick, input}, ...]
    lastAckedTick = 0;
    localShipState = null;

    onInput(tick, input) {
        this.pendingInputs.push({ tick, input });
        this.localShipState = applyShipInput(this.localShipState, input, DT);
    }

    onSnapshot(tick, serverShipState) {
        this.pendingInputs = this.pendingInputs.filter(p => p.tick > tick);
        let s = serverShipState;
        for (const p of this.pendingInputs) {
            s = applyShipInput(s, p.input, DT);
        }
        this.localShipState = s;
        this.lastAckedTick = tick;
    }
}
```

`applyShipInput` is the JS counterpart of the Rust `ship::update_one`. They must agree on movement physics; everything else is server-driven, so cross-language consistency is one function deep, not the whole simulation.

### Remote-entity interpolation

```js
class Interpolator {
    snapshots = [];  // [{t, state}, ...] — last 4

    onSnapshot(t, state) {
        this.snapshots.push({ t, state });
        if (this.snapshots.length > 4) this.snapshots.shift();
    }

    sample(now) {
        const renderT = now - 0.05;            // render ~50ms in the past
        const [a, b] = pickSurrounding(this.snapshots, renderT);
        if (!a || !b) return latest(this.snapshots);
        const u = (renderT - a.t) / (b.t - a.t);
        return lerp(a.state, b.state, u);
    }
}
```

### Reconnect

`ws-client.js` reconnects on socket close with exponential backoff (1s, 2s, 4s, 8s, capped at 16s). On reconnect, it sends `Hello` with the previously stored session; the server resumes the same room slot if grace holds.

---

## JS engine refactor (prerequisite)

Without a clean simulation core on the client, the prediction/reconciliation story doesn't work. This refactor is the gate to all multiplayer work and produces value immediately even if multiplayer slips.

### Step 1 — Extract `simulateTick`

Find every `game-engine.js` site that mutates entity state. Collect them into a sequenced function `simulateTick(state, inputs, dt)`. The engine becomes a state-mutator caller. Every `Math.random()` in this path becomes `state.rng.random()` so the simulation can be seeded.

### Step 2 — Extract effect emission

The current engine inline-spawns particles inside collision handlers. Replace with event emission: `events.push({type: 'enemy_destroy', x, y, color})`. A separate `applyEffects(events, ctx)` handles the cosmetic side. This split is what later lets the server emit events that the client can replay locally.

### Step 3 — Extract input

Capture-and-package input into a `PlayerInput` struct once per frame at a single capture point. Currently inputs are read mid-update; this collapses them to a single boundary.

### Step 4 — Render reads `state`

Renderers currently iterate the engine's pools (`asteroidPool.activeObjects`, etc). Make them iterate `state.asteroids`, `state.enemies`, etc. Pools become an internal implementation detail of the simulation module.

### Step 5 — Verify parity

Run the refactored solo client extensively. Frame-by-frame, gameplay should feel identical and benchmarks should be within noise. This is the gate to landing the refactor before networking work begins.

After Step 5, `simulateTick` is a clean function that can be:
- Run on the client for solo play.
- Run on the client for prediction.
- Hand-ported to Rust for the server.

---

## Configuration

Both env-driven and CLI-overridable. Env beats default; CLI beats env.

| Variable | Default | Description |
|---|---|---|
| `RAINBOIDS_BIND_ADDR` | `0.0.0.0:8443` | WS listen socket |
| `RAINBOIDS_TLS_CERT_PATH` | unset | If unset, plaintext WS (front with nginx) |
| `RAINBOIDS_TLS_KEY_PATH` | unset | Companion to cert |
| `RAINBOIDS_LOG_LEVEL` | `info` | `info` / `debug` / `trace` |
| `RAINBOIDS_MAX_ROOMS` | `200` | Hard cap; reject new rooms past this |
| `RAINBOIDS_MAX_PLAYERS_PER_ROOM` | `4` | |
| `RAINBOIDS_TICK_HZ` | `60` | Simulation tick rate |
| `RAINBOIDS_SNAPSHOT_HZ` | `20` | Snapshot broadcast rate |
| `RAINBOIDS_GRACE_SECS` | `30` | Disconnect grace before promoting to leave |
| `RAINBOIDS_PAUSE_TIMEOUT_SECS` | `300` | All-disconnect room destruction timeout |
| `RAINBOIDS_METRICS_BIND` | `127.0.0.1:9090` | Prometheus exporter — internal only |
| `RAINBOIDS_ADMIN_TOKEN` | unset | Static token for `/admin/*` endpoints |

---

## Deployment

### Topology

```
[ Player browser ]
       │ HTTPS / WSS
       ▼
[   nginx   ] -- TLS termination, /metrics protected, rate limiting
       │ HTTP / WS upstream
       ▼
[ rainboids-server ] -- single binary, systemd-managed
```

### Single-VPS specs

A 2 vCPU / 2 GB RAM box handles a few hundred concurrent rooms comfortably. Numbers will firm up after load tests; this is the starting target.

### systemd unit (sketch)

```ini
[Unit]
Description=Rainboids multiplayer server
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/rainboids/env
ExecStart=/usr/local/bin/rainboids-server
Restart=on-failure
RestartSec=5s
User=rainboids
Group=rainboids
LimitNOFILE=65536
MemoryMax=1500M
ProtectSystem=strict
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### nginx (sketch)

```nginx
upstream rainboids_ws {
    server 127.0.0.1:8443;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name play.rainboids.example;
    ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    location /ws {
        proxy_pass http://rainboids_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout  600s;
        proxy_send_timeout  600s;
    }

    location /health {
        proxy_pass http://rainboids_ws;
    }

    location /metrics {
        deny all;   # accessed via SSH tunnel from the Prometheus box
    }
}
```

### Releases

- Tag-driven: pushing `server-vX.Y.Z` triggers GitHub Actions to build a Linux x86_64 binary and upload to GitHub Releases.
- Deploy script: SSH to the VPS, swap the binary, `systemctl restart rainboids-server`.
- 0-downtime is *not* a v1 goal. The client's reconnect logic absorbs a 2–3s server restart; players see a brief "reconnecting…" toast and resume.

---

## Testing

### Unit

Each `sim/*.rs` module gets unit tests against pure functions. A few golden-output tests pin key invariants — e.g. `simulate_tick` from a fixed seed and fixed inputs produces a known final state.

### Integration

`tests/integration_*.rs` files spawn the full server in-process and connect synthetic WS clients:

- `integration_room.rs` — create room, two clients join, simulate inputs, verify state propagation.
- `integration_matchmaking.rs` — quick-match returns the same room for two simultaneous joiners; codes round-trip; browse listing matches reality.
- `integration_dropin.rs` — third client joins mid-wave, verifies safe spawn placement and invuln window.
- `integration_grace.rs` — kill connection mid-game, reconnect within 30s, verify state resumption; let grace expire and verify clean leave.
- `integration_lag.rs` — synthetic slow-client (delayed `try_send` consumer); verify backpressure handling and eventual kick.

### Load

A separate `loadgen` binary opens N WS connections and pushes synthetic inputs. Used to characterize:

- CPU per concurrent room.
- Memory per concurrent room.
- Outbound bandwidth per player.
- Tail latency under load.

Pre-public-beta target: 100 concurrent rooms (400 players) at <50% CPU on a 2-vCPU box.

---

## Observability

### Metrics

Counters:
- `rainboids_rooms_created_total`
- `rainboids_rooms_destroyed_total`
- `rainboids_players_joined_total`
- `rainboids_players_left_total{reason=...}`
- `rainboids_messages_received_total{kind=...}`
- `rainboids_messages_sent_total{kind=...}`

Gauges:
- `rainboids_rooms_active`
- `rainboids_players_online`
- `rainboids_players_in_grace`

Histograms:
- `rainboids_tick_duration_seconds` — `simulate_tick` walltime
- `rainboids_snapshot_size_bytes` — wire size of broadcast snapshots
- `rainboids_input_age_ms` — server-tick-time minus input arrival time

### Logging

Structured JSON via `tracing-subscriber` JSON formatter. Per-event fields: `room_id`, `player_id`, `tick`, `event`. Level `info` in prod; `debug` toggleable per-room via the admin endpoint.

### Admin endpoints

- `GET /admin/rooms` — active rooms + player counts + current wave + tick time. Auth: static token from env.
- `POST /admin/room/:id/kick/:player` — kick a player. Same auth.
- `POST /admin/room/:id/log_level` — bump per-room log level for live debugging.

All admin endpoints are denied at nginx unless the request originates from a trusted internal IP, with the static token as a second factor.

---

## Build & CI

### Local dev

`cargo run` from `server/`. Client points to `ws://localhost:8443/ws` for dev (controlled by `js/modules/net/ws-client.js` reading from a build-time constant).

### CI

GitHub Actions:
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo test`
- `cargo build --release`
- (Eventually) `loadgen` smoke test against a freshly-built binary

The JS side already has its own CI; the server adds a parallel job that runs only when `server/**` changes.

---

## Implementation milestones

A solo-dev pace, anchor numbers, not commitments.

| Week | Goal |
|---|---|
| 1 | JS engine refactor steps 1–2 (extract `simulateTick`, extract effect emission). Solo play unchanged. |
| 2 | JS engine refactor steps 3–5 (extract input, render-reads-state, parity verification). |
| 3 | Rust scaffolding: `cargo new`, deps, `axum` Hello-World WS endpoint, protocol enums, codec. |
| 4 | ConnectionTask + MatchmakingActor (no rooms yet). Title-screen Quick Match button hooks up to "send Hello" and lights green. |
| 5 | RoomActor scaffolding. Tick loop. Empty `simulate_tick` placeholder. Snapshot fanout to connected clients. Two clients see each other connected to the same room. |
| 6–8 | Port `simulate_tick` from JS to Rust: ships, enemies, asteroids, bullets, collisions, drops, waves. End of block: 1-player "online" run plays the same as solo. |
| 9 | True multi-player: 2-player co-op end-to-end. Both players see each other; both can damage shared enemies. |
| 10 | Drop-in / drop-out: mid-wave joining, safe spawn, drift-out animation, grace timer. |
| 11 | Co-op design: revives, individual gold/score, shared wave-clear gate, friendly fire off, drop attribution. |
| 12 | Matchmaking polish: Quick Match, Browse, code-based private rooms. Lobby UX. |
| 13 | Observability: metrics, structured logs, admin endpoint. Initial load tests. |
| 14 | Closed beta: deploy to a single VPS, invite 8–12 testers, gather telemetry. |
| 15 | Beta-feedback patch cycle. Ship public beta. |

---

## Code sketches

A few illustrative Rust snippets to anchor the design. None are production-ready; they convey shape only.

### `main.rs`

```rust
#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    obs::tracing::init();
    let cfg = config::load()?;
    obs::metrics::init(cfg.metrics_bind);

    let mm = matchmaking::MatchmakingActor::spawn(cfg.clone());
    let app = server::http::router(mm.handle());

    let listener = tokio::net::TcpListener::bind(cfg.bind_addr).await?;
    tracing::info!(addr = %cfg.bind_addr, "rainboids-server listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}
```

### Connection task

```rust
async fn connection_task(ws: WebSocket, mm: MatchmakingHandle) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMsg>(256);

    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            let bytes = protocol::encode(&msg);
            if ws_tx.send(Message::Binary(bytes)).await.is_err() { break; }
        }
    });

    let hello = match read_hello(&mut ws_rx).await {
        Ok(h) => h,
        Err(_) => return,
    };
    if hello.wire_version != WIRE_VERSION {
        let _ = out_tx.send(ServerMsg::Error { code: ErrCode::Version, msg: "version mismatch".into() }).await;
        return;
    }
    let player_id = PlayerId::new();
    let _ = out_tx.send(ServerMsg::Welcome { player_id, session: Uuid::new_v4(), server_t_ms: now_ms() }).await;

    let mut current_room: Option<RoomHandle> = None;
    while let Some(Ok(frame)) = ws_rx.next().await {
        if let Ok(msg) = protocol::decode(&frame) {
            match (&msg, &current_room) {
                (ClientMsg::Input { .. } | ClientMsg::Ack { .. } | ClientMsg::LeaveRoom, Some(room)) => {
                    let _ = room.send(RoomInbound::FromPlayer(player_id, msg)).await;
                }
                _ => {
                    if let Some(new_room) = mm.handle_msg(player_id, msg, &out_tx).await {
                        current_room = Some(new_room);
                    }
                }
            }
        }
    }

    if let Some(room) = current_room {
        let _ = room.send(RoomInbound::Disconnected(player_id)).await;
    }
    writer.abort();
}
```

### Simulation entry

```rust
pub fn simulate_tick(
    state: &mut GameState,
    inputs: &PlayerInputs,
    dt: f32,
    rng: &mut Pcg64,
    events: &mut Vec<GameEvent>,
) {
    ship::update_all(&mut state.ships, inputs, dt, events);
    enemy::update_all(&mut state.enemies, &state.ships, dt, rng, events);
    asteroid::update_all(&mut state.asteroids, dt, events);
    bullet::integrate(&mut state.bullets, dt);
    collision::detect_and_resolve(state, events);
    drops::update(&mut state.drops, &state.ships, dt, events);
    wave::tick(&mut state.wave, &mut state.enemies, dt, rng, events);
    cull::cull_dead(state);
}
```

### Safe-spawn search

```rust
pub fn find_safe_spawn(state: &GameState) -> Vec2 {
    const SAMPLES: usize = 32;
    let mut best = (Vec2::ZERO, 0.0_f32);
    let halton = HaltonSequence::new(2, 3);
    for i in 0..SAMPLES {
        let (hx, hy) = halton.point(i);
        let p = Vec2::new(
            hx * state.field.width as f32,
            hy * state.field.height as f32,
        );
        let d = state.enemies.iter().map(|e| e.pos.distance(p))
            .chain(state.asteroids.iter().map(|a| a.pos.distance(p)))
            .chain(state.bullets.iter().filter(|b| b.hostile).map(|b| b.pos.distance(p)))
            .fold(f32::INFINITY, f32::min);
        if d > best.1 { best = (p, d); }
    }
    best.0
}
```

---

## Acceptance criteria for "v1 multiplayer ships"

The minimum set:

- [ ] Two players can quick-match into a room and play through wave 1 cooperatively.
- [ ] Either player disconnecting does not break the other's game.
- [ ] A third player can drop into a wave-2 game; spawns safely; gameplay continues.
- [ ] Player progression (gold, score, level) is per-player and visible to all.
- [ ] All players see consistent enemy/asteroid positions to within ~50ms.
- [ ] Downed players can be revived by another player.
- [ ] Wave-clear powerup picks are individual; the room advances when all alive players have picked.
- [ ] No crashes under 1h of normal play with 4 players.
- [ ] Solo-play is unchanged from pre-multiplayer (same feel, same performance).
- [ ] Server has metrics endpoint scrapable by Prometheus.
- [ ] CI runs all tests on every push.

---

## What v1 explicitly defers

- Per-region servers and cross-region matchmaking.
- Persistent accounts.
- Friend lists, parties, direct invites.
- Voice chat.
- Ranked or skill-based matchmaking.
- Mobile / cross-platform multiplayer.
- Replays.
- Spectator mode.
- Anti-cheat beyond "server is authoritative."
- Custom rooms with modded waves, modded difficulty, or non-default rules.
- Cosmetic ship customization beyond per-slot palette colors.

These have natural homes in v2+; documenting them here so the implementation doesn't accidentally over-build for v1.
