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

// Phase 4 Step 1 — wave cadence + drops. Stubs land first so the
// three parallel new-file authors can each `cargo test` against a
// crate that already knows about their module. The orchestrator
// reconciles into one consistent surface in Wave 2.
pub mod drops;
pub mod wave;
pub mod wave_table;

// Phase 4 step 4 — base weapons (Wave 1 parallel + Wave 2a integration).
pub mod weapon_storm_needles;
pub mod weapon_scatter_gun;
pub mod weapon_rail_driver;
pub mod weapon;
// Phase 4 step 2 (shield/spare-tank) + enemy-bullet infra are authored
// in `shield.rs` + `enemy_bullet.rs`; their `pub mod` declarations land
// when those commits integrate them (0.7.0 + 0.8.0).

pub use codec::{decode_client, decode_server, encode_client, encode_server};
pub use input::PlayerInput;
pub use ship::{tick_phase1, update_ship};
pub use state::{GameState, ShipState};
pub use wire::{ClientMsg, ServerMsg, SnapshotShip, WIRE_VERSION};
