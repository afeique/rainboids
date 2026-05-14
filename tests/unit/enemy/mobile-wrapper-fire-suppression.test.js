/**
 * tests/unit/enemy/mobile-wrapper-fire-suppression.test.js — 5.99.0 update
 *
 * Renamed in spirit only — the pre-5.99 test pinned the 5.95 mobile-fire
 * SUPPRESSION at the legacy wrapper layer. 5.99 reverses that decision:
 * mobile enemies fire again, so the wrapper layer must NOT short-circuit.
 *
 * This file is the inverse contract: assert that `Enemy.updateShooting`
 * proceeds to call its firing helpers on mobile just like on desktop, so
 * a regression that re-introduces a wrapper-layer mobile gate would
 * fail loudly.
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

describe('Enemy.updateShooting — mobile no-suppression (5.99.0)', () => {
    test('mobile mode: updateShooting still reaches the firing helpers', async () => {
        _resetUrlOverrideForTests(true);
        const { Enemy } = await import('../../../js/modules/enemy/enemy.js');

        const enemy = new Enemy(500, 400, 'HUNTER', 1);
        enemy.targetPlayer = { x: 520, y: 400, active: true };
        enemy.lastShot = -100000;
        enemy.firingCooldown = 1;
        enemy.canShoot = true;
        enemy.faceAngle = 0; // aimed at player on +x axis
        enemy.tankState = 'firing';
        let shootCalls = 0;
        enemy.shoot = () => { shootCalls++; };
        enemy.handleBurstShooting = () => {};
        enemy.updateWaspMachineGun = () => {};
        enemy.updateSweepLaserSystem = () => {};
        enemy.updateSentinelSweep = () => {};
        enemy.hasLineOfSight = () => true;
        enemy.getTerritorySize = () => 600;

        const gameEngine = { enemyBulletPool: {} };
        enemy.config = { ...enemy.config, shootPattern: 'circle_6', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);

        expect(shootCalls).toBeGreaterThan(0);
    });

    test('desktop mode: updateShooting reaches the firing helpers (sanity check)', async () => {
        _resetUrlOverrideForTests(false);
        const { Enemy } = await import('../../../js/modules/enemy/enemy.js');

        const enemy = new Enemy(500, 400, 'HUNTER', 1);
        enemy.targetPlayer = { x: 520, y: 400, active: true };
        enemy.lastShot = -100000;
        enemy.firingCooldown = 1;
        enemy.canShoot = true;
        enemy.faceAngle = 0;
        enemy.tankState = 'firing';
        let shootCalls = 0;
        enemy.shoot = () => { shootCalls++; };
        enemy.handleBurstShooting = () => {};
        enemy.hasLineOfSight = () => true;
        enemy.getTerritorySize = () => 600;

        const gameEngine = { enemyBulletPool: {} };
        enemy.config = { ...enemy.config, shootPattern: 'circle_6', movePattern: 'chase' };
        enemy.updateShooting(gameEngine);
        expect(shootCalls).toBeGreaterThan(0);
    });
});
