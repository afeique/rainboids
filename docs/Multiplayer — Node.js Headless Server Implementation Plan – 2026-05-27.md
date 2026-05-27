# Multiplayer — Node.js Headless Server Implementation Plan – 2026-05-27

> **Status:** Proposal / planning. No code yet. This is the agreed direction after
> the WebTransport-vs-WebSocket and Rust-vs-Node analysis (see
> `docs/Multiplayer WebTransport Migration — Plan – 2026-05-27.md`).
>
> **Decision locked:**
> - **Authoritative server** running **the same JavaScript** the single-player game
>   runs, headless on **Node.js** (no Rust, no WASM in this product).
> - The shelved Rust/WASM multiplayer stays archived under `multiplayer/` and is
>   **not touched**.
> - **WebSocket first**, behind a **Transport interface seam** so **WebTransport**
>   can be added later as it matures — without rewriting anything above the seam.
>
> Written to be readable without a networking background; each major section opens
> with a plain-language note.

---

## 0. The shape of the whole thing (plain terms)

Today the game runs entirely in your browser: it figures out where everything is
("the simulation") **and** draws it. To make co-op work, we split that job:

- A **server** (a Node.js program) becomes the **referee**. It runs *only the
  simulation* — no drawing — for everyone in a game ("room"), and many times a
  second it mails out a **snapshot**: "here's the true state of the world."
- Each player's **browser** stops being the referee. It **draws** the snapshots,
  **predicts** its own ship so controls feel instant, and **smoothly animates**
  everything else between snapshots.

The trick that makes this affordable: **the server runs the exact same simulation
code the browser already runs** — the same `.js` files. One codebase, two places.
So there's nothing to keep in sync ("no parity"), and adding a feature to
single-player automatically adds it to multiplayer.

The one-time cost we pay for this is **pulling the simulation apart from the
drawing** inside the current code, because right now they're tangled together in
the same files. That refactor (Phase 1) is the biggest chunk of work, and it
*also* makes single-player cleaner and easier to test.

```
            ┌──────────── Node.js SERVER (the referee) ────────────┐
            │  shared JS sim @ 60 Hz  ·  all ships/enemies/etc.     │
            │  ~20–30×/sec → SNAPSHOT (truth) + EVENTS (one-shots)  │
            └───────▲───────────────────────────────────┬──────────┘
                    │ inputs                  snapshots  │  via Transport seam
                    │                          + events  │  (WebSocket now,
            ┌───────┴───────────────────────────────────▼────────── WebTransport later)
            │  BROWSER (per player)                                 │
            │   • draw snapshots (reuse the SP renderer)            │
            │   • predict MY ship (reuse the shared sim)            │
            │   • interpolate everyone/everything else             │
            └───────────────────────────────────────────────────────┘
```

---

## 1. Guiding principles

1. **One sim, imported everywhere.** Extract a pure-JS `js/sim/` module with **no
   browser dependencies** (no canvas, DOM, audio, `window`, no `Math.random`
   sprinkled inline). Single-player imports it, the Node server imports it, the MP
   client imports it for prediction. Same files, all three.
2. **Server is authoritative.** It owns all truth: positions, HP, deaths, drops,
   score, wave timing. Clients render and predict; they never decide outcomes.
3. **Transport is a swappable seam.** Game/netcode code never touches a socket
   directly — it talks to a `Transport` interface. WebSocket is the first
   implementation; WebTransport drops in later behind the same interface.
4. **Design to the loosest delivery contract** (may drop/reorder), so WebSocket
   (reliable) and WebTransport datagrams (unreliable) both work. WebSocket simply
   over-delivers.
5. **Single-player must keep working, identically, at every step.** The Phase 1
   refactor is validated by SP still playing exactly the same. MP is built on top,
   never by breaking SP.
6. **Pool to keep the GC quiet.** The sim runs per-tick on both client and server;
   keep the existing pooling discipline so neither stutters.

---

## 2. Target layout & where things live

> ⚠️ **Directory-hygiene gate:** `server/` as a top-level dir needs your sign-off
> (CLAUDE.md forbids new top-level dirs without approval). The old Rust `server/`
> is archived under `multiplayer/server/`, so the name is free — but confirm you
> want the Node server at `server/` vs. an alternative (`mp-server/`).

