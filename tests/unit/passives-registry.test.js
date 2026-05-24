// Phase P1 — the shared PASSIVES registry (rule-modifier layer) + the
// `passives` unlock category. Pins the registry shape, delivery metadata,
// and the catalog so P6 (consumers) / P7 (item+card delivery) build on a
// stable foundation. Data-only module — no browser shims needed.
import { describe, expect, test } from '@jest/globals';
import {
    PASSIVES, PASSIVE_STACK, PASSIVE_ITEM_TIER,
    getPassive, getAllPassives, getSlotPassives, getItemPassives,
    MAX_PASSIVE_SLOTS, maxPassiveSlots, passiveSlotsUnlockedAfter,
} from '../../js/modules/combat/passive-data.js';
import { UNLOCK_CATEGORIES, getUnlockedSet } from '../../js/modules/shop/armory.js';
import { RARITY_ORDER } from '../../js/modules/world/item-names.js';

const STACKS = new Set(Object.values(PASSIVE_STACK));

describe('PASSIVES registry — shape & delivery metadata', () => {
    test('is a non-empty object', () => {
        expect(PASSIVES && typeof PASSIVES).toBe('object');
        expect(Object.keys(PASSIVES).length).toBeGreaterThan(0);
    });

    test('every entry is well-formed', () => {
        for (const [key, p] of Object.entries(PASSIVES)) {
            expect(p.id).toBe(key);                       // key matches id
            expect(typeof p.name).toBe('string');
            expect(p.name.length).toBeGreaterThan(0);
            expect(typeof p.desc).toBe('string');
            expect(p.desc.length).toBeGreaterThan(0);
            expect(Array.isArray(p.hooks)).toBe(true);
            expect(p.hooks.length).toBeGreaterThan(0);
            expect(Array.isArray(p.tags)).toBe(true);
            expect(p.tags.length).toBeGreaterThan(0);
            expect(STACKS.has(p.stack)).toBe(true);       // binary | additive
            // Reachable by at least one delivery channel.
            expect(p.slot === true || p.item === true).toBe(true);
            // item-deliverable entries name a valid min rarity tier.
            if (p.item) {
                expect(typeof p.itemTierMin).toBe('string');
                expect(RARITY_ORDER).toContain(p.itemTierMin);
            }
            // downside, when present, is a non-empty string.
            if ('downside' in p) {
                expect(typeof p.downside).toBe('string');
                expect(p.downside.length).toBeGreaterThan(0);
            }
        }
    });

    test('keystones (binary, build-defining) include the design set', () => {
        for (const id of ['GLASS_CANNON', 'BERSERKERS_PACT', 'GUNSLINGER', 'PURIST',
            'TWIN_CAST', 'PRISMATIC_SOUL', 'OVERFLOW_CAPACITOR', 'KILLING_SPREE',
            'ONE_WITH_THE_VOID', 'SECOND_HEART']) {
            expect(PASSIVES[id]).toBeDefined();
            expect(PASSIVES[id].tags).toContain('keystone');
            expect(PASSIVES[id].stack).toBe(PASSIVE_STACK.BINARY);
            expect(PASSIVES[id].slot).toBe(true);
        }
    });

    test('harsh-downside keystones are slot-only (never roll on gear)', () => {
        // You should never accidentally roll "can't crit" / "no power weapons"
        // on a helmet — those keystones are slot-only.
        for (const id of ['GLASS_CANNON', 'GUNSLINGER', 'PURIST']) {
            expect(PASSIVES[id].item).toBe(false);
        }
    });

    test('modular item-roll passives are gated to Exceptional+', () => {
        for (const id of ['CATALYST', 'OPPORTUNIST', 'PREDATOR', 'LAST_BASTION']) {
            expect(PASSIVES[id].item).toBe(true);
            expect(PASSIVES[id].itemTierMin).toBe(PASSIVE_ITEM_TIER.EXCEPTIONAL);
        }
    });

    test('economy passives respect their delivery channel', () => {
        expect(PASSIVES.SALVAGE_PROTOCOL.slot).toBe(false); // item-only
        expect(PASSIVES.SALVAGE_PROTOCOL.item).toBe(true);
        expect(PASSIVES.SCAVENGER.slot).toBe(true);          // slot-only
        expect(PASSIVES.SCAVENGER.item).toBe(false);
        expect(PASSIVES.HOARDERS_GREED.slot).toBe(true);
        expect(PASSIVES.HOARDERS_GREED.item).toBe(false);
    });

    test('helpers partition the catalog by delivery channel', () => {
        expect(getPassive('GLASS_CANNON')).toBe(PASSIVES.GLASS_CANNON);
        expect(getPassive('NOPE')).toBeNull();
        const all = getAllPassives();
        expect(all.length).toBe(Object.keys(PASSIVES).length);
        expect(getSlotPassives().every((p) => p.slot)).toBe(true);
        expect(getItemPassives().every((p) => p.item)).toBe(true);
        // SALVAGE_PROTOCOL is item-only → in item set, not slot set.
        expect(getItemPassives().map((p) => p.id)).toContain('SALVAGE_PROTOCOL');
        expect(getSlotPassives().map((p) => p.id)).not.toContain('SALVAGE_PROTOCOL');
    });
});

