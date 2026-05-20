//! Phase 4 step 6 MINE_LAYER (Seeker Mines) power weapon — 2026-05-19.
//!
//! Mirrors solo's `weapon-data.js` POWER_WEAPONS.MINE_LAYER entry:
//!   `cooldown: 4000` ms, `maxMines: 3`, `mineRadius: 60`,
//!   `blastRadius: 80`, `mineDamage: 3`.
//!
//! Solo sources studied:
//! - `js/modules/combat/weapon-data.js` MINE_LAYER block
//! - `js/modules/combat/power-weapon-controller.js` (placement + cap gate)
//! - `js/modules/world/player-mine.js` (entity behavior — sibling module
//!   `player_mine.rs` mirrors this for MP)
//!
//! ## Activation model
//!
//! MINE_LAYER is a cooldown-gated power weapon. Each activation drops a
//! single mine at the player's current position. Pure deterministic —
//! no RNG, no spread, no aim direction. The mine is owner-tagged so
//! sibling mines can be filtered out of seeker targeting later.
//!
//! ## Caller responsibilities (Wave 2 dispatcher in `room.rs`)
//!
//! This module does NOT touch `RoomState`. It only produces a
//! `MineLayerSpawn` descriptor. The dispatcher is responsible for:
//! - Gating the activation on the player's cooldown
//!   (`current_tick >= ship.power_weapon_cooldown_tick`).
//! - Counting the player's currently-active mines on the field by
//!   filtering `room.player_mines` for `owner_player_id == ship.player_id`
//!   and `!dead()`, and passing that count as `active_mine_count`.
//! - Calling `player_mine::spawn_default(id, owner_player_id, x, y)` to
//!   construct the `PlayerMineState` from this descriptor + the room's
//!   next entity id.
//! - Pushing the constructed `PlayerMineState` onto `room.player_mines`
//!   and resetting `ship.power_weapon_cooldown_tick`.
//!
//! ## MVP simplifications (deferred to Phase 5+ upgrades)
//!
//! All of the following solo upgrades are intentionally NOT modeled
//! here. They will arrive with the Phase 5+ upgrade pipeline:
//! - `EXTRA_PAYLOAD`     — +1 max mine per stack (cap stays at 3 here).
//! - `BLAST_RADIUS`      — +30 px blast / +20 px trigger.
//! - `DAISY_CHAIN`       — chain detonations between nearby mines.
//! - `RAPID_DEPLOY`      — -25% cooldown per stack.
//! - `MINE_SHIELD_RADIUS`— per-mine shield around armed mines.
//! - `MINE_MISSILES`     — armed mines fire homing missiles.

use crate::state::ShipState;

/// Dense u8 discriminator for the MINE_LAYER power weapon — matches
/// the `power_weapon_kind` enumeration documented in `state.rs` on the
/// `ShipState` field (0=CHARGE_SHOT, 1=MINE_LAYER, 2=NOVA_BLAST, ...).
pub const KIND_MINE_LAYER: u8 = 1;

/// Cooldown between successive mine placements, in sim ticks. Solo's
/// `cooldown: 4000` ms ÷ (1000 / 60 ≈ 16.6667 ms/tick) = 240 ticks
/// exactly at the canonical 60 Hz sim rate.
pub const MINE_LAYER_COOLDOWN_TICKS: u32 = 240;

/// Hard cap on active mines per player (base, no upgrades). Mirrors
/// solo's `maxMines: 3`. EXTRA_PAYLOAD bumps this in Phase 5+; for the
/// Phase 4 MVP we hold the line at 3.
pub const MINE_LAYER_MAX_MINES_PER_PLAYER: u8 = 3;

/// Descriptor for one mine to spawn this activation. Intermediate type
/// so Wave 1 doesn't need to depend on future `PlayerMineState` shape
/// changes — the Wave 2 dispatcher handles the conversion by calling
/// `player_mine::spawn_default(id, owner_player_id, x, y)`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MineLayerSpawn {
    /// Player who owns this mine. Used by the dispatcher to id the
    /// spawned `PlayerMineState`'s `owner_player_id`, and later by
    /// seeker-targeting logic to skip the player's own ship.
    pub owner_player_id: u32,
    /// World x at the moment of placement (= ship.x).
    pub x: f64,
    /// World y at the moment of placement (= ship.y).
    pub y: f64,
}

