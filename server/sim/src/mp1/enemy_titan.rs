//! Phase 4 step 5 enemy sim — TITAN wave-boss + boulder drift +
//! sweep-laser fire pattern (2026-05-18).
//!
//! Fresh rewrite from solo's
//!   - `js/modules/enemy/enemy-data.js` (TITAN row, line 343:
//!     `shootPattern: 'sweep_laser'`, `movePattern: 'boulder'`,
//!     `health: 20`, `size: 64`, `speed: 1.5`)
//!   - `js/modules/enemy/movement.js` (`boulderMovement`, line 2262:
//!     ponderous momentum-based drift, slow turn rate)
//!   - `js/modules/enemy/firing.js` (`updateSweepLaserSystem`, line
//!     1115: wide-arc sweeping volley aimed at the player)
//!   - `js/modules/enemy/boss-rage.js` (HP-threshold rage trigger:
//!     faster fire + wider effect at <33% HP)
//!
//! Deterministic: every random draw goes through `RngCtx` (seeded
//! per-spawn from the `EnemySpawn` event's `rng_subseed`), and every
//! trig op goes through `super::trig::*` (polynomial-bit-exact across
//! native + WASM).
//!
//! TITAN is the wave-boss tier — heaviest HP, biggest body, slowest
//! ponderous movement, and a sweeping-arc fire pattern that hoses the
//! play space with explosive bullets. Below `TITAN_RAGE_HP_FRACTION`
//! it enters a binary "rage" gate: cooldown halves + sweep amplitude
//! widens. Wave 2's `process_enemy_fire` reads `current_fire_cooldown`
//! and `current_sweep_offset` each tick — no per-frame branching in
//! this module beyond the `is_raging` flag check.
//!
//! Behavioral deviations from solo (intentional, determinism-driven):
//!   - Solo's `boulderMovement` is a 4-phase state machine
//!     (idle/approaching/braking/recovering) gated on `frameClock.now`
//!     with `Math.random()` rolls per phase. The sim has no wall-clock
//!     and the per-phase RNG draws would couple the boulder's pacing
//!     to whatever else fires this tick. We replace it with a single
//!     ever-running momentum-drift: `momentum_dir` is the current
//!     drift heading, lerped slowly toward the closest target with
//!     `MOMENTUM_TURN_RATE = 0.02` (rougly 1/4 of HUNTER's 0.08).
//!     Same visual read — TITAN ponderously slews toward the player
//!     and can't make sharp turns — with a tiny state vector.
//!   - Solo's `boss-rage.js` has a 24-frame TELEGRAPH → 1.5 s INVULN
//!     → 16-bullet TANTRUM activation sequence, plus tier-2 partner
//!     death triggers and tier-4 phase cycling. MVP simplification:
//!     rage is a BINARY GATE driven solely by `hp <= max_hp ×
//!     TITAN_RAGE_HP_FRACTION`. No telegraph, no invuln window, no
//!     tantrum, no phase transitions. The two gameplay effects that
//!     matter for moment-to-moment combat (faster fire, wider sweep)
//!     ship in 0.9.0; the cinematic juice is Phase 5+ polish.
//!   - Movement faces the DIRECTION OF MOTION (boulder), not the
//!     target. The sweep_laser's aim is recomputed each tick via
//!     `aim_titan`, so facing != aim — Wave 2 uses the dedicated
//!     `aim_titan` for bullet angles and `s.angle` for rendering.
//!   - Bounce on edges (HUNTER style) rather than snap (GUARDIAN
//!     style) — TITAN is too big to "stick" to a wall convincingly,
//!     and bouncing prevents it from getting pinned out of bullet
//!     range.
//!
//! Explosive enemy bullets: per the 0.8.0 changelog follow-up,
//! TITAN's bullets are larger and more damaging (`TITAN_BULLET_DAMAGE
//! = 3.0`, `TITAN_BULLET_RADIUS = 14.0`) versus the standard 2.0/9.0.
//! Wave 2 spawns them by calling `enemy_bullet::spawn(...)` with
//! these consts explicitly — NOT `spawn_aimed_default`, which wires
//! the standard-enemy defaults.

use super::enemy::EnemyState;
use super::trig;

