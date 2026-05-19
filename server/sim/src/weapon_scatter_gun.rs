//! Phase 4 SCATTER_GUN weapon — slow-fire 5-pellet cone, evenly
//! distributed across `SPREAD_HALF_RAD` radians on either side of
//! `ship.angle`. NOT randomized — the cone is deterministic for
//! predictable target acquisition.
//!
//! Mirrors solo's `weapon-data.js` SCATTER_GUN entry (display name
//! "Scatter Shot"):
//!   fireRate: 700 ms     → 42 ticks @ 60 Hz
//!   damage:   0.42
//!   bulletSpeed: 0.9     (multiplier on PULSE_CANNON BULLET_SPEED)
//!   bulletCount: 5       (pellets per shot)
//!   spreadAngle: 0.4     (full cone, ~23°; half is 0.2)
//!   piercing: 0
//!   range:    1.2        (lifetime multiplier vs PULSE_CANNON)
//!
//! ## Divergence from solo
//!
//! Solo's `fireScatterGun` (player/weapons.js:414-415) adds a small
//! `(Math.random() - 0.5) * 0.05` jitter (±0.025 rad) on TOP of the
//! cone distribution. The sim intentionally omits this jitter —
//! the 5.111.0 design note explicitly tightened the cone for
//! "predictable mid-range target acquisition", and deterministic
//! pellet angles also keep both server + WASM client bit-exact
//! without burning RNG draws on cosmetic spread. If solo's jitter
//! is ever judged a load-bearing feel, it can be re-added through
//! `_rng` here without changing the public function shape.

use crate::rng_ctx::RngCtx;
use crate::state::ShipState;

/// Fire cooldown in ticks. Solo's `fireRate: 700` ms at the 60 Hz
/// sim rate: `700 / (1000/60) = 42` ticks.
pub const COOLDOWN_TICKS: u32 = 42;

/// Per-pellet damage. Matches `SCATTER_GUN.damage = 0.42`.
pub const DAMAGE: f64 = 0.42;

/// Speed multiplier on PULSE_CANNON's `BULLET_SPEED`. Matches solo's
/// `bulletSpeed: 0.9`.
pub const BULLET_SPEED_MULT: f64 = 0.9;

/// Lifetime multiplier on PULSE_CANNON's lifetime. Matches solo's
/// `range: 1.2` (pellets last 20% longer).
pub const BULLET_LIFETIME_MULT: f64 = 1.2;

/// Pellets per volley. Matches solo's `bulletCount: 5`.
pub const BULLET_COUNT: u32 = 5;

/// Full cone half-angle (radians). Pellets distribute evenly from
/// `-SPREAD_HALF_RAD` to `+SPREAD_HALF_RAD` off the ship's facing.
/// Half of solo's `spreadAngle: 0.4`.
pub const SPREAD_HALF_RAD: f64 = 0.2;

/// Pellets do not pierce. Matches solo's `piercing: 0`.
pub const PIERCING: u8 = 0;

/// One pellet's spawn intent. The room actor consumes this on the
/// next tick to allocate a `BulletState` (id + spawn_tick assigned
/// there) and emit a `BulletSpawn` wire event. All five pellets in
/// a volley share the same `origin_*` (ship center), `damage`,
/// `piercing`, `lifetime_mult`, `speed_mult` — only `angle` varies.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeaponBulletSpawn {
    /// Spawn x — the ship's center.
    pub origin_x: f64,
    /// Spawn y — the ship's center.
    pub origin_y: f64,
    /// Bullet heading (radians; 0 = +x axis).
    pub angle: f64,
    /// Damage applied on hit. Always `DAMAGE` for this weapon.
    pub damage: f64,
    /// Hit-passes remaining (0 = stops on first hit).
    pub piercing: u8,
    /// Lifetime multiplier vs the base PULSE_CANNON lifetime.
    pub lifetime_mult: f64,
    /// Speed multiplier vs the base PULSE_CANNON BULLET_SPEED.
    pub speed_mult: f64,
}

