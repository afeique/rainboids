/**
 * tests/unit/sim/mobile-enemy.test.js — 5.95.0
 *
 * Pins the mobile fruit-ninja redesign at the enemy-AI layer:
 *   1) Enemies NEVER fire on mobile. `decideEnemyShooting` is the
 *      single point that emits `enemy_fire*` events; the mobile gate
 *      short-circuits BEFORE any event is pushed. We verify by
 *      driving `updateEnemy` with a typical enemy state at point-
 *      blank range and asserting the events array stays empty of any
 *      `enemy_fire*` event type.
 *
 *   2) Enemies kamikaze toward the player. The MOBILE_KAMIKAZE_FORCE
 *      adds a unit-direction-scaled velocity bias each tick. We
 *      verify by giving an enemy a starting vel of (0,0) and a
 *      player offset to one side, then asserting vel ends up biased
 *      toward the player.
 *
 * The pure-sim `updateEnemy` reads off the live `Enemy` instance
 * (Round-2 wrapper style — see js/sim/enemy.js header), so this test
 * stubs the minimum surface area: vel, x/y, faceAngle, targetPlayer,
 * config, plus the AI helper methods (no-ops). Mirrors the shape used
 * by tests/unit/boss-rage.test.js.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
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

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { updateEnemy } from '../../../js/sim/enemy.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

// Build a synthetic Enemy-like object matching the live class surface
// `updateEnemy` reads off. All AI helpers are no-ops; we only care
// about the firing-decision and kamikaze-bias branches.
function makeEnemy(overrides = {}) {
    return {
        active: true,
        warping: false,
        isBoss: false,
        x: 500, y: 400,
        vel: { x: 0, y: 0 },
        radius: 20,
        health: 100, maxHealth: 100,
        rotation: 0, rotationSpeed: 0,
        faceAngle: 0,
        lastShot: 0,
        firingCooldown: 1000,
        level: 1,
        type: 'HUNTER',
        config: {
            speed: 2,
            movePattern: 'chase',
            shootPattern: 'circle_6',
        },
        currentTarget: 'player',
        targetPlayer: null,
        _deathFlash: 0,
        _aiOffset: 0,
        // AI methods that updateEnemy invokes — all no-ops for this test.
        updateTargetPriority() {},
        updateFaceDirection() {},
        updateMovement() {},
        updateEvasiveManeuvers() {},
        avoidAsteroids() {},
        maintainDistanceFromPlayer() {},
        maintainDistanceFromEnemies() {},
        patrolTerritory() {},
        dodgeEnemyBullets() {},
        dodgePlayerBullets() {},
        addMicroMovements() {},
        addFishLikeMovement() {},
        updateLightTrail() {},
        createTrailParticles() {},
        getTerritorySize() { return 600; },
        hasLineOfSight() { return true; },
        ...overrides,
    };
}

function makeCtx(playerRef) {
    return {
        gameEngine: {
            // Minimal stub — `decideEnemyShooting` only checks for the
            // pool's existence, not its method surface.
            enemyBulletPool: {},
            game: { currentWave: 1 },
            uiManager: null,
        },
        ships: playerRef ? [playerRef] : [],
        field: { width: 1920, height: 1080 },
        dt: 1 / 60,
        rng: null,
        tick: 0,
        wave: 1,
    };
}

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// ─── 1) Enemies don't fire on mobile ─────────────────────────────────

describe('updateEnemy — mobile fire suppression (5.95.0)', () => {
    test('mobile mode: enemy at point-blank range emits NO enemy_fire* events', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        const ctx = makeCtx(player);
        const events = [];

        // Cycle the firing cooldown so the non-burst path WOULD fire
        // if not gated. lastShot far in the past.
        enemy.lastShot = -100000;

        for (let i = 0; i < 60; i++) {
            updateEnemy(enemy, ctx, events);
        }

        const fireEvents = events.filter(e => typeof e.type === 'string' && e.type.startsWith('enemy_fire'));
        expect(fireEvents).toHaveLength(0);
    });

    test('desktop mode: enemy at point-blank range CAN fire (sanity check)', () => {
        _resetUrlOverrideForTests(false);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        const ctx = makeCtx(player);
        const events = [];
        enemy.lastShot = -100000;

        // Just one tick — non-burst circle_6 should fire immediately
        // when cooldown is exhausted and aim is on target.
        updateEnemy(enemy, ctx, events);

        const fireEvents = events.filter(e => typeof e.type === 'string' && e.type.startsWith('enemy_fire'));
        expect(fireEvents.length).toBeGreaterThan(0);
    });

    test('mobile mode: burst-pattern enemies also skip firing', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({
            x: 500, y: 400,
            config: { speed: 2, movePattern: 'chase', shootPattern: 'burst_3' },
            burstState: { active: false, cooldownUntil: 0 },
        });
        const ctx = makeCtx(player);
        const events = [];
        for (let i = 0; i < 30; i++) updateEnemy(enemy, ctx, events);

        expect(events.some(e => e.type === 'enemy_fire_burst')).toBe(false);
    });

    test('mobile mode: continuous-pattern enemies (wasp_machinegun) also skip firing', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({
            x: 500, y: 400,
            type: 'WASP',
            config: { speed: 2, movePattern: 'chase', shootPattern: 'wasp_machinegun' },
        });
        const ctx = makeCtx(player);
        const events = [];
        for (let i = 0; i < 30; i++) updateEnemy(enemy, ctx, events);

        expect(events.some(e => e.type === 'enemy_fire_continuous')).toBe(false);
    });
});

// ─── 2) Enemies kamikaze toward player ───────────────────────────────

describe('updateEnemy — mobile kamikaze pull (5.95.0 → 5.95.1)', () => {
    test('mobile mode: enemy vel bends toward the player each tick', () => {
        _resetUrlOverrideForTests(true);
        // Player to the right of the enemy at (100, 0) offset.
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        // Suppress firing-cooldown advance for a clean test.
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];

        updateEnemy(enemy, ctx, events);

        // After one tick, vel.x should have gained a positive component
        // (toward the player on the +x axis). vel.y has only the random-
        // walk component (kamikaze dy=0), so allow a small tolerance.
        // Kamikaze force = 2.5, random walk = 0.5 → vel.x ≥ 2.0 worst case.
        expect(enemy.vel.x).toBeGreaterThan(1.5);
        expect(Math.abs(enemy.vel.y)).toBeLessThan(0.5);
    });

    test('mobile mode: kamikaze pull is direction-dominant (4:3 bias toward player)', () => {
        _resetUrlOverrideForTests(true);
        // 3-4-5 triangle: dx=3, dy=4, dist=5
        const player = { x: 503, y: 404, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];

        // Average many ticks so the random-walk component (mean=0)
        // averages out and the kamikaze direction dominates the ratio.
        let sumVx = 0, sumVy = 0;
        const N = 200;
        for (let i = 0; i < N; i++) {
            const e = makeEnemy({ x: 500, y: 400 });
            e.lastShot = Date.now();
            const ev = [];
            updateEnemy(e, ctx, ev);
            sumVx += e.vel.x;
            sumVy += e.vel.y;
        }
        const avgVx = sumVx / N;
        const avgVy = sumVy / N;
        // Force = 2.5 → vx += 2.5 * 0.6 = 1.5, vy += 2.5 * 0.8 = 2.0.
        // Ratio = 2.0 / 1.5 = 4/3. Random walk averages to ~0.
        // Allow loose tolerance (random walk has variance per N samples).
        const ratio = avgVy / avgVx;
        expect(ratio).toBeCloseTo(4 / 3, 1);
    });

    test('mobile mode: velocity is capped (MOBILE_MAX_KAMIKAZE_SPEED safety net)', () => {
        _resetUrlOverrideForTests(true);
        // Player far away so kamikaze normalized direction is stable.
        const player = { x: 5000, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        // Pre-load a huge velocity to trigger the cap branch.
        enemy.vel.x = 100;
        enemy.vel.y = 100;
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];

        updateEnemy(enemy, ctx, events);

        // After one tick the cap should clamp the velocity magnitude.
        // 6.0 is the cap, allow tiny floating-point slack.
        const sp = Math.hypot(enemy.vel.x, enemy.vel.y);
        expect(sp).toBeLessThanOrEqual(6.0 + 1e-6);
    });

    test('desktop mode: no kamikaze pull is applied', () => {
        _resetUrlOverrideForTests(false);
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];
        const beforeVx = enemy.vel.x;

        updateEnemy(enemy, ctx, events);

        // No movement helper actually moves the enemy in this stub; vel
        // should remain exactly 0 on desktop (no random walk either).
        expect(enemy.vel.x).toBe(beforeVx);
        expect(enemy.vel.y).toBe(0);
    });

    test('mobile mode: bosses are EXEMPT from the kamikaze pull (formation/orbit AI takes priority)', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400, isBoss: true, bossTier: 1 });
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];

        updateEnemy(enemy, ctx, events);

        // Boss exempt: vel stays at 0 (no kamikaze and no random walk).
        expect(enemy.vel.x).toBe(0);
        expect(enemy.vel.y).toBe(0);
    });
});
