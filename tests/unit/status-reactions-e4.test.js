/**
 * tests/unit/status-reactions-e4.test.js — Phase E4 synergy reactions.
 *
 * SHATTER (FREEZE + heavy hit → AoE + re-freeze, depth-capped) and OIL FLARE
 * (OIL + Pyro hit → AoE burn) fire through applyDamageToEnemy. A stub `this`
 * supplies the enemy pool + applyFreeze/applyBurn so we can assert the spread.
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

function mkEnemy(x, extra = {}) {
    return {
        active: true, x, y: 0, radius: 15, health: 100, maxHealth: 100, resist: {},
        corrodeStacks: 0, corrodeUntil: 0, freezeUntil: 0, oilUntil: 0,
        brnStacks: 0, brnSourceDmg: 0, ...extra,
    };
}

// Stub engine context: pool + the apply helpers the reactions call.
function mkCtx(enemies) {
    return {
        enemyPool: { activeObjects: enemies },
        applyFreeze(e, dur) { e.freezeUntil = frameClock.now + dur; },
        applyBurn(e, dmg) { e.brnStacks = (e.brnStacks || 0) + 1; e.brnSourceDmg = Math.max(e.brnSourceDmg || 0, dmg); },
    };
}

beforeEach(() => { frameClock.now = 10000; });

describe('E4 SHATTER', () => {
    test('frozen enemy hit hard cracks: nearby enemies take dmg + re-freeze', () => {
        const target = mkEnemy(0, { freezeUntil: 20000 });
        const near = mkEnemy(50);   // within SHATTER_RADIUS (110)
        const far = mkEnemy(400);   // outside
        const ctx = mkCtx([target, near, far]);
        applyDamageToEnemy.call(ctx, target, 10, { element: 'CRYO', showNumber: false });
        expect(target.freezeUntil).toBe(0);          // consumed
        expect(near.health).toBeLessThan(100);       // took shatter AoE
        expect(near.freezeUntil).toBeGreaterThan(frameClock.now); // re-frozen
        expect(far.health).toBe(100);                // out of radius
    });

    test('a light hit does NOT shatter a frozen enemy', () => {
        const target = mkEnemy(0, { freezeUntil: 20000 });
        const near = mkEnemy(50);
        const ctx = mkCtx([target, near]);
        applyDamageToEnemy.call(ctx, target, 3, { element: 'CRYO', showNumber: false }); // < threshold 6
        expect(target.freezeUntil).toBe(20000);      // not consumed
        expect(near.health).toBe(100);
    });

    test('an unfrozen enemy does not shatter', () => {
        const target = mkEnemy(0);
        const near = mkEnemy(50);
        const ctx = mkCtx([target, near]);
        applyDamageToEnemy.call(ctx, target, 50, { element: 'CRYO', showNumber: false });
        expect(near.health).toBe(100);
    });

    test('chain cap: at max depth a frozen enemy does not spread further', () => {
        const target = mkEnemy(0, { freezeUntil: 20000 });
        const near = mkEnemy(50, { freezeUntil: 20000 });
        const ctx = mkCtx([target, near]);
        // Enter at depth = MAX (2) → reaction must be suppressed entirely.
        applyDamageToEnemy.call(ctx, target, 50, { element: 'CRYO', showNumber: false, shatterDepth: 2 });
        expect(target.freezeUntil).toBe(20000); // not consumed (capped)
        expect(near.health).toBe(100);          // no spread
    });
});

describe('E4 OIL FLARE', () => {
    test('oiled enemy hit by PYRO ignites: nearby enemies gain burn', () => {
        const target = mkEnemy(0, { oilUntil: 20000 });
        const near = mkEnemy(40);
        const far = mkEnemy(300);
        const ctx = mkCtx([target, near, far]);
        applyDamageToEnemy.call(ctx, target, 10, { element: 'PYRO', showNumber: false });
        expect(target.oilUntil).toBe(0);          // consumed
        expect(near.brnStacks).toBeGreaterThan(0); // ignited neighbor
        expect(far.brnStacks).toBe(0);             // out of radius
    });

    test('non-Pyro hit does NOT ignite oil', () => {
        const target = mkEnemy(0, { oilUntil: 20000 });
        const near = mkEnemy(40);
        const ctx = mkCtx([target, near]);
        applyDamageToEnemy.call(ctx, target, 10, { element: 'VOLT', showNumber: false });
        expect(target.oilUntil).toBe(20000); // not consumed
        expect(near.brnStacks).toBe(0);
    });
});
