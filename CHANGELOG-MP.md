# Changelog — Multiplayer (MP)

All notable changes to the Rainboids **multiplayer** product are documented here.
This is the **Node.js / pure-JavaScript** multiplayer line (the shelved Rust/WASM
attempt is archived under `multiplayer/` and is unrelated to these versions).

The format is based on [Keep a Changelog](https://keepachangelog.com/); MP stays
in `0.x` while experimental.

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
