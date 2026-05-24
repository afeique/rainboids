// Phase P6 — Vendetta passive. The last enemy to damage you takes +30% from you
// until it dies. lifecycle.takeDamage stamps player._vendettaTarget with the
// attacker; vendettaMult applies the bonus on the damage path only to that exact
// enemy. Tests the pure multiplier.
import { describe, expect, test } from '@jest/globals';
import { vendettaMult, VENDETTA_MULT } from '../../js/modules/combat/collision-system.js';

const grudge = { id: 'grudge' };
const other = { id: 'other' };

function player(hasVendetta, target) {
    return {
        hasPassive: (id) => hasVendetta && id === 'VENDETTA',
        _vendettaTarget: target,
    };
}

describe('Vendetta — grudge-target damage bonus', () => {
    test('no passive → always 1', () => {
        expect(vendettaMult(player(false, grudge), grudge)).toBe(1);
    });

    test('passive + hitting the grudge target → VENDETTA_MULT', () => {
        expect(vendettaMult(player(true, grudge), grudge)).toBe(VENDETTA_MULT);
        expect(VENDETTA_MULT).toBeGreaterThan(1);
    });

    test('passive but hitting a DIFFERENT enemy → 1', () => {
        expect(vendettaMult(player(true, grudge), other)).toBe(1);
    });

    test('passive but no grudge target yet → 1', () => {
        expect(vendettaMult(player(true, null), grudge)).toBe(1);
    });

    test('null / malformed player → safe 1 (no throw)', () => {
        expect(vendettaMult(null, grudge)).toBe(1);
        expect(vendettaMult({}, grudge)).toBe(1);
    });
});
