//! Phase 4 step 6 LIGHTNING_ARC power weapon — chained lightning tether.
//!
//! Fresh rewrite 2026-05-19 from a hand-read of:
//!   - `js/modules/combat/weapon-data.js` — POWER_WEAPONS.LIGHTNING_ARC
//!     (`cooldown: 8000` ms, `damage: 0.05`, `range: 1.0`,
//!      `chainRange: 360`, `beamDuration: 3000` ms).
//!   - `js/modules/player/weapons.js` — `firePower`'s LIGHTNING_ARC
//!     activation branch (`lightningArcActive = true`,
//!      `lightningArcTimer = config.beamDuration`).
//!
//! The arc is a cooldown-gated, auto-targeted DOT that runs for 3
//! sim-seconds (180 ticks @ 60 Hz). On every tick while active:
//!   1. The closest live enemy within `ARC_PRIMARY_RANGE` of the
//!      ship is the **primary** target (chain_index = 0).
//!   2. Up to `ARC_MAX_CHAIN_LINKS` additional enemies are chained
//!      from there, each within `ARC_CHAIN_RANGE` of the prior link
//!      and never re-targeting one already on the chain.
//!   3. Each enemy on the chain takes `ARC_DAMAGE_PER_TICK` damage.
//!
//! Returns the per-link hits as `ArcHit` records so the Wave 2
//! dispatcher in `room.rs` can apply damage AND emit a chain-polyline
//! cosmetic event for the JS client to render
//! `ship → hit[0] → hit[1] → ...` as connected line segments.
//!
//! ## MVP simplifications (intentional — deferred)
//!
//! - **AMPLIFIER** (+20% arc damage / stack) — deferred. The flat
//!   `ARC_DAMAGE_PER_TICK` applies. Wave 2 may scale by per-player
//!   upgrade stacks when porting upgrades.
//! - **ARC_OVERCHARGE** (chain-arc bounce / overload behavior) —
//!   deferred. Chain selection is greedy-nearest only; no extra
//!   bounce / damage-stack mechanic.
//!
//! ## Determinism
//!
//! Pure scan over the enemies slice. Tie-break on equidistant enemies
//! is by lower slice index (the first-encountered wins). NO RNG, NO
//! transcendentals — `dx*dx + dy*dy` comparison only, fully
//! bit-exact across native + WASM.

use super::enemy::EnemyState;
use super::state::ShipState;

/// Power-weapon kind discriminator. Matches `ShipState::power_weapon_kind`
/// dense-u8 enumeration (`5` = LIGHTNING_ARC; see state.rs:88-89).
pub const KIND_LIGHTNING_ARC: u8 = 5;

/// Cooldown between activations in sim ticks. Solo's `cooldown: 8000` ms
/// at 60 Hz → `8000 / (1000/60)` = 480 ticks.
pub const ARC_COOLDOWN_TICKS: u32 = 480;

/// Active duration of the arc in sim ticks. Solo's `beamDuration: 3000`
/// ms at 60 Hz → `3000 / (1000/60)` = 180 ticks.
pub const ARC_DURATION_TICKS: u32 = 180;

/// Maximum distance (px) from the ship at which a primary target can be
/// acquired. Solo's `range: 1.0` is a relative multiplier; multiplied
/// by solo's per-weapon base range yields ~600 px in the live build.
/// Chosen here to match the visual reach players see in solo and to
/// give the arc a slightly longer reach than `ARC_CHAIN_RANGE`.
pub const ARC_PRIMARY_RANGE: f64 = 600.0;

/// Maximum distance (px) between two adjacent links on the chain. Matches
/// solo's `chainRange: 360` exactly.
pub const ARC_CHAIN_RANGE: f64 = 360.0;

/// Maximum number of chain LINKS past the primary target. With
/// `MAX_CHAIN_LINKS = 4` the arc can hit up to `1 + 4 = 5` enemies
/// simultaneously.
pub const ARC_MAX_CHAIN_LINKS: u8 = 4;

/// Damage applied to each enemy on the chain per sim tick. Solo's
/// `damage: 0.05` per ms × (1000 / 60) ms/tick = 0.833.../tick.
/// Rounded to 0.5 here as the Phase 4 step 6 MVP calibration —
/// over 180 ticks this is 90 dmg per link, which is in the ballpark
/// of solo's effective sustained DPS once AMPLIFIER stacks are
/// factored out. Wave 2 may re-tune.
pub const ARC_DAMAGE_PER_TICK: f64 = 0.5;

