//! Phase 4 STORM_NEEDLES weapon — rapid-fire single-needle with
//! randomized cone-of-fire jitter.
//!
//! Mirrors solo's `weapon-data.js` STORM_NEEDLES entry. Pure
//! deterministic fire function: takes ship + RNG, returns spawn
//! parameters for the bullets to emit this firing event.
//!
//! The actual `BulletState` construction + id assignment + push into
//! `RoomState.bullets` happens in `mp1_room.rs` Wave 2 integration —
//! this module only returns the per-bullet parameters.

use crate::mp1::rng_ctx::RngCtx;
use crate::mp1::state::ShipState;

/// Cooldown between shots in sim ticks. Solo's `fireRate: 130` ms ÷
/// (1000 / 60) ≈ 7.8 → 8 ticks (rounded).
pub const COOLDOWN_TICKS: u32 = 8;

/// Damage per needle. Mirrors solo's `damage: 0.4`. Low per-shot
/// because the high RPM compensates.
pub const DAMAGE: f64 = 0.4;

/// Bullet velocity multiplier vs the mp1 base `BULLET_SPEED` (8.0
/// px/tick). Solo's `bulletSpeed: 1.1`.
pub const BULLET_SPEED_MULT: f64 = 1.1;

/// Bullet lifetime multiplier vs the mp1 base
/// `PULSE_CANNON_LIFETIME_TICKS` (240). Solo's `range: 1.0` ⇒ no
/// change from base.
pub const BULLET_LIFETIME_MULT: f64 = 1.0;

/// Bullet count per firing event. Solo's `bulletCount: 1` (the
/// 5.113.1 rollback explicitly returned this to 1 needle; the cone
/// is randomized jitter per shot, not a fan).
pub const BULLET_COUNT: u32 = 1;

/// Randomized angle jitter half-range (radians). Each bullet's
/// direction is `ship.angle + rng.range_f64(-SPREAD_HALF, +SPREAD_HALF)`.
/// Solo's `spreadAngle: 0.20` is the FULL cone, so the half-range
/// here is `0.10` rad.
pub const SPREAD_HALF_RAD: f64 = 0.10;

/// Piercing — how many additional targets a single bullet can hit
/// before deactivating. Solo's `piercing: 0` ⇒ bullet dies on first
/// hit (no extra targets).
pub const PIERCING: u8 = 0;

/// One bullet's spawn parameters returned by `fire`. The orchestrator's
/// Wave 2 integration in `mp1_room.rs` maps these to `BulletState`
/// (assigning ids + applying multipliers).
///
/// Intermediate type so Wave-1 weapon agents don't need to depend on
/// any future `BulletState` shape changes; integration owns the
/// conversion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeaponBulletSpawn {
    pub origin_x: f64,
    pub origin_y: f64,
    pub angle: f64,
    pub damage: f64,
    pub piercing: u8,
    pub lifetime_mult: f64,
    pub speed_mult: f64,
}

