//! Phase-3 bullet sim — straight-line projectile, fully
//! deterministic.
//!
//! Authored fresh 2026-05-17 from `js/modules/player/bullet.js`
//! + `js/modules/combat/weapon-data.js` (PULSE_CANNON row) +
//! `js/modules/core/constants.js` (BULLET_SPEED). Per the Phase-3
//! "Architecture Revision", bullets carry NO per-snapshot wire
//! state — the server broadcasts BulletSpawn once at spawn (with
//! origin + velocity + spawn_tick) and BulletHit once at hit;
//! both server and WASM client compute the trajectory between
//! those events from pure arithmetic (no trig, no RNG —
//! position(t) = origin + velocity * (current_tick - spawn_tick)).

use serde::{Deserialize, Serialize};

/// Per-tick bullet speed for PULSE_CANNON (px/tick at 60Hz sim).
/// Matches `GAME_CONFIG.BULLET_SPEED = 16 * (30/60)` in solo's
/// constants.js.
pub const BULLET_SPEED: f64 = 8.0;

/// Damage per hit for PULSE_CANNON. Matches `PULSE_CANNON.damage`
/// in weapon-data.js (1.2 base — Phase 3 ignores crit / upgrade
/// modifiers).
pub const PULSE_CANNON_DAMAGE: f64 = 1.2;

/// PULSE_CANNON bullet lifetime in ticks. Matches solo's
/// `maxLife = 480 frames @ 30Hz` → 240 ticks at 60Hz sim.
/// Off-screen check + this hard limit kills bullets that miss.
pub const PULSE_CANNON_LIFETIME_TICKS: u32 = 240;

/// Visible bullet radius (for hit-test). Matches solo's
/// `bullet.radius = 3` for PULSE_CANNON.
pub const BULLET_RADIUS: f64 = 3.0;

/// Bullet state. Pure projectile — no acceleration, no homing,
/// no piercing in Phase 3.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BulletState {
    /// Server-assigned bullet id; stable across spawn → hit/expiry.
    pub id: u32,
    /// Player id of the shooter (for friendly-fire exclusion).
    pub owner_player_id: u32,
    /// Spawn x in world pixels.
    pub origin_x: f64,
    /// Spawn y in world pixels.
    pub origin_y: f64,
    /// Per-tick x velocity (px/tick).
    pub vx: f64,
    /// Per-tick y velocity (px/tick).
    pub vy: f64,
    /// Sim tick at which the bullet was spawned.
    pub spawn_tick: u32,
    /// Lifetime in ticks remaining. Decrements each tick; bullet
    /// dies at 0. Tracked separately from `current_tick - spawn_tick`
    /// so the server can apply different lifetimes per-weapon.
    pub life_remaining: u32,
    /// Whether the bullet is still alive in the sim.
    pub active: bool,
}

impl BulletState {
    /// Construct a fresh bullet from spawn parameters. Called by
    /// the server's weapon.try_fire and the WASM client's mirror
    /// on receipt of a BulletSpawn event.
    pub fn spawn(
        id: u32,
        owner_player_id: u32,
        origin_x: f64,
        origin_y: f64,
        angle: f64,
        spawn_tick: u32,
    ) -> Self {
        Self {
            id,
            owner_player_id,
            origin_x,
            origin_y,
            vx: super::trig::cos64(angle) * BULLET_SPEED,
            vy: super::trig::sin64(angle) * BULLET_SPEED,
            spawn_tick,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            active: true,
        }
    }

    /// Pure-arithmetic position projection. Given the bullet's
    /// spawn parameters and a target tick, returns where the bullet
    /// is. Bit-exact across runtimes — no trig, no RNG, just `+`
    /// and `*` on f64.
    pub fn position_at(&self, current_tick: u32) -> (f64, f64) {
        let dt = (current_tick.wrapping_sub(self.spawn_tick)) as f64;
        (
            self.origin_x + self.vx * dt,
            self.origin_y + self.vy * dt,
        )
    }

    /// True iff the bullet has been despawned (by hit, expiry, or
    /// leaving the field).
    pub fn dead(&self) -> bool {
        !self.active || self.life_remaining == 0
    }
}

