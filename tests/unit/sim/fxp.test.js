// Fixed-point math tests — bit-identical to Rust's I16F16 over the same
// operations. The reference values below were computed in two ways:
//   1. From the Q16.16 raw integer math directly (a*b >> 16 cast i32).
//   2. Cross-checked against `cargo test fxp` in `server/`.
//
// If a test here fails, EITHER the JS implementation drifted OR the
// Rust counterpart drifted; consult `schema/SIM_SPEC.md` and
// `server/src/sim/fxp.rs` to triage.

import { describe, test, expect } from '@jest/globals';
import {
    Fxp,
    FXP_FRACT_BITS,
    FXP_ONE_RAW,
    fxpMulRaw,
} from '../../../js/sim/fxp.js';

describe('Fxp constants', () => {
    test('FXP_FRACT_BITS = 16', () => {
        expect(FXP_FRACT_BITS).toBe(16);
    });
    test('FXP_ONE_RAW = 1 << 16 = 65536', () => {
        expect(FXP_ONE_RAW).toBe(65536);
    });
});

describe('Fxp.fromFloat / toFloat round-trip', () => {
    const cases = [0, 1, -1, 0.5, -0.5, 1.5, 100.25, -32768, 32767.5, 1 / 60];
    for (const f of cases) {
        test(`f=${f}`, () => {
            const x = Fxp.fromFloat(f);
            expect(Math.abs(x.toFloat() - f)).toBeLessThan(1 / 65536);
        });
    }
});

describe('Fxp.fromInt', () => {
    test('5 → raw 5*65536', () => {
        expect(Fxp.fromInt(5).raw).toBe(5 * 65536);
    });
    test('-3 → raw -3*65536', () => {
        expect(Fxp.fromInt(-3).raw).toBe(-3 * 65536);
    });
});

describe('Fxp.add / sub / neg / abs', () => {
    test('1 + 2 = 3', () => {
        const a = Fxp.fromInt(1);
        const b = Fxp.fromInt(2);
        expect(a.add(b).raw).toBe(Fxp.fromInt(3).raw);
    });
    test('5 - 3 = 2', () => {
        const a = Fxp.fromInt(5);
        const b = Fxp.fromInt(3);
        expect(a.sub(b).raw).toBe(Fxp.fromInt(2).raw);
    });
    test('-7 neg = 7', () => {
        expect(Fxp.fromInt(-7).neg().raw).toBe(Fxp.fromInt(7).raw);
    });
    test('-4 abs = 4', () => {
        expect(Fxp.fromInt(-4).abs().raw).toBe(Fxp.fromInt(4).raw);
    });
});

describe('fxpMulRaw — bit-identical to Rust ((a*b)>>16) as i32', () => {
    // Reference values produced by the formula
    //   raw = ((a as i64) * (b as i64) >> 16) as i32
    // Anyone changing fxpMulRaw must keep these green.
    const refs = [
        // [a_raw, b_raw, expected_raw]
        [FXP_ONE_RAW, FXP_ONE_RAW, FXP_ONE_RAW], // 1.0 * 1.0 = 1.0
        [Fxp.fromFloat(1.5).raw, Fxp.fromFloat(1.5).raw, Fxp.fromFloat(2.25).raw],
        [Fxp.fromFloat(-1.5).raw, Fxp.fromFloat(2).raw, Fxp.fromFloat(-3).raw],
        [Fxp.fromFloat(0).raw, Fxp.fromFloat(123).raw, 0],
        [Fxp.fromFloat(0.5).raw, Fxp.fromFloat(0.5).raw, Fxp.fromFloat(0.25).raw],
        [Fxp.fromFloat(100).raw, Fxp.fromFloat(100).raw, Fxp.fromFloat(10000).raw],
        // Negative * negative = positive
        [Fxp.fromFloat(-3).raw, Fxp.fromFloat(-4).raw, Fxp.fromFloat(12).raw],
    ];
    for (const [a, b, expected] of refs) {
        test(`fxpMulRaw(${a}, ${b}) = ${expected}`, () => {
            expect(fxpMulRaw(a, b)).toBe(expected);
        });
    }
});

describe('Fxp.mul agrees with fxpMulRaw', () => {
    test('1.5 * 1.5 = 2.25', () => {
        expect(Fxp.fromFloat(1.5).mul(Fxp.fromFloat(1.5)).raw).toBe(
            Fxp.fromFloat(2.25).raw,
        );
    });
});

describe('Fxp.div', () => {
    test('6 / 2 = 3', () => {
        expect(Fxp.fromInt(6).div(Fxp.fromInt(2)).raw).toBe(Fxp.fromInt(3).raw);
    });
    test('1 / 4 = 0.25', () => {
        expect(Fxp.fromInt(1).div(Fxp.fromInt(4)).raw).toBe(
            Fxp.fromFloat(0.25).raw,
        );
    });
    test('div by zero throws', () => {
        expect(() => Fxp.fromInt(1).div(Fxp.fromInt(0))).toThrow();
    });
});

describe('Comparison ops', () => {
    test('lt/le/gt/ge/eq', () => {
        const a = Fxp.fromFloat(1);
        const b = Fxp.fromFloat(2);
        expect(a.lt(b)).toBe(true);
        expect(a.le(b)).toBe(true);
        expect(a.gt(b)).toBe(false);
        expect(a.ge(b)).toBe(false);
        expect(a.eq(b)).toBe(false);
        expect(b.eq(Fxp.fromFloat(2))).toBe(true);
    });
});
