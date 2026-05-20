//! Phase 4 step 5 — WASP enemy. Fast zigzagging harasser that aims
//! aimed shots in rapid bursts. Mid HP.
//!
//! Fresh rewrite from solo's
//!   - `js/modules/enemy/enemy-data.js`        (WASP base stats)
//!   - `js/modules/enemy/movement.js`          (`waspZigzagMovement`)
//!   - `js/modules/enemy/firing.js`            (`updateWaspMachineGun`,
//!                                              `shootWaspBullet`)
//!
//! Deterministic: every random draw goes through `RngCtx`
//! (seeded per-spawn from the `EnemySpawn` event's `rng_subseed`)
//! and every trig op goes through `super::trig::*` (polynomial-bit-
//! exact across native + WASM).
//!
//! Authored 2026-05-18 as part of Phase 4 step 5 Wave 1 parallel
//! dispatch. Wave 2A adapted the module to the unified `EnemyState`
//! shape in `super::enemy` — the per-kind `WaspSpawnedFields` struct
//! is gone; spawn/update/aim all operate on `EnemyState` and only
//! read/write the WASP-relevant fields (`zigzag_phase`,
//! `zigzag_amplitude`) on top of the common header.
//!
//! Behavioral deviations from solo's `waspZigzagMovement` /
//! `updateWaspMachineGun` (intentional, determinism-driven):
//!   - No `frameClock.now`-based state machine (zigzag vs cooldown,
//!     firing vs charging). Solo rolls those phase transitions and
//!     their durations against wall-clock + `Math.random()`; the sim
//!     has no wall-clock and re-deriving identical wall-times across
//!     server + WASM is fragile. Phase 4 keeps the *visual read*
//!     (zigzag perpendicular oscillation + drift toward player) but
//!     drives the oscillation off a deterministic phase counter
//!     advanced per tick.
//!   - No state-machine cooldown phase. The WASP zigzags
//!     continuously — the perpendicular oscillation averages to
//!     forward motion across one period anyway, and the rapid sign
//!     flips give the visual harasser feel without the stop-and-go
//!     state transitions that would be hard to keep deterministic.
//!   - No randomized burst count / segment duration (`waspZigzagMax`,
//!     `waspZigzagSegmentDuration`). The Wave 2 orchestrator owns
//!     fire-cooldown randomization at the room level via the room
//!     RNG; movement-pattern randomization stays static here so two
//!     simulations stay in lockstep without needing a per-enemy RNG
//!     advance every tick.
//!   - Aimed-shot tolerance check (solo's ±30° gate before firing)
//!     is dropped — Wave 2's fire dispatcher gates firing on the
//!     `WASP_FIRE_COOLDOWN_TICKS` budget alone. The aim is always
//!     toward the closest target; the rapid sign flips in zigzag
//!     naturally produce missed shots without an explicit gate.

use super::enemy::{EnemyState, TargetView};
use super::trig;

/// WASP kind discriminator. Matches `wave_table::KIND_WASP` (the
/// public, table-side reservation). Re-exported here so the enemy
/// module owns its own discriminator (parallel to `enemy::KIND_HUNTER`).
pub const KIND_WASP: u8 = 2;

/// Base HP for a WASP. Solo: `health: 5` (enemy-data.js v5.74.12).
pub const WASP_MAX_HP: f64 = 5.0;

/// Body radius (px). Solo `size: 36` → half = radius (matches
/// HUNTER's radius convention).
pub const WASP_RADIUS: f64 = 18.0;

/// Movement speed (px/tick at 60 Hz). Solo uses `speed: 3.5` at
/// variable FPS with a `zigSpeed = config.speed * 2.6` multiplier
/// during the zigzag phase. Calibrated for 60 Hz: HUNTER ships at
/// 1.4; WASP is the fast harasser so we sit at 2.3 (~1.6x HUNTER).
/// This is the forward-drift speed; the zigzag oscillation adds
/// perpendicular velocity on top.
pub const WASP_BASE_SPEED: f64 = 2.3;

/// Contact damage dealt to a ship on body-touch. Solo's contact
/// damage scales loosely with size/aggression; WASP is fast + makes
/// frequent passes, so contact is meaningful but less than HUNTER's
/// (5.0). 3.0 matches the "faster + more frequent contact" rationale.
pub const WASP_CONTACT_DAMAGE: f64 = 3.0;

