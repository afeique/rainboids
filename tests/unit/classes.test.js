/**
 * tests/unit/classes.test.js — Looter-Economy Pivot T07: class definitions.
 *
 * Pins the per-run class catalog (design §Phase 6):
 *   - exactly 7 classes
 *   - every class has favoredStats that are ALL valid sp-stats ids
 *   - every class has a string mechanicId (the unique-mechanic hook)
 *   - every class has a string signatureAbilityId (the free exclusive ability)
 */

import { describe, expect, test } from '@jest/globals';
import { CLASSES, CLASS_ORDER, classDef } from '../../js/modules/player/classes.js';
import { SP_STATS } from '../../js/modules/core/sp-stats.js';

const SP_STAT_IDS = new Set(SP_STATS.map((s) => s.id));
const entries = Object.values(CLASSES);

describe('CLASSES catalog', () => {
    test('defines exactly 7 classes', () => {
        expect(entries.length).toBe(7);
        expect(CLASS_ORDER.length).toBe(7);
    });

    test('the expected class ids are present', () => {
        const ids = entries.map((c) => c.id).sort();
        expect(ids).toEqual(
            ['BULWARK', 'ELEMENTALIST', 'ENGINEER', 'REAPER', 'STRIKER', 'TEMPEST', 'WILDCARD'].sort(),
        );
    });

    test('each class id matches its map key', () => {
        for (const [key, c] of Object.entries(CLASSES)) {
            expect(c.id).toBe(key);
        }
    });

    test('every class has favoredStats — all valid sp-stats ids', () => {
        for (const c of entries) {
            expect(Array.isArray(c.favoredStats)).toBe(true);
            expect(c.favoredStats.length).toBeGreaterThan(0);
            for (const stat of c.favoredStats) {
                expect(SP_STAT_IDS.has(stat)).toBe(true);
            }
        }
    });

    test('every class has a non-empty string mechanicId', () => {
        for (const c of entries) {
            expect(typeof c.mechanicId).toBe('string');
            expect(c.mechanicId.length).toBeGreaterThan(0);
        }
    });

    test('every class has a non-empty string signatureAbilityId', () => {
        for (const c of entries) {
            expect(typeof c.signatureAbilityId).toBe('string');
            expect(c.signatureAbilityId.length).toBeGreaterThan(0);
        }
    });

    test('signature abilities are unique (class-exclusive)', () => {
        const sigs = entries.map((c) => c.signatureAbilityId);
        expect(new Set(sigs).size).toBe(sigs.length);
    });

    test('every class has a description string', () => {
        for (const c of entries) {
            expect(typeof c.description).toBe('string');
            expect(c.description.length).toBeGreaterThan(0);
        }
    });

    test('classDef resolves known ids and returns null otherwise', () => {
        expect(classDef('STRIKER')).toBe(CLASSES.STRIKER);
        expect(classDef('NOPE')).toBeNull();
    });
});