/// TITAN kind discriminator. Matches `wave_table::KIND_TITAN`.
pub const KIND_TITAN: u8 = 9;

/// Base HP for a TITAN. Boss-tier — ~8× HUNTER (3.0). 40 / 1.2
/// PULSE_CANNON ≈ 34 hits to kill, ~3-4 s of sustained fire.
pub const TITAN_MAX_HP: f64 = 40.0;
/// Movement speed (px/tick at 60 Hz). Very slow — boulder drift.
/// HUNTER is 1.4, GUARDIAN is 0.7; TITAN at 0.6 is the slowest in
/// the roster, justifying the "ponderous boss" read.
pub const TITAN_BASE_SPEED: f64 = 0.6;
/// Body radius (px). Huge — ~3× HUNTER's 18, ~2× GUARDIAN's 24.
/// Solo's `size: 64` halved gives 32, but we want TITAN visibly
/// dwarfing every other enemy on screen so we land at 45.
pub const TITAN_RADIUS: f64 = 45.0;
/// Contact damage dealt to a ship on body-touch. Lethal — 3× HUNTER's
/// 5.0. A clean ram from TITAN kills a 10-HP ship outright; design
/// intent is "don't get under it".
pub const TITAN_CONTACT_DAMAGE: f64 = 15.0;
/// Ticks between sweep-laser bullets in normal (non-rage) mode.
/// 18 ticks = 0.3 s — rapid, because each bullet is one slice of the
/// sweeping arc. The arc reads as a moving "wall" of fire.
pub const TITAN_FIRE_COOLDOWN_TICKS: u32 = 18;
/// Ticks between sweep-laser bullets in rage mode. 9 = 2× faster
/// than normal. Combined with the wider sweep amplitude, this hoses
/// the screen during the rage phase.
pub const TITAN_RAGE_FIRE_COOLDOWN_TICKS: u32 = 9;
/// HP fraction (of `max_hp`) below which TITAN enters rage mode.
/// 0.4 = below 40% HP. Mirrors solo's `boss-rage.js`'s 0.33 threshold
/// loosely; nudged up to 0.4 so rage triggers earlier in MP fights
/// (the binary-gate simplification means rage is the entire "boss
/// final stand" experience — no telegraph, no tantrum — so we want
/// players to see it).
pub const TITAN_RAGE_HP_FRACTION: f64 = 0.4;
/// Sweep amplitude (radians) in normal mode. 0.6 rad ≈ 34° — a wide
/// fan that forces the player to move, but leaves angular gaps.
pub const TITAN_SWEEP_AMPLITUDE: f64 = 0.6;
/// Sweep amplitude (radians) in rage mode. 1.0 rad ≈ 57° — closes
/// most of the angular gaps, requiring sustained dodging.
pub const TITAN_RAGE_SWEEP_AMPLITUDE: f64 = 1.0;
/// Sweep angular velocity (radians/tick). 0.05 rad/tick × 18 ticks
/// per shot = 0.9 rad of phase travel between shots in normal mode,
/// so adjacent bullets in a sweep cover the full amplitude span.
pub const TITAN_SWEEP_OMEGA: f64 = 0.05;
/// Damage per enemy-bullet (vs ship). Explosive variant — 1.5× the
/// standard 2.0 damage. Per 0.8.0 changelog follow-up.
pub const TITAN_BULLET_DAMAGE: f64 = 3.0;
/// Collision radius per enemy-bullet (vs ship). Explosive variant —
/// ~1.5× the standard 9.0 radius. Per 0.8.0 changelog follow-up.
pub const TITAN_BULLET_RADIUS: f64 = 14.0;

/// Lerp factor used to turn TITAN's `momentum_dir` toward the
/// closest target each tick. 0.02 is 1/4 of HUNTER's 0.08 — TITAN
/// is supposed to look ponderous and unable to make sharp turns.
const MOMENTUM_TURN_RATE: f64 = 0.02;

/// Re-export of `enemy::TargetView`. TITAN consumes the same target
/// view as every other enemy kind — Wave 2's orchestrator builds one
/// slice and passes it everywhere.
pub use super::enemy::TargetView;

