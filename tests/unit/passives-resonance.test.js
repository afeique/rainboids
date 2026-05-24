// Phase P6 — Resonance passive: every 3rd power-weapon use costs no energy.
// resonanceStep is the pure cadence counter; the two fire sites (firePower +
// the charge-based path) advance the player's _resonanceUses through it and
// skip the energy deduction when `free` is true.
import { describe, expect, test } from '@jest/globals';
import { resonanceStep } from '../../js/modules/player/weapons.js';

describe('Resonance — every-3rd-use free cadence', () => {
    test('uses 1 and 2 cost energy, use 3 is free', () => {
        let s = resonanceStep(0); // use 1
        expect(s).toEqual({ count: 1, free: false });
        s = resonanceStep(s.count); // use 2
        expect(s).toEqual({ count: 2, free: false });
        s = resonanceStep(s.count); // use 3
        expect(s).toEqual({ count: 3, free: true });
    });

    test('the free use recurs every 3rd time (3, 6, 9, …)', () => {
        const free = [];
        let count = 0;
        for (let i = 1; i <= 12; i++) {
            const s = resonanceStep(count);
            count = s.count;
            if (s.free) free.push(s.count);
        }
        expect(free).toEqual([3, 6, 9, 12]);
    });

    test('treats undefined / null prior count as 0 (first use)', () => {
        expect(resonanceStep(undefined)).toEqual({ count: 1, free: false });
        expect(resonanceStep(null)).toEqual({ count: 1, free: false });
    });

    test('exactly 1 in 3 uses is free over a long run', () => {
        let count = 0, frees = 0;
        const N = 300;
        for (let i = 0; i < N; i++) {
            const s = resonanceStep(count);
            count = s.count;
            if (s.free) frees++;
        }
        expect(frees).toBe(N / 3);
    });
});
