//! Phase 4 step 5 — TANGERINE enemy (solo name "Bomber"). Relentless
//! chase-the-player harasser whose signature move is dropping
//! persistent proximity mines at its current position on a cooldown.
//! Mid-HP, mid-speed, low-DPS-from-body but high-area-denial via the
//! mines it leaves behind.
//!
//! Fresh rewrite from solo's
//!   - `js/modules/enemy/enemy-data.js`   (TANGERINE row, `name: 'Bomber'`)
//!   - `js/modules/enemy/movement.js`     (`chasePlayer`, TANGERINE branch
//!                                         + standard chase fall-through)
//!   - `js/modules/enemy/firing.js`       (`layMine` — the actual mine
//!                                         entity construction)
//!
//! Deterministic: every random draw goes through `RngCtx` (seeded
//! per-spawn from the `EnemySpawn` event's `rng_subseed`) and every
//! trig op goes through `super::trig::*` (polynomial-bit-exact across
//! native + WASM).
//!
//! Authored 2026-05-18 as part of Phase 4 step 5 Wave 1 parallel
//! dispatch. Wave 2A landed the unified `super::enemy::EnemyState`;
//! Wave 2B (this revision) adapts the module to read/write that
//! shared state directly. TANGERINE uses NO per-kind movement-state
//! fields — chase is purely reactive to the closest target each tick,
//! and mine-drop cooldown is gated against the common `last_fire_tick`
//! field by `room.rs`.
//!
//! Mine dropping is delegated to `enemy_mine.rs` (sibling Wave 1
//! module). This module just provides movement + aim + the
//! `TANGERINE_MINE_COOLDOWN_TICKS` constant; the dispatcher in
//! `room.rs` gates the cooldown against `last_fire_tick` and calls
//! `enemy_mine::spawn_mine_from_seed(...)` at the TANGERINE's current
//! `(x, y)` whenever the cooldown elapses.
//!
//! Behavioral deviations from solo's `chasePlayer` TANGERINE branch
//! (intentional, determinism-driven):
//!   - No `frameClock.now`-based roam-direction state machine. Solo
//!     rolls a new `bomberRoamDir` every 700-1600 ms using
//!     `Math.random()` against wall-clock; the sim has no wall-clock
//!     and re-deriving identical wall-times across server + WASM is
//!     fragile. Phase 4 keeps the *core read* (TANGERINE always
//!     pursues the closest target) and drops the random roam jitter.
//!     The result is a more direct beeline than solo's "drunken
//!     bomber" — visually distinct but mechanically equivalent
//!     (still chase + drop mines).
//!   - No `mineJustLaid` brief-stop damping (solo's 700 ms post-drop
//!     velocity dampen). The mine-drop trigger lives in the
//!     dispatcher, not here, and a deterministic stop window would
//!     require yet another tick-counter field. Phase 4 keeps the
//!     TANGERINE moving continuously — it just drops a mine in
//!     passing every `TANGERINE_MINE_COOLDOWN_TICKS`.
//!   - No wall-repulsion blending (solo's 180 px wall-margin pull).
//!     The simpler clamp matches HUNTER/WASP's pattern and avoids
//!     introducing pattern-specific physics into the collision pass.
//!     The clamp itself prevents the TANGERINE from leaving the field.
//!   - Constant `TANGERINE_BASE_SPEED` along facing — no accumulated
//!     velocity (`vel += acc * cos(roamDir)`). Same shape as HUNTER's
//!     "constant speed along facing" pattern.
//!
//! Stat divergence from solo's enemy-data.js TANGERINE row (intentional,
//! MP-balance-driven; the spec for this module explicitly chose these
//! values for Phase 4 step 5):
//!   - HP: 6.0 here vs solo's 10. MP keeps enemy HP lower so 2-4 player
//!     teams melt them at a healthy clip; solo's 10 was tuned for a
//!     single shooter with deeper weapon upgrades.
//!   - Speed: 1.7 here vs solo's 2.0. MP TANGERINE is "relentless but
//!     not unfair" — the 60 Hz sim normalizes speeds across enemy
//!     kinds (HUNTER 1.4, WASP 2.3, TANGERINE 1.7 fits the slow-but-
//!     persistent niche).
//!   - Radius: 20 here vs solo's `size: 45` (radius would be ~22.5).
//!     Pulled in slightly because mines are the threat; the body
//!     itself shouldn't dominate the collision read.
//!   - Mine cooldown: 90 ticks (1.5 s) vs solo's 1875-7000 ms (random).
//!     MP fixes the cadence for determinism; per-instance randomization
//!     across the table range is the dispatcher's responsibility if needed.