/// Per-enemy fire cooldown in ticks. Solo's cooldown is
/// `min: 450, max: 2000` ms; at 60 Hz that's 27-120 ticks. We pick
/// the low end (45 ticks ≈ 750 ms) for the machinegun feel.
/// Per-WASP randomization in the table range is Wave 2's job.
pub const WASP_FIRE_COOLDOWN_TICKS: u32 = 45;

/// Zigzag perpendicular-oscillation amplitude (px/tick). Drives the
/// sideways velocity component added on top of forward drift each
/// tick. Tuned so the visual sway is comparable to solo's `zigSpeed
/// = config.speed * 2.6` ≈ 9.1 px/frame perpendicular kick: we
/// continuously oscillate ±2.6 around zero (peak sideways speed
/// 2.6 px/tick, average 1.65) which reads as the same harasser sway
/// without solo's sharp state-transition jolts.
pub const WASP_ZIGZAG_AMPLITUDE: f64 = 2.6;

/// Phase increment per tick (radians). Period = TAU / 0.10 = ~63
/// ticks ≈ 1.05 s for a full left-right-left cycle. Solo's segment
/// duration is 280-500 ms per side ≈ 17-30 ticks per quarter
/// period; one full solo cycle is roughly 70-120 ticks. We sit
/// inside that band at a deterministic 63 ticks/cycle.
pub const WASP_ZIGZAG_PHASE_STEP: f64 = 0.10;

/// Angle-lerp factor (radians/tick) used to turn the WASP's facing
/// toward its desired heading. Solo's `turnSpeed: 0.12` for WASP
/// (enemy-data.js movement block) — faster than HUNTER's 0.08
/// because the WASP needs to track quick zigzag heading changes.
const ANGLE_TURN_T: f64 = 0.12;

/// Spawn a WASP at the given seed. Both server and WASM client call
/// this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce identical state.
///
/// Edge-spawn pattern mirrors HUNTER's: pick one of four field
/// edges, place the WASP just outside, assign initial velocity
/// inward at `WASP_BASE_SPEED`. The zigzag phase is seeded from
/// the RNG so two WASPs from different sub-seeds oscillate out
/// of phase.
///
/// Returns a unified `EnemyState`: the common header is populated
/// plus `zigzag_phase` and `zigzag_amplitude`; all other per-kind
/// fields (arc_*, square_*, charge_*, wave_*, etc.) are zeroed via
/// `..EnemyState::default()`.
pub fn spawn_wasp_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    // Per-spawn RngCtx, seeded by the event's sub-seed. Same
    // contamination-guard pattern as HUNTER (see `enemy.rs`).
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the WASP just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -WASP_RADIUS,
            0.0,
            WASP_BASE_SPEED,
        ),
        1 => (
            field_w + WASP_RADIUS,
            rng.range_f64(0.0, field_h),
            -WASP_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + WASP_RADIUS,
            0.0,
            -WASP_BASE_SPEED,
        ),
        _ => (
            -WASP_RADIUS,
            rng.range_f64(0.0, field_h),
            WASP_BASE_SPEED,
            0.0,
        ),
    };

    // Seed the zigzag phase in [0, 2π) so two WASPs spawned with
    // different sub-seeds don't oscillate in lockstep.
    let zigzag_phase = rng.unit_circle_angle();

    EnemyState {
        id,
        kind: KIND_WASP,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: WASP_MAX_HP,
        max_hp: WASP_MAX_HP,
        radius: WASP_RADIUS,
        active: true,
        last_fire_tick: 0,
        zigzag_phase,
        zigzag_amplitude: WASP_ZIGZAG_AMPLITUDE,
        ..EnemyState::default()
    }
}

