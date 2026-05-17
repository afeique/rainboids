//! Debugging trace for PCG-64 cross-language parity.
//!
//! Prints the intermediate state at each step of `Pcg64::seed_from_u64(42)`
//! so we can compare to the JS side line-by-line.
//!
//! Run with: `cargo test --test pcg64_trace -- --nocapture --ignored`.

use rand::{RngCore, SeedableRng};
use rand_pcg::Pcg64;

#[test]
#[ignore = "debug-only trace; run manually with --ignored"]
fn trace_seed_from_u64_42() {
    // We can't easily inspect the internal state of Pcg64 from outside the
    // crate, so we replicate the algorithm exactly and cross-check the
    // final next_u64 sequence against rand_pcg's own output.
    let seed_bytes = expand_seed_via_pcg32(42);
    eprintln!("seed_bytes (32) = {:02x?}", seed_bytes);

    let parsed_state = u128::from_le_bytes(seed_bytes[0..16].try_into().unwrap());
    let parsed_inc = u128::from_le_bytes(seed_bytes[16..32].try_into().unwrap());
    eprintln!("parsed_state = 0x{:032x}", parsed_state);
    eprintln!("parsed_inc   = 0x{:032x}", parsed_inc);

    let inc = (parsed_inc << 1) | 1;
    eprintln!("inc (after << 1 | 1) = 0x{:032x}", inc);

    const MULT: u128 = 0x2360_ED05_1FC6_5DA4_4385_DF64_9FCC_F645;

    // Step 1: state = 0, then state := state * MULT + inc
    let mut state: u128 = 0;
    state = state.wrapping_mul(MULT).wrapping_add(inc);
    eprintln!("after step1 = 0x{:032x}", state);

    // Mix in seed: state := state + parsed_state
    state = state.wrapping_add(parsed_state);
    eprintln!("after add parsed_state = 0x{:032x}", state);

    // Step 2: state := state * MULT + inc
    state = state.wrapping_mul(MULT).wrapping_add(inc);
    eprintln!("after step2 = 0x{:032x}", state);

    // First 5 next_u64 outputs from this state.
    let mut my_state = state;
    let mut got = Vec::new();
    for _ in 0..5 {
        let pre = my_state;
        my_state = my_state.wrapping_mul(MULT).wrapping_add(inc);
        let rot = (pre >> 122) as u32;
        let xsl = ((pre >> 64) ^ pre) as u64;
        let out = xsl.rotate_right(rot);
        got.push(out);
    }
    eprintln!("manual replay first 5 = {:?}", got.iter().map(|v| v.to_string()).collect::<Vec<_>>());

    // Cross-check: rand_pcg's own next_u64 sequence.
    let mut r = Pcg64::seed_from_u64(42);
    let mut canonical = Vec::new();
    for _ in 0..5 {
        canonical.push(r.next_u64());
    }
    eprintln!("rand_pcg::Pcg64 first 5 = {:?}", canonical.iter().map(|v| v.to_string()).collect::<Vec<_>>());

    assert_eq!(got, canonical, "manual replay must match rand_pcg::Pcg64 output");
}

/// Replicate `rand_core::SeedableRng::seed_from_u64`'s expansion: a tiny
/// PCG-32 keyed by the u64, writing 8 u32s little-endian into a 32-byte seed.
fn expand_seed_via_pcg32(seed: u64) -> [u8; 32] {
    let mut state = seed;
    let mut out = [0u8; 32];
    for chunk in out.chunks_mut(4) {
        let v = pcg32_step(&mut state);
        let n = chunk.len();
        chunk.copy_from_slice(&v.to_le_bytes()[..n]);
    }
    out
}

// Reproduces rand_core's `pcg32`: advance state FIRST, output from new state.
fn pcg32_step(state: &mut u64) -> u32 {
    const MUL: u64 = 6364136223846793005;
    const INC: u64 = 11634580027462260723;
    *state = state.wrapping_mul(MUL).wrapping_add(INC);
    let s = *state;
    let xorshifted = (((s >> 18) ^ s) >> 27) as u32;
    let rot = (s >> 59) as u32;
    xorshifted.rotate_right(rot)
}
