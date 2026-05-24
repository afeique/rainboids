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

// Cryo ctx — records chill/freeze and sets the timers the engine reads.
function mkCryoCtx() {
    const chilled = [], frozen = [];
    return {
        chilled, frozen,
        applyChill(e) { chilled.push(e); e.chillUntil = frameClock.now + 2000; },
        applyFreeze(e) { frozen.push(e); e.freezeUntil = frameClock.now + 1500; },
    };
}

// Volt ctx — records conduct + (via each enemy's takeDamage) the fork hits.
function mkVoltCtx(pool, forks) {
    return {
        conducts: [],
        enemyPool: { activeObjects: pool },
        applyConduct(e) { this.conducts.push(e); },
        // Kill-pipeline stubs (only invoked if a fork is lethal).
        createEnemyDebris() {}, dropOrbsFromEntity() {}, onEnemyKill() {},
        forks,
    };
}
function mkVoltEnemy(x, y, forks, kills = false) {
    return {
        active: true, x, y,
        takeDamage(dmg, opts) { forks.push({ e: this, dmg, opts }); return kills; },
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

describe('W2 Cryo — sustained cold escalates to freeze', () => {
    test('a soft hit on a fresh enemy only chills', () => {
        const e = mkEnemy(0, 0);
        const ctx = mkCryoCtx();
        applyWeaponElementStatus.call(ctx, e, 'CRYO', 3); // < freeze threshold (8)
        expect(ctx.chilled).toContain(e);
        expect(ctx.frozen).not.toContain(e);
    });

    test('a hard hit freezes outright', () => {
        const e = mkEnemy(0, 0);
        const ctx = mkCryoCtx();
        applyWeaponElementStatus.call(ctx, e, 'CRYO', 10); // >= threshold
        expect(ctx.frozen).toContain(e);
        expect(ctx.chilled).not.toContain(e);
    });

    test('a soft hit on an already-chilled enemy escalates to freeze', () => {
        const e = mkEnemy(0, 0, { chillUntil: frameClock.now + 1000 });
        const ctx = mkCryoCtx();
        applyWeaponElementStatus.call(ctx, e, 'CRYO', 3); // soft, but already chilled
        expect(ctx.frozen).toContain(e);
        expect(ctx.chilled).not.toContain(e);
    });
});

describe('W2 Volt — chain fork', () => {
    test('a Volt hit forks reduced damage + conduct to the nearest enemy', () => {
        const forks = [];
        const a = mkVoltEnemy(0, 0, forks);
        const b = mkVoltEnemy(40, 0, forks);    // nearest, in radius
        const far = mkVoltEnemy(400, 0, forks);  // out of radius
        const ctx = mkVoltCtx([a, b, far], forks);
        applyWeaponElementStatus.call(ctx, a, 'VOLT', 10);
        expect(ctx.conducts).toContain(a);              // primary target
        expect(forks).toHaveLength(1);
        expect(forks[0].e).toBe(b);                     // forked to nearest
        expect(forks[0].dmg).toBeCloseTo(4);            // 10 × 0.4
        expect(forks[0].opts.element).toBe('VOLT');
        expect(ctx.conducts).toContain(b);              // fork also conducts
    });

    test('no fork when no other enemy is in range', () => {
        const forks = [];
        const a = mkVoltEnemy(0, 0, forks);
        const far = mkVoltEnemy(500, 0, forks);
        const ctx = mkVoltCtx([a, far], forks);
        applyWeaponElementStatus.call(ctx, a, 'VOLT', 10);
        expect(forks).toHaveLength(0);
        expect(ctx.conducts).toEqual([a]);
    });

    test('the fork picks the nearest candidate', () => {
        const forks = [];
        const a = mkVoltEnemy(0, 0, forks);
        const near = mkVoltEnemy(30, 0, forks);
        const mid = mkVoltEnemy(100, 0, forks);
        const ctx = mkVoltCtx([a, mid, near], forks);
        applyWeaponElementStatus.call(ctx, a, 'VOLT', 10);
        expect(forks[0].e).toBe(near);
    });

    test('a lethal fork runs the kill pipeline (loot + debris)', () => {
        const forks = [];
        const a = mkVoltEnemy(0, 0, forks);
        const b = mkVoltEnemy(40, 0, forks, true); // fork kills it
        let looted = false, debris = false;
        const ctx = mkVoltCtx([a, b], forks);
        ctx.dropOrbsFromEntity = () => { looted = true; };
        ctx.createEnemyDebris = () => { debris = true; };
        applyWeaponElementStatus.call(ctx, a, 'VOLT', 10);
        expect(looted).toBe(true);
        expect(debris).toBe(true);
    });
});
