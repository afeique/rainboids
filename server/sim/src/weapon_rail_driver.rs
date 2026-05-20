//! Phase 4 RAIL_DRIVER weapon — slow-fire, high-damage, high-velocity,
//! piercing single shot. Mirrors solo's `weapon-data.js` RAIL_DRIVER
//! entry (lines 80-97). Deterministic — no jitter, no spread.
//!
//! Solo identity: heavy artillery. One shot punches through every
//! enemy in its path (the "double-helix pair" in the solo description
//! is a cosmetic render quirk; mechanically it's ONE piercing bullet
//! per shot). Slow fire-rate balances the raw damage + pierce.
//!
//! Why this module is so small: rail driver has zero randomness and
//! zero per-shot geometry — `fire()` is essentially a struct literal.
//! The `_rng` parameter is accepted purely for signature-parallelism
//! with the other Phase 4 weapons (storm needles + scatter gun both
//! consume RNG for spread/jitter); keeping the same signature lets
//! the Wave 2 dispatcher call any weapon uniformly.

use crate::rng_ctx::RngCtx;
use crate::state::ShipState;

/// Cooldown between shots, in 60-Hz sim ticks. Mirrors solo's
/// `fireRate: 1200` ms → `1200 / (1000/60) = 72` ticks.
pub const COOLDOWN_TICKS: u32 = 72;

/// Per-hit damage. Mirrors solo's `damage: 3` (integer in JS; f64
/// here to match the sim damage pipeline's scalar type).
pub const DAMAGE: f64 = 3.0;

/// Bullet speed multiplier vs PULSE_CANNON's base. Mirrors solo's
/// `bulletSpeed: 1.4`. The actual per-tick velocity is computed by
/// the bullet spawner: `PULSE_CANNON_BASE_SPEED * BULLET_SPEED_MULT`.
pub const BULLET_SPEED_MULT: f64 = 1.4;

/// Bullet lifetime multiplier vs PULSE_CANNON's base. Mirrors solo's
/// `range: 0.85` — rail driver bullets despawn 15% sooner because
/// their higher velocity already covers more ground per tick.
pub const BULLET_LIFETIME_MULT: f64 = 0.85;

/// Number of bullets fired per shot. Mirrors solo's `bulletCount: 1`.
pub const BULLET_COUNT: u32 = 1;

/// Piercing — how many ADDITIONAL targets a bullet hits after the
/// first before deactivating. Solo's `piercing: 99` ⇒ effectively
/// infinite. The collision code (Wave 2 integration) will decrement
/// this counter on each hit and only deactivate the bullet when it
/// reaches 0.
pub const PIERCING: u8 = 99;

/// One bullet's spawn parameters. Returned from `fire()` and consumed
/// by the Wave 2 collision/spawn integration. Carries the per-shot
/// gameplay knobs (damage / piercing / lifetime / speed) so the
/// bullet pool doesn't need to know which weapon fired it.
///
/// Shared shape across all Phase 4 weapons (Agents A, B, C all
/// return `Vec<WeaponBulletSpawn>`). Keeping the field set identical
/// lets the Wave 2 dispatcher iterate uniformly regardless of which
/// weapon produced the spawns.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeaponBulletSpawn {
    /// World-space spawn x (ship center).
    pub origin_x: f64,
    /// World-space spawn y (ship center).
    pub origin_y: f64,
    /// Travel angle in radians (0 = +x axis, matches `ShipState.angle`).
    pub angle: f64,
    /// Per-hit damage to apply.
    pub damage: f64,
    /// Additional targets the bullet may hit after the first before
    /// deactivating. 0 = single-hit; 99 = effectively infinite.
    pub piercing: u8,
    /// Lifetime multiplier vs PULSE_CANNON base.
    pub lifetime_mult: f64,
    /// Speed multiplier vs PULSE_CANNON base.
    pub speed_mult: f64,
}

