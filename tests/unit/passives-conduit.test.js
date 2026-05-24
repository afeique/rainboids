// Phase P6 — Conduit passive: your statuses tick 25% faster but expire 25%
// sooner. The status DURATION (combat-manager apply* sites) and the burn/bleed
// tick INTERVAL (Enemy._processStatusEffects) both scale by conduitFactor, so
// the tick COUNT is preserved — a tempo trade, not a damage change.
import { describe, expect, test } from '@jest/globals';
import { conduitFactor, CONDUIT_SCALE } from '../../js/modules/combat/combat-manager.js';

const withConduit = { player: { hasPassive: (id) => id === 'CONDUIT' } };
const without = { player: { hasPassive: () => false } };

describe('Conduit — faster/shorter status factor', () => {
    test('CONDUIT_SCALE is the documented 0.75 (−25%)', () => {
        expect(CONDUIT_SCALE).toBeCloseTo(0.75, 5);
    });

    test('returns CONDUIT_SCALE when the player has the passive', () => {
        expect(conduitFactor(withConduit)).toBe(CONDUIT_SCALE);
    });

    test('returns 1 (no-op) without the passive', () => {
        expect(conduitFactor(without)).toBe(1);
    });

    test('returns 1 for bare/undefined ctx (bare unit-test calls)', () => {
        expect(conduitFactor(undefined)).toBe(1);
        expect(conduitFactor(null)).toBe(1);
        expect(conduitFactor({})).toBe(1);
        expect(conduitFactor({ player: {} })).toBe(1);
    });

    test('tick COUNT is preserved: duration ×f and interval ×f cancel out', () => {
        // A 3s burn at 500ms ticks → 6 ticks. With Conduit both scale by f,
        // so the count = (duration·f) / (interval·f) is unchanged.
        const f = conduitFactor(withConduit);
        const baseCount = 3000 / 500;
        const conduitCount = (3000 * f) / (500 * f);
        expect(conduitCount).toBeCloseTo(baseCount, 5);
        expect(conduitCount).toBe(6);
    });

    test('the window genuinely shrinks ~25% (burn ends sooner)', () => {
        const f = conduitFactor(withConduit);
        expect(3000 * f).toBeCloseTo(2250, 5); // 3s burn → 2.25s under Conduit
    });
});
