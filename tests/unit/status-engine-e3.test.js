/**
 * tests/unit/status-engine-e3.test.js — Phase E3 extended status engine.
 *
 * Pins the new applicators (CORRODE / CHILL / FREEZE / CONDUCT / OIL / MARK /
 * BLEED) and the CORRODE + CONDUCT damage multipliers in applyDamageToEnemy.
 * The frame clock is driven explicitly so timer math is deterministic.
 */

// Browser shims — combat-manager / collision-system pull in modules that
// touch window/navigator at import time.
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import {
    applyCorrode, applyChill, applyFreeze, applyConduct, applyOil, applyMark, applyBleed,
} from '../../js/modules/combat/combat-manager.js';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

const CTX = {}; // minimal damage-path context (no player/game/createDamageNumber)

function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {},
        corrodeStacks: 0, corrodeUntil: 0, chillUntil: 0, freezeUntil: 0,
        conductUntil: 0, oilUntil: 0, markUntil: 0,
        bleedStacks: 0, bleedUntil: 0, bleedTickAt: 0, bleedSourceDmg: 0,
        ...extra,
    };
}

beforeEach(() => { frameClock.now = 10000; });

describe('E3 status applicators', () => {
    test('applyCorrode increments stacks (cap 3) + refreshes the window', () => {
        const e = mkEnemy();
        applyCorrode(e);
        expect(e.corrodeStacks).toBe(1);
        expect(e.corrodeUntil).toBe(14000);
        applyCorrode(e); applyCorrode(e); applyCorrode(e);
        expect(e.corrodeStacks).toBe(3); // capped
    });

    test('chill/freeze/conduct/oil/mark set refresh-style timers', () => {
        const e = mkEnemy();
        applyChill(e, 2000);   expect(e.chillUntil).toBe(12000);
        applyFreeze(e, 1500);  expect(e.freezeUntil).toBe(11500);
        applyConduct(e, 3000); expect(e.conductUntil).toBe(13000);
        applyOil(e, 5000);     expect(e.oilUntil).toBe(15000);
        applyMark(e, 6000);    expect(e.markUntil).toBe(16000);
    });

    test('applyBleed stacks to 6 but does NOT refresh the window', () => {
        const e = mkEnemy();
        applyBleed(e, 10);
        expect(e.bleedStacks).toBe(1);
        expect(e.bleedUntil).toBe(14000);
        frameClock.now = 11000;
        applyBleed(e, 10);
        expect(e.bleedStacks).toBe(2);
        expect(e.bleedUntil).toBe(14000); // unchanged — no refresh
        for (let i = 0; i < 10; i++) applyBleed(e, 10);
        expect(e.bleedStacks).toBe(6); // capped
    });

    test('guards: no-op on inactive enemy', () => {
        const e = mkEnemy({ active: false });
        applyCorrode(e); applyFreeze(e); applyBleed(e, 10);
        expect(e.corrodeStacks).toBe(0);
        expect(e.freezeUntil).toBe(0);
        expect(e.bleedStacks).toBe(0);
    });
});

describe('E3 damage multipliers via applyDamageToEnemy', () => {
    test('CORRODE adds +15% per active stack', () => {
        const e = mkEnemy({ corrodeStacks: 2, corrodeUntil: 20000 });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(100 - 10 * 1.3); // 87
    });

    test('expired CORRODE does not amplify', () => {
        const e = mkEnemy({ corrodeStacks: 2, corrodeUntil: 5000 }); // now=10000 → expired
        applyDamageToEnemy.call(CTX, e, 10, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(90);
    });

    test('CONDUCT adds +50% to VOLT only', () => {
        const volt = mkEnemy({ conductUntil: 20000 });
        applyDamageToEnemy.call(CTX, volt, 10, { element: 'VOLT', showNumber: false });
        expect(volt.health).toBeCloseTo(85); // 10 × 1.5
        const pyro = mkEnemy({ conductUntil: 20000 });
        applyDamageToEnemy.call(CTX, pyro, 10, { element: 'PYRO', showNumber: false });
        expect(pyro.health).toBeCloseTo(90); // non-Volt unaffected
    });

    test('CORRODE + CONDUCT stack multiplicatively on a VOLT hit', () => {
        const e = mkEnemy({ corrodeStacks: 1, corrodeUntil: 20000, conductUntil: 20000 });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'VOLT', showNumber: false });
        expect(e.health).toBeCloseTo(100 - 10 * 1.15 * 1.5); // 82.75
    });
});
