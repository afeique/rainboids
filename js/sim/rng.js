// PCG-64 (Lcg128Xsl64) seedable RNG, mirroring Rust's `rand_pcg::Pcg64`.
//
// Bit-identicality with Rust is critical for cross-language deterministic
// fixtures. The parity harness (`tools/parity-runner.mjs` +
// `server/tests/parity_vectors.rs`) cross-checks this with the seed=42
// reference vector locked in `tests/unit/sim/rng.test.js`.
//
// All three pieces below have been verified bit-identical against
// `rand_pcg 0.3.1` source via `server/tests/pcg64_trace.rs`:
//
//   1. `seed_from_u64`  — `rand_core` uses a tiny PCG-32 stepper that
//      *advances state first* then outputs from the NEW state (the
//      reverse of canonical PCG-XSH-RR; see comment in `pcg32Step`).
//      Eight u32 samples are written little-endian into 32 seed bytes.
//
//   2. `from_seed([u8; 32])` — splits the seed into two LE u128s. The
//      `SeedableRng::from_seed` path constructs the increment as
//      `(parsed_increment | 1)` — NOT `((parsed_increment << 1) | 1)`.
//      The `<< 1` shift is part of `Lcg128Xsl64::new(state, stream)`,
//      a *different* public constructor that we never call from
//      `seed_from_u64`. This was a silent gotcha in the rand_pcg API.
//      Then `from_state_incr`:
//          state := parsed_state + increment      (mix in)
//          state := state * MULT + increment      (one step)
//
//   3. `next_u64`  — STEPS FIRST, then outputs XSL-RR from the new
//      state. Also reversed from canonical PCG, also gotcha-prone.
//
// Performance: u128 math is BigInt (~5–10× slower than native integer
// arithmetic). RNG is called outside the hot prediction path (enemy
// spawns, drop rolls, asteroid splits), so this is fine.

const MASK_128 = (1n << 128n) - 1n;
const MASK_64 = (1n << 64n) - 1n;
const MASK_32 = (1n << 32n) - 1n;

/** PCG-64 multiplier (constant). Same hex literal in `rand_pcg` source. */
const PCG64_MULT = 0x2360ed051fc65da44385df649fccf645n;

/** PCG-32 step constants used by `rand_core::seed_from_u64`. */
const PCG32_MUL = 6364136223846793005n;
const PCG32_INC = 11634580027462260723n;

/**
 * One step of the small PCG32-XSH-RR generator that `rand_core` uses to
 * fan out a 64-bit seed into 32 seed-bytes.
 *
 * Important: the `rand_core` variant advances the state FIRST and then
 * computes the output from the NEW state. This is the reverse of the
 * canonical PCG-XSH-RR (which captures the old state, advances, and
 * outputs from the captured value). The comment in `rand_core` explains:
 *   "advance the state first (to get away from the input value, in
 *    case it has low Hamming Weight)"
 * Verified bit-identical to `rand_core::seed_from_u64::pcg32` via
 * `server/tests/pcg64_trace.rs`.
 *
 * @param {{state: bigint}} cell  - mutable state container
 * @returns {number} u32
 */
function pcg32Step(cell) {
    cell.state = BigInt.asUintN(64, cell.state * PCG32_MUL + PCG32_INC);
    const newState = cell.state;
    const xorshifted = Number(((newState >> 18n) ^ newState) >> 27n) >>> 0;
    // rot = (newState >> 59) as u32 — at most 5 bits, so rotate_right(rot)
    // and rotate_right(rot % 32) agree.
    const rot = Number(newState >> 59n) & 31;
    if (rot === 0) return xorshifted >>> 0;
    return ((xorshifted >>> rot) | (xorshifted << (32 - rot))) >>> 0;
}

/**
 * PCG-64 (Lcg128Xsl64). Mirror of `rand_pcg::Pcg64` (rand_pcg 0.3).
 */
export class Pcg64 {
    /**
     * @param {bigint|number} seed - if a number, coerced to a u64 via
     *                               `BigInt(seed >>> 0)` (positive only).
     */
    constructor(seed) {
        const seed64 = typeof seed === 'bigint' ? BigInt.asUintN(64, seed) : BigInt(seed >>> 0);

        // Step 1: expand u64 seed into 32 bytes via 8 PCG32 steps. Each
        // u32 is written little-endian into the seed buffer.
        const seedBytes = new Uint8Array(32);
        const cell = { state: seed64 };
        for (let i = 0; i < 32; i += 4) {
            const u = pcg32Step(cell);
            seedBytes[i] = u & 0xff;
            seedBytes[i + 1] = (u >>> 8) & 0xff;
            seedBytes[i + 2] = (u >>> 16) & 0xff;
            seedBytes[i + 3] = (u >>> 24) & 0xff;
        }

        // Step 2: parse two LE u128s from the 32 seed bytes.
        const parsedState = readLeU128(seedBytes, 0);
        const parsedIncrement = readLeU128(seedBytes, 16);

        // Step 3: Lcg128Xsl64::SeedableRng::from_seed:
        //   increment = parsed_increment | 1            (NB: just OR, no shift)
        //   state := parsed_state + increment           (mix-in)
        //   state := state * MULT + increment           (one step)
        const increment = (parsedIncrement | 1n) & MASK_128;
        let state = (parsedState + increment) & MASK_128;
        state = BigInt.asUintN(128, state * PCG64_MULT + increment);

        this.state = state;
        this.inc = increment;
    }

    /**
     * Advance and emit. Note: `rand_pcg::Lcg128Xsl64::next_u64` STEPS the
     * LCG *first* and then outputs XSL-RR from the new state, NOT from
     * the captured pre-step state — the opposite of canonical PCG. The
     * cross-language parity tests pin this down.
     *
     * @returns {bigint} u64
     */
    nextU64() {
        // step()
        this.state = BigInt.asUintN(128, this.state * PCG64_MULT + this.inc);
        const s = this.state;
        // XSL-RR output over the post-step state.
        const rot = Number((s >> 122n) & 63n);
        const xor = BigInt.asUintN(64, (s >> 64n) ^ s);
        if (rot === 0) return xor;
        const r = BigInt(rot);
        return BigInt.asUintN(64, (xor >> r) | (xor << (64n - r)));
    }

    /** @returns {number} u32 — bottom 32 bits of nextU64. */
    nextU32() {
        return Number(this.nextU64() & MASK_32) >>> 0;
    }

    /** @returns {number} f64 in [0, 1) — 53-bit precision. */
    nextF64() {
        // rand crate's f64 conversion: shift the u64 right by 11, then
        // multiply by 2^-53 to get a value in [0, 1).
        const u = this.nextU64();
        const m = u >> 11n;
        return Number(m) / 9007199254740992; // 2^53
    }

    /**
     * Uniform integer in [0, n), n > 0. Lemire bounded multiplication
     * (the same algorithm rand crate's `gen_range` uses).
     *
     * @param {bigint|number} n
     * @returns {bigint}
     */
    nextRangeU64(n) {
        const N = typeof n === 'bigint' ? n : BigInt(n);
        if (N <= 0n) throw new RangeError('nextRangeU64: n must be > 0');
        for (;;) {
            const x = this.nextU64();
            const m = x * N; // up to 128 bits
            const lo = m & MASK_64;
            if (lo < N) {
                const t = (-N) & MASK_64;
                if (lo < t) continue;
            }
            return m >> 64n;
        }
    }
}

function readLeU128(bytes, offset) {
    let v = 0n;
    for (let i = 15; i >= 0; i--) {
        v = (v << 8n) | BigInt(bytes[offset + i]);
    }
    return v;
}
