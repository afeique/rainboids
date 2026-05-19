//! Rainboids canonical simulation crate — `rainboids-sim`.
//!
//! Single source of simulation truth for multiplayer. Compiles both
//! natively (consumed by `rainboids-server`) and to WebAssembly
//! (consumed by `rainboids-client-wasm`, served at `/mp` in the browser).
//!
//! Solo gameplay does NOT route through this crate — solo runs entirely
//! in JS (`js/modules/*`). This crate is the MP product's sim.

// ── Core sim primitives ────────────────────────────────────────────
pub mod codec;
pub mod input;
pub mod ship;
pub mod state;
pub mod wire;

// ── Deterministic combat (all randomness via rng_ctx, all trig via trig) ──
pub mod asteroid;
pub mod bullet;
pub mod collision;
pub mod damage;
pub mod enemy;
pub mod rng_ctx;
pub mod trig;

// ── Wave cadence + drops ──
pub mod drops;
pub mod wave;
pub mod wave_table;

// ── Base weapons ──
pub mod weapon;
pub mod weapon_rail_driver;
pub mod weapon_scatter_gun;
pub mod weapon_storm_needles;

// ── HP / death parity (shield + spare tanks) ──
pub mod shield;

// ── Enemy bullet infrastructure ──
pub mod enemy_bullet;
pub mod enemy_bullet_patterns;

// ── Per-enemy modules (movement + firing) ──
pub mod enemy_drifter;
pub mod enemy_guardian;
pub mod enemy_mine;
pub mod enemy_missile;
pub mod enemy_prowler;
pub mod enemy_sentinel;
pub mod enemy_stalker;
pub mod enemy_tangerine;
pub mod enemy_titan;
pub mod enemy_wasp;
pub mod enemy_weaver;

// ── Wire protocol + shared PRNG ──
pub mod protocol;
pub mod rng;

// ── Public surface ──
pub use codec::{decode_client, decode_server, encode_client, encode_server};
pub use input::PlayerInput;
pub use ship::{tick_phase1, update_ship};
pub use state::{GameState, ShipState};
pub use wire::{ClientMsg, ServerMsg, SnapshotShip, WIRE_VERSION};
