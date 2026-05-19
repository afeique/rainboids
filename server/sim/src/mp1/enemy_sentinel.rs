//! Phase 4 step 5 — SENTINEL enemy sim (2026-05-18).
//!
//! SENTINEL is a heavy turret that orbits the closest player while
//! sweeping its aim back and forth across an arc. The sweep is what
//! makes it dangerous — bullets fan out, fill the screen, and the
//! player must dodge across the beam path rather than out-running a
//! single aimed line. Movement = WEAVER's `weaver_spinup` orbital
//! pattern (sticky CW/CCW arc orbit around the target with a slow
//! ease-in spinup); firing = aim-at-target + sin-wave angle offset.
//!
//! Solo sources:
//!   - `js/modules/enemy/enemy-data.js` (SENTINEL row ~line 269):
//!     health=10, speed=2.5, size=41, shootPattern='sentinel_sweep',
//!     movePattern='weaver_spinup', spinUpDuration=2400ms,
//!     arcDashDuration=3600ms, cooldownDuration=2600ms, contactDamage
//!     comes from base enemy code (5 dmg).
//!   - `js/modules/enemy/movement.js` `weaverSpinupMovement` (~line
//!     2037): three-state machine (spinning_up → arcing → cooldown).
//!     The MP sim collapses this into a continuous spinup ramp +
//!     persistent orbit (no per-state branching) because solo's state
//!     transitions depend on `frameClock.now` wall-clock which the
//!     deterministic sim does not have. Same visual read: enemy
//!     ramps up spin and orbits its target.
//!   - `js/modules/enemy/firing.js` `updateSentinelSweep` /
//!     `shootCircleBurst` (~line 1224): solo actually fires an 8-bullet
//!     360° hexagon burst (NOT a swept aim). The MP sim's "sentinel
//!     sweep" is the orchestrator-spec design: emit angle =
//!     `aim_sentinel(s, t) + current_sweep_offset(s)` where the offset
//!     is `SENTINEL_SWEEP_AMPLITUDE * sin(sweep_phase)` advancing each
//!     tick. This is a deliberate divergence to keep the MP fire
//!     dispatcher simple (one bullet per fire-tick at a swept angle)
//!     while delivering the "fills the screen with bullets you have
//!     to weave through" feel.
//!
//! Note: SENTINEL and WEAVER share the `weaver_spinup` orbital
//! movement pattern. Per-module duplication is intentional for Phase 4
//! step 5 — extraction to a shared `orbital_movement` helper is a
//! Phase 5+ cleanup once both enemies have shipped and their actual
//! behavioral overlap is clear from real code (vs. solo's loose
//! sharing).
//!
//! Wave 2A — the per-kind `SentinelSpawnedFields` struct was retired;
//! SENTINEL now reads/writes the unified `super::enemy::EnemyState`.
//! SENTINEL uses `arc_dir`, `spinup_progress`, `orbit_phase`, and
//! `sweep_phase` on that struct (NOT `spiral_phase` — that's WEAVER's
//! distinct field).
//!
//! Determinism: every random draw goes through `RngCtx::from_seed`
//! (sub-seeded by the spawn event); every trig op goes through
//! `super::trig::{sin64, cos64, atan2_64}` (polynomial bit-exact
//! across native + WASM). No `f64::sin`, no `f64::atan2`, no
//! wall-clock reads.

use super::enemy::EnemyState;
use super::trig;

/// SENTINEL kind discriminator. Matches `wave_table::KIND_SENTINEL`.
pub const KIND_SENTINEL: u8 = 7;

