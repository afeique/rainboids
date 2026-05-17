/**
 * tests/unit/sim/mobile-enemy.test.js — 5.99.0 update
 *
 * Pins the 5.99 mobile combat redesign at the enemy-AI layer:
 *   1) Enemies DO fire on mobile (the 5.95 short-circuit is removed).
 *      `decideEnemyShooting` runs the same desktop pipeline.
 *   2) Enemies WEAVE laterally toward perpendicular-to-player instead
 *      of kamikazeing into the player. Each enemy carries a per-instance
 *      `_weavePhase` so the field doesn't pulse in lockstep.
 *   3) Bosses are still exempt from the mobile-only modifier (formation
 *      orbit AI takes priority).
 *
 * The pure-sim `updateEnemy` reads off the live `Enemy` instance
 * (Round-2 wrapper style), so this test stubs the minimum surface area
 * `updateEnemy` reads: vel, x/y, faceAngle, targetPlayer, config, plus
 * the AI helper methods (no-ops).
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

import { afterEach, describe, expect, test } from '@jest/globals';
import { updateEnemy } from '../../../js/sim/enemy.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

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

// ─── 1) Enemies fire on mobile now (5.99) ────────────────────────────

describe('updateEnemy — mobile enemies fire (5.99.0)', () => {
    test('mobile mode: enemy at point-blank range DOES emit enemy_fire* events', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        const ctx = makeCtx(player);
        const events = [];
        enemy.lastShot = -100000;

        updateEnemy(enemy, ctx, events);

        const fireEvents = events.filter(e => typeof e.type === 'string' && e.type.startsWith('enemy_fire'));
        expect(fireEvents.length).toBeGreaterThan(0);
    });

    test('desktop mode: enemy fires too (sanity check)', () => {
        _resetUrlOverrideForTests(false);
        const player = { x: 520, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        const ctx = makeCtx(player);
        const events = [];
        enemy.lastShot = -100000;

        updateEnemy(enemy, ctx, events);

        const fireEvents = events.filter(e => typeof e.type === 'string' && e.type.startsWith('enemy_fire'));
        expect(fireEvents.length).toBeGreaterThan(0);
    });
});

// ─── 2) Lateral weave instead of kamikaze pull ───────────────────────

describe('updateEnemy — mobile lateral weave (5.99.0)', () => {
    test('mobile mode: enemy vel weaves PERPENDICULAR to the player-line (not toward player)', () => {
        _resetUrlOverrideForTests(true);
        // Player offset on the +x axis. Perpendicular axes are ±y.
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        // Force the weave phase so sin(phase) ≈ +1 — biggest +y swing.
        enemy._weavePhase = Math.PI / 2 - (1.4 * Math.PI * 2 / 60);
        const ctx = makeCtx(player);
        updateEnemy(enemy, ctx, []);

        // Perpendicular axis is y (player offset is purely x). vel.y
        // gains a near-MOBILE_WEAVE_FORCE swing; vel.x stays ~0.
        expect(Math.abs(enemy.vel.y)).toBeGreaterThan(0.5);
        expect(Math.abs(enemy.vel.x)).toBeLessThan(0.05);
    });

    test('mobile mode: weave averages to ~0 over many cycles (sin-phased, mean=0)', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 600, y: 400, active: true };
        const ctx = makeCtx(player);

        // Sample many enemies with random phases — the per-enemy weave
        // averages to ~0 across the population, so the field has no
        // net drift bias toward (or away from) the player.
        let sumVx = 0, sumVy = 0;
        const N = 200;
        for (let i = 0; i < N; i++) {
            const e = makeEnemy({ x: 500, y: 400 });
            e._weavePhase = Math.random() * Math.PI * 2;
            updateEnemy(e, ctx, []);
            sumVx += e.vel.x;
            sumVy += e.vel.y;
        }
        // Mean of sin-phased samples → 0 (tight tolerance because N is large).
        expect(Math.abs(sumVx / N)).toBeLessThan(0.15);
        expect(Math.abs(sumVy / N)).toBeLessThan(0.15);
    });

    test('desktop mode: no mobile-only weave is applied', () => {
        _resetUrlOverrideForTests(false);
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400 });
        const ctx = makeCtx(player);
        const beforeVx = enemy.vel.x;
        const beforeVy = enemy.vel.y;

        updateEnemy(enemy, ctx, []);

        // No movement helper moves the enemy in this stub; vel stays at 0
        // on desktop because the mobile weave block is gated off.
        expect(enemy.vel.x).toBe(beforeVx);
        expect(enemy.vel.y).toBe(beforeVy);
    });

    test('mobile mode: bosses are EXEMPT from the weave (formation/orbit AI takes priority)', () => {
        _resetUrlOverrideForTests(true);
        const player = { x: 600, y: 400, active: true };
        const enemy = makeEnemy({ x: 500, y: 400, isBoss: true, bossTier: 1 });
        const ctx = makeCtx(player);

        updateEnemy(enemy, ctx, []);

        expect(enemy.vel.x).toBe(0);
        expect(enemy.vel.y).toBe(0);
    });
});
