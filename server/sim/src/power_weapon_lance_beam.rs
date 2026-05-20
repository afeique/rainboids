//! Phase 4 step 6 LANCE_BEAM power weapon — sustained piercing beam.
//!
//! Authored 2026-05-19 as part of the Wave 1 parallel dispatch from
//! solo's `js/modules/player/weapons.js::startLanceBeam` and
//! `js/modules/combat/weapon-data.js::LANCE_BEAM` block.
//!
//! Behavioral summary: on activation, snapshot the ship's facing angle
//! and arm a 3-second beam (180 ticks @ 60 Hz). Each subsequent tick,
//! the dispatcher (Wave 2) calls `tick_beam` which computes the line
//! segment from the ship outward along the snapshotted angle for
//! `LANCE_BEAM_LENGTH_PX` and returns one `LanceBeamHit` per active
//! enemy within `LANCE_BEAM_WIDTH_PX + enemy.radius` perpendicular
//! distance of that segment. The beam pierces — every enemy on the
//! line is hit each tick.
//!
//! Deviations from solo (intentional MVP simplifications, deferred to
//! later steps):
//!   - BEAM_WIDTH / LINGER / REFRACTION / OVERLOAD_BEAM /
//!     LANCE_VELOCITY upgrades NOT applied here. Per-tick damage is the
//!     flat `LANCE_BEAM_DAMAGE_PER_TICK` const. The orchestrator will
//!     scale by powerup stacks in a follow-up step.
//!   - No audio loop (the sim doesn't own audio — cosmetic events
//!     handle that on the client).
//!   - No streak / crit multipliers (those live in the damage
//!     dispatcher's apply path, not the weapon module).
//!
//! Per-tick damage value: solo's `damage: 0.05` was a per-logic-frame
//! number against ~60 Hz. Spec asks for ~0.5 so 180 ticks × 0.5 ≈ 90
//! total damage per activation — keeps the 8s-cooldown power-weapon
//! slot in line with the other power weapons (CHARGE_SHOT peak,
//! NOVA_BLAST burst, MISSILE_SALVO three-missile spread).
//!
//! The actual application of damage + emission of `BeamStart` /
//! `BeamEnd` / per-hit cosmetic events happens in Wave 2's
//! `room.rs::process_power_fire_inputs` and per-tick loop — this
//! module is pure: it computes `LanceBeamHit`s for one tick, mutates
//! the ship's beam state machine, and returns to the caller.

use crate::trig;

// ── Public surface ─────────────────────────────────────────────────

/// Power-weapon kind discriminator for LANCE_BEAM. Matches the dense
/// u8 enumeration documented on `ShipState::power_weapon_kind`:
/// `0`=CHARGE_SHOT, `1`=MINE_LAYER, `2`=NOVA_BLAST, `3`=MISSILE_SALVO,
/// `4`=LANCE_BEAM, `5`=LIGHTNING_ARC.
pub const KIND_LANCE_BEAM: u8 = 4;

/// Cooldown between successive activations in sim ticks.
/// Solo's `cooldown: 8000` ms ÷ (1000 / 60) = 480 ticks @ 60 Hz.
pub const LANCE_BEAM_COOLDOWN_TICKS: u32 = 480;

/// Beam active duration in sim ticks.
/// Solo's `beamDuration: 3000` ms ÷ (1000 / 60) = 180 ticks @ 60 Hz.
pub const LANCE_BEAM_DURATION_TICKS: u32 = 180;

/// Maximum reach of the beam (px). Solo's `range: 0.9` is a factor of
/// `FIELD_WIDTH` (1920) → 1728 px. Beams that would exit the field at
/// max range simply truncate at this length; no wrap.
pub const LANCE_BEAM_LENGTH_PX: f64 = 1728.0;

/// Half-width of the beam's collision strip (px). Solo's
/// `beamWidth: 6`. Enemies are hit when their body-radius-extended
/// perpendicular distance to the beam line drops below this.
pub const LANCE_BEAM_WIDTH_PX: f64 = 6.0;

/// Damage dealt to each enemy on the beam line per tick. Calibrated
/// against the 180-tick duration: 180 × 0.5 = 90 damage per
/// activation, then offset by the 480-tick cooldown for an effective
/// ~11.25 DPS averaged over the cooldown — competitive with
/// CHARGE_SHOT / NOVA_BLAST / MISSILE_SALVO. Each per-tick application
/// is its own damage event in Wave 2 (so crits / streaks / etc.
/// dispatch normally).
pub const LANCE_BEAM_DAMAGE_PER_TICK: f64 = 0.5;

