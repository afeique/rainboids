// Fixed-point math, Q16.16 over i32 raw bits.
//
// Mirror of `server/src/sim/fxp.rs` (which uses the `fixed` crate's
// I16F16 type). Both sides must produce bit-identical output for the
// same operations, which is the whole point of fixed-point — IEEE-754
// transcendentals diverge at the ULP level across platforms but
// integer math is exact.
//
// Range: -32768.0 .. 32767.999984740... (sufficient for a 1920×1080
//        playfield with µm sub-pixel precision).
// Resolution: 1 / 65536 ≈ 1.5e-5.
//
// Performance: the multiply uses BigInt for correctness (~5–10× cost vs
// native f32 mul, but bit-identical to Rust's `((a as i64) * b >> 16) as
// i32`). For ship physics — ~10 multiplies per ship per tick at four
// ships — this is ~40µs/frame, well below the 16.67ms budget. A
// Math.imul split-half fast path is possible if profiling justifies it,
// but the carry-propagation logic needs care; not worth it for v1.

/** Fractional bits in the Q16.16 representation. */
export const FXP_FRACT_BITS = 16;
/** 1.0 in raw bits. */
export const FXP_ONE_RAW = 1 << FXP_FRACT_BITS;

/**
 * Fixed-point Q16.16 number. Raw value stored as a signed i32.
 *
 * Construct via the static helpers — never call the ctor directly with
 * an unchecked number, since we need the `| 0` coercion to int.
 */
export class Fxp {
    /** @param {number} rawI32 - raw 32-bit signed integer */
    constructor(rawI32) {
        this.raw = rawI32 | 0;
    }

    /** @param {number} n - integer (will be left-shifted into Q16.16) */
    static fromInt(n) {
        return new Fxp((n << FXP_FRACT_BITS) | 0);
    }

    /** @param {number} f - any finite number */
    static fromFloat(f) {
        return new Fxp(Math.round(f * FXP_ONE_RAW) | 0);
    }

    /** @param {number} raw */
    static fromRaw(raw) {
        return new Fxp(raw | 0);
    }

    /** Convert back to f64 for display / non-deterministic consumers. */
    toFloat() {
        return this.raw / FXP_ONE_RAW;
    }

    /** Sign-only check (no allocation). */
    isZero() {
        return this.raw === 0;
    }

    add(other) {
        return new Fxp((this.raw + other.raw) | 0);
    }

    sub(other) {
        return new Fxp((this.raw - other.raw) | 0);
    }

    neg() {
        return new Fxp(-this.raw | 0);
    }

    abs() {
        return new Fxp(this.raw < 0 ? -this.raw | 0 : this.raw);
    }

    /**
     * Q16.16 × Q16.16 → Q16.16 via split-half Math.imul. Bit-identical
     * to `((a as i64) * (b as i64)) >> 16` cast to i32 — the same
     * computation Rust's `Fixed::mul` performs.
     */
    mul(other) {
        return new Fxp(fxpMulRaw(this.raw, other.raw));
    }

    /**
     * Slow but exact division. Avoid in hot paths — for inverse-pure
     * scaling like 1/dt, precompute the reciprocal.
     */
    div(other) {
        // (a << 16) / b, computed via BigInt to avoid overflow.
        const a = BigInt(this.raw);
        const b = BigInt(other.raw);
        if (b === 0n) throw new Error('Fxp.div by zero');
        const q = (a << BigInt(FXP_FRACT_BITS)) / b;
        // Truncation, matching Rust integer division semantics.
        return new Fxp(Number(BigInt.asIntN(32, q)));
    }

    /** Less than (raw int compare). */
    lt(other) {
        return this.raw < other.raw;
    }
    le(other) {
        return this.raw <= other.raw;
    }
    gt(other) {
        return this.raw > other.raw;
    }
    ge(other) {
        return this.raw >= other.raw;
    }
    eq(other) {
        return this.raw === other.raw;
    }
}

/**
 * Bit-identical Q16.16 multiply matching Rust's
 * `((a as i64).wrapping_mul(b as i64) >> FRAC_BITS) as i32`.
 *
 * Implementation: BigInt for correctness. The 64-bit signed multiply,
 * arithmetic right-shift by 16, and i32 truncation are all natively
 * expressible in BigInt with `*`, `>>`, and `BigInt.asIntN(32, …)`.
 *
 * @param {number} a - i32 raw
 * @param {number} b - i32 raw
 * @returns {number} i32 raw result
 */
export function fxpMulRaw(a, b) {
    const product = BigInt(a | 0) * BigInt(b | 0);
    const shifted = product >> BigInt(FXP_FRACT_BITS);
    return Number(BigInt.asIntN(32, shifted));
}

// ─── Common constants ─────────────────────────────────────────────────────────

export const FXP_ZERO = new Fxp(0);
export const FXP_ONE = new Fxp(FXP_ONE_RAW);
export const FXP_HALF = new Fxp(FXP_ONE_RAW >> 1);
export const FXP_NEG_ONE = new Fxp(-FXP_ONE_RAW);

/** π in Q16.16. Reference: round(π * 65536) = 205887. */
export const FXP_PI_RAW = 205887;
export const FXP_PI = new Fxp(FXP_PI_RAW);

/** 2π in Q16.16. */
export const FXP_TWO_PI_RAW = 411775;
export const FXP_TWO_PI = new Fxp(FXP_TWO_PI_RAW);

/** π/2 in Q16.16. */
export const FXP_HALF_PI_RAW = 102944;
export const FXP_HALF_PI = new Fxp(FXP_HALF_PI_RAW);

/** Simulation timestep at 60 Hz in Q16.16. round(1/60 * 65536) = 1092. */
export const FXP_DT_RAW = 1092;
export const FXP_DT = new Fxp(FXP_DT_RAW);
