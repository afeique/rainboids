//! Phase 4 step 6 — CHARGE_SHOT power weapon (right-click slot).
//!
//! Authored 2026-05-19 from a hand-read of:
//!   - `js/modules/combat/weapon-data.js` — POWER_WEAPONS.CHARGE_SHOT
//!     (`isChargeBased: true, cooldown: 0`), plus the `CHARGE_*` upgrade
//!     rows (CHARGE_POWER, CHARGE_SPEED, CHARGE_OVERCHARGE, CHARGE_HOMING,
//!     CHARGE_PIERCING) — only base behavior is mirrored here; upgrades
//!     are deferred to Phase 5+.
//!   - `js/modules/player/weapons.js`:
//!       - charge state machine (the `isChargeBased` branch around L195–230
//!         that reads `input.fireSecondary` each frame, drives
//!         `chargeStartTime` / `chargeLevel`, and gates `fireChargedShot`
//!         on `currentChargeTime >= this.minChargeTime`);
//!       - `fireChargedShot` (L1275+) which produces the actual bullet
//!         with damage scaling from a base value upward as charge time
//!         grows.
//!   - `js/modules/core/constants.js` (SHIP_SIZE, BULLET_SPEED) and
//!     sibling sim modules (`weapon_storm_needles.rs`,
//!     `weapon_rail_driver.rs`) for the spawn-descriptor shape.
//!
//! ## State machine
//!
//! `ShipState` carries two charge fields (`charge_active: bool`,
//! `charge_progress: u32`). Each tick the dispatcher in `power_weapon.rs`
//! calls `tick_charge(&mut ship, power_fire_held)` with the current-frame
//! power-fire input bit. This module is the single owner of those two
//! fields.
//!
//! States × edges (rows = prior `charge_active`, cols = current `power_fire_held`):
//!
//! | prior \ current | false                          | true                            |
//! |-----------------|--------------------------------|----------------------------------|
//! | false           | IDLE: no-op, return None       | RISING: start charging         |
//! | true            | FALLING: release (maybe fire)  | HELD: increment progress       |
//!
//! - RISING:    `charge_active <- true`, `charge_progress <- 0`, return None.
//! - HELD:      `charge_progress <- min(charge_progress + 1, CHARGE_MAX_TICKS)`,
//!              return None.
//! - FALLING:   if `charge_progress >= CHARGE_MIN_TICKS`, compute scaled
//!              damage along `[CHARGE_BASE_DAMAGE, CHARGE_MAX_DAMAGE]`
//!              and return `Some(ChargeShotSpawn { .. })`; otherwise
//!              return None (too-short hold is a no-fire abort).
//!              Either way, reset `charge_active=false, charge_progress=0`.
//! - IDLE:      no state changes, return None.
//!
//! The firing angle is `ship.angle` (the sim's authoritative aim — set
//! from the player's mouse / right-stick aim in `client.js`'s input
//! frame). The bullet origin is offset along that angle from the ship's
//! center by `SHIP_NOSE_OFFSET` so the projectile visually emerges from
//! the nose, matching solo's muzzle-flare position.
//!
//! ## MVP simplification
//!
//! The CHARGE_OVERCHARGE upgrade (full-charge bullets explode on impact)
//! is **deferred to Phase 5+**. The Wave 2 dispatcher in `power_weapon.rs`
//! pushes a regular BulletState; no overcharge / AOE bit is plumbed
//! through the wire yet. Damage scales smoothly across the charge range,
//! but the "explosion on full-charge impact" effect from
//! `weapon-data.js`'s CHARGE_OVERCHARGE row is intentionally not
//! implemented in this milestone.
//!
//! ## Determinism
//!
//! No RNG, no transcendentals. The only f64 op past the integer charge
//! counter is the damage lerp (a single multiply + add), so two clients
//! seeing the same `charge_progress` at release time produce
//! bit-identical `damage` values.

use crate::state::ShipState;
use crate::trig::{cos64, sin64};

/// Power-weapon discriminator on the wire. CHARGE_SHOT is index 0 in the
/// power-weapon enum (matches solo's first POWER_WEAPONS row + the
/// default `power_weapon_kind` in `ShipState::default`).
pub const KIND_CHARGE_SHOT: u8 = 0;

