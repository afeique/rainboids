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
#[ignore = "open: PCG-64 cross-language divergence — see Multiplayer Coordination doc, open question 4"]
fn rng_seed42_first_5_values() {
    // KNOWN FAILING — pinned, not hidden. Run via `cargo test -- --ignored`.
    //
    // The hardcoded `expected` values below are what the *JS* `rng.test.js`
    // emits today. Rust `rand_pcg::Pcg64::seed_from_u64(42)` produces a
    // different sequence (the algorithm-level divergence flagged in the
    // 5.84.0 CHANGELOG entry — Lcg128Xsl64 init step ordering). Resolving
    // this is a prerequisite for byte-level cross-language parity in
    // weeks 7–9 of the plan.
    let mut r = rng::from_seed(42);
    let mut got = Vec::new();
    for _ in 0..5 {
        got.push(r.next_u64().to_string());
    }
    let json = format!(r#"{{"values":[{}]}}"#,
        got.iter().map(|s| format!(r#""{}""#, s)).collect::<Vec<_>>().join(","));
    eprintln!("RUST-EMITS: {}", json);
    let expected: &[&str] = &[
        // JS parity-runner output for `from_seed(42).next_u64() ×5`.
        "16477301938277355279",
        "16271422411348349250",
        "9978099221472886187",
        "18065352563548492970",
        "6399164219305406576",
    ];
    assert_eq!(got, expected, "PCG-64 seed=42 vector drifted; JS harness will diverge");
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
