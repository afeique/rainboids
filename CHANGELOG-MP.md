# Changelog — Rainboids Multiplayer

All notable changes to **Rainboids Multiplayer** (`/mp`) are documented
here. MP versions independently of single-player; for solo changes see
`CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
MP stays in `0.x` while experimental; promotes to `1.0.0` when stable.

## [0.2.1] - 2026-05-17

### Fixed — WASM build dependencies

`server/client-wasm/Cargo.toml` now declares `getrandom = { features = ["js"] }`
and `uuid = { features = ["js"] }` as direct deps so Cargo feature
unification enables the browser-crypto randomness backend on
`wasm32-unknown-unknown`. Native (server-bin) builds ignore these.

Without this, `wasm-pack build` failed with:
```
error: the wasm*-unknown-unknown targets are not supported by default,
       you may need to enable the "js" feature.
```

`npm run wasm:build:dev` now succeeds (~28s cold compile, ~135KB
unoptimized output). The browser side of Phase 1 is unblocked.

---

## [0.2.0] - 2026-05-17

Phase 1 — WASM round-trip: a single player-controlled ship visible on `/mp`,
moving under WASD + mouse aim, driven entirely by Rust simulation compiled
to WebAssembly. No server, no networking — local single-client prediction
only. The architectural goal is proven end-to-end.

### Added — `rainboids-sim::mp1` fresh-rewrite submodule

Phase-1 minimal simulation authored fresh from current solo behavior
(`js/sim/ship.js`, `js/modules/core/constants.js`). Mirrors solo's ship
physics step-for-step:

- `mp1::state::ShipState` + `GameState` — single ship + world bounds. Centered
  at `(960, 540)`, facing up (`angle = -π/2`), 100 HP, `radius = 15`.
- `mp1::input::PlayerInput` — WASD bools + world-space aim + speed_mult /
  thrust_power / thrusters_disabled / fire. Constants pulled directly from
  solo: `MAX_V = 3.5`, `VEL_EPSILON = 0.05`, `BOUNCE_DAMP = 0.8`,
  `friction = pow(0.5, 0.5) ≈ 0.7071`.
- `mp1::ship::update_ship` + `tick_phase1` — aim atan2 → WASD move-integration
  → friction → snap-to-zero → max-speed clamp (with 70%-boost rule) → position
  update → boundary bounce with damp. Byte-for-byte equivalent to solo.

The legacy `sim::state` / `input` / `ship` modules stay at the crate root
unchanged; `mp1` is a parallel submodule. This preserves the 44-test
`rainboids-server` integration suite while the WASM client gets a clean
fresh implementation. Legacy modules archive as Phase 1+ rewrites land.

### Added — `rainboids-client-wasm` `World` API

Replaces the Phase-0 smoke stub with the real Phase-1 surface:

- `World::new()` — construct one Phase-1 `GameState`
- `set_input(up, down, left, right, aim_x, aim_y)` — push this frame's input
- `tick(dt)` — advance one tick of ship physics
- `ship_x() / ship_y() / ship_vx() / ship_vy() / ship_angle() / ship_radius()`
- `field_width() / field_height() / tick_count()`

`smoke_test()` + `build_info()` preserved for the boot-time WASM check.

### Added — `/mp` Phase-1 client (`js/mp/`)

Fresh, thin client layer wired around the WASM module:

- `mp-main.js` — boots, dynamic-imports `./wasm/rainboids_client_wasm.js`,
  awaits `init()`, hands the `World` constructor to the engine. On import
  failure, the debug overlay prompts the user to run `npm run wasm:build`.
- `mp-engine.js` — RAF loop. Reads input, projects mouse pixel coords into
  world coords (inverse of the renderer's letterbox transform), calls
  `world.set_input(...)` + `world.tick(dt)` + `render(...)`. dt clamped to
  `[0, 0.1]s`. Debug overlay refreshes every 10 frames with tick / pos /
  aim / FPS.
- `mp-renderer.js` — Canvas2D. Letterboxes the 1920×1080 world into the
  viewport. Draws field outline, aim crosshair (cyan), ship triangle (white,
  pointing along `ship_angle`).
- `mp-input.js` — window keydown/keyup for WASD + arrows, canvas mousemove
  for aim, mousedown/up for `fire`. `preventDefault` on movement keys to
  suppress page scroll. Clears all keys on `window.blur` so focus-loss
  mid-press doesn't leave the ship drifting.

### To actually see the ship

Requires the WASM toolchain (one-time install):

```bash
cargo install wasm-pack
rustup target add wasm32-unknown-unknown
```

Then build + serve:

```bash
npm run wasm:build:dev    # outputs to js/mp/wasm/
npm run dev:solo          # http-server on :8090
# open http://localhost:8090/mp
```

### Build health
- `cargo check --workspace`: clean (all 3 crates)
- `cargo test --workspace`: 44/44 pass (no `rainboids-server` regressions)

---

## [0.1.0] - 2026-05-17

Initial scaffold for the WASM pivot. MP becomes a deliberately separate
product from solo, built on one canonical Rust simulation crate
(`rainboids-sim`) that compiles both natively (for the server binary)
and to WebAssembly (for the browser client at `/mp`).

See `docs/Multiplayer WASM Pivot – 2026-05-17.md` for full rationale.

### Added
- `server/` restructured as a Cargo workspace with three member crates:
  - `rainboids-sim` — canonical simulation (compiles native + WASM)
  - `rainboids-server` — authoritative multiplayer server binary
  - `rainboids-client-wasm` — wasm-bindgen wrapper exposing the sim to JS
- `mp.html` page at project root — minimal canvas + debug overlay,
  loads `js/mp/mp-main.js`.
- `js/mp/` MP entry point and stub modules (`mp-main.js`, `mp-engine.js`,
  `mp-renderer.js`, `mp-input.js`, `mp-particles.js`, `mp-audio.js`,
  `mp-hud.js`). Phase 0 is a smoke harness; real game arrives Phase 1+.
- `VERSION-MP` + `CHANGELOG-MP.md` — MP versions independently.
- Title screen now shows `sp 6.2.0` and `mp 0.1.0` lines (mp dimmer).
- `server/client-wasm/src/lib.rs` exports `smoke_test()` returning 42
  and `build_info()` returning a static version string, used by
  `mp-main.js` to verify the WASM round-trip works.

### Changed
- Title-screen MULTIPLAYER button is now visible to all players (was
  gated behind `?multiplayer=1` query param / `localStorage.rainboidsMultiplayer='1'`).
  Per the WASM-pivot decision: visible, no EXPERIMENTAL badge.
- MULTIPLAYER click handler navigates to `/mp` instead of opening the
  legacy modal that connected via the old EngineDriver online path.
  The modal source remains on disk but unreachable from the UI;
  archives in Phase 1.
- `js/net/ws-client.js` `multiplayerEnabled()` now returns `true`
  unconditionally; the feature flag is vestigial.

### Removed
- Parity-test scaffolding archived to `archive/sim-parity/`:
  - `server/tests/parity_*.rs` (8 files) + `pcg64_trace.rs`
  - `tests/unit/sim/` (13 Jest tests)
  - `schema/SIM_SPEC.md`
- The hand-port simulation strategy described in
  `docs/Multiplayer Planning — 2026-05-06.md` and the Phase 2.5
  collision rollout are formally superseded; the coordination doc has
  been updated to point at the WASM pivot plan as canonical.

### Deferred to Phase 1+
- `js/sim/*.js` (17 files) — stays in place because legacy MP imports
  still reference it; archives when the WASM round-trip is proven.
- `server/sim/src/*.rs` — relocated 9-month-stale port; overwritten
  module-by-module as each subsystem is authored fresh from current
  solo behavior.
- Legacy MP modal + EngineDriver/LoopbackConnection/Predictor/Interpolator
  wiring in `js/net/` and `js/engine/` — now unreachable, archives
  with `js/sim/` in Phase 1.
