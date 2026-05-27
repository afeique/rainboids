# Changelog — Multiplayer (MP)

All notable changes to the Rainboids **multiplayer** product are documented here.
This is the **Node.js / pure-JavaScript** multiplayer line (the shelved Rust/WASM
attempt is archived under `multiplayer/` and is unrelated to these versions).

The format is based on [Keep a Changelog](https://keepachangelog.com/); MP stays
in `0.x` while experimental.

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
