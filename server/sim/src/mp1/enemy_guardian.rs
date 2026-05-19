//! Phase 4 step 5 enemy sim — GUARDIAN tank + square-perimeter strafe.
//!
//! Fresh rewrite from solo's `js/modules/enemy/{enemy-data,movement,
//! firing}.js` (the GUARDIAN row, `squareMovement`, and
//! `guardian_spread`). Deterministic: every random draw goes through
//! `RngCtx` (seeded per-spawn from the `EnemySpawn` event's
//! `rng_subseed`), and every trig op goes through `super::trig::*`
//! (polynomial-bit-exact across native + WASM).
//!
//! GUARDIAN is the slow, high-HP, mid-range threat. It traces a
//! square perimeter at `GUARDIAN_PREFERRED_RANGE` around the closest
//! alive ship while keeping its facing locked on the target, then
//! periodically fires a 3-bullet aimed spread. The firing itself is
//! Wave 2 orchestrator work — this module owns spawn + movement +
//! aim helper, plus the spread-pattern constants Wave 2's
//! `enemy_bullet_patterns::spawn_spread` helper will read.
//!
//! Wave 2A: GUARDIAN now uses the unified `super::enemy::EnemyState`.
//! Only the `square_corner_idx` + `square_dir` per-kind movement-state
//! fields are populated; all other per-kind fields stay at their
//! `Default` zero values.
//!
//! Behavioral deviations from solo's `squareMovement` (intentional,
//! determinism-driven):
//!   - Solo's pattern is a stateful "wait 2 s, then burst 1.2 s in a
//!     random cardinal direction" rolled per-frame against
//!     `Math.random()`. Reproducing that in the sim would tie us to
//!     wall-clock + per-tick RNG draws (high cost, low fidelity).
//!     Instead we trace a deterministic square perimeter centered on
//!     the target — same visual read ("guardian patrols a box around
//!     the player") with a tiny state vector (corner index + side
//!     progress + sticky orbit direction).
//!   - Facing tracks the TARGET directly, not the heading. Solo's
//!     guardian fires `faceAngle`-aligned spreads, so the AI's first
//!     job is to keep `angle` pointing at the closest ship. Movement
//!     is strafing — heading is orthogonal to facing along the
//!     current square side.

use super::trig;

/// GUARDIAN kind discriminator. Matches `wave_table::KIND_GUARDIAN`.
pub const KIND_GUARDIAN: u8 = 1;

/// Base HP for a GUARDIAN. Solo: 12. Heavy tank — 10 PULSE_CANNON hits
/// at 1.2 dmg = 12 to kill.
pub const GUARDIAN_MAX_HP: f64 = 12.0;
/// Movement speed (px/tick at 60 Hz). Solo 1.25 px/frame is already
/// frame-rate scaled; sim runs fixed 60 Hz so we target ~0.7 px/tick
/// for a noticeably slower feel than HUNTER (1.4) — the perimeter
/// strafe needs to read as "patrolling", not "chasing".
pub const GUARDIAN_BASE_SPEED: f64 = 0.7;
/// Body radius (px). Solo `size: 48` / 2.
pub const GUARDIAN_RADIUS: f64 = 24.0;
/// Contact damage dealt to a ship on body-touch. Heavy — about 1.4×
/// HUNTER's 5.0 — because GUARDIAN is slow and easier to avoid.
pub const GUARDIAN_CONTACT_DAMAGE: f64 = 7.0;
/// Ticks between aimed spread volleys. Solo cooldown is 2250-8000 ms;
/// the midpoint is ~5 s (300 ticks) but for MVP playability we land
/// at 180 (3 s) so MP fights pace closer to solo's perceived rate.
/// Wave 2's `process_enemy_fire` reads this.
pub const GUARDIAN_FIRE_COOLDOWN_TICKS: u32 = 180;
/// Preferred orbit distance from the target ship (px). Matches solo's
/// `ai.preferredRange: 300`. The square's half-side length.
pub const GUARDIAN_PREFERRED_RANGE: f64 = 300.0;
/// Angular spread (radians) between adjacent bullets in a GUARDIAN
/// volley. ~20° (0.35 rad) — same compact fan solo uses (the inner
/// three of solo's `[-0.5, -0.25, 0, 0.25, 0.5]` offset list).
/// Wave 2's `enemy_bullet_patterns::spawn_spread` reads this.
pub const GUARDIAN_SPREAD_RADIANS: f64 = 0.35;
/// Number of bullets fired per volley. Solo `burstCount: 3`.
pub const GUARDIAN_SPREAD_COUNT: u8 = 3;