/// Spawn a TITAN at the given seed. Both server and WASM client call
/// this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce the same boss.
///
/// **Phase 4 step 5** — returns the unified `EnemyState`. Only the
/// per-kind fields TITAN actually uses (`sweep_phase`, `momentum_dir`,
/// `momentum_t`) plus the common fields are populated; everything
/// else stays at `EnemyState::default()`.
pub fn spawn_titan_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (same edge convention as HUNTER/GUARDIAN) and
    // place TITAN just outside it so it visibly "enters" the play
    // space. With `TITAN_RADIUS = 45`, the boss takes a noticeable
    // moment to fully cross the edge — exactly the wave-boss arrival
    // beat we want.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, init_dir) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -TITAN_RADIUS,
            trig::PI_2, // facing down (into the field)
        ),
        1 => (
            field_w + TITAN_RADIUS,
            rng.range_f64(0.0, field_h),
            trig::PI, // facing left (into the field)
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + TITAN_RADIUS,
            -trig::PI_2, // facing up (into the field)
        ),
        _ => (
            -TITAN_RADIUS,
            rng.range_f64(0.0, field_h),
            0.0, // facing right (into the field)
        ),
    };

    let vx = trig::cos64(init_dir) * TITAN_BASE_SPEED;
    let vy = trig::sin64(init_dir) * TITAN_BASE_SPEED;

    EnemyState {
        id,
        kind: KIND_TITAN,
        x,
        y,
        vx,
        vy,
        angle: init_dir,
        hp: TITAN_MAX_HP,
        max_hp: TITAN_MAX_HP,
        radius: TITAN_RADIUS,
        active: true,
        last_fire_tick: 0,
        sweep_phase: 0.0,
        momentum_dir: init_dir,
        momentum_t: 0.0,
        ..EnemyState::default()
    }
}

/// Per-tick update for a TITAN. Picks closest alive ship as target,
/// slowly lerps `momentum_dir` toward it, advances along the drift
/// heading at `TITAN_BASE_SPEED`, bounces off field edges. Facing
/// (`angle`) tracks the direction of motion — boulder behavior.
pub fn update_titan_movement(
    s: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_TITAN {
        return;
    }

    // Pick the closest alive target. If there's none, the TITAN keeps
    // its current `momentum_dir` — no NaN, no stall, predictable
    // straight-line drift until a ship respawns.
    if let Some(t) = closest_target(targets, s.x, s.y) {
        let dx = t.x - s.x;
        let dy = t.y - s.y;
        // Avoid feeding (0, 0) into atan2 if a ship spawns exactly on
        // top of the TITAN (edge case but possible at very low HP).
        if dx * dx + dy * dy > 1e-9 {
            let desired = trig::atan2_64(dy, dx);
            s.momentum_dir = lerp_angle(s.momentum_dir, desired, MOMENTUM_TURN_RATE);
        }
    }

    // Velocity = unit vector along momentum_dir × TITAN_BASE_SPEED.
    // Constant speed — no acceleration, no damping. The "boulder"
    // read comes from the slow turn rate, not from velocity-state.
    s.vx = trig::cos64(s.momentum_dir) * TITAN_BASE_SPEED;
    s.vy = trig::sin64(s.momentum_dir) * TITAN_BASE_SPEED;

    s.x += s.vx;
    s.y += s.vy;

    // Facing tracks the direction of motion (boulder). NOT the
    // target — sweep_laser aim is computed separately via aim_titan.
    s.angle = s.momentum_dir;

    // Bounce off field edges (HUNTER style — TITAN is too big to
    // "stick" to a wall convincingly, and a bounce flips
    // momentum_dir naturally via the velocity sign flip below). We
    // also rewrite `momentum_dir` to match the bounced velocity so
    // the slow-lerp doesn't immediately steer back into the wall.
    let r = s.radius;
    let mut bounced = false;
    if s.x - r < 0.0 {
        s.x = r;
        s.vx = s.vx.abs();
        bounced = true;
    } else if s.x + r > field_w {
        s.x = field_w - r;
        s.vx = -s.vx.abs();
        bounced = true;
    }
    if s.y - r < 0.0 {
        s.y = r;
        s.vy = s.vy.abs();
        bounced = true;
    } else if s.y + r > field_h {
        s.y = field_h - r;
        s.vy = -s.vy.abs();
        bounced = true;
    }
    if bounced {
        s.momentum_dir = trig::atan2_64(s.vy, s.vx);
        s.angle = s.momentum_dir;
    }
}

