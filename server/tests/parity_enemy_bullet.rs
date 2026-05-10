//! Cross-language parity vectors for enemy-bullet ballistics (Phase 2.1).
//!
//! Mirrors `js/sim/bullet.js::updateEnemyBullet` for the 3 simplest movement
//! patterns:
//!
//!   - `Straight` ↔ JS `aimed` / `crescent_beam` / `crescent_slice` (no-mod
//!     velocity path).
//!   - `Sine` ↔ JS `sine_wave_nospin` (perpendicular sine offset).
//!   - `Decelerate` ↔ JS `missile_decelerate` (subtractive speed decay,
//!     clamped at `min_speed`).
//!
//! See `server/src/sim/bullet.rs` module docstring for the full list of
//! ~14 deferred patterns (helix, homing, ricochet, rocket, mine, spiral,
//! energy_slash, bezier, charge, etc.).
//!
//! Reference values were captured against the JS source by running the
//! one-liner embedded in this file; both sides compute the same trajectory
//! within an f32-tolerance of 0.01 px.

use rainboids_server::sim::bullet::{
    update_enemy_bullet, BulletEvent, BulletPattern, EnemyBullet, EnemyBulletContext,
};

/// Helper — assert two f32 values are within 0.01 of each other.
fn close(actual: f32, expected: f32, what: &str) {
    let delta = (actual - expected).abs();
    assert!(
        delta < 0.01,
        "{} diverged: rust={}, js={}, |Δ|={}",
        what,
        actual,
        expected,
        delta,
    );
}

/// Build a default EnemyBullet shell — overrides applied by the caller.
fn default_enemy_bullet(id: u32, pattern: BulletPattern) -> EnemyBullet {
    EnemyBullet {
        id,
        pattern,
        x: 0.0,
        y: 0.0,
        vx: 0.0,
        vy: 0.0,
        start_x: 0.0,
        start_y: 0.0,
        base_vx: 0.0,
        base_vy: 0.0,
        life: 1.0,
        max_life: 180,
        damage: 10.0,
        radius: 4.0,
        base_radius: 4.0,
        max_range: 9999.0,
        range_multiplier: 1.0,
        pattern_timer: 0.0,
        pattern_phase: 0.0,
        sine_phase: 0.0,
        sine_freq: 0.0,
        sine_amp: 0.0,
        sine_perp_x: 0.0,
        sine_perp_y: 0.0,
        deceleration: 0.0,
        min_speed: 0.0,
        active: true,
        expired_by_range: false,
        expired_by_bounds: false,
        expired_by_distance: false,
    }
}

fn default_ctx() -> EnemyBulletContext {
    EnemyBulletContext {
        tick_scale: 0.5,
        logic_tick_seconds: 1.0 / 60.0,
        boundary_width: 9999.0,
        boundary_height: 9999.0,
    }
}

