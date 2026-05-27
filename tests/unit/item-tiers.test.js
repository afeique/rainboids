/**
 * tests/unit/item-tiers.test.js — Phase C.I1: 8-tier rarity ladder.
 *
 * Pins the expanded rarity contract independent of the rendering /
 * drop pipelines:
 *   - RARITY_ORDER has all 8 tiers, each present in RARITY_TIERS with
 *     an affixCount.
 *   - rollRarity() only ever returns a valid tier key.
 *   - bossBias=1 lifts the MEAN tier index above bossBias=0 (mass
 *     shifts up the ladder).
 *   - createItem rolls the tier's affixCount and stamps rarityColor.
 *
 * Statistical tests use large sample counts; rollRarity is pure RNG so
 * the bossBias mean-shift is robust well within tolerance.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { RARITY_TIERS, RARITY_ORDER, rollRarity } from '../../js/modules/world/item-names.js';
import { createItem } from '../../js/modules/world/item-system.js';
// T27 — gear now rolls via gear-gen, whose canonical RARITY_LADDER affix counts
// (1→8) supersede the legacy RARITY_TIERS counts (1→5). createItem produces
// pure {stat,pct} amplifier affixes (no resists rolled on drop), so its affix
// count equals the ladder row's affixCount.
import { rarityRow } from '../../js/modules/world/gear-gen.js';

describe('Phase C.I1 — rarity ladder structure', () => {
    test('RARITY_ORDER lists all 8 tiers low → high', () => {
        expect(RARITY_ORDER).toEqual([
            'common', 'rare', 'exceptional', 'legendary',
            'epic', 'godlike', 'divine', 'transcendental',
        ]);
        expect(RARITY_ORDER.length).toBe(8);
    });

    test('every RARITY_ORDER key exists in RARITY_TIERS with a positive affixCount', () => {
        for (const key of RARITY_ORDER) {
            const tier = RARITY_TIERS[key];
            expect(tier).toBeDefined();
            expect(typeof tier.affixCount).toBe('number');
            expect(tier.affixCount).toBeGreaterThanOrEqual(1);
            // Color + glow + label all present for renderers.
            expect(typeof tier.color).toBe('string');
            expect(typeof tier.glow).toBe('number');
            expect(typeof tier.label).toBe('string');
        }
    });

    test('affixCount climbs (or holds) up the ladder', () => {
        let prev = 0;
        for (const key of RARITY_ORDER) {
            const c = RARITY_TIERS[key].affixCount;
            expect(c).toBeGreaterThanOrEqual(prev);
            prev = c;
        }
        expect(RARITY_TIERS.common.affixCount).toBe(1);
        expect(RARITY_TIERS.transcendental.affixCount).toBe(5);
    });

    test('multiplier bands climb up the ladder', () => {
        let prevMin = 0;
        for (const key of RARITY_ORDER) {
            const tier = RARITY_TIERS[key];
            expect(tier.multMax).toBeGreaterThan(tier.multMin);
            expect(tier.multMin).toBeGreaterThanOrEqual(prevMin);
            prevMin = tier.multMin;
        }
    });

    test('transcendental carries the prismatic renderer flag', () => {
        expect(RARITY_TIERS.transcendental.prismatic).toBe(true);
    });
});

describe('Phase C.I1 — rollRarity()', () => {
    test('always returns a key in RARITY_ORDER over many samples', () => {
        for (let i = 0; i < 20000; i++) {
            const key = rollRarity();
            expect(RARITY_ORDER).toContain(key);
        }
    });

    test('bossBias=1 yields a higher mean tier index than bossBias=0', () => {
        const N = 40000;
        const meanIndex = (bias) => {
            let sum = 0;
            for (let i = 0; i < N; i++) {
                sum += RARITY_ORDER.indexOf(rollRarity(bias));
            }
            return sum / N;
        };
        const low = meanIndex(0);
        const high = meanIndex(1);
        expect(high).toBeGreaterThan(low);
        // Sanity: the shift should be meaningful, not noise.
        expect(high - low).toBeGreaterThan(0.25);
    });

    test('legacy two-arg form (bonusRare, bonusEpic) still returns valid keys', () => {
        for (let i = 0; i < 5000; i++) {
            const key = rollRarity(0.10, 0.08);
            expect(RARITY_ORDER).toContain(key);
        }
    });
});

describe('Phase C.I1 / T27 — createItem affix counts honor the gear-gen ladder', () => {
    test('transcendental item rolls its ladder affix count and stamps rarityColor', () => {
        const item = createItem('cockpit', 10, 'transcendental');
        expect(item.affixes.length).toBe(rarityRow('transcendental').affixCount);
        expect(item.rarity).toBe('transcendental');
        expect(item.rarityColor).toBe(RARITY_TIERS.transcendental.color);
        expect(item.rarityLabel).toBe('TRANSCENDENTAL');
        expect(item.rarityGlow).toBe(RARITY_TIERS.transcendental.glow);
        // Pivot model: every rolled affix is a {stat,pct} amplifier (no resists).
        for (const a of item.affixes) {
            expect(typeof a.stat).toBe('string');
            expect(typeof a.pct).toBe('number');
        }
    });

    test('common item rolls exactly 1 affix', () => {
        const item = createItem('cockpit', 10, 'common');
        expect(item.affixes.length).toBe(rarityRow('common').affixCount);
        expect(item.rarity).toBe('common');
        expect(item.rarityColor).toBe(RARITY_TIERS.common.color);
    });

    test('every tier produces an item whose affix count matches the ladder row', () => {
        for (const key of RARITY_ORDER) {
            const item = createItem('hull', 5, key);
            expect(item.affixes.length).toBe(rarityRow(key).affixCount);
        }
    });
});
