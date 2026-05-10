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

// ─── Helpers reused across the magnet / tractor / expiry tests ─────────

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

fn make_ship(x: f32, y: f32) -> ShipState {
    ShipState {
        player: PlayerId(1),
        x,
        y,
        vx: 0.0,
        vy: 0.0,
        angle: 0.0,
        hp: 100.0,
        shield: 0.0,
    }
}

#[test]
fn drop_health_magnet_gentle_pull() {
    // Health orb at (400, 200), ship at (200, 200) — distance 200 px,
    // inside the 320 px FAR radius but outside the 120 px NEAR radius.
    // Only the gentle pull fires (force 8). 5 ticks captured pre-overshoot
    // — long enough to validate the magnet-pull formula but short enough
    // that f32↔f64 drift stays under tolerance (the drop oscillates
    // around the ship at higher tick counts, amplifying drift past
    // 0.01 px).
    //
    // JS reference values captured 2026-05-10 from `js/sim/drops.js`
    // (5 ticks):
    //
    //   {"x":373.61871165268,"y":200,"vx":-14.037653316002999,"vy":0}
    let mut drop = Drop {
        id: 1,
        kind: DropKind::Health,
        x: 400.0,
        y: 200.0,
        vx: 0.0,
        vy: 0.0,
        ..Drop::default()
    };
    let ships = vec![make_ship(200.0, 200.0)];
    let ctx = DropContext {
        ships: &ships,
        field: Field { width: 1920.0, height: 1080.0 },
        dt: 1.0_f32 / 60.0,
        tractor_engaged: false,
        tractor_attraction: 0.0,
        tractor_range: 0.0,
    };

    let mut events: Vec<DropEvent> = Vec::new();
    for _ in 0..5 {
        update_drop(&mut drop, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS gentle_magnet: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
        drop.x, drop.y, drop.vx, drop.vy
    );

    close(drop.x, 373.618_72, "drop.x");
    close(drop.y, 200.0, "drop.y");
    close(drop.vx, -14.037_653, "drop.vx");
    close(drop.vy, 0.0, "drop.vy");
    assert!(drop.active);
}

#[test]
fn drop_health_magnet_snap_pull() {
    // Health orb at (300, 200), ship at (200, 200) — distance 100 px,
    // inside both 320 (FAR) and 120 (NEAR) radii. Both gentle (force 8)
    // AND snap (force 22) pulls fire together — total per-tick force is
    // ~30. 3 ticks captured pre-overshoot — both pulls active but the
    // orb hasn't crossed the ship yet (no oscillation yet, so f32↔f64
    // drift stays well under tolerance).
    //
    // JS reference values captured 2026-05-10 from `js/sim/drops.js`
    // (3 ticks):
    //
    //   {"x":273.7582777777778,"y":200,"vx":-32.442081018518515,"vy":0}
    let mut drop = Drop {
        id: 2,
        kind: DropKind::Health,
        x: 300.0,
        y: 200.0,
        vx: 0.0,
        vy: 0.0,
        ..Drop::default()
    };
    let ships = vec![make_ship(200.0, 200.0)];
    let ctx = DropContext {
        ships: &ships,
        field: Field { width: 1920.0, height: 1080.0 },
        dt: 1.0_f32 / 60.0,
        tractor_engaged: false,
        tractor_attraction: 0.0,
        tractor_range: 0.0,
    };

    let mut events: Vec<DropEvent> = Vec::new();
    for _ in 0..3 {
        update_drop(&mut drop, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS snap_magnet: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
        drop.x, drop.y, drop.vx, drop.vy
    );

    close(drop.x, 273.758_28, "drop.x");
    close(drop.y, 200.0, "drop.y");
    close(drop.vx, -32.442_08, "drop.vx");
    close(drop.vy, 0.0, "drop.vy");
    assert!(drop.active);
}

#[test]
fn drop_money_pixel_tractor_pull() {
    // Money-pixel orb (NOT health — magnet is OFF for non-health drops)
    // at (400, 400), ship at (300, 300) — distance ≈ 141 px. Tractor beam
    // engaged with attraction=0.05, range=500 px. Drop is pulled along
    // the diagonal toward the ship; the lighter 0.985 friction (vs 0.92
    // health) keeps the velocity from settling as fast.
    //
    // The tractor formula is: f = attraction * (1 - dist/range), then
    // applied per-tick along the unit vector toward the ship, scaled by
    // the orb's z (default 2.0 for collectibles). Net: a soft fall-off
    // pull that grows as the orb approaches.
    //
    // JS reference values captured 2026-05-10 from `js/sim/drops.js`:
    //
    //   {"x":380.7627814276665,"y":380.7627814276665,
    //    "vx":-1.2692646293803131,"vy":-1.2692646293803131}
    let mut drop = Drop {
        id: 3,
        kind: DropKind::MoneyPixel,
        x: 400.0,
        y: 400.0,
        vx: 0.0,
        vy: 0.0,
        ..Drop::default()
    };
    let ships = vec![make_ship(300.0, 300.0)];
    let ctx = DropContext {
        ships: &ships,
        field: Field { width: 1920.0, height: 1080.0 },
        dt: 1.0_f32 / 60.0,
        tractor_engaged: true,
        tractor_attraction: 0.05,
        tractor_range: 500.0,
    };

    let mut events: Vec<DropEvent> = Vec::new();
    for _ in 0..30 {
        update_drop(&mut drop, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS tractor: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
        drop.x, drop.y, drop.vx, drop.vy
    );

    close(drop.x, 380.762_78, "drop.x");
    close(drop.y, 380.762_78, "drop.y");
    close(drop.vx, -1.269_264_6, "drop.vx");
    close(drop.vy, -1.269_264_6, "drop.vy");
    assert!(drop.active);
}

#[test]
fn drop_lifetime_expiry_deactivates() {
    // Health orb with life=10 at (500, 500), ship far away (no magnet).
    // Drift at vx=0.5. Run 15 ticks — the lifetime tick decrements life
    // by 1 each call; on tick 11 life reaches 0 and `active` flips to
    // false. Once inactive, subsequent calls early-return without
    // touching position, so the final x is just the friction-attenuated
    // drift across exactly 10 active ticks.
    //
    // JS reference values captured 2026-05-10 from `js/sim/drops.js`:
    //
    //   {"x":503.03507216110233,"y":500,"active":false,"life":0}
    let mut drop = Drop {
        id: 4,
        kind: DropKind::Health,
        x: 500.0,
        y: 500.0,
        vx: 0.5,
        vy: 0.0,
        life: 10,
        ..Drop::default()
    };
    let ships = vec![make_ship(5000.0, 5000.0)];
    let ctx = DropContext {
        ships: &ships,
        field: Field { width: 1920.0, height: 1080.0 },
        dt: 1.0_f32 / 60.0,
        tractor_engaged: false,
        tractor_attraction: 0.0,
        tractor_range: 0.0,
    };

    let mut events: Vec<DropEvent> = Vec::new();
    for _ in 0..15 {
        update_drop(&mut drop, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS expiry: {{\"x\":{},\"y\":{},\"active\":{},\"life\":{}}}",
        drop.x, drop.y, drop.active, drop.life
    );

    close(drop.x, 503.035_07, "drop.x");
    close(drop.y, 500.0, "drop.y");
    assert!(!drop.active, "drop should be deactivated after lifetime expiry");
    assert_eq!(drop.life, 0, "life should be exactly 0 at expiry");
}
