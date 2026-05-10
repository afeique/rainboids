//! Cross-language parity vectors for `sim::drops::update_drop`.
//!
//! Each test prints a JSON document to stderr shaped like the JS
//! `tools/parity-runner.mjs` output (`RUST-EMITS:` prefix). CI runs both
//! sides and diffs them.
//!
//! Mirrors the layout of `parity_vectors.rs::ship_basic_movement`. Each
//! fixture exercises one canonical scenario; tolerances are tight enough
//! to catch real divergence (constant mismatch, ordering bug) but loose
//! enough to ride out the f64↔f32 noise.

use rainboids_server::protocol::ShipState;
use rainboids_server::sim::drops::{
    update_drop, Drop, DropContext, DropEvent, DropKind,
};
use rainboids_server::sim::state::Field;
use rainboids_server::util::id::PlayerId;

#[test]
fn drop_basic_drift_friction() {
    // Cross-language parity vector for drop physics — no magnet pull
    // (ship is far outside the 320 px health-magnet radius), no tractor
    // beam. This isolates the friction + position-update path.
    //
    // Setup:
    //   - Health orb at (500, 500), velocity (0.8, 0.4), life=7200,
    //     active=true, z=2 (default for collectibles).
    //   - One ship at (5000, 5000) — distance ≈ 6364 px, well beyond
    //     `DROP_MAGNET_FAR_RADIUS` (320 px), so no magnet pull.
    //   - 60 ticks of `update_drop` with dt = 1/60.
    //   - Tractor beam disabled.
    //
    // Expected behaviour: pure 0.92-per-tick friction on velocity with
    // x += vx applied each tick. After 60 ticks the velocity has
    // attenuated by 0.92⁶⁰ ≈ 0.00672 of its initial value, and the
    // position has advanced by 0.8 · (0.92 + 0.92² + … + 0.92⁶⁰) ≈ 9.14
    // pixels in x (and half that in y).
    //
    // JS reference values captured 2026-05-10 (today) from
    // `js/sim/drops.js` via:
    //
    //   node --input-type=module -e "
    //     import { updateDrop } from './js/sim/drops.js';
    //     import { freshDropState } from './js/sim/state.js';
    //     const drop = freshDropState('health',
    //         { id: 1, x: 500, y: 500, vx: 0.8, vy: 0.4, active: true });
    //     const ctx = {
    //         ships: [{ x: 5000, y: 5000, vx: 0, vy: 0, active: true }],
    //         dt: 1/60,
    //         field: { width: 1920, height: 1080 },
    //         tractorEngaged: false,
    //     };
    //     for (let i = 0; i < 60; i++) updateDrop(drop, ctx, []);
    //     console.log(JSON.stringify({
    //         x: drop.x, y: drop.y, vx: drop.vx, vy: drop.vy,
    //     }));
    //   "
    //
    // Output:
    //   {"x":509.1381901815344,"y":504.56909509076735,
    //    "vx":0.005374766823105334,"vy":0.002687383411552667}
    //
    // Tolerance: 0.01 on each coord — same threshold as
    // `ship_basic_movement`. Tight enough to catch a real divergence,
    // loose enough to ride out f64 (JS) vs f32 (Rust) accumulation
    // noise across 60 multiplies.

    let mut drop = Drop {
        id: 1,
        kind: DropKind::Health,
        x: 500.0,
        y: 500.0,
        vx: 0.8,
        vy: 0.4,
        life: 7200,
        radius: 14.0,
        value: 1,
        opacity: 1.0,
        z: 2.0,
        active: true,
    };

    let ships = vec![ShipState {
        player: PlayerId(1),
        x: 5000.0,
        y: 5000.0,
        vx: 0.0,
        vy: 0.0,
        angle: 0.0,
        hp: 100.0,
        shield: 0.0,
    }];

    let ctx = DropContext {
        ships: &ships,
        field: Field {
            width: 1920.0,
            height: 1080.0,
        },
        dt: 1.0_f32 / 60.0,
        tractor_engaged: false,
        tractor_attraction: 0.0,
        tractor_range: 0.0,
    };

    let mut events: Vec<DropEvent> = Vec::new();
    for _ in 0..60 {
        update_drop(&mut drop, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
        drop.x, drop.y, drop.vx, drop.vy
    );

    // Captured 2026-05-10 from `js/sim/drops.js` (see comment above).
    let expected_x: f32 = 509.138_18;
    let expected_y: f32 = 504.569_1;
    let expected_vx: f32 = 0.005_374_766_8;
    let expected_vy: f32 = 0.002_687_383_4;

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
    close(drop.x, expected_x, "drop.x");
    close(drop.y, expected_y, "drop.y");
    close(drop.vx, expected_vx, "drop.vx");
    close(drop.vy, expected_vy, "drop.vy");

    // Sanity: drop should still be alive and at full opacity (life
    // dropped from 7200 to 7140; opacity stays clamped at 1.0 since
    // life > DROP_OPACITY_FADE_FRAMES).
    assert!(drop.active, "drop should still be active after 60 ticks");
    assert_eq!(drop.life, 7140, "life should have decremented exactly 60");
    assert!(
        (drop.opacity - 1.0).abs() < 1e-6,
        "opacity should still be 1.0 (life > fade window): got {}",
        drop.opacity
    );
}
