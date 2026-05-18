//! Per-room seeded RNG context for Phase 3 deterministic sim.
//!
//! Wraps `crate::rng::from_seed(...)` -> `rand_pcg::Pcg64` (the
//! project's existing PCG-64 implementation, already cross-language-
//! parity verified in archive/sim-parity/rust-parity/pcg64_trace.rs)
//! with:
//!
//! - A monotonic `sub_seed_counter` for deriving deterministic
//!   sub-RNGs per spawn/split event. Lets a single AsteroidSplit
//!   compute its children's positions without consuming N draws
//!   from the room's main RNG stream (which would shift every
//!   subsequent spawn position depending on how many children the
//!   split happens to produce).
//!
//! - Convenience samplers: `range_f64`, `range_i32`, `bool_at_prob`,
//!   `pick_index`, `unit_circle_angle` — all built on `next_u64` and
//!   pure-arithmetic conversions so they're bit-exact across WASM
//!   and native (no platform-dependent float intrinsics, no
//!   `rand::distributions::*` machinery whose internals can change
//!   between crate versions).
//!
//! Sim modules import `RngCtx` instead of `rand_pcg::Pcg64`
//! directly so every random draw is observable through this surface
//! (audit-friendly, swap-able). The underlying main `Pcg64` is not
//! exposed mutably — callers either go through the typed samplers
//! or request a fresh sub-RNG via `sub_seed()` + `from_sub_seed()`.

use crate::rng;
use rand::RngCore;
use rand_pcg::Pcg64;

/// Golden-ratio multiplier (Knuth). Mixes the sub-seed counter so
/// consecutive sub-seeds aren't trivially related (low-bit avalanche
/// before XOR into the main stream draw).
const GOLDEN_RATIO_U64: u64 = 0x9E3779B97F4A7C15;

/// Per-room RNG context. One instance lives in `RoomState`; it's
/// passed by `&mut RngCtx` into every sim function that needs a
/// random draw.
pub struct RngCtx {
    main: Pcg64,
    sub_seed_counter: u64,
}

impl RngCtx {
    /// Construct from a 64-bit seed (the room's seed). Both server
    /// and WASM client construct with the SAME seed (server picks;
    /// client receives in `Welcome`).
    pub fn from_seed(seed: u64) -> Self {
        Self {
            main: rng::from_seed(seed),
            sub_seed_counter: 0,
        }
    }

    /// Generate a fresh sub-seed for a one-shot event (asteroid
    /// split, enemy spawn variation, etc.). Advances the main stream
    /// by exactly one `next_u64` draw regardless of how many sub-RNG
    /// draws the caller later performs — that's the contamination-
    /// guard that lets two parallel events (e.g. two simultaneous
    /// splits in the same tick) each consume an unbounded number of
    /// internal draws without shifting subsequent spawn positions.
    pub fn sub_seed(&mut self) -> u64 {
        self.sub_seed_counter = self.sub_seed_counter.wrapping_add(1);
        let mixed = self.sub_seed_counter.wrapping_mul(GOLDEN_RATIO_U64);
        self.main.next_u64() ^ mixed
    }

    /// Construct a transient `Pcg64` from a sub-seed for one-shot
    /// computations (e.g. `compute_split_children`). Lets the caller
    /// pass `&mut Pcg64` to functions that just want any RNG, while
    /// keeping the room's main RNG stream untouched.
    pub fn from_sub_seed(sub_seed: u64) -> Self {
        // Returns a fresh `RngCtx` seeded from the sub-seed. Callers get
        // the same convenience surface (`range_f64`, `unit_circle_angle`,
        // etc.) without needing to wrap the raw `Pcg64` themselves.
        Self::from_seed(sub_seed)
    }

    // ── Convenience samplers (built on next_u64) ──

    /// f64 in `[lo, hi)`. Uniform. Reversed bounds (`lo > hi`) still
    /// advance the stream by one draw and return `lo` (graceful — no
    /// panic on sim hot path; callers shouldn't pass reversed bounds
    /// but a debug assertion would crash the server room).
    pub fn range_f64(&mut self, lo: f64, hi: f64) -> f64 {
        let u = u64_to_unit_f64(self.main.next_u64());
        if hi <= lo {
            return lo;
        }
        lo + u * (hi - lo)
    }

    /// i32 in `[lo, hi]` (inclusive on both ends). Uniform. Reversed
    /// bounds gracefully return `lo` after advancing the stream once.
    pub fn range_i32(&mut self, lo: i32, hi: i32) -> i32 {
        let u = u64_to_unit_f64(self.main.next_u64());
        if hi < lo {
            return lo;
        }
        let span = (hi as i64) - (lo as i64) + 1;
        lo + (u * span as f64) as i32
    }

    /// Bernoulli trial. `prob` clamped to `[0.0, 1.0]` (NaN -> false).
    /// Always advances the main stream by exactly one draw so the
    /// stream position is independent of the probability argument.
    pub fn bool_at_prob(&mut self, prob: f64) -> bool {
        let u = u64_to_unit_f64(self.main.next_u64());
        if !prob.is_finite() {
            return false;
        }
        let p = prob.clamp(0.0, 1.0);
        u < p
    }

    /// Pick a random index in `[0, len)`. Returns 0 if `len == 0`
    /// (caller's responsibility to not call on empty slices, but
    /// graceful default avoids a panic in sim hot path). Always
    /// advances the main stream by one draw.
    pub fn pick_index(&mut self, len: usize) -> usize {
        let u = u64_to_unit_f64(self.main.next_u64());
        if len == 0 {
            return 0;
        }
        let idx = (u * len as f64) as usize;
        // Float-rounding safety: u is < 1.0 by construction but guard
        // against the pathological case where u * len rounds up to len.
        if idx >= len {
            len - 1
        } else {
            idx
        }
    }

