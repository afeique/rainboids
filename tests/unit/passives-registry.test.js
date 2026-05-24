// Phase P1 — the shared PASSIVES registry (rule-modifier layer) + the
// `passives` unlock category. Pins the registry shape, delivery metadata,
// and the catalog so P6 (consumers) / P7 (item+card delivery) build on a
// stable foundation. Data-only module — no browser shims needed.
import { describe, expect, test } from '@jest/globals';
import {
    PASSIVES, PASSIVE_STACK, PASSIVE_ITEM_TIER,
    getPassive, getAllPassives, getSlotPassives, getItemPassives,
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
