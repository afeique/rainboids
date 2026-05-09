//! Snapshot construction. Deltas are a v1.x optimization — for now we send
//! full payloads at 20Hz.

use crate::protocol::SnapshotPayload;
use crate::sim::state::GameState;

pub fn build(state: &GameState) -> SnapshotPayload {
    SnapshotPayload {
        ships: state.ships.clone(),
        enemies: state.enemies.clone(),
        asteroids: state.asteroids.clone(),
        drops: state.drops.clone(),
    }
}
