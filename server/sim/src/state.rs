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

/// Sim-internal bullet id newtype.
///
/// Distinct from the wire-format `BulletId` in `util::id` (which wraps `u64`
/// for serde-friendly transport). This newtype wraps `u32` because the
/// collision pure-step storage path already narrows to `u32` (see
/// `CollisionBullet.id: u32` in `sim/collision.rs`) — keeping the sim-side
/// container in the same width avoids an unnecessary conversion in the
/// `build_bullets` view-builder hot path.
///
/// Bullets are deterministic from input + tick + asteroid state, so they
/// don't need to traverse the wire — clients re-derive them. That's why
/// this type lives in `sim/state.rs` rather than `protocol::generated`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct BulletId(pub u32);

/// Sim-internal bullet state — the authoritative storage feeding both
/// `update_bullets` (physics) and `build_bullets` (collision view-builder).
///
/// Distinct from the protocol's wire-format types because bullets aren't on
/// the wire (see `BulletId` docstring). The fields here are the minimal set
/// the room actor needs:
///
///   - Position / velocity (`x`, `y`, `vx`, `vy`, `angle`) for physics +
///     collision-view emission.
///   - `radius` / `damage` / `pierce_count` for the bullet-vs-target
///     collision pass (these flow into `CollisionBullet`).
///   - `homing`, `helix_amplitude`, `helix_freq` for the Phase 2.1
///     movement-pattern logic. Today `update_bullets` does a simplified
///     linear-drift + helix step — when `update_player_bullet` (the full
///     parity port) takes over, these flags will reroute into that path.
///   - `age_ticks` / `max_age_ticks` for lifetime culling. Separate from
///     `PlayerBullet.life/max_life` because this is the simpler sim-step
///     model (frame counter incremented per tick, hard cap drops to
///     `!active`); the parity port uses fade-factor math instead.
///   - `active` for the standard despawn latch.
#[derive(Debug, Clone, Copy)]
pub struct BulletState {
    pub id: BulletId,

    // ── Position / velocity (px / px-per-tick) ──────────────────────────
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    /// Render orientation in radians. Independent from `atan2(vy, vx)` so
    /// helix bullets can carry a fixed barrel direction while their
    /// velocity sin-waves around the perpendicular axis.
    pub angle: f32,

    // ── Combat ──────────────────────────────────────────────────────────
    pub radius: f32,
    pub damage: f32,
    /// Number of additional targets the bullet may hit before despawning.
    /// `0` = non-piercing (one-shot). Mirrors `CollisionBullet.piercing`
    /// semantics — see `sim/collision.rs:160`.
    pub pierce_count: u32,

    // ── Movement modifiers ──────────────────────────────────────────────
    /// Predictive-lead homing flag. Today `update_bullets` does NOT consume
    /// this (the parity-tested path in `update_player_bullet` does); kept
    /// on the state so the wrapper can flag-route between the two paths
    /// once full plumbing lands.
    pub homing: bool,
    /// Helix amplitude (px). When `0.0` the helix branch in
    /// `update_bullets` is bypassed.
    pub helix_amplitude: f32,
    /// Angular frequency of the helix sine. Applied to `age_ticks` each
    /// tick.
    pub helix_freq: f32,

    // ── Lifetime (logic ticks) ──────────────────────────────────────────
    pub age_ticks: u32,
    pub max_age_ticks: u32,

    // ── Lifecycle latch ─────────────────────────────────────────────────
    pub active: bool,
}

impl BulletState {
    /// Fresh bullet with sensible defaults at the origin.
    ///
    /// Mirrors `Asteroid::fresh` / `CollisionBullet::fresh`: scalar fields
    /// at zero or a sensible neutral, lifetime caps at typical defaults
    /// (`max_age_ticks=120` ≈ 2s at 60 Hz), `active=true`. Callers override
    /// individual fields via struct-update syntax or direct mutation after
    /// construction.
    pub fn fresh(id: BulletId) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            radius: 4.0,
            damage: 1.0,
            pierce_count: 0,
            homing: false,
            helix_amplitude: 0.0,
            helix_freq: 0.0,
            age_ticks: 0,
            max_age_ticks: 120,
            active: true,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct GameState {
    pub field: Field,
    pub ships: Vec<ShipState>,
    pub enemies: Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub drops: Vec<DropState>,
    pub bullets: Vec<BulletState>,
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
