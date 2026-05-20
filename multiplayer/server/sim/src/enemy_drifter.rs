//! Phase 4 step 5 enemy sim — DRIFTER (sinusoidal-wave drifter that
//! fires lightning bolts).
//!
//! Fresh port from solo's `js/modules/enemy/{enemy-data,movement,
//! firing}.js`. Deterministic: every random draw goes through
//! `RngCtx` (seeded per-spawn from the `EnemySpawn` event's
//! `rng_subseed`), and every trig op goes through `super::trig::*`
//! (polynomial-bit-exact across native + WASM).
//!
//! Behavior summary: DRIFTER picks the closest alive ship as its
//! target, advances along the heading toward that ship, and overlays
//! a perpendicular sinusoidal swing whose phase advances by
//! `DRIFTER_WAVE_OMEGA` per tick. The net motion is an undulating
//! approach — the enemy weaves toward the player rather than chasing
//! in a straight line. Facing angle lerps toward the heading vector
//! at the same `ANGLE_TURN_T` (0.08) that `enemy.rs` uses, so the
//! visual turn-rate matches the HUNTER's port.
//!
//! Solo's `drifterWaveMovement` (movement.js around line 184) maintains
//! a fixed-distance orbit around the player with a sinusoidal
//! tangential velocity. We simplify to a pure approach-with-perpendicular-
//! sine: the sim doesn't need solo's `drifterOptimalDist` orbit lock
//! because the MP fire dispatcher fires whenever cooldown elapses
//! regardless of range, and the perpendicular sine gives the same
//! "weaves while approaching" visual read.
//!
//! Date: 2026-05-18
//!
//! ── Wave 2A unified-EnemyState adaptation ────────────────────────────
//! This module no longer defines its own `DrifterSpawnedFields` struct.
//! It reads/writes the unified `super::enemy::EnemyState` shared by all
//! 10 enemy kinds. DRIFTER uses the `wave_phase` + `wave_amplitude`
//! fields from that struct; all other per-kind fields are left at their
//! Default (0.0 / 0 / false) and ignored.
//!
//! ── MVP simplification: lightning chain ──────────────────────────────
//! Solo's `arc_lightning` pattern (firing.js `shootArcLightning` /
//! `createArcLightningBolt`) fires a chained lightning bolt that
//! arcs from the DRIFTER to its primary target and then jumps to
//! additional nearby targets. **Phase 4 step 5 ships only the
//! single aimed bolt.** The chain-to-additional-targets mechanic is
//! Phase 5+ polish — see plan. Wave 2 orchestrator (room.rs)
//! is expected to dispatch DRIFTER fire via
//! `enemy_bullet::spawn_aimed_default(...)` using the angle from
//! `aim_drifter(...)`. When the chain mechanic lands, this module
//! grows a dedicated `spawn_lightning_chain` constructor; until then,
//! DRIFTER fire is wire-identical to HUNTER's aimed-bullet path.

use super::enemy::EnemyState;
use super::trig;

/// DRIFTER kind discriminator. Matches `wave_table::KIND_DRIFTER`.
pub const KIND_DRIFTER: u8 = 4;

/// Base HP for a DRIFTER. Solo: `health: 9` (5.74.12 bump from 5).
pub const DRIFTER_MAX_HP: f64 = 9.0;

/// Movement speed (px/tick at 60 Hz). Calibrated for the sim's
/// constant-speed model; solo's `speed: 3.1` is a per-frame
/// acceleration parameter applied through `drifterWaveMovement`'s
/// `tangentialSpeed = wave * speed * 1.6` plus radial correction,
/// which averages to roughly half the listed `speed` value over a
/// full wave period. 2.0 reads visually similar in the sim.
pub const DRIFTER_BASE_SPEED: f64 = 2.0;

/// Body radius (px). Solo size 38 / 2.
pub const DRIFTER_RADIUS: f64 = 19.0;

