/**
 * tests/unit/bounty-data.test.js — Looter-Economy Pivot T08: bounty catalog.
 *
 * Pins the §Phase 5 bounty templates + the pure roller:
 *   - all six categories are represented
 *   - every template is structurally sound (id/category/text/progressType,
 *     exactly one of target|range, a positive reward, daily|contract kind)
 *   - rollBounty(stubRng, kind) returns a FILLED concrete bounty with a
 *     positive reward and a positive target, with all `{token}` substituted
 *   - rollBounty respects the requested kind
 *   - rollBounty is deterministic for a fixed rng
 */

import { describe, expect, test } from '@jest/globals';
import {
    BOUNTY_TEMPLATES,
    BOUNTY_CATEGORIES,
    rollBounty,
} from '../../js/modules/world/bounty-data.js';

// A deterministic stub rng: cycles a fixed sequence in [0,1).
function seqRng(values) {
    let i = 0;
    return () => values[(i++) % values.length];
}

describe('BOUNTY_TEMPLATES catalog', () => {
    test('all six categories are represented', () => {
        const present = new Set(BOUNTY_TEMPLATES.map((t) => t.category));
        for (const cat of BOUNTY_CATEGORIES) {
            expect(present.has(cat)).toBe(true);
        }
        expect(BOUNTY_CATEGORIES.length).toBe(6);
    });

    test('has a healthy spread (~20+ templates)', () => {
        expect(BOUNTY_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    });

    test('template ids are unique', () => {
        const ids = BOUNTY_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every template is structurally sound', () => {
        for (const t of BOUNTY_TEMPLATES) {
            expect(typeof t.id).toBe('string');
            expect(BOUNTY_CATEGORIES).toContain(t.category);
            expect(typeof t.text).toBe('string');
            expect(typeof t.progressType).toBe('string');
            expect(['daily', 'contract']).toContain(t.kind);

            // exactly one of target | range
            const hasTarget = typeof t.target === 'number';
            const hasRange = Array.isArray(t.range);
            expect(hasTarget !== hasRange).toBe(true);
            if (hasTarget) expect(t.target).toBeGreaterThan(0);
            if (hasRange) {
                expect(t.range.length).toBeGreaterThanOrEqual(2);
                expect(t.range[0]).toBeLessThanOrEqual(t.range[1]);
            }

            // reward present + positive rainshards
            expect(t.reward).toBeTruthy();
            expect(t.reward.rainshards).toBeGreaterThan(0);
        }
    });

    test('both daily and contract kinds exist', () => {
        const kinds = new Set(BOUNTY_TEMPLATES.map((t) => t.kind));
        expect(kinds.has('daily')).toBe(true);
        expect(kinds.has('contract')).toBe(true);
    });
});

describe('rollBounty', () => {
    test('with a stub rng returns a filled bounty with a positive reward + target', () => {
        const rng = seqRng([0.0, 0.5, 0.3, 0.7, 0.1, 0.9]);
        const b = rollBounty(rng);

        expect(b).toBeTruthy();
        expect(typeof b.id).toBe('string');
        expect(typeof b.templateId).toBe('string');
        expect(BOUNTY_CATEGORIES).toContain(b.category);
        expect(['daily', 'contract']).toContain(b.kind);

        expect(typeof b.target).toBe('number');
        expect(b.target).toBeGreaterThan(0);

        expect(b.reward).toBeTruthy();
        expect(b.reward.rainshards).toBeGreaterThan(0);

        expect(b.progress).toBe(0);

        // no unfilled placeholders remain in the text
        expect(b.text).not.toMatch(/\{[^}]+\}/);
    });

    test('respects the requested kind', () => {
        const rng = seqRng([0.2, 0.4, 0.6, 0.8]);
        for (let i = 0; i < 30; i++) {
            expect(rollBounty(rng, 'daily').kind).toBe('daily');
        }
        for (let i = 0; i < 30; i++) {
            expect(rollBounty(rng, 'contract').kind).toBe('contract');
        }
    });

    test('is deterministic for a fixed rng sequence', () => {
        const make = () => rollBounty(seqRng([0.0, 0.25, 0.5, 0.75, 0.1]), 'daily');
        const a = make();
        const b = make();
        expect(a.templateId).toBe(b.templateId);
        expect(a.target).toBe(b.target);
        expect(a.text).toBe(b.text);
        expect(a.fills).toEqual(b.fills);
    });

    test('fills numeric and choice tokens into the text', () => {
        // first template, deterministic small values
        const rng = seqRng([0.0]);
        const b = rollBounty(rng);
        // every filled token value should appear in the rendered text
        for (const v of Object.values(b.fills)) {
            expect(b.text).toContain(String(v));
        }
    });

    test('throws when no template matches the kind', () => {
        expect(() => rollBounty(Math.random, 'nonexistent')).toThrow();
    });
});
