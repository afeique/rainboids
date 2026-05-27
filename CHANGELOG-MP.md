# Changelog — Multiplayer (MP)

All notable changes to the Rainboids **multiplayer** product are documented here.
This is the **Node.js / pure-JavaScript** multiplayer line (the shelved Rust/WASM
attempt is archived under `multiplayer/` and is unrelated to these versions).

The format is based on [Keep a Changelog](https://keepachangelog.com/); MP stays
in `0.x` while experimental.

## [0.15.0] - 2026-05-27

### Changed
- **MP client renders ships + enemies in true single-player style** (Path A,
  Group G — the "look like SP" track). `js/mp/mp-renderer.js` now draws ships via
  the shared `js/modules/render/shapes.js` `drawShipShape` (SP magenta hull) and
  enemies via `drawEnemyShapeByType` (pre-translated to facing, `now`-animated;
  the headless-sim type maps to the SP shape registry), replacing the placeholder
  triangles/arrowheads. Local ship gets a co-op readability ring; downed-dim +
  revive ring preserved. Asteroids + the WebGL particle/bullet/starfield layers
  are subsequent Group-G steps.

### Tests
- `tests/qa/12-mp2-ws.spec.js` — adds a page-error/console-error guard so a
  throw in the SP shapes.js draw path fails the e2e (the rAF loop would otherwise
  swallow it). All four MP e2e cases green.

## [0.14.0] - 2026-05-27

### Changed
- **Binary wire codec** (roadmap Feature 1) — `js/sim/codec.js` now encodes to
  **MessagePack** (`encode` → `Uint8Array`) instead of JSON, hand-rolled and
  dependency-free so it runs identically in Node + browser with no bundler /
  vendoring / import map. `decode` accepts string|Buffer|ArrayBuffer|Uint8Array,
  still tolerates a JSON string, and returns null on malformed input. The
  transports already send/receive binary frames, so no change above the seam.
  Smaller, faster wire on top of delta snapshots.

### Tests
- `tests/unit/codec.test.js` — binary round-trips (mixed int/float, negatives,
  bool/null, unicode, empty containers, large ints), Buffer/ArrayBuffer decode
  paths, and JSON-string tolerance. `server-room.test.js` fake conn decodes the
  binary `sendRaw` payload. MP e2e green over the binary wire.

## [0.13.1] - 2026-05-27

### Fixed
- **Title-screen MULTIPLAYER button overflowed short landscape phones.** On
  mobile-landscape the four secondary buttons now lay out as a 2×2 grid
  (TUTORIAL/HANGAR · SETTINGS/MULTIPLAYER) so all six fit a 640×360 canvas;
  portrait (single column) and desktop (full-width stacked) are unchanged.
  Restores the `title-screen-layout` unit test's "multiplayer fits" assertion.

## [0.13.0] - 2026-05-27

### Added
- **Delta snapshots** (roadmap Feature 2) — the server now sends a full keyframe
  on join / first tick / every 30 ticks and **field-level deltas** in between
  (only changed scalars + changed entity fields, plus removed ids). The client's
  `SnapshotStream` reconstructs the full snapshot from the last keyframe, so
  everything downstream (interp, reconcile, render) is unchanged.
  - `js/sim/snapshot-delta.js` (new) — shared `buildDelta()` / `applyDelta()`.
  - `server/src/room.js` — keyframe/delta broadcast + force-keyframe on join.
  - `js/mp/netcode/snapshot-stream.js` — baseline + delta application; `mp-main`
    skips a delta that arrives before its first keyframe.
  - Cuts wire size by omitting unchanged fields (static hp/maxHp/radius/type/
    weapon, idle entities) every tick — pairs with the upcoming binary codec.

### Tests
- `tests/unit/snapshot-delta.test.js` — round-trip (moves, field changes, adds/
  removes, scalar changes, 20-tick chain) + `SnapshotStream` keyframe/delta
  sequence and pre-keyframe skip. MP e2e remains green (delta is invisible to
  gameplay; reconnect exercises the keyframe path).

## [0.12.0] - 2026-05-27

### Changed
- **Netcode-optimization seams (Phase 0, behavior-preserving)** to enable
  binary-wire / delta-snapshot / render-worker work behind stable contracts:
  - `js/mp/netcode/snapshot-stream.js` (new) — `SnapshotStream.ingest(msg)`
    reconstruction seam (pass-through for now).
  - `js/mp/render-bridge.js` (new) — `RenderBridge.present(state)` render seam
    that owns canvas-context acquisition (needed for a later OffscreenCanvas
    worker); `mp-main.js` no longer calls `getContext` directly.
  - `mp-main.js` rewired to both seams (snapshot → `ingest`, draw → `present`);
    no behavior change (all MP e2e + unit tests still green).
  - `WIRE_VERSION` 1 → 2 (reserves binary wire + delta snapshots; handshake
    rejects mismatched clients so no mixed-format clients connect).

## [0.11.0] - 2026-05-27

### Added
- **Title-screen entry point**: a **MULTIPLAYER** button on the solo title screen
  (below SETTINGS) navigates to `/mp.html`. Mirrors the existing TUTORIAL/HANGAR
  button pattern in `js/modules/hud/overlays.js` (layout + draw) and routes by id
  in `js/main.js` (hit-test + click → `window.location = 'mp.html'`).

### Notes
- This is a bridge change (touches the solo title screen to reach the MP
  product). The solo `VERSION`/`CHANGELOG.md` bump is intentionally **deferred**
  to avoid colliding with the concurrent looter-pivot agent that owns solo
  versioning on this shared branch — fold it into the next solo bump.

## [0.10.0] - 2026-05-27

### Added
- **Client auto-reconnect**: the MP client now reconnects automatically after a
  dropped connection (retries every 2 s, re-sends `Hello`; prediction is rebuilt
  on the next `Welcome`). `mp-main.js` is refactored around a reusable
  `connect()` + `handleMessage()` so the render loop survives transport churn.
- **WebTransport placeholder seam**: `net/webtransport-transport.js` is a stub
  implementing the client `Transport` interface (documents the intended
  datagram/stream mapping, throws on connect). A transport selector tries
  WebTransport only when requested (`?transport=webtransport`) and **falls back
  to WebSocket** when it isn't available — making the deferred Phase 8 a
  ready-to-fill seam without changing anything above it.

### Fixed
- **Graceful shutdown**: `WebSocketTransport.close()` now terminates live
  connections before closing, so shutdown doesn't block on upgraded WS sockets
  (and clients are dropped promptly, triggering their reconnect).

### Tests
- `tests/qa/12-mp2-ws.spec.js` — new case: a client **auto-reconnects after the
  server is killed and restarted** on the same port.

## [0.9.0] - 2026-05-27

### Added
- **Matchmaking (multi-room + code-based join)**: `RoomManager.getOrCreateRoom()`
  keys rooms by a join code — a blank/absent code routes to the shared `public`
  room, any other code creates/joins a private room, so separate groups play
  isolated games. `Welcome` echoes the room id; empty rooms are closed
  (`closeRoom`) on last-leave to reclaim their tick loop.
- **Client room UI**: a room-code field on `mp.html` (pre-filled from `?room=`,
  Enter reloads into that room); the join code is sent in `Hello` and shown in
  the status line.
- **Resilience — server heartbeat**: the WebSocket transport pings clients every
  15 s and terminates any that miss a pong (reaps dead/zombie connections;
  browsers auto-respond). Heartbeat is cleared on shutdown.

### Tests
- `tests/unit/server-room.test.js` — `RoomManager` create/reuse/isolation,
  blank-code → public, and `closeRoom` teardown.
- `tests/qa/12-mp2-ws.spec.js` — new case: clients with different room codes are
  isolated (no shared roster / remote ships).

## [0.8.0] - 2026-05-27

### Added
- **Wave system** (`wave.js` `updateWaves()`) replacing the flat enemy spawner:
  intermission → active → (budget spawned + all enemies dead) → intermission.
  Per-wave enemy budget and enemy HP scale with wave number and player count;
  emits `WAVE_START` / `WAVE_CLEAR`. Enemies spawn paced from arena edges.
- **Run-over / restart**: a full team-wipe (all ships downed) → `GAME_OVER`,
  then after a delay the room resets (ships revived at spawn, entities cleared,
  wave reset) → `RUN_RESTART`.
- **Client**: snapshot carries `wave` + `waveState`; HUD shows them; wave/
  game-over/restart events raise a fading center banner.
- `enemy.js`/`world.js` — `spawnEnemy` accepts an HP override for wave scaling.

### Changed
- Removed the interim flat `tickEnemySpawner`; enemy spawning is now wave-driven.

### Tests
- `tests/unit/sim-wave.test.js` — wave start/clear, budget scaling by player
  count, and team-wipe → game-over → restart.
- `tests/unit/sim-enemy.test.js` — dropped the old flat-spawner cases.
- `tests/qa/12-mp2-ws.spec.js` — asserts the wave system advances to wave ≥ 1.

## [0.7.0] - 2026-05-27

### Added
- **Loot drops** — the reward loop:
  - `drop.js` — health/gold orbs that drift with friction, magnet toward a
    nearby ship, and despawn on TTL.
  - `world.js` — `drops` map + `spawnDrop()`.
  - `collision.js` — enemy deaths drop gold (+ a chance of health); destroyed
    asteroids have a chance to drop gold; living ships collect drops on contact
    (heal / add gold), emitting `DROP_SPAWN` / `DROP_COLLECTED`. Shared loot
    (first ship to touch collects).
  - `ship.js` — `gold` field; `tick.js` steps + reaps drops;
    `server/src/room.js` snapshots drops + ship gold.
- **Client**: drops interpolated (`sampleDrops`) and drawn (green cross = health,
  gold diamond = gold); HUD shows the local player's gold;
  `window.__mp.dropCount()` / `localGold()` exposed.

### Tests
- `tests/unit/sim-drops.test.js` — drop motion/magnet, gold pickup + event,
  capped healing, and gold-drop-on-enemy-kill.

## [0.6.0] - 2026-05-27

### Added
- **Co-op revive** — the signature teamwork mechanic, pairing with the downed
  state from 0.5.0:
  - `coop.js` — `updateRevives()`: a downed ship accrues revive progress while a
    living teammate is within `REVIVE_RADIUS`; reaching `REVIVE_TICKS` (~2 s)
    brings it back at `REVIVE_HP` and emits `SHIP_REVIVED`. Progress decays when
    no reviver is near. Runs each `tick()`.
  - `ship.js` — `reviveProgress` field; `server/src/room.js` snapshots it (`rp`).
- **Client revive UX**: downed ships render dimmed with a green revive-progress
  ring; the local downed ship still renders (and the HUD shows DOWNED). Local
  prediction feeds neutral input while downed so it stays aligned with the
  server-held ship (no reconcile snap-back). The interpolator now carries each
  ship's `downed`/`reviveProgress`.

### Tests
- `tests/unit/sim-coop.test.js` — revive on teammate presence, no-revive when
  out of range, progress decay, and living-ship progress reset.

## [0.5.0] - 2026-05-27

### Added
- **Enemies (first type: chaser)** in the shared sim:
  - `enemy.js` — homing "chaser" AI (`nearestShip` + steer), `createEnemy`,
    per-tick `stepEnemy` with a contact-damage cooldown.
  - `world.js` — `enemies` map, `spawnEnemy()`, and `tickEnemySpawner()` (spawns
    chasers from arena edges on an interval while players are present, capped).
  - `collision.js` — bullet↔enemy (damage/kill + `ENEMY_HIT`/`ENEMY_DEATH`) and
    enemy↔ship contact (cooldown-gated damage; downs the ship + `SHIP_DOWNED`).
  - `ship.js` — `downed` flag; `tick.js` steps enemies + runs the spawner.
  - `server/src/room.js` — snapshots carry an `enemies` array + ship `dn` flag.
- **Client**: enemies interpolated (`sampleEnemies`) and drawn (arrowheads with
  damage HP bars); `ENEMY_DEATH` joins `ASTEROID_DESTROYED` in spawning
  destruction rings; HUD shows local HP / DOWNED + live enemy count; downed
  local ship stops rendering. `window.__mp` exposes `enemyCount()` / `localHp()`.

### Tests
- `tests/unit/sim-enemy.test.js` — chaser targeting/steering, bullet kills,
  contact damage + downing, spawner gating/cap, and a tick() integration.
- `tests/qa/12-mp2-ws.spec.js` — asserts enemies spawn once a player is present.

## [0.4.0] - 2026-05-27

### Added
- **Combat in the shared sim** — the arena is now an actual co-op shooter:
  - `bullet.js` — straight-line player bullets (integrate, age, despawn on
    TTL / out-of-bounds).
  - `collision.js` — authoritative circle-vs-circle `resolveCollisions()` for
    bullets vs asteroids; damages/destroys rocks and emits `ASTEROID_HIT` /
    `ASTEROID_DESTROYED` events.
  - `ship.js` — per-ship fire cooldown.
  - `tick.js` — ships fire forward on the `fire` input (cooldown-gated), bullets
    step, collisions resolve, dead entities are reaped.
  - `world.js` — `bullets` map + `spawnBullet()`.
  - `server/src/room.js` — snapshots now carry a `bullets` array.
- **Client combat rendering + event juice**: bullets drawn from the latest
  snapshot; `ASTEROID_DESTROYED` events spawn expanding destruction rings
  (proves the event → presentation path). `window.__mp.bulletCount()` exposed.

### Tests
- `tests/unit/sim-combat.test.js` — firing/cooldown, bullet motion/despawn,
  bullet↔asteroid collision + destruction, and a full fire-until-destroyed
  integration via `tick()`.
- `tests/qa/12-mp2-ws.spec.js` — client A now also fires; asserts the resulting
  server-authoritative bullets are visible to client B.

## [0.3.0] - 2026-05-27

### Added
- **Asteroids in the shared sim** (`js/sim/asteroid.js`): drifting, rotating
  field hazards that wrap around the arena edges; HP scales with size.
  - `world.js` — `asteroids` map + `nextEntityId` id space for non-player
    entities; `spawnAsteroids(world, count)` (deterministic per seed).
  - `tick.js` — asteroids step each tick alongside ships.
  - `server/src/room.js` — spawns the asteroid field on room creation; snapshots
    now carry an `asteroids` array.
- **Client renders + interpolates asteroids**: the snapshot interpolator is
  generalized (shared `_bracket()` + a new `sampleAsteroids()`), the Canvas2D
  renderer draws rotating rocks, and `window.__mp.asteroidCount()` is exposed.
  This proves the snapshot/interpolation pipeline for non-ship entity types.

### Tests
- `tests/unit/sim-asteroid.test.js` — asteroid step (drift/wrap/rotate) +
  deterministic spawn.
- `tests/unit/mp-netcode.test.js` — asteroid interpolation case added.
- `tests/qa/12-mp2-ws.spec.js` — asserts the asteroid field reaches both clients.

## [0.2.0] - 2026-05-27

### Added
- **Browser MP client** (`js/mp/`) + entry page (`mp.html`):
  - `net/transport.js` + `net/websocket-transport.js` — client-side `Transport`
    seam and its WebSocket implementation (mirrors the server seam; WebTransport
    deferred).
  - `netcode/predictor.js` — client-side prediction + reconciliation for the
    local ship (runs the shared `js/sim` step locally, replays unacked inputs
    against each authoritative snapshot).
  - `netcode/interpolator.js` — buffered snapshot interpolation for remote
    ships (renders ~100 ms in the past, lerps between bracketing snapshots).
  - `mp-input.js` — keyboard + mouse capture mapped to world-space aim.
  - `mp-renderer.js` — minimal Canvas2D visualization (local predicted ship +
    interpolated remote ships in a shared arena).
  - `mp-main.js` — bootstrap + fixed-timestep loop (predict + stream input at
    sim rate, render at rAF), with a `window.__mp` debug/test hook.

### Tests
- `tests/unit/mp-netcode.test.js` — prediction/reconciliation + interpolation
  (headless).
- `tests/qa/12-mp2-ws.spec.js` — two-client WebSocket smoke: both clients
  connect, see each other, and input on one propagates through the authoritative
  server to the other's interpolated view (spawns the MP server itself).

### Notes
- Root `package.json` dev scripts and `README.md` structure updates are
  intentionally **deferred** while sharing the `master` branch with the
  concurrent looter-pivot agent (avoids edit collisions on shared files). The MP
  server runs via `cd server && npm start`; the client is served by the existing
  `npm run dev` at `/mp.html`.

## [0.1.0] - 2026-05-27

### Added
- **Shared headless sim** (`js/sim/`): pure-JS simulation core with no browser
  dependencies, importable by both the Node server and the browser client.
  - `constants.js` — sim constants mirrored from single-player (60 Hz tick,
    ship thrust/friction/max-velocity, arena bounds).
  - `rng.js` — seeded mulberry32 PRNG (per-room reproducibility).
  - `ship.js` — faithful headless port of single-player ship physics
    (thrust → friction → snap → clamp → integrate → damped boundary bounce).
  - `world.js` / `tick.js` / `events.js` — world state container, one-step
    `tick(world, inputs) → events`, and the semantic event stream.
  - `protocol.js` / `codec.js` — shared wire protocol (`WIRE_VERSION 1`) and the
    JSON codec seam (binary swap deferred to a single file).
- **Node.js authoritative server** (`server/`): WebSocket transport behind a
  swappable `Transport` seam (WebTransport deferred to a later phase).
  - `transport/transport.js` + `transport/websocket.js` — the seam and its first
    (`ws`-based) implementation, with a `GET /healthz` liveness endpoint.
  - `room.js` — fixed 60 Hz tick loop: gather inputs → `tick()` → broadcast
    Snapshot (+ Event frame).
  - `room-manager.js` — single shared "default" room (multi-room matchmaking
    deferred to Phase 7).
  - `index.js` — Hello → join → Input loop → leave handshake.

### Notes
- This release is server + sim foundation only; the browser MP client, netcode
  (prediction/interpolation/reconciliation), and co-op systems land in
  subsequent versions. See
  `docs/Multiplayer — Node.js Headless Server Implementation Plan – 2026-05-27.md`.