/// Lerp factor used to turn the GUARDIAN's facing angle toward the
/// target each tick. Same 0.08 as `enemy::ANGLE_TURN_T` — mirrors
/// solo's `enemy.turnSpeed = 0.08`.
const ANGLE_TURN_T: f64 = 0.08;

/// Half-side length of the square perimeter the GUARDIAN traces around
/// the target. Set equal to `GUARDIAN_PREFERRED_RANGE` so the AI sits
/// exactly at the configured engagement distance when on a side midpoint
/// and `range × √2` away at corners — a reasonable strafe geometry.
const SQUARE_HALF_SIDE: f64 = GUARDIAN_PREFERRED_RANGE;

/// Re-export of `enemy::TargetView`. GUARDIAN consumes the same target
/// view as HUNTER — kept centralized in `enemy.rs` so Wave 2's
/// orchestrator can build one slice and pass it to every kind.
pub use super::enemy::TargetView;

/// Re-export of the unified `EnemyState`. GUARDIAN-specific spawn /
/// update routines below read/write only the GUARDIAN-relevant fields
/// (`square_corner_idx`, `square_dir`) plus the common fields shared
/// across all kinds.
pub use super::enemy::EnemyState;

/// Spawn a GUARDIAN at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce the same enemy.
pub fn spawn_guardian_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (same edge convention as HUNTER) and place the
    // GUARDIAN just outside it so it visibly "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -GUARDIAN_RADIUS,
            0.0,
            GUARDIAN_BASE_SPEED,
        ),
        1 => (
            field_w + GUARDIAN_RADIUS,
            rng.range_f64(0.0, field_h),
            -GUARDIAN_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + GUARDIAN_RADIUS,
            0.0,
            -GUARDIAN_BASE_SPEED,
        ),
        _ => (
            -GUARDIAN_RADIUS,
            rng.range_f64(0.0, field_h),
            GUARDIAN_BASE_SPEED,
            0.0,
        ),
    };

    // Sticky perimeter orbit direction (CW vs CCW). One coin flip,
    // then never changes.
    let square_dir = if rng.range_f64(0.0, 1.0) < 0.5 { -1.0 } else { 1.0 };
    // Seed which corner the GUARDIAN heads toward first. Uniform in
    // 0..4 — keeps spawn variety so two GUARDIANs from the same edge
    // don't synchronize their perimeter phase.
    let square_corner_idx = (rng.range_f64(0.0, 4.0) as i32).clamp(0, 3) as u8;

    EnemyState {
        id,
        kind: KIND_GUARDIAN,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: GUARDIAN_MAX_HP,
        max_hp: GUARDIAN_MAX_HP,
        radius: GUARDIAN_RADIUS,
        active: true,
        last_fire_tick: 0,
        square_corner_idx,
        square_dir,
        ..EnemyState::default()
    }
}

