//! Phase 4 step 5 — WEAVER enemy (orbital harasser, spiral-laser fire).
//!
//! Fresh port from solo sources (2026-05-18):
//!   - `js/modules/enemy/enemy-data.js` (WEAVER row, ~line 232)
//!   - `js/modules/enemy/movement.js`   (`weaverSpinupMovement`, ~line 2036)
//!   - `js/modules/enemy/firing.js`     (`shootSpiralLaser`, ~line 543)
//!
//! Solo's WEAVER is a three-state ms-driven machine (spinning_up → arcing →
//! cooldown). MP collapses that to a single state with monotonic
//! `spinup_progress` because we have no wall-clock — angular velocity is
//! `lerp(OMEGA_MIN, OMEGA_MAX, spinup_progress / SPINUP_TICKS)` and the
//! enemy is always orbiting + firing once spun up. This is the same MVP
//! shape as `enemy.rs` (HUNTER) and keeps the per-enemy state vector
//! flat + serializable.
//!
//! Spiral pattern: solo fires `shootSpiralLaser` in the current `faceAngle`
//! while `faceAngle` rotates at `weaverMaxSpinRate` — the spiral emerges
//! from a rotating face combined with periodic fire. MP makes the spiral
//! explicit via `spiral_phase`: Wave 2's fire dispatcher computes emit
//! angle = `aim_weaver(s, t) + s.spiral_phase` and calls
//! `advance_spiral_phase(s)` after each shot so the next shot is offset
//! by `WEAVER_SPIRAL_STEP_RADIANS`.
//!
//! Note: SENTINEL (`enemy-data.js` line ~270) also declares
//! `movePattern: 'weaver_spinup'`. The spin-up + orbit helper logic here
//! is conceptually reusable; Phase 4 step 5 keeps the modules separate
//! for clarity. A `weaver_spinup.rs` helper could extract the shared
//! lerp-omega + orbital integration later.
//!
//! **Wave 2A unification** — this module previously defined its own
//! `WeaverSpawnedFields` struct; it now uses the unified
//! `super::enemy::EnemyState`. WEAVER touches the `arc_dir`,
//! `spinup_progress`, `orbit_phase`, and `spiral_phase` fields of that
//! union. All other per-kind fields default to 0.

use super::enemy::{EnemyState, TargetView};
use super::trig;

/// WEAVER kind discriminator. Matches `wave_table::KIND_WEAVER`.
pub const KIND_WEAVER: u8 = 6;

/// Base HP. Solo's `enemy-data.js` WEAVER row uses 5 (bumped 3 → 5 in
/// 5.74.12); MP rounds up to 8 to compensate for MP's higher per-shot
/// damage ceiling (multi-player combined fire) — same scaling pattern
/// as HUNTER 3.0 → MP HUNTER_MAX_HP 3.0 baseline relative to MP weapons.
pub const WEAVER_MAX_HP: f64 = 8.0;

/// Translational base speed (px/tick at 60 Hz). Mostly unused — WEAVER's
/// motion is orbital, not linear — but kept as a spawn-velocity floor
/// and for any non-target drift edge case.
pub const WEAVER_BASE_SPEED: f64 = 1.5;

/// Body radius (px). Solo `size: 32` is visual width; collision radius
/// in MP is ~half of that (matches HUNTER 18.0 from solo 36-ish size).
pub const WEAVER_RADIUS: f64 = 19.0;

/// Contact damage dealt to a ship on body-touch.
pub const WEAVER_CONTACT_DAMAGE: f64 = 4.0;

/// Tick interval between spiral-laser shots. 20 ticks = 3 shots/sec at
/// 60 Hz; combined with `WEAVER_SPIRAL_STEP_RADIANS = 0.31` gives a
/// ~20-shot full revolution every ~6.7 s — visible spiral arms with
/// breathing room between waves of incoming fire.
pub const WEAVER_FIRE_COOLDOWN_TICKS: u32 = 20;

/// Ticks to reach full angular speed. 180 = 3 s at 60 Hz. Mirrors
/// solo's `weaverSpinUpDuration: 2400` ms (~144 ticks) loosely — MP
/// rounds up to give players a longer window to react before the
/// spiral becomes oppressive.
pub const WEAVER_SPINUP_TICKS: u32 = 180;