/// Per-tick update for a WASP. Picks closest alive ship as target,
/// drifts toward it at `WASP_BASE_SPEED`, adds a perpendicular
/// `zigzag_amplitude * sin(zigzag_phase)` sideways kick, clamps to
/// field. Mirrors solo's `waspZigzagMovement` zigzag-toward-player
/// pattern minus the wall-clock state machine.
///
/// Guard: early-return if `!s.active` or `s.kind != KIND_WASP` so a
/// stray dispatch with the wrong kind is a no-op (mirrors HUNTER's
/// `update_enemy` pattern in `enemy.rs`).
pub fn update_wasp_movement(
    s: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_WASP {
        return;
    }

    // Advance zigzag phase — deterministic, monotonic, never NaN
    // (pure `+` on f64). Sign of sin(phase) flips every π / step
    // ≈ 31 ticks; full cycle ≈ 63 ticks.
    s.zigzag_phase += WASP_ZIGZAG_PHASE_STEP;
    // Keep phase bounded to avoid f64 precision drift across very
    // long sessions. Subtract TAU when phase exceeds it — the sin/cos
    // values are unchanged (period TAU) but the magnitude stays small.
    if s.zigzag_phase >= trig::TAU {
        s.zigzag_phase -= trig::TAU;
    }

    // Pick closest alive target. If none, drift toward field center
    // (same fallback as HUNTER — keeps the WASP from drifting off
    // the field when all ships are down).
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

    // Forward drift along facing.
    let fwd_x = trig::cos64(s.angle) * WASP_BASE_SPEED;
    let fwd_y = trig::sin64(s.angle) * WASP_BASE_SPEED;

    // Perpendicular zigzag kick. Perp vector is the facing rotated
    // by +π/2: (-sin, +cos). Magnitude is
    // `zigzag_amplitude * sin(zigzag_phase)` — oscillates ±amplitude
    // each half-cycle.
    let perp_x = -trig::sin64(s.angle);
    let perp_y = trig::cos64(s.angle);
    let perp_mag = s.zigzag_amplitude * trig::sin64(s.zigzag_phase);

    s.vx = fwd_x + perp_x * perp_mag;
    s.vy = fwd_y + perp_y * perp_mag;

    s.x += s.vx;
    s.y += s.vy;

    // Clamp to field. WASP doesn't bounce — it just gets clamped to
    // the edge if it would leave. This is intentional: the zigzag
    // oscillation naturally pulls it back inward on the next tick
    // (the perpendicular sign flips), so a hard clamp without a
    // velocity flip avoids the WASP getting "stuck" reversing
    // direction every frame at the wall.
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

/// Compute the aimed-fire angle from a WASP to a target. Returns
/// `atan2_64(dy, dx)` directly — the Wave 2 fire dispatcher feeds
/// this into `enemy_bullet::spawn_aimed_default` (or `spawn` with
/// custom params).
///
/// Pure read — does not mutate the WASP. The dispatcher in
/// `room.rs` will:
///   1. Call `closest_target(...)` (using its own room-side helper)
///      to pick a target.
///   2. Call `aim_wasp(state, &target)` to get the angle.
///   3. Call `enemy_bullet::spawn(...)` with that angle.
///   4. Push the bullet onto `RoomState.enemy_bullets`.
///   5. Update `state.last_fire_tick = current_tick`.
pub fn aim_wasp(s: &EnemyState, target: &TargetView) -> f64 {
    let dx = target.x - s.x;
    let dy = target.y - s.y;
    trig::atan2_64(dy, dx)
}

/// Internal: find the closest alive target. `None` if all dead/empty.
/// Duplicates `enemy.rs::closest_target` rather than importing it —
/// keeps each enemy module standalone (Wave 1 file-ownership rule)
/// and the implementations are trivial.
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

/// Internal: angle lerp via shortest path (handles ±π wrap so the
/// turn always takes the short way around the circle). Duplicates
/// `enemy.rs::lerp_angle` for the same Wave 1 file-ownership reason.
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
        let a = spawn_wasp_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_wasp_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.zigzag_phase.to_bits(), b.zigzag_phase.to_bits());
        assert_eq!(a.zigzag_amplitude.to_bits(), b.zigzag_amplitude.to_bits());
        assert_eq!(a.active, b.active);
        assert_eq!(a.last_fire_tick, b.last_fire_tick);
    }

    /// Spawned WASP sits at exactly one of the four field edges, on
    /// the spawning axis at ±WASP_RADIUS outside the field and on the
    /// orthogonal axis inside [0, field_dim]. Sweep 100 seeds.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let w = spawn_wasp_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (w.y - (-WASP_RADIUS)).abs() < 1e-9;
            let at_right = (w.x - (fw + WASP_RADIUS)).abs() < 1e-9;
            let at_bottom = (w.y - (fh + WASP_RADIUS)).abs() < 1e-9;
            let at_left = (w.x - (-WASP_RADIUS)).abs() < 1e-9;
            assert!(
                at_top || at_right || at_bottom || at_left,
                "seed {seed}: not at an edge — pos=({}, {})",
                w.x,
                w.y
            );
            if at_top || at_bottom {
                assert!(w.x >= 0.0 && w.x <= fw, "seed {seed}: x out of field");
            }
            if at_left || at_right {
                assert!(w.y >= 0.0 && w.y <= fh, "seed {seed}: y out of field");
            }
            // Common spawn invariants.
            assert_eq!(w.kind, KIND_WASP);
            assert_eq!(w.hp, WASP_MAX_HP);
            assert_eq!(w.max_hp, WASP_MAX_HP);
            assert_eq!(w.radius, WASP_RADIUS);
            assert_eq!(w.zigzag_amplitude, WASP_ZIGZAG_AMPLITUDE);
            assert!(w.active);
            assert_eq!(w.last_fire_tick, 0);
            // Zigzag phase seeded into [0, TAU).
            assert!(w.zigzag_phase >= 0.0 && w.zigzag_phase < trig::TAU);
            // Unused per-kind fields must be zero (from EnemyState::default()).
            assert_eq!(w.arc_dir, 0.0);
            assert_eq!(w.arc_radius, 0.0);
            assert_eq!(w.arc_omega, 0.0);
            assert_eq!(w.arc_phase, 0.0);
            assert_eq!(w.square_corner_idx, 0);
            assert_eq!(w.square_dir, 0.0);
            assert_eq!(w.charge_progress, 0);
            assert_eq!(w.wave_phase, 0.0);
            assert_eq!(w.wave_amplitude, 0.0);
            assert_eq!(w.spinup_progress, 0);
            assert_eq!(w.orbit_phase, 0.0);
            assert_eq!(w.spiral_phase, 0.0);
            assert_eq!(w.sweep_phase, 0.0);
            assert_eq!(w.momentum_dir, 0.0);
            assert_eq!(w.momentum_t, 0.0);
        }
    }

    /// Different sub-seeds produce different positions and phases.
    /// Property: we get variety, not lockstep WASPs all spawning at
    /// the same edge with the same phase.
    #[test]
    fn spawn_seed_variation() {
        let mut positions = std::collections::HashSet::new();
        let mut phases = std::collections::HashSet::new();
        for seed in 0..30u64 {
            let w = spawn_wasp_from_seed(1, seed.wrapping_mul(1_000_003), 1920.0, 1080.0);
            positions.insert((w.x.to_bits(), w.y.to_bits()));
            phases.insert(w.zigzag_phase.to_bits());
        }
        // Vastly different sub-seeds should yield ≥ 25 unique pos +
        // phase values out of 30 (tolerance for the rare edge-coord
        // collision; phases are continuous so collisions are vanishingly
        // unlikely).
        assert!(positions.len() >= 25, "got {} unique positions", positions.len());
        assert!(phases.len() >= 25, "got {} unique phases", phases.len());
    }

    /// With no targets, WASP zigzags toward the field center and
    /// stays bounded — no NaN, no infinities, stays inside the field.
    #[test]
    fn update_no_target_drifts_predictably() {
        let mut w = spawn_wasp_from_seed(1, 42, 1920.0, 1080.0);
        // Override spawn position to start at a known interior point.
        w.x = 100.0;
        w.y = 100.0;
        w.vx = WASP_BASE_SPEED;
        w.vy = WASP_BASE_SPEED;
        w.angle = trig::atan2_64(1.0, 1.0);
        let targets: [TargetView; 0] = [];
        for _ in 0..240 {
            update_wasp_movement(&mut w, &targets, 1920.0, 1080.0);
            assert!(w.x.is_finite(), "x became non-finite: {}", w.x);
            assert!(w.y.is_finite(), "y became non-finite: {}", w.y);
            assert!(w.vx.is_finite(), "vx became non-finite: {}", w.vx);
            assert!(w.vy.is_finite(), "vy became non-finite: {}", w.vy);
        }
        // After 4 s of update, the WASP should be in the interior
        // (it was heading toward center).
        assert!(w.x > 50.0 && w.x < 1900.0);
        assert!(w.y > 50.0 && w.y < 1070.0);
    }

    /// Over ~60 ticks (1 s) with a stationary target, the WASP
    /// closes distance to it. Doesn't matter exactly how much —
    /// what matters is the average drift is toward the target, not
    /// away or sideways.
    #[test]
    fn update_moves_toward_target() {
        let mut w = spawn_wasp_from_seed(1, 42, 1920.0, 1080.0);
        // Override spawn to a controlled point regardless of edge.
        w.x = 1500.0;
        w.y = 500.0;
        w.vx = -WASP_BASE_SPEED;
        w.vy = 0.0;
        w.angle = trig::PI; // pointing left toward target
        let start_dist = ((w.x - 500.0).powi(2) + (w.y - 500.0).powi(2)).sqrt();
        let targets = [target(99, 500.0, 500.0, true)];
        for _ in 0..60 {
            update_wasp_movement(&mut w, &targets, 1920.0, 1080.0);
        }
        let end_dist = ((w.x - 500.0).powi(2) + (w.y - 500.0).powi(2)).sqrt();
        assert!(
            end_dist < start_dist,
            "WASP should close distance: {} -> {}",
            start_dist,
            end_dist
        );
    }

    /// Zigzag perpendicular component oscillates: over one full
    /// phase period (~63 ticks), `sin(zigzag_phase)` crosses zero
    /// multiple times — meaning the perpendicular kick direction
    /// flips. Sample sin(phase) every tick and confirm we see both
    /// positive and negative values.
    #[test]
    fn update_zigzag_oscillates() {
        let mut w = spawn_wasp_from_seed(1, 42, 1920.0, 1080.0);
        w.x = 960.0;
        w.y = 540.0;
        w.angle = 0.0; // facing +x
        w.zigzag_phase = 0.0; // start phase at zero for predictable test
        let targets = [target(99, 960.0, 540.0, true)]; // target at self
        let mut saw_positive = false;
        let mut saw_negative = false;
        for _ in 0..100 {
            update_wasp_movement(&mut w, &targets, 1920.0, 1080.0);
            let s = trig::sin64(w.zigzag_phase);
            if s > 0.1 {
                saw_positive = true;
            }
            if s < -0.1 {
                saw_negative = true;
            }
        }
        assert!(saw_positive, "perpendicular kick never went positive");
        assert!(saw_negative, "perpendicular kick never went negative");
    }

    /// WASP stays clamped inside the field. Place it adjacent to
    /// the right wall heading right; after many ticks its x must
    /// not exceed field_w - radius.
    #[test]
    fn update_clamps_inside_field() {
        let fw = 1920.0;
        let fh = 1080.0;
        let mut w = spawn_wasp_from_seed(1, 42, fw, fh);
        w.x = fw - WASP_RADIUS;
        w.y = 540.0;
        w.vx = WASP_BASE_SPEED;
        w.vy = 0.0;
        w.angle = 0.0; // facing right, into the wall
        // Target on the right side so desired_angle stays rightward
        // and the WASP keeps trying to go through the wall.
        let targets = [target(99, fw + 500.0, 540.0, true)];
        for _ in 0..120 {
            update_wasp_movement(&mut w, &targets, fw, fh);
            assert!(
                w.x + w.radius <= fw + 1e-6,
                "WASP escaped right wall: x={} (max={})",
                w.x,
                fw - w.radius
            );
            assert!(w.x - w.radius >= -1e-6, "WASP escaped left wall: x={}", w.x);
            assert!(w.y + w.radius <= fh + 1e-6, "WASP escaped bottom: y={}", w.y);
            assert!(w.y - w.radius >= -1e-6, "WASP escaped top: y={}", w.y);
        }
    }

    /// `aim_wasp` returns the same angle as a direct `atan2_64(dy, dx)`
    /// call. Wave 2 will rely on this for bullet spawn angles.
    #[test]
    fn aim_wasp_points_at_target() {
        let w = EnemyState {
            id: 1,
            kind: KIND_WASP,
            x: 100.0,
            y: 200.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: WASP_MAX_HP,
            max_hp: WASP_MAX_HP,
            radius: WASP_RADIUS,
            active: true,
            last_fire_tick: 0,
            zigzag_phase: 0.0,
            zigzag_amplitude: WASP_ZIGZAG_AMPLITUDE,
            ..EnemyState::default()
        };
        // Target upper-right: dx = +100, dy = -100 → angle = -π/4
        let t1 = target(99, 200.0, 100.0, true);
        let a1 = aim_wasp(&w, &t1);
        let expected1 = trig::atan2_64(100.0 - 200.0, 200.0 - 100.0);
        assert_eq!(a1.to_bits(), expected1.to_bits());

        // Target directly to the right: dy = 0, dx > 0 → angle = 0
        let t2 = target(99, 500.0, 200.0, true);
        let a2 = aim_wasp(&w, &t2);
        assert_eq!(a2.to_bits(), trig::atan2_64(0.0, 400.0).to_bits());

        // Target directly above: dx = 0, dy < 0 → angle = -π/2
        let t3 = target(99, 100.0, 50.0, true);
        let a3 = aim_wasp(&w, &t3);
        assert_eq!(a3.to_bits(), trig::atan2_64(-150.0, 0.0).to_bits());
    }

    /// Sanity check on the cooldown constant — should be reasonable
    /// for the machinegun feel (between 30 and 90 ticks ≈ 0.5-1.5 s).
    #[test]
    fn cooldown_const_within_bounds() {
        assert!(WASP_FIRE_COOLDOWN_TICKS >= 30);
        assert!(WASP_FIRE_COOLDOWN_TICKS <= 90);
        // Other consts also in their expected ranges.
        assert_eq!(WASP_MAX_HP, 5.0);
        assert_eq!(WASP_RADIUS, 18.0);
        assert!(WASP_BASE_SPEED > 1.4 && WASP_BASE_SPEED < 4.0);
        assert!(WASP_CONTACT_DAMAGE > 0.0 && WASP_CONTACT_DAMAGE < 10.0);
        assert!(WASP_ZIGZAG_AMPLITUDE > 0.0);
        assert!(WASP_ZIGZAG_PHASE_STEP > 0.0);
        assert_eq!(KIND_WASP, super::super::wave_table::KIND_WASP);
    }

    /// End-to-end determinism: spawn + 60 ticks of update with the
    /// same target slice produces bit-identical final state across
    /// two runs. Guards against any nondeterministic state slipping
    /// into `update_wasp_movement`.
    #[test]
    fn update_is_deterministic_end_to_end() {
        let targets = [
            target(1, 400.0, 400.0, true),
            target(2, 1500.0, 800.0, true),
            target(3, 100.0, 1000.0, false), // dead — should be skipped
        ];

        let mut a = spawn_wasp_from_seed(42, 0xABCD_EF01_2345_6789, 1920.0, 1080.0);
        let mut b = spawn_wasp_from_seed(42, 0xABCD_EF01_2345_6789, 1920.0, 1080.0);
        for _ in 0..60 {
            update_wasp_movement(&mut a, &targets, 1920.0, 1080.0);
            update_wasp_movement(&mut b, &targets, 1920.0, 1080.0);
        }
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.vx.to_bits(), b.vx.to_bits());
        assert_eq!(a.vy.to_bits(), b.vy.to_bits());
        assert_eq!(a.angle.to_bits(), b.angle.to_bits());
        assert_eq!(a.zigzag_phase.to_bits(), b.zigzag_phase.to_bits());
    }

    /// Inactive WASP is a no-op on update — fields stay unchanged.
    #[test]
    fn inactive_wasp_no_op() {
        let mut w = spawn_wasp_from_seed(1, 42, 1920.0, 1080.0);
        w.x = 500.0;
        w.y = 500.0;
        w.vx = 0.0;
        w.vy = 0.0;
        w.active = false;
        let snapshot_x = w.x;
        let snapshot_y = w.y;
        let snapshot_phase = w.zigzag_phase;
        let targets = [target(99, 100.0, 100.0, true)];
        update_wasp_movement(&mut w, &targets, 1920.0, 1080.0);
        assert_eq!(w.x, snapshot_x);
        assert_eq!(w.y, snapshot_y);
        assert_eq!(w.zigzag_phase, snapshot_phase);
    }

    /// Wrong-kind dispatch is a no-op — guards against the room
    /// orchestrator dispatching a non-WASP `EnemyState` through
    /// `update_wasp_movement` by mistake. Fields stay unchanged.
    #[test]
    fn wrong_kind_no_op() {
        let mut w = spawn_wasp_from_seed(1, 42, 1920.0, 1080.0);
        w.x = 500.0;
        w.y = 500.0;
        // Pretend this is a HUNTER state (kind = 0) accidentally dispatched here.
        w.kind = 0;
        let snapshot_x = w.x;
        let snapshot_y = w.y;
        let snapshot_phase = w.zigzag_phase;
        let targets = [target(99, 100.0, 100.0, true)];
        update_wasp_movement(&mut w, &targets, 1920.0, 1080.0);
        assert_eq!(w.x, snapshot_x);
        assert_eq!(w.y, snapshot_y);
        assert_eq!(w.zigzag_phase, snapshot_phase);
    }
}
