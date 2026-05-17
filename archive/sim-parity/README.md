# Archived: sim-parity scaffolding

This directory holds code from the hand-port parity era of the
multiplayer rollout (5.83 → 5.96.2). Archived 2026-05-17 as part of the
WASM pivot. See `docs/Multiplayer WASM Pivot – 2026-05-17.md` for the
canonical rationale.

## What's here

### `rust-parity/`

Eight `parity_*.rs` files plus `pcg64_trace.rs` from `server/tests/`.
They asserted golden-fixture parity between the JS sim
(`js/sim/*.js`) and the Rust sim (`server/src/sim/*.rs`). The fixtures
captured input → output pairs at the tick level. Useful as historical
behavior reference if any one of them ever needs to be consulted, but
not load-bearing for the new WASM architecture.

### `js-tests/`

Thirteen Jest unit tests from `tests/unit/sim/`. They exercised the
pure-step functions in `js/sim/*.js`. Same status: reference-only.

### `SIM_SPEC.md`

The cross-language discipline doc that governed PR-time changes to the
hand-port. It described the mirror layout, determinism rules, fixed-point
math conventions, and naming conventions that the two implementations
were supposed to keep in lockstep. The mirror is gone in the WASM
architecture, so the spec is too.

## What's NOT here (yet)

`js/sim/*.js` and the relocated `server/sim/src/*.rs` (formerly
`server/src/sim/*.rs`) are still in the live tree as of Phase 0.
They stay there because the existing solo + legacy-MP code paths
still import them; archiving them in Phase 0 would break the build.
They get **overwritten module-by-module during Phase 1+** as each
Rust sim module is authored fresh from current solo behavior. Once the
WASM round-trip is proven and the new sim is functional, `js/sim/` and
the unreachable `js/net/*` MP wiring (multiplayer-modal, prediction,
interpolation, loopback-connection, tick-buffer, event-firehose) archive
together.

The legacy server simulation in `server/sim/src/` is therefore in two
states simultaneously: relocated to a workspace member crate (so the
server binary still compiles), and queued for module-by-module
overwrite. The relocated code is not in this archive; it lives at its
new path. Once a module is overwritten, the old content is gone — no
copy here, no copy anywhere except git history.

## Deletion condition

This entire `archive/sim-parity/` directory gets deleted when **the MP
WASM pivot is proven**. The working definition: a stable 2-player co-op
session is shippable and the user has declared MP no-longer-experimental.
A reminder lives at
`~/.claude/projects/-Users-silvr-projects-rainboids/memory/project_archive_sim_parity_deletion.md`.

Until then, keep this directory as a one-step rollback path. If the
WASM pivot hits an unrecoverable wall, this content + `git revert` of
the Phase 0 commits + un-archiving `js/sim/` would put the project back
on the hand-port track.

## Known Phase 0 regressions

(none yet — populated by the orchestrator if `cargo test --workspace`
surfaces test failures after the workspace restructure that aren't worth
fixing immediately)