```
js/
  sim/                     ← NEW shared headless sim (pure JS, no browser deps)
    world.js               ·  the World: all entity state as plain data
    tick.js                ·  tick(world, inputsByPlayer, rng) → events[]
    rng.js                 ·  injectable seeded PRNG (replaces inline Math.random)
    events.js              ·  semantic event types (DEATH, HIT, DROP, WAVE…)
    entities/…             ·  movement/AI/collision logic, extracted from js/modules
  mp/                      ← MP client (browser) — fresh, NOT the archived js-mp
    mp-main.js             ·  bootstrap for /mp
    net/
      transport.js         ·  client Transport interface
      websocket-transport.js
      codec.js             ·  wire encode/decode (shared shape with server)
      protocol.js          ·  message/version constants
    netcode/
      predictor.js         ·  local-ship prediction + reconciliation
      interpolator.js      ·  smooth non-local entities between snapshots
    mp-render-adapter.js   ·  feed world state into the existing SP renderer
  modules/                 ← existing SP code; game-engine.js refactored to use js/sim
server/                    ← NEW Node.js authoritative server  (⚠ approval)
  package.json             ·  server deps (ws, …); imports ../js/sim/*
  src/
    index.js               ·  entry / CLI / config
    room.js                ·  Room: 60 Hz tick loop, input intake, snapshot publish
    room-manager.js        ·  rooms registry, join/leave, matchmaking
    transport/
      transport.js         ·  server Transport interface (listener + connection)
      websocket.js         ·  ws-based implementation
      (webtransport.js)    ·  LATER
    net/                   ·  shares codec/protocol with js/mp/net (symlink or copy-on-build)
    obs/                   ·  metrics, logging, healthz
  test/
mp.html                    ← /mp entry page (3-canvas stack, like the archived one)
VERSION-MP                 ← MP product version, FRESH start at 0.1.0
CHANGELOG-MP.md            ← MP changelog, fresh
```

Node imports `js/sim/*` directly as ES modules (`"type": "module"`). Keep
`js/sim/` import-clean: relative imports only, no bundler-only specifiers, no
browser globals — so the *same source* loads in Node and the browser.

---

## 3. Wire protocol v1 (the messages)

Plain JS objects, encoded to a compact binary buffer (`DataView`/`ArrayBuffer`).
Start simple; JSON is acceptable for the very first spike, then switch to binary.
The codec is **shared** between `js/mp/net/codec.js` and the server.

**Client → Server**
| Msg | Channel | Fields |
|---|---|---|
| `Hello` | reliable | `wireVersion`, `name` |
| `Input` | datagram/latest-wins | `clientTick`, button bitfield, aim x/y, fire flags |
| `Bye` | reliable | — |

**Server → Client**
| Msg | Channel | Fields |
|---|---|---|
| `Welcome` | reliable | `playerId`, `serverTick`, `roomSeed`, spawn x/y, roster |
| `Snapshot` | datagram/latest-wins | `tick`, `ackedInputTick`, arrays of **persistent** entities (ships, enemies, asteroids, drops, active beams) — each with id, pos, vel, and render-relevant state |
| `Event` | reliable | `tick`, payloads: `DEATH`, `HIT`, `SPAWN`, `DROP`, `WAVE_START`, `DOWNED`, `REVIVE`, … — drives sounds + particles |
| `PeerJoined` / `PeerLeft` | reliable | `playerId` (+ roster) |
| `Error` | reliable | `code`, `message` |

**Bandwidth note — the bullets problem.** At bullet-hell density there can be
hundreds of projectiles; snapshotting them all 20–30×/sec is the dominant cost.
Strategy: **don't snapshot projectiles individually.** Send a `SPAWN` event when a
bullet is fired (position, velocity, kind), let the client simulate the
straight-line travel locally, and let the server stay authoritative only for
**hits** (a `HIT`/`DEATH` event). Persistent, stateful entities (ships, enemies,
asteroids, drops) go in the snapshot; deterministic projectiles ride events +
local sim. This is a netcode decision worth locking in Phase 4.

---