use super::enemy::EnemyState;
use super::trig;

/// TANGERINE kind discriminator. Matches `wave_table::KIND_TANGERINE`
/// (the public, table-side reservation). Re-exported here so the
/// enemy module owns its own discriminator (parallel to
/// `enemy::KIND_HUNTER`, `enemy_wasp::KIND_WASP`).
pub const KIND_TANGERINE: u8 = 5;

/// Base HP for a TANGERINE. MP-balanced lower than solo's 10
/// (see header for rationale). 6 HP ≈ 5 PULSE_CANNON hits at 1.2 dmg
/// — comparable kill-time to HUNTER for a single shooter, faster for
/// a team.
pub const TANGERINE_MAX_HP: f64 = 6.0;

/// Body radius (px). Pulled in from solo's `size: 45` (~22 radius)
/// to 20 — the mines TANGERINE drops are the real threat, so the
/// body collider should not dominate.
pub const TANGERINE_RADIUS: f64 = 20.0;

/// Movement speed (px/tick at 60 Hz). Sits between HUNTER (1.4) and
/// WASP (2.3) — TANGERINE is "relentless but not unfair." Chase is
/// meant to feel persistent, not panic-inducing; mines do the work.
pub const TANGERINE_BASE_SPEED: f64 = 1.7;

/// Contact damage dealt to a ship on body-touch. Matches HUNTER (5.0)
/// — the body itself is a credible threat, but the mine drops are
/// the headline danger. The collision dispatcher reads this.
pub const TANGERINE_CONTACT_DAMAGE: f64 = 5.0;

/// Per-TANGERINE mine-drop cooldown in ticks. 90 ticks ≈ 1.5 s at
/// 60 Hz. Solo's `firing.cooldown: { min: 1875, max: 7000 }` ms
/// (≈ 112-420 ticks); MP fixes the cadence to the aggressive end
/// of that range for determinism. The dispatcher gates against this
/// constant: when `current_tick - last_fire_tick >=
/// TANGERINE_MINE_COOLDOWN_TICKS`, drop a mine via
/// `enemy_mine::spawn_mine_from_seed(...)` at the TANGERINE's
/// current `(x, y)` and reset `last_fire_tick = current_tick`.
pub const TANGERINE_MINE_COOLDOWN_TICKS: u32 = 90;

/// Lerp factor used to turn the TANGERINE's facing angle toward its
/// desired heading per tick. Solo's `turnSpeed: 0.12` for TANGERINE
/// (enemy-data.js movement block) — same as WASP, faster than
/// HUNTER's 0.08 so the bomber can track player movement without
/// the lazy arc feel.
const ANGLE_TURN_T: f64 = 0.12;

/// Spawn a TANGERINE at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in
/// `EnemySpawn` event) and produce identical state.
///
/// Edge-spawn pattern mirrors HUNTER/WASP: pick one of four field
/// edges, place the TANGERINE just outside, assign initial velocity
/// inward at `TANGERINE_BASE_SPEED`. No additional pattern-state
/// seeding because chase is stateless — all per-kind movement-state
/// fields on `EnemyState` stay at their `Default` (0.0 / 0 / false)
/// for TANGERINE.
pub fn spawn_tangerine_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    // Per-spawn RngCtx, seeded by the event's sub-seed. Same
    // contamination-guard pattern as HUNTER/WASP (see `enemy.rs`).
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the TANGERINE just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -TANGERINE_RADIUS,
            0.0,
            TANGERINE_BASE_SPEED,
        ),
        1 => (
            field_w + TANGERINE_RADIUS,
            rng.range_f64(0.0, field_h),
            -TANGERINE_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + TANGERINE_RADIUS,
            0.0,
            -TANGERINE_BASE_SPEED,
        ),
        _ => (
            -TANGERINE_RADIUS,
            rng.range_f64(0.0, field_h),
            TANGERINE_BASE_SPEED,
            0.0,
        ),
    };

    EnemyState {
        id,
        kind: KIND_TANGERINE,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: TANGERINE_MAX_HP,
        max_hp: TANGERINE_MAX_HP,
        radius: TANGERINE_RADIUS,
        active: true,
        last_fire_tick: 0,
        ..EnemyState::default()
    }
}