/// Contact damage dealt to a ship on body-touch. Matches HUNTER's
/// `5.0` (no per-kind tuning yet — Phase 5 concern).
pub const DRIFTER_CONTACT_DAMAGE: f64 = 5.0;

/// Per-enemy fire cooldown (ticks). Solo cooldown range
/// `1500..5500 ms` midpoint ~3500 ms → ~210 ticks at 60 Hz. We use
/// 135 (~2.25 s) for the MVP since the MP fire path is single-shot
/// aimed (no chain), so a faster cadence preserves DRIFTER's
/// pressure-on-the-player role.
pub const DRIFTER_FIRE_COOLDOWN_TICKS: u32 = 135;

/// Preferred standoff range (px). Informational for Wave 2 — the
/// movement loop does NOT enforce this since the perpendicular-sine
/// approach naturally cycles in and out of the range zone. Solo:
/// `preferredRange: 280`.
pub const DRIFTER_PREFERRED_RANGE: f64 = 280.0;

/// Amplitude (px) of the perpendicular sinusoidal swing applied on
/// top of the heading-toward-target velocity. 60 px reads as a
/// noticeable weave at the target's screen scale without making the
/// enemy feel out of control.
pub const DRIFTER_WAVE_AMPLITUDE: f64 = 60.0;

/// Phase advance per tick (radians) for the wave term. 0.08
/// rad/tick → period `2π/0.08 ≈ 78.5` ticks ≈ 1.31 s at 60 Hz —
/// matches the "slow undulating arc" feel of solo's
/// `drifterWavePhase += 0.042` after the perpendicular-only
/// simplification (solo's larger phase term is divided into the
/// orbit+wave combination; the pure perpendicular sine here reads
/// fastest, so a tighter phase increment keeps the visual weave on
/// the same human-perceived cadence).
pub const DRIFTER_WAVE_OMEGA: f64 = 0.08;

/// Lerp factor used to turn the enemy's facing angle toward its
/// desired heading per tick. 0.08 mirrors solo's
/// `enemy.turnSpeed = 0.08` in `js/modules/enemy/enemy.js` (same as
/// HUNTER in `enemy.rs`).
const ANGLE_TURN_T: f64 = 0.08;

/// Spawn a DRIFTER at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce the same enemy.
///
/// Returns a fully-initialized `EnemyState` — orchestrator stores it
/// directly in the room's enemy slab. Per-kind fields populated:
/// `wave_phase`, `wave_amplitude`. All other per-kind fields fall
/// through `EnemyState::default()` and remain zero.
pub fn spawn_drifter_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    // Per-spawn RngCtx, seeded by the event's sub-seed. Sub-seed is
    // generated by the room's main `RngCtx` and shipped on the wire,
    // so server + client construct identical streams here without
    // contaminating the room's main RNG state.
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the enemy just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -DRIFTER_RADIUS,
            0.0,
            DRIFTER_BASE_SPEED,
        ),
        1 => (
            field_w + DRIFTER_RADIUS,
            rng.range_f64(0.0, field_h),
            -DRIFTER_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + DRIFTER_RADIUS,
            0.0,
            -DRIFTER_BASE_SPEED,
        ),
        _ => (
            -DRIFTER_RADIUS,
            rng.range_f64(0.0, field_h),
            DRIFTER_BASE_SPEED,
            0.0,
        ),
    };

    // Seed the wave term. Random phase decorrelates two DRIFTERs in
    // the same wave; amplitude jitter (±25%) gives each one a
    // slightly different weave width.
    let wave_phase = rng.unit_circle_angle();
    let wave_amplitude = rng.range_f64(
        DRIFTER_WAVE_AMPLITUDE * 0.75,
        DRIFTER_WAVE_AMPLITUDE * 1.25,
    );

    EnemyState {
        id,
        kind: KIND_DRIFTER,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: DRIFTER_MAX_HP,
        max_hp: DRIFTER_MAX_HP,
        radius: DRIFTER_RADIUS,
        active: true,
        last_fire_tick: 0,
        wave_phase,
        wave_amplitude,
        ..EnemyState::default()
    }
}