## 4. The phases

Each phase is independently shippable and testable. Versioning/README rules per
CLAUDE.md are noted inline. **This planning doc is not itself a version bump.**

### Phase 0 — Foundations & decisions  *(small)*
- Confirm `server/` location (§2 gate).
- Create fresh `VERSION-MP` (`0.1.0`) + `CHANGELOG-MP.md`.
- Stand up empty `server/` Node project (`package.json`, `"type": "module"`, lint),
  a `/healthz`, and a dev-run script.
- Lock the **co-op design decisions** in §5 (at least enough to start: player count,
  arena/camera model, friendly fire).
- Write the wire-protocol v1 constants (`protocol.js`).
- *Exit:* `npm run mp:server` boots, answers `/healthz`. No game yet.

### Phase 1 — Headless sim extraction  *(largest; SOLO refactor)*
The crux. Pull the simulation out of the tangled entity files into `js/sim/`.
- **Define `World`** = all sim state as plain data (no methods that draw).
- **Define `tick(world, inputsByPlayer, rng) → events[]`** — one pure step. Move
  the `update()`-side logic of ships, enemies, bullets, asteroids, waves, drops,
  collisions, damage into it.
- **Inject RNG**: replace inline `Math.random()` in sim paths with a seeded PRNG
  passed in (`rng.js`). Server seeds per room for reproducibility. (Client never
  needs to reproduce it — it interpolates enemies.)
- **Thread input as a parameter** instead of reading the global input handler.
- **Convert presentation side-effects to events**: where the sim currently plays a
  sound or spawns a particle, have it **emit a semantic event** instead. The
  presentation layer (SP or MP client) consumes events to do juice. *This is the
  same `Event` stream the wire protocol uses — one refactor serves both.*
- **Refactor the SP game** (`game-engine.js`) to: run `tick()`, render from
  `world` state, and consume the event stream for sound/particles. **SP must play
  identically.**
- *Versioning:* SOLO change → bump `VERSION` + `CHANGELOG.md`; update `README.md`
  project-structure (new `js/sim/`).
- *Exit:* single-player runs entirely on `js/sim/` with no behavior change; new
  Jest tests tick the sim headlessly (seed → reproducible result).

> This phase has the best risk/reward to do carefully: it’s pure refactor of code
> you own, it makes SP unit-testable for the first time, and **everything after it
> is comparatively mechanical.**

### Phase 2 — Server skeleton + Transport seam + WebSocket  *(MP)*
- **Server `Transport` interface** (listener + per-connection): `onConnection`,
  and per conn `sendSnapshot`, `sendReliable`, `onInput`, `onReliable`, `onClose`.
- **WebSocket implementation** (`ws` library): binary frames; emulate
  “latest-wins” for inputs/snapshots by tick number.
- **`Room`**: 60 Hz fixed-step loop → drain inputs → `tick()` → sample snapshot →
  broadcast; bundle the tick’s events into an `Event` frame on the reliable channel.
- **`RoomManager`**: create/join/leave, assign `playerId`, seed room RNG.
- **Handshake**: `Hello`→`Welcome`; wire-version check.
- *Versioning:* MP → bump `VERSION-MP` + `CHANGELOG-MP.md`.
- *Exit:* a scripted WS client completes `Hello`→`Welcome` and receives snapshots.

### Phase 3 — MP client: render authoritative snapshots  *(one player)*
- `mp.html` + `mp-main.js`; client `Transport` + `websocket-transport.js`; shared
  `codec.js`.
- Connect, receive `Snapshot`/`Event`, **render via the existing SP renderer**
  (the `mp-render-adapter` maps wire state → what the renderer expects).
- **No prediction yet** — render raw authoritative state (will feel laggy; that’s
  expected and proves the pipe).
- Consume `Event`s for sound/particles (reuses the Phase 1 event work).
- *Exit:* one browser connects and watches its server-driven ship + a few enemies.

### Phase 4 — Netcode: prediction, interpolation, reconciliation  *(feel)*
- **Interpolator**: render non-local entities by blending the last two snapshots
  (optionally extrapolate using snapshot velocity).
