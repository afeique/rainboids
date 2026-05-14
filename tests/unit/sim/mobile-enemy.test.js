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

describe('updateEnemy — mobile kamikaze pull (5.95.0)', () => {
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
        // (toward the player on the +x axis). vel.y unchanged because
        // dy = 0 → contribution along y is 0.
        expect(enemy.vel.x).toBeGreaterThan(0);
        expect(enemy.vel.y).toBeCloseTo(0, 5);
    });

    test('mobile mode: kamikaze pull is direction-only (unit normalized)', () => {
        _resetUrlOverrideForTests(true);
        // 3-4-5 triangle: dx=3, dy=4, dist=5
        const player = { x: 503, y: 404, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];
        updateEnemy(enemy, ctx, events);

        // After unit normalize: dx/dist = 0.6, dy/dist = 0.8.
        // Force = 0.6 → vx += 0.6 * 0.6 = 0.36, vy += 0.6 * 0.8 = 0.48.
        // Position then integrates so x/y change too; we only assert
        // direction on vel which is the bias source.
        const ratio = enemy.vel.y / enemy.vel.x;
        // ratio = 0.8 / 0.6 = 1.333...
        expect(ratio).toBeCloseTo(4 / 3, 5);
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
        // should remain exactly 0 on desktop.
        expect(enemy.vel.x).toBe(beforeVx);
    });

    test('mobile mode: bosses are EXEMPT from the kamikaze pull (formation/orbit AI takes priority)', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400, isBoss: true, bossTier: 1 });
        enemy.lastShot = Date.now();
        const ctx = makeCtx(player);
        const events = [];

        updateEnemy(enemy, ctx, events);

        // Boss exempt: vel.x stays at 0 (no kamikaze contribution).
        expect(enemy.vel.x).toBe(0);
    });
});
