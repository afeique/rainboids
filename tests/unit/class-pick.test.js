// T33 — class pick at run start: every class's signature ability resolves in
// ABILITIES (granted free), the 6 new signatures are free + class-tagged, and
// the favored-stat lens folds into the level-ramped SP amplification.

import { describe, expect, test } from '@jest/globals';
import { ABILITIES } from '../../js/modules/combat/weapon-data.js';
import { CLASSES } from '../../js/modules/player/classes.js';
import { applyClass } from '../../js/modules/player/class-system.js';
import { getEffectiveMaxHealth } from '../../js/modules/player/progression.js';
import { LEVEL_SOFTCAP } from '../../js/modules/core/gear-scaling.js';

const NEW_SIGNATURES = ['OVERDRIVE_BURST', 'FORTRESS', 'HARVEST', 'SLIPSTREAM', 'ELEMENTAL_NOVA', 'JACKPOT'];

function makePlayer({ spStats = {}, level = 1 } = {}) {
    return {
        maxHealth: 40,
        spStats,
        equippedItems: {},
        level,
        getPowerupStacks: () => 0,
        getPassiveMod: () => 0,
        getPassiveMaxHpMult: () => 1,
    };
}

describe('T33 — signature abilities are registered', () => {
    test('every class signatureAbilityId resolves to a real ABILITIES entry', () => {
        for (const c of Object.values(CLASSES)) {
            const def = ABILITIES[c.signatureAbilityId];
            expect(def).toBeTruthy();
            expect(def.id).toBe(c.signatureAbilityId);
        }
    });

    test('the 6 new signatures are FREE (cost 0) + tagged to a real class', () => {
        for (const id of NEW_SIGNATURES) {
            expect(ABILITIES[id]).toBeTruthy();
            expect(ABILITIES[id].cost).toBe(0);
            expect(CLASSES[ABILITIES[id].signatureOf]).toBeTruthy();
        }
    });

    test('ENGINEER reuses the existing SENTRY_DRONE (not a new id)', () => {
        expect(CLASSES.ENGINEER.signatureAbilityId).toBe('SENTRY_DRONE');
        expect(ABILITIES.SENTRY_DRONE).toBeTruthy();
    });
});

describe('T33 — favored-stat lens amplifies the class stats', () => {
    test('a class that favors HEALTH amplifies it (+20%, level-ramped)', () => {
        const p = makePlayer({ spStats: { HEALTH: 5 }, level: LEVEL_SOFTCAP }); // SP HEALTH = 200
        applyClass(p, 'BULWARK'); // favoredStats include HEALTH
        // base 40 + 200 × (1 + 0.20) = 40 + 240 = 280
        expect(getEffectiveMaxHealth.call(p)).toBe(280);
    });

    test('a non-favored stat gets no lens', () => {
        const p = makePlayer({ spStats: { HEALTH: 5 }, level: LEVEL_SOFTCAP });
        applyClass(p, 'STRIKER'); // favors CRIT, not HEALTH
        expect(getEffectiveMaxHealth.call(p)).toBe(40 + 200); // raw SP, no lens
    });

    test('no class → no lens (default-safe)', () => {
        const p = makePlayer({ spStats: { HEALTH: 5 }, level: LEVEL_SOFTCAP });
        expect(getEffectiveMaxHealth.call(p)).toBe(40 + 200);
    });

    test('the lens is dormant at level 1 (ramps with the run, like gear)', () => {
        const p = makePlayer({ spStats: { HEALTH: 5 }, level: 1 }); // 5 pts (half 10-cap) → 200 raw HP
        applyClass(p, 'BULWARK');
        // levelRamp(1) = 0 → lens contributes nothing yet
        expect(getEffectiveMaxHealth.call(p)).toBe(40 + 200);
    });
});
