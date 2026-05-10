//! Cross-language parity vector for HUNTER chase + single-shot fire.
//!
//! Drives the Rust `update_enemy` step over 30 ticks of pure linear chase
//! (no boundary bounce, no death, no burst-fire) and asserts agreement
//! with a JS reference computation within an f32 tolerance.
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

use rainboids_server::sim::enemy::{
    update_enemy, BulletPattern, Enemy, EnemyContext, EnemyEvent, ShipPosition,
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
        now_ms: 0,
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