/// Per-tick update for a TANGERINE. Picks closest alive ship as
/// target, advances directly toward it at `TANGERINE_BASE_SPEED`,
/// faces the target (with smooth angle lerp), clamps to field.
/// Mirrors solo's `chasePlayer` TANGERINE branch minus the wall-clock
/// roam-direction state machine and wall-repulsion blending (see
/// header for rationale).
///
/// Reads/writes only common `EnemyState` fields — no per-kind
/// movement-state fields used (chase is stateless).
///
/// If no targets are alive, drifts toward field center — same fallback
/// as HUNTER/WASP, keeps the TANGERINE inside the field while waiting
/// for a ship to respawn.
pub fn update_tangerine_movement(
    s: &mut EnemyState,
    targets: &[super::enemy::TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_TANGERINE {
        return;
    }

    // Pick closest alive target. If none, drift toward field center
    // (same fallback as HUNTER/WASP).
    let target = closest_target(targets, s.x, s.y);
    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    let to_dx = tx - s.x;
    let to_dy = ty - s.y;
    let desired_angle = trig::atan2_64(to_dy, to_dx);

    // Smoothly turn toward target (avoid snap-rotation on every tick).
    s.angle = lerp_angle(s.angle, desired_angle, ANGLE_TURN_T);

    // Velocity along facing. Constant speed — no friction term, no
    // acceleration accumulation. Direct beeline.
    s.vx = trig::cos64(s.angle) * TANGERINE_BASE_SPEED;
    s.vy = trig::sin64(s.angle) * TANGERINE_BASE_SPEED;

    s.x += s.vx;
    s.y += s.vy;

    // Clamp to field. TANGERINE doesn't bounce (unlike HUNTER) — it
    // just gets clamped to the edge if it would leave. The angle lerp
    // on the next tick will naturally pull it back toward the target
    // (which is interior), so no velocity flip is needed and the
    // TANGERINE doesn't get "stuck" reversing direction at the wall.
    let r = s.radius;
    if s.x - r < 0.0 {
        s.x = r;
    } else if s.x + r > field_w {
        s.x = field_w - r;
    }
    if s.y - r < 0.0 {
        s.y = r;
    } else if s.y + r > field_h {
        s.y = field_h - r;
    }
}

/// Compute the aimed angle from a TANGERINE to a target. Returns
/// `atan2_64(dy, dx)` directly. Pure read — does not mutate the
/// TANGERINE.
///
/// Note: TANGERINE does NOT fire aimed bullets — it drops mines.
/// This function is provided for two purposes:
///   1. Symmetry with `enemy_wasp::aim_wasp` so the dispatcher has a
///      uniform `aim_<kind>(state, &target) -> f64` surface across all
///      enemy modules.
///   2. The TANGERINE's facing angle (used for visuals) is derived
///      from the same atan2 result internally — exposing it lets a
///      caller compute "would the TANGERINE be facing the target
///      after a turn" without re-implementing the math.
///
/// The mine-drop dispatcher does NOT call this — it calls
/// `enemy_mine::spawn_mine_from_seed(...)` with the TANGERINE's
/// current `(x, y)` directly. Mines have their own homing logic
/// inside `enemy_mine.rs` and don't take a launch angle.
pub fn aim_tangerine(s: &EnemyState, target: &super::enemy::TargetView) -> f64 {
    let dx = target.x - s.x;
    let dy = target.y - s.y;
    trig::atan2_64(dy, dx)
}

/// Internal: find the closest alive target. `None` if all dead/empty.
/// Duplicates `enemy.rs::closest_target` and `enemy_wasp.rs::
/// closest_target` rather than importing one — keeps each enemy
/// module standalone (Wave 1 file-ownership rule) and the
/// implementation is trivial.
fn closest_target(
    targets: &[super::enemy::TargetView],
    x: f64,
    y: f64,
) -> Option<super::enemy::TargetView> {
    let mut best: Option<(f64, super::enemy::TargetView)> = None;
    for t in targets {
        if !t.alive {
            continue;
        }
        let dx = t.x - x;
        let dy = t.y - y;
        let d2 = dx * dx + dy * dy;
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, *t));
        }
    }
    best.map(|(_, t)| t)
}

