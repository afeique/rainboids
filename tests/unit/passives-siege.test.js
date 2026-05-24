// Phase P6 — Siege passive: "standing still ramps your damage (stacks, decays on
// the move)". `_siegeRamp` ∈ [0,1] advances each frame in player.update() from
// speed; the outgoing mult is applied in applyDamageToEnemy via
// getSiegeDamageMult. siegeRampStep is the build/decay curve, siegeMult the
// ramp→multiplier curve — both pure, tested here.
import { describe, expect, test } from '@jest/globals';
import {
    siegeRampStep,
    siegeMult,
    SIEGE_BUILD_MS,
    SIEGE_DECAY_MS,
    SIEGE_MAX_BONUS,
} from '../../js/modules/player/player.js';

describe('Siege — stationary ramp build/decay', () => {
    test('standing still builds the ramp toward 1', () => {
        const r = siegeRampStep(0, false, SIEGE_BUILD_MS / 4); // a quarter of the way
        expect(r).toBeCloseTo(0.25, 5);
    });

    test('a full build window reaches a full ramp (clamped at 1)', () => {
        expect(siegeRampStep(0, false, SIEGE_BUILD_MS)).toBe(1);
        expect(siegeRampStep(0.9, false, SIEGE_BUILD_MS)).toBe(1); // clamps
    });

    test('moving decays the ramp toward 0', () => {
        const r = siegeRampStep(1, true, SIEGE_DECAY_MS / 2);
        expect(r).toBeCloseTo(0.5, 5);
    });

    test('a full decay window empties the ramp (clamped at 0)', () => {
        expect(siegeRampStep(1, true, SIEGE_DECAY_MS)).toBe(0);
        expect(siegeRampStep(0.1, true, SIEGE_DECAY_MS)).toBe(0);
    });

    test('decay is faster than build (moving punishes the ramp)', () => {
        const built = siegeRampStep(0, false, 100);   // +100ms still
        const decayed = 1 - siegeRampStep(1, true, 100); // −100ms moving
        expect(decayed).toBeGreaterThan(built);
    });

    test('garbage inputs are clamped/safe', () => {
        expect(siegeRampStep(undefined, false, undefined)).toBe(0);
        expect(siegeRampStep(2, false, 0)).toBe(1);   // prev over-cap clamps
        expect(siegeRampStep(-1, true, 0)).toBe(0);
    });
});

describe('Siege — ramp → damage multiplier', () => {
    test('empty ramp → ×1', () => {
        expect(siegeMult(0)).toBe(1);
    });

    test('full ramp → +SIEGE_MAX_BONUS', () => {
        expect(siegeMult(1)).toBeCloseTo(1 + SIEGE_MAX_BONUS, 5);
    });

    test('half ramp → half the bonus', () => {
        expect(siegeMult(0.5)).toBeCloseTo(1 + SIEGE_MAX_BONUS / 2, 5);
    });

    test('out-of-range ramp clamps', () => {
        expect(siegeMult(5)).toBeCloseTo(1 + SIEGE_MAX_BONUS, 5);
        expect(siegeMult(-1)).toBe(1);
    });
});
