/**
 * tests/unit/ability-attunements-w6.test.js — Phase W6 data foundation.
 *
 * Pins the ABILITY_ATTUNEMENTS table + getAbilityAttunements helper + the
 * `abilityAttunements` unlock category. Ability attunements are one-element-
 * at-a-time (the runtime application + BUILD-tree nodes are the follow-up).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { ABILITY_ATTUNEMENTS, getAbilityAttunements, ABILITIES } from '../../js/modules/combat/weapon-data.js';
import { isElement } from '../../js/modules/combat/elements.js';
import { UNLOCK_CATEGORIES } from '../../js/modules/shop/armory.js';

describe('ABILITY_ATTUNEMENTS table', () => {
    test('every entry is well-formed (id/name/element/ability)', () => {
        for (const a of Object.values(ABILITY_ATTUNEMENTS)) {
            expect(typeof a.id).toBe('string');
            expect(typeof a.name).toBe('string');
            expect(typeof a.ability).toBe('string');
            expect(isElement(a.element)).toBe(true);
            expect(a.id).toBe(`${a.ability}_${a.id.slice(a.ability.length + 1)}`);
        }
    });

    test('attunements target real abilities', () => {
        for (const a of Object.values(ABILITY_ATTUNEMENTS)) {
            expect(ABILITIES[a.ability]).toBeTruthy();
        }
    });

    test('per-ability lists match the design (sample)', () => {
        expect(getAbilityAttunements('EMP_PULSE').map((a) => a.element).sort())
            .toEqual(['CRYO', 'PYRO', 'VOID', 'VOLT']);
        expect(getAbilityAttunements('SENTRY_DRONE')).toHaveLength(6);
        expect(getAbilityAttunements('FIELD_MEDIC').map((a) => a.id).sort())
            .toEqual(['FIELD_MEDIC_PYRO', 'FIELD_MEDIC_RADIANT']);
    });

    test('already-elemental abilities have NO attunements (they ARE the element)', () => {
        for (const id of ['CRYO_FIELD', 'STASIS_FIELD', 'STORM_CELL', 'PYRE_AURA', 'ELEMENTAL_INFUSION']) {
            expect(getAbilityAttunements(id)).toHaveLength(0);
        }
    });

    test('unlock category exists for ability attunements', () => {
        expect(UNLOCK_CATEGORIES.abilityAttunements).toBeTruthy();
        expect(UNLOCK_CATEGORIES.abilityAttunements.metaKey).toBe('unlockedAbilityAttunements');
        expect(UNLOCK_CATEGORIES.abilityAttunements.cost).toBeGreaterThan(0);
    });
});