- **Predictor**: advance *your own ship* locally each input via the shared sim;
  keep a ring buffer of unconfirmed inputs.
- **Reconciliation**: on each snapshot, snap your ship to authoritative state at
  `ackedInputTick`, replay the unconfirmed inputs on top. Tune the interpolation
  delay / buffer depth.
- **Projectiles**: implement the “SPAWN event + local straight-line sim + server
  HIT events” model from §3.
- *Exit:* movement feels instant; others are smooth; injected packet loss/reorder
  (dev harness) degrades gracefully, no desync.

### Phase 5 — Co-op: multiple players  *(sim + design)*
- Generalize `World` to **N ships**; per-player input slots.
- Two+ browsers see each other and fight together.
- **Enemy targeting** across players (nearest / aggro table — §5 decision).
- *Exit:* 2–4 players in one room, mutually visible, shared enemies behave
  consistently for all.

### Phase 6 — Co-op systems  *(design-heavy)*
- **Loot/gold**: shared vs per-player pickups (§5) — intersects the looter pivot.
- **Downed/revive** (or respawn/spectate) mechanic.
- **Wave scaling** by player count.
- **Run-meta / loadouts**: how armory/upgrades work in co-op (per-player loadouts,
  shared run progression?) — the biggest design intersection with the current
  solo pivot.
- *Exit:* a full co-op run is playable start to finish.

### Phase 7 — Resilience & matchmaking  *(robustness)*
- Reconnect, heartbeat/timeout, clean room teardown, host-independent (server owns
  the room, so no host migration needed).
- Matchmaking UX: quick-match + code-based join.
- Snapshot **delta-encoding** + (if a large arena later) area-of-interest culling.
- Backpressure handling on slow clients.
- *Exit:* drops/rejoins handled gracefully; rooms recycle cleanly.

### Phase 8 — WebTransport (additive, when mature)
- Add `webtransport.js` (server) + `webtransport-transport.js` (client) **behind
  the same interfaces**. Server option: `@fails-components/webtransport` first;
  a Rust `napi-rs`/`wtransport` addon only if that proves inadequate (see the
  WebTransport migration doc).
- Real datagrams for inputs/snapshots; reliable stream for handshake/events.
- **Feature-detect on the client**, fall back to WebSocket. Run both server
  listeners during transition.
- Cert management: Let’s Encrypt (prod) + scripted short-lived `serverCertificateHashes`
  cert (dev).
- *Exit:* a capable browser plays over WebTransport; others transparently use WS.

### Phase 9 — Deployment & test hardening  *(ship)*
- Hosting on a VPS (not GitHub Pages — static can’t host a server). TLS for `wss://`.
- **Process-per-core cluster** + thin matchmaker routing rooms to processes; rooms
  are independent → trivial horizontal scale.
- Test suites (see §7). Observability (connection counts, tick time, snapshot
  rate, drop rate).
- *Exit:* two real devices on different networks play a full co-op run.

---

## 5. Co-op design decisions to lock (with proposed defaults)

These are **game-design** choices, not plumbing — they shape Phases 5–6. Proposed
defaults in **bold**; revisit with you before Phase 5.

1. **Players per room:** **2–4 co-op**.
2. **Arena / camera:** **shared bounded arena** (all players in one viewport — keeps
   rendering and snapshot scope simple) vs. per-player camera into a large world
   (needs interest-management/culling). Default keeps it simple.
3. **Friendly fire:** **off**.
4. **Enemy targeting:** **nearest living player**, with simple aggro stickiness.
5. **Loot/gold:** **instanced per-player pickups** (everyone gets their own) vs.
   shared scramble. Instanced avoids co-op greed friction; revisit vs. looter-pivot
   economy.
6. **Death handling:** **downed + teammate revive**, with full wipe = run over.
7. **Wave scaling:** **HP/count scales with player count** to keep difficulty.
8. **Run-meta:** **per-player loadouts, shared run/wave progression.** (Biggest open
   question — depends on where the looter pivot lands.)

---

## 6. Transport seam — the interface (both sides)

The contract every transport satisfies; nothing above it knows the wire.