/// Max HP at spawn. Matches solo's `health: 10`.
pub const SENTINEL_MAX_HP: f64 = 10.0;
/// Base orbital speed (px/tick at 60 Hz). The translational speed when
/// the orbit pulls the enemy toward its computed orbit-target point.
/// Tuned smaller than solo's `speed: 2.5` because the MP sim runs a
/// continuous chase (no per-state speed scaling like solo's `2.8x`
/// arcing multiplier).
pub const SENTINEL_BASE_SPEED: f64 = 1.2;
/// Body radius (px) for collision + visuals. Matches solo's `size: 41`.
pub const SENTINEL_RADIUS: f64 = 22.0;
/// Contact damage dealt to a ship on body-touch.
pub const SENTINEL_CONTACT_DAMAGE: f64 = 5.0;
/// Per-enemy fire cooldown (ticks at 60 Hz). 12 ticks = 5 shots/sec —
/// "very rapid; the sweep is meant to fill the screen."
pub const SENTINEL_FIRE_COOLDOWN_TICKS: u32 = 12;
/// Spinup ramp duration (ticks). 240 ≈ 4 s at 60 Hz — slower than
/// WEAVER's so the player has time to read the threat before bullets
/// start landing.
pub const SENTINEL_SPINUP_TICKS: u32 = 240;
/// Orbit radius around the target (px). 260 sits between solo's 220
/// initial and 280 max — gives the sweep arc room to breathe without
/// the SENTINEL hugging the player.
pub const SENTINEL_ORBIT_RADIUS: f64 = 260.0;
/// Minimum orbit angular velocity (rad/tick) — slowest sticky orbit.
pub const SENTINEL_OMEGA_MIN: f64 = 0.004;
/// Maximum orbit angular velocity (rad/tick) — fastest sticky orbit.
pub const SENTINEL_OMEGA_MAX: f64 = 0.03;
/// Sweep amplitude (radians). Bullets emit within ±0.7 rad (~40°) of
/// the base aim angle. Wide enough that the player can't just sit
/// still and let bullets miss; narrow enough that running away works.
pub const SENTINEL_SWEEP_AMPLITUDE: f64 = 0.7;
/// Sweep phase advance per tick (rad/tick). 0.06 rad/tick → full sweep
/// period = 2π/0.06 ≈ 105 ticks ≈ 1.75 s — fast enough to feel
/// "sweeping", slow enough to be a readable hazard.
pub const SENTINEL_SWEEP_OMEGA: f64 = 0.06;

/// Lerp factor used to turn the enemy's facing angle toward its
/// desired heading per tick. 0.08 mirrors solo's
/// `enemy.turnSpeed = 0.08` in `js/modules/enemy/enemy.js`.
const ANGLE_TURN_T: f64 = 0.08;

/// Spawn a SENTINEL at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in the spawn
/// event) and produce the same enemy.
pub fn spawn_sentinel_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the SENTINEL just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -SENTINEL_RADIUS,
            0.0,
            SENTINEL_BASE_SPEED,
        ),
        1 => (
            field_w + SENTINEL_RADIUS,
            rng.range_f64(0.0, field_h),
            -SENTINEL_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + SENTINEL_RADIUS,
            0.0,
            -SENTINEL_BASE_SPEED,
        ),
        _ => (
            -SENTINEL_RADIUS,
            rng.range_f64(0.0, field_h),
            SENTINEL_BASE_SPEED,
            0.0,
        ),
    };

    let arc_dir = if rng.range_f64(0.0, 1.0) < 0.5 { -1.0 } else { 1.0 };
    let orbit_phase = rng.unit_circle_angle();
    let sweep_phase = rng.unit_circle_angle();

    EnemyState {
        id,
        kind: KIND_SENTINEL,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: SENTINEL_MAX_HP,
        max_hp: SENTINEL_MAX_HP,
        radius: SENTINEL_RADIUS,
        active: true,
        last_fire_tick: 0,
        arc_dir,
        spinup_progress: 0,
        orbit_phase,
        sweep_phase,
        ..EnemyState::default()
    }
}

