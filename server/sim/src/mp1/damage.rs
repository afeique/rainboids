//! Phase-3 damage + downed-state + Diablo-style revive.
//!
//! Authored fresh 2026-05-17 from `js/modules/player/lifecycle.js`
//! (HP damage application) + the Phase-3 plan's "Architecture
//! Revision" section (energy tanks + revive, no respawn).
//!
//! ## Damage model
//!
//! Plain HP pool. Ship takes damage; at HP <= 0 it transitions to
//! `downed = true` (NOT removed). Downed ships are invulnerable,
//! immobile, and revivable.
//!
//! ## Revive model (Diablo-style)
//!
//! Any alive ship within `REVIVE_RADIUS` of a downed ship fills
//! the downed ship's `revive_meter` at `REVIVE_FILL_PER_TICK` per
//! tick. If no eligible reviver is in range, the meter drains at
//! `REVIVE_DRAIN_PER_TICK` per tick (faster than fill -- leaving
//! the radius is costly).
//!
//! When `revive_meter >= REVIVE_FILL_FULL`, the ship revives:
//! `downed = false`, `hp = REVIVE_HP_FRACTION * max_hp`,
//! `revive_meter = 0.0`. An event is emitted by the caller
//! (collision.rs / room.rs); this module's only output is the
//! outcome enum returned by `tick_revive_meter`.
//!
//! ## Game over
//!
//! When ALL active ships in the room are downed, the room signals
//! game-over (caller checks via `all_downed`). Phase 3 doesn't
//! handle the post-game-over lifecycle; the room actor decides
//! whether to reset, close, or wait for a reconnect (Phase 5
//! polish).

/// Distance within which a live ship triggers revive-meter fill on
/// a downed ship.
pub const REVIVE_RADIUS: f64 = 80.0;

/// Revive meter capacity in tick-equivalent units (180 ticks = 3.0 s at 60 Hz).
pub const REVIVE_FILL_FULL: f64 = 180.0;

/// Per-tick fill rate while a reviver is in radius.
pub const REVIVE_FILL_PER_TICK: f64 = 1.0;

/// Per-tick drain rate while no reviver is in radius (2x fill rate).
pub const REVIVE_DRAIN_PER_TICK: f64 = 2.0;

/// Fraction of `max_hp` a ship revives with.
pub const REVIVE_HP_FRACTION: f64 = 0.5;

/// Outcome returned by `apply_damage` so the caller can emit the appropriate event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DamageOutcome {
    /// Damage absorbed, ship still alive.
    Damaged,
    /// Damage took the ship to <= 0 HP this tick; caller emits ShipDowned.
    JustDowned,
    /// Damage skipped (ship was already downed or inactive, or amount <= 0).
    NoOp,
}

/// Apply damage to a ship; mutates `ship` in place and returns the outcome.
pub fn apply_damage(ship: &mut ShipState, amount: f64) -> DamageOutcome {
    if !ship.active || ship.downed || amount <= 0.0 {
        return DamageOutcome::NoOp;
    }
    ship.hp -= amount;
    if ship.hp <= 0.0 {
        ship.hp = 0.0;
        ship.downed = true;
        ship.vx = 0.0;
        ship.vy = 0.0;
        ship.revive_meter = 0.0;
        DamageOutcome::JustDowned
    } else {
        DamageOutcome::Damaged
    }
}

/// Outcome of one revive-meter tick on one downed ship.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviveOutcome {
    /// Ship is not downed (or not active); skip.
    NotApplicable,
    /// Meter filled this tick (a reviver was in range).
    Filling,
    /// Meter drained this tick (no reviver in range, meter > 0).
    Draining,
    /// Meter idle (no reviver, meter already at 0).
    Idle,
    /// Meter hit full this tick; caller should call `revive_ship` and emit ShipRevived.
    JustRevived,
}

/// Advance the revive meter for one downed ship by one tick.
pub fn tick_revive_meter(ship: &mut ShipState, eligible_revivers: usize) -> ReviveOutcome {
    if !ship.active || !ship.downed {
        return ReviveOutcome::NotApplicable;
    }
    if eligible_revivers > 0 {
        ship.revive_meter += REVIVE_FILL_PER_TICK;
        if ship.revive_meter >= REVIVE_FILL_FULL {
            return ReviveOutcome::JustRevived;
        }
        ReviveOutcome::Filling
    } else if ship.revive_meter > 0.0 {
        ship.revive_meter -= REVIVE_DRAIN_PER_TICK;
        if ship.revive_meter < 0.0 {
            ship.revive_meter = 0.0;
        }
        ReviveOutcome::Draining
    } else {
        ReviveOutcome::Idle
    }
}

/// Transition a ship from downed to alive (called when `tick_revive_meter` returns `JustRevived`).
pub fn revive_ship(ship: &mut ShipState) {
    ship.downed = false;
    ship.hp = (ship.max_hp * REVIVE_HP_FRACTION).max(1.0);
    ship.revive_meter = 0.0;
}

/// Count eligible revivers (alive, non-downed, within REVIVE_RADIUS) for a downed ship.
pub fn count_eligible_revivers(
    downed_x: f64,
    downed_y: f64,
    others: &[(f64, f64, bool, bool)], // (x, y, active, downed)
) -> usize {
    let r2 = REVIVE_RADIUS * REVIVE_RADIUS;
    let mut count = 0;
    for &(ox, oy, active, downed) in others {
        if !active || downed {
            continue;
        }
        let dx = ox - downed_x;
        let dy = oy - downed_y;
        if dx * dx + dy * dy <= r2 {
            count += 1;
        }
    }
    count
}