**Client**
```
connect(url, opts) → Promise<ready>
sendInput(bytes)        // datagram (WT) | frame (WS); latest-wins
sendReliable(bytes)     // stream (WT)   | frame (WS)
on('snapshot'|'event'|'welcome'|'peer'|'error'|'close', cb)
close(); get isOpen
```
**Server (listener + connection)**
```
listen(opts) → Promise;  on('connection', conn => …)
conn.sendSnapshot(bytes); conn.sendReliable(bytes)
conn.on('input', cb); conn.on('reliable', cb); conn.on('close', cb); conn.close()
```
WebSocket emulates datagram semantics by tagging inputs/snapshots with a tick and
discarding stale ones on receipt. WebTransport uses real datagrams + one reliable
bidi stream. **Same encoded bytes through either.**

---

## 7. Testing strategy

The headless sim makes most of this dramatically easier than before.

- **Sim unit tests (Jest):** `tick()` is pure — seed + inputs ⇒ deterministic
  result. Reproducibility, collision, wave pacing, damage. (Big win from Phase 1.)
- **Codec tests (Jest):** round-trip every message type; wire-version guard.
- **Server logic (Jest):** room join/leave, input intake, snapshot assembly,
  event bundling — all without a real socket (use an in-memory fake Transport).
- **Two-client integration (Playwright):** two browser contexts in one room see
  each other (mirror the archived `13-mp2-ws.spec.js`).
- **AI co-op playtest:** drive N `GameAI` clients (existing `tests/helpers/game-ai.js`)
  against a live server for soak/desync detection.
- **Loss/reorder harness:** a dev Transport wrapper that drops/reorders datagrams to
  validate interpolation/reconciliation (Phase 4).

---

## 8. Versioning & README impact (per CLAUDE.md)

- **Phase 1** is a **solo** change → bump `VERSION` + `CHANGELOG.md`, and update
  `README.md` (new `js/sim/` structure).
- **Phases 2–9** are the **MP product** → bump `VERSION-MP` + `CHANGELOG-MP.md`
  (fresh, starting `0.1.0`), and update `README.md` (new `server/`, `js/mp/`,
  `mp.html`, MP test commands, dev scripts).
- This planning doc and any future design notes → **not** versionable.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Phase 1 refactor destabilizes SP** | Refactor behind a flag/branch; SP-identical is the gate; lean on new sim unit tests + existing QA/e2e suites |
| **Snapshot bandwidth at bullet-hell density** | Events-for-projectiles + local sim (§3); delta-encoding; (later) interest culling |
| **GC hitches on server under many rooms** | Keep pooling discipline in `js/sim/`; avoid per-tick allocation; process-per-core isolates blast radius |
| **Co-op design churn vs. active looter pivot** | Lock §5 defaults; treat run-meta (#8) as the explicit dependency on where the pivot lands |
| **Node↔browser module sharing breaks** | `js/sim/` import-clean rule (relative imports, no browser globals); CI test that Node imports it |
| **60 Hz server cost** | Acceptable for co-op scale (prior analysis: ~80–160 players/box); 30 Hz tick is a fallback lever if needed |
| **WebTransport-in-Node immaturity** | Deferred to Phase 8, additive, behind the seam; never blocks shipping on WS |

---

## 10. Critical path & sequencing summary

```
Phase 0 (setup/decisions)
     │
Phase 1  ── Headless sim extraction ───────────────  ◀ biggest; SOLO; unblocks all
     │
Phase 2  ── Server + Transport seam + WebSocket
     │
Phase 3  ── Client renders snapshots (1 player)
     │
Phase 4  ── Netcode: predict / interpolate / reconcile   ◀ makes it feel good
     │
Phase 5  ── Multiple players (co-op sim)
     │
Phase 6  ── Co-op systems (loot, revive, waves, run-meta)
     │
Phase 7  ── Resilience + matchmaking
     │
Phase 8  ── WebTransport (additive, when mature)   ── can start any time after P4
     │
Phase 9  ── Deploy + test hardening
```

**Bottom line:** the work is front-loaded into one honest refactor (Phase 1) that
also pays off for single-player. After that, multiplayer is built incrementally on
a shared codebase with no parity burden, on a transport that starts as boring,
reliable WebSocket and grows into WebTransport on its own schedule.
