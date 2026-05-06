/**
 * Unit tests for boss rage + per-tier mechanics (5.77.0, 5.78.0).
 * Exercises the state machine in `js/modules/enemy/boss-rage.js`
 * without spinning up the full engine — uses a synthetic enemy
 * shaped like the real `Enemy` class minus draw/AI dependencies.
 */

import {
    updateBossRage,
    bossFormationMovement,
    bossRageBlocksDamage,
    linkBosses,
    notifyBossDeath,
} from '../../js/modules/enemy/boss-rage.js';

function makeBoss(overrides = {}) {
    return {
        active: true,
        isBoss: true,
        bossTier: 1,
        x: 100, y: 100,
        vel: { x: 0, y: 0 },
        radius: 40,
        health: 100,
        maxHealth: 100,
        firingCooldown: 1000,
        config: { name: 'Iron Giant', speed: 2 },
        targetPlayer: { x: 500, y: 500, active: true },
        // Stub createEnemyBullet so the tantrum can record calls without
        // touching the actual bullet pool.
        createEnemyBullet(...args) { (this._tantrum ||= []).push(args); },
        ...overrides,
    };
}

function makeEngine() {
    // Allure runner uses `allure-jest/node` env where `jest.fn()` may
    // not be top-level resolvable in module scope; use a lightweight
    // stub instead.
    const noop = () => {};
    return {
        triggerScreenFlash: noop,
        triggerScreenShake: noop,
        particlePool: null,
        events: { emit: noop },
    };
}

describe('boss rage — HP-threshold trigger', () => {
    test('does NOT trigger above 33% HP', () => {
        const boss = makeBoss({ health: 50 });
        const engine = makeEngine();
        updateBossRage(boss, engine);
        expect(boss._rageTriggered).toBeFalsy();
        expect(boss._rageTelegraph).toBeUndefined();
    });

    test('starts telegraph at 33% HP (decrements same tick to 23)', () => {
        const boss = makeBoss({ health: 33 });
        const engine = makeEngine();
        updateBossRage(boss, engine);
        // The same update tick that begins the telegraph also runs the
        // first decrement, so 24 → 23. Activation is on tick 24.
        expect(boss._rageTelegraph).toBe(23);
        expect(boss._rageTriggered).toBeFalsy();
    });

    test('telegraph counts down 24 frames then activates', () => {
        const boss = makeBoss({ health: 30 });
        const engine = makeEngine();
        updateBossRage(boss, engine); // sets telegraph = 24
        for (let i = 0; i < 24; i++) updateBossRage(boss, engine);
        expect(boss._rageTriggered).toBe(true);
        expect(boss._rageActive).toBe(true);
        expect(boss._rageInvulnUntil).toBeGreaterThan(Date.now());
        // 16-bullet tantrum recorded.
        expect(boss._tantrum).toHaveLength(16);
    });

    test('firing cooldown gets the 0.66 multiplier exactly once', () => {
        const boss = makeBoss({ health: 30, firingCooldown: 1000 });
        const engine = makeEngine();
        updateBossRage(boss, engine);
        for (let i = 0; i < 24; i++) updateBossRage(boss, engine);
        expect(boss.firingCooldown).toBe(660);
        // Subsequent ticks must not re-apply the multiplier.
        for (let i = 0; i < 100; i++) updateBossRage(boss, engine);
        expect(boss.firingCooldown).toBe(660);
    });

    test('enableHomingBullets is set on activation', () => {
        const boss = makeBoss({ health: 30 });
        const engine = makeEngine();
        for (let i = 0; i < 25; i++) updateBossRage(boss, engine);
        expect(boss.enableHomingBullets).toBe(true);
    });
});

describe('boss rage — invuln window', () => {
    test('bossRageBlocksDamage true while window is open, false after', () => {
        const boss = makeBoss({ health: 30 });
        const engine = makeEngine();
        for (let i = 0; i < 25; i++) updateBossRage(boss, engine);
        expect(bossRageBlocksDamage(boss)).toBe(true);
        // Force the window past expiry.
        boss._rageInvulnUntil = Date.now() - 10;
        expect(bossRageBlocksDamage(boss)).toBe(false);
    });
});

