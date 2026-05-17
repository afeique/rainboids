# Multiplayer WASM Pivot — 2026-05-17

**Decision doc + implementation plan for forking multiplayer into a
WASM-backed product, separate from single-player.** Supersedes the
hand-port simulation strategy described in
`Multiplayer Planning — 2026-05-06.md` and the coordination doc's
"hybrid LoopbackConnection" approach.

## TL;DR

- **MP becomes a deliberately separate product.** Solo (`/`) stays
  bit-identical to current master. MP lives at `/mp` and uses one
  canonical Rust simulation, compiled both natively (the server) and to
  WebAssembly (the client).
- **The hand-port parity model is retired.** The parity fixtures and
  JS replay tests move to `archive/sim-parity/` in Phase 0. The stale
  `server/src/sim/` and `js/sim/` themselves stay in place during
  Phase 0 (relocated to `server/sim/src/` as part of the workspace
  restructure) because the existing solo+legacy-MP code still imports
  them. Their archive-or-overwrite happens **module by module in
  Phase 1+**: as each Rust sim module is authored fresh, the
  corresponding old content is overwritten; once the new sim is
  functional, `js/sim/` and the now-unreachable `js/net/*` MP wiring
  (multiplayer-modal, loopback-connection, prediction, interpolation)
  archive together. The new MP sim is authored fresh from current solo
  behavior, not ported from the 9-month-old Rust mirror.
- **MP starts small.** First playable: 1 ship type, 1 enemy (HUNTER),
  1 weapon (PULSE_CANNON), 1 asteroid type, no waves, no drops, no
  shop, no leveling. Content is added one piece at a time, validated
  in isolation. Each module is read-and-rewritten from current solo
  code — not transcribed from the archived Rust.
- **MP renderer/audio/HUD is a fresh thin layer.** No shared
  `js/render-shared/` extraction. Solo's renderer stays untouched and
  fully coupled to its entity classes; MP gets its own minimal layer
  in `js/mp/` that consumes snapshot state from WASM linear memory.
  Trying to share would force a refactor that violates "solo stays
  as-is."
- **Convergence is an option, not a requirement.** Solo and MP iterate
  independently. If MP grows enough to mirror solo's full content set,
  convergence becomes possible later. Until then, two products.
- **MP is visible from day one.** Title-screen MULTIPLAYER button, no
  EXPERIMENTAL badge. Quality control comes from the gradual rollout,
  not from gating.

---

## Why pivot

The hand-port parity model that built out `server/src/sim/` (PRs #19–#23
plus Phase 2.5 collision work) has empirically failed. Nine months of
solo iteration (5.93 → 6.2.0) — mobile fruit-ninja redesign, killstreak
ladder, the 6.0.x economy overhaul (leveling retired, gold-only, rarity
items, trinket slot) — landed on master without any matching changes on
the Rust side. The parity tests still pass, but only because nothing
changed in Rust; the JS side ran away.

The root cause is iteration-speed mismatch. Solo development at this
project's pace (1–3 versions/day, frequent micro-tweaks) cannot
sustainably pull a hand-written Rust mirror along with it. Either the
Rust side bottlenecks iteration, or it gets starved — and the second is
exactly what happened.

WASM as the engine removes the second implementation entirely. There is
one simulation: the Rust `sim` crate. The server runs it natively in a
tokio task; the client runs it via wasm-bindgen for prediction. No
parity fixtures because there's nothing to diverge.

The cost: every gameplay change in MP becomes a Rust change. Solo keeps
its JS-only iteration speed; MP commits to a slower-but-honest cadence.

### Why fresh-rewrite, not port-from-archive

The archived `server/src/sim/` is the original 5.89-era hand-port of
the JS sim. It has known gaps that were documented but never fixed
(HUNTER chase-only, 9 enemy types missing, helix/homing bullet
patterns missing, f32↔f64 cooldown drift). It was also built against
the *pre-6.0.x* JS sim — before the leveling overhaul, gold-only
economy, rarity items, mobile fruit-ninja AI redesign, and the
killstreak ladder.

A line-for-line port from the archive would carry forward those gaps,
those compromises, and a pre-overhaul mental model of what the game is.
Fresh authoring means each module is written by reading the *current*
solo source (`js/modules/player/player.js`, `js/modules/enemy/*`,
`js/modules/combat/*`, etc.) and translating directly to Rust. The
archive is useful as a structural template — function signatures, the
shape of `GameState`, the wire format mapping — but the behavioral
logic comes from today's solo, not yesterday's mirror.

