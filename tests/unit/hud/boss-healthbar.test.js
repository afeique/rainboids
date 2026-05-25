/**
 * tests/unit/hud/boss-healthbar.test.js — BOSS-01.
 *
 * Pins the PURE layout helper `computeBossHealthbarLayout`. The helper takes a
 * boss-shaped object + a viewport width and returns everything the renderer
 * needs WITHOUT touching a canvas, so it's testable with no browser shims.
 *
 * Uses a lightweight STUB boss (the shape spelled out in the task) — does NOT
 * depend on a real boss entity, the enemy pool, or boss-phases runtime state.
 */

import { describe, expect, test } from '@jest/globals';
import {
    computeBossHealthbarLayout,
    bossElementColor,
    isDrawableBoss,
} from '../../../js/modules/hud/boss-healthbar.js';
import { ELEMENTS } from '../../../js/modules/combat/elements.js';

const STUB = {
    name: 'THE HARBINGER',
    health: 60,
    maxHealth: 100,
    phaseIndex: 1,
    phaseCount: 3,
    element: 'KINETIC',
};

describe('computeBossHealthbarLayout (pure)', () => {
    test('hpFraction = health / maxHealth', () => {
        const L = computeBossHealthbarLayout(STUB, 1280);
        expect(L.hpFraction).toBeCloseTo(0.6, 5);
    });

    test('segments == phase count', () => {
        const L = computeBossHealthbarLayout(STUB, 1280);
        expect(L.segments).toBe(3);
    });

    test('phase pips report total + current phase', () => {
        const L = computeBossHealthbarLayout(STUB, 1280);
        expect(L.phasePips.total).toBe(3);
        expect(L.phasePips.current).toBe(1);
    });

    test('name resolves (uppercased)', () => {
        const L = computeBossHealthbarLayout(STUB, 1280);
        expect(L.name).toBe('THE HARBINGER');
    });

    test('elementColor resolves from the element taxonomy', () => {
        const L = computeBossHealthbarLayout(STUB, 1280);
        expect(L.elementColor).toBe(ELEMENTS.KINETIC.color);
        expect(typeof L.elementColor).toBe('string');
        expect(L.elementColor).toMatch(/^#/);
    });

    test('bar rect is a centered top-anchored box', () => {
        const viewW = 1280;
        const L = computeBossHealthbarLayout(STUB, viewW);
        expect(L.w).toBeGreaterThan(0);
        expect(L.h).toBeGreaterThan(0);
        expect(L.y).toBeGreaterThanOrEqual(0);
        // Horizontally centered: left margin == right margin.
        expect(L.x).toBeCloseTo((viewW - L.w) / 2, 0);
    });

    test('hpFraction clamps to [0,1] for overkill / overheal', () => {
        const dead = computeBossHealthbarLayout({ ...STUB, health: -20 }, 1280);
        expect(dead.hpFraction).toBe(0);
        const over = computeBossHealthbarLayout({ ...STUB, health: 999 }, 1280);
        expect(over.hpFraction).toBe(1);
    });

    test('reads live boss phase-script shape (boss-phases.js)', () => {
        // Live boss: phaseScript array + _phaseState.index instead of the
        // explicit phaseIndex/phaseCount stub fields.
        const liveBoss = {
            name: 'THE HARBINGER',
            health: 50,
            maxHealth: 200,
            element: 'PYRO',
            phaseScript: [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
            _phaseState: { index: 2 },
        };
        const L = computeBossHealthbarLayout(liveBoss, 1024);
        expect(L.segments).toBe(4);
        expect(L.phasePips.total).toBe(4);
        expect(L.phasePips.current).toBe(2);
        expect(L.hpFraction).toBeCloseTo(0.25, 5);
        expect(L.elementColor).toBe(ELEMENTS.PYRO.color);
    });

    test('falls back to a default name + KINETIC tint when fields missing', () => {
        const L = computeBossHealthbarLayout(
            { health: 10, maxHealth: 10, phaseCount: 1 },
            800,
        );
        expect(L.name).toBe('BOSS');
        expect(L.elementColor).toBe(ELEMENTS.KINETIC.color);
        expect(L.segments).toBe(1);
    });
});

describe('bossElementColor', () => {
    test('known element → its color', () => {
        expect(bossElementColor('CRYO')).toBe(ELEMENTS.CRYO.color);
    });
    test('unknown / missing element → KINETIC fallback', () => {
        expect(bossElementColor('NOPE')).toBe(ELEMENTS.KINETIC.color);
        expect(bossElementColor(undefined)).toBe(ELEMENTS.KINETIC.color);
    });
});

describe('isDrawableBoss', () => {
    test('true only for a live, flagged boss', () => {
        expect(isDrawableBoss({ isBoss: true, active: true, health: 5 })).toBe(true);
    });
    test('false for null / non-boss / dead / inactive', () => {
        expect(isDrawableBoss(null)).toBe(false);
        expect(isDrawableBoss({ isBoss: false, active: true, health: 5 })).toBe(false);
        expect(isDrawableBoss({ isBoss: true, active: false, health: 5 })).toBe(false);
        expect(isDrawableBoss({ isBoss: true, active: true, health: 0 })).toBe(false);
    });
});