describe('boss rage — Tier-2 partner-died trigger', () => {
    test('linkBosses populates _bossPair both ways', () => {
        const a = makeBoss({ bossTier: 2 });
        const b = makeBoss({ bossTier: 2 });
        linkBosses([a, b], { width: 1920, height: 1080 });
        expect(a._bossPair).toEqual([b]);
        expect(b._bossPair).toEqual([a]);
    });

    test('notifyBossDeath flips survivor _partnerDied', () => {
        const a = makeBoss({ bossTier: 2 });
        const b = makeBoss({ bossTier: 2 });
        linkBosses([a, b], { width: 1920, height: 1080 });
        notifyBossDeath(a);
        expect(b._partnerDied).toBe(true);
    });

    test('partner death triggers immediate rage even at full HP', () => {
        const a = makeBoss({ bossTier: 2, health: 100 });
        const b = makeBoss({ bossTier: 2, health: 100 });
        linkBosses([a, b], { width: 1920, height: 1080 });
        notifyBossDeath(a);
        const engine = makeEngine();
        updateBossRage(b, engine);
        // 24 → 23 in the same tick the telegraph starts (see prior test).
        expect(b._rageTelegraph).toBe(23);
    });
});

describe('boss rage — Tier-3 formation orbit', () => {
    test('linkBosses sets formation center + offset angles for 3 bosses', () => {
        const bosses = [makeBoss({ bossTier: 3 }), makeBoss({ bossTier: 3 }), makeBoss({ bossTier: 3 })];
        linkBosses(bosses, { width: 1920, height: 1080 });
        for (const b of bosses) {
            expect(b._formationCenter).toBeTruthy();
            expect(b._formationCenter.x).toBeCloseTo(960, 0);
            expect(b._formationCenter.y).toBeCloseTo(540, 0);
        }
        // Angles are evenly spaced.
        const angles = bosses.map(b => b._formationAngle).sort((a, b) => a - b);
        const spread = angles[2] - angles[0];
        expect(spread).toBeCloseTo((4 / 3) * Math.PI, 1);
    });

    test('bossFormationMovement returns true and updates velocity', () => {
        const boss = makeBoss({ bossTier: 3 });
        boss._formationCenter = { x: 1000, y: 500 };
        boss._formationAngle = 0;
        boss._formationRadius = 200;
        boss._formationOmega = 0.012;
        const handled = bossFormationMovement(boss);
        expect(handled).toBe(true);
        expect(boss.vel.x).not.toBe(0); // steered toward target
    });
});

describe('boss rage — Tier-4 phase cycling', () => {
    test('phase timer initializes on first call', () => {
        const boss = makeBoss({ bossTier: 4, health: 100 });
        const engine = makeEngine();
        updateBossRage(boss, engine);
        expect(boss._phaseTimer).toBe(720 - 1); // decremented once
        expect(boss._phaseIdx).toBe(0);
    });

    test('phase swap on timer hit zero', () => {
        const boss = makeBoss({ bossTier: 4, health: 100 });
        const engine = makeEngine();
        updateBossRage(boss, engine);                 // init + first decrement
        boss._phaseTimer = 1;                          // jump to next swap
        updateBossRage(boss, engine);                  // tick to 0 → swap
        expect(boss._phaseIdx).toBe(1);
        // Phase 1 entry force-activates rage.
        expect(boss._rageActive).toBe(true);
    });

    test('formation movement suppressed during phase 1', () => {
        const boss = makeBoss({ bossTier: 4 });
        boss._formationCenter = { x: 1000, y: 500 };
        boss._formationAngle = 0;
        boss._formationRadius = 200;
        boss._phaseIdx = 1;
        const handled = bossFormationMovement(boss);
        expect(handled).toBe(false);
    });
});
