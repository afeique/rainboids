// Phase P7 — gear-roll passive delivery. Pins (a) which passives are eligible to
// roll on gear by rarity (modular on Exceptional+, keystone only on
// Transcendental) and (b) that equipped-item passives union into activePassives
// without consuming a slot (Set dedup = binary "no double").
import { describe, expect, test } from '@jest/globals';
import { eligibleItemPassives } from '../../js/modules/world/item-system.js';
import * as passives from '../../js/modules/player/passives.js';
import { PASSIVES } from '../../js/modules/combat/passive-data.js';

describe('eligibleItemPassives — rarity gating', () => {
    test('common / rare gear roll no passives', () => {
        expect(eligibleItemPassives('common')).toEqual([]);
        expect(eligibleItemPassives('rare')).toEqual([]);
    });

    test('Exceptional+ gear can roll modular passives, not Transcendental keystones', () => {
        const ids = eligibleItemPassives('exceptional').map((p) => p.id);
        expect(ids).toContain('CATALYST');       // modular, itemTierMin exceptional
        expect(ids).toContain('OPPORTUNIST');
        expect(ids).not.toContain('TWIN_CAST');  // keystone, itemTierMin transcendental
        expect(ids).not.toContain('GLASS_CANNON');     // keystone, slot-only (item:false)
    });

    test('Transcendental gear can also roll the chase keystones', () => {
        // §6c batch 5 — BERSERKERS_PACT (the former transcendental item keystone)
        // was merged into GLASS_CANNON and removed; TWIN_CAST is now the
        // representative transcendental chase keystone.
        const ids = eligibleItemPassives('transcendental').map((p) => p.id);
        expect(ids).toContain('CATALYST');     // modular still eligible
        expect(ids).toContain('TWIN_CAST');    // transcendental keystone now allowed
    });

    test('every eligible passive is item-deliverable (item: true)', () => {
        for (const r of ['exceptional', 'legendary', 'transcendental']) {
            for (const p of eligibleItemPassives(r)) expect(p.item).toBe(true);
        }
    });
});

describe('_rebuildActivePassives — gear union (P7)', () => {
    function stub(over = {}) {
        return {
            equippedPassives: [null, null, null, null, null],
            ownedPassives: new Set(),
            activePassives: new Set(),
            passiveSlotsUnlocked: 1,
            equippedItems: {},
            ...over,
        };
    }

    test('a gear-borne passive activates without a slot', () => {
        const s = stub({ equippedItems: { hull: { passive: 'CATALYST' } } });
        passives._rebuildActivePassives.call(s);
        expect(s.activePassives.has('CATALYST')).toBe(true);
        expect(passives.hasPassive.call(s, 'CATALYST')).toBe(true);
        // slot 0 is still free (gear didn't consume it)
        expect(s.equippedPassives[0]).toBeNull();
    });

    test('same passive from gear AND a slot is active ONCE (binary, no double)', () => {
        const s = stub({
            equippedPassives: ['OPPORTUNIST', null, null, null, null],
            ownedPassives: new Set(['OPPORTUNIST']),
            equippedItems: { hull: { passive: 'OPPORTUNIST' } },
        });
        passives._rebuildActivePassives.call(s);
        expect([...s.activePassives]).toEqual(['OPPORTUNIST']); // exactly one
    });

    test('unknown / missing gear passive ids are ignored', () => {
        const s = stub({ equippedItems: { hull: { passive: 'NOPE' }, cockpit: {} } });
        passives._rebuildActivePassives.call(s);
        expect(s.activePassives.size).toBe(0);
    });

    test('a gear-borne damageMult passive feeds getPassiveDamageMult', () => {
        // CATALYST has no damageMult; use a known mult passive that is item-eligible?
        // GLASS_CANNON is slot-only, so simulate via a temp mult on CATALYST.
        PASSIVES.CATALYST.damageMult = 1.2;
        try {
            const s = stub({ equippedItems: { hull: { passive: 'CATALYST' } } });
            passives._rebuildActivePassives.call(s);
            expect(passives.getPassiveDamageMult.call(s)).toBeCloseTo(1.2);
        } finally {
            delete PASSIVES.CATALYST.damageMult;
        }
    });
});