/// Orbital radius around the target (px). Matches solo's
/// `weaverArcRadius = 220`.
pub const WEAVER_ORBIT_RADIUS: f64 = 220.0;

/// Lower-bound angular velocity at `spinup_progress = 0` (rad/tick).
/// Slow enough that a freshly-spawned WEAVER doesn't feel zippy.
pub const WEAVER_OMEGA_MIN: f64 = 0.005;

/// Upper-bound angular velocity at `spinup_progress = WEAVER_SPINUP_TICKS`
/// (rad/tick). 10× the min — matches solo's "feels like it accelerates"
/// arc-phase intensity without porting the eased-progress curve verbatim.
pub const WEAVER_OMEGA_MAX: f64 = 0.05;

/// Per-shot advance of `spiral_phase` (rad). 0.31 ≈ 18°, so a full
/// revolution takes 20 shots. With `WEAVER_FIRE_COOLDOWN_TICKS = 20`
/// that's a 400-tick (~6.7 s) full spiral cycle — visible arm pattern
/// without saturating the screen with bullets.
pub const WEAVER_SPIRAL_STEP_RADIANS: f64 = 0.31;

/// Lerp factor for facing-angle smoothing. Solo uses `turnSpeed: 0.12`
/// in `enemy-data.js`; MP rounds to 0.10 for a slightly slower visual
/// turn matching HUNTER's 0.08.
const ANGLE_TURN_T: f64 = 0.10;

/// Spawn a WEAVER from a per-event sub-seed. Both server and WASM
/// client construct identical state from the same `(id, rng_subseed,
/// field_w, field_h)` inputs.
pub fn spawn_weaver_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the WEAVER just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -WEAVER_RADIUS,
            0.0,
            WEAVER_BASE_SPEED,
        ),
        1 => (
            field_w + WEAVER_RADIUS,
            rng.range_f64(0.0, field_h),
            -WEAVER_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + WEAVER_RADIUS,
            0.0,
            -WEAVER_BASE_SPEED,
        ),
        _ => (
            -WEAVER_RADIUS,
            rng.range_f64(0.0, field_h),
            WEAVER_BASE_SPEED,
            0.0,
        ),
    };

    // Sticky orbital direction (solo's `weaverArcDirection`).
    let arc_dir = if rng.range_f64(0.0, 1.0) < 0.5 { -1.0 } else { 1.0 };
    // Initial orbital phase — random so simultaneously-spawned WEAVERs
    // don't all start orbiting from the same spot.
    let orbit_phase = rng.unit_circle_angle();

    EnemyState {
        id,
        kind: KIND_WEAVER,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: WEAVER_MAX_HP,
        max_hp: WEAVER_MAX_HP,
        radius: WEAVER_RADIUS,
        active: true,
        last_fire_tick: 0,
        arc_dir,
        spinup_progress: 0,
        orbit_phase,
        spiral_phase: 0.0,
        ..EnemyState::default()
    }
}

