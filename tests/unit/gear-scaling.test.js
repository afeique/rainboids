// Looter-Economy Pivot — T03: Gear-scaling math (§2.1).
// Validates the level ramp + SP amplification — the single source of truth
// for how gear/Matrix/set % bonuses scale with the per-run level.
import {
    LEVEL_SOFTCAP,
    levelRamp,
    amplifySP,
} from '../../js/modules/core/gear-scaling.js';

describe('T03 — LEVEL_SOFTCAP', () => {
    test('is 25', () => {
        expect(LEVEL_SOFTCAP).toBe(25);
    });
});

describe('T03 — levelRamp', () => {
    test('level 1 is 0 (gear dormant)', () => {
        expect(levelRamp(1)).toBe(0);
    });

    test('level == softcap is 1 (gear at full strength)', () => {
        expect(levelRamp(25)).toBe(1);
    });

    test('clamps above the softcap to 1', () => {
        expect(levelRamp(26)).toBe(1);
        expect(levelRamp(100)).toBe(1);
    });

    test('is linear between 1 and the softcap', () => {
        // level 13 = midpoint of 1..25 → 0.5
        expect(levelRamp(13)).toBeCloseTo(0.5, 6);
        // level 7 → (7-1)/24 = 0.25
        expect(levelRamp(7)).toBeCloseTo(0.25, 6);
    });

    test('honors a custom softcap', () => {
        expect(levelRamp(1, 11)).toBe(0);
        expect(levelRamp(11, 11)).toBe(1);
        expect(levelRamp(6, 11)).toBeCloseTo(0.5, 6); // (6-1)/10
    });

    test('never goes negative for sub-1 levels', () => {
        expect(levelRamp(0)).toBe(0);
        expect(levelRamp(-3)).toBe(0);
    });
});

describe('T03 — amplifySP', () => {
    test('zero at level 1 — gear contributes nothing early', () => {
        // amp doesn't matter at level 1 because the ramp is 0
        expect(amplifySP(100, 0.5, 1)).toBe(100);
    });

    test('full at level == softcap', () => {
        // +50% amp fully live at level 25 → 100 × 1.5
        expect(amplifySP(100, 0.5, 25)).toBeCloseTo(150, 6);
    });

    test('half-ramp applies half the amplifier', () => {
        // level 13 (ramp 0.5), +20% amp → 100 × (1 + 0.2*0.5) = 110
        expect(amplifySP(100, 0.2, 13)).toBeCloseTo(110, 6);
    });

    test('amplifies invested SP only — zero SP value stays zero', () => {
        expect(amplifySP(0, 0.5, 25)).toBe(0);
        expect(amplifySP(0, 99, 25)).toBe(0);
    });

    test('zero amp leaves the SP value untouched at any level', () => {
        expect(amplifySP(80, 0, 25)).toBe(80);
        expect(amplifySP(80, 0, 1)).toBe(80);
    });
});