/// One enemy hit by the beam in a single tick. The Wave 2 dispatcher
/// applies the damage (`damage::apply_damage`) and emits a per-hit
/// cosmetic event (`BeamHit` or equivalent) for the client renderer.
///
/// `hit_x` / `hit_y` is the perpendicular-foot of the enemy onto the
/// beam line, clamped to the segment — the visual "spark" anchor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LanceBeamHit {
    pub enemy_id: u32,
    pub damage: f64,
    pub hit_x: f64,
    pub hit_y: f64,
}

/// Start the beam. Idempotent — calling `activate` while a beam is
/// already active does NOT restart it. Snapshots `ship.angle` into
/// `ship.beam_aim_angle` so the beam direction is fixed for its
/// lifetime (solo's "no sweep" behavior — the player can't rotate the
/// active beam by turning the ship).
///
/// The caller (Wave 2's `process_power_fire_inputs`) is responsible
/// for the cooldown gate (`current_tick >=
/// ship.power_weapon_cooldown_tick`) and for setting the post-activation
/// cooldown (`ship.power_weapon_cooldown_tick = current_tick +
/// LANCE_BEAM_COOLDOWN_TICKS`). Activation here only arms the beam
/// state machine on the ship.
pub fn activate(ship: &mut super::state::ShipState) {
    // Idempotent — if a beam is already burning, leave it alone. This
    // matches solo's behavior where re-pressing power-fire mid-beam
    // is a no-op (the cooldown gate normally prevents this from being
    // reachable, but the contract is explicit either way).
    if ship.beam_remaining_ticks > 0 && ship.beam_kind == KIND_LANCE_BEAM {
        return;
    }
    ship.beam_kind = KIND_LANCE_BEAM;
    ship.beam_remaining_ticks = LANCE_BEAM_DURATION_TICKS;
    ship.beam_aim_angle = ship.angle;
}

