// PCG-64 (Lcg128Xsl64) tests.
//
// The cross-language reference vector lives in
// `server/tests/parity_vectors.rs::rng_seed42_first_5_values`. Both
// sides emit byte-identical u64 sequences for seed=42. If JS or Rust
// drifts, BOTH tests fail — the parity harness working as intended.

import { describe, test, expect } from '@jest/globals';
import { Pcg64 } from '../../../js/sim/rng.js';

describe('Pcg64 cross-language reference vector (seed=42)', () => {
    test('first 5 nextU64 values match rand_pcg::Pcg64::seed_from_u64(42)', () => {
        // Captured 2026-05-09 from rand_pcg 0.3.1 + uuid 1.23.
        const expected = [
            4178418447715145737n,
            4410739922618931473n,
            14034899209665866285n,
            9736923071240364268n,
            17902128262962705724n,
        ];
        const r = new Pcg64(42n);
        const got = [];
        for (let i = 0; i < 5; i++) got.push(r.nextU64());
        expect(got).toEqual(expected);
    });
});

describe('Pcg64 determinism', () => {
    test('same seed produces same first 10 u64s', () => {
        const a = new Pcg64(42n);
        const b = new Pcg64(42n);
        for (let i = 0; i < 10; i++) {
            expect(a.nextU64()).toBe(b.nextU64());
        }
    });

    test('different seeds diverge within 4 outputs', () => {
        const a = new Pcg64(42n);
        const b = new Pcg64(43n);
        let differAt = -1;
        for (let i = 0; i < 4; i++) {
            const av = a.nextU64();
            const bv = b.nextU64();
            if (av !== bv && differAt < 0) differAt = i;
        }
        expect(differAt).toBeGreaterThanOrEqual(0);
        expect(differAt).toBeLessThan(4);
    });
});

describe('nextF64 distribution', () => {
    test('1000 samples in [0, 1)', () => {
        const r = new Pcg64(12345n);
        for (let i = 0; i < 1000; i++) {
            const v = r.nextF64();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('mean of 10000 samples within [0.45, 0.55]', () => {
        const r = new Pcg64(7n);
        let sum = 0;
        const N = 10000;
        for (let i = 0; i < N; i++) sum += r.nextF64();
        const mean = sum / N;
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
    });
});

describe('nextU32 covers full range', () => {
    test('produces both small and large values', () => {
        const r = new Pcg64(99n);
        let sawSmall = false;
        let sawLarge = false;
        for (let i = 0; i < 100; i++) {
            const v = r.nextU32();
            if (v < 0x10000000) sawSmall = true;
            if (v > 0xf0000000) sawLarge = true;
        }
        expect(sawSmall).toBe(true);
        expect(sawLarge).toBe(true);
    });
});

describe('nextRangeU64 stays in bounds', () => {
    test('range [0, 7) — 1000 samples', () => {
        const r = new Pcg64(1n);
        for (let i = 0; i < 1000; i++) {
            const v = r.nextRangeU64(7n);
            expect(v).toBeGreaterThanOrEqual(0n);
            expect(v).toBeLessThan(7n);
        }
    });
});

describe('Pcg64 number seed compatibility', () => {
    test('Pcg64(42) ≡ Pcg64(42n)', () => {
        const a = new Pcg64(42);
        const b = new Pcg64(42n);
        expect(a.nextU64()).toBe(b.nextU64());
    });
});