This is more work up front, and it's the right call. The whole point
of the pivot is to stop carrying drift; starting from drift is
self-defeating.

---

## Architecture

### Rust workspace (under existing `server/`)

The existing `server/` directory becomes a cargo workspace. **No new
top-level directories required** (per CLAUDE.md hygiene rule).

```
server/
├── Cargo.toml                ← [workspace] only
├── sim/                      ← NEW: shared simulation crate (authored fresh)
│   ├── Cargo.toml            ← no_std-ish core; lean deps (glam, rand_pcg)
│   └── src/
│       ├── lib.rs            ← pub use of submodules (empty stubs in Phase 0)
│       ├── state.rs          ← authored fresh in Phase 1 from solo's modules
│       ├── ship.rs           ← authored fresh from js/modules/player/player.js
│       ├── enemy.rs          ← authored fresh in Phase 3+ from js/modules/enemy/*
│       ├── bullet.rs         ← authored fresh from js/modules/combat/*
│       ├── asteroid.rs       ← authored fresh from js/modules/world/asteroid.js
│       ├── collision.rs      ← authored fresh from js/modules/combat/collision-system.js
│       ├── drops.rs          ← authored fresh from js/modules/world/{drops,stat-pickup}.js
│       ├── wave.rs           ← authored fresh from js/modules/wave/*
│       ├── difficulty.rs     ← authored fresh
│       ├── fxp.rs            ← may be ported from archive (math primitives, no semantic drift risk)
│       ├── input.rs          ← authored fresh from js/modules/platform/input-handler.js
│       └── rng.rs            ← may be ported from archive (deterministic PCG-64, well-understood)
├── server-bin/               ← what server/src/ becomes (minus sim/)
│   ├── Cargo.toml            ← depends on sim, adds tokio + axum + WS
│   └── src/
│       ├── main.rs
│       ├── config.rs
│       ├── error.rs
│       ├── lib.rs
│       ├── server/           ← (was server/src/server/)
│       ├── protocol/         ← (was server/src/protocol/)
│       ├── matchmaking/      ← (was server/src/matchmaking/)
│       ├── room/             ← (was server/src/room/)
│       ├── obs/
│       └── util/
├── client-wasm/              ← NEW: WASM bindings for the sim crate
│   ├── Cargo.toml            ← depends on sim, adds wasm-bindgen
│   └── src/
│       └── lib.rs            ← exposes simulate_tick, state accessors
├── deploy/                   ← (unchanged)
└── tests/                    ← server-bin integration tests stay;
                                parity_*.rs files move to archive
```

### JS workspace

```
js/
├── main.js                   ← solo entry point (UNCHANGED)
├── modules/                  ← solo simulation + render + audio (UNCHANGED)
├── net/                      ← WebSocket client, codec, matchmaking
│                               (kept; trimmed of LoopbackConnection /
│                                Predictor's JS-sim dependency — they
│                                now wrap WASM calls instead)
├── engine/                   ← EngineDriver (kept; rewired to WASM)
└── mp/                       ← NEW: MP entry point + render layer
    ├── mp-main.js            ← entry; mounted on /mp route
    ├── mp-engine.js          ← drives WASM tick, owns WS connection
    ├── mp-renderer.js        ← canvas/WebGL render layer (reads WASM
    │                           state via typed-array views)
    ├── mp-input.js           ← captures input, packs to wire format
    ├── mp-particles.js       ← cosmetic effects from sim events
    ├── mp-audio.js           ← sound triggers from sim events
    ├── mp-hud.js             ← HUD reads WASM state
    └── wasm/                 ← generated output from wasm-pack
        ├── rainboids_sim_bg.wasm
        ├── rainboids_sim.js
        └── rainboids_sim.d.ts
```

The MP render/audio/particles layer is intentionally a **fresh, thin
JS layer** — not a refactor of solo's `js/modules/`. Solo's renderer is
heavy, mature, and tightly coupled to its entity classes. Trying to
share it with MP would force a refactor that violates "solo stays
as-is."

### Routing

Title screen (in `js/main.js`) gets a SOLO / MULTIPLAYER button pair.
SOLO does nothing different — current behavior. MULTIPLAYER navigates
to `/mp` (separate HTML page, `mp.html`, loads `js/mp/mp-main.js`).

Static-server config: the existing `http-server -p 8090` serves both
`index.html` (solo) and `mp.html` (MP) from disk.

### Version display on title screen

Below the existing version text, two lines:

```
sp 6.2.0     ← from VERSION
mp 0.1.0     ← from VERSION-MP
```

