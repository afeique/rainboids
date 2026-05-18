//! mp1 simulation state — single-ship `GameState` (Phase 1/2) +
//! multi-entity `RoomState` (Phase 3+).
//!
//! All scalars are **f64** to match JavaScript Number precision. The
//! WASM client and the native server both run the same Rust code via
//! the `mp1::*` modules; f64 throughout means no implicit narrowing
//! at the wasm-bindgen boundary.
//!
//! ## Two state shapes (intentional)
//!
//! - **`GameState`** — single-ship, the Phase-1/2 surface the WASM
//!   `World` exposes for local-prediction-only rendering. Stays for
//!   backward compatibility with the Phase-2 client; will be unified
//!   with `RoomState` in Phase 4+ when the WASM client adopts the
//!   full deterministic sim.
//!
//! - **`RoomState`** — multi-entity, the Phase-3 surface the server
//!   actor runs. Holds all ships + enemies + asteroids + bullets +
//!   the seeded RNG context. Source of truth for the room.
//!
//! Both share the same `ShipState` shape — adding fields here
//! propagates to both consumers cleanly.

use serde::{Deserialize, Serialize};

/// World bounds — Rainboids' logical field. Pulled from
/// `GAME_CONFIG.FIELD_WIDTH/FIELD_HEIGHT` in solo's constants.js.
pub const FIELD_WIDTH: f64 = 1920.0;
pub const FIELD_HEIGHT: f64 = 1080.0;
pub const SHIP_SIZE: f64 = 30.0;

/// One ship's physics + identity + life-cycle state.
///
/// Mirrors the fields solo's ship.js step function reads/writes
/// (x, y, vx, vy, angle, hp) plus the Phase-3 lifecycle fields
/// (downed + revive_meter) that the damage module + Diablo revive
/// loop consume.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ShipState {
    /// Per-room player identifier (server-assigned). Stable for the
    /// connection's lifetime. Zero in the single-ship `GameState`
    /// surface where there's only one ship and no MP context.
    pub player_id: u32,

    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub angle: f64, // radians; 0 = +x axis (right)
    pub hp: f64,
    pub max_hp: f64,
    pub radius: f64,
    pub active: bool,

    /// Phase 3 — downed state (HP at 0; not respawned; revivable).
    /// When true, the ship is rendered as a wreck, can't move/fire,
    /// can't take further damage, and another player can revive it.
    pub downed: bool,

    /// Phase 3 — revive meter (0.0..=damage::REVIVE_FILL_FULL).
    /// While `downed` and at least one alive ship is within
    /// `damage::REVIVE_RADIUS`, fills at `REVIVE_FILL_PER_TICK`;
    /// drains at `REVIVE_DRAIN_PER_TICK` otherwise. At full → ship
    /// revives at fractional max_hp; meter resets to 0.
    pub revive_meter: f64,
}

impl Default for ShipState {
    fn default() -> Self {
        // Match solo's player.js initial state: centered, facing up,
        // angle = -PI/2 (Math.PI / -2 in player.js:217).
        Self {
            player_id: 0,
            x: FIELD_WIDTH * 0.5,
            y: FIELD_HEIGHT * 0.5,
            vx: 0.0,
            vy: 0.0,
            angle: -std::f64::consts::FRAC_PI_2,
            hp: 100.0,
            max_hp: 100.0,
            radius: SHIP_SIZE * 0.5,
            active: true,
            downed: false,
            revive_meter: 0.0,
        }
    }
}

/// Phase-1/2 game state: a single player's ship + world bounds.
/// Consumed by the WASM `World` API for local prediction. The
/// server's authoritative state is `RoomState` below (Phase 3+).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub ship: ShipState,
    pub field_w: f64,
    pub field_h: f64,
    pub tick: u32,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            ship: ShipState::default(),
            field_w: FIELD_WIDTH,
            field_h: FIELD_HEIGHT,
            tick: 0,
        }
    }
}

impl GameState {
    pub fn new() -> Self {
        Self::default()
    }
}

// ── Phase 3 — multi-entity RoomState ──

use super::asteroid::AsteroidState;
use super::bullet::BulletState;
use super::enemy::EnemyState;
use super::rng_ctx::RngCtx;

/// Phase-3 upper bounds. Mirrored on server + client so the
/// deterministic sim allocates predictable capacities.
pub const MAX_PLAYERS:   usize = 8;
pub const MAX_ENEMIES:   usize = 4;
pub const MAX_ASTEROIDS: usize = 16;
pub const MAX_BULLETS:   usize = 64;

/// Authoritative multi-entity room state. One instance per room on
/// the server; one instance per client when the WASM build adopts
/// the deterministic sim (Phase 4+). Same Rust code computes
/// identical state on both sides given the same `rng` seed +
/// player inputs.
///
/// **Wire-wise**: only `ships` is transmitted in every `Snapshot`
/// (positions can't be reproduced deterministically because inputs
/// are player-driven, not seed-driven). `enemies` / `asteroids` /
/// `bullets` are reconstructed client-side from `EnemySpawn` /
/// `AsteroidSpawn` / `BulletSpawn` events plus the local
/// deterministic tick. The `StateChecksum` heartbeat catches any
/// drift.
pub struct RoomState {
    pub tick: u32,
    pub field_w: f64,
    pub field_h: f64,

    pub ships: Vec<ShipState>,
    pub enemies: Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub bullets: Vec<BulletState>,

    /// Monotonic id counters — both server + client advance these
    /// identically by consuming events in order.
    pub next_enemy_id: u32,
    pub next_asteroid_id: u32,
    pub next_bullet_id: u32,

    /// Tick at which the server will spawn the next enemy. Phase 3
    /// uses a simple cadence; Phase 4+ introduces real waves.
    pub enemy_spawn_at_tick: u32,

    /// Per-room seeded RNG. Server picks the seed at room boot and
    /// delivers it to clients in `Welcome.rng_seed`. Both sides
    /// then consume from the same stream in the same order.
    pub rng: RngCtx,
}

impl RoomState {
    /// Construct a fresh room from a seed. Server passes its own
    /// seed at boot; client passes the same seed it received in
    /// `Welcome` so both sides advance in lockstep.
    pub fn from_seed(seed: u64) -> Self {
        Self {
            tick: 0,
            field_w: FIELD_WIDTH,
            field_h: FIELD_HEIGHT,
            ships: Vec::with_capacity(MAX_PLAYERS),
            enemies: Vec::with_capacity(MAX_ENEMIES),
            asteroids: Vec::with_capacity(MAX_ASTEROIDS),
            bullets: Vec::with_capacity(MAX_BULLETS),
            next_enemy_id: 1,
            next_asteroid_id: 1,
            next_bullet_id: 1,
            enemy_spawn_at_tick: 60, // first enemy at ~1 s in
            rng: RngCtx::from_seed(seed),
        }
    }
}