/// One enemy hit by the arc this tick. The Wave 2 dispatcher in
/// `room.rs` is responsible for:
///   - applying `damage` to the matching `enemies[id]`
///   - emitting a chain-polyline cosmetic event so the JS client
///     can draw `ship → hit[0] → hit[1] → ... → hit[N-1]` as
///     connected line segments
///
/// Hits are returned in chain order — `chain_index = 0` is the primary
/// target (closest to the ship), `1` is the first chained link off the
/// primary, and so on.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArcHit {
    /// `EnemyState::id` of the hit enemy.
    pub enemy_id: u32,
    /// Damage to apply this tick.
    pub damage: f64,
    /// World x-coord of the hit (for chain-polyline rendering).
    pub x: f64,
    /// World y-coord of the hit (for chain-polyline rendering).
    pub y: f64,
    /// Position in the chain — `0` = primary (closest to ship),
    /// `1` = first chain link, etc.
    pub chain_index: u8,
}

/// Activate the lightning arc on this ship. Idempotent w.r.t. an
/// already-active arc — if `beam_remaining_ticks > 0` and
/// `beam_kind == KIND_LIGHTNING_ARC` we leave the existing arc
/// running (no double-buff by mashing the input).
///
/// Caller (Wave 2 integration in `room.rs`) is responsible for
/// gating against the cooldown (`current_tick >=
/// power_weapon_cooldown_tick`) and for setting the
/// `power_weapon_cooldown_tick` after activation.
pub fn activate(ship: &mut ShipState) {
    // Already active → leave it alone (no restart).
    if ship.beam_remaining_ticks > 0 && ship.beam_kind == KIND_LIGHTNING_ARC {
        return;
    }
    ship.beam_kind = KIND_LIGHTNING_ARC;
    ship.beam_remaining_ticks = ARC_DURATION_TICKS;
    // Arc is auto-targeted — beam_aim_angle is unused. Leave the
    // current value alone (default 0.0 in a fresh ShipState).
}

