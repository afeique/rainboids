//! GameState: authoritative entity collections.
//!
//! Stub. The real port (weeks 7–9 in the Rust server plan) replaces these
//! Vecs with the SoA pools described under "State, pools, and hot paths".

use std::collections::HashMap;

use crate::protocol::{AsteroidState, DropState, EnemyState, ShipState};
use crate::util::id::PlayerId;

#[derive(Debug, Clone, Default)]
pub struct Field {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Default)]
pub struct WaveState {
    pub current: u32,
    pub started_at_tick: u32,
    pub remaining_to_spawn: u32,
}

#[derive(Debug, Clone, Default)]
pub struct GameState {
    pub field: Field,
    pub ships: Vec<ShipState>,
    pub enemies: Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub drops: Vec<DropState>,
    pub wave: WaveState,
}

pub type PlayerInputs = HashMap<PlayerId, super::input::PlayerInput>;

impl GameState {
    pub fn new() -> Self {
        Self {
            field: Field {
                width: 1920.0,
                height: 1080.0,
            },
            ..Default::default()
        }
    }

    pub fn add_ship(&mut self, player: PlayerId, x: f32, y: f32) {
        self.ships.push(ShipState {
            player,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: 100.0,
            shield: 100.0,
        });
    }

    pub fn remove_ship(&mut self, player: PlayerId) {
        self.ships.retain(|s| s.player != player);
    }
}