/// Per-tick movement update for a SENTINEL. Picks the closest alive
/// ship as the orbit target; if none, holds field-center. The orbit
/// phase advances by `arc_dir * omega(spinup_progress)` each tick,
/// where omega ramps from 0 to `SENTINEL_OMEGA_MAX` via an ease-in
/// curve over `SENTINEL_SPINUP_TICKS` ticks. The SENTINEL chases a
/// point offset from the target along its orbit phase, producing the
/// visual "orbital strafe" read.
///
/// Also advances `sweep_phase` by `SENTINEL_SWEEP_OMEGA` per tick.
/// The sweep advances independently of the orbit/spinup so the firing
/// pattern stays predictable from spawn — Wave 2's fire dispatcher
/// reads `current_sweep_offset(s)` for the per-shot angle offset.
///
/// Position is clamped to the field (bounces off edges, mirroring
/// `enemy.rs`'s clamp pattern).
pub fn update_sentinel_movement(
    s: &mut EnemyState,
    targets: &[super::enemy::TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_SENTINEL {
        return;
    }

    // Advance sweep phase first — it's independent of target presence,
    // and keeping it deterministic means the firing pattern stays
    // predictable even if all players die mid-sweep.
    s.sweep_phase += SENTINEL_SWEEP_OMEGA;
    // Wrap to [0, 2π) to prevent unbounded growth (would eventually
    // lose precision against the polynomial sin's range reduction).
    while s.sweep_phase >= trig::TAU {
        s.sweep_phase -= trig::TAU;
    }
    while s.sweep_phase < 0.0 {
        s.sweep_phase += trig::TAU;
    }

    // Spinup ramp — clamps at SENTINEL_SPINUP_TICKS.
    if s.spinup_progress < SENTINEL_SPINUP_TICKS {
        s.spinup_progress += 1;
    }
    let progress = s.spinup_progress as f64 / SENTINEL_SPINUP_TICKS as f64;
    // Ease-in: progress² ramps slowly at the start, faster at the end.
    let eased = progress * progress;
    let omega = SENTINEL_OMEGA_MIN + eased * (SENTINEL_OMEGA_MAX - SENTINEL_OMEGA_MIN);

    // Pick closest alive target. If none, hold field center.
    let target = closest_target(targets, s.x, s.y);
    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    // Advance orbit phase. arc_dir is +1 (CW) or -1 (CCW).
    s.orbit_phase += omega * s.arc_dir;
    // Wrap to prevent unbounded growth.
    while s.orbit_phase >= trig::TAU {
        s.orbit_phase -= trig::TAU;
    }
    while s.orbit_phase < 0.0 {
        s.orbit_phase += trig::TAU;
    }

    // Orbit-offset chase target: a point on the orbit circle around
    // the player, NOT the player directly. The SENTINEL chases this
    // moving point, producing the visual orbit.
    let orbit_x = tx + trig::cos64(s.orbit_phase) * SENTINEL_ORBIT_RADIUS;
    let orbit_y = ty + trig::sin64(s.orbit_phase) * SENTINEL_ORBIT_RADIUS;

    let to_dx = orbit_x - s.x;
    let to_dy = orbit_y - s.y;
    let desired_angle = trig::atan2_64(to_dy, to_dx);

    // Smoothly turn toward the desired chase angle.
    s.angle = lerp_angle(s.angle, desired_angle, ANGLE_TURN_T);

    // Velocity along facing — constant orbital speed. Arc emerges
    // from the moving chase target, not from velocity accumulation.
    s.vx = trig::cos64(s.angle) * SENTINEL_BASE_SPEED;
    s.vy = trig::sin64(s.angle) * SENTINEL_BASE_SPEED;

    s.x += s.vx;
    s.y += s.vy;

    // Bounce off field edges (matches `enemy.rs`'s clamp pattern).
    let r = s.radius;
    if s.x - r < 0.0 {
        s.x = r;
        s.vx = s.vx.abs();
    } else if s.x + r > field_w {
        s.x = field_w - r;
        s.vx = -s.vx.abs();
    }
    if s.y - r < 0.0 {
        s.y = r;
        s.vy = s.vy.abs();
    } else if s.y + r > field_h {
        s.y = field_h - r;
        s.vy = -s.vy.abs();
    }
}

/// Current per-tick sweep angle offset (radians). Wave 2's fire
/// dispatcher computes the emit angle as
/// `aim_sentinel(s, target) + current_sweep_offset(s)` — the sin-wave
/// oscillates between `-SENTINEL_SWEEP_AMPLITUDE` and
/// `+SENTINEL_SWEEP_AMPLITUDE` across a `2π / SENTINEL_SWEEP_OMEGA`
/// tick period.
pub fn current_sweep_offset(s: &EnemyState) -> f64 {
    SENTINEL_SWEEP_AMPLITUDE * trig::sin64(s.sweep_phase)
}

/// Base aim angle from the SENTINEL to its target (radians). Wave 2
/// adds `current_sweep_offset(s)` to this to get the per-shot emit
/// angle.
pub fn aim_sentinel(
    s: &EnemyState,
    target: &super::enemy::TargetView,
) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// Internal: find the closest alive target. `None` if all dead/empty.
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
/// turn always takes the short way around the circle).
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
    use crate::mp1::enemy::TargetView;

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView { player_id, x, y, alive }
    }

    /// Two spawns with the same `(id, rng_subseed, field_w, field_h)`
    /// produce bit-identical state. This is THE determinism guarantee
    /// the orchestrator depends on — server + WASM client both call
    /// this and must agree.
    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_sentinel_from_seed(11, 0xCAFE_BABE, 1920.0, 1080.0);
        let b = spawn_sentinel_from_seed(11, 0xCAFE_BABE, 1920.0, 1080.0);
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
        assert_eq!(a.spinup_progress, b.spinup_progress);
        assert_eq!(a.orbit_phase.to_bits(), b.orbit_phase.to_bits());
        assert_eq!(a.sweep_phase.to_bits(), b.sweep_phase.to_bits());
        assert_eq!(a.arc_dir.to_bits(), b.arc_dir.to_bits());
    }

    /// Across 100 seeds, every spawn lands on one of the four edges
    /// (exactly `±SENTINEL_RADIUS` outside the field on the entry axis,
    /// inside `[0, field]` on the orthogonal axis). Sanity-checks
    /// `arc_dir`, orbit_phase, sweep_phase ranges.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_sentinel_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-SENTINEL_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + SENTINEL_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + SENTINEL_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-SENTINEL_RADIUS)).abs() < 1e-9;
            assert!(
                at_top || at_right || at_bottom || at_left,
                "seed {seed}: not at an edge — pos=({}, {})", s.x, s.y,
            );
            if at_top || at_bottom {
                assert!(s.x >= 0.0 && s.x <= fw, "seed {seed}: x out of field");
            }
            if at_left || at_right {
                assert!(s.y >= 0.0 && s.y <= fh, "seed {seed}: y out of field");
            }
            assert_eq!(s.kind, KIND_SENTINEL);
            assert!(s.active);
            assert!(s.arc_dir == 1.0 || s.arc_dir == -1.0);
            assert!(s.orbit_phase >= 0.0 && s.orbit_phase < trig::TAU);
            assert!(s.sweep_phase >= 0.0 && s.sweep_phase < trig::TAU);
            assert_eq!(s.spinup_progress, 0);
            assert_eq!(s.hp, SENTINEL_MAX_HP);
            assert_eq!(s.max_hp, SENTINEL_MAX_HP);
            assert_eq!(s.radius, SENTINEL_RADIUS);
        }
    }

    /// Different sub-seeds → different state. Guards against the
    /// sub-seed being accidentally dropped from the RNG path.
    #[test]
    fn spawn_seed_variation() {
        let a = spawn_sentinel_from_seed(1, 0x1111_1111, 1920.0, 1080.0);
        let b = spawn_sentinel_from_seed(1, 0x2222_2222, 1920.0, 1080.0);
        // At minimum one of orbit_phase / sweep_phase / arc_dir / edge
        // should differ across two distinct seeds.
        let any_diff = a.x != b.x
            || a.y != b.y
            || a.orbit_phase != b.orbit_phase
            || a.sweep_phase != b.sweep_phase
            || a.arc_dir != b.arc_dir;
        assert!(any_diff, "different sub-seeds should produce different state");
    }

    /// With no live targets, the SENTINEL drifts toward the field
    /// center (the fallback target). Starts far from center and
    /// confirms it moves closer over many ticks.
    #[test]
    fn update_no_target_drifts_predictably() {
        let mut s = spawn_sentinel_from_seed(2, 13, 1920.0, 1080.0);
        // Override spawn so we start at a controlled position.
        s.x = 100.0;
        s.y = 100.0;
        s.vx = SENTINEL_BASE_SPEED;
        s.vy = SENTINEL_BASE_SPEED;
        s.angle = trig::atan2_64(1.0, 1.0);
        let start_dist_to_center =
            ((960.0 - s.x).powi(2) + (540.0 - s.y).powi(2)).sqrt();
        let targets: [TargetView; 0] = [];
        for _ in 0..200 {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let end_dist_to_center =
            ((960.0 - s.x).powi(2) + (540.0 - s.y).powi(2)).sqrt();
        assert!(
            end_dist_to_center < start_dist_to_center,
            "should drift toward center (was {}, now {})",
            start_dist_to_center,
            end_dist_to_center,
        );
    }

    /// `spinup_progress` increments per tick and clamps at the cap.
    #[test]
    fn update_spinup_progresses() {
        let mut s = spawn_sentinel_from_seed(3, 99, 1920.0, 1080.0);
        s.x = 960.0;
        s.y = 540.0;
        let targets = [target(1, 700.0, 540.0, true)];
        // 5 ticks → progress = 5.
        for _ in 0..5 {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert_eq!(s.spinup_progress, 5);
        // Run past the cap; should clamp.
        for _ in 0..(SENTINEL_SPINUP_TICKS + 50) {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert_eq!(s.spinup_progress, SENTINEL_SPINUP_TICKS);
    }

    /// Over a long horizon, the SENTINEL approaches its `ORBIT_RADIUS`
    /// distance from the target — neither pinning to the player nor
    /// flying off to infinity.
    #[test]
    fn update_orbits_target() {
        let mut s = spawn_sentinel_from_seed(4, 7, 1920.0, 1080.0);
        s.x = 200.0;
        s.y = 540.0;
        let targets = [target(1, 960.0, 540.0, true)];
        // Run long enough to fully spin up and orbit several times.
        for _ in 0..1000 {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let dx = s.x - 960.0;
        let dy = s.y - 540.0;
        let dist = (dx * dx + dy * dy).sqrt();
        // After steady-state orbit, distance to target should be in
        // the neighborhood of ORBIT_RADIUS (within a generous band —
        // the chase has lag from ANGLE_TURN_T and speed).
        assert!(
            dist > 50.0 && dist < 500.0,
            "orbit dist should be in band [50, 500], got {}",
            dist,
        );
    }

    /// `sweep_phase` advances by `SENTINEL_SWEEP_OMEGA` per tick,
    /// modulo TAU. Starts at a known value and verifies the delta
    /// after a single tick.
    #[test]
    fn update_sweep_phase_advances() {
        let mut s = spawn_sentinel_from_seed(5, 42, 1920.0, 1080.0);
        s.x = 960.0;
        s.y = 540.0;
        // Pin to a known sweep_phase so the assertion is deterministic.
        s.sweep_phase = 1.0;
        let targets = [target(1, 700.0, 540.0, true)];
        update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        // Delta should be exactly SENTINEL_SWEEP_OMEGA (pure f64 add).
        let expected = 1.0 + SENTINEL_SWEEP_OMEGA;
        assert!(
            (s.sweep_phase - expected).abs() < 1e-12,
            "sweep_phase = {}, expected {}",
            s.sweep_phase,
            expected,
        );
    }

    /// `current_sweep_offset` is a sin wave through the sweep_phase —
    /// it crosses zero and changes sign over a full period. Sample at
    /// 0, π/2, π, 3π/2 and confirm the oscillation.
    #[test]
    fn current_sweep_offset_oscillates() {
        let mut s = spawn_sentinel_from_seed(6, 1, 1920.0, 1080.0);
        s.sweep_phase = 0.0;
        let at_0 = current_sweep_offset(&s);
        s.sweep_phase = trig::PI_2;
        let at_quarter = current_sweep_offset(&s);
        s.sweep_phase = trig::PI;
        let at_half = current_sweep_offset(&s);
        s.sweep_phase = trig::PI + trig::PI_2;
        let at_three_quarter = current_sweep_offset(&s);

        // sin(0) ≈ 0, sin(π/2) ≈ +1, sin(π) ≈ 0, sin(3π/2) ≈ -1.
        assert!(at_0.abs() < 1e-3, "at 0: {}", at_0);
        assert!(
            (at_quarter - SENTINEL_SWEEP_AMPLITUDE).abs() < 1e-3,
            "at π/2: {} (expected ~{})", at_quarter, SENTINEL_SWEEP_AMPLITUDE,
        );
        assert!(at_half.abs() < 1e-3, "at π: {}", at_half);
        assert!(
            (at_three_quarter + SENTINEL_SWEEP_AMPLITUDE).abs() < 1e-3,
            "at 3π/2: {} (expected ~-{})",
            at_three_quarter,
            SENTINEL_SWEEP_AMPLITUDE,
        );

        // Magnitude never exceeds amplitude.
        for i in 0..120 {
            s.sweep_phase = (i as f64) * 0.05;
            let off = current_sweep_offset(&s);
            assert!(
                off.abs() <= SENTINEL_SWEEP_AMPLITUDE + 1e-3,
                "offset {} exceeds amplitude at phase {}",
                off,
                s.sweep_phase,
            );
        }
    }

    /// Starting inside the left wall, the bounce logic clamps to
    /// `radius` and flips vx positive — same contract as `enemy.rs`.
    #[test]
    fn update_clamps_inside_field() {
        let mut s = spawn_sentinel_from_seed(7, 3, 1920.0, 1080.0);
        s.x = 5.0; // inside the left wall (radius = 22)
        s.y = 540.0;
        s.vx = -5.0;
        s.vy = 0.0;
        s.angle = trig::PI;
        let targets: [TargetView; 0] = [];
        update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        // After the bounce, x is clamped to radius and vx is positive.
        assert!(
            s.x >= s.radius - 1e-6,
            "x should be clamped to radius, got {}",
            s.x,
        );
        assert!(s.vx > 0.0, "vx should be positive after bounce, got {}", s.vx);

        // Run many ticks; SENTINEL should never escape the field bounds.
        for _ in 0..500 {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(
                s.x >= s.radius - 1e-6 && s.x <= 1920.0 - s.radius + 1e-6,
                "x out of field: {}", s.x,
            );
            assert!(
                s.y >= s.radius - 1e-6 && s.y <= 1080.0 - s.radius + 1e-6,
                "y out of field: {}", s.y,
            );
        }
    }

    /// `aim_sentinel` returns the angle from the SENTINEL to the
    /// target — the same value `atan2(ty - sy, tx - sx)` produces.
    /// Verified at the four cardinal directions.
    #[test]
    fn aim_sentinel_points_at_target() {
        let mut s = spawn_sentinel_from_seed(8, 5, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;

        // Target to the right → angle ≈ 0.
        let t_right = target(1, 1000.0, 500.0, true);
        assert!(aim_sentinel(&s, &t_right).abs() < 1e-6);

        // Target above (y smaller) → angle ≈ -π/2.
        let t_up = target(2, 500.0, 100.0, true);
        assert!((aim_sentinel(&s, &t_up) + trig::PI_2).abs() < 1e-6);

        // Target to the left → angle ≈ π (or -π; atan2(0, -x) = π).
        let t_left = target(3, 100.0, 500.0, true);
        let a_left = aim_sentinel(&s, &t_left);
        assert!(
            (a_left - trig::PI).abs() < 1e-6 || (a_left + trig::PI).abs() < 1e-6,
            "left angle should be ±π, got {}", a_left,
        );

        // Target below (y larger) → angle ≈ +π/2.
        let t_down = target(4, 500.0, 1000.0, true);
        assert!((aim_sentinel(&s, &t_down) - trig::PI_2).abs() < 1e-6);
    }

    /// Movement guard: an inactive SENTINEL stays put.
    #[test]
    fn update_skips_inactive() {
        let mut s = spawn_sentinel_from_seed(9, 17, 1920.0, 1080.0);
        s.x = 800.0;
        s.y = 400.0;
        s.active = false;
        let (x_before, y_before) = (s.x, s.y);
        let targets = [target(1, 100.0, 100.0, true)];
        for _ in 0..50 {
            update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert_eq!(s.x.to_bits(), x_before.to_bits());
        assert_eq!(s.y.to_bits(), y_before.to_bits());
        assert_eq!(s.spinup_progress, 0);
    }

    /// Movement guard: a wrong-kind enemy is not touched.
    #[test]
    fn update_skips_wrong_kind() {
        let mut s = spawn_sentinel_from_seed(10, 31, 1920.0, 1080.0);
        s.x = 800.0;
        s.y = 400.0;
        s.kind = 0; // pretend this slot got reused by another kind
        let (x_before, y_before) = (s.x, s.y);
        let targets = [target(1, 100.0, 100.0, true)];
        update_sentinel_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x.to_bits(), x_before.to_bits());
        assert_eq!(s.y.to_bits(), y_before.to_bits());
    }
}