Same font, slightly dimmer. Makes the fork explicit.

---

## Versioning + CHANGELOG

- **`VERSION`** (existing) continues to track solo. Bumps per CLAUDE.md
  semver rules; CHANGELOG.md continues to log solo changes only.
- **`VERSION-MP`** (new) tracks MP independently. Starts at `0.1.0` for
  Phase 0 scaffold. Bumps per the same semver rules but on MP commits
  only.
- **`CHANGELOG-MP.md`** (new) logs MP changes per Keep a Changelog.
  Solo's CHANGELOG never mentions MP work; MP's never mentions solo.

CLAUDE.md's "MANDATORY: update VERSION + CHANGELOG after every code
change" rule extends naturally: solo changes → bump VERSION; MP changes
→ bump VERSION-MP. A change touching both (rare; e.g., the title-screen
button) bumps both atomically in a single commit.

---

## Dev workflow

`npm run dev` runs three things concurrently:

1. `http-server -p 8090 -o -c-1` (Vite/static server, unchanged)
2. `cargo run -p server-bin` (Rust server on `0.0.0.0:8443`)
3. `wasm-pack build server/client-wasm --target web --out-dir js/mp/wasm --dev --watch`

Implementation: add `concurrently` (or `npm-run-all`) as a dev
dependency; reshape `dev` script to invoke all three with prefixed
output. Solo developers who never touch MP don't pay for the Rust + WASM
cycles in any meaningful way (cargo + wasm-pack are no-ops once builds
are cached), but the watch processes do hold open file handles. If this
becomes annoying, split into `npm run dev` (solo-only) and
`npm run dev:all` (everything); revisit during Phase 0.

---

## Phased rollout

### Phase 0 — Skeleton + archive (orchestrator-led with safe parallel subagents)

Goal: workspace restructure + JS MP scaffold + dev tooling in place +
old sim archived. Solo unaffected. No WASM round-trip yet, no sim
authoring yet — just plumbing.

**Approach**: the orchestrator (Claude) drives the destructive steps
(file moves, import path adjustments, workspace setup) serially in the
foreground, verifying `cargo check --workspace` after each step.
Subagents are dispatched only for **new-file work in isolated
directories** — never for refactors of existing code. This respects
the parallel-dispatch lesson from the original MP rollout (worktree
isolation has known harness bugs; strict file ownership + only-new-
files dispatches are the safest pattern).

**Wave 1 — Parallel dispatch (all new files, no existing-file edits)**

| Agent | Owns (new files only) | Brief |
|-------|----------------------|-------|
| **C** | `server/client-wasm/**` | Write `server/client-wasm/Cargo.toml` (depends on path = `../sim`, wasm-bindgen 0.2). Write `server/client-wasm/src/lib.rs` with one `#[wasm_bindgen] pub fn smoke_test() -> u32 { 42 }` plus a `pub fn build_info() -> String` returning version. No sim logic yet. |
| **D** | `mp.html`, `js/mp/**` | Write `mp.html` (minimal canvas page, viewport meta, single `<canvas id="mp-canvas">` + script tag for `js/mp/mp-main.js` as ES module). Write `js/mp/mp-main.js` (boots, awaits WASM load, calls `smoke_test`, logs result). Write `js/mp/mp-engine.js`, `mp-renderer.js`, `mp-input.js`, `mp-particles.js`, `mp-audio.js`, `mp-hud.js` as skeletons with module-level header comments documenting intent and empty exported `init()` functions. |
| **H** | `docs/Multiplayer Coordination – 2026-05-09.md` | Prepend a "WASM Pivot (2026-05-17)" section at the top of the doc pointing at this plan as the new canonical reference. Mark the post-MVD phases (LoopbackConnection, parity rollout) as **superseded**. Do not delete the old content — leave it for historical context. |

These three agents touch zero overlapping files and zero existing
production code. Safe to run in one parallel dispatch.

**Wave 2 — Orchestrator foreground (destructive, must be serial)**

The orchestrator drives these in order, verifying after each. The
guiding principle: **don't break the build at any intermediate step**.
The existing solo + legacy-MP code still imports `js/sim/` and
`server/src/sim/`; those stay in place (relocated, not archived) so
the codebase always compiles.

