// Phase P6 batch 6 — Killing Spree streak-bonus doubling. Pure helper test
// (the "no reset on hit" half is already the game's behavior — the streak
// decays on a timer, not on hit).
import { describe, expect, test } from '@jest/globals';
import { killingSpreeMult } from '../../js/modules/combat/combat-manager.js';

describe('killingSpreeMult', () => {
    test('doubles the bonus over 1.0 when active', () => {
        expect(killingSpreeMult(1.5, true)).toBeCloseTo(2.0);  // +50% → +100%
        expect(killingSpreeMult(2.0, true)).toBeCloseTo(3.0);  // +100% → +200%
        expect(killingSpreeMult(1.0, true)).toBeCloseTo(1.0);  // no bonus, no change
    });
    test('passes the tier multiplier through unchanged when inactive', () => {
        expect(killingSpreeMult(1.5, false)).toBeCloseTo(1.5);
        expect(killingSpreeMult(2.0, false)).toBeCloseTo(2.0);
    });
    test('tolerates garbage input', () => {
        expect(killingSpreeMult(undefined, true)).toBe(1);
        expect(killingSpreeMult(0, false)).toBe(1);
    });
});
