// 8.24.0 — Keystone TRAITS: picked at level milestones (L10/L20), claimed on
// the dedicated Keystone Traits screen (a choice, not an auto-grant).
//
// Reaching L10 grants one keystone pick; L20 grants a second (2 total, matching
// KEYSTONE_BUDGET). A pick is spent via claimKeystone() — which owns + equips the
// chosen keystone and decrements the pick. Per-run + in-memory.

import { describe, expect, test } from '@jest/globals';
import { grantLevelUnlocks } from '../../js/modules/player/progression.js';
import { claimKeystone } from '../../js/modules/player/passives.js';
import { KEYSTONE_PICK_LEVELS } from '../../js/modules/core/sp-stats.js';
import { getKeystonePassives, getModularSlotPassives } from '../../js/modules/combat/passive-data.js';

function stub(level) {
    return {
        level,
        ownedAbilities: new Set(),
        equippedAbilities: [null, null, null, null],
        ownedPassives: new Set(),
        equippedPassives: [null, null, null, null, null],
        passiveSlotsUnlocked: 5,
        activeAbility: null,
        keystonePicksAvailable: 0,
        _keystonePicksGranted: new Set(),
        _rebuildActivePassives() {},
    };
}

describe('KEYSTONE_PICK_LEVELS', () => {
    test('two picks, at L10 and L20', () => {
        expect(KEYSTONE_PICK_LEVELS).toEqual([10, 20]);
    });
});

describe('keystone-pick grants (grantLevelUnlocks)', () => {
    test('no keystone pick below L10', () => {
        const p = stub(9);
        grantLevelUnlocks.call(p);
        expect(p.keystonePicksAvailable).toBe(0);
    });
    test('one pick at L10', () => {
        const p = stub(10);
        grantLevelUnlocks.call(p);
        expect(p.keystonePicksAvailable).toBe(1);
    });
    test('two picks by L20', () => {
        const p = stub(20);
        grantLevelUnlocks.call(p);
        expect(p.keystonePicksAvailable).toBe(2);
    });
    test('idempotent — re-running at the same level does not double-grant', () => {
        const p = stub(20);
        grantLevelUnlocks.call(p);
        grantLevelUnlocks.call(p);
        expect(p.keystonePicksAvailable).toBe(2);
    });
});

describe('claimKeystone', () => {
    const KEY = getKeystonePassives()[0].id; // a real keystone id

    test('a pick claims a keystone: owns + equips + spends the pick', () => {
        const p = stub(10);
        grantLevelUnlocks.call(p); // 1 pick
        const ok = claimKeystone.call(p, KEY);
        expect(ok).toBe(true);
        expect(p.ownedPassives.has(KEY)).toBe(true);
        expect(p.equippedPassives).toContain(KEY);
        expect(p.keystonePicksAvailable).toBe(0);
    });

    test('no pick banked → claim fails (stays locked)', () => {
        const p = stub(5);
        expect(claimKeystone.call(p, KEY)).toBe(false);
        expect(p.ownedPassives.has(KEY)).toBe(false);
    });

    test('a modular passive is NOT claimable as a keystone', () => {
        const p = stub(10);
        grantLevelUnlocks.call(p);
        const modular = getModularSlotPassives()[0].id;
        expect(claimKeystone.call(p, modular)).toBe(false);
        expect(p.keystonePicksAvailable).toBe(1); // pick not spent
    });

    test('the budget (2) holds: a third claimed keystone is owned but not equipped', () => {
        const p = stub(5);
        p.keystonePicksAvailable = 3; // grant picks directly (skip the modular-passive grants)
        const keys = getKeystonePassives().map((k) => k.id);
        claimKeystone.call(p, keys[0]);
        claimKeystone.call(p, keys[1]);
        claimKeystone.call(p, keys[2]);
        expect(p.ownedPassives.size).toBe(3);                       // all three claimed
        expect(p.equippedPassives.filter(Boolean).length).toBe(2);  // only two fit (KEYSTONE_BUDGET)
    });
});
