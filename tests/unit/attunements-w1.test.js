/**
 * tests/unit/attunements-w1.test.js — Phase W1 (Weapon Attunements data model).
 *
 * Pins the pure element helpers (multiElementMultiplier / resolveBulletElements),
 * the ATTUNEMENTS data table + per-weapon lists, and the multi-element damage
 * SPLIT through applyDamageToEnemy (averaged resist multiplier = focus vs
 * coverage). Single-element / legacy callers must be unchanged.
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import {
    multiElementMultiplier, resolveBulletElements, elementalMultiplier,
    isElement, ELEMENT_IDS,
} from '../../js/modules/combat/elements.js';
import {
    ATTUNEMENTS, getAttunementsForWeapon, attunementElements,
    PRIMARY_WEAPONS, POWER_WEAPONS,
} from '../../js/modules/combat/weapon-data.js';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

const CTX = {};
function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {}, armor: 0,
        corrodeStacks: 0, corrodeUntil: 0, conductUntil: 0, frontalShield: null,
        adaptive: false, ...extra,
    };
}
beforeEach(() => { frameClock.now = 10000; });

describe('multiElementMultiplier (pure — the damage-split lever)', () => {
    test('no elements → neutral 1', () => {
        expect(multiElementMultiplier({}, [])).toBe(1);
        expect(multiElementMultiplier({ PYRO: 0.5 }, null)).toBe(1);
    });

    test('single element equals elementalMultiplier', () => {
        const resist = { PYRO: 0.5, CRYO: -0.5 };
        expect(multiElementMultiplier(resist, ['PYRO'])).toBe(elementalMultiplier(resist, 'PYRO'));
        expect(multiElementMultiplier(resist, ['CRYO'])).toBe(elementalMultiplier(resist, 'CRYO'));
    });

    test('two elements average their multipliers (focus vs coverage)', () => {
        // PYRO resisted (×0.5), CRYO weakness (×1.5) → average 1.0.
        expect(multiElementMultiplier({ PYRO: 0.5, CRYO: -0.5 }, ['PYRO', 'CRYO'])).toBeCloseTo(1.0);
    });

    test('a single resisted element hurts; coverage dilutes the resist', () => {
        const resist = { PYRO: 1 }; // immune to PYRO (×0)
        expect(multiElementMultiplier(resist, ['PYRO'])).toBe(0);          // hard-walled
        expect(multiElementMultiplier(resist, ['PYRO', 'VOLT'])).toBe(0.5); // never hard-walled
    });

    test('coverage also dilutes a single weakness spike', () => {
        const resist = { CRYO: -1 }; // double damage from CRYO (clamped ×2)
        expect(multiElementMultiplier(resist, ['CRYO'])).toBe(2);            // full spike
        expect(multiElementMultiplier(resist, ['CRYO', 'PYRO'])).toBe(1.5);  // diluted
    });
});

describe('resolveBulletElements (pure — element priority)', () => {
    test('an override element replaces the whole set', () => {
        expect(resolveBulletElements('PYRO', ['CRYO', 'VOLT'], 'KINETIC')).toEqual(['PYRO']);
    });
    test('attunement elements (deduped, order-preserved) when no override', () => {
        expect(resolveBulletElements(null, ['CRYO', 'PYRO', 'CRYO'], 'KINETIC')).toEqual(['CRYO', 'PYRO']);
    });
    test('falls back to the base element when no attunements', () => {
        expect(resolveBulletElements(null, [], 'VOLT')).toEqual(['VOLT']);
        expect(resolveBulletElements(null, null, 'RADIANT')).toEqual(['RADIANT']);
    });
    test('falls back to KINETIC when nothing is set', () => {
        expect(resolveBulletElements(null, [], null)).toEqual(['KINETIC']);
    });
});

describe('ATTUNEMENTS table + per-weapon lists', () => {
    test('every weapon with attunements has well-formed entries', () => {
        for (const a of Object.values(ATTUNEMENTS)) {
            expect(typeof a.id).toBe('string');
            expect(typeof a.name).toBe('string');
            expect(typeof a.weapon).toBe('string');
            expect(isElement(a.element)).toBe(true);
            expect(a.id).toBe(`${a.weapon}_${a.id.slice(a.weapon.length + 1)}`);
        }
    });

    test('per-weapon counts match the design (sample)', () => {
        expect(getAttunementsForWeapon('PULSE_CANNON')).toHaveLength(6);
        expect(getAttunementsForWeapon('SPIN_CANNON')).toHaveLength(3);
        expect(getAttunementsForWeapon('CRYO_BURST')).toHaveLength(3);
        expect(getAttunementsForWeapon('PRISM_BEAM')).toHaveLength(4);
    });

    test('every primary and power weapon has at least one attunement', () => {
        for (const id of Object.keys(PRIMARY_WEAPONS)) {
            expect(getAttunementsForWeapon(id).length).toBeGreaterThan(0);
        }
        for (const id of Object.keys(POWER_WEAPONS)) {
            expect(getAttunementsForWeapon(id).length).toBeGreaterThan(0);
        }
    });

    test('attunementElements maps ids → elements (skips unknown)', () => {
        expect(attunementElements(['PULSE_CANNON_PYRO', 'PULSE_CANNON_CRYO'])).toEqual(['PYRO', 'CRYO']);
        expect(attunementElements(['PULSE_CANNON_PYRO', 'NOPE'])).toEqual(['PYRO']);
        expect(attunementElements(null)).toEqual([]);
    });

    test('Prism has two distinct RADIANT attunements (Spectrum + Focused)', () => {
        const radiant = getAttunementsForWeapon('PRISM_BEAM').filter((a) => a.element === 'RADIANT');
        expect(radiant.map((a) => a.id).sort()).toEqual(['PRISM_BEAM_FOCUSED', 'PRISM_BEAM_SPECTRUM']);
    });
});

describe('multi-element damage split through applyDamageToEnemy', () => {
    test('single element resist behaves exactly as before', () => {
        const e = mkEnemy({ resist: { PYRO: 0.5 } });
        applyDamageToEnemy.call(CTX, e, 100, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(50); // ×0.5
    });

    test('opts.elements averages the resist multiplier', () => {
        const e = mkEnemy({ resist: { PYRO: 0.5, CRYO: -0.5 } });
        applyDamageToEnemy.call(CTX, e, 100, { elements: ['PYRO', 'CRYO'], showNumber: false });
        expect(e.health).toBeCloseTo(0); // avg(0.5,1.5)=1.0 → 100 dmg
    });

    test('coverage cannot be hard-walled by one immunity', () => {
        const e = mkEnemy({ resist: { PYRO: 1 } }); // PYRO immune
        applyDamageToEnemy.call(CTX, e, 100, { elements: ['PYRO'], showNumber: false });
        expect(e.health).toBeCloseTo(100); // 0 damage (hard-walled)

        const e2 = mkEnemy({ resist: { PYRO: 1 } });
        applyDamageToEnemy.call(CTX, e2, 100, { elements: ['PYRO', 'VOLT'], showNumber: false });
        expect(e2.health).toBeCloseTo(50); // avg(0,1)=0.5 → still lands
    });

    test('CONDUCT (×1.5) triggers if any active element is VOLT', () => {
        const e = mkEnemy({ conductUntil: frameClock.now + 1000 });
        applyDamageToEnemy.call(CTX, e, 40, { elements: ['CRYO', 'VOLT'], showNumber: false });
        // No resist; avg mult 1.0, then CONDUCT ×1.5 → 60 dmg.
        expect(e.health).toBeCloseTo(40);
    });
});