/// Per-tick update: decrement lifetime, mark inactive if off-screen
/// or expired. Mirrors solo's bullet.update() in the relevant
/// branches (we skip the powerup / homing / piercing branches —
/// not part of Phase 3).
pub fn update_bullet(b: &mut BulletState, current_tick: u32, field_w: f64, field_h: f64) {
    if !b.active {
        return;
    }
    if b.life_remaining > 0 {
        b.life_remaining -= 1;
    }
    if b.life_remaining == 0 {
        b.active = false;
        return;
    }
    let (x, y) = b.position_at(current_tick);
    // Off-field with a small margin (matches solo's `wrap` behavior
    // adapted to "die" instead of "wrap" — bullets don't wrap).
    let margin = BULLET_RADIUS + 4.0;
    if x < -margin || x > field_w + margin || y < -margin || y > field_h + margin {
        b.active = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Spawn at angle 0 should produce vx ≈ BULLET_SPEED, vy ≈ 0
    /// within the trig polynomial's actual error band (~3e-5; see
    /// `mp1::trig::tests::sin_matches_std_within_epsilon` for the
    /// realistic-accuracy rationale).
    #[test]
    fn spawn_sets_velocity_from_angle() {
        let b = BulletState::spawn(1, 7, 0.0, 0.0, 0.0, 0);
        assert!((b.vx - BULLET_SPEED).abs() < 1e-3, "vx = {}", b.vx);
        assert!(b.vy.abs() < 1e-3, "vy = {}", b.vy);
    }

    /// `position_at` is built from `+` and `*` only — no trig, no
    /// rounding, no RNG — so it must be bit-exact across runtimes.
    /// We assert exact f64 equality here on purpose: any drift would
    /// break Phase-3's "client integrates the trajectory" guarantee.
    #[test]
    fn position_at_is_pure_arithmetic() {
        let b = BulletState {
            id: 1,
            owner_player_id: 0,
            origin_x: 100.0,
            origin_y: 100.0,
            vx: 8.0,
            vy: 0.0,
            spawn_tick: 10,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            active: true,
        };
        let (x, y) = b.position_at(30);
        assert_eq!(x, 260.0);
        assert_eq!(y, 100.0);
    }

    /// `wrapping_sub` handles u32 tick rollover. Spawn near
    /// u32::MAX, query past zero — dt must be the wrapped delta
    /// (5 ticks to overflow + 1 to wrap + 10 = 16).
    #[test]
    fn position_at_handles_wrapping_tick() {
        let b = BulletState {
            id: 1,
            owner_player_id: 0,
            origin_x: 0.0,
            origin_y: 0.0,
            vx: 1.0,
            vy: 0.0,
            spawn_tick: u32::MAX - 5,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            active: true,
        };
        let (x, _) = b.position_at(10);
        assert_eq!(x, 16.0);
    }

    /// Decrement-to-zero contract: after PULSE_CANNON_LIFETIME_TICKS
    /// calls to update_bullet, the bullet must be inactive.
    #[test]
    fn lifetime_decrements_and_kills() {
        // Velocity zero so the off-field branch never fires — we
        // want to isolate the lifetime-expiry path.
        let mut b = BulletState {
            id: 1,
            owner_player_id: 0,
            origin_x: 500.0,
            origin_y: 500.0,
            vx: 0.0,
            vy: 0.0,
            spawn_tick: 0,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            active: true,
        };
        for tick in 1..PULSE_CANNON_LIFETIME_TICKS {
            update_bullet(&mut b, tick, 1920.0, 1080.0);
            assert!(b.active, "killed prematurely at tick {}", tick);
        }
        update_bullet(&mut b, PULSE_CANNON_LIFETIME_TICKS, 1920.0, 1080.0);
        assert!(!b.active, "should be inactive after {} ticks", PULSE_CANNON_LIFETIME_TICKS);
    }

    /// One huge step should clear the field and trip the bounds
    /// check on the very next update.
    #[test]
    fn off_field_kills_immediately() {
        let mut b = BulletState {
            id: 1,
            owner_player_id: 0,
            origin_x: 1000.0,
            origin_y: 540.0,
            vx: 100_000.0,
            vy: 0.0,
            spawn_tick: 0,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            active: true,
        };
        update_bullet(&mut b, 1, 1920.0, 1080.0);
        assert!(!b.active);
    }

    /// Determinism check: two bullets fired with identical inputs
    /// must trace identical positions tick-for-tick.
    #[test]
    fn same_inputs_same_state_after_n_ticks() {
        let a = BulletState::spawn(1, 0, 200.0, 300.0, 0.7853981633974483, 0);
        let b = BulletState::spawn(2, 0, 200.0, 300.0, 0.7853981633974483, 0);
        for t in 0..100u32 {
            let pa = a.position_at(t);
            let pb = b.position_at(t);
            assert_eq!(pa.0, pb.0, "x drift at tick {}", t);
            assert_eq!(pa.1, pb.1, "y drift at tick {}", t);
        }
    }
}
