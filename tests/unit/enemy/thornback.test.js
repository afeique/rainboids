/**
 * tests/unit/enemy/thornback.test.js — ENMY-10b Thornback.
 *
 * The Kinetic BRUISER that COUNTER-ATTACKS on being hit: each damage instance it
 * takes triggers a small RETALIATORY pulse IF the player is within a short
 * radius — THROTTLED by a per-burst cooldown. Asserts the type/element/resist +
 * thorns-marker data, then drives the pure thorns helper (thorns.js):
 *   - createThorns defaults + overrides + clean _lastAt baseline,
 *   - canRetaliate throttle (false within cooldownMs, true once elapsed),
 *   - playerInThornsRange boundary (in vs out of radius, exactly-on-edge),
 *   - markRetaliated stamps _lastAt (and the cooldown then re-measures from it).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import {
    createThorns,
    canRetaliate,
    playerInThornsRange,
    markRetaliated,
    THORNS_DEFAULTS,
} from '../../../js/modules/enemy/abilities/thorns.js';
import { ENEMY_TYPES } from '../../../js/modules/enemy/enemy-data.js';

// Build an enemy carrying a thorns config at (px, py).
function makeEnemy(opts = {}, px = 0, py = 0) {
    return { x: px, y: py, active: true, thorns: createThorns(opts) };
}

describe('THORNBACK config', () => {
    test('exists as a Kinetic bruiser with a valid thorns marker + thornsOpts', () => {
        const d = ENEMY_TYPES.THORNBACK;
        expect(d).toBeTruthy();
        expect(d.name).toBe('Thornback');
        expect(d.element).toBe('KINETIC');
        // Thorns marker + the counter params the damage path reads.
        expect(d.thorns).toBe(true);
        expect(d.thornsOpts).toBeTruthy();
        expect(d.thornsOpts.radius).toBeGreaterThan(0);
        expect(d.thornsOpts.damage).toBeGreaterThan(0);
        expect(d.thornsOpts.cooldownMs).toBeGreaterThan(0);
    });

    test('is a beefy-ish, slow-ish skirmisher (the threat is the counter, not the chase)', () => {
        const d = ENEMY_TYPES.THORNBACK;
        expect(d.health).toBeGreaterThanOrEqual(12);
        expect(d.speed).toBeLessThanOrEqual(2.2);
        expect(d.size).toBeGreaterThanOrEqual(30);
        expect(d.points).toBeGreaterThanOrEqual(200);
    });

    test('is Kinetic-tough and WEAK to Pyro', () => {
        const d = ENEMY_TYPES.THORNBACK;
        expect(d.resist).toBeTruthy();
        expect(d.resist.KINETIC).toBeGreaterThan(0); // resists Kinetic
        expect(d.resist.PYRO).toBeLessThan(0);        // weak to Pyro
    });
});

describe('thorns — createThorns', () => {
    test('uses THORNS_DEFAULTS when no opts given', () => {
        const t = createThorns();
        expect(t.radius).toBe(THORNS_DEFAULTS.radius);
        expect(t.damage).toBe(THORNS_DEFAULTS.damage);
        expect(t.cooldownMs).toBe(THORNS_DEFAULTS.cooldownMs);
        expect(t._lastAt).toBe(0);
    });

    test('honors overrides', () => {
        const t = createThorns({ radius: 99, damage: 13, cooldownMs: 500 });
        expect(t.radius).toBe(99);
        expect(t.damage).toBe(13);
        expect(t.cooldownMs).toBe(500);
        expect(t._lastAt).toBe(0);
    });
});

describe('thorns — canRetaliate throttle', () => {
    test('no thorns → false', () => {
        expect(canRetaliate(null, 1000)).toBe(false);
        expect(canRetaliate(undefined, 1000)).toBe(false);
    });

    test('first pulse allowed once now ≥ cooldownMs (measured from _lastAt 0)', () => {
        const t = createThorns({ cooldownMs: 260 });
        // _lastAt is 0, so canRetaliate measures from 0: false until now ≥ 260.
        // In the live game `frameClock.now` is a large wall-clock value, so the
        // first pulse always fires immediately; the throttle only bites AFTER a
        // retaliation re-stamps _lastAt (covered in the next test).
        expect(canRetaliate(t, 0)).toBe(false);   // 0 - 0 = 0 < 260
        expect(canRetaliate(t, 1)).toBe(false);   // 1 < 260
        expect(canRetaliate(t, 259)).toBe(false); // 259 < 260
        expect(canRetaliate(t, 260)).toBe(true);  // exactly cooldownMs
        expect(canRetaliate(t, 1e9)).toBe(true);  // large wall-clock (live game)
    });

    test('false within cooldown after a retaliation, true once elapsed', () => {
        const t = createThorns({ cooldownMs: 260 });
        markRetaliated(t, 1000);
        expect(canRetaliate(t, 1000)).toBe(false); // same instant
        expect(canRetaliate(t, 1100)).toBe(false); // 100 < 260
        expect(canRetaliate(t, 1259)).toBe(false); // 259 < 260
        expect(canRetaliate(t, 1260)).toBe(true);  // exactly cooldownMs
        expect(canRetaliate(t, 2000)).toBe(true);  // well past
    });
});

describe('thorns — playerInThornsRange boundary', () => {
    test('no thorns / enemy / player → false', () => {
        expect(playerInThornsRange(null, { x: 0, y: 0 })).toBe(false);
        expect(playerInThornsRange({}, { x: 0, y: 0 })).toBe(false); // no .thorns
        expect(playerInThornsRange(makeEnemy({ radius: 150 }), null)).toBe(false);
    });

    test('true inside the radius, false outside, true exactly on the edge', () => {
        const e = makeEnemy({ radius: 150 }, 0, 0);
        expect(playerInThornsRange(e, { x: 100, y: 0 })).toBe(true);   // 100 ≤ 150
        expect(playerInThornsRange(e, { x: 90, y: 120 })).toBe(true);  // hypot 150 ≤ 150
        expect(playerInThornsRange(e, { x: 150, y: 0 })).toBe(true);   // exactly on edge
        expect(playerInThornsRange(e, { x: 151, y: 0 })).toBe(false);  // just outside
        expect(playerInThornsRange(e, { x: 300, y: 0 })).toBe(false);  // far
    });
});

describe('thorns — markRetaliated', () => {
    test('updates _lastAt and returns the state', () => {
        const t = createThorns();
        expect(t._lastAt).toBe(0);
        const ret = markRetaliated(t, 4242);
        expect(t._lastAt).toBe(4242);
        expect(ret).toBe(t); // returns the same state
    });

    test('no thorns → no-op (returns the falsy arg)', () => {
        expect(markRetaliated(null, 1000)).toBeNull();
    });
});