/// Per-tick update for a GUARDIAN. Picks closest alive ship as
/// target, traces the perimeter of a square centered on the target at
/// `GUARDIAN_PREFERRED_RANGE`, clamps to field. Facing lerps toward
/// the TARGET (not the heading) so the spread volleys aim at the
/// player even while the GUARDIAN is strafing sideways.
pub fn update_guardian_movement(
    s: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_GUARDIAN {
        return;
    }

    // Pick closest alive target. If none, idle — clamp velocity to
    // zero, retain facing angle. Predictable + no NaN.
    let target = closest_target(targets, s.x, s.y);
    let target = match target {
        Some(t) => t,
        None => {
            s.vx = 0.0;
            s.vy = 0.0;
            // Still clamp inside field even when idle (a GUARDIAN
            // spawned just outside should slowly settle in once the
            // wall-snap below fires).
            clamp_to_field(s, field_w, field_h);
            return;
        }
    };

    // Compute the corner the GUARDIAN is heading toward. Corners sit
    // at the 4 corners of a square centered on the target, side length
    // = 2 × SQUARE_HALF_SIDE.
    //   idx 0 → (+R, -R) top-right
    //   idx 1 → (+R, +R) bottom-right
    //   idx 2 → (-R, +R) bottom-left
    //   idx 3 → (-R, -R) top-left
    let (corner_x, corner_y) = corner_offset(s.square_corner_idx);
    let target_corner_x = target.x + corner_x * SQUARE_HALF_SIDE;
    let target_corner_y = target.y + corner_y * SQUARE_HALF_SIDE;

    // Strafe toward the next corner. Heading = unit vector to corner,
    // velocity = heading × speed.
    let dx = target_corner_x - s.x;
    let dy = target_corner_y - s.y;
    let dist2 = dx * dx + dy * dy;

    // If we're within one tick's travel of the corner, advance to the
    // next corner (cycle by `square_dir`). This is the perimeter-trace
    // baton-pass — the GUARDIAN never "snaps" to a corner, it just
    // changes which corner it's chasing.
    let advance_threshold = GUARDIAN_BASE_SPEED * 1.5;
    if dist2 <= advance_threshold * advance_threshold {
        let next_idx = if s.square_dir >= 0.0 {
            (s.square_corner_idx + 1) % 4
        } else {
            // CCW: subtract 1, modulo 4. Use wrapping_sub to stay in u8.
            (s.square_corner_idx + 3) % 4
        };
        s.square_corner_idx = next_idx;
    }

    // Heading toward current corner (recompute after potential advance
    // is overkill — keep the original heading this tick so the AI
    // doesn't twitch at the changeover).
    let heading = if dist2 > 1e-9 {
        trig::atan2_64(dy, dx)
    } else {
        // Standing exactly on the corner: pick the heading toward the
        // next corner so we don't stall.
        let (cx2, cy2) = corner_offset(if s.square_dir >= 0.0 {
            (s.square_corner_idx + 1) % 4
        } else {
            (s.square_corner_idx + 3) % 4
        });
        let nx = target.x + cx2 * SQUARE_HALF_SIDE;
        let ny = target.y + cy2 * SQUARE_HALF_SIDE;
        trig::atan2_64(ny - s.y, nx - s.x)
    };

    s.vx = trig::cos64(heading) * GUARDIAN_BASE_SPEED;
    s.vy = trig::sin64(heading) * GUARDIAN_BASE_SPEED;

    s.x += s.vx;
    s.y += s.vy;

    // Lerp facing toward the TARGET (not the heading). GUARDIAN aims
    // its weapons at the player while strafing.
    let face_target = trig::atan2_64(target.y - s.y, target.x - s.x);
    s.angle = lerp_angle(s.angle, face_target, ANGLE_TURN_T);

    clamp_to_field(s, field_w, field_h);
}