1. Create `archive/sim-parity/` directory + `archive/sim-parity/README.md` documenting the deletion condition + a reference to this plan doc.
2. `git mv server/tests/parity_*.rs archive/sim-parity/rust-parity/` — these 8 tests reference internal sim functions and become moot once the sim is rewritten. They're safe to archive now because they're not used by anything other than `cargo test`.
3. `git mv server/tests/pcg64_trace.rs archive/sim-parity/rust-parity/` — debug trace for cross-language PCG-64 parity. Same logic; not load-bearing for server-bin compile.
4. `git mv tests/unit/sim/ archive/sim-parity/js-tests/` — 13 JS unit tests for `js/sim/`. Stay paired with `js/sim/` for when both archive together in Phase 1.
5. `git mv schema/SIM_SPEC.md archive/sim-parity/SIM_SPEC.md` — discipline doc for the hand-port. No longer applicable.
6. Restructure `server/` into a cargo workspace. Create `server/sim/` and `server/server-bin/` directories.
7. Move `server/src/sim/` → `server/sim/src/` (preserving all files: `state.rs`, `ship.rs`, `enemy.rs`, `bullet.rs`, `asteroid.rs`, `collision.rs`, `drops.rs`, `wave.rs`, `difficulty.rs`, `fxp.rs`, `input.rs`, `rng.rs`, `mod.rs`). The relocated content keeps server-bin compiling; it gets overwritten module-by-module in Phase 1+.
8. Move `server/src/{main.rs, config.rs, error.rs, lib.rs}` and subdirs `server/`, `protocol/`, `matchmaking/`, `room/`, `obs/`, `util/` → `server/server-bin/src/` (preserving structure).
9. Move surviving tests in `server/tests/` (i.e., `collision_drain.rs`, `grace_reconnect.rs`, `handshake.rs`, `mvd_ship_sync.rs`, `room_lifecycle.rs`, `snapshot_bullets.rs`, `state_bullets.rs`, `wire_golden.rs`, `common/`) → `server/server-bin/tests/`.
10. `server/Cargo.lock`, `server/.env.example`, `server/deploy/` stay at `server/` root (workspace-level).
11. Write new `server/Cargo.toml` as `[workspace]` with members = `["sim", "server-bin", "client-wasm"]`, resolver = "2".
12. Write `server/sim/Cargo.toml` — name = `rainboids-sim`, edition 2021, deps = exactly what the moved `sim/*.rs` files need (serde, glam, rand, rand_pcg).
13. Write `server/sim/src/lib.rs` — declares the modules (`pub mod state;`, `pub mod ship;`, etc.) so `rainboids_sim::ship::*` etc. resolves. The functions inside are the relocated old code, intact.
14. Write `server/server-bin/Cargo.toml` — name = `rainboids-server`, copy dep list from the original `server/Cargo.toml` plus `rainboids-sim = { path = "../sim" }`.
15. Search-and-replace across `server/server-bin/src/**/*.rs`: `use crate::sim` → `use rainboids_sim`, `crate::sim::` → `rainboids_sim::`. Verify each match by hand for context.
16. Update `server/server-bin/src/lib.rs` to drop the `pub mod sim;` line (sim is no longer a child module; it's an external crate now).
17. Write `server/client-wasm/Cargo.toml` — name = `rainboids-client-wasm`, crate-type = `cdylib`, deps = `rainboids-sim = { path = "../sim" }` + `wasm-bindgen = "0.2"`.
18. Write `server/client-wasm/src/lib.rs` with one `#[wasm_bindgen] pub fn smoke_test() -> u32 { 42 }` plus a `pub fn build_info() -> String` returning a static version. No sim integration yet.
19. **Verify**: `cd server && cargo check --workspace` passes. If errors surface, fix them before continuing. The most likely categories: missed `crate::sim` references, missing dep declarations.
20. `cd server && cargo test --workspace` — `server-bin` integration tests should pass unchanged. If any fail, document under "Known Phase 0 regressions" in `archive/sim-parity/README.md` and decide whether to fix now or after Phase 0 lands.

**Wave 3 — Orchestrator foreground (small, low-risk edits)**

The existing solo title screen ALREADY has a MULTIPLAYER button — it's
just gated behind `multiplayerEnabled()` in `js/net/ws-client.js`
(returns true only if `?multiplayer=1` query or `localStorage.rainboidsMultiplayer='1'`).
The current click handler opens a modal that connects to the existing
Rust server via the legacy EngineDriver/JS-sim path. Phase 0's job
is to **rewire** the button, not add a new one:

21. Edit `js/net/ws-client.js`: change `multiplayerEnabled()` to return `true` unconditionally. The button shows for everyone.
22. Edit `js/main.js`: change the multiplayer click handler from `openMultiplayer()` (which opens the modal) to `window.location.href = '/mp'`. Remove the `import { openMultiplayerModal } from './net/multiplayer-modal.js'` line (no longer used by `main.js`). The modal source stays on disk but becomes unreachable; archived in Phase 1 with the rest of the legacy MP code.
23. Locate the version display on the title screen (likely in `js/modules/hud/overlays.js` or a sibling). Change it to show two lines: `sp 6.2.0` (from `VERSION` via `version.js`) and `mp 0.1.0` (from a new constant). Match the existing font/positioning style. This is the one allowed touch in `js/modules/` for Phase 0 — a label-only edit, no logic change.
24. Write `VERSION-MP` = `0.1.0`.
25. Write `CHANGELOG-MP.md` with a `## [0.1.0] - 2026-05-17` entry. Sections: `### Added` (workspace restructure, MP entry scaffold, `/mp` route, WASM smoke harness) and `### Removed` (parity test scaffolding moved to archive).
26. Update `package.json` `dev` script to run `http-server` + `cargo run -p rainboids-server --manifest-path server/Cargo.toml` + `wasm-pack build server/client-wasm --target web --out-dir ../../js/mp/wasm --dev --watch` concurrently. Add `concurrently` to devDependencies. Add a separate `wasm:build` for one-shot CI builds. Document `cargo install wasm-pack` as a prereq in README.
27. `npm install` to pull in `concurrently`.
28. Update `CLAUDE.md` Versioning section to codify the VERSION/VERSION-MP split (DONE — already updated in this session).
29. Update `docs/Multiplayer Coordination – 2026-05-09.md` with a prepended "WASM Pivot (2026-05-17)" pointer to this plan.

**Phase 0 acceptance**:
- `cd server && cargo check --workspace` succeeds with zero warnings beyond pre-existing ones
- `cd server && cargo test --workspace` passes (or has documented regressions)
- `npm run dev` starts static-server + cargo + wasm-pack concurrently with prefixed output
- `npm run test:unit && npm run test:qa` still passes (solo regression check)
- Title screen at `/` shows SOLO + MULTIPLAYER buttons and `sp 6.2.0` / `mp 0.1.0` version lines
- Clicking MULTIPLAYER navigates to `/mp` which loads and logs the WASM smoke-test result
- `archive/sim-parity/` contains all five expected sub-paths with the README explaining the deletion condition
- `git status` shows a clean tree (everything committed by the user; orchestrator does not auto-commit per `memory/feedback_no_auto_commit.md`)

### Phase 1 — WASM round-trip

Goal: prove the client can call into Rust sim via WASM.

- Wire `mp-engine.js` to load `js/mp/wasm/rainboids_sim.js`, call
  `smoke_test()`, log the result. (Replace stub with `simulate_tick`
  call on a minimal `GameState`.)
- Render a single placeholder ship at the position returned by the WASM
  sim. Press arrow keys to drive `PackedInput` into the sim; ship moves
  on screen.
- No server, no networking yet — single-client local prediction only.

Phase 1 acceptance: visible ship on `/mp` moves under keyboard input,
driven by Rust sim compiled to WASM.

### Phase 2 — MVD2 (two clients see each other via the server)

Goal: re-achieve the original MVD (PR #67) but on the new architecture.

- `mp-engine.js` opens a WebSocket to `cargo run -p server-bin` on
  `:8443`.
- Hello/Welcome handshake (existing wire protocol still applies —
  `schema/protocol.toml` is unchanged).
- Server's room actor accepts the connection, spawns a `GameState`
  using the shared `sim` crate, runs the 60Hz tick.
- Client runs the WASM sim for local prediction; server broadcasts
  snapshots at 20Hz; remote ships interpolated.
- Two browser tabs at `/mp` see each other's ships move.

Phase 2 acceptance: two tabs, both pilot their own ships, see each
other moving smoothly.

### Phase 3 — MVP roster (1 enemy + 1 weapon + 1 asteroid)

Goal: combat works.

- Server spawns HUNTER enemies on a simple timer (no waves yet —
  continuous trickle).
- Client renders enemies (consumes snapshot positions).
- Player ships fire PULSE_CANNON bullets; server simulates trajectories;
  collision events emit; enemies die.
- Asteroids drift across the field; bullets damage them; large asteroids
  split into smaller ones.
- No drops, no shop, no leveling, no HP system beyond "die in one hit."

Phase 3 acceptance: two players in a tab can shoot a hunter together
and see it die.

### Phase 4 — Content addition (one PR per item)

Order (lightest-load-bearing first; each addition validates a fresh
piece of pipeline):

1. **Wave system** (already in `sim/wave.rs`) — adds structure
2. **HP / death model** parity with solo (basic damage, not yet rarity items)
3. **Drops** — gold + health orbs (basic; no magnet/tractor yet)
4. **4 remaining base weapons** — Storm Needles, Scatter Gun, Rail Driver, Lance Beam (one PR each)
5. **Remaining 9 enemy types** — one at a time (Guardian, Wasp, Stalker, Drifter, Prowler, Weaver, Sentinel, Tangerine, Titan)
6. **5 power weapons** — Charge Shot, Mine Layer, Nova Blast, Lightning Arc, Missile Salvo
7. **6 defense skills** — Bulwark, Repair Nanites, Phase Dash, Deflector Orbs, EMP Pulse, Tractor Shield
8. **Damage variants** — crit, piercing, explosive, homing modifiers
9. **6.0.x economy** — gold-only, rarity items, trinket slot, 10 health-powerup variants. This is the biggest delta from the 5.89-era seed; intentionally last.
10. **Solo-UX features** (per-feature judgment) — killstreak ladder, mobile fruit-ninja auto-pilot, etc. Some may not fit co-op and get skipped.

Each step is independently shippable, reversible, and bumps VERSION-MP
patch or minor per semver. At step 10, MP has feature parity with solo
6.2.0; convergence becomes a real conversation.

### Phase 5 — Polish

- Drop-in / drop-out at safe sync points
- Matchmaking UX (quick-match, browse, code-based join)
- Reconnect with grace window
- Observability (Prometheus metrics, structured logs)
- Deploy story (VPS + nginx + systemd, per original plan)

---

## What changes on master right now (Phase 0 only)

A. **Rust workspace restructure** inside `server/`:
   - `server/Cargo.toml` becomes a `[workspace]` declaration
   - `server/sim/`, `server/server-bin/`, `server/client-wasm/` created
   - existing `server/src/*` files moved into their new homes

B. **JS additions** under existing `js/`:
   - `js/mp/` directory created (skeleton; non-functional pending Phase 1)
   - `mp.html` at project root
   - `js/main.js` modified ONLY to add the MULTIPLAYER title-screen button (~10 lines)

C. **Archive moves**:
   - `js/sim/` → `archive/sim-parity/js-sim/`
   - `server/tests/parity_*.rs` → `archive/sim-parity/rust-parity/`
   - `tests/unit/sim/` → `archive/sim-parity/js-tests/`
   - `schema/SIM_SPEC.md` → `archive/sim-parity/SIM_SPEC.md`
   - `archive/sim-parity/README.md` written with deletion condition

D. **Versioning files added**:
   - `VERSION-MP` = `0.1.0`
   - `CHANGELOG-MP.md` with `[0.1.0]` Pivot entry

E. **Dev tooling**:
   - `package.json` `dev` script runs static-server + cargo + wasm-pack
   - `concurrently` added as devDep

F. **Coordination doc updated** to point at this doc as canonical.

Solo gameplay code (`js/modules/**`) is **not touched** in Phase 0.

---

## What's intentionally being thrown away

- The hand-port parity discipline (`schema/SIM_SPEC.md`)
- `js/sim/*.js` — eight files, ~1500 lines of pure JS simulation
- `server/tests/parity_*.rs` — eleven golden-fixture tests
- `tests/unit/sim/*.test.js` — replay-parity tests
- The `tools/parity-runner.mjs` cross-language harness
- The LoopbackConnection's role as a unification mechanism (it stays in
  `js/net/` for now but loses its purpose — Predictor and EngineDriver
  in MP mode go straight to WASM)

These are not deleted in Phase 0; they are **archived to
`archive/sim-parity/`** so we can revive them if WASM hits a wall.
A reminder lives in `memory/project_archive_sim_parity_deletion.md` to
delete them after MP is proven.

The wire-protocol codegen (`schema/protocol.toml` + `tools/codegen-protocol.mjs`)
**stays** — wire format is still cross-language (Rust↔WASM↔JS-glue)
and codegen is the right mechanism for that boundary.

---

## What stays unchanged

- Every file under `js/modules/**` (solo simulation, rendering, audio,
  particles, HUD, mobile mode, shop, levels, drops, weapons, enemies)
- `js/main.js` except for the title-screen button addition
- Solo's `VERSION` and `CHANGELOG.md`
- Solo's test suites (`tests/unit/` non-sim ones, `tests/qa/`,
  `tests/e2e/`, `tests/performance/`)
