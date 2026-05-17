// Polynomial trig tests. Verifies fxpSin/Cos/Atan2 stay within bounds
// of the reference math. Cross-language parity is verified by the
// parity harness, which compares JS output against Rust.

import { describe, test, expect } from '@jest/globals';
import {
    Fxp,
    FXP_PI_RAW,
    FXP_HALF_PI_RAW,
    FXP_TWO_PI_RAW,
} from '../../../js/sim/fxp.js';
import { fxpSin, fxpCos, fxpAtan2, reduceModTwoPiRaw } from '../../../js/sim/trig.js';

const TOL = 0.005; // ~5 ULP at Q16.16 — generous; tighter is a bug in the polynomial.

describe('reduceModTwoPiRaw', () => {
    test('values within [-π, π] returned unchanged', () => {
        expect(reduceModTwoPiRaw(0)).toBe(0);
        expect(reduceModTwoPiRaw(FXP_PI_RAW)).toBe(FXP_PI_RAW);
        expect(reduceModTwoPiRaw(-FXP_PI_RAW)).toBe(-FXP_PI_RAW);
    });
    test('2π reduces to 0 (within ulp)', () => {
        const r = reduceModTwoPiRaw(FXP_TWO_PI_RAW);
        expect(Math.abs(r)).toBeLessThan(2);
    });
    test('-2π reduces to 0 (within ulp)', () => {
        const r = reduceModTwoPiRaw(-FXP_TWO_PI_RAW);
        expect(Math.abs(r)).toBeLessThan(2);
    });
});

describe('fxpSin', () => {
    const tests = [
        { x: 0, expected: 0 },
        { x: Math.PI / 6, expected: 0.5 },
        { x: Math.PI / 4, expected: Math.sqrt(2) / 2 },
        { x: Math.PI / 3, expected: Math.sqrt(3) / 2 },
        { x: Math.PI / 2, expected: 1 },
        { x: -Math.PI / 2, expected: -1 },
        { x: Math.PI, expected: 0 },
    ];
    for (const t of tests) {
        test(`sin(${t.x.toFixed(4)}) ≈ ${t.expected}`, () => {
            const got = fxpSin(Fxp.fromFloat(t.x)).toFloat();
            expect(Math.abs(got - t.expected)).toBeLessThan(TOL);
        });
    }
});

describe('fxpCos', () => {
    const tests = [
        { x: 0, expected: 1 },
        { x: Math.PI / 4, expected: Math.sqrt(2) / 2 },
        { x: Math.PI / 2, expected: 0 },
        { x: Math.PI, expected: -1 },
    ];
    for (const t of tests) {
        test(`cos(${t.x.toFixed(4)}) ≈ ${t.expected}`, () => {
            const got = fxpCos(Fxp.fromFloat(t.x)).toFloat();
            expect(Math.abs(got - t.expected)).toBeLessThan(TOL);
        });
    }
});

describe('sin² + cos² ≈ 1', () => {
    const xs = [0, 0.3, 0.7, 1.1, 1.5, 2.1, -0.4, -1.2];
    for (const x of xs) {
        test(`x=${x}`, () => {
            const s = fxpSin(Fxp.fromFloat(x)).toFloat();
            const c = fxpCos(Fxp.fromFloat(x)).toFloat();
            expect(Math.abs(s * s + c * c - 1)).toBeLessThan(TOL);
        });
    }
});

describe('fxpAtan2', () => {
    const cases = [
        { y: 0, x: 1, expected: 0 },
        { y: 1, x: 0, expected: Math.PI / 2 },
        { y: 0, x: -1, expected: Math.PI },
        { y: -1, x: 0, expected: -Math.PI / 2 },
        { y: 1, x: 1, expected: Math.PI / 4 },
        { y: 1, x: -1, expected: (3 * Math.PI) / 4 },
        { y: -1, x: 1, expected: -Math.PI / 4 },
        { y: -1, x: -1, expected: (-3 * Math.PI) / 4 },
    ];
    for (const c of cases) {
        test(`atan2(${c.y}, ${c.x}) ≈ ${c.expected.toFixed(3)}`, () => {
            const got = fxpAtan2(Fxp.fromFloat(c.y), Fxp.fromFloat(c.x)).toFloat();
            expect(Math.abs(got - c.expected)).toBeLessThan(0.01);
        });
    }

    test('atan2(0, 0) = 0 by convention', () => {
        expect(fxpAtan2(Fxp.fromFloat(0), Fxp.fromFloat(0)).raw).toBe(0);
    });
});