/// Per-tick update for a WEAVER. Picks closest alive target; ramps
/// `spinup_progress`; computes the current orbital omega via
/// `lerp(OMEGA_MIN, OMEGA_MAX, t) * arc_dir`; advances `orbit_phase`;
/// snaps position to `target + (cos(phase), sin(phase)) * ORBIT_RADIUS`;
/// clamps to field; smoothly faces the target. No target → drifts
/// along the last-tick velocity (predictable for tests/replays).
pub fn update_weaver_movement(
    s: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_WEAVER {
        return;
    }

    // Ramp spinup_progress monotonically, saturating at the cap.
    if s.spinup_progress < WEAVER_SPINUP_TICKS {
        s.spinup_progress += 1;
    }

    let target = closest_target(targets, s.x, s.y);

    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => {
            // No target: drift along last velocity, clamp to field.
            // No orbital motion (we have nothing to orbit around) but
            // spinup_progress still ramps so a target re-acquired
            // mid-life gets the spun-up omega immediately.
            let prev_x = s.x;
            let prev_y = s.y;
            s.x += s.vx;
            s.y += s.vy;
            clamp_to_field(s, field_w, field_h);
            // Recompute vx/vy as the actual delta (clamp may have
            // zeroed it). This keeps `vx`/`vy` honest for serialization.
            s.vx = s.x - prev_x;
            s.vy = s.y - prev_y;
            return;
        }
    };

    // Current angular velocity = lerp(min, max, progress/SPINUP_TICKS)
    // scaled by direction. Linear lerp — solo uses an eased curve but
    // linear is bit-deterministic and Phase 4 MVP feel is acceptable.
    let t = (s.spinup_progress as f64) / (WEAVER_SPINUP_TICKS as f64);
    let omega = lerp(WEAVER_OMEGA_MIN, WEAVER_OMEGA_MAX, t) * s.arc_dir;
    s.orbit_phase += omega;

    // Snap position to the orbit around the target.
    let prev_x = s.x;
    let prev_y = s.y;
    s.x = tx + trig::cos64(s.orbit_phase) * WEAVER_ORBIT_RADIUS;
    s.y = ty + trig::sin64(s.orbit_phase) * WEAVER_ORBIT_RADIUS;
    clamp_to_field(s, field_w, field_h);
    // Report the actual position delta as the tick's velocity. Honest
    // value for snapshot consumers; will reflect any clamp adjustment.
    s.vx = s.x - prev_x;
    s.vy = s.y - prev_y;

    // Smoothly face the target.
    let desired_angle = trig::atan2_64(ty - s.y, tx - s.x);
    s.angle = lerp_angle(s.angle, desired_angle, ANGLE_TURN_T);
}

/// Advance the spiral fire phase by one step. Wave 2's fire dispatcher
/// calls this AFTER each shot so the next shot's emit angle is offset
/// by an additional `WEAVER_SPIRAL_STEP_RADIANS`.
pub fn advance_spiral_phase(s: &mut EnemyState) {
    s.spiral_phase += WEAVER_SPIRAL_STEP_RADIANS;
}

