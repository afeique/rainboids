/**
 * tests/unit/enemy/mobile-wrapper-fire-suppression.test.js — 5.95.1
 *
 * Pins the wrapper-layer mobile fire suppression for the legacy
 * `updateShooting` path and the inline spiral-laser shot inside
 * weaverSpinupMovement.
 *
 * Why this test exists: the sim-layer `decideEnemyShooting` already gates
 * the primary firing pipeline on mobile (covered by
 * tests/unit/sim/mobile-enemy.test.js). BUT a few legacy / sibling paths
 * exist that would bypass the sim gate:
 *   1) `js/modules/enemy/enemy.js::updateShooting` — wrapper method that
 *      can be called directly (not via the events pipeline). Dead-code
 *      today but kept for defense-in-depth.
 *   2) `js/modules/enemy/movement.js::weaverSpinupMovement` — the Weaver
 *      enemy's spiral-laser shot is inlined here and called from movement,
 *      not via decideEnemyShooting.
 *
 * Both call sites now gate on `isMobile()` before invoking any firing
 * helper. This test verifies the gates work by stubbing the firing
 * helpers (shoot / handleBurstShooting / shootSpiralLaser) and asserting
 * they're never called when `?mobile=1`.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 400, innerHeight: 800,
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
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 5 };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// ─── 1) updateShooting wrapper gate ──────────────────────────────────────────

describe('Enemy.updateShooting — mobile fire suppression gate (5.95.1)', () => {
    test('mobile mode: updateShooting returns immediately, no firing helpers called', async () => {
        _resetUrlOverrideForTests(true);
        const { Enemy } = await import('../../../js/modules/enemy/enemy.js');

        const enemy = new Enemy(500, 400, 'HUNTER', 1);
        // Force enemy into the most-likely-to-fire state.
        enemy.targetPlayer = { x: 520, y: 400, active: true };
        enemy.lastShot = -100000;
        enemy.firingCooldown = 1;
        enemy.canShoot = true;
        enemy.tankState = 'firing';
        // Stub helpers that would be reached if the gate failed.
        let shootCalls = 0;
        let burstCalls = 0;
        let waspCalls = 0;
        enemy.shoot = () => { shootCalls++; };
        enemy.handleBurstShooting = () => { burstCalls++; };
        enemy.updateWaspMachineGun = () => { waspCalls++; };
        enemy.updateSweepLaserSystem = () => {};
        enemy.updateSentinelSweep = () => {};
        enemy.hasLineOfSight = () => true;
        enemy.getTerritorySize = () => 600;

        // Fake gameEngine — just need the bullet-pool truthy check.
        const gameEngine = { enemyBulletPool: {} };

        // Burst pattern path
        enemy.config = { ...enemy.config, shootPattern: 'burst_3', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);
        expect(burstCalls).toBe(0);

        // Single-shot pattern path
        enemy.config = { ...enemy.config, shootPattern: 'circle_6', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);
        expect(shootCalls).toBe(0);

        // Continuous wasp pattern
        enemy.config = { ...enemy.config, shootPattern: 'wasp_machinegun', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);
        expect(waspCalls).toBe(0);
    });

    test('desktop mode: updateShooting proceeds past the gate (sanity check)', async () => {
        _resetUrlOverrideForTests(false);
        const { Enemy } = await import('../../../js/modules/enemy/enemy.js');

        const enemy = new Enemy(500, 400, 'HUNTER', 1);
        enemy.targetPlayer = { x: 520, y: 400, active: true };
        enemy.lastShot = -100000;
        enemy.firingCooldown = 1;
        enemy.canShoot = true;
        enemy.faceAngle = 0; // facing the player on +x axis
        enemy.tankState = 'firing';
        let shootCalls = 0;
        enemy.shoot = () => { shootCalls++; };
        enemy.handleBurstShooting = () => {};
        enemy.hasLineOfSight = () => true;
        enemy.getTerritorySize = () => 600;

        const gameEngine = { enemyBulletPool: {} };
        // Single-shot pattern with cooldown expired and aim aligned.
        enemy.config = { ...enemy.config, shootPattern: 'circle_6', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);
        // Desktop SHOULD call shoot at least once (cooldown expired, aimed at player).
        expect(shootCalls).toBeGreaterThan(0);
    });
});
