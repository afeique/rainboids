// Phase R2 — Armory economy unit tests (pure functions, no DOM).
import {
    BASE_LOADOUT, UNLOCK_CATEGORIES, unlockCost, getUnlockedSet, isUnlocked,
    getLockedIds, canUnlock, applyUnlock, bankRunGold, resolveAccountGold,
    STARTER_ACCOUNT_GOLD, STARTER_UNLOCKS, newAccountSeed,
} from '../../js/modules/shop/armory.js';

describe('Armory economy — unlock sets', () => {
    test('base loadout is always unlocked even with empty meta', () => {
        expect(isUnlocked('primaries', 'PULSE_CANNON', {})).toBe(true);
        expect(isUnlocked('powers', 'CHARGE_SHOT', null)).toBe(true);
        expect(isUnlocked('abilities', 'BULWARK', {})).toBe(true);
    });

    test('non-base items start locked', () => {
        expect(isUnlocked('primaries', 'STORM_NEEDLES', {})).toBe(false);
    });

    test('purchased items join the unlocked set', () => {
        const meta = { unlockedPrimaries: ['STORM_NEEDLES'] };
        const set = getUnlockedSet('primaries', meta);
        expect(set.has('PULSE_CANNON')).toBe(true); // base preserved
        expect(set.has('STORM_NEEDLES')).toBe(true);
    });

    test('getLockedIds excludes base + purchased', () => {
        const all = ['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN'];
        const meta = { unlockedPrimaries: ['STORM_NEEDLES'] };
        expect(getLockedIds('primaries', all, meta)).toEqual(['SCATTER_GUN']);
    });

    test('abilities cost more than weapons', () => {
        expect(unlockCost('abilities')).toBeGreaterThan(unlockCost('powers'));
        expect(unlockCost('powers')).toBeGreaterThan(unlockCost('primaries'));
    });
});

describe('Armory economy — purchasing', () => {
    test('canUnlock rejects when too poor', () => {
        const r = canUnlock('primaries', 'STORM_NEEDLES', {}, 100);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('poor');
    });

    test('canUnlock rejects already-owned', () => {
        const r = canUnlock('primaries', 'PULSE_CANNON', {}, 999999);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('owned');
    });

    test('canUnlock accepts when affordable + locked', () => {
        const r = canUnlock('primaries', 'STORM_NEEDLES', {}, unlockCost('primaries'));
        expect(r.ok).toBe(true);
    });

    test('applyUnlock deducts gold and records the unlock (immutably)', () => {
        const meta = {};
        const gold = 20000;
        const out = applyUnlock('primaries', 'STORM_NEEDLES', meta, gold);
        expect(out.ok).toBe(true);
        expect(out.accountGold).toBe(20000 - unlockCost('primaries'));
        expect(out.meta.unlockedPrimaries).toContain('STORM_NEEDLES');
        // original inputs untouched
        expect(meta.unlockedPrimaries).toBeUndefined();
    });

    test('applyUnlock is a no-op when unaffordable', () => {
        const out = applyUnlock('abilities', 'BLINK', {}, 10);
        expect(out.ok).toBe(false);
        expect(out.accountGold).toBe(10);
        expect(out.meta.unlockedAbilities).toBeUndefined();
    });

    test('double-buy does not double-charge', () => {
        let { meta, accountGold } = { meta: {}, accountGold: 10000 };
        ({ meta, accountGold } = applyUnlock('powers', 'NOVA_BLAST', meta, accountGold));
        const afterFirst = accountGold;
        const second = applyUnlock('powers', 'NOVA_BLAST', meta, accountGold);
        expect(second.ok).toBe(false);
        expect(second.reason).toBe('owned');
        expect(accountGold).toBe(afterFirst);
    });
});

describe('Armory economy — banking + migration', () => {
    test('bankRunGold adds run-gold to the wallet', () => {
        expect(bankRunGold(1000, 350)).toBe(1350);
    });

    test('bankRunGold floors negatives at 0', () => {
        expect(bankRunGold(-5, -10)).toBe(0);
        expect(bankRunGold(100, -10)).toBe(100);
    });

    test('resolveAccountGold reads accountGold directly', () => {
        expect(resolveAccountGold({ accountGold: 4200 })).toBe(4200);
    });

    test('resolveAccountGold migrates legacy money wallet', () => {
        expect(resolveAccountGold({ money: 777 })).toBe(777);
    });

    test('resolveAccountGold prefers accountGold over legacy money', () => {
        expect(resolveAccountGold({ accountGold: 50, money: 9999 })).toBe(50);
    });

    test('resolveAccountGold defaults to 0', () => {
        // resolveAccountGold stays a PURE meta read (no implicit starter grant);
        // the new-account seed is applied explicitly at engine boot, not here.
        expect(resolveAccountGold(null)).toBe(0);
        expect(resolveAccountGold({})).toBe(0);
    });
});

describe('Armory economy — new-account starter seed (early-engagement)', () => {
    test('starter gold sits below the cheapest unlock so it cannot be spent directly', () => {
        const cheapestUnlock = Math.min(...Object.values(UNLOCK_CATEGORIES).map((c) => c.cost));
        expect(STARTER_ACCOUNT_GOLD).toBeGreaterThan(0);
        expect(STARTER_ACCOUNT_GOLD).toBeLessThan(cheapestUnlock);
    });

    test('newAccountSeed bundles the starter gold + the starter unlocks', () => {
        const seed = newAccountSeed();
        expect(seed.accountGold).toBe(STARTER_ACCOUNT_GOLD);
        expect(seed.unlockedPrimaries).toEqual(STARTER_UNLOCKS.unlockedPrimaries);
        expect(seed.unlockedPowers).toEqual(STARTER_UNLOCKS.unlockedPowers);
        expect(seed.unlockedAbilities).toEqual(STARTER_UNLOCKS.unlockedAbilities);
    });

    test('seeded unlocks are NOT base — they only widen a fresh account', () => {
        // The always-free floor is unchanged; the seed adds purchasable items on top.
        for (const id of STARTER_UNLOCKS.unlockedPrimaries) {
            expect(BASE_LOADOUT.primaries).not.toContain(id);
            expect(isUnlocked('primaries', id, {})).toBe(false);          // locked with empty meta
            expect(isUnlocked('primaries', id, newAccountSeed())).toBe(true); // unlocked once seeded
        }
        expect(isUnlocked('powers', 'MINE_LAYER', {})).toBe(false);
        expect(isUnlocked('powers', 'MINE_LAYER', newAccountSeed())).toBe(true);
        expect(isUnlocked('abilities', 'DEFLECTOR_ORBS', {})).toBe(false);
        expect(isUnlocked('abilities', 'DEFLECTOR_ORBS', newAccountSeed())).toBe(true);
    });

    test('a seeded account can choose from a real opening fork (base ∪ seeded)', () => {
        const meta = newAccountSeed();
        const primaries = getUnlockedSet('primaries', meta);
        expect(primaries.has('PULSE_CANNON')).toBe(true); // base
        expect(primaries.has('SCATTER_GUN')).toBe(true);  // seeded
        expect(primaries.has('RAIL_DRIVER')).toBe(true);  // seeded
        expect(primaries.size).toBeGreaterThanOrEqual(3);
    });
});
