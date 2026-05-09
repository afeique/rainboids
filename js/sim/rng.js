// PCG-64 (Lcg128Xsl64) seedable RNG, mirroring Rust's `rand_pcg::Pcg64`.
//
// Bit-identicality with Rust is critical for cross-language deterministic
// fixtures. The parity harness in `tools/parity-runner.mjs` and
// `server/tests/parity_vectors.rs` cross-checks this with a known
// reference vector for seed=42 (locked in `tests/unit/sim/rng.test.js`).
//
// Three pieces have to agree exactly:
//
//   1. `seed_from_u64`  — `rand_core` uses a tiny PCG32 stepper (NOT
//      SplitMix64) to expand a u64 seed into 32 seed-bytes.
//
//   2. `Lcg128Xsl64::new(state, increment)` — interprets the 32 bytes
//      as two LE u128s, sets `increment = (parsed_increment << 1) | 1`,
//      then runs:   state := 0
//                   state := state · MULT + increment        (step 1)
//                   state := state + parsed_state            (mix in seed)
//                   state := state · MULT + increment        (step 2)
//
//   3. `next_u64`  — captures the current state, advances by one
//      LCG step, then emits XSL-RR over the captured state:
//                   rot := (old_state >> 122) & 63
//                   xor := (old_state >> 64) ^ old_state    (low 64 bits)
//                   return xor.rotate_right(rot)
//
// Performance: u128 math is done with BigInt (~5–10× slower than native
// integer arithmetic). RNG is called outside the hot prediction path
// (enemy spawns, drop rolls, asteroid splits), so this is fine.

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
 * Mutates the state by reference (returned via the array trick because
 * JS can't pass primitives by reference).
 *
 * @param {{state: bigint}} cell
 * @returns {number} u32
 */
function pcg32Step(cell) {
    const oldState = cell.state;
    cell.state = BigInt.asUintN(64, oldState * PCG32_MUL + PCG32_INC);
    const xorshifted = Number(((oldState >> 18n) ^ oldState) >> 27n) >>> 0;
    const rot = Number(oldState >> 59n) & 31;
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

        // Step 2: parse two LE u128s.
        const parsedState = readLeU128(seedBytes, 0);
        const parsedIncrement = readLeU128(seedBytes, 16);

        // Step 3: Lcg128Xsl64::new(state, increment).
        const increment = ((parsedIncrement << 1n) | 1n) & MASK_128;
        let state = 0n;
        // step()
        state = BigInt.asUintN(128, state * PCG64_MULT + increment);
        // state += parsed_state
        state = (state + parsedState) & MASK_128;
        // step()
        state = BigInt.asUintN(128, state * PCG64_MULT + increment);

        this.state = state;
        this.inc = increment;
    }

    /** @returns {bigint} u64 */
    nextU64() {
        const old = this.state;
        // step()
        this.state = BigInt.asUintN(128, old * PCG64_MULT + this.inc);
        // XSL-RR output over the pre-advance state
        const rot = Number((old >> 122n) & 63n);
        const xor = BigInt.asUintN(64, (old >> 64n) ^ old);
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
