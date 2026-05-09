//! Authoritative simulation. Top-level entry is [`simulate_tick`]; submodules
//! own one subsystem each, mirroring the JS layout under `js/sim/`.
//!
//! The scaffold's `simulate_tick` runs ship physics with f32 inputs and
//! leaves enemy/asteroid/wave/etc. as stubs. Porting these is weeks 7–9
//! of the plan in `docs/Multiplayer Rust Server – 2026-05-07.md`.

pub mod asteroid;
pub mod bullet;
pub mod collision;
pub mod difficulty;
pub mod drops;
pub mod enemy;
pub mod fxp;
pub mod input;
pub mod rng;
pub mod ship;
pub mod state;
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
