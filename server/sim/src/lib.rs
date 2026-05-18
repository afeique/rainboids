//! Rainboids canonical simulation crate — `rainboids-sim`.
//!
//! Single source of simulation truth. Compiles both natively (for
//! `rainboids-server`) and to WebAssembly (for `rainboids-client-wasm`,
//! consumed by the browser at `/mp`).
//!
//! ## Two parallel sub-sims (2026-05-17, WASM pivot Phase 1)
//!
//! - **Legacy sim** at the crate root (`state`, `input`, `ship`,
//!   `asteroid`, `bullet`, `collision`, `difficulty`, `drops`, `enemy`,
//!   `wave`) — the 9-month-stale hand-port that the existing
//!   `rainboids-server` room actor still depends on. Stays operational
//!   so the server-bin integration tests (44 tests) keep passing.
//!   Will be archived module-by-module as Phase 1+ rewrites land and
//!   the room actor migrates to `mp1`.
//!
//! - **`mp1`** — the fresh-rewrite Phase-1 simulation, authored from
//!   current solo behavior (`js/sim/ship.js`, `js/modules/core/constants.js`).
//!   Compiles to WASM via `rainboids-client-wasm`; consumed by the
//!   browser `/mp` client. Phase 1 supports a single ship; later phases
//!   add enemies, asteroids, bullets, drops, waves.
//!
//! ## The `protocol` submodule
//!
//! Holds the codegen'd wire types (`schema/protocol.toml` →
//! `protocol/generated.rs`). The legacy sim reads/writes these types
//! directly (`state::GameState.ships: Vec<protocol::ShipState>`). `mp1`
//! is intentionally **decoupled** from the wire format for now — its
//! `state::ShipState` is a fresh minimal struct. They'll converge
//! again when networking lands in Phase 2+ (wire format gets the same
//! fresh treatment as the sim).

// ── Legacy sim modules (stay until each is rewritten in mp1) ──
pub mod asteroid;
pub mod bullet;
pub mod collision;
pub mod difficulty;
pub mod drops;
pub mod enemy;
pub mod fxp;
pub mod input;
pub mod protocol;
pub mod rng;
pub mod ship;
pub mod state;
pub mod util;
pub mod wave;

// ── Phase-1 fresh-rewrite (WASM client + future MP server) ──
pub mod mp1;

use rand_pcg::Pcg64;

use crate::protocol::GameEvent;

// ── Re-exports (legacy entry point, used by server-bin) ──
pub use input::PlayerInput;
pub use state::{GameState, PlayerInputs};

/// Legacy top-level tick — used by the existing `rainboids-server`
/// room actor. Calls into the legacy sim modules. New code should use
/// `mp1::tick_phase1` instead.
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
    collision::detect_and_resolve(state, events);
    drops::update(&mut state.drops, &state.ships, dt, events);
    wave::tick(&mut state.wave, &mut state.enemies, dt, rng, events);
}
