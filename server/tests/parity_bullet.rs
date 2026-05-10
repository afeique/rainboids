//! Cross-language parity vectors for player-bullet ballistics (Phase 2).
//!
//! Mirrors `js/sim/bullet.js::updatePlayerBullet`. These fixtures exercise
//! the linear-drift, helix, and predictive-lead homing branches. Piercing
//! and explosive remain deferred (collision-side, Phase 2.5) — see
//! `server/src/sim/bullet.rs` module docstring.
//!
//! Reference values were captured against the JS source by running the
//! one-liners embedded in each test; both sides compute the same trajectory
//! within an f32-tolerance of 0.01 px / 0.01 frames.

use rainboids_server::sim::bullet::{
    update_player_bullet, BulletEvent, PlayerBullet, PlayerBulletContext, TargetPosition,
};

/// Shared assertion helper — same tight 0.01 px tolerance used by the ship
/// and drop parity vectors. Tight enough to catch a real divergence
/// (constant mismatch, ordering bug), loose enough to absorb f64↔f32
/// accumulation noise.
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

/// Build a fully-populated `PlayerBullet` with helix / homing flags off
/// by default. Each fixture overrides only the fields under test.
fn fresh_player_bullet(id: u32, x: f32, y: f32, vx: f32, vy: f32) -> PlayerBullet {
    PlayerBullet {
        id,
        x,
        y,
        vx,
        vy,
        life: 0,
        max_life: 60,
        damage: 20.0,
        radius: 4.0,
        base_radius: 4.0,
        max_range: 9999.0,
        range_multiplier: 1.0,
        fade_factor: 1.0,
        active: true,
        expired_by_range: false,
        expired_by_bounds: false,
        owner: Some(0),
        helix_active: false,
        helix_freq: 0.0,
        helix_phase: 0.0,
        helix_amplitude: 0.0,
        homing: false,
        homing_strength: 0.0,
    }
}