/// Advance the sweep phase by `TITAN_SWEEP_OMEGA`. Wave 2 calls this
/// every tick while TITAN is firing — the firing system advances the
/// phase independently of `last_fire_tick`, so the sweep arc keeps
/// moving smoothly between volleys.
pub fn advance_sweep(s: &mut EnemyState) {
    s.sweep_phase += TITAN_SWEEP_OMEGA;
    // Keep `sweep_phase` bounded — over a long fight it would grow
    // unboundedly otherwise, and sin() of a giant f64 has degraded
    // precision past ~1e9. Mod by TAU so the result is bit-identical.
    if s.sweep_phase > trig::TAU || s.sweep_phase < -trig::TAU {
        // Truncating mod via integer cast — bit-exact across runtimes.
        let wraps = (s.sweep_phase / trig::TAU) as i64;
        s.sweep_phase -= (wraps as f64) * trig::TAU;
    }
}

/// Current sweep offset (radians) added to the aim angle for the
/// next bullet. `raging` toggles between the normal and rage
/// amplitudes — Wave 2 passes `is_raging(s)` here each call.
pub fn current_sweep_offset(s: &EnemyState, raging: bool) -> f64 {
    let amplitude = if raging {
        TITAN_RAGE_SWEEP_AMPLITUDE
    } else {
        TITAN_SWEEP_AMPLITUDE
    };
    amplitude * trig::sin64(s.sweep_phase)
}

