// Phase R2 — Armory economy unit tests (pure functions, no DOM).
import {
    BASE_LOADOUT, UNLOCK_CATEGORIES, unlockCost, getUnlockedSet, isUnlocked,
    getLockedIds, canUnlock, applyUnlock, bankRunGold, resolveAccountGold,
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
        const gold = 5000;
        const out = applyUnlock('primaries', 'STORM_NEEDLES', meta, gold);
        expect(out.ok).toBe(true);
        expect(out.accountGold).toBe(5000 - unlockCost('primaries'));
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
        expect(resolveAccountGold(null)).toBe(0);
        expect(resolveAccountGold({})).toBe(0);
    });
});