/// Fire one SCATTER_GUN volley. Returns `BULLET_COUNT` (5) pellets
/// evenly fanned across the cone:
///
/// ```text
///   offset[i] = -SPREAD_HALF_RAD
///             + (i as f64) * (2.0 * SPREAD_HALF_RAD / (N - 1))
/// ```
///
/// where `N = BULLET_COUNT`. For `N = 5, SPREAD_HALF_RAD = 0.2`,
/// pellets fire at `ship.angle + {-0.2, -0.1, 0.0, +0.1, +0.2}`.
///
/// Deterministic — `_rng` is unused (matched in the signature for
/// parallelism with the other weapons; future damage jitter or
/// critical-hit logic could plug in here without changing callers).
pub fn fire(ship: &ShipState, _rng: &mut RngCtx) -> Vec<WeaponBulletSpawn> {
    let mut pellets = Vec::with_capacity(BULLET_COUNT as usize);

    // Guard against pathological BULLET_COUNT == 1 (single pellet
    // at center) so the divisor `(N - 1)` doesn't trip a div-by-zero.
    // With BULLET_COUNT == 5 the guard never fires in practice, but
    // it keeps the helper safe if a future tuning pass drops the
    // count to 1.
    let step = if BULLET_COUNT > 1 {
        2.0 * SPREAD_HALF_RAD / (BULLET_COUNT - 1) as f64
    } else {
        0.0
    };

    for i in 0..BULLET_COUNT {
        let offset = if BULLET_COUNT > 1 {
            -SPREAD_HALF_RAD + (i as f64) * step
        } else {
            0.0
        };
        pellets.push(WeaponBulletSpawn {
            origin_x: ship.x,
            origin_y: ship.y,
            angle: ship.angle + offset,
            damage: DAMAGE,
            piercing: PIERCING,
            lifetime_mult: BULLET_LIFETIME_MULT,
            speed_mult: BULLET_SPEED_MULT,
        });
    }

    pellets
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a synthetic ShipState for unit tests. Mirrors the
    /// `ShipState` shape from `state.rs:39-66`.
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
        }
    }

    /// Volley size must equal BULLET_COUNT (5).
    #[test]
    fn fire_returns_five_pellets() {
        let ship = make_ship(500.0, 600.0, 0.0);
        let mut rng = RngCtx::from_seed(1);
        let pellets = fire(&ship, &mut rng);
        assert_eq!(pellets.len(), 5);
        assert_eq!(pellets.len(), BULLET_COUNT as usize);
    }

    /// Every pellet spawns at the ship's center, not at any
    /// muzzle offset (sim currently doesn't model muzzle offset;
    /// solo's player.x/y is also the ship center).
    #[test]
    fn pellet_origins_all_at_ship() {
        let ship = make_ship(123.5, 456.75, 0.7);
        let mut rng = RngCtx::from_seed(2);
        let pellets = fire(&ship, &mut rng);
        for p in &pellets {
            assert_eq!(p.origin_x, ship.x);
            assert_eq!(p.origin_y, ship.y);
        }
    }

    /// For ship.angle = 0, the 5 pellets fire at exactly
    /// {-0.2, -0.1, 0.0, +0.1, +0.2} rad.
    #[test]
    fn pellet_angles_evenly_distributed() {
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut rng = RngCtx::from_seed(3);
        let pellets = fire(&ship, &mut rng);
        let expected = [-0.2, -0.1, 0.0, 0.1, 0.2];
        for (i, p) in pellets.iter().enumerate() {
            assert!(
                (p.angle - expected[i]).abs() < 1e-12,
                "pellet {} angle = {}, expected {}",
                i,
                p.angle,
                expected[i],
            );
        }
    }

    /// Middle pellet (index BULLET_COUNT/2 = 2) fires exactly along
    /// ship.angle within 1e-12.
    #[test]
    fn pellet_center_matches_ship_angle() {
        let ship = make_ship(0.0, 0.0, 0.9);
        let mut rng = RngCtx::from_seed(4);
        let pellets = fire(&ship, &mut rng);
        let mid = (BULLET_COUNT / 2) as usize;
        assert!(
            (pellets[mid].angle - ship.angle).abs() < 1e-12,
            "middle pellet {} angle = {}, ship.angle = {}",
            mid,
            pellets[mid].angle,
            ship.angle,
        );
    }

    /// Cone is symmetric: the outermost pellets' offsets sum to 0.
    #[test]
    fn pellet_spread_is_symmetric() {
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut rng = RngCtx::from_seed(5);
        let pellets = fire(&ship, &mut rng);
        let first_offset = pellets[0].angle - ship.angle;
        let last_offset = pellets[(BULLET_COUNT - 1) as usize].angle - ship.angle;
        assert!(
            (first_offset + last_offset).abs() < 1e-12,
            "first offset {} + last offset {} != 0",
            first_offset,
            last_offset,
        );
    }

    /// Every pellet carries the module's damage / piercing /
    /// lifetime / speed constants verbatim.
    #[test]
    fn pellets_carry_constants() {
        let ship = make_ship(0.0, 0.0, 0.0);
        let mut rng = RngCtx::from_seed(6);
        let pellets = fire(&ship, &mut rng);
        for p in &pellets {
            assert_eq!(p.damage, DAMAGE);
            assert_eq!(p.piercing, PIERCING);
            assert_eq!(p.lifetime_mult, BULLET_LIFETIME_MULT);
            assert_eq!(p.speed_mult, BULLET_SPEED_MULT);
        }
    }

    /// SCATTER_GUN is deterministic — the rng arg is unused, so two
    /// fire() calls with DIFFERENT seeds produce IDENTICAL pellets.
    /// This locks in the no-RNG contract: any future change that
    /// quietly starts consuming from `_rng` will break this test.
    #[test]
    fn deterministic_no_rng_dependence() {
        let ship = make_ship(750.0, 250.0, 1.0);
        let mut rng_a = RngCtx::from_seed(0xDEAD_BEEF);
        let mut rng_b = RngCtx::from_seed(0xCAFE_F00D);
        let a = fire(&ship, &mut rng_a);
        let b = fire(&ship, &mut rng_b);
        assert_eq!(a, b, "pellets must not depend on RNG state");
    }

    /// For ship.angle = 1.5, middle pellet fires at 1.5; outermost
    /// pellets at 1.5 ± 0.2 (== 1.3 and 1.7). Confirms ship.angle
    /// is added cleanly to the offset (no rounding/sign bugs).
    #[test]
    fn nonzero_ship_angle_propagates() {
        let ship = make_ship(0.0, 0.0, 1.5);
        let mut rng = RngCtx::from_seed(7);
        let pellets = fire(&ship, &mut rng);
        let mid = (BULLET_COUNT / 2) as usize;
        let last = (BULLET_COUNT - 1) as usize;
        assert!((pellets[mid].angle - 1.5).abs() < 1e-12);
        assert!(
            (pellets[0].angle - (1.5 - 0.2)).abs() < 1e-12,
            "outer-left pellet = {}, expected {}",
            pellets[0].angle,
            1.5 - 0.2,
        );
        assert!(
            (pellets[last].angle - (1.5 + 0.2)).abs() < 1e-12,
            "outer-right pellet = {}, expected {}",
            pellets[last].angle,
            1.5 + 0.2,
        );
    }
}
