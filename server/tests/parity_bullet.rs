//! Cross-language parity vector for player-bullet ballistics (Phase 2).
//!
//! Mirrors `js/sim/bullet.js::updatePlayerBullet`. This fixture exercises
//! ONLY the linear-drift subset (no helix, no homing, no piercing, no
//! explosive — see `server/src/sim/bullet.rs` module docstring for the full
//! deferred list).
//!
//! Reference values were captured against the JS source by running the
//! one-liner embedded in this file; both sides compute the same trajectory
//! within an f32-tolerance of 0.01 px / 0.01 frames.

use rainboids_server::sim::bullet::{
    update_player_bullet, BulletEvent, PlayerBullet, PlayerBulletContext,
};

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
    let mut bullet = PlayerBullet {
        id: 1,
        x: 200.0,
        y: 200.0,
        vx: 10.0,
        vy: 0.0,
        life: 0,
        max_life: 60,
        damage: 20.0,
        radius: 4.0,
        base_radius: 4.0,
        max_range: 900.0,
        range_multiplier: 1.0,
        fade_factor: 1.0,
        active: true,
        expired_by_range: false,
        expired_by_bounds: false,
        owner: Some(0),
    };

    let ctx = PlayerBulletContext {
        tick_scale: 0.5,
        boundary_width: 1920.0,
        boundary_height: 1080.0,
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