// ── Fixture 1: straight-line drift ───────────────────────────────────────
//
// JS reference values captured 2026-05-10 from
// `js/sim/bullet.js::updateEnemyBullet` via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(1, 'enemy', { movementPattern: 'aimed',
//         x: 200, y: 200, vx: 5, vy: 0, baseVx: 5, baseVy: 0,
//         startX: 200, startY: 200, life: 0, maxLife: 180,
//         damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 30; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         life: b.life, active: b.active, patternTimer: b.patternTimer }));
//   "
//   → {"x":275,"y":200,"vx":5,"vy":0,"life":1,"active":true,
//      "patternTimer":0.49999999999999994}
#[test]
fn enemy_bullet_straight_drift() {
    let mut b = default_enemy_bullet(1, BulletPattern::Straight);
    b.x = 200.0;
    b.y = 200.0;
    b.vx = 5.0;
    b.vy = 0.0;
    b.start_x = 200.0;
    b.start_y = 200.0;
    b.base_vx = 5.0;
    b.base_vy = 0.0;
    b.life = 0.0; // freshBulletState defaults enemy life to 1.0; the JS
                  // override sets `life: 0` then the lifetime branch
                  // overwrites it from progress on every tick — final value
                  // is 1.0 (held during 0..0.65 progress).

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 275.0, "bullet.x");
    close(b.y, 200.0, "bullet.y");
    close(b.vx, 5.0, "bullet.vx");
    close(b.vy, 0.0, "bullet.vy");
    close(b.life, 1.0, "bullet.life");
    close(b.pattern_timer, 0.5, "bullet.pattern_timer");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 2: sine-wave perpendicular offset ────────────────────────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(2, 'enemy', { movementPattern:
//         'sine_wave_nospin', x: 300, y: 300, vx: 4, vy: 0,
//         baseVx: 4, baseVy: 0, startX: 300, startY: 300,
//         sinePhase: 0, sineFreq: 0.15, sineAmp: 20,
//         sinePerpX: 0, sinePerpY: 1,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 20; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         sinePhase: b.sinePhase, life: b.life, active: b.active }));
//   "
//   → {"x":340,"y":433.1229240873557,"vx":4,"vy":2.822400161197362,
//      "sinePhase":2.999999999999999,"life":1,"active":true}
#[test]
fn enemy_bullet_sine_offset() {
    let mut b = default_enemy_bullet(2, BulletPattern::Sine);
    b.x = 300.0;
    b.y = 300.0;
    b.vx = 4.0;
    b.vy = 0.0;
    b.start_x = 300.0;
    b.start_y = 300.0;
    b.base_vx = 4.0;
    b.base_vy = 0.0;
    b.sine_phase = 0.0;
    b.sine_freq = 0.15;
    b.sine_amp = 20.0;
    b.sine_perp_x = 0.0;
    b.sine_perp_y = 1.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..20 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 340.0, "bullet.x");
    close(b.y, 433.1229240873557, "bullet.y");
    close(b.vx, 4.0, "bullet.vx");
    close(b.vy, 2.822400161197362, "bullet.vy");
    close(b.sine_phase, 2.999999999999999, "bullet.sine_phase");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 3: missile_decelerate floor expiry ───────────────────────────
//
// JS reference values captured 2026-05-10 via (note: deceleration & minSpeed
// must be attached manually — `freshBulletState` doesn't propagate them):
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(3, 'enemy', { movementPattern:
//         'missile_decelerate', x: 400, y: 400, vx: 8, vy: 2,
//         baseVx: 8, baseVy: 2, startX: 400, startY: 400,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     b.deceleration = 0.96;
//     b.minSpeed = 0.5;
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 30; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         active: b.active, expiredByDistance: b.expiredByDistance }));
//   "
//   → {"x":415.7210088475614,"y":403.9302522118903,
//      "vx":0.48507125007266594,"vy":0.12126781251816648,
//      "active":false,"expiredByDistance":true}
#[test]
fn enemy_bullet_decelerate() {
    let mut b = default_enemy_bullet(3, BulletPattern::Decelerate);
    b.x = 400.0;
    b.y = 400.0;
    b.vx = 8.0;
    b.vy = 2.0;
    b.start_x = 400.0;
    b.start_y = 400.0;
    b.base_vx = 8.0;
    b.base_vy = 2.0;
    b.deceleration = 0.96;
    b.min_speed = 0.5;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 415.7210088475614, "bullet.x");
    close(b.y, 403.9302522118903, "bullet.y");
    close(b.vx, 0.48507125007266594, "bullet.vx");
    close(b.vy, 0.12126781251816648, "bullet.vy");
    assert!(!b.active, "bullet should have expired at min-speed floor");
    assert!(
        b.expired_by_distance,
        "bullet should have expired_by_distance=true",
    );

    // Decelerate hitting min-speed floor emits exactly one Despawn — the
    // wrapper releases the slot and triggers the explosion FX based on
    // `expired_by_distance`. JS doesn't currently emit despawn events
    // explicitly (the wrapper polls `bullet.active`), but our Rust API
    // surfaces it as an enum so the wrapper can pre-allocate.
    assert_eq!(
        events.len(),
        1,
        "expected one Despawn event for decelerated bullet, got {:?}",
        events,
    );
    assert_eq!(events[0], BulletEvent::Despawn { bullet_id: 3 });
}