#[test]
fn player_bullet_straight_line() {
    // Setup: a fresh player bullet at (200, 200) drifting east at 10 px/tick.
    // Lifetime 60 frames at full range — well above the 30 ticks we run, so
    // the bullet should still be active at the end. Boundary 1920×1080 is
    // far outside the 30×10 = 300 px the bullet traverses, so no bounds-cull.
    //
    // NOTE on `life: 0`: JS player-bullet uses `life` as a 0-based counter
    // incremented every tick (bullet.js:59) and despawns when it reaches
    // `max_life` (bullet.js:64). A freshly-spawned bullet starts at 0; this
    // fixture mirrors that. (The task spec mentioned "life=60, max_life=60"
    // verbatim, but that initial value would despawn immediately on tick 0
    // — both sides agree on this. The intent is "30 ticks of straight-line
    // drift", which requires `life: 0`.)
    let mut bullet = fresh_player_bullet(1, 200.0, 200.0, 10.0, 0.0);
    bullet.max_range = 900.0;

    let ctx = PlayerBulletContext {
        tick_scale: 0.5,
        bullet_speed: 10.0,
        boundary_width: 1920.0,
        boundary_height: 1080.0,
        homing_target: None,
    };

    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_player_bullet(&mut bullet, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"life\":{},\"active\":{}}}",
        bullet.x, bullet.y, bullet.vx, bullet.vy, bullet.life, bullet.active
    );

    // JS reference values captured 2026-05-10 from
    // `js/sim/bullet.js::updatePlayerBullet`:
    //
    //   node --input-type=module -e "
    //     import { updatePlayerBullet } from './js/sim/bullet.js';
    //     const b = { id: 1, kind: 'player', x: 200, y: 200, vx: 10.0, vy: 0,
    //       startX: 200, startY: 200, life: 0, maxLife: 60, damage: 20,
    //       radius: 4, baseRadius: 4, maxRange: 900, rangeMultiplier: 1.0,
    //       active: true, owner: 0, homing: false, helixActive: false,
    //       piercing: 0, piercedEnemies: 0, explosive: false, fadeFactor: 1.0 };
    //     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60,
    //       bulletSpeed: 10.0, boundaryWidth: 1920, boundaryHeight: 1080,
    //       now: 0, targetPlayer: null, homingTarget: null,
    //       rngFloat: () => 0.5 };
    //     for (let i = 0; i < 30; i++) updatePlayerBullet(b, ctx, []);
    //     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    //       life: b.life, active: b.active }));
    //   "
    //   → {"x":500,"y":200,"vx":10,"vy":0,"life":30,"active":true}
    let expected_x: f32 = 500.0;
    let expected_y: f32 = 200.0;
    let expected_vx: f32 = 10.0;
    let expected_vy: f32 = 0.0;
    let expected_life: u32 = 30;
    let expected_active: bool = true;

    close(bullet.x, expected_x, "bullet.x");
    close(bullet.y, expected_y, "bullet.y");
    close(bullet.vx, expected_vx, "bullet.vx");
    close(bullet.vy, expected_vy, "bullet.vy");
    assert_eq!(bullet.life, expected_life, "bullet.life diverged");
    assert_eq!(bullet.active, expected_active, "bullet.active diverged");

    // Linear-drift path emits no Despawn events while the bullet is alive.
    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

#[test]
fn player_bullet_helix() {
    // Setup: a Rail-Driver-style bullet at (200, 200) drifting east at
    // 10 px/tick with helix enabled. helixFreq=0.3, helixPhase=0,
    // helixAmplitude=4 — a moderately wiggling bullet whose underlying
    // rail position still advances by `vel` exactly each tick (the helix
    // adds the **delta** of the perpendicular sine, not the full sine —
    // see js bullet.js:96–101).
    //
    // Boundary far outside the 30×10 = 300 px traversed, so no bounds-cull.
    // After 30 ticks: x has advanced exactly 300 (linear east drift), y
    // oscillates around 200 within the ±4 amplitude band.
    let mut bullet = fresh_player_bullet(1, 200.0, 200.0, 10.0, 0.0);
    bullet.helix_active = true;
    bullet.helix_freq = 0.3;
    bullet.helix_phase = 0.0;
    bullet.helix_amplitude = 4.0;

    let ctx = PlayerBulletContext {
        tick_scale: 0.5,
        bullet_speed: 10.0,
        boundary_width: 9999.0,
        boundary_height: 9999.0,
        homing_target: None,
    };

    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_player_bullet(&mut bullet, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"life\":{},\"active\":{}}}",
        bullet.x, bullet.y, bullet.vx, bullet.vy, bullet.life, bullet.active
    );

    // JS reference values captured 2026-05-10 from
    // `js/sim/bullet.js::updatePlayerBullet` (helix branch):
    //
    //   node --input-type=module -e "
    //     import { updatePlayerBullet } from './js/sim/bullet.js';
    //     const b = { id: 1, kind: 'player', x: 200, y: 200, vx: 10, vy: 0,
    //       startX: 200, startY: 200, life: 0, maxLife: 60, damage: 20,
    //       radius: 4, baseRadius: 4, maxRange: 9999, rangeMultiplier: 1.0,
    //       active: true, owner: 0, homing: false,
    //       helixActive: true, helixFreq: 0.3, helixPhase: 0,
    //       helixAmplitude: 4.0, piercing: 0, piercedEnemies: 0,
    //       explosive: false, fadeFactor: 1.0 };
    //     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60,
    //       bulletSpeed: 10, boundaryWidth: 9999, boundaryHeight: 9999,
    //       now: 0, targetPlayer: null, homingTarget: null,
    //       rngFloat: () => 0.5 };
    //     for (let i = 0; i < 30; i++) updatePlayerBullet(b, ctx, []);
    //     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    //       life: b.life, active: b.active }));
    //   "
    //   → {"x":500,"y":201.64847394096702,"vx":10,"vy":0,"life":30,"active":true}
    let expected_x: f32 = 500.0;
    let expected_y: f32 = 201.648_47;
    let expected_vx: f32 = 10.0;
    let expected_vy: f32 = 0.0;
    let expected_life: u32 = 30;

    close(bullet.x, expected_x, "bullet.x");
    close(bullet.y, expected_y, "bullet.y");
    close(bullet.vx, expected_vx, "bullet.vx");
    close(bullet.vy, expected_vy, "bullet.vy");
    assert_eq!(bullet.life, expected_life, "bullet.life diverged");
    assert!(bullet.active, "bullet should still be active after 30 ticks");

    // Sanity: the y oscillates within the helix amplitude band (±4 px).
    // The exact end-state is captured above; this guard catches a runaway
    // helix divergence that might still happen to pass the per-coord
    // tolerance by sheer luck.
    assert!(
        (bullet.y - 200.0).abs() <= 4.0 + 0.01,
        "helix y drifted outside amplitude band: y={}",
        bullet.y,
    );

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}

#[test]
fn player_bullet_homing() {
    // Setup: a homing bullet at (200, 200) drifting east at 10 px/tick,
    // with a stationary target at (300, 400). The target is south + east,
    // so the bullet should curve south while continuing to advance.
    //
    // homingStrength=0.05 base; the JS distance-ramp doubles this when
    // within HOMING_RAMP_RADIUS=200px. The bullet's speed is normalized to
    // bulletSpeed * HOMING_SPEED_BOOST (10 * 1.1 = 11) after each turn.
    //
    // Boundary far outside, so no bounds-cull. After 30 ticks the bullet
    // has curved measurably toward (300, 400) — final y is well south of
    // 200.
    let mut bullet = fresh_player_bullet(2, 200.0, 200.0, 10.0, 0.0);
    bullet.homing = true;
    bullet.homing_strength = 0.05;

    let target = TargetPosition {
        x: 300.0,
        y: 400.0,
        vx: 0.0,
        vy: 0.0,
    };

    let ctx = PlayerBulletContext {
        tick_scale: 0.5,
        bullet_speed: 10.0,
        boundary_width: 9999.0,
        boundary_height: 9999.0,
        homing_target: Some(target),
    };

    let mut events: Vec<BulletEvent> = Vec::new();
    for _ in 0..30 {
        update_player_bullet(&mut bullet, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"life\":{},\"active\":{}}}",
        bullet.x, bullet.y, bullet.vx, bullet.vy, bullet.life, bullet.active
    );

    // JS reference values captured 2026-05-10 from
    // `js/sim/bullet.js::updatePlayerBullet` (homing branch):
    //
    //   node --input-type=module -e "
    //     import { updatePlayerBullet } from './js/sim/bullet.js';
    //     const b = { id: 2, kind: 'player', x: 200, y: 200, vx: 10, vy: 0,
    //       startX: 200, startY: 200, life: 0, maxLife: 60, damage: 20,
    //       radius: 4, baseRadius: 4, maxRange: 9999, rangeMultiplier: 1.0,
    //       active: true, owner: 0, homing: true, homingStrength: 0.05,
    //       helixActive: false, piercing: 0, piercedEnemies: 0,
    //       explosive: false, fadeFactor: 1.0 };
    //     const ctx = { tickScale: 0.5, logicTickSeconds: 1/60,
    //       bulletSpeed: 10, boundaryWidth: 9999, boundaryHeight: 9999,
    //       now: 0, targetPlayer: null,
    //       homingTarget: { x: 300, y: 400, vx: 0, vy: 0 },
    //       rngFloat: () => 0.5 };
    //     for (let i = 0; i < 30; i++) updatePlayerBullet(b, ctx, []);
    //     console.log(JSON.stringify({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    //       life: b.life, active: b.active }));
    //   "
    //   → {"x":527.0717978356909,"y":238.26163078250667,
    //      "vx":10.722323499658602,"vy":2.4559679901555906,
    //      "life":30,"active":true}
    //
    // Note on JS shape: applyPlayerHoming reads `target.vel.x/.y`, but the
    // capture above passed `vx/vy` directly. Since both are 0, the lead-
    // prediction term is identically zero either way; the Rust side
    // exposes a flat `vx/vy` shape for ergonomics.
    let expected_x: f32 = 527.071_8;
    let expected_y: f32 = 238.261_63;
    let expected_vx: f32 = 10.722_323;
    let expected_vy: f32 = 2.455_968;
    let expected_life: u32 = 30;

    close(bullet.x, expected_x, "bullet.x");
    close(bullet.y, expected_y, "bullet.y");
    close(bullet.vx, expected_vx, "bullet.vx");
    close(bullet.vy, expected_vy, "bullet.vy");
    assert_eq!(bullet.life, expected_life, "bullet.life diverged");
    assert!(bullet.active, "bullet should still be active after 30 ticks");

    // Sanity: bullet should be measurably south of its origin (target is
    // at y=400) and slightly faster than baseline (homing-speed boost of
    // 1.1× at full speed = 11 px/tick).
    assert!(
        bullet.y > 220.0,
        "homing bullet should curve south toward target: y={}",
        bullet.y,
    );
    let speed = bullet.vx.hypot(bullet.vy);
    assert!(
        (speed - 10.0 * 1.1).abs() < 0.01,
        "homing bullet speed should clamp to bulletSpeed * 1.1 = 11.0: got {}",
        speed,
    );

    assert!(
        events.is_empty(),
        "unexpected despawn events for alive bullet: {:?}",
        events,
    );
}
