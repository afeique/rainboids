// Polynomial trig over fixed-point inputs. Bit-identical to the Rust
// counterpart in `server/src/sim/trig.rs` given the same Fxp input.
//
// `Math.sin` / `Math.cos` / `f32::sin` / `f64::sin` use platform libm
// implementations that disagree at the ULP level — that's fatal for
// cross-language deterministic prediction. The polynomial below is
// the same code on both sides, evaluated entirely in fixed-point.
//
// Algorithms:
//
//  - `fxpSin(x)`: reduce x mod 2π into [-π, π], then fold via
//    sin(π-x)=sin(x) into [-π/2, π/2], then evaluate a 5-term Taylor
//    polynomial. Worst-case absolute error ≈ 1e-4 rad.
//
//  - `fxpCos(x)` = fxpSin(x + π/2).
//
//  - `fxpAtan2(y, x)`: quadrant decomposition + an atan polynomial
//    anchored exactly at t=0 and t=1:
//      atan(t) ≈ t·(π/4 - (t-1)·(0.2447 + 0.0663·t))
//    Worst-case error ≈ 1.5e-3 rad over [-1, 1]. Anchoring at the
//    boundaries means the quadrant-fold expressions evaluate cleanly
//    at the corners (atan2(±y, 0) = ±π/2 exactly, etc.).

import {
    Fxp,
    FXP_ONE_RAW,
    FXP_PI_RAW,
    FXP_HALF_PI_RAW,
    FXP_TWO_PI_RAW,
    fxpMulRaw,
} from './fxp.js';

/* ─── sin via Taylor on [-π/2, π/2] ───────────────────────────────────────── */

// 5-term Taylor for sin (odd polynomial in x):
//   sin(x) ≈ x · (1 + c1·x² + c2·x⁴ + c3·x⁶ + c4·x⁸)
// Coefficients from Q16.16-rounded -1/3!, 1/5!, -1/7!, 1/9!.
const SIN_C0 = FXP_ONE_RAW; // 65536
const SIN_C1 = -10923; // round(-1/6  * 65536)
const SIN_C2 = 546; // round( 1/120 * 65536)
const SIN_C3 = -13; // round(-1/5040 * 65536)
const SIN_C4 = 0; // round( 1/362880 * 65536) — sub-ULP, retained for parity

/**
 * Reduce x (Q16.16 radians) into [-π, π].
 * Bit-identical across Rust/JS via integer division.
 *
 * @param {number} rawXi32  - Q16.16 raw input
 * @returns {number} Q16.16 raw output in [-π, π]
 */
export function reduceModTwoPiRaw(rawXi32) {
    const x = rawXi32 | 0;
    if (x >= -FXP_PI_RAW && x <= FXP_PI_RAW) return x;
    const xBig = BigInt(x);
    const twoPi = BigInt(FXP_TWO_PI_RAW);
    const half = BigInt(FXP_PI_RAW);
    let k;
    if (xBig >= 0n) {
        k = (xBig + half) / twoPi;
    } else {
        k = -((-xBig + half) / twoPi);
    }
    return Number(BigInt.asIntN(32, xBig - k * twoPi));
}

/**
 * sin(x) where x is Q16.16 radians; returns Q16.16. Bit-identical to
 * the Rust counterpart given the same input.
 *
 * @param {Fxp|number} x
 * @returns {Fxp}
 */
export function fxpSin(x) {
    const raw = typeof x === 'number' ? x | 0 : x.raw;
    let r = reduceModTwoPiRaw(raw); // r in [-π, π]

    // Fold into [-π/2, π/2] via sin(π - x) = sin(x).
    if (r > FXP_HALF_PI_RAW) {
        r = (FXP_PI_RAW - r) | 0;
    } else if (r < -FXP_HALF_PI_RAW) {
        r = (-FXP_PI_RAW - r) | 0;
    }
    // Now r in [-π/2, π/2] — Taylor converges quickly here.

    const x2 = fxpMulRaw(r, r);

    // Horner: ((((c4·x²) + c3)·x² + c2)·x² + c1)·x² + c0, then × x.
    let acc = SIN_C4 | 0;
    acc = (fxpMulRaw(acc, x2) + SIN_C3) | 0;
    acc = (fxpMulRaw(acc, x2) + SIN_C2) | 0;
    acc = (fxpMulRaw(acc, x2) + SIN_C1) | 0;
    acc = (fxpMulRaw(acc, x2) + SIN_C0) | 0;
    return new Fxp(fxpMulRaw(acc, r));
}