/// Per-tick arc update.
///
/// While `ship.beam_remaining_ticks > 0` AND `ship.beam_kind ==
/// KIND_LIGHTNING_ARC`, identify the chain and return per-link hits.
/// The duration counter is decremented exactly once per call.
///
/// Returns an empty `Vec` when:
///   - the arc is inactive (kind mismatch or duration exhausted)
///   - no live enemy lies within `ARC_PRIMARY_RANGE` of the ship
///
/// Determinism: no RNG. Greedy-nearest chain selection with
/// tie-break on lower slice index. No transcendentals — squared
/// distance only.
pub fn tick_arc(ship: &mut ShipState, enemies: &[EnemyState]) -> Vec<ArcHit> {
    // Inactive: nothing to do.
    if ship.beam_remaining_ticks == 0 || ship.beam_kind != KIND_LIGHTNING_ARC {
        return Vec::new();
    }

    // Decrement duration first — even a "no target this tick" tick
    // counts against the 3-second window so an arc that wanders off
    // every target still expires on schedule.
    ship.beam_remaining_ticks -= 1;
    if ship.beam_remaining_ticks == 0 {
        // Tick that just exhausted the arc — clear the kind so the
        // ship's beam slot is unambiguously inactive next tick.
        ship.beam_kind = 0;
    }

    // Find the primary target — closest live enemy within
    // ARC_PRIMARY_RANGE of the ship. Tie-break: lower slice index
    // wins (the `<` comparison preserves the first-encountered).
    let primary_range_sq = ARC_PRIMARY_RANGE * ARC_PRIMARY_RANGE;
    let mut primary_idx: Option<usize> = None;
    let mut primary_d2 = f64::INFINITY;
    for (i, e) in enemies.iter().enumerate() {
        if !e.active {
            continue;
        }
        let dx = e.x - ship.x;
        let dy = e.y - ship.y;
        let d2 = dx * dx + dy * dy;
        if d2 <= primary_range_sq && d2 < primary_d2 {
            primary_d2 = d2;
            primary_idx = Some(i);
        }
    }

    let primary_idx = match primary_idx {
        Some(i) => i,
        None => return Vec::new(),
    };

    // Build the chain. `visited[i]` true once enemies[i] is already on
    // the chain — prevents loops back to the primary or any prior link.
    let mut visited = vec![false; enemies.len()];
    let mut hits: Vec<ArcHit> = Vec::with_capacity(1 + ARC_MAX_CHAIN_LINKS as usize);

    visited[primary_idx] = true;
    let primary = &enemies[primary_idx];
    hits.push(ArcHit {
        enemy_id: primary.id,
        damage: ARC_DAMAGE_PER_TICK,
        x: primary.x,
        y: primary.y,
        chain_index: 0,
    });

    let chain_range_sq = ARC_CHAIN_RANGE * ARC_CHAIN_RANGE;
    let mut cur_x = primary.x;
    let mut cur_y = primary.y;

    for link in 1..=ARC_MAX_CHAIN_LINKS {
        // Find closest unvisited live enemy within ARC_CHAIN_RANGE of
        // the current chain tip. Tie-break on lower slice index.
        let mut next_idx: Option<usize> = None;
        let mut next_d2 = f64::INFINITY;
        for (i, e) in enemies.iter().enumerate() {
            if !e.active || visited[i] {
                continue;
            }
            let dx = e.x - cur_x;
            let dy = e.y - cur_y;
            let d2 = dx * dx + dy * dy;
            if d2 <= chain_range_sq && d2 < next_d2 {
                next_d2 = d2;
                next_idx = Some(i);
            }
        }

        match next_idx {
            Some(i) => {
                visited[i] = true;
                let e = &enemies[i];
                hits.push(ArcHit {
                    enemy_id: e.id,
                    damage: ARC_DAMAGE_PER_TICK,
                    x: e.x,
                    y: e.y,
                    chain_index: link,
                });
                cur_x = e.x;
                cur_y = e.y;
            }
            None => break, // No more reachable enemies — chain ends here.
        }
    }

    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::{EnemyState, KIND_HUNTER};
    use crate::state::ShipState;

    /// Build a synthetic ship at a known position. Other fields default
    /// to ShipState's centered values; tests override only what the
    /// arc reads (`x`, `y`, `beam_*`).
    fn make_ship(x: f64, y: f64) -> ShipState {
        ShipState {
            x,
            y,
            ..ShipState::default()
        }
    }

    /// Build a synthetic active enemy at a known position. Fields
    /// outside the arc's read-set default to zero.
    fn make_enemy(id: u32, x: f64, y: f64) -> EnemyState {
        EnemyState {
            id,
            kind: KIND_HUNTER,
            x,
            y,
            hp: 3.0,
            max_hp: 3.0,
            radius: 18.0,
            active: true,
            ..EnemyState::default()
        }
    }

    #[test]
    fn activate_sets_beam_kind_and_duration() {
        let mut ship = make_ship(960.0, 540.0);
        assert_eq!(ship.beam_remaining_ticks, 0);
        assert_eq!(ship.beam_kind, 0);
        activate(&mut ship);
        assert_eq!(ship.beam_kind, KIND_LIGHTNING_ARC);
        assert_eq!(ship.beam_remaining_ticks, ARC_DURATION_TICKS);
    }

    #[test]
    fn activate_doesnt_restart_if_already_active() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Burn half the duration.
        ship.beam_remaining_ticks = ARC_DURATION_TICKS / 2;
        let before = ship.beam_remaining_ticks;
        activate(&mut ship);
        assert_eq!(
            ship.beam_remaining_ticks, before,
            "activate must NOT restart an already-active arc"
        );
        assert_eq!(ship.beam_kind, KIND_LIGHTNING_ARC);
    }

    #[test]
    fn tick_arc_inactive_returns_empty() {
        let mut ship = make_ship(960.0, 540.0);
        // beam_remaining_ticks = 0 and beam_kind = 0 → inactive.
        let enemies = vec![make_enemy(1, 1000.0, 540.0)];
        let hits = tick_arc(&mut ship, &enemies);
        assert!(hits.is_empty());
        assert_eq!(ship.beam_remaining_ticks, 0, "duration shouldn't tick when inactive");
    }

    #[test]
    fn tick_arc_decrements_duration() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        let enemies: Vec<EnemyState> = Vec::new();
        let before = ship.beam_remaining_ticks;
        let _ = tick_arc(&mut ship, &enemies);
        assert_eq!(ship.beam_remaining_ticks, before - 1);
    }

    #[test]
    fn tick_arc_no_enemies_returns_empty() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        let enemies: Vec<EnemyState> = Vec::new();
        let hits = tick_arc(&mut ship, &enemies);
        assert!(hits.is_empty(), "no enemies → no hits");
    }

    #[test]
    fn tick_arc_primary_is_closest_to_ship() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Three enemies along +x. id=2 at 100 px is closest.
        let enemies = vec![
            make_enemy(1, 960.0 + 300.0, 540.0),
            make_enemy(2, 960.0 + 100.0, 540.0),
            make_enemy(3, 960.0 + 200.0, 540.0),
        ];
        let hits = tick_arc(&mut ship, &enemies);
        assert!(!hits.is_empty());
        assert_eq!(hits[0].enemy_id, 2, "closest-to-ship is primary");
        assert_eq!(hits[0].chain_index, 0);
    }

    #[test]
    fn tick_arc_primary_outside_range_returns_empty() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Only enemy is 800 px away — beyond ARC_PRIMARY_RANGE (600).
        let enemies = vec![make_enemy(1, 960.0 + 800.0, 540.0)];
        let hits = tick_arc(&mut ship, &enemies);
        assert!(
            hits.is_empty(),
            "primary outside ARC_PRIMARY_RANGE → no chain"
        );
    }

    #[test]
    fn tick_arc_chains_to_nearby_enemies() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Primary at +100 px, then two chain links spaced 100 px apart
        // — all within ARC_CHAIN_RANGE (360 px) of the previous link.
        let enemies = vec![
            make_enemy(10, 960.0 + 100.0, 540.0), // primary
            make_enemy(11, 960.0 + 200.0, 540.0), // 100 px from primary
            make_enemy(12, 960.0 + 300.0, 540.0), // 100 px from id=11
        ];
        let hits = tick_arc(&mut ship, &enemies);
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].enemy_id, 10);
        assert_eq!(hits[0].chain_index, 0);
        assert_eq!(hits[1].enemy_id, 11);
        assert_eq!(hits[1].chain_index, 1);
        assert_eq!(hits[2].enemy_id, 12);
        assert_eq!(hits[2].chain_index, 2);
    }

    #[test]
    fn tick_arc_caps_at_max_chain_links() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // 10 enemies in a tight cluster — all within chain range of each
        // other. The arc must stop at `1 + ARC_MAX_CHAIN_LINKS` hits.
        let mut enemies = Vec::new();
        for i in 0..10 {
            // Spaced 30 px apart along +x — every adjacent pair is well
            // within ARC_CHAIN_RANGE.
            enemies.push(make_enemy(100 + i as u32, 960.0 + 100.0 + (i as f64) * 30.0, 540.0));
        }
        let hits = tick_arc(&mut ship, &enemies);
        let expected = 1 + ARC_MAX_CHAIN_LINKS as usize;
        assert_eq!(
            hits.len(),
            expected,
            "chain must cap at 1 + ARC_MAX_CHAIN_LINKS = {} hits",
            expected
        );
        // Chain indices are dense [0..expected).
        for (k, h) in hits.iter().enumerate() {
            assert_eq!(h.chain_index, k as u8);
        }
    }

    #[test]
    fn tick_arc_skips_inactive() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // id=1 is the closest BUT inactive — the arc must skip it and
        // pick id=2 as primary instead.
        let mut e1 = make_enemy(1, 960.0 + 50.0, 540.0);
        e1.active = false;
        let enemies = vec![
            e1,
            make_enemy(2, 960.0 + 200.0, 540.0),
        ];
        let hits = tick_arc(&mut ship, &enemies);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].enemy_id, 2, "inactive enemy must be skipped");
    }

    #[test]
    fn tick_arc_no_enemy_visited_twice() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Two enemies very close together. The chain must NOT loop back
        // to the primary after picking the second one.
        let enemies = vec![
            make_enemy(1, 960.0 + 100.0, 540.0),
            make_enemy(2, 960.0 + 150.0, 540.0),
        ];
        let hits = tick_arc(&mut ship, &enemies);
        // Exactly 2 hits — primary + one chain link, no loop-back.
        assert_eq!(hits.len(), 2);
        // No id repeats.
        let mut ids: Vec<u32> = hits.iter().map(|h| h.enemy_id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), hits.len(), "no enemy visited twice");
    }

    #[test]
    fn tick_arc_damage_matches_const_per_link() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        let enemies = vec![
            make_enemy(1, 960.0 + 100.0, 540.0),
            make_enemy(2, 960.0 + 200.0, 540.0),
            make_enemy(3, 960.0 + 300.0, 540.0),
        ];
        let hits = tick_arc(&mut ship, &enemies);
        assert!(!hits.is_empty());
        for h in &hits {
            assert_eq!(
                h.damage.to_bits(),
                ARC_DAMAGE_PER_TICK.to_bits(),
                "every link must carry ARC_DAMAGE_PER_TICK exactly"
            );
        }
    }

    #[test]
    fn tick_arc_tie_break_lower_slice_index_wins() {
        // Two enemies at EXACTLY the same distance from the ship —
        // determinism rule says the lower slice index (id=1) wins.
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        let enemies = vec![
            make_enemy(1, 960.0 + 100.0, 540.0),
            make_enemy(2, 960.0 - 100.0, 540.0), // same |dist| as id=1
        ];
        let hits = tick_arc(&mut ship, &enemies);
        assert!(!hits.is_empty());
        assert_eq!(
            hits[0].enemy_id, 1,
            "tie-break: lower slice index wins (id=1 over id=2)"
        );
    }

    #[test]
    fn tick_arc_clears_kind_when_duration_exhausted() {
        let mut ship = make_ship(960.0, 540.0);
        activate(&mut ship);
        // Burn down to a single tick remaining.
        ship.beam_remaining_ticks = 1;
        let enemies: Vec<EnemyState> = Vec::new();
        let _ = tick_arc(&mut ship, &enemies);
        assert_eq!(ship.beam_remaining_ticks, 0);
        assert_eq!(
            ship.beam_kind, 0,
            "exhausted arc clears beam_kind so the slot is unambiguously inactive"
        );
    }
}