/// Minimum hold time before a release will actually fire. Below this,
/// the release is a no-fire abort (state resets, no bullet spawns).
/// 30 ticks @ 60Hz = 0.5s — matches solo's feel (the `minChargeTime`
/// check in `weapons.js` is ~500ms).
pub const CHARGE_MIN_TICKS: u32 = 30;

/// Maximum useful charge time. Holding past this point produces no
/// further damage gain (`charge_progress` saturates here). 180 ticks
/// @ 60Hz = 3.0s. Slightly shorter than solo's 5s `maxChargeTime` —
/// MP needs faster firing rhythms because the field is busier and
/// holding for 5s on a co-op server is too punishing.
pub const CHARGE_MAX_TICKS: u32 = 180;

/// Damage at exactly `CHARGE_MIN_TICKS`. Solo's `fireChargedShot` lerps
/// damage from a baseDamage (~1 base + 0.5/CHARGE_POWER stack) to ~3 at
/// max charge — we scale that up here because power weapons in MP need
/// a clearer "this is the heavy hit" silhouette vs the primary cannons
/// (which max around 1.2–3.0 per shot). 8.0 at min, 30.0 at max gives a
/// ~3.75× swing — well above the noise of primary fire and rewarding
/// the hold but not one-shotting TITAN.
pub const CHARGE_BASE_DAMAGE: f64 = 8.0;

/// Damage at exactly `CHARGE_MAX_TICKS`. See `CHARGE_BASE_DAMAGE` for
/// the rationale. The lerp is linear in `charge_progress / CHARGE_MAX_TICKS`.
pub const CHARGE_MAX_DAMAGE: f64 = 30.0;

/// Bullet velocity multiplier vs the sim base `BULLET_SPEED`. Charged
/// shots feel weighty if they fly fast — 1.4× pulse cannon makes them
/// hard to dodge once released, balancing the long charge-up vulnerability.
pub const CHARGE_BULLET_SPEED_MULT: f64 = 1.4;

/// Charged-bullet lifetime multiplier vs `PULSE_CANNON_LIFETIME_TICKS`.
/// The bullet flies faster, so a 1.0× lifetime is already a longer reach
/// — no further extension needed.
pub const CHARGE_BULLET_LIFETIME_MULT: f64 = 1.0;

/// Visible bullet radius for hit-tests. Bigger than pulse (3.0) so the
/// charged shot reads as a heavy blob; downstream rendering will scale
/// this for the visual.
pub const CHARGE_BULLET_RADIUS: f64 = 8.0;

/// Pierce count. 2 = the bullet passes through 2 enemies before
/// stopping (third hit consumes it). Feels right at max charge — the
/// shot is dramatic enough that walking off after a single hit would
/// be anticlimactic, but full piercing (like RAIL_DRIVER's 99) would
/// trivialize TITAN convoys. Two is a deliberate middle ground.
pub const CHARGE_PIERCING: u8 = 2;

/// Distance from `ship.x/ship.y` along `ship.angle` at which the bullet
/// is spawned. Roughly the visible ship-nose offset. Solo's
/// `spawnMuzzleFlare` uses `SHIP_SIZE / 1.5` (~20px for SHIP_SIZE=30).
pub const SHIP_NOSE_OFFSET: f64 = 20.0;

/// One charge-shot spawn descriptor. Wave 2's `power_weapon.rs`
/// dispatcher translates this into a `BulletState` push onto
/// `RoomState.bullets` — exactly like the primary-weapon dispatcher
/// does with `weapon::WeaponBulletSpawn`. Kept as a separate type so
/// the power-weapon path doesn't accidentally pick up primary-weapon
/// adapter logic.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChargeShotSpawn {
    pub origin_x: f64,
    pub origin_y: f64,
    pub angle: f64,
    pub damage: f64,
    pub piercing: u8,
    pub speed_mult: f64,
    pub lifetime_mult: f64,
}

