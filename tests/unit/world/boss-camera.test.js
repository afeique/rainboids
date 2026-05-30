// world/boss-camera.js — dynamic-framing camera helpers (9.1.0 boss redesign).
import { describe, expect, test } from '@jest/globals';
import {
    smoothstep, lerp, platformBaseZoom, computeBossFraming,
    clampEffectiveZoom, guardShipZoom,
} from '../../../js/modules/world/boss-camera.js';
import { GAME_CONFIG as C } from '../../../js/modules/core/constants.js';

describe('boss-camera — math primitives', () => {
    test('smoothstep clamps to [0,1] and is monotonic across the band', () => {
        expect(smoothstep(0, 10, -5)).toBe(0);
        expect(smoothstep(0, 10, 15)).toBe(1);
        expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5, 5);
        expect(smoothstep(10, 10, 5)).toBe(0); // degenerate band
    });
    test('lerp', () => {
        expect(lerp(0, 1, 0.25)).toBeCloseTo(0.25, 5);
    });
});

describe('boss-camera — platform base zoom', () => {
    test('desktop = 1, mobile portrait/landscape pulled back', () => {
        expect(platformBaseZoom(false, false)).toBe(C.BASE_ZOOM_DESKTOP);
        expect(platformBaseZoom(true, true)).toBe(C.BASE_ZOOM_PORTRAIT);
        expect(platformBaseZoom(true, false)).toBe(C.BASE_ZOOM_LANDSCAPE);
    });
});

describe('boss-camera — dynamic framing', () => {
    test('desktop: close in → full fidelity (~1.0), far out → BOSS_ZOOM_MIN', () => {
        const near = computeBossFraming({ px: 0, py: 0, bx: 0, by: 0, baseZoom: 1, isMobile: false });
        expect(near).toBeCloseTo(C.BOSS_ZOOM_MAX, 5); // distance 0 → MAX
        const far = computeBossFraming({ px: 0, py: 0, bx: 4000, by: 0, baseZoom: 1, isMobile: false });
        expect(far).toBeCloseTo(C.BOSS_ZOOM_MIN, 5); // beyond FAR_R → MIN
    });

    test('mid distance falls between MIN and MAX', () => {
        const midD = (C.BOSS_ZOOM_NEAR_R + C.BOSS_ZOOM_FAR_R) / 2;
        const mid = computeBossFraming({ px: 0, py: 0, bx: midD, by: 0, baseZoom: 1, isMobile: false });
        expect(mid).toBeGreaterThan(C.BOSS_ZOOM_MIN);
        expect(mid).toBeLessThan(C.BOSS_ZOOM_MAX);
    });

    test('mobile is gentle and never dips below the effective floor', () => {
        const base = C.BASE_ZOOM_PORTRAIT;
        const far = computeBossFraming({ px: 0, py: 0, bx: 4000, by: 0, baseZoom: base, isMobile: true });
        // Only pulled back to base*factor — far less aggressive than desktop MIN.
        expect(far).toBeGreaterThan(C.BOSS_ZOOM_MIN);
        expect(far).toBeGreaterThanOrEqual(C.MIN_EFFECTIVE_ZOOM);
        expect(far).toBeLessThanOrEqual(base);
    });
});

describe('boss-camera — clamps + ship guardrail', () => {
    test('clampEffectiveZoom floors at MIN_EFFECTIVE_ZOOM, ceils at MAX', () => {
        expect(clampEffectiveZoom(0.1)).toBe(C.MIN_EFFECTIVE_ZOOM);
        expect(clampEffectiveZoom(2)).toBe(C.BOSS_ZOOM_MAX);
    });
    test('guardShipZoom raises zoom so the ship never shrinks below the floor', () => {
        const r = 30;
        const floor = C.MIN_SHIP_SCREEN_R / r;
        expect(guardShipZoom(floor - 0.1, r)).toBeCloseTo(floor, 5); // raised up
        expect(guardShipZoom(0.9, r)).toBe(0.9);                     // already fine
        expect(guardShipZoom(0.5, 0)).toBe(0.5);                     // bad radius → unchanged
    });
});
