/**
 * tests/unit/item-templates.test.js — unit tests for item-templates.js (T06).
 *
 * Covers the §2.3 rarity ladder, the 10 build templates (affix pools + set
 * bonuses), the slot-personality affix filter (§2.1), and setBonus tiering.
 */

import {
    RARITY_LADDER,
    ITEM_TEMPLATES,
    SLOT_PERSONALITY,
    affixPoolForSlot,
    setBonus,
    itemTemplate,
} from '../../js/modules/world/item-templates.js';
import { SP_STATS } from '../../js/modules/core/sp-stats.js';
import { SLOT_ORDER } from '../../js/modules/world/item-names.js';

const SP_STAT_IDS = new Set(SP_STATS.map((s) => s.id));

// ---------------------------------------------------------------------------
// RARITY_LADDER
// ---------------------------------------------------------------------------
describe('RARITY_LADDER', () => {
    test('has 8 tiers', () => {
        expect(RARITY_LADDER).toHaveLength(8);
    });

    test('tiers are Common..Transcendental in order', () => {
        expect(RARITY_LADDER.map((r) => r.name)).toEqual([
            'Common', 'Rare', 'Exceptional', 'Legendary',
            'Epic', 'Godlike', 'Divine', 'Transcendental',
        ]);
    });

    test('affixCount ascends 1..8 in lockstep with tier', () => {
        RARITY_LADDER.forEach((r, i) => {
            expect(r.tier).toBe(i + 1);
            expect(r.affixCount).toBe(i + 1);
        });
    });

    test('every tier has a valid % range and socket count', () => {
        for (const r of RARITY_LADDER) {
            expect(r.pctMin).toBeLessThan(r.pctMax);
            expect(r.sockets).toBeGreaterThanOrEqual(1);
        }
    });

    test('Common is (1, 4–8%, 1 socket) and Transcendental is (8, 18–36%, 2 sockets)', () => {
        const common = RARITY_LADDER[0];
        const trans = RARITY_LADDER[7];
        expect(common).toMatchObject({ tier: 1, name: 'Common', affixCount: 1, pctMin: 4, pctMax: 8, sockets: 1 });
        expect(trans).toMatchObject({ tier: 8, name: 'Transcendental', affixCount: 8, pctMin: 18, pctMax: 36, sockets: 2 });
    });
});

// ---------------------------------------------------------------------------
// ITEM_TEMPLATES
// ---------------------------------------------------------------------------
describe('ITEM_TEMPLATES', () => {
    test('has exactly 10 templates', () => {
        expect(ITEM_TEMPLATES).toHaveLength(10);
    });

    test('contains all 10 named build templates', () => {
        expect(ITEM_TEMPLATES.map((t) => t.id).sort()).toEqual([
            'assassin', 'berserker', 'bulwark', 'duelist', 'juggernaut',
            'overcharger', 'reactor', 'retaliator', 'sentinel', 'vampire',
        ]);
    });

    test('every affix-pool stat id exists in SP_STATS', () => {
        for (const t of ITEM_TEMPLATES) {
            expect(t.affixPool.length).toBeGreaterThan(0);
            for (const stat of t.affixPool) {
                expect(SP_STAT_IDS.has(stat)).toBe(true);
            }
        }
    });

    test('every 2/3-pc set bonus references a valid SP stat', () => {
        for (const t of ITEM_TEMPLATES) {
            expect(SP_STAT_IDS.has(t.set.two.stat)).toBe(true);
            expect(SP_STAT_IDS.has(t.set.three.stat)).toBe(true);
        }
    });

    test('every template has a 5-pc signature description', () => {
        for (const t of ITEM_TEMPLATES) {
            expect(typeof t.set.five.desc).toBe('string');
            expect(t.set.five.desc.length).toBeGreaterThan(0);
        }
    });

    test('itemTemplate() looks up by id and returns null for unknown', () => {
        expect(itemTemplate('assassin').name).toBe('Assassin');
        expect(itemTemplate('nope')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// affixPoolForSlot
// ---------------------------------------------------------------------------
describe('affixPoolForSlot()', () => {
    test('slot-personality keys match the canonical SLOT_ORDER', () => {
        expect(Object.keys(SLOT_PERSONALITY).sort()).toEqual([...SLOT_ORDER].sort());
    });

    test('filters the pool to slot-appropriate stats', () => {
        // Assassin pool = CRIT_CHANCE, CRIT_DAMAGE, SPEED. cockpit (offense)
        // allows all three; shielding (dodge/DR) allows none → fallback to full.
        expect(affixPoolForSlot('assassin', 'cockpit').sort())
            .toEqual(['CRIT_CHANCE', 'CRIT_DAMAGE', 'SPEED']);
    });

    test('hull (vitality) keeps only HEALTH for a HEALTH-bearing template', () => {
        // Juggernaut = TOUGHNESS, HEALTH, THORNS → hull keeps HEALTH only.
        expect(affixPoolForSlot('juggernaut', 'hull')).toEqual(['HEALTH']);
    });

    test('falls back to the full pool when the intersection is empty', () => {
        // Assassin (crit/speed) has nothing in chassis (thorns/toughness).
        expect(affixPoolForSlot('assassin', 'chassis').sort())
            .toEqual(['CRIT_CHANCE', 'CRIT_DAMAGE', 'SPEED']);
    });

    test('every (template, slot) pair yields a non-empty pool of valid SP stats', () => {
        for (const t of ITEM_TEMPLATES) {
            for (const slot of SLOT_ORDER) {
                const pool = affixPoolForSlot(t.id, slot);
                expect(pool.length).toBeGreaterThan(0);
                for (const stat of pool) {
                    expect(SP_STAT_IDS.has(stat)).toBe(true);
                    expect(t.affixPool).toContain(stat);
                }
            }
        }
    });

    test('returns [] for unknown template or slot', () => {
        expect(affixPoolForSlot('nope', 'cockpit')).toEqual([]);
        expect(affixPoolForSlot('assassin', 'nope')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// setBonus
// ---------------------------------------------------------------------------
describe('setBonus()', () => {
    test('setBonus(t, 1) is empty for every template', () => {
        for (const t of ITEM_TEMPLATES) {
            expect(setBonus(t.id, 1)).toEqual([]);
        }
        expect(setBonus('assassin', 0)).toEqual([]);
    });

    test('setBonus(t, 2) yields only the 2-pc bonus', () => {
        const b = setBonus('assassin', 2);
        expect(b).toHaveLength(1);
        expect(b[0].pieces).toBe(2);
    });

    test('setBonus(t, 3) yields the 2-pc + 3-pc bonuses', () => {
        const b = setBonus('assassin', 3);
        expect(b.map((x) => x.pieces)).toEqual([2, 3]);
    });

    test('setBonus(t, 5) includes the 5-pc signature for every template', () => {
        for (const t of ITEM_TEMPLATES) {
            const b = setBonus(t.id, 5);
            expect(b.map((x) => x.pieces)).toEqual([2, 3, 5]);
            const sig = b.find((x) => x.pieces === 5);
            expect(sig.signature).toBe(true);
            expect(sig.desc).toBe(t.set.five.desc);
        }
    });

    test('piece counts above 5 still cap at the three tiers', () => {
        expect(setBonus('assassin', 7).map((x) => x.pieces)).toEqual([2, 3, 5]);
    });

    test('returns [] for an unknown template', () => {
        expect(setBonus('nope', 5)).toEqual([]);
    });
});