/// Return the angle (radians) from TITAN's position to the target.
/// Wave 2's `process_enemy_fire` calls this once per sweep volley,
/// then adds `current_sweep_offset(s, raging)` to get the actual
/// per-bullet angle.
pub fn aim_titan(s: &EnemyState, target: &TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// True if TITAN is in rage mode (HP at or below the rage threshold).
/// Binary gate — no telegraph, no invuln window, no tantrum (those
/// are Phase 5+ polish). Wave 2 reads this every tick to pick the
/// cooldown / sweep amplitude.
pub fn is_raging(s: &EnemyState) -> bool {
    s.hp <= s.max_hp * TITAN_RAGE_HP_FRACTION
}

/// Cooldown ticks Wave 2 should use for the next fire decision.
/// Switches automatically when `is_raging(s)` flips.
pub fn current_fire_cooldown(s: &EnemyState) -> u32 {
    if is_raging(s) {
        TITAN_RAGE_FIRE_COOLDOWN_TICKS
    } else {
        TITAN_FIRE_COOLDOWN_TICKS
    }
}

/// Internal: find the closest alive target. `None` if all dead/empty.
/// Same algorithm as `enemy::closest_target` and
/// `enemy_guardian::closest_target`; duplicated locally so this
/// module doesn't depend on a `pub(super)` from a sibling.
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

/// Internal: angle lerp via shortest path. Identical to the helper
/// in `enemy.rs` / `enemy_guardian.rs` — duplicated locally because
/// Rust privacy rules don't let us import private items from a
/// sibling module, and exposing it from `enemy.rs` is Wave 2 scope.
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
        let a = spawn_titan_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_titan_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.sweep_phase.to_bits(), b.sweep_phase.to_bits());
        assert_eq!(a.momentum_dir.to_bits(), b.momentum_dir.to_bits());
        assert_eq!(a.momentum_t.to_bits(), b.momentum_t.to_bits());
        assert_eq!(a.active, b.active);
        assert_eq!(a.last_fire_tick, b.last_fire_tick);
    }

    /// HP and kind are always seeded to the constants; max_hp == hp
    /// on spawn so the HP bar reads full.
    #[test]
    fn spawn_starts_with_full_hp() {
        let s = spawn_titan_from_seed(42, 0xABCD_EF01, 1920.0, 1080.0);
        assert_eq!(s.hp, TITAN_MAX_HP);
        assert_eq!(s.max_hp, TITAN_MAX_HP);
        assert_eq!(s.kind, KIND_TITAN);
        assert_eq!(s.radius, TITAN_RADIUS);
        assert!(s.active);
        assert_eq!(s.last_fire_tick, 0);
        assert_eq!(s.sweep_phase, 0.0);
        assert!(!is_raging(&s), "fresh TITAN must not be in rage");
    }

    /// Spawned at one of four edges with seeded params in expected
    /// ranges. Same edge convention as HUNTER/GUARDIAN.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_titan_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-TITAN_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + TITAN_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + TITAN_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-TITAN_RADIUS)).abs() < 1e-9;
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
            assert_eq!(s.kind, KIND_TITAN);
            assert_eq!(s.hp, TITAN_MAX_HP);
            assert_eq!(s.radius, TITAN_RADIUS);
            assert!(s.active);
        }
    }

    /// Different seeds produce different spawn states most of the
    /// time. Catches a hard-coded seed regression.
    #[test]
    fn spawn_seed_variation() {
        let mut diff_pairs = 0;
        for seed in 0..50u64 {
            let a = spawn_titan_from_seed(1, seed, 1920.0, 1080.0);
            let b = spawn_titan_from_seed(1, seed.wrapping_add(0x9E37_79B9), 1920.0, 1080.0);
            if a.x.to_bits() != b.x.to_bits()
                || a.y.to_bits() != b.y.to_bits()
                || a.momentum_dir.to_bits() != b.momentum_dir.to_bits()
            {
                diff_pairs += 1;
            }
        }
        assert!(
            diff_pairs >= 45,
            "expected most seeds to differ; only {diff_pairs}/50 did"
        );
    }

    /// No-target = predictable straight-line drift along `momentum_dir`.
    /// No NaN, no stall, no random wandering.
    #[test]
    fn update_no_target_drifts_predictably() {
        let mut s = spawn_titan_from_seed(2, 13, 1920.0, 1080.0);
        // Park in the center with a known momentum_dir so the drift
        // is fully predictable (independent of the spawn edge).
        s.x = 960.0;
        s.y = 540.0;
        s.momentum_dir = 0.0; // pointing +x
        s.angle = 0.0;
        let targets: [TargetView; 0] = [];
        let start_x = s.x;
        let start_y = s.y;
        for _ in 0..10 {
            update_titan_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(s.x.is_finite() && s.y.is_finite(), "NaN/Inf leaked");
        }
        // After 10 ticks at TITAN_BASE_SPEED along +x: x advanced by
        // ~6 px, y unchanged.
        let expected_dx = TITAN_BASE_SPEED * 10.0;
        assert!(
            (s.x - (start_x + expected_dx)).abs() < 1e-6,
            "x drifted to {}, expected {}",
            s.x,
            start_x + expected_dx
        );
        assert!(
            (s.y - start_y).abs() < 1e-6,
            "y drifted to {} (should be unchanged)",
            s.y
        );
    }

    /// momentum_dir converges toward the target direction over many
    /// ticks. Tests that the lerp_angle wire-up is correct — a
    /// reversed sign would have the boss steer AWAY from the player.
    #[test]
    fn update_turns_toward_target_slowly() {
        let mut s = spawn_titan_from_seed(3, 999, 1920.0, 1080.0);
        // Park TITAN at (100, 540) facing +x (momentum_dir = 0). The
        // target sits to the WEST (negative x), so the desired angle
        // is ±π. With TURN_RATE 0.02 and shortest-path lerp, after
        // many ticks momentum_dir should reach ±π (within tolerance).
        s.x = 1000.0;
        s.y = 540.0;
        s.momentum_dir = 0.0;
        s.angle = 0.0;
        // Snapshot momentum_dir over time; verify it's monotonically
        // approaching π in absolute value.
        let targets = [target(99, 100.0, 540.0, true)];
        let initial = s.momentum_dir;
        // 5 ticks: angle should have moved at least a little (lerp
        // 0.02 × π ≈ 0.063 per tick × 5 ≈ 0.3 rad).
        for _ in 0..5 {
            update_titan_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let after_5 = s.momentum_dir;
        assert!(
            after_5.abs() > initial.abs() + 0.05,
            "after 5 ticks momentum_dir should have moved toward ±π; \
             initial={initial}, after_5={after_5}"
        );
        // 300 more ticks: should converge to ±π within ~0.05 rad.
        for _ in 0..300 {
            update_titan_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let final_dir = s.momentum_dir;
        // Distance from ±π (shortest-path).
        let mut d = (final_dir.abs() - trig::PI).abs();
        if d > trig::PI {
            d = trig::TAU - d;
        }
        // Tolerance 0.1 rad (~6°): the lerp converges geometrically
        // (factor 0.98/tick), so 300 ticks would land at < 1e-3 rad
        // of the *static* target. But the target sits to the WEST of
        // a TITAN drifting WEST — as TITAN moves, the relative angle
        // wobbles around ±π and the convergence asymptote shifts.
        // 0.1 rad bounds that wobble while still proving the lerp
        // direction is correct.
        assert!(
            d < 0.1,
            "after 305 ticks momentum_dir should be near ±π; got {final_dir}, |delta|={d}"
        );
    }

    /// Over a few ticks, position advances along the unit vector
    /// `momentum_dir`. Verifies velocity is being set + applied.
    #[test]
    fn update_moves_along_momentum() {
        let mut s = spawn_titan_from_seed(4, 444, 1920.0, 1080.0);
        s.x = 960.0;
        s.y = 540.0;
        // Pick a momentum_dir of π/4 (NE-ish) — both vx and vy
        // should be positive and equal in magnitude.
        s.momentum_dir = trig::PI_4;
        s.angle = trig::PI_4;
        let targets: [TargetView; 0] = [];
        let start_x = s.x;
        let start_y = s.y;
        for _ in 0..5 {
            update_titan_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Position should have advanced in both +x and +y.
        assert!(s.x > start_x, "x should advance: {} -> {}", start_x, s.x);
        assert!(s.y > start_y, "y should advance: {} -> {}", start_y, s.y);
        // dx and dy should be roughly equal (PI/4 → 45°).
        let dx = s.x - start_x;
        let dy = s.y - start_y;
        assert!(
            (dx - dy).abs() < 1e-3,
            "dx={} should ≈ dy={} for momentum_dir=π/4",
            dx,
            dy
        );
        // Combined magnitude ≈ 5 ticks × TITAN_BASE_SPEED.
        let mag = (dx * dx + dy * dy).sqrt();
        let expected = TITAN_BASE_SPEED * 5.0;
        assert!(
            (mag - expected).abs() < 1e-3,
            "travel magnitude {} should be ≈ {}",
            mag,
            expected
        );
    }

    /// Field-edge clamp: a TITAN pushed into a wall by its target
    /// chase stays inside the playfield. Bounces off rather than
    /// snapping (HUNTER style).
    #[test]
    fn update_clamps_inside_field() {
        let mut s = spawn_titan_from_seed(6, 8888, 1920.0, 1080.0);
        // Place TITAN at the left wall, target to the LEFT — TITAN
        // wants to drift further left and should bounce.
        s.x = TITAN_RADIUS + 0.5;
        s.y = 540.0;
        s.momentum_dir = trig::PI; // facing left
        s.angle = trig::PI;
        // Target further left (off-field) — pulls momentum_dir toward
        // ±π (where it already is). The bounce branch should still
        // keep s.x inside the field.
        let targets = [target(99, -500.0, 540.0, true)];
        for _ in 0..300 {
            update_titan_movement(&mut s, &targets, 1920.0, 1080.0);
            assert!(
                s.x >= TITAN_RADIUS - 1e-6,
                "x={} below left wall",
                s.x
            );
            assert!(
                s.x <= 1920.0 - TITAN_RADIUS + 1e-6,
                "x={} past right wall",
                s.x
            );
            assert!(
                s.y >= TITAN_RADIUS - 1e-6,
                "y={} below top wall",
                s.y
            );
            assert!(
                s.y <= 1080.0 - TITAN_RADIUS + 1e-6,
                "y={} past bottom wall",
                s.y
            );
        }
    }

    /// Rage threshold: false at full HP, true at HP ≤
    /// max_hp × TITAN_RAGE_HP_FRACTION, and exactly at the boundary
    /// is_raging is true (inclusive `<=`).
    #[test]
    fn is_raging_threshold() {
        let mut s = spawn_titan_from_seed(8, 0xC0FF_EE, 1920.0, 1080.0);
        // Full HP — not raging.
        assert!(!is_raging(&s), "full HP should not be raging");
        // Just above threshold — not raging.
        s.hp = TITAN_MAX_HP * TITAN_RAGE_HP_FRACTION + 0.01;
        assert!(!is_raging(&s), "just above threshold should not be raging");
        // Exactly at threshold — raging (inclusive `<=`).
        s.hp = TITAN_MAX_HP * TITAN_RAGE_HP_FRACTION;
        assert!(is_raging(&s), "exactly at threshold should be raging");
        // Below threshold — raging.
        s.hp = TITAN_MAX_HP * TITAN_RAGE_HP_FRACTION - 0.01;
        assert!(is_raging(&s), "below threshold should be raging");
        // Near-dead — raging.
        s.hp = 1.0;
        assert!(is_raging(&s), "near-dead should be raging");
    }

    /// Cooldown switches between normal and rage values based on the
    /// rage gate. Wave 2's `process_enemy_fire` reads this each tick.
    #[test]
    fn current_fire_cooldown_switches_with_rage() {
        let mut s = spawn_titan_from_seed(9, 0xFADE_C0DE, 1920.0, 1080.0);
        // Full HP → normal cooldown.
        assert_eq!(current_fire_cooldown(&s), TITAN_FIRE_COOLDOWN_TICKS);
        // At threshold → rage cooldown.
        s.hp = TITAN_MAX_HP * TITAN_RAGE_HP_FRACTION;
        assert_eq!(current_fire_cooldown(&s), TITAN_RAGE_FIRE_COOLDOWN_TICKS);
        // Slightly above threshold → back to normal.
        s.hp = TITAN_MAX_HP * TITAN_RAGE_HP_FRACTION + 1.0;
        assert_eq!(current_fire_cooldown(&s), TITAN_FIRE_COOLDOWN_TICKS);
        // Sanity: rage cooldown < normal cooldown (rage IS faster).
        assert!(
            TITAN_RAGE_FIRE_COOLDOWN_TICKS < TITAN_FIRE_COOLDOWN_TICKS,
            "rage cooldown must be shorter than normal"
        );
    }

    /// Sweep offset uses the correct amplitude based on the `raging`
    /// arg. Tested at sweep_phase = π/2 where sin = 1 — the offset
    /// should equal the amplitude.
    #[test]
    fn current_sweep_offset_uses_correct_amplitude() {
        let mut s = spawn_titan_from_seed(10, 0xBADD_F00D, 1920.0, 1080.0);
        s.sweep_phase = trig::PI_2; // sin(π/2) ≈ 1
        // Normal mode: offset ≈ TITAN_SWEEP_AMPLITUDE.
        let normal = current_sweep_offset(&s, false);
        assert!(
            (normal - TITAN_SWEEP_AMPLITUDE).abs() < 1e-3,
            "normal offset {} should ≈ {}",
            normal,
            TITAN_SWEEP_AMPLITUDE
        );
        // Rage mode: offset ≈ TITAN_RAGE_SWEEP_AMPLITUDE.
        let rage = current_sweep_offset(&s, true);
        assert!(
            (rage - TITAN_RAGE_SWEEP_AMPLITUDE).abs() < 1e-3,
            "rage offset {} should ≈ {}",
            rage,
            TITAN_RAGE_SWEEP_AMPLITUDE
        );
        // Rage amplitude is strictly larger than normal.
        assert!(
            rage > normal,
            "rage sweep should be wider than normal sweep"
        );
        // At sweep_phase = 0 the offset is 0 regardless of mode.
        s.sweep_phase = 0.0;
        assert!(current_sweep_offset(&s, false).abs() < 1e-3);
        assert!(current_sweep_offset(&s, true).abs() < 1e-3);
    }

    /// `advance_sweep` adds exactly `TITAN_SWEEP_OMEGA` each call.
    /// Verifies the sweep phase is wired up correctly + bounded over
    /// many ticks (no NaN, no precision loss).
    #[test]
    fn advance_sweep_increments_phase() {
        let mut s = spawn_titan_from_seed(11, 0x1234_5678, 1920.0, 1080.0);
        s.sweep_phase = 0.0;
        advance_sweep(&mut s);
        assert!(
            (s.sweep_phase - TITAN_SWEEP_OMEGA).abs() < 1e-12,
            "one advance should add exactly TITAN_SWEEP_OMEGA, got {}",
            s.sweep_phase
        );
        // Many advances: phase stays bounded (mod TAU) and finite.
        for _ in 0..10_000 {
            advance_sweep(&mut s);
        }
        assert!(s.sweep_phase.is_finite(), "phase went NaN/Inf");
        assert!(
            s.sweep_phase.abs() <= trig::TAU + 1e-6,
            "phase should be bounded by ±TAU, got {}",
            s.sweep_phase
        );
    }

    /// `aim_titan` returns the angle from TITAN to the target — the
    /// value Wave 2's `process_enemy_fire` will pass as the sweep
    /// center angle (then add `current_sweep_offset`).
    #[test]
    fn aim_titan_points_at_target() {
        let s = EnemyState {
            id: 1,
            kind: KIND_TITAN,
            x: 100.0,
            y: 100.0,
            hp: TITAN_MAX_HP,
            max_hp: TITAN_MAX_HP,
            radius: TITAN_RADIUS,
            active: true,
            ..EnemyState::default()
        };
        // Target directly to the right → angle 0.
        let t_right = target(0, 500.0, 100.0, true);
        assert!((aim_titan(&s, &t_right) - 0.0).abs() < 1e-9);
        // Target directly below → angle +π/2.
        let t_down = target(0, 100.0, 500.0, true);
        assert!((aim_titan(&s, &t_down) - trig::PI_2).abs() < 1e-9);
        // Target directly above → angle -π/2.
        let t_up = target(0, 100.0, -300.0, true);
        assert!((aim_titan(&s, &t_up) + trig::PI_2).abs() < 1e-9);
        // Target directly to the left → angle ±π.
        let t_left = target(0, -300.0, 100.0, true);
        let a = aim_titan(&s, &t_left);
        assert!((a.abs() - trig::PI).abs() < 1e-9, "expected ±π, got {a}");
    }

    /// Sanity-check the constants. Wave 2 wires several of these
    /// directly into the bullet-spawn call; a typo would silently
    /// re-tune the entire boss fight.
    #[test]
    fn constants_sensible() {
        assert_eq!(KIND_TITAN, 9);
        assert_eq!(KIND_TITAN, super::super::wave_table::KIND_TITAN);
        // HP — heaviest in the roster.
        assert!(
            TITAN_MAX_HP >= 25.0 && TITAN_MAX_HP <= 100.0,
            "TITAN HP {} outside sane boss band",
            TITAN_MAX_HP
        );
        // Speed — slowest in the roster.
        assert!(
            TITAN_BASE_SPEED > 0.0 && TITAN_BASE_SPEED <= 1.0,
            "TITAN speed {} should be slow (<= 1.0)",
            TITAN_BASE_SPEED
        );
        // Radius — biggest in the roster.
        assert!(
            TITAN_RADIUS >= 30.0 && TITAN_RADIUS <= 80.0,
            "TITAN radius {} outside sane boss band",
            TITAN_RADIUS
        );
        // Rage threshold — between 20% and 60%.
        assert!(
            TITAN_RAGE_HP_FRACTION > 0.2 && TITAN_RAGE_HP_FRACTION < 0.6,
            "rage threshold {} outside sane band",
            TITAN_RAGE_HP_FRACTION
        );
        // Bullet stats — heavier than the default (2.0 / 9.0).
        assert!(
            TITAN_BULLET_DAMAGE > 2.0,
            "TITAN bullet damage {} should exceed default 2.0",
            TITAN_BULLET_DAMAGE
        );
        assert!(
            TITAN_BULLET_RADIUS > 9.0,
            "TITAN bullet radius {} should exceed default 9.0",
            TITAN_BULLET_RADIUS
        );
        // Sweep amplitudes — both in (0, π) and rage > normal.
        assert!(
            TITAN_SWEEP_AMPLITUDE > 0.0 && TITAN_SWEEP_AMPLITUDE < trig::PI,
            "sweep amplitude {} outside (0, π)",
            TITAN_SWEEP_AMPLITUDE
        );
        assert!(
            TITAN_RAGE_SWEEP_AMPLITUDE > TITAN_SWEEP_AMPLITUDE,
            "rage amplitude must exceed normal"
        );
    }
}
