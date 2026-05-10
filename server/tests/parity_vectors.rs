//! Reference vectors used by the JS parity harness.
//!
//! Each test prints a JSON document to stdout shaped like the JS
//! `tools/parity-runner.mjs` output. CI runs both sides and diffs them
//! byte-for-byte.

use rainboids_server::protocol::codec;
use rainboids_server::sim::rng;
// rand 0.8 re-exports rand_core::RngCore as rand::RngCore. The trait must be
// in scope to call `next_u64` on a Pcg64.
use rand::RngCore;

#[test]
fn rng_seed42_first_5_values() {
    // Cross-language parity vector. Verified bit-identical against
    // `tools/parity-runner.mjs --kind rng --seed 42 --iters 5` after the
    // JS Pcg64 fix in 5.84.1 (see CHANGELOG; this test was #[ignore]'d in
    // 5.84.0 as a known-failing tripwire, then fixed and re-enabled). If
    // either side emits something different, both this test AND
    // `tests/unit/sim/rng.test.js` will catch it.
    let mut r = rng::from_seed(42);
    let mut got = Vec::new();
    for _ in 0..5 {
        got.push(r.next_u64().to_string());
    }
    let json = format!(r#"{{"values":[{}]}}"#,
        got.iter().map(|s| format!(r#""{}""#, s)).collect::<Vec<_>>().join(","));
    eprintln!("JS-EXPECTS: {}", json);

    let expected: &[&str] = &[
        // Captured 2026-05-09 from `rand_pcg::Pcg64::seed_from_u64(42)`.
        // The matching JS sequence lives in `tests/unit/sim/rng.test.js`.
        "4178418447715145737",
        "4410739922618931473",
        "14034899209665866285",
        "9736923071240364268",
        "17902128262962705724",
    ];
    assert_eq!(got, expected, "PCG-64 seed=42 reference vector drifted");
}

#[test]
fn fxp_basic_ops_pin() {
    // Q16.16 multiply: a*b expressed as raw i32 result.
    // Verifies both sides agree on:
    //   1.0 * 1.0  = 1.0     → raw 65536
    //   1.5 * 1.5  = 2.25    → raw 147456
    //   1.0 + 2.0  = 3.0     → raw 196608  (handled in JS without fxp call)
    //   from_float(π) = 205887
    use rainboids_server::sim::fxp::Fxp;
    assert_eq!((Fxp::from_f32(1.0) * Fxp::from_f32(1.0)).0, 65536);
    assert_eq!((Fxp::from_f32(1.5) * Fxp::from_f32(1.5)).0, 147456);
    let pi = Fxp::from_f32(3.14159);
    assert_eq!(pi.0, 205887);
}

#[test]
fn welcome_44_byte_layout_pin() {
    // Sanity-check: the wire footprint of a Welcome must remain at 44 bytes.
    // If this changes, every parity client/version assumption breaks.
    use rainboids_server::protocol::ServerMsg;
    use rainboids_server::util::id::PlayerId;
    let msg = ServerMsg::Welcome {
        player_id: PlayerId(1),
        session: uuid::Uuid::nil(),
        server_t_ms: 0,
    };
    let bytes = codec::encode(&msg).unwrap();
    assert_eq!(bytes.len(), 44, "Welcome must remain 44 bytes (wire-version 1)");
}

#[test]
fn ship_basic_movement() {
    // Cross-language parity vector for ship physics.
    //
    // Setup:
    //   - Single ship at (200.0, 200.0), zero velocity, zero angle.
    //   - 60 ticks of pure forward thrust: PackedInput { move_x = 127, move_y = 0,
    //     aim_x = 32767, aim_y = 0, buttons = 0 }
    //   - dt is unused by ship::update_all (per-tick model); we pass 1.0/60.0
    //     for API symmetry.
    //
    // The expected tuple below is a placeholder of zeros — the test is
    // currently `#[ignore]`d because sibling agent A (branch
    // `mp/sim-ship-extract`) has not yet landed `js/sim/ship.js`. Once A
    // merges, run the JS one-liner in the comment below to capture the
    // reference values, drop them into `expected`, remove the
    // `#[ignore]`, and re-run `cargo test`.
    //
    // Diagnostic output: `cargo test --test parity_vectors -- --ignored
    // ship_basic_movement --nocapture` prints the Rust-side result on
    // stderr (`RUST-EMITS:`). The JS parity harness should emit the same
    // values from the same input sequence.
    //
    // JS one-liner to compute the reference (run from project root after
    // A merges):
    //   node --input-type=module -e "
    //     import { updateAll } from './js/sim/ship.js';
    //     const ship = { x: 200, y: 200, vx: 0, vy: 0, angle: 0 };
    //     const input = { move_x: 127, move_y: 0, aim_x: 32767, aim_y: 0, buttons: 0 };
    //     for (let i = 0; i < 60; i++) updateAll([ship], new Map([[0, input]]), 1/60, []);
    //     console.log(JSON.stringify([ship.x, ship.y, ship.vx, ship.vy, ship.angle]));
    //   "
    // (Adjust to A's actual exported API — function name, input shape,
    // and ship-list iteration may differ.)
    use rainboids_server::protocol::ShipState;
    use rainboids_server::sim::PlayerInput;
    use rainboids_server::util::id::PlayerId;
    use std::collections::HashMap;

    let player = PlayerId(1);
    let mut ships = vec![ShipState {
        player,
        x: 200.0,
        y: 200.0,
        vx: 0.0,
        vy: 0.0,
        angle: 0.0,
        hp: 100.0,
        shield: 0.0,
    }];

    // Pure forward thrust + aim along +x.
    let input = PlayerInput {
        move_x: 127.0 / 127.0,
        move_y: 0.0,
        aim_x: 32767.0 / 32767.0,
        aim_y: 0.0,
        shoot: false,
        dash: false,
        ability1: false,
        ability2: false,
    };
    let mut inputs: HashMap<PlayerId, PlayerInput> = HashMap::new();
    inputs.insert(player, input);

    let dt = 1.0_f32 / 60.0;
    let mut events = Vec::new();
    for _ in 0..60 {
        rainboids_server::sim::ship::update_all(&mut ships, &inputs, dt, &mut events);
    }

    let s = ships[0];
    eprintln!(
        "RUST-EMITS: {{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"angle\":{}}}",
        s.x, s.y, s.vx, s.vy, s.angle
    );

    // JS reference values captured 2026-05-09 from sibling A's
    // `js/sim/ship.js` (commit a587e2e on `mp/sim-ship-extract`):
    //
    //     {"x":339.02438662306776,"y":200,"vx":2.414213560124684,"vy":0,"angle":0}
    //
    // The terminal velocity 2.41421356… ≈ √0.5 / (1 − √0.5) is the
    // analytic equilibrium for thrust = 1 per tick + friction = √0.5,
    // which both sides converge to within ~10 ticks. The remaining
    // movement is just (60 − settling) × terminal_v added to the
    // initial position, plus the friction-damped settling tail.
    //
    // Tolerance: JS runs in f64, Rust in f32, so 60 ticks of accumulated
    // thrust+friction multiplications drift by a handful of ULPs. The
    // 0.01-pixel / 0.01-rad threshold is tight enough to catch real
    // physics divergence (constant mismatches, ordering bugs, missing
    // boundary handling) but loose enough to ride out the f64↔f32 noise.
    // Once the fixed-point migration lands (deferred from this session),
    // we can drop the tolerance to bit-exact `assert_eq!`.
    let expected_x: f32 = 339.024_4;
    let expected_y: f32 = 200.0;
    let expected_vx: f32 = 2.414_213_5;
    let expected_vy: f32 = 0.0;
    let expected_angle: f32 = 0.0;

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
    close(s.x, expected_x, "ship.x");
    close(s.y, expected_y, "ship.y");
    close(s.vx, expected_vx, "ship.vx");
    close(s.vy, expected_vy, "ship.vy");
    close(s.angle, expected_angle, "ship.angle");
}
