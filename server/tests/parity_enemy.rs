//! Cross-language parity vector for HUNTER chase + single-shot fire.
//!
//! Drives the Rust `update_enemy` step over 30 ticks of pure linear chase
//! (no boundary bounce, no death, no burst-fire) and asserts agreement
//! with a JS reference computation within an f32 tolerance.
//!
//! Fixtures in this file:
//!   - `hunter_basic_chase` — the original 30-tick chase + single-fire
//!     parity vector. Uses an empty `rng` and `frame_clock_ms = 0`.
//!   - `hunter_chase_with_ctx_plumbing` — same scenario, but populates
//!     `EnemyContext::frame_clock_ms` and `EnemyContext::rng` with
//!     non-default values. Asserts identical output to
//!     `hunter_basic_chase` (the new fields are inert until
//!     `hunter_arc` is ported). Mirrors agent F's
//!     `parity_wave::wave1_with_populated_context` invariant.
//!
//! ## Scope
//!
//! HUNTER ONLY. The full `js/sim/enemy.js::updateEnemy()` dispatches
//! across 10 enemy types, 6 event types, multiple movement strategies,
//! frameClock-driven lunge dice, music-sync shield rotation, and
//! line-of-sight checks. None of that is covered here — see the
//! `server/src/sim/enemy.rs` module docstring for the full deferred
//! list.
//!
//! The "chase" path under test is the **simplified** chase from
//! `js/modules/enemy/movement.js::chasePlayer()` standard branch
//! (lines 73–97), NOT the production `hunter_arc` movement
//! (`movement.js::hunterArcMovement()`). The real HUNTER's `hunter_arc`
//! uses sticky per-spawn random state + frameClock timestamps + vortex-
//! paced angular speed, none of which is parity-friendly without a
//! deterministic clock + RNG plumbed through the per-tick context.
//!
//! ## `hunter_arc` audit (2026-05-10)
//!
//! The JS HUNTER's `enemy-data.js` config declares
//! `movePattern: 'hunter_arc'`, and `Enemy.updateMovement()` dispatches
//! that key to `hunterArcMovement()` (movement.js:806-901) — which:
//!   - Pulls 6 `Math.random()` values on first call (sticky per-spawn
//!     `_arcDirection`, `_arcRadius`, `_arcOmega`, `_arcLungeRollAt`,
//!     `_arcSlingRollAt`, `_arcWeavePhase`).
//!   - Reads `frameClock.now` on every tick for the lunge / slingshot
//!     dice gates.
//!   - Pulls fresh `Math.random()` values on each subsequent lunge /
//!     sling roll.
//!
//! Cross-language byte-for-byte parity is **impossible without
//! harmonizing JS-side onto a deterministic Pcg64 + injected
//! frameClock**. The plumbing landed here (`frame_clock_ms` + `rng` on
//! `EnemyContext`) is the Rust half of that contract; the JS half (a
//! `ctx.rng` + `ctx.now` argument threaded into `hunterArcMovement`
//! instead of the global reads) is deferred to a follow-up session.
//!
//! ## Reference values
//!
//! Captured 2026-05-10 with the JS one-liner below. The reference
//! mirrors the simplified chase + countdown-fire path that the Rust
//! port implements (no weave term, no frameClock):
//!
//! ```bash
//! cd /Users/silvr/projects/rainboids
//! node --input-type=module -e "
//!   const TICK_SCALE = 30 / 60;
//!   const HUNTER_SPEED = 2.6;
//!   const ACCEL = 0.012;
//!   const SPEED_CAP_MULTIPLIER = 1.08;
//!   const FIRE_COOLDOWN_MS = 400;
//!
//!   const enemy = { x: 300, y: 300, vx: 0, vy: 0,
//!                   fireCooldownMs: 200 };
//!   const ship = { x: 500, y: 500 };
//!   const dt = 1/60;
//!   let fireEvents = 0;
//!
//!   for (let i = 0; i < 30; i++) {
//!     const dx = ship.x - enemy.x;
//!     const dy = ship.y - enemy.y;
//!     const distance = Math.hypot(dx, dy);
//!     if (distance > 0) {
//!       enemy.vx += (dx / distance) * ACCEL;
//!       enemy.vy += (dy / distance) * ACCEL;
//!       const speed = Math.hypot(enemy.vx, enemy.vy);
//!       const maxSpeed = HUNTER_SPEED * SPEED_CAP_MULTIPLIER;
//!       if (speed > maxSpeed) {
//!         enemy.vx = (enemy.vx / speed) * maxSpeed;
//!         enemy.vy = (enemy.vy / speed) * maxSpeed;
//!       }
//!     }
//!     enemy.fireCooldownMs -= dt * 1000;
//!     if (enemy.fireCooldownMs <= 0) {
//!       fireEvents += 1;
//!       enemy.fireCooldownMs = FIRE_COOLDOWN_MS;
//!     }
//!     enemy.x += enemy.vx * TICK_SCALE;
//!     enemy.y += enemy.vy * TICK_SCALE;
//!   }
//!   console.log(JSON.stringify({
//!     x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy,
//!     fireCooldownMs: enemy.fireCooldownMs, fireEvents
//!   }));
//! "
//! # → {"x":301.97282791951045,"y":301.97282791951045,
//! #    "vx":0.2545584412271571,"vy":0.2545584412271571,
//! #    "fireCooldownMs":116.66666666666659,"fireEvents":1}
//! ```
//!
//! Tolerance: 0.01 px on position/velocity (matches `parity_asteroid` /
//! `ship_basic_movement`). Fire event count: exact match — both sides
//! count integer events, no rounding.