/// Returns true iff at least one ship is active AND every active ship is downed.
pub fn all_downed(ships: &[(bool, bool)]) -> bool {
    // ships: slice of (active, downed) for each ship in the room.
    let active_count = ships.iter().filter(|(a, _)| *a).count();
    if active_count == 0 {
        return false;
    }
    ships.iter().all(|(a, d)| !*a || *d)
}

// Phase-3 Wave 2 (mp 0.3.4) — state.rs now owns the canonical
// `ShipState` with `downed` + `revive_meter` fields. Re-exported
// here so downstream callers can still write `use super::damage::ShipState`
// for ergonomic cross-module use; the type identity is `super::state::ShipState`.
pub use super::state::ShipState;

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ship(hp: f64, max_hp: f64) -> ShipState {
        ShipState {
            player_id: 1,
            x: 0.0,
            y: 0.0,
            vx: 1.5,
            vy: -2.0,
            angle: 0.0,
            hp,
            max_hp,
            radius: 14.0,
            active: true,
            downed: false,
            revive_meter: 0.0,
            weapon_kind: 0,
        }
    }

    #[test]
    fn damage_to_zero_marks_downed() {
        let mut s = make_ship(5.0, 100.0);
        let outcome = apply_damage(&mut s, 10.0);
        assert_eq!(outcome, DamageOutcome::JustDowned);
        assert_eq!(s.hp, 0.0);
        assert!(s.downed);
        assert_eq!(s.vx, 0.0);
        assert_eq!(s.vy, 0.0);
    }

    #[test]
    fn damage_to_partial_stays_alive() {
        let mut s = make_ship(10.0, 100.0);
        let outcome = apply_damage(&mut s, 3.0);
        assert_eq!(outcome, DamageOutcome::Damaged);
        assert_eq!(s.hp, 7.0);
        assert!(!s.downed);
    }

    #[test]
    fn damage_to_downed_ship_is_noop() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        let snapshot = s;
        let outcome = apply_damage(&mut s, 100.0);
        assert_eq!(outcome, DamageOutcome::NoOp);
        assert_eq!(s.hp, snapshot.hp);
        assert_eq!(s.downed, snapshot.downed);
        assert_eq!(s.revive_meter, snapshot.revive_meter);
    }

    #[test]
    fn tick_revive_with_reviver_fills() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        let outcome = tick_revive_meter(&mut s, 1);
        assert_eq!(outcome, ReviveOutcome::Filling);
        assert_eq!(s.revive_meter, REVIVE_FILL_PER_TICK);
    }

    #[test]
    fn tick_revive_no_reviver_drains() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        s.revive_meter = 50.0;
        let outcome = tick_revive_meter(&mut s, 0);
        assert_eq!(outcome, ReviveOutcome::Draining);
        assert_eq!(s.revive_meter, 48.0);
    }

    #[test]
    fn tick_revive_no_reviver_at_zero_idle() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        s.revive_meter = 0.0;
        let outcome = tick_revive_meter(&mut s, 0);
        assert_eq!(outcome, ReviveOutcome::Idle);
        assert_eq!(s.revive_meter, 0.0);
    }

    #[test]
    fn tick_revive_meter_at_full_returns_just_revived() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        s.revive_meter = REVIVE_FILL_FULL - 0.5;
        let outcome = tick_revive_meter(&mut s, 1);
        assert_eq!(outcome, ReviveOutcome::JustRevived);
        assert!(s.revive_meter >= REVIVE_FILL_FULL);
    }

    #[test]
    fn revive_ship_resets_state() {
        let mut s = make_ship(0.0, 100.0);
        s.downed = true;
        s.revive_meter = REVIVE_FILL_FULL;
        revive_ship(&mut s);
        assert!(!s.downed);
        assert_eq!(s.hp, 0.5 * 100.0);
        assert_eq!(s.revive_meter, 0.0);
    }

    #[test]
    fn count_eligible_revivers_distance_check() {
        let others = [
            (100.0, 0.0, true, false), // distance 100 > radius 80 -> out
            (60.0, 0.0, true, false),  // distance 60 -> in
            (200.0, 0.0, true, false), // out
        ];
        let count = count_eligible_revivers(0.0, 0.0, &others);
        assert_eq!(count, 1);
    }

    #[test]
    fn count_eligible_revivers_filters_dead_and_downed() {
        let others = [
            (20.0, 0.0, false, false), // inactive
            (30.0, 0.0, true, true),   // downed
        ];
        let count = count_eligible_revivers(0.0, 0.0, &others);
        assert_eq!(count, 0);
    }

    #[test]
    fn all_downed_empty_room_returns_false() {
        let ships: [(bool, bool); 0] = [];
        assert!(!all_downed(&ships));
    }

    #[test]
    fn all_downed_mixed_returns_false() {
        let ships = [(true, false), (true, true)];
        assert!(!all_downed(&ships));
    }

    #[test]
    fn all_downed_all_inactive_returns_false() {
        let ships = [(false, false), (false, false), (false, false)];
        assert!(!all_downed(&ships));
    }

    #[test]
    fn all_downed_all_downed_returns_true() {
        let ships = [(true, true), (true, true), (true, true)];
        assert!(all_downed(&ships));
    }
}
