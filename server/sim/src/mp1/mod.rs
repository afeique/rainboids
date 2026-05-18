//! Phase-1 fresh-rewrite simulation submodule (`mp1` = multiplayer-1).
//!
//! Authored 2026-05-17 as part of the WASM pivot — see
//! `docs/Multiplayer WASM Pivot – 2026-05-17.md`. The parent `sim` crate
//! keeps the legacy state/input/ship modules alive for the existing
//! server-bin code path; this submodule is the **canonical Phase 1+
//! sim** that compiles to WASM and drives the `/mp` client.
//!
//! As MP content grows in Phase 3+, new subsystems (asteroid, bullet,
//! enemy, collision, drops, wave) get authored fresh in this submodule
//! from current solo behavior. Once the legacy server-bin's room actor
//! is rewritten around the new sim, the legacy modules at the crate
//! root archive together.

// Phase 1 / Phase 2 modules (ship-only sim + wire format).
pub mod codec;
pub mod input;
pub mod ship;
pub mod state;
pub mod wire;

// Phase 3 modules — fully deterministic sim for the MVP combat
// roster. All randomness sourced from `rng_ctx`; all trig from `trig`
// (polynomial approximations to guarantee cross-runtime parity).
pub mod asteroid;
pub mod bullet;
pub mod collision;
pub mod damage;
pub mod enemy;
pub mod rng_ctx;
pub mod trig;

pub use codec::{decode_client, decode_server, encode_client, encode_server};
pub use input::PlayerInput;
pub use ship::{tick_phase1, update_ship};
pub use state::{GameState, ShipState};
pub use wire::{ClientMsg, ServerMsg, SnapshotShip, WIRE_VERSION};