describe('passives unlock category (P1)', () => {
    test('exists with the right meta key, base starters, and a cost', () => {
        const cat = UNLOCK_CATEGORIES.passives;
        expect(cat).toBeTruthy();
        expect(cat.metaKey).toBe('unlockedPassives');
        expect(cat.cost).toBeGreaterThan(0);
        expect(Array.isArray(cat.base)).toBe(true);
        // Base starters are real, slot-eligible, downside-free passives.
        for (const id of cat.base) {
            expect(PASSIVES[id]).toBeDefined();
            expect(PASSIVES[id].slot).toBe(true);
            expect('downside' in PASSIVES[id]).toBe(false);
        }
    });

    test('getUnlockedSet returns the base starters for fresh meta', () => {
        const set = getUnlockedSet('passives', {});
        expect(set.has('OPPORTUNIST')).toBe(true);
        expect(set.has('LAST_BASTION')).toBe(true);
        // A non-base passive is locked until purchased.
        expect(set.has('GLASS_CANNON')).toBe(false);
    });
});

describe('P3 — passive slot scaling (round-3 §11.A)', () => {
    test('maxPassiveSlots = 3 + floor(stages/30), capped at 5', () => {
        expect(maxPassiveSlots(10)).toBe(3);
        expect(maxPassiveSlots(29)).toBe(3);
        expect(maxPassiveSlots(30)).toBe(4);
        expect(maxPassiveSlots(59)).toBe(4);
        expect(maxPassiveSlots(60)).toBe(5);
        expect(maxPassiveSlots(100)).toBe(5);
        expect(maxPassiveSlots(99999)).toBe(MAX_PASSIVE_SLOTS); // hard cap
        expect(maxPassiveSlots(0)).toBeGreaterThanOrEqual(1);   // tolerates garbage
    });

    test('a standard 10-stage run (3 slots) opens slots after stages 0/4/7', () => {
        const after = (s) => passiveSlotsUnlockedAfter(s, 10);
        expect(after(0)).toBe(1); // slot 1 from start
        expect(after(3)).toBe(1);
        expect(after(4)).toBe(2);
        expect(after(6)).toBe(2);
        expect(after(7)).toBe(3);
        expect(after(10)).toBe(3); // never exceeds maxSlots(10)=3
    });

    test('a 100-stage run (5 slots) opens slots after stages 0/20/40/60/80', () => {
        const after = (s) => passiveSlotsUnlockedAfter(s, 100);
        expect(after(0)).toBe(1);
        expect(after(20)).toBe(2);
        expect(after(40)).toBe(3);
        expect(after(60)).toBe(4);
        expect(after(80)).toBe(5);
        expect(after(100)).toBe(5);
    });

    test('is monotonic and never exceeds maxPassiveSlots', () => {
        for (const N of [10, 30, 60, 100]) {
            const cap = maxPassiveSlots(N);
            let prev = 0;
            for (let s = 0; s <= N; s++) {
                const u = passiveSlotsUnlockedAfter(s, N);
                expect(u).toBeGreaterThanOrEqual(prev); // monotonic
                expect(u).toBeLessThanOrEqual(cap);     // capped
                prev = u;
            }
            expect(passiveSlotsUnlockedAfter(N, N)).toBe(cap); // fully unlocked by run end
        }
    });
});