- All assets (`music/`, fonts, images)

If a Phase 0 dispatch touches anything in the "unchanged" list, that's
a bug in the dispatch — revert and re-plan.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| WASM build hits a wall (toolchain, browser quirk, perf cliff) | Phase 0 archives instead of deletes; Phase 1 is a tight smoke test. If WASM proves unworkable, revert by un-archiving `js/sim/` and resuming the hand-port path. Worst case: 1–2 weeks lost to scaffold work. |
| WASM↔JS boundary cost makes rendering slow | Use linear-memory views (`Float32Array` over `wasm.memory.buffer`) rather than per-call copies. Bench at Phase 1; if 60fps with 100 entities isn't achievable, revisit boundary design. |
| Solo CHANGELOG / VERSION rules get muddled with MP changes | The separate `VERSION-MP` + `CHANGELOG-MP.md` enforces the split. Discipline: every commit's diff is either entirely solo, entirely MP, or the rare-title-screen-and-similar bridge commit that bumps both. |
| The 9-month-stale `server/src/sim/` is rotten beyond reuse | The 5.89-era code was an architectural exercise more than production logic. If reuse is too painful in Phase 0, agent A's brief is permitted to rewrite a given module rather than move + patch. Each module is a few hundred lines. |
| Two products doubles support load | This is the explicit cost of the strategy. The user has accepted it. Solo is in maintenance / iteration mode; MP is in build mode. Bug reports separate cleanly along URL boundaries. |