/// Internal: angle lerp via shortest path (handles ±π wrap so the
/// turn always takes the short way around the circle). Duplicates
/// the sibling-enemy versions for the same Wave 1 file-ownership
/// reason.
fn lerp_angle(a: f64, b: f64, t: f64) -> f64 {
    let mut d = b - a;
    while d > trig::PI {
        d -= trig::TAU;
    }
    while d < -trig::PI {
        d += trig::TAU;
    }
    a + d * t
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::TargetView;

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView {
            player_id,
            x,
            y,
            alive,
        }
    }

    /// Bit-exact determinism: two spawns with the same id + sub-seed
    /// produce byte-identical state. Server + WASM client depend on
    /// this for snapshot parity.
    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_tangerine_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_tangerine_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        assert_eq!(a.id, b.id);
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.vx.to_bits(), b.vx.to_bits());
        assert_eq!(a.vy.to_bits(), b.vy.to_bits());
        assert_eq!(a.angle.to_bits(), b.angle.to_bits());
        assert_eq!(a.hp.to_bits(), b.hp.to_bits());
        assert_eq!(a.max_hp.to_bits(), b.max_hp.to_bits());
        assert_eq!(a.radius.to_bits(), b.radius.to_bits());
        assert_eq!(a.active, b.active);
        assert_eq!(a.last_fire_tick, b.last_fire_tick);
    }

    /// Spawned TANGERINE sits at exactly one of the four field edges,
    /// on the spawning axis at ±TANGERINE_RADIUS outside the field
    /// and on the orthogonal axis inside [0, field_dim]. Sweep 100
    /// seeds.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_tangerine_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-TANGERINE_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + TANGERINE_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + TANGERINE_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-TANGERINE_RADIUS)).abs() < 1e-9;
            assert!(
                at_top || at_right || at_bottom || at_left,
                "seed {seed}: not at an edge — pos=({}, {})",
                s.x,
                s.y
            );
            if at_top || at_bottom {
                assert!(s.x >= 0.0 && s.x <= fw, "seed {seed}: x out of field");
            }
            if at_left || at_right {
                assert!(s.y >= 0.0 && s.y <= fh, "seed {seed}: y out of field");
            }
            // Common spawn invariants.
            assert_eq!(s.kind, KIND_TANGERINE);
            assert_eq!(s.hp, TANGERINE_MAX_HP);
            assert_eq!(s.max_hp, TANGERINE_MAX_HP);
            assert_eq!(s.radius, TANGERINE_RADIUS);
            assert!(s.active);
            assert_eq!(s.last_fire_tick, 0);
        }
    }

    /// Different sub-seeds produce different spawn positions. Property:
    /// we get variety, not lockstep TANGERINEs all spawning at the same
    /// edge.
    #[test]
    fn spawn_seed_variation() {
        let mut positions = std::collections::HashSet::new();
        for seed in 0..30u64 {
            let s = spawn_tangerine_from_seed(1, seed.wrapping_mul(1_000_003), 1920.0, 1080.0);
            positions.insert((s.x.to_bits(), s.y.to_bits()));
        }
        // Vastly different sub-seeds should yield ≥ 25 unique positions
        // out of 30 (tolerance for the rare edge-coord collision).
        assert!(
            positions.len() >= 25,
            "got {} unique positions",
            positions.len()
        );
    }

    /// With no targets, TANGERINE drifts toward the field center and
    /// stays bounded — no NaN, no infinities, stays inside the field.
    /// After enough ticks it should be closer to center than it
    /// started.
    #[test]
    fn update_no_target_drifts_toward_center() {
        let mut s = spawn_tangerine_from_seed(2, 13, 1920.0, 1080.0);
        // Override spawn to a known interior corner so the drift
        // direction is unambiguous.
        s.x = 100.0;
        s.y = 100.0;
        s.vx = TANGERINE_BASE_SPEED;
        s.vy = TANGERINE_BASE_SPEED;
        s.angle = trig::atan2_64(1.0, 1.0);
        let start_dist_to_center = ((s.x - 960.0).powi(2) + (s.y - 540.0).powi(2)).sqrt();
        let targets: [TargetView; 0] = [];
        for _ in 0..240 {
            update_tangerine_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(s.x.is_finite(), "x became non-finite: {}", s.x);
            assert!(s.y.is_finite(), "y became non-finite: {}", s.y);
        }
        let end_dist_to_center = ((s.x - 960.0).powi(2) + (s.y - 540.0).powi(2)).sqrt();
        assert!(
            end_dist_to_center < start_dist_to_center,
            "should have moved closer to center: start={}, end={}",
            start_dist_to_center,
            end_dist_to_center
        );
    }

    /// Over 60 ticks (~1 s) with a stationary target, TANGERINE closes
    /// most of the distance to it. At 1.7 px/tick × 60 ticks = 102 px
    /// of travel per second; starting 600 px away we expect to close
    /// roughly half the gap.
    #[test]
    fn update_chases_target() {
        let mut s = spawn_tangerine_from_seed(1, 42, 1920.0, 1080.0);
        // Override spawn to a controlled point regardless of edge.
        s.x = 1100.0;
        s.y = 500.0;
        s.vx = -TANGERINE_BASE_SPEED;
        s.vy = 0.0;
        s.angle = trig::PI; // pointing left toward target
        let start_dist = ((s.x - 500.0).powi(2) + (s.y - 500.0).powi(2)).sqrt();
        let targets = [target(99, 500.0, 500.0, true)];
        for _ in 0..60 {
            update_tangerine_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let end_dist = ((s.x - 500.0).powi(2) + (s.y - 500.0).powi(2)).sqrt();
        assert!(
            end_dist < start_dist,
            "TANGERINE should close distance: start={}, end={}",
            start_dist,
            end_dist
        );
        // Roughly half-closed the 600 px gap in 1 s (allowing for
        // angle-lerp ramp-up).
        let closed = start_dist - end_dist;
        assert!(
            closed > 60.0,
            "expected to close >60 px in 60 ticks, closed {}",
            closed
        );
    }

    /// With two alive targets, TANGERINE steers toward the closer
    /// one (not the farther one). Picks closest by squared-distance.
    #[test]
    fn update_picks_closest_target() {
        let mut s = spawn_tangerine_from_seed(3, 99, 1920.0, 1080.0);
        // Place TANGERINE near a near target at (200,500); the far
        // target is at (1800,500). Closer target wins.
        s.x = 400.0;
        s.y = 500.0;
        s.vx = 0.0;
        s.vy = 0.0;
        s.angle = 0.0; // start pointing right (toward FAR target)
        let near = target(1, 200.0, 500.0, true);
        let far = target(2, 1800.0, 500.0, true);
        let targets = [far, near]; // far listed first to ensure ordering
                                   // doesn't matter
        for _ in 0..120 {
            update_tangerine_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Should have moved LEFT (toward near target), not right.
        assert!(
            s.x < 400.0,
            "should have moved left toward near target, but x={}",
            s.x
        );
    }

    /// Clamp behavior: TANGERINE never leaves the field, even when
    /// the target is outside it (shouldn't happen in practice, but
    /// the clamp must hold).
    #[test]
    fn update_clamps_inside_field() {
        let mut s = spawn_tangerine_from_seed(4, 77, 1920.0, 1080.0);
        // Start near top-left, point up-left so the first tick would
        // push the TANGERINE outside the field.
        s.x = 25.0;
        s.y = 25.0;
        s.vx = -TANGERINE_BASE_SPEED;
        s.vy = -TANGERINE_BASE_SPEED;
        s.angle = trig::atan2_64(-1.0, -1.0);
        let targets = [target(1, -500.0, -500.0, true)]; // off-field target
        for _ in 0..120 {
            update_tangerine_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(
                s.x >= s.radius - 1e-9,
                "x should never go below radius, got {}",
                s.x
            );
            assert!(
                s.y >= s.radius - 1e-9,
                "y should never go below radius, got {}",
                s.y
            );
            assert!(
                s.x <= 1920.0 - s.radius + 1e-9,
                "x should never exceed field_w - radius, got {}",
                s.x
            );
            assert!(
                s.y <= 1080.0 - s.radius + 1e-9,
                "y should never exceed field_h - radius, got {}",
                s.y
            );
        }
    }

    /// Facing converges toward the target direction. With a stationary
    /// target due-east and the TANGERINE initially facing west, after
    /// enough ticks the facing should be close to 0 (atan2(0, +dx)).
    #[test]
    fn update_faces_target() {
        let mut s = spawn_tangerine_from_seed(5, 11, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        s.vx = -TANGERINE_BASE_SPEED;
        s.vy = 0.0;
        s.angle = trig::PI; // facing west (away from target)
        // Target is far east — TANGERINE should turn east to face it.
        // Use a target that's far enough away that the angle stays ~0
        // even as TANGERINE closes (avoid the case where TANGERINE
        // overshoots the target and the desired angle flips).
        let targets = [target(99, 5000.0, 500.0, true)];
        for _ in 0..120 {
            update_tangerine_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Wrap angle into [-π, π] for the comparison.
        let mut a = s.angle;
        while a > trig::PI {
            a -= trig::TAU;
        }
        while a < -trig::PI {
            a += trig::TAU;
        }
        assert!(
            a.abs() < 0.05,
            "angle should converge to ~0 (east), got {}",
            a
        );
    }

    /// `aim_tangerine` returns the correct atan2 angle to the target.
    /// Test cardinal directions to verify quadrant handling.
    #[test]
    fn aim_tangerine_points_at_target() {
        let s = EnemyState {
            id: 1,
            kind: KIND_TANGERINE,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: TANGERINE_MAX_HP,
            max_hp: TANGERINE_MAX_HP,
            radius: TANGERINE_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };

        // East: angle = 0
        let east = target(1, 1000.0, 500.0, true);
        let a = aim_tangerine(&s, &east);
        assert!(a.abs() < 1e-9, "east → 0, got {}", a);

        // South: angle = +π/2 (y increases downward in screen coords)
        let south = target(2, 500.0, 1000.0, true);
        let a = aim_tangerine(&s, &south);
        assert!((a - trig::PI_2).abs() < 1e-9, "south → π/2, got {}", a);

        // West: angle = ±π
        let west = target(3, 0.0, 500.0, true);
        let a = aim_tangerine(&s, &west);
        assert!(
            (a - trig::PI).abs() < 1e-9 || (a + trig::PI).abs() < 1e-9,
            "west → ±π, got {}",
            a
        );

        // North: angle = -π/2
        let north = target(4, 500.0, 0.0, true);
        let a = aim_tangerine(&s, &north);
        assert!((a + trig::PI_2).abs() < 1e-9, "north → -π/2, got {}", a);
    }

    /// Sanity-check the public constants — guard against accidental
    /// edits that break MP balance assumptions or violate the wave-
    /// table contract.
    #[test]
    fn consts_sensible() {
        // Discriminator matches the wave-table reservation.
        assert_eq!(KIND_TANGERINE, super::super::wave_table::KIND_TANGERINE);
        assert_eq!(KIND_TANGERINE, 5);

        // HP positive, finite, in a reasonable range for a mid-tier
        // enemy (1-50 HP roughly).
        assert!(TANGERINE_MAX_HP > 0.0 && TANGERINE_MAX_HP < 50.0);

        // Speed positive, finite, in the 0.5-5.0 range we use across
        // enemy kinds.
        assert!(TANGERINE_BASE_SPEED > 0.5 && TANGERINE_BASE_SPEED < 5.0);

        // Radius positive, finite, in the 10-60 range matching solo's
        // enemy `size` field divided by 2 roughly.
        assert!(TANGERINE_RADIUS > 10.0 && TANGERINE_RADIUS < 60.0);

        // Contact damage positive — body touch is a credible threat.
        assert!(TANGERINE_CONTACT_DAMAGE > 0.0 && TANGERINE_CONTACT_DAMAGE < 20.0);

        // Mine cooldown in a sane range (10 ticks = ~6 mines/s would
        // be overkill; 600 ticks = 10 s would be sleep-walking).
        assert!(TANGERINE_MINE_COOLDOWN_TICKS >= 30 && TANGERINE_MINE_COOLDOWN_TICKS <= 600);
    }
}