use rainboids_server::sim::{
    enemy::{update_enemy, BulletPattern, Enemy, EnemyContext, EnemyEvent, ShipPosition},
    rng,
};

#[test]
fn hunter_basic_chase() {
    // Setup: HUNTER at (300, 300) with zero velocity. Stationary ship
    // at (500, 500) — 200 px away on each axis (~283 px diagonal).
    // Initial cooldown 200 ms so the test exercises one fire event
    // mid-run (200 / (1000/60) ≈ 12 ticks; fires on tick 13).
    let mut enemy = Enemy::fresh_hunter(1, 300.0, 300.0);
    enemy.fire_cooldown_ms = 200.0;
    enemy.fire_cooldown_reset_ms = 400.0; // tight cooldown so the test
                                          // path can reach the gate

    let ctx = EnemyContext {
        ships: vec![ShipPosition {
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
        }],
        dt: 1.0 / 60.0,
        tick_scale: 0.5,
        field_width: 1920.0,
        field_height: 1080.0,
        frame_clock_ms: 0,
        rng: None,
    };

    let mut events: Vec<EnemyEvent> = Vec::new();
    for _ in 0..30 {
        update_enemy(&mut enemy, &ctx, &mut events);
    }

    let fire_count = events
        .iter()
        .filter(|e| matches!(e, EnemyEvent::Fire { kind: BulletPattern::SingleShot, .. }))
        .count();

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"fireCooldownMs\":{},\"fireEvents\":{}}}",
        enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.fire_cooldown_ms, fire_count
    );

    // JS reference values captured 2026-05-10 (see header docstring).
    //
    // Position/velocity match within f32 tolerance; the chase math is
    // pure trig + multiply-add and doesn't accumulate enough error to
    // exceed 0.01 px over 30 ticks. The fire EVENT COUNT also matches
    // exactly — both sides emit one fire over the run.
    //
    // The residual `fire_cooldown_ms` does NOT match between Rust f32 and
    // JS f64. Iterative `cooldown -= 1/60 * 1000` accumulates ~16 ppm of
    // drift per tick in f32 (1.0/60.0 rounds UP to ~0.016666668 in f32 vs
    // ~0.016666667 in f64). After ~12 iterations the f32 cooldown has
    // overshot zero by ~50 µs while the f64 cooldown is still ~7e-15
    // above zero — same gate condition (`<= 0.0`) but f32 trips it one
    // tick earlier. Net effect: Rust fires on tick 11 (0-indexed), JS
    // fires on tick 12; both emit exactly one fire over the 30-tick run,
    // but the post-fire residual differs by exactly one tick (16.67 ms).
    //
    // Phase 2.1+ TODO: when fire timing becomes load-bearing for
    // gameplay (e.g. burst patterns, predictive lead), revisit by either
    //   (a) carrying the cooldown in f64 / fixed-point on both sides, or
    //   (b) framing the fire decision around an integer tick counter.
    let expected_x: f32 = 301.972_83;
    let expected_y: f32 = 301.972_83;
    let expected_vx: f32 = 0.254_558_44;
    let expected_vy: f32 = 0.254_558_44;
    let expected_fire_events: usize = 1;

    let close = |actual: f32, expected: f32, what: &str| {
        let delta = (actual - expected).abs();
        assert!(
            delta < 0.01,
            "{} diverged: rust={}, js={}, |Δ|={}",
            what,
            actual,
            expected,
            delta,
        );
    };

    close(enemy.x, expected_x, "enemy.x");
    close(enemy.y, expected_y, "enemy.y");
    close(enemy.vx, expected_vx, "enemy.vx");
    close(enemy.vy, expected_vy, "enemy.vy");
    assert_eq!(
        fire_count, expected_fire_events,
        "expected exactly {} fire event(s), got {}",
        expected_fire_events, fire_count
    );
    assert!(enemy.active, "enemy.active should remain true");
}