---

## Reversibility

The pivot is reversible in three stages:

1. **Within Phase 0** — `git revert` the workspace restructure + JS scaffold commits; `mv` the archive back; restore the original `server/src/` layout.
2. **After Phase 1 fails** — same as above, plus delete `js/mp/`, `mp.html`, and the WASM build outputs.
3. **After Phase 4 invests heavily in WASM-side content** — un-archive the JS sim and resume the hand-port. The MP content (in Rust) becomes the new reference; JS gets re-ported back. Painful but possible.

Stage 1 and 2 are cheap. Stage 3 is the point of no return; commitment
should be made at the boundary between Phase 3 and Phase 4. Phases 0–3
should be treated as a "WASM viability spike" with a real off-ramp.

---

## Asset and shared-layer decisions (made 2026-05-17)

**Renderer**: NOT shared. MP gets a fresh, thin renderer in
`js/mp/mp-renderer.js`. Solo's renderer is tightly coupled to its
entity classes (each entity owns its `draw()` method) and reads from
live mutable game state; MP renders from snapshot deltas streamed via
WASM linear memory, which is a fundamentally different data flow.
Sharing would require either (a) refactoring solo entities to be data
objects with separate render functions — violates "solo stays as-is",
or (b) materializing fake entity objects per frame from WASM state —
slower than a purpose-built renderer and just as much code. Fresh
renderer wins on simplicity AND performance.

