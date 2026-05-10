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