/// Same scenario as `hunter_basic_chase` but with the new
/// `EnemyContext::frame_clock_ms` and `EnemyContext::rng` fields
/// populated with non-default values. The simplified chase + countdown
/// fire path **does not read either field today**, so the output must
/// be identical to the baseline.
///
/// This fixture serves two purposes:
///
///   1. Backstop for the ctx-plumbing landing — if a future change
///      starts reading `ctx.rng` or `ctx.frame_clock_ms` from the
///      simplified chase path, this test diverges and the divergence
///      points at the new dependency immediately.
///
///   2. Forward-compat surface for `hunter_arc` — once the production
///      `hunter_arc` movement (`movement.js:806-901`) is ported,
///      `update_hunter` will start consuming both fields. At that
///      point this fixture will need a fresh JS golden (captured with
///      a deterministic Pcg64 + injected frameClock on the JS side)
///      and its expected values updated. Until then, the assertions
///      below MUST match `hunter_basic_chase` exactly.
///
/// Mirrors agent F's `parity_wave::wave1_with_populated_context`
/// invariant (PR #28).
#[test]
fn hunter_chase_with_ctx_plumbing() {
    // ── Same baseline setup as `hunter_basic_chase` ──
    let mut enemy = Enemy::fresh_hunter(1, 300.0, 300.0);
    enemy.fire_cooldown_ms = 200.0;
    enemy.fire_cooldown_reset_ms = 400.0;

    // Seed 42 matches `parity_vectors::pcg64_seed_42` captures, so if
    // a future `hunter_arc` port starts consuming the RNG the resulting
    // golden can be cross-checked against existing PCG64 trace fixtures.
    let mut rng = rng::from_seed(42);

    // Non-zero `frame_clock_ms` — picked to exercise a value that would
    // matter for `hunter_arc` lunge dice (`now > arc_lunge_roll_at`)
    // but currently flows past untouched.
    let frame_clock_ms: u64 = 1_234_567;

    // Snapshot the RNG state via a parallel control stream — we
    // verify post-run that the test RNG is byte-for-byte identical,
    // proving `update_enemy` did not consume any values.
    let mut control_rng = rng::from_seed(42);

    let mut events: Vec<EnemyEvent> = Vec::new();
    for tick in 0..30 {
        let ctx = EnemyContext {
            ships: vec![ShipPosition {
                x: 500.0,
                y: 500.0,
                vx: 0.0,
                vy: 0.0,
            }],
            dt: 1.0 / 60.0,
            tick_scale: 0.5,
            field_width: 1920.0,
            field_height: 1080.0,
            // Advance the clock by 16.67 ms per tick (60 Hz). When
            // `hunter_arc` lands, this monotonic stream is what the
            // lunge / sling dice will gate on.
            frame_clock_ms: frame_clock_ms + (tick as u64) * 17,
            rng: Some(&mut rng),
        };
        update_enemy(&mut enemy, &ctx, &mut events);
    }

    let fire_count = events
        .iter()
        .filter(|e| matches!(e, EnemyEvent::Fire { kind: BulletPattern::SingleShot, .. }))
        .count();

    eprintln!(
        "RUST-EMITS (populated ctx): {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"fireCooldownMs\":{},\"fireEvents\":{}}}",
        enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.fire_cooldown_ms, fire_count
    );

    // ── Identical golden to `hunter_basic_chase` ──
    // The new ctx fields must not perturb the chase output.
    let expected_x: f32 = 301.972_83;
    let expected_y: f32 = 301.972_83;
    let expected_vx: f32 = 0.254_558_44;
    let expected_vy: f32 = 0.254_558_44;
    let expected_fire_events: usize = 1;

    let close = |actual: f32, expected: f32, what: &str| {
        let delta = (actual - expected).abs();
        assert!(
            delta < 0.01,
            "{} diverged: rust={}, js={}, |Δ|={}",
            what,
            actual,
            expected,
            delta,
        );
    };

    close(enemy.x, expected_x, "enemy.x");
    close(enemy.y, expected_y, "enemy.y");
    close(enemy.vx, expected_vx, "enemy.vx");
    close(enemy.vy, expected_vy, "enemy.vy");
    assert_eq!(
        fire_count, expected_fire_events,
        "expected exactly {} fire event(s) (must match baseline), got {}",
        expected_fire_events, fire_count
    );
    assert!(enemy.active, "enemy.active should remain true");

    // ── Sanity: the RNG must be untouched ──
    // If `update_enemy` ever starts consuming the RNG, this assertion
    // will fail and the doc comment on `EnemyContext::rng` will need
    // updating to reflect the new "consumed by update_enemy" semantics.
    use rand::RngCore;
    assert_eq!(
        rng.next_u64(),
        control_rng.next_u64(),
        "ctx.rng state must be unchanged — update_enemy does not read it today"
    );
}