/// Begin / continue / end the CHARGE_SHOT charge cycle. Call once per
/// tick from the room actor with the current frame's power-fire input
/// bit. The module reads `ship.charge_active` to know the prior-frame
/// bit and uses the edge transitions to drive the state machine
/// documented at the top of this file.
///
/// Returns `Some(ChargeShotSpawn)` on the falling edge IFF
/// `charge_progress >= CHARGE_MIN_TICKS`; returns `None` in every
/// other case (rising, held, idle, or below-min release).
///
/// On any return path that ends with `charge_active=false`, the
/// `charge_progress` field is also reset to 0 — there's never a stale
/// progress left over from a prior charge cycle.
pub fn tick_charge(ship: &mut ShipState, power_fire_held: bool) -> Option<ChargeShotSpawn> {
    match (ship.charge_active, power_fire_held) {
        // RISING edge: start a fresh charge cycle.
        (false, true) => {
            ship.charge_active = true;
            ship.charge_progress = 0;
            None
        }
        // HELD: continue charging, saturating at the max.
        (true, true) => {
            if ship.charge_progress < CHARGE_MAX_TICKS {
                ship.charge_progress += 1;
            }
            None
        }
        // FALLING edge: release. Fire iff held long enough.
        (true, false) => {
            let progress = ship.charge_progress;
            // Always reset state — the spec says progress=0 regardless
            // of whether the shot fires.
            ship.charge_active = false;
            ship.charge_progress = 0;
            if progress >= CHARGE_MIN_TICKS {
                Some(build_spawn(ship, progress))
            } else {
                None
            }
        }
        // IDLE: no held, no active — no-op.
        (false, false) => None,
    }
}

