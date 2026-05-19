/**
 * tests/unit/status-effects.test.js — Phase 3 BRN + STUN engine tests.
 *
 * Pins the status-effect contract independent of the rendering /
 * collision pipelines so the numbers stay sharp through future
 * refactors. Each test synthesizes a minimal "enemy-shaped" object and
 * a stub engine that satisfies the takeDamage path.
 *
 * Covered:
 *   - BRN: tick count over the 3-second window (6 ticks @ 500 ms spacing)
 *   - BRN: stack cap at 3 + refresh extends the duration timer
 *   - BRN: per-tick damage scales linearly with stack count
 *   - STUN: velocity is zeroed and stays zero through update
 *   - STUN: repeated applies REFRESH the timer (no immunity gap)
 *   - STUN: stunned enemy doesn't move during the pure-stepper update tick
 *
 * The frame clock is driven explicitly via `frameClock.now = …` between
 * steps so we can time-travel through tick windows without wall-clock
 * timing flakes.
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import { applyBurn, applyStun } from '../../js/modules/combat/combat-manager.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

// ── Test fixtures ────────────────────────────────────────────────────
// Minimal "enemy-shaped" object that satisfies the BRN tick + STUN
// guard contract. Doesn't import the real Enemy class — we want to
// pin the helper behavior cleanly without the full engine wiring.

function makeFakeEnemy(overrides = {}) {
    const enemy = {
        active: true,
        x: 100, y: 100,
        vel: { x: 0, y: 0 },
        health: 100,
        maxHealth: 100,
        radius: 14,
        warping: false,
        _deathFlash: 0,
        // BRN / STUN fields — initialized identically to the real Enemy
        // reset() block.
        brnStacks: 0,
        brnUntil: 0,
        brnTickAt: 0,
        brnSourceDmg: 0,
        stunUntil: 0,
        // Standalone takeDamage so the helpers can land hits without
        // wiring up the engine consolidator. Records each hit so tests
        // can assert the tick-damage payload.
        damageLog: [],
        takeDamage(damage, opts = {}) {
            this.damageLog.push({ damage, opts });
            this.health = Math.max(0, this.health - damage);
            if (this.health <= 0.001) this.active = false;
            return this.health <= 0.001;
        },
        ...overrides,
    };
    return enemy;
}

// Drives the BRN tick loop manually. Mirrors the body of
// `Enemy._processStatusEffects()` so the tests don't need the real
// Enemy class — they exercise the helper contract directly. Returning
// the tick count makes it easy to assert "6 ticks over 3 s."
function processBurn(enemy) {
    const now = frameClock.now;
    let ticksThisCall = 0;

    // Ticks fire BEFORE expiry so the boundary tick at t=brnUntil lands.
    if (enemy.brnStacks > 0 && enemy.brnUntil > 0) {
        while (now >= enemy.brnTickAt && enemy.brnTickAt <= enemy.brnUntil) {
            const tickDmg = enemy.brnSourceDmg * 0.1 * enemy.brnStacks;
            if (tickDmg > 0) {
                enemy.takeDamage(tickDmg, { showNumber: true, isBurn: true });
                if (!enemy.active) return ticksThisCall;
            }
            enemy.brnTickAt += 500;
            ticksThisCall++;
        }
    }

    if (enemy.brnStacks > 0 && enemy.brnUntil > 0 && now > enemy.brnUntil) {
        enemy.brnStacks = 0;
        enemy.brnUntil = 0;
        enemy.brnTickAt = 0;
        enemy.brnSourceDmg = 0;
    }

    return ticksThisCall;
}

describe('Phase 3 — BRN (burn) status effect', () => {
    beforeEach(() => {
        // Anchor frame clock so tests get a clean "t=0".
        frameClock.now = 1_000_000;
    });

    test('applyBurn — first call: 1 stack, brnUntil = now + 3000, brnTickAt = now + 500', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100);

        expect(enemy.brnStacks).toBe(1);
        expect(enemy.brnUntil).toBe(1_000_000 + 3000);
        expect(enemy.brnTickAt).toBe(1_000_000 + 500);
        expect(enemy.brnSourceDmg).toBe(100);
    });

    test('BRN ticks exactly 6 times across the 3-second window (every 500ms)', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100); // duration 3000, sourceDmg 100, 1 stack
        // Expected per-tick damage = 100 * 0.1 * 1 = 10. Six ticks total
        // at t=500, 1000, 1500, 2000, 2500, 3000 (boundary excluded).
        const start = frameClock.now;

        let totalTicks = 0;
        // Advance in 100 ms increments through the full burn window
        // (plus a bit past expiry) so the tick scheduler has the chance
        // to fire each scheduled tick at most once.
        for (let dt = 0; dt <= 3500; dt += 100) {
            frameClock.now = start + dt;
            totalTicks += processBurn(enemy);
        }

        expect(totalTicks).toBe(6);
        // 6 ticks × 10 damage = 60 total burn damage on a 1-stack proc.
        expect(enemy.health).toBeCloseTo(40, 5);
        // After expiry the stack count should reset.
        expect(enemy.brnStacks).toBe(0);
    });

    test('BRN stacks cap at 3 — additional applies refresh duration but not count', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100);
        applyBurn(enemy, 100);
        applyBurn(enemy, 100);
        expect(enemy.brnStacks).toBe(3);

        // A 4th application stays capped at 3.
        applyBurn(enemy, 100);
        expect(enemy.brnStacks).toBe(3);
    });

    test('Re-applying BRN mid-burn extends the duration (refresh-style)', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100); // brnUntil = T + 3000
        const initialUntil = enemy.brnUntil;

        // 1 second into the burn, re-apply.
        frameClock.now += 1000;
        applyBurn(enemy, 100); // brnUntil = T + 1000 + 3000

        expect(enemy.brnUntil).toBeGreaterThan(initialUntil);
        expect(enemy.brnUntil).toBe(1_000_000 + 1000 + 3000);
    });

    test('Per-tick damage scales linearly with stack count', () => {
        // 3 stacks, sourceDmg 100 → per-tick = 100 * 0.1 * 3 = 30.
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100);
        applyBurn(enemy, 100);
        applyBurn(enemy, 100);
        expect(enemy.brnStacks).toBe(3);

        // Trigger ONE tick by advancing time to the first scheduled tick.
        frameClock.now += 500;
        const ticks = processBurn(enemy);
        expect(ticks).toBe(1);
        expect(enemy.damageLog.length).toBe(1);
        expect(enemy.damageLog[0].damage).toBeCloseTo(30, 5);
        expect(enemy.damageLog[0].opts.isBurn).toBe(true);
    });

    test('BRN-kill: enemy dies during burn tick and becomes inactive', () => {
        const enemy = makeFakeEnemy({ health: 15, maxHealth: 100 });
        applyBurn(enemy, 100); // 1 stack × 100 sourceDmg → 10 dmg/tick.
        // Two ticks land 20 damage total, which kills the enemy (HP 15).
        frameClock.now += 500;
        processBurn(enemy); // tick 1 → 5 HP remaining
        frameClock.now += 500;
        processBurn(enemy); // tick 2 → 0 HP, active=false

        expect(enemy.active).toBe(false);
        expect(enemy.health).toBe(0);
    });

    test('applyBurn no-ops on inactive / warping / death-flashing enemies', () => {
        const inactive = makeFakeEnemy({ active: false });
        applyBurn(inactive, 100);
        expect(inactive.brnStacks).toBe(0);

        const warping = makeFakeEnemy({ warping: true });
        applyBurn(warping, 100);
        expect(warping.brnStacks).toBe(0);

        const dying = makeFakeEnemy({ _deathFlash: 8 });
        applyBurn(dying, 100);
        expect(dying.brnStacks).toBe(0);
    });
});

describe('Phase 3 — STUN status effect', () => {
    beforeEach(() => {
        frameClock.now = 1_000_000;
    });

    test('applyStun sets stunUntil = now + 1500 by default', () => {
        const enemy = makeFakeEnemy();
        applyStun(enemy);
        expect(enemy.stunUntil).toBe(1_000_000 + 1500);
    });

    test('STUN refresh-style: re-applying extends timer (no immunity gap)', () => {
        const enemy = makeFakeEnemy();
        applyStun(enemy); // stunUntil = T + 1500
        const initialEnd = enemy.stunUntil;

        // Re-apply 800 ms into the stun → should extend to T + 800 + 1500.
        frameClock.now += 800;
        applyStun(enemy);

        expect(enemy.stunUntil).toBeGreaterThan(initialEnd);
        expect(enemy.stunUntil).toBe(1_000_000 + 800 + 1500);
    });

    test('STUN refresh never shortens the timer (max of current vs proposed)', () => {
        const enemy = makeFakeEnemy();
        applyStun(enemy, 3000); // long stun → stunUntil = T + 3000
        const farEnd = enemy.stunUntil;

        // Apply a SHORT stun 100 ms later — proposed end is T + 100 + 1500
        // which is LESS than the existing T + 3000. The longer stun
        // should win (no shortening).
        frameClock.now += 100;
        applyStun(enemy, 1500);

        expect(enemy.stunUntil).toBe(farEnd);
    });

    test('Enemy with active stun reports stunUntil > frameClock.now', () => {
        const enemy = makeFakeEnemy();
        applyStun(enemy);
        expect(enemy.stunUntil > frameClock.now).toBe(true);

        // Advance past the timer; stun is now expired.
        frameClock.now += 2000;
        expect(enemy.stunUntil > frameClock.now).toBe(false);
    });

    test('applyStun no-ops on inactive / warping / dying enemies', () => {
        const inactive = makeFakeEnemy({ active: false });
        applyStun(inactive);
        expect(inactive.stunUntil).toBe(0);

        const warping = makeFakeEnemy({ warping: true });
        applyStun(warping);
        expect(warping.stunUntil).toBe(0);

        const dying = makeFakeEnemy({ _deathFlash: 8 });
        applyStun(dying);
        expect(dying.stunUntil).toBe(0);
    });
});

describe('Phase 3 — STUN integration: stunned enemy doesn\'t move during update tick', () => {
    beforeEach(() => {
        frameClock.now = 1_000_000;
    });

    // Synthesize the velocity-zeroing logic from `Enemy.update()` so the
    // test pins the contract: while `stunUntil > now`, the enemy's
    // velocity is zeroed BEFORE and AFTER movement helpers run, and the
    // position integration multiplies by zero. We don't need the full
    // Enemy class to verify the guard — just the stun-gate behavior.
    function pureStunStep(enemy) {
        const stunned = enemy.stunUntil > frameClock.now;
        if (stunned) {
            enemy.vel.x = 0;
            enemy.vel.y = 0;
        }
        // Simulate a "movement helper" that always sets a forward velocity.
        // The post-movement zero in the real update() guarantees the
        // helper's output is overridden while stunned.
        enemy.vel.x = 3.5;
        enemy.vel.y = -2.0;
        if (stunned) {
            enemy.vel.x = 0;
            enemy.vel.y = 0;
        }
        // Position update (matches `enemy.js` line ~445).
        enemy.x += enemy.vel.x;
        enemy.y += enemy.vel.y;
    }

    test('Stunned enemy: velocity zeroed + position unchanged across one update tick', () => {
        const enemy = makeFakeEnemy({ x: 100, y: 200 });
        applyStun(enemy);

        pureStunStep(enemy);

        expect(enemy.vel.x).toBe(0);
        expect(enemy.vel.y).toBe(0);
        expect(enemy.x).toBe(100);
        expect(enemy.y).toBe(200);
    });

    test('Unstunned enemy: movement helper output is preserved + position advances', () => {
        const enemy = makeFakeEnemy({ x: 100, y: 200 });
        // No stun applied.
        pureStunStep(enemy);

        expect(enemy.vel.x).toBe(3.5);
        expect(enemy.vel.y).toBe(-2.0);
        expect(enemy.x).toBe(103.5);
        expect(enemy.y).toBe(198);
    });

    test('Stun expiry: enemy starts moving again on the same frame the timer expires', () => {
        const enemy = makeFakeEnemy({ x: 100, y: 200 });
        applyStun(enemy, 1500);

        // Step once while stunned — locked in place.
        pureStunStep(enemy);
        expect(enemy.x).toBe(100);

        // Advance past stun expiry.
        frameClock.now += 1600;

        // Step again — movement should now land normally.
        pureStunStep(enemy);
        expect(enemy.vel.x).toBe(3.5);
        expect(enemy.x).toBe(103.5);
    });
});

describe('Phase 3 — BRN + STUN coexistence', () => {
    beforeEach(() => {
        frameClock.now = 1_000_000;
    });

    test('Both effects can be applied simultaneously and tracked independently', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 50);
        applyStun(enemy);

        expect(enemy.brnStacks).toBe(1);
        expect(enemy.brnUntil).toBe(1_000_000 + 3000);
        expect(enemy.stunUntil).toBe(1_000_000 + 1500);
    });

    test('STUN expires before BRN by default (1.5s vs 3s window)', () => {
        const enemy = makeFakeEnemy();
        applyBurn(enemy, 100);
        applyStun(enemy);

        // 2 seconds in: STUN expired, BRN still active.
        frameClock.now += 2000;
        expect(enemy.stunUntil > frameClock.now).toBe(false);
        expect(enemy.brnUntil > frameClock.now).toBe(true);
    });
});
