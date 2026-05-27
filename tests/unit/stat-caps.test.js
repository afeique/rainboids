// T35 — global stat caps. Gear amplification (T26) + the class favored-stat
// lens (T33) can push an SP stat high; these ceilings keep DODGE / VAMPIRISM /
// THORNS bounded. (CRIT 60% / CRIT-dmg 550% / TOUGHNESS 75% are already capped
// at their progression getters.) getSpStatValue is stubbed to a large amplified
// value to prove the cap engages; a small value proves it doesn't over-cap.

import { describe, expect, test } from '@jest/globals';
import { STAT_CAPS } from '../../js/modules/core/sp-stats.js';
import { applyVampirism, applyThorns } from '../../js/modules/combat/combat-manager.js';

describe('T35 — STAT_CAPS constants', () => {
    test('documented ceilings', () => {
        expect(STAT_CAPS.DODGE).toBe(0.60);
        expect(STAT_CAPS.VAMPIRISM).toBe(0.50);
        expect(STAT_CAPS.THORNS).toBe(2.0);
    });
});

function vampStub(spVamp) {
    return {
        player: {
            getPowerupStacks: () => 0,
            getItemAffixTotal: () => 0,
            getSpStatValue: (id) => (id === 'VAMPIRISM' ? spVamp : 0),
            gainHealth: (amt) => ({ healed: amt }), // capture the intended heal
            x: 0, y: 0, radius: 14,
        },
        createDamageNumber: () => {},
    };
}

describe('T35 — VAMPIRISM lifesteal cap', () => {
    test('a huge amplified VAMPIRISM is capped at 50% of damage dealt', () => {
        // spVamp 200 → raw frac 2.0, capped to STAT_CAPS.VAMPIRISM (0.50).
        expect(applyVampirism.call(vampStub(200), 100)).toBe(50);
    });
    test('a modest VAMPIRISM is NOT capped (proportional)', () => {
        // spVamp 20 → frac 0.20 → 20 of 100.
        expect(applyVampirism.call(vampStub(20), 100)).toBe(20);
    });
});

function thornsStub(spThorns) {
    const captured = {};
    const self = {
        player: {
            getPowerupStacks: () => 0,
            getItemAffixTotal: () => 0,
            getSpStatValue: (id) => (id === 'THORNS' ? spThorns : 0),
            x: 0, y: 0,
        },
    };
    const target = { health: 100000, x: 10, y: 10, takeDamage(dmg) { captured.dmg = dmg; return false; } };
    return { self, target, captured };
}

describe('T35 — THORNS reflect cap', () => {
    test('a huge amplified THORNS reflect is capped at 200% of damage taken', () => {
        const { self, target, captured } = thornsStub(500); // raw frac 5.0 → cap 2.0
        applyThorns.call(self, 100, target);
        expect(captured.dmg).toBe(200); // 100 × 2.0
    });
    test('a modest THORNS reflect is NOT capped', () => {
        const { self, target, captured } = thornsStub(50); // frac 0.5
        applyThorns.call(self, 100, target);
        expect(captured.dmg).toBe(50);
    });
});
