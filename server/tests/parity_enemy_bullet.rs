//! Cross-language parity vectors for enemy-bullet ballistics (Phase 2.1).
//!
//! Mirrors `js/sim/bullet.js::updateEnemyBullet` for 11 movement patterns:
//!
//!   - `Straight` ↔ JS `aimed` / `crescent_beam` / `crescent_slice` (no-mod
//!     velocity path).
//!   - `Sine` ↔ JS `sine_wave_nospin` (perpendicular sine offset).
//!   - `Decelerate` ↔ JS `missile_decelerate` (subtractive speed decay,
//!     clamped at `min_speed`).
//!   - `Spread` ↔ JS `spread` (patternTimer-driven sin on perp-of-base axis).
//!   - `Spiral` ↔ JS `spiral` (rotating velocity vector + radius drift).
//!   - `WaveEnergy` ↔ JS `wave_energy` (high-amplitude sin on perp axis).
//!   - `ShieldBurst` ↔ JS `shield_burst` (high-freq sin wobble on perp axis).
//!   - `Burst` ↔ JS `burst` (linear timer-acceleration, * 0.5 coefficient).
//!   - `Pulse` ↔ JS `pulse` (linear timer-acceleration, * 0.8 coefficient).
//!   - `EnergySlash` ↔ JS `energy_slash` (slashProgress curve + patternTimer
//!     pulse intensity).
//!   - `SineWaveRotation` ↔ JS `sine_wave` (Sine variant that aligns rotation
//!     to travel direction via `rotation = atan2(vy, vx)`).
//!
//! See `server/src/sim/bullet.rs` module docstring for the deferred list
//! (helix, homing, ricochet, rocket, mine, bezier, charge, rapid, missile,
//! laser, etc.).
//!
//! Reference values were captured against the JS source by running the
//! one-liner embedded in each fixture; both sides compute the same
//! trajectory within an f32-tolerance of 0.01 px (looser for trig-heavy
//! patterns like `Spiral`).

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
        slash_progress: 0.0,
        rotation: 0.0,
        rotation_speed: 0.0,
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

