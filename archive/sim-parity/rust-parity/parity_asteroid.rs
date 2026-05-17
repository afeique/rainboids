//! Cross-language parity vector for asteroid physics.
//!
//! Drives the Rust `update_asteroid` step over 60 ticks of pure linear
//! drift (no boundary hit, no speed-cap clamp, no death-flash) and
//! asserts agreement with the JS pure step in `js/sim/asteroid.js`
//! within an f32 tolerance.
//!
//! The reference values were captured 2026-05-10 with:
//!
//! ```bash
//! node --input-type=module -e "
//!   import { updateAsteroid } from './js/sim/asteroid.js';
//!   import { freshAsteroidState } from './js/sim/state.js';
//!   const a = freshAsteroidState(1, {
//!     x: 200, y: 200, vx: 1.5, vy: 0.8,
//!     radius: 30, rotVelX: 0.01, rotVelY: 0.02, rotVelZ: 0.005,
//!   });
//!   const ctx = { field: { width: 1920, height: 1080 }, tickScale: 0.5,
//!                 wrapWidth: 1920, wrapHeight: 1080 };
//!   for (let i = 0; i < 60; i++) updateAsteroid(a, ctx, []);
//!   console.log(JSON.stringify({
//!     x: a.x, y: a.y, vx: a.vx, vy: a.vy,
//!     rotX: a.rotX, rotY: a.rotY, rotZ: a.rotZ, active: a.active,
//!   }));
//! "
//! # → {"x":245,"y":224.00000000000034,"vx":1.5,"vy":0.8,
//! #    "rotX":0.6000000000000003,"rotY":1.2000000000000006,"rotZ":0.30000000000000016,
//! #    "active":true}
//! ```
//!
//! Tolerance: f64 (JS) ↔ f32 (Rust) drift over 60 ticks of linear drift
//! is tiny (no accumulated multiplication — just `vx * tick_scale * 60`).
//! Position tolerance 0.01 px / rotation tolerance 0.001 rad would suffice;
//! we use 0.01 throughout for symmetry with `ship_basic_movement`.

use rainboids_server::sim::asteroid::{
    update_asteroid, Asteroid, AsteroidContext, AsteroidEvent,
};
use rainboids_server::sim::state::Field;