/**
 * cos(x) = sin(x + π/2).
 * @param {Fxp|number} x
 * @returns {Fxp}
 */
export function fxpCos(x) {
    const raw = typeof x === 'number' ? x | 0 : x.raw;
    return fxpSin((raw + FXP_HALF_PI_RAW) | 0);
}

/* ─── atan2 ───────────────────────────────────────────────────────────────── */

// Q16.16-encoded coefficients for
//     atan(t) ≈ t · (π/4 - (t-1) · (0.2447 + 0.0663·t))   for t ∈ [0, 1]
// The form is anchored: equals 0 at t=0 and equals π/4 at t=1, exactly.
// Sign-folded for t ∈ [-1, 0] via atan(-t) = -atan(t).
const ATAN_PI4 = 51472; // round(π/4 * 65536)
const ATAN_C0 = 16040; // round(0.2447 * 65536)
const ATAN_C1 = 4346; // round(0.0663 * 65536)

/**
 * atan(t) for t ∈ [-1, 1], Q16.16. Anchored at t=0 and t=1.
 * @param {number} tRaw - Q16.16 raw input in [-1, 1]
 * @returns {number} Q16.16 raw radians in [-π/4, π/4]
 */
function atanUnit(tRaw) {
    const sign = tRaw < 0 ? -1 : 1;
    const at = (tRaw < 0 ? -tRaw : tRaw) | 0;
    const q = (at - FXP_ONE_RAW) | 0; // (|t| - 1)
    const inner = (ATAN_C0 + fxpMulRaw(ATAN_C1, at)) | 0;
    const correction = fxpMulRaw(q, inner);
    const result = fxpMulRaw(at, (ATAN_PI4 - correction) | 0);
    return sign === -1 ? -result | 0 : result;
}

/**
 * atan2(y, x): polynomial approximation in Q16.16 with quadrant fold.
 *
 * Quadrant rules (anchored for the four ±π/2/±π corners):
 *   - |y| ≤ |x|:  raw = atanUnit(y/x)
 *                 if x < 0:  raw += sign(y) · π     (Q2 / Q3 fold)
 *   - |y| >  |x|: raw = sign(y) · (π/2) - atanUnit(x/y)
 *
 * @param {Fxp|number} y
 * @param {Fxp|number} x
 * @returns {Fxp} radians, Q16.16
 */
export function fxpAtan2(y, x) {
    const yi = typeof y === 'number' ? y | 0 : y.raw;
    const xi = typeof x === 'number' ? x | 0 : x.raw;
    if (xi === 0 && yi === 0) return new Fxp(0);

    const ay = yi < 0 ? -yi | 0 : yi;
    const ax = xi < 0 ? -xi | 0 : xi;

    let raw;
    if (ax >= ay) {
        const t = divQ16(yi, xi);
        raw = atanUnit(t);
        if (xi < 0) {
            // Q2/Q3 correction: atan2(y, -|x|) = atan(y/x) + sign(y) · π
            // (yi === 0 case picks +π, which is what atan2 (0, -|x|) wants.)
            raw = (raw + (yi >= 0 ? FXP_PI_RAW : -FXP_PI_RAW)) | 0;
        }
    } else {
        const t = divQ16(xi, yi);
        const at = atanUnit(t);
        raw = yi >= 0 ? (FXP_HALF_PI_RAW - at) | 0 : (-FXP_HALF_PI_RAW - at) | 0;
    }
    return new Fxp(raw);
}

/** Integer Q16.16 divide via BigInt (exact). */
function divQ16(aRaw, bRaw) {
    const a = BigInt(aRaw | 0);
    const b = BigInt(bRaw | 0);
    if (b === 0n) return 0;
    const q = (a << 16n) / b;
    return Number(BigInt.asIntN(32, q));
}
