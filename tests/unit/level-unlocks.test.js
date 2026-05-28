// 8.15.0 — alternating ability/passive unlocks at level milestones.
//
// Reaching a milestone level grants (and auto-equips) the next ability or
// passive, alternating, during the run. Because leveling is per-run (~1 level /
// 2-3 waves), a short run unlocks only the first few; the full kit (4 abilities +
// 5 passives) only lands across a longer run (all by L21). Per-run + in-memory.

import { describe, expect, test } from '@jest/globals';
import { grantLevelUnlocks } from '../../js/modules/player/progression.js';
import { LEVEL_UNLOCKS } from '../../js/modules/core/sp-stats.js';

function stubPlayer(level) {
    return {
        level,
        ownedAbilities: new Set(),
        equippedAbilities: [null, null, null, null],
        ownedPassives: new Set(),
        equippedPassives: [null, null, null, null, null],
        passiveSlotsUnlocked: 5,
        activeAbility: null,
        _rebuildActivePassives() {},
    };
}

describe('LEVEL_UNLOCKS schedule', () => {
    test('alternates ability/passive: 4 abilities at 5/9/13/17, 5 passives at 7/11/15/19/21', () => {
        const abil = LEVEL_UNLOCKS.filter((u) => u.kind === 'ability');
        const pass = LEVEL_UNLOCKS.filter((u) => u.kind === 'passive');
        expect(abil.map((u) => u.level)).toEqual([5, 9, 13, 17]);
        expect(pass.map((u) => u.level)).toEqual([7, 11, 15, 19, 21]);
        expect(abil.length).toBe(4);
        expect(pass.length).toBe(5);
        // strictly alternating + ascending
        const lv = LEVEL_UNLOCKS.map((u) => u.level);
        for (let i = 1; i < lv.length; i++) expect(lv[i]).toBeGreaterThan(lv[i - 1]);
    });
});

describe('grantLevelUnlocks', () => {
    test('grants nothing below level 5', () => {
        const p = stubPlayer(4);
        grantLevelUnlocks.call(p);
        expect(p.ownedAbilities.size).toBe(0);
        expect(p.ownedPassives.size).toBe(0);
    });

    test('L5 grants + auto-equips the first ability (BULWARK); no passive yet', () => {
        const p = stubPlayer(5);
        grantLevelUnlocks.call(p);
        expect(p.ownedAbilities.has('BULWARK')).toBe(true);
        expect(p.equippedAbilities[0]).toBe('BULWARK');
        expect(p.activeAbility).toBe('BULWARK');
        expect(p.ownedPassives.size).toBe(0);
    });

    test('a short run (L8) unlocks just the first ability + first passive', () => {
        const p = stubPlayer(8);
        grantLevelUnlocks.call(p);
        expect(p.ownedAbilities.size).toBe(1);
        expect(p.ownedPassives.size).toBe(1);
        expect(p.ownedPassives.has('OPPORTUNIST')).toBe(true);
    });

    test('a long run (L21) unlocks all 4 abilities + 5 passives, equipped', () => {
        const p = stubPlayer(21);
        grantLevelUnlocks.call(p);
        expect(p.ownedAbilities.size).toBe(4);
        expect(p.ownedPassives.size).toBe(5);
        expect(p.equippedAbilities.filter(Boolean).length).toBe(4);
        expect(p.equippedPassives.filter(Boolean).length).toBe(5);
    });

    test('idempotent — re-running at the same level does not double-grant', () => {
        const p = stubPlayer(21);
        grantLevelUnlocks.call(p);
        grantLevelUnlocks.call(p);
        expect(p.ownedAbilities.size).toBe(4);
        expect(p.ownedPassives.size).toBe(5);
    });

    test('every scheduled id is a real ability/passive (no typos)', () => {
        const p = stubPlayer(100);
        expect(() => grantLevelUnlocks.call(p)).not.toThrow();
        // all 9 landed → every id resolved to a real entry
        expect(p.ownedAbilities.size + p.ownedPassives.size).toBe(LEVEL_UNLOCKS.length);
    });
});
