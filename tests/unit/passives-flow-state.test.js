// Phase P6 — Flow State passive. Each kill shaves FLOW_STATE_FRACTION (3%) of a
// slot's MAX cooldown off its remaining cooldown. flowStateReduce is the pure,
// in-place math; onEnemyKill calls it once per kill when the passive is equipped.
import { describe, expect, test } from '@jest/globals';
import { flowStateReduce, FLOW_STATE_FRACTION } from '../../js/modules/combat/combat-manager.js';

describe('Flow State — per-kill cooldown reduction', () => {
    test('cuts 3% of each slot max off the remaining cooldown', () => {
        const cd = [1000, 5000, 0, 200];
        const max = [2000, 5000, 8000, 400];
        flowStateReduce(cd, max);
        // slot0: 1000 - 2000*0.03 = 940; slot1: 5000 - 150 = 4850;
        // slot2: 0 (untouched); slot3: 200 - 12 = 188
        expect(cd[0]).toBeCloseTo(940, 5);
        expect(cd[1]).toBeCloseTo(4850, 5);
        expect(cd[2]).toBe(0);
        expect(cd[3]).toBeCloseTo(188, 5);
    });

    test('longer abilities recover more absolute time per kill', () => {
        const cd = [9000, 1000];
        const max = [10000, 1000];
        flowStateReduce(cd, max);
        const cut0 = 9000 - cd[0];
        const cut1 = 1000 - cd[1];
        expect(cut0).toBeGreaterThan(cut1);
    });

    test('never drives a cooldown below zero', () => {
        const cd = [10];
        const max = [10000]; // 3% = 300 > 10 remaining
        flowStateReduce(cd, max);
        expect(cd[0]).toBe(0);
    });

    test('a ready slot (0 remaining) stays at 0', () => {
        const cd = [0, 0];
        const max = [5000, 5000];
        flowStateReduce(cd, max);
        expect(cd).toEqual([0, 0]);
    });

    test('custom fraction is honored', () => {
        const cd = [1000];
        const max = [1000];
        flowStateReduce(cd, max, 0.5);
        expect(cd[0]).toBeCloseTo(500, 5);
    });

    test('FLOW_STATE_FRACTION is the documented 3%', () => {
        expect(FLOW_STATE_FRACTION).toBeCloseTo(0.03, 5);
    });

    test('malformed inputs are safe no-ops (no throw)', () => {
        expect(() => flowStateReduce(null, [1])).not.toThrow();
        expect(() => flowStateReduce([1], null)).not.toThrow();
        expect(() => flowStateReduce(undefined, undefined)).not.toThrow();
    });
});
