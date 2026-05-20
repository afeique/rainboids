//! Phase 4 step 6 — MISSILE_SALVO power weapon (2026-05-19).
//!
//! Fires a fan of homing missiles when activated. Cooldown-gated; no
//! charge / no RNG / no jitter — the spread is a pure deterministic
//! distribution around `ship.angle`.
//!
//! Mirrors solo's `MISSILE_SALVO` block in
//! `js/modules/combat/weapon-data.js` and the `fireMissiles` helper in
//! `js/modules/player/weapons.js`. Solo authors per-slot launch
//! positions across the ship's wings + per-slot homing target
//! pre-assignment; this MVP keeps the geometry simple — all missiles
//! launch from `ship.{x,y}` and acquire targets in-flight via the
//! homing pipeline owned by `player_missile.rs`. Wing-launch + target
//! pre-assignment can be reintroduced once the cosmetic / latency
//! tradeoff has been measured.
//!
//! MVP simplifications (deferred to a later step):
//! - `EXTRA_ORDNANCE` (+1 missile per stack) — count is fixed at 3
//! - `CLUSTER_WARHEAD` (on-impact split into 3) — not modeled
//! - `QUICK_RELOAD` (-2s cooldown per stack) — cooldown is fixed
//! - per-slot distinct-target pre-assignment — handled in-flight
//! - wing-offset launch positions — all spawns at ship origin
//!
//! Spread distribution formula (defends both odd + even counts):
//!   For `n = MISSILE_SALVO_COUNT`, slot `i ∈ 0..n` maps to:
//!     slot_offset(i) = i - (n - 1) / 2          // -1, 0, +1 for n=3
//!     step           = SPREAD / (n - 1)          // total / gaps
//!     angle(i)       = ship.angle + slot_offset(i) * step
//!   For odd n the middle missile has slot_offset = 0 → angle =
//!   ship.angle (centerline). For even n no missile sits on the
//!   centerline (slot_offset(i) takes half-integer values
//!   ±0.5, ±1.5, …) and outer missiles land at ±SPREAD/2.
//!
//! The actual `PlayerMissileState` construction + id assignment +
//! push into `RoomState.player_missiles` + event emission happens in
//! `room.rs` Wave 2 integration — this module only returns the
//! per-missile spawn parameters.

use crate::state::ShipState;

/// Dense u8 discriminator for the power-weapon enum. Matches
/// `state.rs::ShipState::power_weapon_kind` doc comment:
/// `3 = MISSILE_SALVO`.
pub const KIND_MISSILE_SALVO: u8 = 3;

/// Cooldown between activations in sim ticks. Solo's
/// `cooldown: 10000` ms ÷ (1000 / 60) = 600 ticks @ 60 Hz.
pub const MISSILE_SALVO_COOLDOWN_TICKS: u32 = 600;

/// Base missile count per activation. Solo's `missileCount: 3`.
/// `EXTRA_ORDNANCE` would add +1 per stack — deferred for the MVP.
pub const MISSILE_SALVO_COUNT: u8 = 3;

/// Total spread (radians) from the first missile to the last. With 3
/// missiles spaced evenly this gives ~12.9° / step and ~25.8° total
/// — tight enough to converge on a single target at medium range,
/// wide enough to fan out and acquire distinct nearby threats. Solo's
/// `weapons.js` uses `slot * 0.5` per slot (1.0 rad total for 3
/// missiles) but that's tuned for the wing-offset launch geometry;
/// the sim's center-origin launch reads better with a tighter cone.
pub const MISSILE_SALVO_SPREAD_RADIANS: f64 = 0.45;

/// One missile to spawn this activation. The Wave 2 dispatcher in
/// `room.rs::process_power_fire_inputs` iterates these and calls
/// `player_missile::spawn_default(id, owner_player_id, origin_x,
/// origin_y, initial_angle)` for each, then pushes the result onto
/// `room.player_missiles` and emits one
/// `EventPayload::PlayerMissileSpawn` per missile. The dispatcher
/// also owns the cooldown gate (`current_tick >=
/// ship.power_weapon_cooldown_tick`) + sequential id assignment from
/// `room.next_player_missile_id` + `MAX_PLAYER_MISSILES` budget
/// enforcement.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MissileSalvoSpawn {
    pub owner_player_id: u32,
    pub origin_x: f64,
    pub origin_y: f64,
    pub angle: f64,
}