/// Fire one RAIL_DRIVER shot. Returns exactly 1 bullet aimed along
/// `ship.angle` from `(ship.x, ship.y)`.
///
/// Deterministic — `_rng` is unused. Rail driver has zero jitter and
/// zero spread by design (solo's `spreadAngle: 0`); the parameter is
/// accepted only to keep the signature consistent with the other
/// Phase 4 weapons.
pub fn fire(ship: &ShipState, _rng: &mut RngCtx) -> Vec<WeaponBulletSpawn> {
    vec![WeaponBulletSpawn {
        origin_x: ship.x,
        origin_y: ship.y,
        angle: ship.angle,
        damage: DAMAGE,
        piercing: PIERCING,
        lifetime_mult: BULLET_LIFETIME_MULT,
        speed_mult: BULLET_SPEED_MULT,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a synthetic `ShipState` with the fields rail driver
    /// actually reads (x, y, angle). Other fields get sane defaults
    /// so the struct is fully constructed but their values don't
    /// affect `fire()`'s output.
    fn make_ship(x: f64, y: f64, angle: f64) -> ShipState {
        ShipState {
            player_id: 1,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle,
            hp: 100.0,
            max_hp: 100.0,
            radius: 15.0,
            active: true,
            downed: false,
            revive_meter: 0.0,
            weapon_kind: 0,
            shield: 0.0,
            max_shield: 0.0,
            spare_tanks: 0,
            ..ShipState::default()
        }
    }

    #[test]
    fn fire_returns_one_bullet() {
        let ship = make_ship(100.0, 200.0, 0.5);
        let mut rng = RngCtx::from_seed(42);
        let bullets = fire(&ship, &mut rng);
        assert_eq!(bullets.len(), 1, "RAIL_DRIVER fires exactly one bullet");
    }

    #[test]
    fn bullet_origin_is_ship_position() {
        let ship = make_ship(123.456, 789.012, 0.0);
        let mut rng = RngCtx::from_seed(7);
        let bullets = fire(&ship, &mut rng);
        assert_eq!(bullets[0].origin_x, ship.x);
        assert_eq!(bullets[0].origin_y, ship.y);
    }

    #[test]
    fn bullet_angle_equals_ship_angle() {
        // Exact-equality across a variety of angles — rail driver has
        // zero jitter, so the bullet must inherit `ship.angle` bit-for-
        // bit (no float arithmetic involved in the assignment).
        for &angle in &[0.0, 1.5, -2.0, std::f64::consts::PI] {
            let ship = make_ship(0.0, 0.0, angle);
            let mut rng = RngCtx::from_seed(123);
            let bullets = fire(&ship, &mut rng);
            assert_eq!(
                bullets[0].angle, angle,
                "bullet angle must match ship.angle exactly (got {} vs {})",
                bullets[0].angle, angle
            );
        }
    }

    #[test]
    fn bullet_piercing_is_99() {
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut rng = RngCtx::from_seed(0);
        let bullets = fire(&ship, &mut rng);
        assert_eq!(bullets[0].piercing, 99);
    }

    #[test]
    fn bullet_carries_constants() {
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut rng = RngCtx::from_seed(0);
        let b = fire(&ship, &mut rng)[0];
        assert_eq!(b.damage, DAMAGE);
        assert_eq!(b.damage, 3.0);
        assert_eq!(b.lifetime_mult, 0.85);
        assert_eq!(b.speed_mult, 1.4);
    }

    #[test]
    fn deterministic_no_rng_dependence() {
        // Rail driver has zero randomness — two fires with different
        // RNG seeds must produce bit-identical bullets. This is the
        // contract guard that keeps the `_rng` parameter from sneaking
        // in any future jitter.
        let ship = make_ship(50.0, 75.0, 0.25);
        let mut rng_a = RngCtx::from_seed(1);
        let mut rng_b = RngCtx::from_seed(999_999_999);
        let ba = fire(&ship, &mut rng_a);
        let bb = fire(&ship, &mut rng_b);
        assert_eq!(ba, bb, "rail driver output must not depend on RNG");
    }

    #[test]
    fn consts_match_solo_spec() {
        // Contract guard against accidental tuning. If any of these
        // change, the matching value in js/modules/combat/weapon-data.js
        // (RAIL_DRIVER block, lines 80-97) must change in the same
        // commit.
        assert_eq!(COOLDOWN_TICKS, 72);
        assert_eq!(DAMAGE, 3.0);
        assert_eq!(BULLET_SPEED_MULT, 1.4);
        assert_eq!(BULLET_LIFETIME_MULT, 0.85);
        assert_eq!(BULLET_COUNT, 1);
        assert_eq!(PIERCING, 99);
    }
}