/// Per-tick beam update. While `ship.beam_remaining_ticks > 0` and
/// `ship.beam_kind == KIND_LANCE_BEAM`, compute the line segment from
/// `(ship.x, ship.y)` along `ship.beam_aim_angle` for
/// `LANCE_BEAM_LENGTH_PX`, and return one `LanceBeamHit` per active
/// enemy within `LANCE_BEAM_WIDTH_PX + enemy.radius` of that segment.
/// Decrements `beam_remaining_ticks`. Returns an empty vec when no
/// beam is active.
///
/// **Returns**: per-tick hits. Empty if the beam is inactive, if no
/// enemies are on the line, or if all candidate enemies are inactive.
pub fn tick_beam(
    ship: &mut super::state::ShipState,
    enemies: &[super::enemy::EnemyState],
) -> Vec<LanceBeamHit> {
    // Fast-out: no beam active. We're explicit about not decrementing
    // past zero so re-entrant ticks don't underflow.
    if ship.beam_remaining_ticks == 0 || ship.beam_kind != KIND_LANCE_BEAM {
        return Vec::new();
    }

    // Snapshot beam geometry from the ship + snapshotted angle. Note
    // we do NOT use `ship.angle` here — the beam was aim-locked at
    // activation time (see `activate` above).
    let cos_a = trig::cos64(ship.beam_aim_angle);
    let sin_a = trig::sin64(ship.beam_aim_angle);
    let p0_x = ship.x;
    let p0_y = ship.y;
    let p1_x = p0_x + cos_a * LANCE_BEAM_LENGTH_PX;
    let p1_y = p0_y + sin_a * LANCE_BEAM_LENGTH_PX;

    // Squared beam length for the parametric projection. Constant
    // by definition (LENGTH_PX is fixed); precomputed for clarity.
    let beam_len_sq = LANCE_BEAM_LENGTH_PX * LANCE_BEAM_LENGTH_PX;

    let mut hits: Vec<LanceBeamHit> = Vec::new();

    for e in enemies {
        if !e.active {
            continue;
        }

        // Parametric projection of (e.x, e.y) onto segment p0→p1.
        // t in [0, 1] = closest-point-on-segment parameter.
        let dx = e.x - p0_x;
        let dy = e.y - p0_y;
        let bx = p1_x - p0_x;
        let by = p1_y - p0_y;
        // dot(point-p0, segment) / |segment|²
        let mut t = (dx * bx + dy * by) / beam_len_sq;
        if t < 0.0 {
            t = 0.0;
        } else if t > 1.0 {
            t = 1.0;
        }
        let foot_x = p0_x + bx * t;
        let foot_y = p0_y + by * t;
        let pdx = e.x - foot_x;
        let pdy = e.y - foot_y;
        let perp_dist_sq = pdx * pdx + pdy * pdy;

        // Hit threshold: beam half-width plus the enemy's body
        // radius. Compare squared distances to avoid a sqrt — and to
        // stay in pure-arithmetic territory (no f64::sqrt) for
        // cross-runtime determinism.
        let threshold = LANCE_BEAM_WIDTH_PX + e.radius;
        if perp_dist_sq < threshold * threshold {
            hits.push(LanceBeamHit {
                enemy_id: e.id,
                damage: LANCE_BEAM_DAMAGE_PER_TICK,
                hit_x: foot_x,
                hit_y: foot_y,
            });
        }
    }

    // Decrement the duration AFTER computing this tick's hits. The
    // tick on which the beam reaches 0 still deals damage — matches
    // the "180 ticks of damage" contract.
    ship.beam_remaining_ticks -= 1;

    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::EnemyState;
    use crate::state::ShipState;

    /// Build a ship at a known position + angle. Other ShipState
    /// fields take their defaults (centered, fresh beam state).
    fn make_ship(x: f64, y: f64, angle: f64) -> ShipState {
        ShipState {
            x,
            y,
            angle,
            ..ShipState::default()
        }
    }

    /// Build an enemy with the fields the beam reads (`id`, `x`, `y`,
    /// `radius`, `active`). Other fields default to zero per
    /// `EnemyState::default()`.
    fn make_enemy(id: u32, x: f64, y: f64, radius: f64, active: bool) -> EnemyState {
        EnemyState {
            id,
            x,
            y,
            radius,
            active,
            ..EnemyState::default()
        }
    }

    #[test]
    fn activate_sets_beam_kind_and_duration() {
        let mut ship = make_ship(960.0, 540.0, 0.0);
        assert_eq!(ship.beam_remaining_ticks, 0);
        assert_eq!(ship.beam_kind, 0);
        activate(&mut ship);
        assert_eq!(ship.beam_kind, KIND_LANCE_BEAM);
        assert_eq!(ship.beam_remaining_ticks, LANCE_BEAM_DURATION_TICKS);
    }

    #[test]
    fn activate_snapshots_ship_angle() {
        let angle = 1.234_f64;
        let mut ship = make_ship(0.0, 0.0, angle);
        activate(&mut ship);
        assert_eq!(
            ship.beam_aim_angle.to_bits(),
            angle.to_bits(),
            "beam_aim_angle must snapshot ship.angle bit-exactly"
        );
    }

    #[test]
    fn activate_doesnt_restart_if_already_active() {
        // Activate, advance the beam state forward (simulate a tick),
        // then call activate again — duration must NOT reset.
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        ship.beam_remaining_ticks = 42; // mid-burn snapshot
        let saved_angle = ship.beam_aim_angle;
        // Change ship.angle mid-burn so we'd notice an erroneous re-snapshot.
        ship.angle = 2.5;
        activate(&mut ship);
        assert_eq!(
            ship.beam_remaining_ticks, 42,
            "second activate must NOT reset duration while beam is active"
        );
        assert_eq!(
            ship.beam_aim_angle.to_bits(),
            saved_angle.to_bits(),
            "second activate must NOT re-snapshot the aim angle"
        );
    }

    #[test]
    fn tick_beam_inactive_returns_empty() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        // beam_remaining_ticks defaults to 0 — beam is inactive.
        let enemies = [make_enemy(1, 100.0, 0.0, 10.0, true)];
        let hits = tick_beam(&mut ship, &enemies);
        assert!(hits.is_empty(), "no beam → no hits");
        // Must NOT underflow below zero.
        assert_eq!(
            ship.beam_remaining_ticks, 0,
            "inactive tick must not decrement past 0"
        );
    }

    #[test]
    fn tick_beam_decrements_duration() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let before = ship.beam_remaining_ticks;
        let enemies: [EnemyState; 0] = [];
        tick_beam(&mut ship, &enemies);
        assert_eq!(
            ship.beam_remaining_ticks,
            before - 1,
            "active tick decrements duration by 1"
        );
    }

    #[test]
    fn tick_beam_hits_enemy_on_line() {
        // Ship at origin facing +x; enemy directly along the +x axis.
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let enemies = [make_enemy(7, 500.0, 0.0, 10.0, true)];
        let hits = tick_beam(&mut ship, &enemies);
        assert_eq!(hits.len(), 1, "enemy on beam line must be hit");
        assert_eq!(hits[0].enemy_id, 7);
    }

    #[test]
    fn tick_beam_misses_enemy_off_line() {
        // Ship at origin facing +x; enemy 100 px PERPENDICULAR (off
        // the beam by far more than width + radius).
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        // x=500 (along beam), y=100 → perpendicular offset 100,
        // threshold = LANCE_BEAM_WIDTH_PX (6) + radius (10) = 16. Miss.
        let enemies = [make_enemy(8, 500.0, 100.0, 10.0, true)];
        let hits = tick_beam(&mut ship, &enemies);
        assert!(
            hits.is_empty(),
            "enemy 100px off the beam line must NOT be hit"
        );
    }

    #[test]
    fn tick_beam_hits_multiple_enemies_in_line() {
        // Ship at origin facing +x; three enemies along the line at
        // distinct distances. All three must be hit in the same tick
        // (beam pierces).
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let enemies = [
            make_enemy(1, 100.0, 0.0, 10.0, true),
            make_enemy(2, 500.0, 0.0, 10.0, true),
            make_enemy(3, 1000.0, 0.0, 10.0, true),
        ];
        let hits = tick_beam(&mut ship, &enemies);
        assert_eq!(hits.len(), 3, "beam pierces — all three on line are hit");
        let mut ids: Vec<u32> = hits.iter().map(|h| h.enemy_id).collect();
        ids.sort();
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[test]
    fn tick_beam_skips_inactive_enemies() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let enemies = [
            make_enemy(1, 100.0, 0.0, 10.0, true),  // active → hit
            make_enemy(2, 500.0, 0.0, 10.0, false), // inactive → skip
        ];
        let hits = tick_beam(&mut ship, &enemies);
        assert_eq!(hits.len(), 1, "only the active enemy on the line is hit");
        assert_eq!(hits[0].enemy_id, 1);
    }

    #[test]
    fn tick_beam_damage_matches_const() {
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let enemies = [make_enemy(1, 100.0, 0.0, 10.0, true)];
        let hits = tick_beam(&mut ship, &enemies);
        assert_eq!(hits.len(), 1);
        assert_eq!(
            hits[0].damage.to_bits(),
            LANCE_BEAM_DAMAGE_PER_TICK.to_bits(),
            "per-hit damage must match LANCE_BEAM_DAMAGE_PER_TICK exactly"
        );
    }

    #[test]
    fn tick_beam_uses_snapshot_angle_not_current_angle() {
        // Activate with angle=0 (firing +x); move the enemy ONTO the
        // +x axis. Then change ship.angle to point straight down. The
        // beam must STILL fire along the snapshotted +x axis and hit.
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        // Post-activation rotation — must NOT redirect the beam.
        ship.angle = trig::PI_2; // straight down
        let enemies = [
            make_enemy(1, 500.0, 0.0, 10.0, true),     // on the +x snapshot beam
            make_enemy(2, 0.0, 500.0, 10.0, true),     // on the "current angle" beam (down)
        ];
        let hits = tick_beam(&mut ship, &enemies);
        // Only the +x-axis enemy is hit; the down-axis enemy is NOT,
        // proving the beam respects the snapshot angle.
        assert_eq!(hits.len(), 1, "beam must follow snapshot angle, not current ship.angle");
        assert_eq!(hits[0].enemy_id, 1);
    }

    #[test]
    fn tick_beam_hit_position_is_on_line() {
        // Ship at origin facing +x. Enemy slightly off the line
        // (within the hit threshold). The recorded hit_x/hit_y must
        // be the perpendicular FOOT on the beam — so hit_y should be
        // ~0 (the beam is along the x-axis at y=0), and hit_x should
        // be the enemy's x.
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        // Enemy at (300, 5), radius 10 → perpendicular distance 5 <
        // threshold 16, so hit. Foot on the +x-axis at (300, 0).
        let enemies = [make_enemy(1, 300.0, 5.0, 10.0, true)];
        let hits = tick_beam(&mut ship, &enemies);
        assert_eq!(hits.len(), 1);
        // Tolerance widened to 1e-3 because the beam axis is computed
        // via super::trig::cos64/sin64 (polynomial approximation,
        // ~3e-5 max ULP drift). The 1e-9 strict tolerance only works
        // for f64::* trig; we use the cross-runtime polynomial form.
        assert!(
            (hits[0].hit_x - 300.0).abs() < 1e-3,
            "hit_x should be the perpendicular foot on the beam (300.0), got {}",
            hits[0].hit_x
        );
        assert!(
            hits[0].hit_y.abs() < 1e-3,
            "hit_y should be on the beam (y=0), got {}",
            hits[0].hit_y
        );
    }

    #[test]
    fn tick_beam_clamps_to_segment_endpoints() {
        // An enemy BEHIND the ship (negative t) must NOT be hit even
        // if the infinite line would reach it. Same for an enemy
        // past the far endpoint (t > 1).
        let mut ship = make_ship(0.0, 0.0, 0.0);
        activate(&mut ship);
        let enemies = [
            // Behind the ship along the beam axis — clamped to t=0,
            // perpendicular distance = |(-50, 0) - (0,0)| = 50 > 16.
            make_enemy(1, -50.0, 0.0, 10.0, true),
            // Far past the beam tip (LENGTH = 1728). Clamped to t=1,
            // perpendicular distance = |(2000, 0) - (1728, 0)| = 272 > 16.
            make_enemy(2, 2000.0, 0.0, 10.0, true),
        ];
        let hits = tick_beam(&mut ship, &enemies);
        assert!(
            hits.is_empty(),
            "enemies before t=0 or after t=1 along the beam must NOT be hit"
        );
    }
}