/// Activate the mine layer once. The caller (Wave 2 dispatcher) has
/// already gated on cooldown; this function performs the cap check and
/// returns the spawn descriptor on success.
///
/// Returns `None` when the player is already at the per-player cap
/// (`active_mine_count >= MINE_LAYER_MAX_MINES_PER_PLAYER`). The caller
/// can still tick the cooldown in the None branch to prevent input
/// spam — that's a dispatcher policy choice, not this module's.
///
/// Pure deterministic — no RNG, no side effects, no mutation of
/// `ship`.
pub fn activate(ship: &ShipState, active_mine_count: u8) -> Option<MineLayerSpawn> {
    if active_mine_count >= MINE_LAYER_MAX_MINES_PER_PLAYER {
        return None;
    }
    Some(MineLayerSpawn {
        owner_player_id: ship.player_id,
        x: ship.x,
        y: ship.y,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ShipState;

    /// Build a synthetic ship at a known position with a specific
    /// player_id. All other fields take `ShipState::default()` values.
    fn make_ship(player_id: u32, x: f64, y: f64) -> ShipState {
        ShipState {
            player_id,
            x,
            y,
            ..ShipState::default()
        }
    }

    #[test]
    fn activate_at_ship_position() {
        let ship = make_ship(7, 123.5, 456.75);
        let spawn = activate(&ship, 0).expect("expected Some at 0 active mines");
        assert_eq!(spawn.x, ship.x);
        assert_eq!(spawn.y, ship.y);
        assert_eq!(spawn.owner_player_id, ship.player_id);
    }

    #[test]
    fn activate_returns_none_when_at_cap() {
        let ship = make_ship(1, 0.0, 0.0);
        let spawn = activate(&ship, MINE_LAYER_MAX_MINES_PER_PLAYER);
        assert!(
            spawn.is_none(),
            "activate must refuse when active_mine_count == cap"
        );
    }

    #[test]
    fn activate_returns_none_when_above_cap() {
        // Defensive: if the dispatcher ever passes a count over the cap
        // (shouldn't happen, but cheap to handle), we still refuse.
        let ship = make_ship(1, 0.0, 0.0);
        let spawn = activate(&ship, MINE_LAYER_MAX_MINES_PER_PLAYER + 5);
        assert!(spawn.is_none());
    }

    #[test]
    fn activate_succeeds_when_below_cap() {
        let ship = make_ship(2, 10.0, 20.0);
        for active in 0..MINE_LAYER_MAX_MINES_PER_PLAYER {
            let spawn = activate(&ship, active);
            assert!(
                spawn.is_some(),
                "expected Some when active_mine_count={active} < cap"
            );
        }
    }

    #[test]
    fn activate_succeeds_at_cap_minus_one() {
        let ship = make_ship(3, 50.0, 60.0);
        let spawn = activate(&ship, MINE_LAYER_MAX_MINES_PER_PLAYER - 1);
        let s = spawn.expect("cap - 1 must still allow one more mine");
        assert_eq!(s.owner_player_id, 3);
        assert_eq!(s.x, 50.0);
        assert_eq!(s.y, 60.0);
    }

    #[test]
    fn cooldown_const_matches_solo() {
        // Solo's MINE_LAYER cooldown is 4000 ms. At the sim's 60 Hz
        // tick rate (1000 / 60 ≈ 16.6667 ms per tick), 4000 / 16.6667
        // ≈ 240.0 ticks. We hold the constant at exactly 240.
        let solo_ms = 4000.0_f64;
        let ms_per_tick = 1000.0_f64 / 60.0_f64;
        let expected = (solo_ms / ms_per_tick).round() as u32;
        assert_eq!(expected, 240);
        assert_eq!(MINE_LAYER_COOLDOWN_TICKS, 240);
    }

    #[test]
    fn max_mines_const_is_3() {
        // Solo's `maxMines: 3` — base cap. Locked here for Phase 4
        // MVP; EXTRA_PAYLOAD adds to this in Phase 5+.
        assert_eq!(MINE_LAYER_MAX_MINES_PER_PLAYER, 3);
    }

    #[test]
    fn consts_are_sensible() {
        // Sanity: cooldown is a positive sub-second-multiple value,
        // cap is non-zero, kind discriminator matches the documented
        // `ShipState::power_weapon_kind` enumeration.
        assert!(MINE_LAYER_COOLDOWN_TICKS > 0);
        assert!(MINE_LAYER_COOLDOWN_TICKS < 60 * 60, "cooldown longer than 60s is implausible");
        assert!(MINE_LAYER_MAX_MINES_PER_PLAYER > 0);
        assert_eq!(KIND_MINE_LAYER, 1);
    }

    #[test]
    fn activate_doesnt_mutate_ship() {
        // The function takes `&ShipState`, so by the type system it
        // can't mutate. Make the invariant observable too: snapshot
        // the readable fields, activate, compare. Belt-and-braces
        // against a future refactor that might pass `&mut` or copy
        // back internally.
        let ship_before = make_ship(11, 99.0, 88.0);
        let snapshot = ship_before;
        let _ = activate(&ship_before, 0);
        let _ = activate(&ship_before, MINE_LAYER_MAX_MINES_PER_PLAYER);
        assert_eq!(ship_before.player_id, snapshot.player_id);
        assert_eq!(ship_before.x.to_bits(), snapshot.x.to_bits());
        assert_eq!(ship_before.y.to_bits(), snapshot.y.to_bits());
        assert_eq!(ship_before.angle.to_bits(), snapshot.angle.to_bits());
        assert_eq!(ship_before.hp.to_bits(), snapshot.hp.to_bits());
    }
}
