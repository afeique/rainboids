//! Rainboids canonical simulation crate — `rainboids-sim`.
//!
//! This crate is the single source of simulation truth, compiled both
//! natively (for `rainboids-server`) and to WebAssembly (for
//! `rainboids-client-wasm`, consumed by the browser at `/mp`).
//!
//! **Phase 0 note (2026-05-17):** the current module bodies are the
//! relocated 9-month-stale port from the original hand-port era. They
//! still compile and run, but get **overwritten module-by-module during
//! Phase 1+** as each subsystem is authored fresh from current solo
//! behavior. See `docs/Multiplayer WASM Pivot – 2026-05-17.md`.
//!
//! The `protocol` submodule contains the codegen'd wire types
//! (`schema/protocol.toml` → `protocol/generated.rs`). Pragmatic Phase 0
//! layering: the wire types live inside the sim crate because the sim
//! state types (`ShipState`, `EnemyState`, etc.) currently come from the
//! codegen output. A future cleanup can split protocol into its own
//! crate.

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

use rand_pcg::Pcg64;

use crate::protocol::GameEvent;

pub use input::PlayerInput;
pub use state::{GameState, PlayerInputs};

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
