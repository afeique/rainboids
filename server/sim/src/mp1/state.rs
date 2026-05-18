//! Phase-1 minimal GameState — single ship + world bounds. Other entity
//! collections (enemies, asteroids, bullets, drops) are deferred to
//! Phase 3+. Authored fresh from `js/modules/core/constants.js` and
//! `js/sim/ship.js` as of 2026-05-17.

use serde::{Deserialize, Serialize};

/// World bounds — Rainboids' logical field. Pulled from
/// `GAME_CONFIG.FIELD_WIDTH/FIELD_HEIGHT` in solo's constants.js.
pub const FIELD_WIDTH: f32 = 1920.0;
pub const FIELD_HEIGHT: f32 = 1080.0;
pub const SHIP_SIZE: f32 = 30.0;

/// One ship's physics + identity state. Mirrors the fields the solo
/// ship.js step function reads/writes (x, y, vx, vy, angle, hp).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ShipState {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32, // radians; 0 = +x axis (right)
    pub hp: f32,
    pub max_hp: f32,
    pub radius: f32,
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
            angle: -std::f32::consts::FRAC_PI_2,
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
    pub field_w: f32,
    pub field_h: f32,
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