// ── Fixture 4: spread (patternTimer sin on perp axis) ───────────────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(4, 'enemy', { movementPattern: 'spread',
//         x: 100, y: 100, vx: 4, vy: 0, baseVx: 4, baseVy: 0,
//         startX: 100, startY: 100, patternPhase: 0,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 25; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":150,"y":103.30405187501303,"vx":4,"vy":0.46601954298361314,
//      "patternTimer":0.41666666666666663,"life":1,"active":true}
#[test]
fn enemy_bullet_spread() {
    let mut b = default_enemy_bullet(4, BulletPattern::Spread);
    b.x = 100.0;
    b.y = 100.0;
    b.vx = 4.0;
    b.vy = 0.0;
    b.start_x = 100.0;
    b.start_y = 100.0;
    b.base_vx = 4.0;
    b.base_vy = 0.0;
    b.pattern_phase = 0.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..25 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 150.0, "bullet.x");
    close(b.y, 103.30405187501303, "bullet.y");
    close(b.vx, 4.0, "bullet.vx");
    close(b.vy, 0.46601954298361314, "bullet.vy");
    close(b.pattern_timer, 0.41666666666666663, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 5: spiral (rotating velocity + spread radius) ────────────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(5, 'enemy', { movementPattern: 'spiral',
//         x: 500, y: 500, vx: 3, vy: 0, baseVx: 3, baseVy: 0,
//         startX: 500, startY: 500,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 20; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":527.9517691193454,"y":509.24140765384163,
//      "vx":2.4088069018259324,"vy":1.7882673189879073,
//      "patternTimer":0.3333333333333333,"life":1,"active":true}
//
// Trig-heavy: tolerance is loosened to 0.05 px to absorb the cumulative
// difference between JS double-precision and Rust f32 single-precision
// after 20 rotated-velocity ticks.
#[test]
fn enemy_bullet_spiral() {
    let mut b = default_enemy_bullet(5, BulletPattern::Spiral);
    b.x = 500.0;
    b.y = 500.0;
    b.vx = 3.0;
    b.vy = 0.0;
    b.start_x = 500.0;
    b.start_y = 500.0;
    b.base_vx = 3.0;
    b.base_vy = 0.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..20 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    // Looser tolerance (0.05) for trig-heavy spiral accumulator. The
    // velocity check has the tightest budget; position deltas accumulate
    // 20 of those.
    fn close_loose(actual: f32, expected: f32, tol: f32, what: &str) {
        let delta = (actual - expected).abs();
        assert!(
            delta < tol,
            "{} diverged: rust={}, js={}, |Δ|={}, tol={}",
            what,
            actual,
            expected,
            delta,
            tol,
        );
    }
    close_loose(b.x, 527.9517691193454, 0.05, "bullet.x");
    close_loose(b.y, 509.24140765384163, 0.05, "bullet.y");
    close_loose(b.vx, 2.4088069018259324, 0.01, "bullet.vx");
    close_loose(b.vy, 1.7882673189879073, 0.01, "bullet.vy");
    close(b.pattern_timer, 0.3333333333333333, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 6: wave_energy (high-amp sin on perp axis) ───────────────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(6, 'enemy', { movementPattern: 'wave_energy',
//         x: 200, y: 200, vx: 5, vy: 0, baseVx: 5, baseVy: 0,
//         startX: 200, startY: 200,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 30; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":275,"y":213.56197728775817,"vx":5,
//      "vy":1.4890694865563827,"patternTimer":0.49999999999999994,
//      "life":1,"active":true}
#[test]
fn enemy_bullet_wave_energy() {
    let mut b = default_enemy_bullet(6, BulletPattern::WaveEnergy);
    b.x = 200.0;
    b.y = 200.0;
    b.vx = 5.0;
    b.vy = 0.0;
    b.start_x = 200.0;
    b.start_y = 200.0;
    b.base_vx = 5.0;
    b.base_vy = 0.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 275.0, "bullet.x");
    close(b.y, 213.56197728775817, "bullet.y");
    close(b.vx, 5.0, "bullet.vx");
    close(b.vy, 1.4890694865563827, "bullet.vy");
    close(b.pattern_timer, 0.49999999999999994, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 7: shield_burst (high-freq wobble on perp axis) ──────────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(7, 'enemy', { movementPattern: 'shield_burst',
//         x: 300, y: 300, vx: 4, vy: 3, baseVx: 4, baseVy: 3,
//         startX: 300, startY: 300,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 25; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":349.10385116660433,"y":338.694865111194,
//      "vx":4.00700489721131,"vy":2.990660137051587,
//      "patternTimer":0.41666666666666663,"life":1,"active":true}
#[test]
fn enemy_bullet_shield_burst() {
    let mut b = default_enemy_bullet(7, BulletPattern::ShieldBurst);
    b.x = 300.0;
    b.y = 300.0;
    b.vx = 4.0;
    b.vy = 3.0;
    b.start_x = 300.0;
    b.start_y = 300.0;
    b.base_vx = 4.0;
    b.base_vy = 3.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..25 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 349.10385116660433, "bullet.x");
    close(b.y, 338.694865111194, "bullet.y");
    close(b.vx, 4.00700489721131, "bullet.vx");
    close(b.vy, 2.990660137051587, "bullet.vy");
    close(b.pattern_timer, 0.41666666666666663, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 8: pulse (timer-driven linear acceleration on base velocity) ─
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(8, 'enemy', { movementPattern: 'pulse',
//         x: 200, y: 200, vx: 3, vy: 0, baseVx: 3, baseVy: 0,
//         startX: 200, startY: 200,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 25; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":243.5,"y":200,"vx":3.96,"vy":0,
//      "patternTimer":0.41666666666666663,"life":1,"active":true}
//
// vx growth confirms the formula: after 25 ticks, patternTimer = 25/60,
// so final-tick velocity = 3 * (1 + (25/60) * 0.8) = 3 * 1.32 = 3.96.
#[test]
fn enemy_bullet_pulse() {
    let mut b = default_enemy_bullet(8, BulletPattern::Pulse);
    b.x = 200.0;
    b.y = 200.0;
    b.vx = 3.0;
    b.vy = 0.0;
    b.start_x = 200.0;
    b.start_y = 200.0;
    b.base_vx = 3.0;
    b.base_vy = 0.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..25 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 243.5, "bullet.x");
    close(b.y, 200.0, "bullet.y");
    close(b.vx, 3.96, "bullet.vx");
    close(b.vy, 0.0, "bullet.vy");
    close(b.pattern_timer, 0.41666666666666663, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 9: burst (same shape as pulse, gentler coefficient) ──────────
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(9, 'enemy', { movementPattern: 'burst',
//         x: 100, y: 100, vx: 2, vy: 1, baseVx: 2, baseVy: 1,
//         startX: 100, startY: 100,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 30; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":133.625,"y":116.8125,
//      "vx":2.4833333333333334,"vy":1.2416666666666667,
//      "patternTimer":0.49999999999999994,"life":1,"active":true}
//
// vx growth confirms the formula: after 30 ticks, patternTimer = 30/60 = 0.5,
// so final-tick velocity = base * (1 + 0.5 * 0.5) = base * 1.25.
// 2.0 * 1.25 ≈ 2.4833 (uses pre-update timer of 29/60, not 30/60, since the
// pattern step runs BEFORE the timer increment).
#[test]
fn enemy_bullet_burst() {
    let mut b = default_enemy_bullet(9, BulletPattern::Burst);
    b.x = 100.0;
    b.y = 100.0;
    b.vx = 2.0;
    b.vy = 1.0;
    b.start_x = 100.0;
    b.start_y = 100.0;
    b.base_vx = 2.0;
    b.base_vy = 1.0;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 133.625, "bullet.x");
    close(b.y, 116.8125, "bullet.y");
    close(b.vx, 2.4833333333333334, "bullet.vx");
    close(b.vy, 1.2416666666666667, "bullet.vy");
    close(b.pattern_timer, 0.49999999999999994, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 10: energy_slash (slashProgress curve + patternTimer pulse) ──
//
// JS reference values captured 2026-05-10 via (note: slashProgress is set
// explicitly because `freshBulletState` doesn't propagate it):
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(10, 'enemy', { movementPattern: 'energy_slash',
//         x: 200, y: 200, vx: 4, vy: 0, baseVx: 4, baseVy: 0,
//         startX: 200, startY: 200,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     b.slashProgress = 0.5;
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 25; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         patternTimer: b.patternTimer, life: b.life, active: b.active }));
//   "
//   → {"x":252.98716277798522,"y":203.9740372083489,
//      "vx":3.976650342628968,"vy":0.2982487756971726,
//      "patternTimer":0.41666666666666663,"life":1,"active":true}
//
// slashProgress = 0.5 → sin(0.5π) = 1, so curveOffset = 0.3 (max). The perp
// of baseVx=4,baseVy=0 is (0, 1), so curve adds 0.3 to vy each tick. Pulse
// intensity = 1 + sin(t*8)*0.1 modulates the result modestly.
#[test]
fn enemy_bullet_energy_slash() {
    let mut b = default_enemy_bullet(10, BulletPattern::EnergySlash);
    b.x = 200.0;
    b.y = 200.0;
    b.vx = 4.0;
    b.vy = 0.0;
    b.start_x = 200.0;
    b.start_y = 200.0;
    b.base_vx = 4.0;
    b.base_vy = 0.0;
    b.slash_progress = 0.5;
    b.life = 0.0;

    let ctx = default_ctx();
    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..25 {
        update_enemy_bullet(&mut b, &ctx, &mut events);
    }

    close(b.x, 252.98716277798522, "bullet.x");
    close(b.y, 203.9740372083489, "bullet.y");
    close(b.vx, 3.976650342628968, "bullet.vx");
    close(b.vy, 0.2982487756971726, "bullet.vy");
    close(b.pattern_timer, 0.41666666666666663, "bullet.pattern_timer");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

// ── Fixture 11: sine_wave (Sine + rotation-alignment + rotation_speed) ───
//
// JS reference values captured 2026-05-10 via:
//
//   node --input-type=module -e "
//     import { updateEnemyBullet } from './js/sim/bullet.js';
//     import { freshBulletState } from './js/sim/state.js';
//     const b = freshBulletState(11, 'enemy', { movementPattern: 'sine_wave',
//         x: 300, y: 300, vx: 4, vy: 0, baseVx: 4, baseVy: 0,
//         startX: 300, startY: 300,
//         sinePhase: 0, sineFreq: 0.15, sineAmp: 20,
//         sinePerpX: 0, sinePerpY: 1,
//         rotation: 0, rotationSpeed: 0.05,
//         life: 0, maxLife: 180, damage: 10, radius: 4, baseRadius: 4,
//         maxRange: 9999, rangeMultiplier: 1.0, active: true });
//     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60, bulletSpeed: 10,
//         boundaryWidth: 9999, boundaryHeight: 9999, now: 0,
//         targetPlayer: null, homingTarget: null, rngFloat: () => 0.5 };
//     for (let i = 0; i < 20; i++) updateEnemyBullet(b, ctx, []);
//     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
//         sinePhase: b.sinePhase, rotation: b.rotation,
//         life: b.life, active: b.active }));
//   "
//   → {"x":340,"y":433.1229240873557,"vx":4,"vy":2.822400161197362,
//      "sinePhase":2.999999999999999,"rotation":0.6394745011005886,
//      "life":1,"active":true}
//
// Position / velocity / sine_phase match the `sine_offset` fixture exactly
// (the only difference between `Sine` and `SineWaveRotation` is the rotation
// write). Final rotation = atan2(2.8224, 4.0) + rotation_speed * tick_scale =
//   0.6144745 + 0.05 * 0.5 ≈ 0.6394745. Only the LAST tick's
// `rotation_speed * tick_scale` survives — every earlier tick's accumulator
// is overwritten by the next pattern step's atan2 write.
#[test]
fn enemy_bullet_sine_wave_rotation() {
    let mut b = default_enemy_bullet(11, BulletPattern::SineWaveRotation);
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
    b.rotation = 0.0;
    b.rotation_speed = 0.05;
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
    close(b.rotation, 0.6394745011005886, "bullet.rotation");
    close(b.life, 1.0, "bullet.life");
    assert!(b.active, "bullet should still be active");

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}