/// Fire one STORM_NEEDLES shot. Returns the bullets to spawn this
/// tick. Pure deterministic given `(ship.angle, rng state)`.
///
/// Caller (Wave 2 integration in `mp1_room.rs::process_fire_inputs`)
/// is responsible for:
/// - gating against the cooldown (`tick - last_fire_tick >= COOLDOWN_TICKS`)
/// - assigning bullet ids
/// - constructing `BulletState` from each `WeaponBulletSpawn` using
///   the shared spawn helper (which will be extended Wave 2 to accept
///   per-weapon damage / piercing / lifetime / speed multipliers)
/// - pushing each bullet onto `RoomState.bullets`
/// - emitting one `EventPayload::BulletSpawn` per bullet
pub fn fire(ship: &ShipState, rng: &mut RngCtx) -> Vec<WeaponBulletSpawn> {
    // 1 needle this tick. Jitter the angle uniformly in
    // [-SPREAD_HALF_RAD, +SPREAD_HALF_RAD).
    let mut out = Vec::with_capacity(BULLET_COUNT as usize);
    for _ in 0..BULLET_COUNT {
        let jitter = rng.range_f64(-SPREAD_HALF_RAD, SPREAD_HALF_RAD);
        out.push(WeaponBulletSpawn {
            origin_x: ship.x,
            origin_y: ship.y,
            angle: ship.angle + jitter,
            damage: DAMAGE,
            piercing: PIERCING,
            lifetime_mult: BULLET_LIFETIME_MULT,
            speed_mult: BULLET_SPEED_MULT,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mp1::state::ShipState;

    /// Build a synthetic ship at a known position + angle. Other
    /// fields default to ShipState's centered-facing-up values; we
    /// override only what the weapon reads.
    fn make_ship(x: f64, y: f64, angle: f64) -> ShipState {
        ShipState {
            x,
            y,
            angle,
            ..ShipState::default()
        }
    }

    #[test]
    fn fire_returns_one_bullet() {
        let ship = make_ship(100.0, 200.0, 0.0);
        let mut rng = RngCtx::from_seed(42);
        let bullets = fire(&ship, &mut rng);
        assert_eq!(bullets.len(), 1, "STORM_NEEDLES emits exactly 1 needle per shot");
        assert_eq!(bullets.len(), BULLET_COUNT as usize);
    }

    #[test]
    fn bullet_origin_is_ship_position() {
        let ship = make_ship(123.5, 456.75, 0.5);
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(&ship, &mut rng);
        let b = bullets[0];
        assert_eq!(b.origin_x, ship.x);
        assert_eq!(b.origin_y, ship.y);
    }

    #[test]
    fn bullet_angle_is_within_jitter_range() {
        let ship_angle = 1.234_f64;
        let ship = make_ship(0.0, 0.0, ship_angle);
        // Many seeds — every bullet's angle must lie in the half-open
        // window [angle - SPREAD_HALF_RAD, angle + SPREAD_HALF_RAD).
        for seed in 0..200u64 {
            let mut rng = RngCtx::from_seed(seed);
            let bullets = fire(&ship, &mut rng);
            let delta = bullets[0].angle - ship_angle;
            assert!(
                delta >= -SPREAD_HALF_RAD,
                "seed {seed} jitter {delta} below -SPREAD_HALF_RAD"
            );
            assert!(
                delta < SPREAD_HALF_RAD,
                "seed {seed} jitter {delta} at-or-above +SPREAD_HALF_RAD"
            );
        }
    }

    #[test]
    fn bullet_carries_constants() {
        let ship = make_ship(10.0, 20.0, 0.7);
        let mut rng = RngCtx::from_seed(99);
        let bullets = fire(&ship, &mut rng);
        let b = bullets[0];
        assert_eq!(b.damage, DAMAGE);
        assert_eq!(b.piercing, PIERCING);
        assert_eq!(b.lifetime_mult, BULLET_LIFETIME_MULT);
        assert_eq!(b.speed_mult, BULLET_SPEED_MULT);
    }

    #[test]
    fn same_seed_same_bullet() {
        let ship = make_ship(500.0, 500.0, -0.3);
        let mut rng_a = RngCtx::from_seed(2026);
        let mut rng_b = RngCtx::from_seed(2026);
        let a = fire(&ship, &mut rng_a);
        let b = fire(&ship, &mut rng_b);
        assert_eq!(a.len(), b.len());
        // Bit-exact f64 equality — same seed + same ship state must
        // produce bit-identical bullet params.
        assert_eq!(a[0].origin_x.to_bits(), b[0].origin_x.to_bits());
        assert_eq!(a[0].origin_y.to_bits(), b[0].origin_y.to_bits());
        assert_eq!(a[0].angle.to_bits(), b[0].angle.to_bits());
        assert_eq!(a[0].damage.to_bits(), b[0].damage.to_bits());
        assert_eq!(a[0].piercing, b[0].piercing);
        assert_eq!(a[0].lifetime_mult.to_bits(), b[0].lifetime_mult.to_bits());
        assert_eq!(a[0].speed_mult.to_bits(), b[0].speed_mult.to_bits());
        assert_eq!(a[0], b[0]);
    }

    #[test]
    fn different_seeds_different_jitter() {
        // Probe: across 100 seed pairs (seed, seed+1000), at least one
        // produces a different jitter angle. With a uniform [-0.10,
        // 0.10) draw, the probability that 100 independent pairs ALL
        // coincide to bit-exact f64 is astronomically low — a single
        // mismatch is enough to prove the RNG actually varies.
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut differ_count = 0;
        for seed in 0..100u64 {
            let mut a = RngCtx::from_seed(seed);
            let mut b = RngCtx::from_seed(seed + 1000);
            let ba = fire(&ship, &mut a);
            let bb = fire(&ship, &mut b);
            if ba[0].angle != bb[0].angle {
                differ_count += 1;
            }
        }
        // Realistically every pair should differ — but allow a tiny
        // tolerance just in case two PCG streams happen to align.
        assert!(
            differ_count >= 95,
            "expected nearly all 100 seed pairs to yield distinct jitter; got {differ_count}"
        );
    }

    #[test]
    fn jitter_distribution_is_symmetric_around_ship_angle() {
        // Sample many shots, average the per-shot jitter. Uniform
        // [-0.10, +0.10) has true mean of ≈ -0.5 * (1/N_samples) ≈ 0;
        // with 1000 samples the empirical mean should sit well within
        // ±0.02 of zero.
        let ship_angle = 0.4_f64;
        let ship = make_ship(0.0, 0.0, ship_angle);
        let mut rng = RngCtx::from_seed(31_415);
        let n = 1000;
        let mut sum = 0.0_f64;
        for _ in 0..n {
            let bullets = fire(&ship, &mut rng);
            sum += bullets[0].angle - ship_angle;
        }
        let mean = sum / n as f64;
        assert!(
            mean.abs() < 0.02,
            "jitter mean {mean} not within 0.02 of 0 over {n} samples — distribution skewed"
        );
    }
}