/// Base angle from this WEAVER to the given target. Wave 2 adds
/// `s.spiral_phase` to this value to compute the actual emit angle
/// (so the spiral rotates around the aim-at-target direction over time).
pub fn aim_weaver(s: &EnemyState, target: &TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

// ── Internal helpers ───────────────────────────────────────────────

/// Linear interpolation between `a` and `b` at parameter `t` (clamped
/// internally on the caller's side via spinup saturation; no
/// clamp here — keeps the helper minimal).
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Find the closest alive target. `None` if all dead/empty.
fn closest_target(
    targets: &[TargetView],
    x: f64,
    y: f64,
) -> Option<TargetView> {
    let mut best: Option<(f64, TargetView)> = None;
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

/// Clamp the WEAVER's position to the field (radius-aware). Unlike
/// HUNTER's bounce, the WEAVER just gets pinned to the field edge —
/// orbital motion will pull it back in next tick when the target
/// moves and the orbit recomputes around the target.
fn clamp_to_field(s: &mut EnemyState, field_w: f64, field_h: f64) {
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

/// Angle lerp via shortest path (handles ±π wrap). Same shape as
/// the helper in `enemy.rs`; copied (not extracted) so this module
/// stays self-contained per the file-ownership Wave 1 dispatch rule.
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

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView {
            player_id,
            x,
            y,
            alive,
        }
    }

    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_weaver_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_weaver_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.spinup_progress, b.spinup_progress);
        assert_eq!(a.orbit_phase.to_bits(), b.orbit_phase.to_bits());
        assert_eq!(a.spiral_phase.to_bits(), b.spiral_phase.to_bits());
        assert_eq!(a.arc_dir.to_bits(), b.arc_dir.to_bits());
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_weaver_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            assert_eq!(s.kind, KIND_WEAVER);
            assert!(s.active);
            let at_top = (s.y - (-WEAVER_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + WEAVER_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + WEAVER_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-WEAVER_RADIUS)).abs() < 1e-9;
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
            assert!(s.arc_dir == 1.0 || s.arc_dir == -1.0);
            assert!(s.orbit_phase >= 0.0 && s.orbit_phase < trig::TAU);
            assert_eq!(s.spinup_progress, 0);
            assert_eq!(s.spiral_phase, 0.0);
            assert_eq!(s.hp, WEAVER_MAX_HP);
        }
    }

    #[test]
    fn spawn_seed_variation() {
        // Different sub-seeds must produce different spawn states.
        // Count distinct (x, y) positions across many seeds; expect
        // most to be unique.
        let mut seen: std::collections::HashSet<(u64, u64)> =
            std::collections::HashSet::new();
        for seed in 0..50u64 {
            let s = spawn_weaver_from_seed(1, seed.wrapping_mul(0x9E37_79B9_7F4A_7C15), 1920.0, 1080.0);
            seen.insert((s.x.to_bits(), s.y.to_bits()));
        }
        // At least 90% unique — collision tolerance for edge-quantized
        // y/x values when edge picks happen to repeat.
        assert!(
            seen.len() >= 45,
            "only {} distinct spawn positions across 50 seeds — RNG not varying enough",
            seen.len()
        );
    }

    #[test]
    fn update_no_target_drifts_predictably() {
        // No targets → drifts along (vx, vy) for the tick.
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        s.vx = 1.0;
        s.vy = 0.5;
        let targets: [TargetView; 0] = [];
        update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        // Should have moved exactly by the last-tick velocity.
        assert!((s.x - 501.0).abs() < 1e-9, "x = {}", s.x);
        assert!((s.y - 500.5).abs() < 1e-9, "y = {}", s.y);
    }

    #[test]
    fn update_spinup_progresses() {
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        let targets = [target(99, 800.0, 500.0, true)];
        for i in 1..=10u32 {
            update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
            assert_eq!(s.spinup_progress, i, "tick {i}: spinup progress mismatch");
        }
        // Saturates at WEAVER_SPINUP_TICKS.
        for _ in 0..(WEAVER_SPINUP_TICKS + 50) {
            update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert_eq!(s.spinup_progress, WEAVER_SPINUP_TICKS);
    }

    #[test]
    fn update_omega_increases_with_spinup() {
        // Measure orbit_phase delta early (spunup low) vs late (spunup high);
        // late delta must be larger.
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        s.orbit_phase = 0.0;
        s.arc_dir = 1.0;
        let targets = [target(99, 500.0, 500.0, true)];

        // First-tick phase delta.
        let phase0 = s.orbit_phase;
        update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        let early_delta = s.orbit_phase - phase0;

        // Skip ahead by manually saturating spinup, then measure delta.
        for _ in 0..WEAVER_SPINUP_TICKS {
            update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let phase_pre_late = s.orbit_phase;
        update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        let late_delta = s.orbit_phase - phase_pre_late;

        assert!(
            late_delta > early_delta * 5.0,
            "late omega ({late_delta}) must be >>>  early omega ({early_delta})"
        );
        // And late delta must be near OMEGA_MAX.
        assert!(
            (late_delta - WEAVER_OMEGA_MAX).abs() < 1e-9,
            "late delta = {late_delta}, expected ~{WEAVER_OMEGA_MAX}"
        );
    }

    #[test]
    fn update_orbits_target() {
        // Once positioned, distance from WEAVER to target should stay
        // ≈ WEAVER_ORBIT_RADIUS over many ticks.
        let tx = 960.0;
        let ty = 540.0;
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.x = tx + WEAVER_ORBIT_RADIUS;
        s.y = ty;
        s.arc_dir = 1.0;
        s.orbit_phase = 0.0;
        let targets = [target(99, tx, ty, true)];
        for _ in 0..60 {
            update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
            let dx = s.x - tx;
            let dy = s.y - ty;
            let dist = (dx * dx + dy * dy).sqrt();
            // Polynomial trig + lerp introduces small drift but the
            // orbit invariant (position snaps to radius each tick) holds
            // tightly. 1e-3 covers cos/sin numerical noise.
            assert!(
                (dist - WEAVER_ORBIT_RADIUS).abs() < 1e-3,
                "tick: dist = {dist}, expected ~{WEAVER_ORBIT_RADIUS}"
            );
        }
    }

    #[test]
    fn advance_spiral_phase_advances() {
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        assert_eq!(s.spiral_phase, 0.0);
        advance_spiral_phase(&mut s);
        assert!(
            (s.spiral_phase - WEAVER_SPIRAL_STEP_RADIANS).abs() < 1e-12,
            "after 1 advance: {}", s.spiral_phase
        );
        advance_spiral_phase(&mut s);
        assert!(
            (s.spiral_phase - 2.0 * WEAVER_SPIRAL_STEP_RADIANS).abs() < 1e-12,
            "after 2 advances: {}", s.spiral_phase
        );
        // 20 more advances → 22 total.
        for _ in 0..20 {
            advance_spiral_phase(&mut s);
        }
        let expected = 22.0 * WEAVER_SPIRAL_STEP_RADIANS;
        assert!(
            (s.spiral_phase - expected).abs() < 1e-9,
            "after 22 advances: {}, expected {}", s.spiral_phase, expected
        );
    }

    #[test]
    fn update_clamps_inside_field() {
        // Put the target near a corner so the orbit projection would
        // place the WEAVER outside the field. Verify it's clamped.
        let fw = 1920.0;
        let fh = 1080.0;
        let tx = 30.0; // near left edge
        let ty = 30.0; // near top edge
        let mut s = spawn_weaver_from_seed(1, 42, fw, fh);
        s.x = tx;
        s.y = ty;
        s.orbit_phase = trig::PI; // cos = -1, sin = 0 → projects far left
        s.arc_dir = 0.0; // freeze rotation so we can inspect the snap deterministically
        let targets = [target(99, tx, ty, true)];
        update_weaver_movement(&mut s, &targets, fw, fh);
        let r = s.radius;
        assert!(s.x >= r - 1e-6, "x = {} not clamped to [r, fw - r]", s.x);
        assert!(s.x <= fw - r + 1e-6, "x = {} not clamped", s.x);
        assert!(s.y >= r - 1e-6, "y = {} not clamped", s.y);
        assert!(s.y <= fh - r + 1e-6, "y = {} not clamped", s.y);
    }

    #[test]
    fn update_inactive_is_noop() {
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.active = false;
        s.x = 500.0;
        s.y = 500.0;
        s.spinup_progress = 0;
        let targets = [target(99, 800.0, 500.0, true)];
        update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.spinup_progress, 0, "inactive enemy should not progress");
        assert_eq!(s.x, 500.0, "inactive enemy should not move");
        assert_eq!(s.y, 500.0, "inactive enemy should not move");
    }

    #[test]
    fn update_wrong_kind_is_noop() {
        let mut s = spawn_weaver_from_seed(1, 42, 1920.0, 1080.0);
        s.kind = 0; // pretend it's a HUNTER — wrong-kind guard must skip.
        s.x = 500.0;
        s.y = 500.0;
        s.spinup_progress = 0;
        let targets = [target(99, 800.0, 500.0, true)];
        update_weaver_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.spinup_progress, 0, "wrong-kind enemy should not progress");
        assert_eq!(s.x, 500.0, "wrong-kind enemy should not move");
        assert_eq!(s.y, 500.0, "wrong-kind enemy should not move");
    }

    #[test]
    fn aim_weaver_points_at_target() {
        let s = EnemyState {
            id: 1,
            kind: KIND_WEAVER,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: WEAVER_MAX_HP,
            max_hp: WEAVER_MAX_HP,
            radius: WEAVER_RADIUS,
            active: true,
            last_fire_tick: 0,
            arc_dir: 1.0,
            spinup_progress: 0,
            orbit_phase: 0.0,
            spiral_phase: 0.0,
            ..EnemyState::default()
        };
        // Target directly to the right.
        let t = target(99, 200.0, 100.0, true);
        let a = aim_weaver(&s, &t);
        assert!(a.abs() < 1e-9, "right-target angle = {} (expected ~0)", a);

        // Target directly below (canvas: +y).
        let t = target(99, 100.0, 200.0, true);
        let a = aim_weaver(&s, &t);
        assert!(
            (a - trig::PI_2).abs() < 1e-9,
            "below-target angle = {} (expected ~PI/2)", a
        );

        // Target to the left.
        let t = target(99, 0.0, 100.0, true);
        let a = aim_weaver(&s, &t);
        assert!(
            (a.abs() - trig::PI).abs() < 1e-9,
            "left-target angle = {} (expected ~±PI)", a
        );
    }
}
