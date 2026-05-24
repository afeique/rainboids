/**
 * tests/unit/attunements-w2.test.js — Phase W2 per-element attunement behaviors.
 *
 * PYRO: fire SPREAD — a follow-up Pyro hit on an ALREADY-burning enemy jumps
 * the burn to nearby enemies (reduced), bounded by radius + a hard cap, and
 * gated so the first (igniting) hit does not scan/spread.
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
import { applyWeaponElementStatus } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

beforeEach(() => { frameClock.now = 10000; });

function mkEnemy(x, y, extra = {}) {
    return { active: true, x, y, brnUntil: 0, ...extra };
}

function mkCtx(pool) {
    const burns = [];
    return {
        burns,
        enemyPool: { activeObjects: pool },
        applyBurn(e, dmg) { burns.push({ e, dmg }); e.brnUntil = frameClock.now + 3000; },
    };
}

describe('W2 Pyro — fire spread', () => {
    test('the igniting hit burns only the target (no spread scan)', () => {
        const a = mkEnemy(0, 0);
        const b = mkEnemy(20, 0);   // adjacent, but should NOT catch on the first hit
        const ctx = mkCtx([a, b]);
        applyWeaponElementStatus.call(ctx, a, 'PYRO', 10);
        expect(ctx.burns).toHaveLength(1);
        expect(ctx.burns[0].e).toBe(a);
    });

    test('a follow-up hit on a burning enemy spreads burn to nearby enemies (reduced)', () => {
        const a = mkEnemy(0, 0, { brnUntil: frameClock.now + 1000 }); // already burning
        const b = mkEnemy(40, 0);
        const c = mkEnemy(0, 50);
        const far = mkEnemy(500, 500);
        const ctx = mkCtx([a, b, c, far]);
        applyWeaponElementStatus.call(ctx, a, 'PYRO', 10);
        // a re-burned at full; b + c spread at 0.5×; far untouched.
        const targets = ctx.burns.map((x) => x.e);
        expect(targets).toContain(a);
        expect(targets).toContain(b);
        expect(targets).toContain(c);
        expect(targets).not.toContain(far);
        const spreadB = ctx.burns.find((x) => x.e === b);
        expect(spreadB.dmg).toBeCloseTo(5); // 10 × 0.5
    });

    test('spread is capped (does not torch the whole pool)', () => {
        const a = mkEnemy(0, 0, { brnUntil: frameClock.now + 1000 });
        const neighbors = [];
        for (let i = 0; i < 8; i++) neighbors.push(mkEnemy(5 + i, 5)); // all in radius
        const ctx = mkCtx([a, ...neighbors]);
        applyWeaponElementStatus.call(ctx, a, 'PYRO', 10);
        // 1 (target re-burn) + at most BURN_SPREAD_MAX (3) spreads.
        expect(ctx.burns.length).toBeLessThanOrEqual(1 + 3);
        expect(ctx.burns.length).toBeGreaterThan(1);
    });
});