/// Return the angle (radians) from the GUARDIAN's position to the
/// target. Wave 2's `process_enemy_fire` calls this once per volley
/// and passes the angle to `enemy_bullet_patterns::spawn_spread`.
pub fn aim_guardian(s: &EnemyState, target: &TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// Internal: unit-square corner offset for `idx` in 0..4. Returns
/// (sign_x, sign_y) ∈ {-1, +1}². Multiply by `SQUARE_HALF_SIDE` to
/// get a world-space offset from the target.
fn corner_offset(idx: u8) -> (f64, f64) {
    match idx % 4 {
        0 => (1.0, -1.0),  // top-right
        1 => (1.0, 1.0),   // bottom-right
        2 => (-1.0, 1.0),  // bottom-left
        _ => (-1.0, -1.0), // top-left
    }
}

/// Internal: clamp the GUARDIAN inside the playfield. Unlike HUNTER's
/// bounce, GUARDIAN just snaps to the wall and zeros the offending
/// velocity component — the perimeter-trace will pull it back inward
/// next tick once the corner heading takes over.
fn clamp_to_field(s: &mut EnemyState, field_w: f64, field_h: f64) {
    let r = s.radius;
    if s.x - r < 0.0 {
        s.x = r;
        if s.vx < 0.0 {
            s.vx = 0.0;
        }
    } else if s.x + r > field_w {
        s.x = field_w - r;
        if s.vx > 0.0 {
            s.vx = 0.0;
        }
    }
    if s.y - r < 0.0 {
        s.y = r;
        if s.vy < 0.0 {
            s.vy = 0.0;
        }
    } else if s.y + r > field_h {
        s.y = field_h - r;
        if s.vy > 0.0 {
            s.vy = 0.0;
        }
    }
}

/// Internal: find the closest alive target. `None` if all dead/empty.
/// Same algorithm as `enemy::closest_target`; duplicated locally so
/// this module doesn't depend on a `pub(super)` from `enemy.rs`.
fn closest_target(targets: &[TargetView], x: f64, y: f64) -> Option<TargetView> {
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

/// Internal: angle lerp via shortest path. Identical to `enemy.rs`'s
/// helper — duplicated locally because Rust's privacy rules don't let
/// us import private items from a sibling module, and exposing it
/// from `enemy.rs` is Wave 2 orchestrator scope.
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

    /// Same seed in → bit-identical state out. Hardest determinism
    /// gate; if this fails the wire protocol breaks (server + WASM
    /// client diverge on the very first tick of an EnemySpawn).
    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_guardian_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_guardian_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.square_corner_idx, b.square_corner_idx);
        assert_eq!(a.square_dir.to_bits(), b.square_dir.to_bits());
        assert_eq!(a.active, b.active);
        assert_eq!(a.last_fire_tick, b.last_fire_tick);
    }

    /// Spawned at one of four edges with seeded params in expected
    /// ranges. Same edge convention as HUNTER.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_guardian_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-GUARDIAN_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + GUARDIAN_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + GUARDIAN_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-GUARDIAN_RADIUS)).abs() < 1e-9;
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
            assert!(s.square_dir == 1.0 || s.square_dir == -1.0);
            assert!(s.square_corner_idx < 4);
            assert_eq!(s.kind, KIND_GUARDIAN);
            assert_eq!(s.hp, GUARDIAN_MAX_HP);
            assert_eq!(s.radius, GUARDIAN_RADIUS);
            assert!(s.active);
        }
    }

    /// Different seeds produce different spawn states most of the
    /// time (probabilistic but very high confidence over 50 pairs).
    /// Catches a hard-coded seed regression.
    #[test]
    fn spawn_seed_variation() {
        let mut diff_pairs = 0;
        for seed in 0..50u64 {
            let a = spawn_guardian_from_seed(1, seed, 1920.0, 1080.0);
            let b = spawn_guardian_from_seed(1, seed.wrapping_add(0x9E37_79B9), 1920.0, 1080.0);
            if a.x.to_bits() != b.x.to_bits()
                || a.y.to_bits() != b.y.to_bits()
                || a.square_corner_idx != b.square_corner_idx
                || a.square_dir.to_bits() != b.square_dir.to_bits()
            {
                diff_pairs += 1;
            }
        }
        assert!(
            diff_pairs >= 45,
            "expected most seeds to differ; only {diff_pairs}/50 did"
        );
    }

    /// No-target idle = no NaN, no drift, velocity zeroed. The room
    /// can hand `update_guardian_movement` an empty target slice (no
    /// alive ships) without exploding.
    #[test]
    fn update_no_target_idles_predictably() {
        let mut s = spawn_guardian_from_seed(2, 13, 1920.0, 1080.0);
        s.x = 800.0;
        s.y = 500.0;
        s.vx = 0.3;
        s.vy = -0.4;
        let targets: [TargetView; 0] = [];
        for _ in 0..100 {
            update_guardian_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(s.x.is_finite() && s.y.is_finite(), "NaN/Inf leaked");
            assert!(s.vx.is_finite() && s.vy.is_finite(), "vel NaN/Inf");
        }
        // Velocity should have been zeroed by the idle branch.
        assert_eq!(s.vx, 0.0);
        assert_eq!(s.vy, 0.0);
        // Position should not have drifted from the start.
        assert!((s.x - 800.0).abs() < 1e-9);
        assert!((s.y - 500.0).abs() < 1e-9);
    }

    /// With a stationary target, the GUARDIAN settles to within a
    /// reasonable band around `PREFERRED_RANGE` after a warmup. The
    /// square's corners are at `√2 × range` and midpoints at exactly
    /// `range`, so the steady-state distance oscillates in
    /// `[range, range·√2]`. We check the GUARDIAN ends up in that
    /// band (with slack) after 120 ticks.
    #[test]
    fn update_holds_preferred_range() {
        let mut s = spawn_guardian_from_seed(3, 42, 1920.0, 1080.0);
        // Park GUARDIAN well away from the target so the first ~60
        // ticks are spent closing the gap.
        s.x = 100.0;
        s.y = 540.0;
        s.vx = 0.0;
        s.vy = 0.0;
        let targets = [target(99, 960.0, 540.0, true)];
        for _ in 0..600 {
            update_guardian_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let dx = s.x - 960.0;
        let dy = s.y - 540.0;
        let dist = (dx * dx + dy * dy).sqrt();
        let min_expected = GUARDIAN_PREFERRED_RANGE * 0.9;
        // sqrt(2) ≈ 1.414 is the corner distance; we allow extra slack
        // because the GUARDIAN can overshoot a corner by up to a few
        // px between the corner-advance trigger and the next tick's
        // heading recompute. 1.85× is sufficient empirical headroom.
        let max_expected = GUARDIAN_PREFERRED_RANGE * 1.85;
        assert!(
            dist >= min_expected && dist <= max_expected,
            "after 600 ticks dist={dist} not in [{min_expected}, {max_expected}]"
        );
    }

    /// Over a long run, the GUARDIAN should visit multiple square
    /// quadrants (its position should vary in BOTH x and y around the
    /// target). Tests the perimeter-trace property: a stuck-on-one-
    /// side AI would have a tiny y-variance.
    #[test]
    fn update_traces_square() {
        let mut s = spawn_guardian_from_seed(4, 1234, 1920.0, 1080.0);
        // Seed the GUARDIAN already roughly on the perimeter so we
        // skip the closing-the-gap warmup.
        s.x = 960.0 + GUARDIAN_PREFERRED_RANGE;
        s.y = 540.0;
        s.vx = 0.0;
        s.vy = -GUARDIAN_BASE_SPEED;
        let targets = [target(99, 960.0, 540.0, true)];
        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        // 600 ticks at 0.7 px/tick = 420 px of travel — enough to
        // walk at least 1.5 sides of a 600-px-wide square.
        for _ in 0..600 {
            update_guardian_movement(&mut s, &targets, 1920.0, 1080.0);
            min_x = min_x.min(s.x);
            max_x = max_x.max(s.x);
            min_y = min_y.min(s.y);
            max_y = max_y.max(s.y);
        }
        let x_span = max_x - min_x;
        let y_span = max_y - min_y;
        // We expect non-trivial movement on BOTH axes (the GUARDIAN
        // has rounded at least one corner). 50 px is generous — a
        // truly stuck AI would have y_span ≈ 0.
        assert!(
            x_span > 50.0,
            "x_span={x_span} — GUARDIAN did not move horizontally"
        );
        assert!(
            y_span > 50.0,
            "y_span={y_span} — GUARDIAN did not move vertically (stuck on one side)"
        );
    }

    /// Facing angle converges toward the target direction over time.
    /// GUARDIAN aims at the player while strafing — Wave 2's spread
    /// fire depends on `s.angle` pointing roughly at the closest ship.
    #[test]
    fn update_faces_target() {
        let mut s = spawn_guardian_from_seed(5, 7777, 1920.0, 1080.0);
        // Park GUARDIAN at a known position, deliberately face the
        // wrong way (away from the target).
        s.x = 960.0;
        s.y = 200.0;
        s.angle = -trig::PI_2; // facing up (away from target below)
        let targets = [target(99, 960.0, 800.0, true)];
        // Target is below, so the expected facing is +π/2.
        for _ in 0..100 {
            update_guardian_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Angle should now be close to +π/2 (within a few degrees).
        // Use lerp_angle's shortest-path distance metric.
        let target_angle = trig::PI_2;
        let mut d = (s.angle - target_angle).abs();
        if d > trig::PI {
            d = trig::TAU - d;
        }
        assert!(d < 0.2, "angle={} not near +π/2; |delta|={}", s.angle, d);
    }

    /// Field-edge clamp: a GUARDIAN pushed into a wall by its target
    /// chase still stays inside the playfield. No bounce — just snap.
    #[test]
    fn update_clamps_inside_field() {
        let mut s = spawn_guardian_from_seed(6, 8888, 1920.0, 1080.0);
        // Place GUARDIAN at the left wall, target far to the right —
        // GUARDIAN will want to strafe right but the perimeter trace
        // can still try to push it left at times. Verify it never
        // goes off the field over a long run.
        s.x = GUARDIAN_RADIUS + 1.0;
        s.y = GUARDIAN_RADIUS + 1.0;
        let targets = [target(99, 100.0, 100.0, true)];
        for _ in 0..300 {
            update_guardian_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(
                s.x >= GUARDIAN_RADIUS - 1e-6,
                "x={} below left wall",
                s.x
            );
            assert!(
                s.x <= 1920.0 - GUARDIAN_RADIUS + 1e-6,
                "x={} past right wall",
                s.x
            );
            assert!(
                s.y >= GUARDIAN_RADIUS - 1e-6,
                "y={} below top wall",
                s.y
            );
            assert!(
                s.y <= 1080.0 - GUARDIAN_RADIUS + 1e-6,
                "y={} past bottom wall",
                s.y
            );
        }
    }

    /// `aim_guardian` returns the angle from the enemy to the target —
    /// the value Wave 2's `process_enemy_fire` will pass to the spread
    /// helper as the center angle.
    #[test]
    fn aim_guardian_points_at_target() {
        let s = EnemyState {
            id: 1,
            kind: KIND_GUARDIAN,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: GUARDIAN_MAX_HP,
            max_hp: GUARDIAN_MAX_HP,
            radius: GUARDIAN_RADIUS,
            active: true,
            last_fire_tick: 0,
            square_corner_idx: 0,
            square_dir: 1.0,
            ..EnemyState::default()
        };
        // Target directly to the right → angle 0.
        let t_right = target(0, 500.0, 100.0, true);
        assert!((aim_guardian(&s, &t_right) - 0.0).abs() < 1e-9);
        // Target directly below → angle +π/2.
        let t_down = target(0, 100.0, 500.0, true);
        assert!((aim_guardian(&s, &t_down) - trig::PI_2).abs() < 1e-9);
        // Target directly to the left → angle ±π.
        let t_left = target(0, -300.0, 100.0, true);
        let a = aim_guardian(&s, &t_left);
        assert!((a.abs() - trig::PI).abs() < 1e-9, "expected ±π, got {a}");
    }

    /// Sanity-check the spread + cooldown constants. Wave 2 reads
    /// these directly; a typo'd 35.0 instead of 0.35 would be a silent
    /// catastrophe (35 rad spread = volleys fly randomly).
    #[test]
    fn cooldown_and_spread_consts_sensible() {
        assert!(
            GUARDIAN_FIRE_COOLDOWN_TICKS >= 60 && GUARDIAN_FIRE_COOLDOWN_TICKS <= 600,
            "cooldown {} ticks outside sane [1s, 10s] band",
            GUARDIAN_FIRE_COOLDOWN_TICKS
        );
        // Spread between bullets — 5° to 60° is the human-readable
        // "fan" band. 0.35 rad ≈ 20° sits comfortably in the middle.
        assert!(
            GUARDIAN_SPREAD_RADIANS > 0.05 && GUARDIAN_SPREAD_RADIANS < 1.05,
            "spread {} rad outside sane fan band [5°, 60°]",
            GUARDIAN_SPREAD_RADIANS
        );
        assert_eq!(GUARDIAN_SPREAD_COUNT, 3, "GUARDIAN volley is a 3-fan");
        assert!(
            GUARDIAN_PREFERRED_RANGE > GUARDIAN_RADIUS * 2.0,
            "preferred range should be well beyond contact distance"
        );
        assert!(
            GUARDIAN_BASE_SPEED > 0.0 && GUARDIAN_BASE_SPEED < 2.0,
            "base speed {} outside sane [0, 2] px/tick band",
            GUARDIAN_BASE_SPEED
        );
        assert_eq!(KIND_GUARDIAN, super::super::wave_table::KIND_GUARDIAN);
    }
}