/// Per-tick movement update for a DRIFTER. Picks the closest alive
/// ship as target, advances along the heading toward it, and overlays
/// a perpendicular sinusoidal swing. Clamps position to the field
/// and bounces off edges. The wave phase ALWAYS advances each tick,
/// even if there is no target — keeps the visual cadence stable when
/// all ships are downed.
///
/// Guards on inactive or non-DRIFTER states so the orchestrator can
/// blindly fan out the full enemy slab to every kind's update fn.
pub fn update_drifter_movement(
    s: &mut EnemyState,
    targets: &[super::enemy::TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_DRIFTER {
        return;
    }

    // Advance wave phase unconditionally; the perpendicular swing
    // belongs to the DRIFTER, not to the target.
    s.wave_phase += DRIFTER_WAVE_OMEGA;

    // Pick closest alive target. If none, drift toward field center
    // (same fallback HUNTER uses) so the enemy stays on-screen and
    // visible.
    let target = closest_target(targets, s.x, s.y);
    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    let to_dx = tx - s.x;
    let to_dy = ty - s.y;
    let desired_angle = trig::atan2_64(to_dy, to_dx);

    // Smoothly turn toward the desired angle (avoid snap-rotation).
    s.angle = lerp_angle(s.angle, desired_angle, ANGLE_TURN_T);

    // Heading velocity (along facing).
    let heading_vx = trig::cos64(s.angle) * DRIFTER_BASE_SPEED;
    let heading_vy = trig::sin64(s.angle) * DRIFTER_BASE_SPEED;

    // Perpendicular sine swing. The perpendicular unit vector to
    // (cos a, sin a) is (-sin a, cos a). Speed = amplitude · ω ·
    // sin(phase) — derivative of an amplitude-scaled sinusoid,
    // expressed as a per-tick velocity so the integrated path is the
    // intended sine wave.
    let perp_speed = s.wave_amplitude * DRIFTER_WAVE_OMEGA * trig::sin64(s.wave_phase);
    let perp_x = -trig::sin64(s.angle) * perp_speed;
    let perp_y = trig::cos64(s.angle) * perp_speed;

    s.vx = heading_vx + perp_x;
    s.vy = heading_vy + perp_y;

    s.x += s.vx;
    s.y += s.vy;

    // Bounce off field edges (matches HUNTER's clamp).
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

/// Compute the firing angle from a DRIFTER to a target. The Wave 2
/// fire dispatcher feeds this into
/// `enemy_bullet::spawn_aimed_default(...)` as the bullet angle.
/// Until the lightning-chain entity lands (Phase 5+), this is the
/// canonical DRIFTER aim.
pub fn aim_drifter(s: &EnemyState, target: &super::enemy::TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// Internal: find the closest alive target. `None` if all dead/empty.
/// Mirrors `enemy::closest_target` (intentionally duplicated here so
/// this module compiles standalone and doesn't widen `enemy.rs`'s
/// public surface).
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
/// turn always takes the short way around the circle). Same shape as
/// `enemy::lerp_angle`.
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
    use super::super::enemy::TargetView;
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
        let a = spawn_drifter_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_drifter_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.wave_phase.to_bits(), b.wave_phase.to_bits());
        assert_eq!(a.wave_amplitude.to_bits(), b.wave_amplitude.to_bits());
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn spawn_sets_kind_and_active() {
        let s = spawn_drifter_from_seed(42, 0xCAFE, 1920.0, 1080.0);
        assert_eq!(s.id, 42);
        assert_eq!(s.kind, KIND_DRIFTER);
        assert!(s.active);
        assert_eq!(s.last_fire_tick, 0);
        // Unrelated per-kind fields should be at default zero.
        assert_eq!(s.arc_dir, 0.0);
        assert_eq!(s.arc_radius, 0.0);
        assert_eq!(s.zigzag_phase, 0.0);
        assert_eq!(s.spinup_progress, 0);
    }

    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_drifter_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-DRIFTER_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + DRIFTER_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + DRIFTER_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-DRIFTER_RADIUS)).abs() < 1e-9;
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
            // Wave amplitude within the spawn jitter band.
            assert!(
                s.wave_amplitude >= DRIFTER_WAVE_AMPLITUDE * 0.75
                    && s.wave_amplitude < DRIFTER_WAVE_AMPLITUDE * 1.25,
                "seed {seed}: wave_amplitude {} out of jitter band",
                s.wave_amplitude
            );
            assert!(s.wave_phase >= 0.0 && s.wave_phase < trig::TAU);
            assert_eq!(s.hp, DRIFTER_MAX_HP);
            assert_eq!(s.max_hp, DRIFTER_MAX_HP);
            assert_eq!(s.radius, DRIFTER_RADIUS);
            assert_eq!(s.kind, KIND_DRIFTER);
            assert!(s.active);
        }
    }

    #[test]
    fn spawn_seed_variation() {
        // Two different seeds should produce at least some different
        // field values — guards against accidentally constant spawn.
        let a = spawn_drifter_from_seed(0, 1, 1920.0, 1080.0);
        let b = spawn_drifter_from_seed(0, 2, 1920.0, 1080.0);
        let differs = a.x != b.x
            || a.y != b.y
            || a.wave_phase != b.wave_phase
            || a.wave_amplitude != b.wave_amplitude;
        assert!(
            differs,
            "different seeds produced identical state: a={:?} b={:?}",
            a, b
        );
    }

    #[test]
    fn update_no_target_drifts_predictably() {
        // No targets → drifts toward field center. Place at corner so
        // both x and y should move toward 960, 540.
        let mut s = spawn_drifter_from_seed(2, 13, 1920.0, 1080.0);
        s.x = 200.0;
        s.y = 200.0;
        s.vx = DRIFTER_BASE_SPEED;
        s.vy = DRIFTER_BASE_SPEED;
        s.angle = trig::atan2_64(1.0, 1.0);
        let start_x = s.x;
        let start_y = s.y;
        let targets: [TargetView; 0] = [];
        for _ in 0..100 {
            update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert!(
            s.x > start_x,
            "x should drift toward center 960, got {} -> {}",
            start_x,
            s.x
        );
        assert!(
            s.y > start_y,
            "y should drift toward center 540, got {} -> {}",
            start_y,
            s.y
        );
    }

    #[test]
    fn update_wave_phase_advances() {
        let mut s = spawn_drifter_from_seed(3, 99, 1920.0, 1080.0);
        s.x = 960.0;
        s.y = 540.0;
        let initial_phase = s.wave_phase;
        let targets = [target(1, 100.0, 540.0, true)];
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        let delta = s.wave_phase - initial_phase;
        assert!(
            (delta - DRIFTER_WAVE_OMEGA).abs() < 1e-12,
            "phase delta should be DRIFTER_WAVE_OMEGA, got {}",
            delta
        );

        // Advance another tick — phase should keep stepping by ω.
        let phase_after_one = s.wave_phase;
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        let delta2 = s.wave_phase - phase_after_one;
        assert!(
            (delta2 - DRIFTER_WAVE_OMEGA).abs() < 1e-12,
            "second phase delta should also be ω, got {}",
            delta2
        );
    }

    #[test]
    fn update_perpendicular_offset_oscillates() {
        // Project the position onto the perpendicular of the initial
        // heading and verify it oscillates: it crosses zero, swings
        // positive, swings negative.
        let mut s = spawn_drifter_from_seed(4, 555, 1920.0, 1080.0);
        // Place at a fixed point. Heading +x toward a target far to
        // the right. Perpendicular axis is then +y.
        s.x = 200.0;
        s.y = 540.0;
        s.angle = 0.0; // facing +x
        s.wave_phase = 0.0; // start at sin(0) = 0
        s.wave_amplitude = DRIFTER_WAVE_AMPLITUDE; // pin for predictability
        let targets = [target(1, 1800.0, 540.0, true)];

        let mut samples_y: Vec<f64> = Vec::with_capacity(120);
        // Sample y over roughly one wave period (≈ 78 ticks at ω=0.08).
        // Use 120 ticks to span more than a full period regardless of
        // the heading drift's effect on `s.angle`.
        for _ in 0..120 {
            update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
            samples_y.push(s.y);
        }

        let max_y = samples_y.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let min_y = samples_y.iter().cloned().fold(f64::INFINITY, f64::min);
        // The y range should span more than a few pixels — the wave is
        // genuinely oscillating, not flatlined.
        let span = max_y - min_y;
        assert!(
            span > 10.0,
            "perpendicular swing too small: span={} (max={} min={})",
            span,
            max_y,
            min_y
        );
        // Y should swing on BOTH sides of the starting y=540 — sign
        // change confirms it's oscillating, not just drifting.
        let above_start = samples_y.iter().any(|&y| y > 540.5);
        let below_start = samples_y.iter().any(|&y| y < 539.5);
        assert!(
            above_start && below_start,
            "y should swing on both sides of 540 — above={} below={}",
            above_start,
            below_start
        );
    }

    #[test]
    fn update_closes_toward_target() {
        // Over ~120 ticks, the average distance to a stationary target
        // should decrease. Use averages (not the final tick) so the
        // wave's perpendicular phase doesn't fool the test.
        let mut s = spawn_drifter_from_seed(5, 4242, 1920.0, 1080.0);
        s.x = 1700.0;
        s.y = 540.0;
        s.vx = -DRIFTER_BASE_SPEED;
        s.vy = 0.0;
        s.angle = trig::PI; // facing -x toward the target at x=200
        let targets = [target(1, 200.0, 540.0, true)];

        // Distance at t=0 (just before update).
        let initial_dist = ((targets[0].x - s.x).powi(2) + (targets[0].y - s.y).powi(2)).sqrt();

        // Sample distance every tick; compare the first quarter average
        // against the last quarter average.
        let mut dists: Vec<f64> = Vec::with_capacity(120);
        for _ in 0..120 {
            update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
            let d =
                ((targets[0].x - s.x).powi(2) + (targets[0].y - s.y).powi(2)).sqrt();
            dists.push(d);
        }
        let first_quarter: f64 = dists[..30].iter().sum::<f64>() / 30.0;
        let last_quarter: f64 = dists[90..120].iter().sum::<f64>() / 30.0;
        assert!(
            last_quarter < first_quarter,
            "should close toward target: first-quarter avg dist={}, last-quarter avg dist={} (initial={})",
            first_quarter,
            last_quarter,
            initial_dist
        );
    }

    #[test]
    fn update_clamps_inside_field() {
        // Push the DRIFTER hard against the left wall — it should
        // clamp (x >= radius) and reverse vx, never penetrating.
        let mut s = spawn_drifter_from_seed(6, 100, 1920.0, 1080.0);
        s.x = 5.0;
        s.y = 540.0;
        s.vx = -10.0;
        s.vy = 0.0;
        s.angle = trig::PI;
        let targets: [TargetView; 0] = [];
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        assert!(
            s.x >= s.radius - 1e-6,
            "x should clamp to >= radius, got {}",
            s.x
        );
        assert!(
            s.vx >= 0.0,
            "vx should be non-negative after bounce, got {}",
            s.vx
        );

        // Right wall mirror.
        let mut s = spawn_drifter_from_seed(7, 101, 1920.0, 1080.0);
        s.x = 1915.0;
        s.y = 540.0;
        s.vx = 10.0;
        s.vy = 0.0;
        s.angle = 0.0;
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        assert!(
            s.x <= 1920.0 - s.radius + 1e-6,
            "x should clamp to <= field_w - radius, got {}",
            s.x
        );
        assert!(
            s.vx <= 0.0,
            "vx should be non-positive after bounce, got {}",
            s.vx
        );
    }

    #[test]
    fn update_ignores_inactive_or_wrong_kind() {
        // Inactive DRIFTER must not advance — guards the fan-out
        // pattern where the orchestrator hands the whole enemy slab
        // to every kind's update fn.
        let mut s = spawn_drifter_from_seed(10, 10, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        s.active = false;
        let phase_before = s.wave_phase;
        let targets = [target(1, 100.0, 500.0, true)];
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x, 500.0, "inactive DRIFTER should not move");
        assert_eq!(s.y, 500.0, "inactive DRIFTER should not move");
        assert_eq!(s.wave_phase, phase_before, "phase must not advance");

        // Wrong-kind state (active but not a DRIFTER) must also be skipped.
        let mut s = spawn_drifter_from_seed(11, 11, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        s.kind = 0; // pretend it's a HUNTER
        let phase_before = s.wave_phase;
        update_drifter_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x, 500.0, "non-DRIFTER state should not move");
        assert_eq!(s.y, 500.0, "non-DRIFTER state should not move");
        assert_eq!(s.wave_phase, phase_before, "phase must not advance");
    }

    #[test]
    fn aim_drifter_points_at_target() {
        // Target due east. Aim should be ≈ 0 rad.
        let mut s = spawn_drifter_from_seed(8, 200, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        let t = target(1, 1000.0, 500.0, true);
        let a = aim_drifter(&s, &t);
        assert!(a.abs() < 1e-4, "aim east should be ~0, got {}", a);

        // Target due north (y smaller). With +y = down screen, "north"
        // (target above) is angle -π/2.
        let t = target(1, 500.0, 100.0, true);
        let a = aim_drifter(&s, &t);
        assert!(
            (a - (-trig::PI_2)).abs() < 1e-4,
            "aim up should be ~-π/2, got {}",
            a
        );

        // Target due south.
        let t = target(1, 500.0, 900.0, true);
        let a = aim_drifter(&s, &t);
        assert!(
            (a - trig::PI_2).abs() < 1e-4,
            "aim down should be ~π/2, got {}",
            a
        );

        // Target due west.
        let t = target(1, 100.0, 500.0, true);
        let a = aim_drifter(&s, &t);
        assert!(
            (a.abs() - trig::PI).abs() < 1e-4,
            "aim west should be ~±π, got {}",
            a
        );
    }

    #[test]
    fn consts_sensible() {
        assert!(DRIFTER_MAX_HP > 0.0);
        assert!(DRIFTER_BASE_SPEED > 0.0);
        assert!(DRIFTER_RADIUS > 0.0);
        assert!(DRIFTER_CONTACT_DAMAGE > 0.0);
        assert!(DRIFTER_FIRE_COOLDOWN_TICKS > 0);
        assert!(DRIFTER_PREFERRED_RANGE > 0.0);
        assert!(DRIFTER_WAVE_AMPLITUDE > 0.0);
        assert!(DRIFTER_WAVE_OMEGA > 0.0);
        // DRIFTER is sturdier than HUNTER but not boss-tier.
        assert!(DRIFTER_MAX_HP > super::super::enemy::HUNTER_MAX_HP);
        // Kind discriminator matches the wave table.
        assert_eq!(KIND_DRIFTER, super::super::wave_table::KIND_DRIFTER);
        // Wave period should be at least a half-second so the weave is
        // visible to the player (not a high-freq jitter). At 60 Hz,
        // period = 2π/ω ticks → real time = 2π/(ω·60) seconds.
        let period_seconds = trig::TAU / (DRIFTER_WAVE_OMEGA * 60.0);
        assert!(
            period_seconds > 0.5 && period_seconds < 5.0,
            "wave period {}s outside [0.5, 5.0]",
            period_seconds
        );
    }
}
