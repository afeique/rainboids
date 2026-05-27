// Phase R2 — Armory economy unit tests (pure functions, no DOM).
import {
    BASE_LOADOUT, UNLOCK_CATEGORIES, unlockCost, getUnlockedSet, isUnlocked,
    getLockedIds, canUnlock, applyUnlock, applyResell, bankRunGold, resolveAccountGold,
    STARTER_ACCOUNT_GOLD, STARTER_UNLOCKS, newAccountSeed,
} from '../../js/modules/shop/armory.js';

describe('Armory economy — unlock sets', () => {
    test('base loadout is always unlocked even with empty meta', () => {
        // 6.x — base kit is Pulse + Charge ONLY; abilities are now all locked.
        expect(isUnlocked('primaries', 'PULSE_CANNON', {})).toBe(true);
        expect(isUnlocked('powers', 'CHARGE_SHOT', null)).toBe(true);
    });

    test('abilities have no free base kit — all start locked', () => {
        expect(BASE_LOADOUT.abilities).toEqual([]);
        expect(isUnlocked('abilities', 'BULWARK', {})).toBe(false);
        expect(isUnlocked('abilities', 'FIELD_MEDIC', {})).toBe(false);
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

    test('weapons + abilities are flat 10k; attunements are cheaper', () => {
        expect(unlockCost('primaries')).toBe(10000);
        expect(unlockCost('powers')).toBe(10000);
        expect(unlockCost('abilities')).toBe(10000);
        expect(unlockCost('attunements')).toBeLessThan(unlockCost('primaries'));
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

describe('Armory economy — resell (100% refund)', () => {
    test('reselling a purchased weapon refunds the full cost and removes it', () => {
        const meta = { unlockedPrimaries: ['STORM_NEEDLES'] };
        const out = applyResell('primaries', 'STORM_NEEDLES', meta, 0);
        expect(out.ok).toBe(true);
        expect(out.refund).toBe(unlockCost('primaries'));
        expect(out.accountGold).toBe(unlockCost('primaries'));
        expect(out.meta.unlockedPrimaries).not.toContain('STORM_NEEDLES');
        // buy → sell is gold-neutral
        expect(out.accountGold).toBe(applyUnlock('primaries', 'STORM_NEEDLES', {}, unlockCost('primaries')).accountGold + unlockCost('primaries'));
    });

    test('cannot resell the base kit', () => {
        const out = applyResell('primaries', 'PULSE_CANNON', {}, 500);
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('base');
        expect(out.accountGold).toBe(500);
    });

    test('reselling a not-owned id is a no-op', () => {
        const out = applyResell('powers', 'NOVA_BLAST', {}, 500);
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('not-owned');
        expect(out.accountGold).toBe(500);
    });

    test('does not mutate the input meta', () => {
        const meta = { unlockedPowers: ['NOVA_BLAST'] };
        applyResell('powers', 'NOVA_BLAST', meta, 0);
        expect(meta.unlockedPowers).toEqual(['NOVA_BLAST']);
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

describe('Armory economy — new-account seed (locked-down)', () => {
    test('a brand-new account starts with zero gold and no extra unlocks', () => {
        // 6.x — the early-engagement starter grant was removed: run 1 is
        // Pulse + Charge only, everything else earned + purchased.
        expect(STARTER_ACCOUNT_GOLD).toBe(0);
        expect(STARTER_UNLOCKS).toEqual({});
        const seed = newAccountSeed();
        expect(seed.accountGold).toBe(0);
        expect(seed.unlockedPrimaries).toBeUndefined();
        expect(seed.unlockedPowers).toBeUndefined();
        expect(seed.unlockedAbilities).toBeUndefined();
    });

    test('a fresh account can only equip the base kit', () => {
        const meta = newAccountSeed();
        expect([...getUnlockedSet('primaries', meta)]).toEqual(['PULSE_CANNON']);
        expect([...getUnlockedSet('powers', meta)]).toEqual(['CHARGE_SHOT']);
        expect([...getUnlockedSet('abilities', meta)]).toEqual([]);
    });
});