    /// Uniform random angle in `[0, 2π)`. Useful for spawn-jitter,
    /// asteroid initial rotation, enemy face direction.
    pub fn unit_circle_angle(&mut self) -> f64 {
        let u = u64_to_unit_f64(self.main.next_u64());
        u * std::f64::consts::TAU
    }

    /// Underlying raw `next_u64`. Avoid unless you really need raw
    /// bits — the convenience samplers above are easier to audit.
    pub fn next_u64(&mut self) -> u64 {
        self.main.next_u64()
    }
}

/// Manual Debug impl — `Pcg64` may or may not expose useful Debug
/// output across `rand_pcg` versions, and dumping internal PCG state
/// to logs leaks the room's future RNG stream to anyone with log
/// access. We print only the sub-seed counter (safe + diagnostic).
impl std::fmt::Debug for RngCtx {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RngCtx")
            .field("sub_seed_counter", &self.sub_seed_counter)
            .field("main", &"<Pcg64 state hidden>")
            .finish()
    }
}

/// Convert a `u64` draw to an f64 in `[0.0, 1.0)`. Uses the top 53
/// bits to fill the IEEE-754 double mantissa exactly — bit-exact
/// under any compliant f64 implementation (WASM + native both).
fn u64_to_unit_f64(u: u64) -> f64 {
    (u >> 11) as f64 * (1.0 / ((1u64 << 53) as f64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let mut a = RngCtx::from_seed(42);
        let mut b = RngCtx::from_seed(42);
        for _ in 0..20 {
            let va = a.range_f64(0.0, 1.0);
            let vb = b.range_f64(0.0, 1.0);
            assert_eq!(va.to_bits(), vb.to_bits(), "bit-equal f64 draws");
        }
    }

    #[test]
    fn sub_seed_does_not_contaminate_main() {
        // Snapshot 1: pure main-stream draws.
        let mut a = RngCtx::from_seed(42);
        let snap_a: Vec<u64> = (0..5).map(|_| a.range_f64(0.0, 1.0).to_bits()).collect();

        // Snapshot 2: same seed, but interleave 10 sub_seed() calls
        // BEFORE the snapshot draws. sub_seed() advances the main
        // stream by 10 draws here, so the snapshot starts 10 draws
        // deeper than snapshot 1 — they should NOT match.
        let mut b = RngCtx::from_seed(42);
        for _ in 0..10 {
            let _ = b.sub_seed();
        }
        let snap_b: Vec<u64> = (0..5).map(|_| b.range_f64(0.0, 1.0).to_bits()).collect();
        assert_ne!(snap_a, snap_b, "10 sub_seed calls advance main by 10");

        // The real invariant we care about: consuming sub-RNGs
        // produced by sub_seed() does NOT further perturb the main
        // stream. Take snapshot_c that mirrors snapshot_b's main-
        // stream position but also consumes from the sub-RNGs.
        let mut c = RngCtx::from_seed(42);
        for _ in 0..10 {
            let s = c.sub_seed();
            let mut sub = RngCtx::from_sub_seed(s);
            // Consume an unbounded number of draws from the sub-RNG.
            for _ in 0..50 {
                let _ = sub.next_u64();
            }
        }
        let snap_c: Vec<u64> = (0..5).map(|_| c.range_f64(0.0, 1.0).to_bits()).collect();
        assert_eq!(
            snap_b, snap_c,
            "sub-RNG consumption must not contaminate main stream"
        );
    }

    #[test]
    fn bool_at_prob_distribution() {
        let mut r = RngCtx::from_seed(12345);
        let mut hits = 0i32;
        for _ in 0..10_000 {
            if r.bool_at_prob(0.3) {
                hits += 1;
            }
        }
        assert!(
            (hits - 3000).abs() < 200,
            "bool_at_prob(0.3) over 10k trials = {hits} (expected ~3000 +/- 200)"
        );
    }

    #[test]
    fn pick_index_zero_safe() {
        let mut r = RngCtx::from_seed(7);
        assert_eq!(r.pick_index(0), 0);
    }

    #[test]
    fn range_f64_bounds() {
        let mut r = RngCtx::from_seed(99);
        for _ in 0..1000 {
            let v = r.range_f64(-50.0, 50.0);
            assert!(v >= -50.0, "below lo: {v}");
            assert!(v < 50.0, "at-or-above hi: {v}");
        }
    }

    #[test]
    fn range_i32_inclusive_bounds() {
        let mut r = RngCtx::from_seed(2024);
        for _ in 0..2000 {
            let v = r.range_i32(-3, 3);
            assert!((-3..=3).contains(&v), "out of [-3, 3]: {v}");
        }
    }

    #[test]
    fn reversed_bounds_graceful() {
        let mut r = RngCtx::from_seed(1);
        // Reversed f64 bounds: returns lo, advances stream.
        assert_eq!(r.range_f64(10.0, 5.0), 10.0);
        // Reversed i32 bounds: returns lo, advances stream.
        assert_eq!(r.range_i32(10, 5), 10);
    }

    #[test]
    fn unit_circle_angle_in_range() {
        let mut r = RngCtx::from_seed(555);
        for _ in 0..1000 {
            let a = r.unit_circle_angle();
            assert!(a >= 0.0, "negative angle: {a}");
            assert!(a < std::f64::consts::TAU, "angle >= 2pi: {a}");
        }
    }
}
