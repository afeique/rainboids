/**
 * tests/unit/class-system.test.js — Looter-Economy Pivot T16: class system.
 *
 * Verifies the per-run soft-lens helpers in player/class-system.js:
 *   - applyClass sets classId / classFavoredStats / classMechanicId and attaches
 *     the signature ability into its DEDICATED field, never touching the 4-slot
 *     equippedAbilities pool;
 *   - classStatBonus returns CLASS_STAT_LEAN_PCT for favored stats, 0 otherwise;
 *   - an unknown class id is a safe no-op (returns null, mutates nothing);
 *   - clearClass resets every class field.
 */

import { describe, expect, test } from '@jest/globals';
import {
    CLASS_STAT_LEAN_PCT,
    applyClass,
    classStatBonus,
    clearClass,
} from '../../js/modules/player/class-system.js';
import { CLASSES } from '../../js/modules/player/classes.js';

// A minimal player-like stub. equippedAbilities is the 4-slot pool the
// signature ability must NOT touch.
function makePlayer() {
    return {
        equippedAbilities: [null, null, null, null],
    };
}

describe('CLASS_STAT_LEAN_PCT', () => {
    test('is a positive fraction (the soft favored-stat lean)', () => {
        expect(typeof CLASS_STAT_LEAN_PCT).toBe('number');
        expect(CLASS_STAT_LEAN_PCT).toBeGreaterThan(0);
        expect(CLASS_STAT_LEAN_PCT).toBeLessThan(1);
    });
});

describe('applyClass', () => {
    test('sets all class fields from the class def', () => {
        const player = makePlayer();
        const def = applyClass(player, 'STRIKER');

        expect(def).toBe(CLASSES.STRIKER);
        expect(player.classId).toBe('STRIKER');
        expect(player.classFavoredStats).toEqual(CLASSES.STRIKER.favoredStats);
        expect(player.classMechanicId).toBe(CLASSES.STRIKER.mechanicId);
    });

    test('attaches the signature ability into its dedicated field', () => {
        const player = makePlayer();
        applyClass(player, 'ENGINEER');
        expect(player.signatureAbility).toBe(CLASSES.ENGINEER.signatureAbilityId);
    });

    test('does NOT consume one of the 4 normal ability slots', () => {
        const player = makePlayer();
        applyClass(player, 'STRIKER');
        // equippedAbilities untouched — all four slots still empty.
        expect(player.equippedAbilities).toEqual([null, null, null, null]);
        expect(player.equippedAbilities).not.toContain(CLASSES.STRIKER.signatureAbilityId);
    });

    test('classFavoredStats is a fresh copy (cannot mutate the catalog)', () => {
        const player = makePlayer();
        applyClass(player, 'STRIKER');
        expect(player.classFavoredStats).not.toBe(CLASSES.STRIKER.favoredStats);
        player.classFavoredStats.push('TAMPERED');
        expect(CLASSES.STRIKER.favoredStats).not.toContain('TAMPERED');
    });

    test('unknown classId is a safe no-op (returns null, mutates nothing)', () => {
        const player = makePlayer();
        const result = applyClass(player, 'NOPE');
        expect(result).toBeNull();
        expect(player.classId).toBeUndefined();
        expect(player.classFavoredStats).toBeUndefined();
        expect(player.classMechanicId).toBeUndefined();
        expect(player.signatureAbility).toBeUndefined();
        expect(player.equippedAbilities).toEqual([null, null, null, null]);
    });

    test('null player is a safe no-op (returns null, does not throw)', () => {
        expect(applyClass(null, 'STRIKER')).toBeNull();
    });
});

describe('classStatBonus', () => {
    test('returns CLASS_STAT_LEAN_PCT for a favored stat', () => {
        const player = makePlayer();
        applyClass(player, 'STRIKER'); // favors CRIT_CHANCE / CRIT_DAMAGE
        expect(classStatBonus(player, 'CRIT_CHANCE')).toBe(CLASS_STAT_LEAN_PCT);
        expect(classStatBonus(player, 'CRIT_DAMAGE')).toBe(CLASS_STAT_LEAN_PCT);
    });

    test('returns 0 for a non-favored stat', () => {
        const player = makePlayer();
        applyClass(player, 'STRIKER');
        expect(classStatBonus(player, 'HEALTH')).toBe(0);
        expect(classStatBonus(player, 'SPEED')).toBe(0);
    });

    test('returns 0 when no class is applied', () => {
        const player = makePlayer();
        expect(classStatBonus(player, 'CRIT_CHANCE')).toBe(0);
    });

    test('returns 0 for a null player', () => {
        expect(classStatBonus(null, 'CRIT_CHANCE')).toBe(0);
    });
});

describe('clearClass', () => {
    test('resets every class field', () => {
        const player = makePlayer();
        applyClass(player, 'BULWARK');
        clearClass(player);

        expect(player.classId).toBeNull();
        expect(player.classFavoredStats).toEqual([]);
        expect(player.classMechanicId).toBeNull();
        expect(player.signatureAbility).toBeNull();
    });

    test('leaves equippedAbilities untouched', () => {
        const player = makePlayer();
        applyClass(player, 'BULWARK');
        clearClass(player);
        expect(player.equippedAbilities).toEqual([null, null, null, null]);
    });

    test('null player is a safe no-op (does not throw)', () => {
        expect(() => clearClass(null)).not.toThrow();
    });

    test('after clearing, classStatBonus returns 0 for the old favored stat', () => {
        const player = makePlayer();
        applyClass(player, 'STRIKER');
        clearClass(player);
        expect(classStatBonus(player, 'CRIT_CHANCE')).toBe(0);
    });
});
