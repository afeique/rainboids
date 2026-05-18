//! Phase-1 minimal GameState — single ship + world bounds. Other entity
//! collections (enemies, asteroids, bullets, drops) are deferred to
//! Phase 3+. Authored fresh from `js/modules/core/constants.js` and
//! `js/sim/ship.js` as of 2026-05-17.
//!
//! All scalars are **f64** to match JavaScript Number precision. The
//! WASM client and the native server both run the same Rust code via
//! `mp1::tick_phase1`; f64 throughout means no implicit narrowing at
//! the wasm-bindgen boundary. Wire-format snapshots also use f64
//! (8 bytes/scalar vs 4 for f32) — costs ~70% more bandwidth but
//! eliminates a class of cross-runtime drift bugs for prediction
//! reconciliation in Phase 4+.

use serde::{Deserialize, Serialize};

/// World bounds — Rainboids' logical field. Pulled from
/// `GAME_CONFIG.FIELD_WIDTH/FIELD_HEIGHT` in solo's constants.js.
pub const FIELD_WIDTH: f64 = 1920.0;
pub const FIELD_HEIGHT: f64 = 1080.0;
pub const SHIP_SIZE: f64 = 30.0;

/// One ship's physics + identity state. Mirrors the fields the solo
/// ship.js step function reads/writes (x, y, vx, vy, angle, hp).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ShipState {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub angle: f64, // radians; 0 = +x axis (right)
    pub hp: f64,
    pub max_hp: f64,
    pub radius: f64,
    pub active: bool,
}

impl Default for ShipState {
    fn default() -> Self {
        // Match solo's player.js initial state: centered, facing up,
        // angle = -PI/2 (Math.PI / -2 in player.js:217).
        Self {
            x: FIELD_WIDTH * 0.5,
            y: FIELD_HEIGHT * 0.5,
            vx: 0.0,
            vy: 0.0,
            angle: -std::f64::consts::FRAC_PI_2,
            hp: 100.0,
            max_hp: 100.0,
            radius: SHIP_SIZE * 0.5,
            active: true,
        }
    }
}

/// Phase-1 game state: just the player's ship + world bounds.
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