/// Activate the missile salvo. Returns `MISSILE_SALVO_COUNT` spawn
/// descriptors fanned around `ship.angle`. Pure deterministic — no
/// RNG, no time dependence, no I/O. Same `ShipState` in → bit-exact
/// same `Vec` out.
///
/// Caller (Wave 2 integration) is responsible for:
/// - gating against the cooldown
///   (`current_tick >= ship.power_weapon_cooldown_tick`)
/// - assigning sequential missile ids from `room.next_player_missile_id`
/// - constructing each `PlayerMissileState` via
///   `player_missile::spawn_default(id, owner, x, y, angle)` and
///   pushing onto `room.player_missiles`
/// - enforcing the `MAX_PLAYER_MISSILES` budget (truncate / drop oldest)
/// - emitting one `EventPayload::PlayerMissileSpawn` per missile
/// - setting `ship.power_weapon_cooldown_tick = current_tick +
///   MISSILE_SALVO_COOLDOWN_TICKS`
pub fn activate(ship: &ShipState) -> Vec<MissileSalvoSpawn> {
    let count = MISSILE_SALVO_COUNT as usize;
    let mut out = Vec::with_capacity(count);

    // Single missile would have nowhere to fan — emit it on the
    // centerline. (Not reachable while MISSILE_SALVO_COUNT == 3, but
    // defends the formula if EXTRA_ORDNANCE-style counts ever change.)
    if count <= 1 {
        if count == 1 {
            out.push(MissileSalvoSpawn {
                owner_player_id: ship.player_id,
                origin_x: ship.x,
                origin_y: ship.y,
                angle: ship.angle,
            });
        }
        return out;
    }

    // n ≥ 2: distribute evenly across the full spread.
    //   slot_offset(i) = i - (n - 1) / 2   // integer for odd n,
    //                                      // half-integer for even n
    //   step           = SPREAD / (n - 1)
    //   angle(i)       = ship.angle + slot_offset(i) * step
    let n = count as f64;
    let step = MISSILE_SALVO_SPREAD_RADIANS / (n - 1.0);
    let center_offset = (n - 1.0) * 0.5;
    for i in 0..count {
        let slot_offset = i as f64 - center_offset;
        let angle = ship.angle + slot_offset * step;
        out.push(MissileSalvoSpawn {
            owner_player_id: ship.player_id,
            origin_x: ship.x,
            origin_y: ship.y,
            angle,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ShipState;

    /// Build a synthetic ship at a known position + angle with a
    /// known player_id. Other fields default — the activator only
    /// reads `player_id`, `x`, `y`, `angle`.
    fn make_ship(player_id: u32, x: f64, y: f64, angle: f64) -> ShipState {
        ShipState {
            player_id,
            x,
            y,
            angle,
            ..ShipState::default()
        }
    }

    #[test]
    fn activate_returns_count_missiles() {
        let ship = make_ship(7, 100.0, 200.0, 0.0);
        let spawns = activate(&ship);
        assert_eq!(spawns.len(), MISSILE_SALVO_COUNT as usize);
        assert_eq!(spawns.len(), 3);
    }

    #[test]
    fn activate_center_missile_on_ship_angle() {
        // MISSILE_SALVO_COUNT is odd (3) — the middle slot lands on
        // ship.angle exactly.
        let ship_angle = 1.234_f64;
        let ship = make_ship(1, 0.0, 0.0, ship_angle);
        let spawns = activate(&ship);
        let middle = spawns.len() / 2;
        assert_eq!(
            spawns[middle].angle.to_bits(),
            ship_angle.to_bits(),
            "middle missile angle must bit-exactly equal ship.angle for odd count"
        );
    }

    #[test]
    fn activate_outer_missiles_offset_by_half_spread() {
        let ship_angle = 0.5_f64;
        let ship = make_ship(1, 0.0, 0.0, ship_angle);
        let spawns = activate(&ship);
        let half = MISSILE_SALVO_SPREAD_RADIANS * 0.5;
        let first = spawns.first().unwrap().angle;
        let last = spawns.last().unwrap().angle;
        // First missile at -half, last at +half (tolerance for f64
        // rounding through the slot-offset multiplication).
        assert!(
            (first - (ship_angle - half)).abs() < 1e-12,
            "first missile angle {first} not at ship.angle - half_spread ({})",
            ship_angle - half
        );
        assert!(
            (last - (ship_angle + half)).abs() < 1e-12,
            "last missile angle {last} not at ship.angle + half_spread ({})",
            ship_angle + half
        );
    }

    #[test]
    fn activate_evenly_distributed() {
        // Consecutive missile angles must differ by exactly
        // SPREAD / (COUNT - 1). Each gap should match within f64
        // tolerance.
        let ship = make_ship(1, 0.0, 0.0, 0.0);
        let spawns = activate(&ship);
        let n = MISSILE_SALVO_COUNT as f64;
        let expected_step = MISSILE_SALVO_SPREAD_RADIANS / (n - 1.0);
        for w in spawns.windows(2) {
            let gap = w[1].angle - w[0].angle;
            assert!(
                (gap - expected_step).abs() < 1e-12,
                "consecutive missile gap {gap} != expected step {expected_step}"
            );
        }
    }

    #[test]
    fn activate_assigns_owner_to_all() {
        let owner = 42u32;
        let ship = make_ship(owner, 0.0, 0.0, 0.0);
        let spawns = activate(&ship);
        for (i, s) in spawns.iter().enumerate() {
            assert_eq!(
                s.owner_player_id, owner,
                "spawn[{i}] owner_player_id mismatch: got {}, want {owner}",
                s.owner_player_id
            );
        }
    }

    #[test]
    fn activate_assigns_origin_to_all() {
        let (x, y) = (123.5_f64, 456.75_f64);
        let ship = make_ship(1, x, y, 0.3);
        let spawns = activate(&ship);
        for (i, s) in spawns.iter().enumerate() {
            assert_eq!(s.origin_x.to_bits(), x.to_bits(), "spawn[{i}] origin_x");
            assert_eq!(s.origin_y.to_bits(), y.to_bits(), "spawn[{i}] origin_y");
        }
    }

    #[test]
    fn cooldown_const_matches_solo() {
        // Solo: cooldown 10000 ms @ 60 Hz = 10000 / (1000 / 60) = 600
        // ticks. Hard-coded so this test fails loudly if the constant
        // drifts away from the solo source.
        assert_eq!(MISSILE_SALVO_COOLDOWN_TICKS, 600);
    }

    #[test]
    fn count_const_is_3() {
        assert_eq!(MISSILE_SALVO_COUNT, 3);
    }

    #[test]
    fn consts_sensible() {
        // Discriminator matches the documented power_weapon_kind layout
        // in state.rs.
        assert_eq!(KIND_MISSILE_SALVO, 3);
        // Spread is positive and below a full circle / not absurd.
        assert!(MISSILE_SALVO_SPREAD_RADIANS > 0.0);
        assert!(MISSILE_SALVO_SPREAD_RADIANS < std::f64::consts::PI);
        // Cooldown is non-zero and below ~30s at 60 Hz.
        assert!(MISSILE_SALVO_COOLDOWN_TICKS > 0);
        assert!(MISSILE_SALVO_COOLDOWN_TICKS < 30 * 60);
        // Count is non-zero — at least one missile per activation.
        assert!(MISSILE_SALVO_COUNT >= 1);
    }

    #[test]
    fn activate_is_deterministic() {
        let ship = make_ship(9, 320.0, 240.0, -0.7);
        let a = activate(&ship);
        let b = activate(&ship);
        assert_eq!(a.len(), b.len());
        for i in 0..a.len() {
            // Bit-exact f64 equality — pure function, no RNG, no
            // time dependence.
            assert_eq!(a[i].owner_player_id, b[i].owner_player_id);
            assert_eq!(a[i].origin_x.to_bits(), b[i].origin_x.to_bits());
            assert_eq!(a[i].origin_y.to_bits(), b[i].origin_y.to_bits());
            assert_eq!(a[i].angle.to_bits(), b[i].angle.to_bits());
            assert_eq!(a[i], b[i]);
        }
    }
}
