# Changelog — Rainboids Multiplayer

All notable changes to **Rainboids Multiplayer** (`/mp`) are documented
here. MP versions independently of single-player; for solo changes see
`CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
MP stays in `0.x` while experimental; promotes to `1.0.0` when stable.

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