**Audio**: NOT shared in Phase 0. MP gets `js/mp/mp-audio.js` which is
a thin trigger-from-events layer. The SFX library files
(`audio/sfx/*.mp3` etc.) ARE shared by URL — both pages fetch from the
same paths. If the audio module in `js/modules/audio/` turns out to be
genuinely loosely-coupled and reusable, MP may import it directly
later. Defer that decision to Phase 4 once the event firehose shape is
real.

**Particles**: NOT shared. Solo's particle systems are mature, fast,
and tied to the entity pools. MP gets a fresh `js/mp/mp-particles.js`
that consumes server-emitted cosmetic events (`HitFlash`, `DamageNumber`,
`EnemyDestroy { fx_color }`, etc.) per the original wire-format plan.

**HUD**: NOT shared. Solo's HUD is interleaved with the modular UI
system (`js/modules/ui/`, `js/modules/hud/`); MP gets a fresh
`js/mp/mp-hud.js` displaying co-op-relevant info (own + partner ships,
shared wave indicator, partner status). Solo's HUD is not designed for
multi-player display.

**Static assets (images, fonts, music files)**: shared by URL. Both
`index.html` and `mp.html` fetch from `/audio/`, `/images/`, etc.

**The wire-protocol codegen** (`schema/protocol.toml` +
`tools/codegen-protocol.mjs`): stays. Wire format is still
cross-language (Rust↔WASM↔JS-glue) and codegen is the right mechanism
for the boundary types. Generates `server/server-bin/src/protocol/generated.rs`
and a (new) `js/mp/wasm-protocol.js`. The old `js/sim/protocol-generated.js`
moves with `js/sim/` to the archive.

