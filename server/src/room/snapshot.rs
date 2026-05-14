//! Snapshot construction. Deltas are a v1.x optimization — for now we send
//! full payloads at 20Hz.
//!
//! Each entity collection follows the same shape: clone the sim-internal
//! vector into the wire-format payload. Bullets are the one place the wire
//! format diverges from sim storage — `sim::state::BulletState` carries
//! server-authoritative fields (damage, pierce_count, homing, helix params,
//! age_ticks/max_age_ticks, active) that the client doesn't need for
//! rendering, so we project to `protocol::BulletState` (id/x/y/vx/vy/angle/
//! radius) and skip inactive entries.

use crate::protocol::{BulletState as WireBullet, SnapshotPayload};
use crate::sim::state::GameState;

pub fn build(state: &GameState) -> SnapshotPayload {
    SnapshotPayload {
        ships: state.ships.clone(),
        enemies: state.enemies.clone(),
        asteroids: state.asteroids.clone(),
        drops: state.drops.clone(),
        bullets: state
            .bullets
            .iter()
            .filter(|b| b.active)
            .map(|b| WireBullet {
                // Sim ids are `u32` already (see `sim::state::BulletId`);
                // the wire schema also pins this to `u32` so the cast is a
                // direct copy with no narrowing.
                id: b.id.0,
                x: b.x,
                y: b.y,
                vx: b.vx,
                vy: b.vy,
                angle: b.angle,
                radius: b.radius,
            })
            .collect(),
    }
}
