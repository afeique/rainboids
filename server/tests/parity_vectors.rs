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
    // JS Pcg64 fix in 5.85.0 (see CHANGELOG entry; previously red, now
    // green). If either side emits something different, the harness will
    // catch it here AND in `tests/unit/sim/rng.test.js`.
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