## Authoring discipline (for sim modules in Phase 1+)

Every Rust simulation module added in Phase 1 onwards follows the same
discipline:

1. **Read solo's current source.** Open the corresponding solo file(s)
   (e.g., `js/modules/player/player.js` for ship physics). Read it
   end-to-end. Make notes on the actual behavior — frame rate
   assumptions, constants, edge cases, magic numbers.
2. **Check the archive for structural reference.** Look at
   `archive/sim-parity/rust-sim-stale/<module>.rs` to see what the
   previous attempt's function signatures and module shape looked
   like. Don't blindly copy; just borrow the shape.
3. **Write the Rust module from solo source.** Implement the functions
   as fresh code. Use constants and magic numbers from solo, not the
   archive (they may have drifted).
4. **Document the source.** Top of each Rust file: a header comment
   listing the solo source files studied, dated. Future maintainers
   know where the canonical behavior lives.
5. **Native test, then WASM smoke.** `cargo test -p rainboids-sim`
   should cover the unit-level behavior. The first WASM smoke test
   (Phase 1 acceptance) verifies the same code paths execute in the
   browser without panicking.

## Test strategy

- **Rust unit tests**: `cd server && cargo test -p rainboids-sim` runs
  pure-sim tests on native target. Fast. These are the discipline
  layer for sim correctness.
- **Server integration tests**: `cd server && cargo test -p rainboids-server`
  runs the WS handshake / room lifecycle tests. Inherited from the old
  `server/tests/` (minus parity_*.rs which archived).
- **WASM smoke tests**: a minimal Playwright test in `tests/mp-smoke/`
  navigates to `/mp`, waits for the WASM module to load, asserts the
  smoke result. Catches "WASM build broke" regressions in CI.
- **MP E2E tests**: deferred to Phase 5. Tab-based multiplayer in
  Playwright is doable but complex; not worth wiring before MP is
  actually playable.
- **Solo tests**: unchanged. `npm run test:unit && npm run test:qa &&
  npm run test:e2e` continue to validate solo. Phase 0 must not
  regress any of these.

## WASM binary size budget

First build, unoptimized, will likely be >500KB. Acceptable for
desktop MP. Apply `wasm-opt -Oz` in release builds (`wasm-pack
build --release` does this automatically). Re-evaluate if size ever
exceeds 2MB or if mobile-MP becomes a real goal.

## Open questions

- **When MP graduates from experimental** (and `archive/sim-parity/`
  gets deleted): the bar is fuzzy — "stable 2-player co-op session"
  is the working definition but the user gets to call it. A reminder
  lives in `memory/project_archive_sim_parity_deletion.md`.
- **MP deployment story.** Same VPS + nginx as the original plan
  documented? Or defer entirely until MVP is local-only proven? No
  decision needed until Phase 5.
- **Cross-runtime sim testing.** When WASM and native disagree
  (rare but possible — f32 NaN propagation, browser-specific WASM
  quirks), how do we catch it? Defer; revisit if a bug shows up.

---

## Acceptance for "Phase 0 complete"

- [ ] `cd server && cargo check --workspace` succeeds with no new warnings
- [ ] `cd server && cargo test --workspace` passes (or has documented regressions in a "Known Phase 0 regressions" appendix)
- [ ] `npm run dev` starts static-server + cargo + wasm-pack concurrently with prefixed output
- [ ] Title screen at `/` shows SOLO + MULTIPLAYER buttons and `sp 6.2.0` / `mp 0.1.0` version lines
- [ ] Clicking MULTIPLAYER navigates to `/mp` which loads `mp-main.js` and logs the WASM `smoke_test()` result (= 42)
- [ ] `archive/sim-parity/` contains all five sub-paths (`js-sim/`, `rust-sim-stale/`, `rust-parity/`, `js-tests/`, `SIM_SPEC.md`) plus a `README.md` documenting the deletion condition and a pointer to this plan
- [ ] `VERSION-MP` = `0.1.0`; `CHANGELOG-MP.md` has a `[0.1.0] - 2026-05-17` entry
- [ ] `docs/Multiplayer Coordination – 2026-05-09.md` has a "WASM Pivot (2026-05-17)" pointer at the top
- [ ] `CLAUDE.md` Versioning section codifies the VERSION/VERSION-MP split
- [ ] Solo regression: `npm run test:unit && npm run test:qa` passes unchanged from pre-Phase-0
- [ ] No file under `js/modules/**` modified (verify via `git diff --stat js/modules/`)