/// Build the spawn descriptor at release time. Damage lerps linearly
/// from `CHARGE_BASE_DAMAGE` at `CHARGE_MIN_TICKS` to `CHARGE_MAX_DAMAGE`
/// at `CHARGE_MAX_TICKS`. Spawn position is offset along `ship.angle`
/// by `SHIP_NOSE_OFFSET`.
fn build_spawn(ship: &ShipState, charge_progress: u32) -> ChargeShotSpawn {
    let t = (charge_progress.min(CHARGE_MAX_TICKS) as f64) / (CHARGE_MAX_TICKS as f64);
    let damage = CHARGE_BASE_DAMAGE + (CHARGE_MAX_DAMAGE - CHARGE_BASE_DAMAGE) * t;
    let origin_x = ship.x + cos64(ship.angle) * SHIP_NOSE_OFFSET;
    let origin_y = ship.y + sin64(ship.angle) * SHIP_NOSE_OFFSET;
    ChargeShotSpawn {
        origin_x,
        origin_y,
        angle: ship.angle,
        damage,
        piercing: CHARGE_PIERCING,
        speed_mult: CHARGE_BULLET_SPEED_MULT,
        lifetime_mult: CHARGE_BULLET_LIFETIME_MULT,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a synthetic ship at a known position + angle. All charge
    /// fields default to inactive/zero via `ShipState::default()`.
    fn make_ship(x: f64, y: f64, angle: f64) -> ShipState {
        ShipState {
            x,
            y,
            angle,
            ..ShipState::default()
        }
    }

    #[test]
    fn held_rising_edge_starts_charging() {
        let mut ship = make_ship(100.0, 200.0, 0.0);
        // Prior: not active. Current frame: power-fire held.
        let out = tick_charge(&mut ship, true);
        assert!(out.is_none(), "rising edge must not fire");
        assert!(ship.charge_active, "rising edge sets charge_active=true");
        assert_eq!(ship.charge_progress, 0, "rising edge zeroes progress");
    }

    #[test]
    fn held_continues_charging() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // Tick 1: rising edge.
        assert!(tick_charge(&mut ship, true).is_none());
        assert_eq!(ship.charge_progress, 0);
        // Tick 2..6: held — progress increments by 1 each tick.
        for expected in 1..=5u32 {
            let out = tick_charge(&mut ship, true);
            assert!(out.is_none(), "held state must not fire");
            assert!(ship.charge_active);
            assert_eq!(ship.charge_progress, expected);
        }
    }

    #[test]
    fn charge_progress_saturates_at_max() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // 200 held ticks > CHARGE_MAX_TICKS (180) — progress must cap.
        // First tick is the rising edge (sets progress=0); subsequent
        // 199 ticks are held increments.
        for _ in 0..200 {
            tick_charge(&mut ship, true);
        }
        assert_eq!(
            ship.charge_progress, CHARGE_MAX_TICKS,
            "progress must saturate at CHARGE_MAX_TICKS, got {}",
            ship.charge_progress
        );
        assert!(ship.charge_active);
    }

    #[test]
    fn release_below_min_no_fire() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // Rising edge + 19 held ticks = progress 19 < CHARGE_MIN_TICKS (30).
        for _ in 0..20 {
            tick_charge(&mut ship, true);
        }
        assert_eq!(ship.charge_progress, 19);
        // Falling edge: too-short hold → no fire, reset state.
        let out = tick_charge(&mut ship, false);
        assert!(out.is_none(), "below-min release must not fire");
        assert!(!ship.charge_active, "below-min release resets active");
        assert_eq!(ship.charge_progress, 0, "below-min release resets progress");
    }

    #[test]
    fn release_above_min_fires() {
        let mut ship = make_ship(500.0, 600.0, 0.25);
        // Rising + 60 held ticks = progress 60 >= CHARGE_MIN_TICKS (30).
        for _ in 0..61 {
            tick_charge(&mut ship, true);
        }
        assert_eq!(ship.charge_progress, 60);
        let out = tick_charge(&mut ship, false);
        assert!(out.is_some(), "above-min release must fire");
        let spawn = out.unwrap();
        // Sanity: damage is between base and max (60/180 of the way up).
        assert!(spawn.damage > CHARGE_BASE_DAMAGE);
        assert!(spawn.damage < CHARGE_MAX_DAMAGE);
    }

    #[test]
    fn release_damage_scales_with_charge() {
        // Min-charge release should produce damage ≈ CHARGE_BASE_DAMAGE.
        {
            let mut ship = make_ship(0.0, 0.0, 0.0);
            // Rising + 29 held = progress 29, then one more held = 30 (== MIN).
            for _ in 0..31 {
                tick_charge(&mut ship, true);
            }
            assert_eq!(ship.charge_progress, 30);
            let s = tick_charge(&mut ship, false).expect("must fire at MIN");
            let expected = CHARGE_BASE_DAMAGE
                + (CHARGE_MAX_DAMAGE - CHARGE_BASE_DAMAGE) * (30.0 / CHARGE_MAX_TICKS as f64);
            assert!(
                (s.damage - expected).abs() < 1e-9,
                "min-charge damage {} != expected {}",
                s.damage,
                expected
            );
            // Sanity vs base: at min charge we're already a small step
            // above CHARGE_BASE_DAMAGE (because t > 0), but well below max.
            assert!(s.damage >= CHARGE_BASE_DAMAGE);
            assert!(s.damage < CHARGE_MAX_DAMAGE);
        }
        // Max-charge release should produce damage == CHARGE_MAX_DAMAGE.
        {
            let mut ship = make_ship(0.0, 0.0, 0.0);
            for _ in 0..(CHARGE_MAX_TICKS as usize + 50) {
                tick_charge(&mut ship, true);
            }
            assert_eq!(ship.charge_progress, CHARGE_MAX_TICKS);
            let s = tick_charge(&mut ship, false).expect("must fire at MAX");
            assert!(
                (s.damage - CHARGE_MAX_DAMAGE).abs() < 1e-9,
                "max-charge damage {} != CHARGE_MAX_DAMAGE {}",
                s.damage,
                CHARGE_MAX_DAMAGE
            );
        }
    }

    #[test]
    fn release_resets_charge_progress() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        for _ in 0..50 {
            tick_charge(&mut ship, true);
        }
        let _ = tick_charge(&mut ship, false).expect("must fire");
        assert!(!ship.charge_active, "release clears charge_active");
        assert_eq!(ship.charge_progress, 0, "release clears charge_progress");
    }

    #[test]
    fn spawn_angle_matches_ship_angle() {
        let mut ship = make_ship(0.0, 0.0, 1.2345);
        for _ in 0..50 {
            tick_charge(&mut ship, true);
        }
        let s = tick_charge(&mut ship, false).unwrap();
        // The shot is fired along ship.angle exactly — no jitter, no fan.
        assert_eq!(s.angle, 1.2345);
    }

    #[test]
    fn spawn_position_is_in_front_of_ship() {
        // Angle 0 → +x direction → origin_x > ship.x, origin_y ≈ ship.y.
        let mut ship = make_ship(100.0, 200.0, 0.0);
        for _ in 0..50 {
            tick_charge(&mut ship, true);
        }
        let s = tick_charge(&mut ship, false).unwrap();
        assert!(
            s.origin_x > 100.0,
            "spawn must be in front of ship along +x; got origin_x={}",
            s.origin_x
        );
        // cos64(0) ≈ 1, sin64(0) ≈ 0 (within ~3e-5 polynomial error).
        assert!(
            (s.origin_x - (100.0 + SHIP_NOSE_OFFSET)).abs() < 1e-2,
            "origin_x {} != 100 + SHIP_NOSE_OFFSET",
            s.origin_x
        );
        assert!(
            (s.origin_y - 200.0).abs() < 1e-2,
            "origin_y {} != ship.y",
            s.origin_y
        );
    }

    #[test]
    fn idle_state_no_op() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // Not held, not active — calling tick_charge must be a no-op.
        for _ in 0..10 {
            let out = tick_charge(&mut ship, false);
            assert!(out.is_none(), "idle state must not fire");
            assert!(!ship.charge_active, "idle stays inactive");
            assert_eq!(ship.charge_progress, 0, "idle stays at zero");
        }
    }

    #[test]
    fn held_falling_edge_below_min_returns_none_but_resets() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // Rising edge, then a few held ticks → progress < MIN.
        tick_charge(&mut ship, true); // rising → progress=0
        tick_charge(&mut ship, true); // held → progress=1
        tick_charge(&mut ship, true); // held → progress=2
        assert_eq!(ship.charge_progress, 2);
        // Falling edge below MIN: no fire, full reset.
        let out = tick_charge(&mut ship, false);
        assert!(out.is_none());
        assert!(!ship.charge_active);
        assert_eq!(ship.charge_progress, 0);
    }

    #[test]
    fn damage_lerp_is_monotonic() {
        // For two release progress values A < B (both >= MIN), the
        // returned damage at B must exceed the damage at A.
        let release_at = |progress: u32| -> f64 {
            let mut ship = make_ship(0.0, 0.0, 0.0);
            // Rising edge sets progress=0, then `progress` held ticks.
            tick_charge(&mut ship, true);
            for _ in 0..progress {
                tick_charge(&mut ship, true);
            }
            assert_eq!(ship.charge_progress, progress);
            tick_charge(&mut ship, false).expect("must fire").damage
        };
        let dmg_a = release_at(30);
        let dmg_b = release_at(90);
        let dmg_c = release_at(180);
        assert!(
            dmg_a < dmg_b,
            "damage at 30 ticks ({}) must be < damage at 90 ticks ({})",
            dmg_a, dmg_b
        );
        assert!(
            dmg_b < dmg_c,
            "damage at 90 ticks ({}) must be < damage at 180 ticks ({})",
            dmg_b, dmg_c
        );
    }

    #[test]
    fn full_cycle_then_recharge_works() {
        // After a successful release, the ship must be ready to start a
        // brand-new charge cycle from clean state on the next rising edge.
        let mut ship = make_ship(0.0, 0.0, 0.0);
        for _ in 0..50 {
            tick_charge(&mut ship, true);
        }
        let _ = tick_charge(&mut ship, false).expect("first shot fires");
        // Now start a new cycle.
        tick_charge(&mut ship, true); // rising
        assert!(ship.charge_active);
        assert_eq!(ship.charge_progress, 0);
        for _ in 0..40 {
            tick_charge(&mut ship, true);
        }
        assert_eq!(ship.charge_progress, 40);
        let s2 = tick_charge(&mut ship, false).expect("second shot fires");
        assert!(s2.damage > CHARGE_BASE_DAMAGE);
    }

    #[test]
    fn spawn_carries_weapon_constants() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        for _ in 0..(CHARGE_MAX_TICKS as usize + 1) {
            tick_charge(&mut ship, true);
        }
        let s = tick_charge(&mut ship, false).unwrap();
        assert_eq!(s.piercing, CHARGE_PIERCING);
        assert_eq!(s.speed_mult, CHARGE_BULLET_SPEED_MULT);
        assert_eq!(s.lifetime_mult, CHARGE_BULLET_LIFETIME_MULT);
    }
}