#[test]
fn asteroid_basic_drift() {
    // Setup: asteroid at (200, 200), velocity (1.5, 0.8), inside the
    // field (1920×1080) — well clear of all boundaries for 60 ticks at
    // tick_scale=0.5. Rotation velocities are non-zero so the rotation
    // accumulator gets exercised. Speed (hypot ≈ 1.7) is below the 2.0
    // cap so no clamp fires.
    let mut a = Asteroid::fresh(1);
    a.x = 200.0;
    a.y = 200.0;
    a.vx = 1.5;
    a.vy = 0.8;
    a.radius = 30.0;
    a.rot_vel_x = 0.01;
    a.rot_vel_y = 0.02;
    a.rot_vel_z = 0.005;

    let ctx = AsteroidContext {
        field: Some(Field {
            width: 1920.0,
            height: 1080.0,
        }),
        tick_scale: 0.5,
        wrap_width: 1920.0,
        wrap_height: 1080.0,
    };

    let mut events: Vec<AsteroidEvent> = Vec::new();
    for _ in 0..60 {
        update_asteroid(&mut a, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"rotX\":{},\"rotY\":{},\"rotZ\":{},\"active\":{}}}",
        a.x, a.y, a.vx, a.vy, a.rot_x, a.rot_y, a.rot_z, a.active
    );

    // JS reference values captured 2026-05-10 (see header docstring).
    let expected_x: f32 = 245.0;
    let expected_y: f32 = 224.0;
    let expected_vx: f32 = 1.5;
    let expected_vy: f32 = 0.8;
    let expected_rot_x: f32 = 0.6;
    let expected_rot_y: f32 = 1.2;
    let expected_rot_z: f32 = 0.3;

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

    close(a.x, expected_x, "asteroid.x");
    close(a.y, expected_y, "asteroid.y");
    close(a.vx, expected_vx, "asteroid.vx");
    close(a.vy, expected_vy, "asteroid.vy");
    close(a.rot_x, expected_rot_x, "asteroid.rotX");
    close(a.rot_y, expected_rot_y, "asteroid.rotY");
    close(a.rot_z, expected_rot_z, "asteroid.rotZ");
    assert!(a.active, "asteroid.active should remain true");
    // events buffer untouched — split is reserved for collision-system port.
    assert!(events.is_empty(), "no events expected on basic-drift path");
}

/// Parity vector for the right-wall **bounce** branch in
/// `update_asteroid` (asteroid.rs:181–184). Starts the rock close to
/// the right edge with vx > MAX_SPEED so the speed cap fires on tick
/// one, then drifts into the wall, bounces with `ASTEROID_BOUNCE_DAMP`
/// (0.9), and drifts back. After 30 ticks the velocity should be
/// reflected and damped, and the position should be back inside the
/// field by ~17 px.
///
/// JS reference captured 2026-05-10:
///
/// ```bash
/// node --input-type=module -e "
///   import { updateAsteroid } from './js/sim/asteroid.js';
///   import { freshAsteroidState } from './js/sim/state.js';
///   const a = freshAsteroidState(1, {
///     x: 1880, y: 500, vx: 4.0, vy: 0,
///     radius: 30,
///   });
///   const ctx = { field: { width: 1920, height: 1080 }, tickScale: 0.5,
///                 wrapWidth: 1920, wrapHeight: 1080 };
///   for (let i = 0; i < 30; i++) updateAsteroid(a, ctx, []);
///   console.log(JSON.stringify({ x: a.x, y: a.y, vx: a.vx, vy: a.vy }));
/// "
/// # → {"x":1872.8999999999983,"y":500,"vx":-1.8,"vy":0}
/// ```
#[test]
fn asteroid_bounce_right_wall() {
    // Setup: asteroid at (1880, 500) with radius 30 — its right edge sits
    // at x=1910, just inside the field's 1920 boundary. Velocity vx=4.0
    // is double the speed cap, so tick one renormalizes to vx=2.0 before
    // the position update. The asteroid drifts right, contacts the wall,
    // bounces (snapping x back to field.width - r = 1890 with vx flipped
    // and damped to -1.8), and drifts back inward for the remaining ticks.
    let mut a = Asteroid::fresh(1);
    a.x = 1880.0;
    a.y = 500.0;
    a.vx = 4.0;
    a.vy = 0.0;
    a.radius = 30.0;

    let ctx = AsteroidContext {
        field: Some(Field {
            width: 1920.0,
            height: 1080.0,
        }),
        tick_scale: 0.5,
        wrap_width: 1920.0,
        wrap_height: 1080.0,
    };

    let mut events: Vec<AsteroidEvent> = Vec::new();
    for _ in 0..30 {
        update_asteroid(&mut a, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
        a.x, a.y, a.vx, a.vy
    );

    // JS reference values captured 2026-05-10 (see header docstring).
    let expected_x: f32 = 1872.9;
    let expected_y: f32 = 500.0;
    let expected_vx: f32 = -1.8;
    let expected_vy: f32 = 0.0;

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

    close(a.x, expected_x, "asteroid.x");
    close(a.y, expected_y, "asteroid.y");
    close(a.vx, expected_vx, "asteroid.vx");
    close(a.vy, expected_vy, "asteroid.vy");

    // Reflection invariant: after the bounce, vx must be heading back
    // inward (negative), and its magnitude must be bounded by the post-
    // damp speed cap (2.0 * 0.9 = 1.8).
    assert!(
        a.vx < 0.0,
        "vx should be reflected (negative) after right-wall bounce, got {}",
        a.vx,
    );
    assert!(
        a.vx.abs() <= 2.0 * 0.9 + 1e-6,
        "|vx| should be bounded by MAX_SPEED * BOUNCE_DAMP = 1.8, got {}",
        a.vx.abs(),
    );

    // Position invariant: the snap-back inside `update_asteroid` must
    // never let the asteroid escape past the right wall.
    assert!(
        a.x + a.radius <= 1920.0 + 1e-6,
        "asteroid right edge {} exceeds field.width 1920",
        a.x + a.radius,
    );

    assert!(a.active, "asteroid.active should remain true post-bounce");
    assert!(events.is_empty(), "no events expected on bounce path");
}

/// Parity vector for the **death-flash countdown** branch in
/// `update_asteroid` (asteroid.rs:151–157). With `death_flash = 5`
/// and 6 ticks of advancement, the counter ticks down to zero on the
/// fifth tick (deactivating the asteroid), and the sixth tick is a
/// no-op via the `!active` early-return. Throughout the countdown,
/// motion is frozen — the position must NOT advance.
///
/// JS reference captured 2026-05-10:
///
/// ```bash
/// node --input-type=module -e "
///   import { updateAsteroid } from './js/sim/asteroid.js';
///   import { freshAsteroidState } from './js/sim/state.js';
///   const a = freshAsteroidState(1, {
///     x: 500, y: 500, vx: 1.0, vy: 0.5,
///     radius: 30, deathFlash: 5,
///   });
///   const ctx = { field: { width: 1920, height: 1080 }, tickScale: 0.5,
///                 wrapWidth: 1920, wrapHeight: 1080 };
///   const before = { x: a.x, y: a.y };
///   for (let i = 0; i < 6; i++) updateAsteroid(a, ctx, []);
///   console.log(JSON.stringify({ x: a.x, y: a.y, vx: a.vx, vy: a.vy,
///                                active: a.active, deathFlash: a.deathFlash,
///                                positionChanged: a.x !== before.x || a.y !== before.y }));
/// "
/// # → {"x":500,"y":500,"vx":1,"vy":0.5,"active":false,
/// #    "deathFlash":0,"positionChanged":false}
/// ```
#[test]
fn asteroid_death_flash_deactivates() {
    // Setup: asteroid mid-field at (500, 500) with non-zero velocity so
    // we'd see motion if the death-flash branch failed to early-return.
    // `death_flash = 5` means: 5 ticks decrement the counter, the fifth
    // tick takes it to 0 and flips `active = false`, and any subsequent
    // tick (we run 6) is a no-op via the `!active` early-return.
    let mut a = Asteroid::fresh(1);
    a.x = 500.0;
    a.y = 500.0;
    a.vx = 1.0;
    a.vy = 0.5;
    a.radius = 30.0;
    a.death_flash = 5;

    let before_x = a.x;
    let before_y = a.y;

    let ctx = AsteroidContext {
        field: Some(Field {
            width: 1920.0,
            height: 1080.0,
        }),
        tick_scale: 0.5,
        wrap_width: 1920.0,
        wrap_height: 1080.0,
    };

    let mut events: Vec<AsteroidEvent> = Vec::new();
    for _ in 0..6 {
        update_asteroid(&mut a, &ctx, &mut events);
    }

    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"active\":{},\"deathFlash\":{}}}",
        a.x, a.y, a.vx, a.vy, a.active, a.death_flash
    );

    // JS reference values captured 2026-05-10 (see header docstring).
    let expected_x: f32 = 500.0;
    let expected_y: f32 = 500.0;
    let expected_vx: f32 = 1.0;
    let expected_vy: f32 = 0.5;

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

    close(a.x, expected_x, "asteroid.x");
    close(a.y, expected_y, "asteroid.y");
    close(a.vx, expected_vx, "asteroid.vx");
    close(a.vy, expected_vy, "asteroid.vy");

    // Death-flash terminal state: counter at zero, asteroid deactivated.
    assert_eq!(
        a.death_flash, 0,
        "death_flash should be 0 after countdown, got {}",
        a.death_flash,
    );
    assert!(
        !a.active,
        "asteroid.active should be false once death_flash hits 0",
    );

    // Motion-frozen invariant: position did not change during the
    // entire 6-tick window. Velocity is also untouched (the speed-cap
    // and position-update steps never run while death_flash > 0 or
    // !active).
    assert_eq!(
        a.x, before_x,
        "x should not change during death-flash countdown",
    );
    assert_eq!(
        a.y, before_y,
        "y should not change during death-flash countdown",
    );

    assert!(events.is_empty(), "no events expected on death-flash path");
}
