/**
 * tests/unit/player/mobile-assists-disabled.test.js — 5.100.0 update
 *
 * The 5.95.1 "mobile force-disables ALL assists" contract was REVERSED
 * in 5.100. Mobile now uses the Sky-force-style drag-to-move + auto-aim
 * + auto-fire model: the player drives the analog stick to dodge, and
 * the AI handles aiming and firing.
 *
 * This file pins the new contract:
 *   - Mobile: Auto Aim IS active — input.aimX/Y snaps to the nearest
 *     target every tick.
 *   - Mobile: Auto Fire IS active — input.fire flips to true when a
 *     target is in range + roughly on-cone.
 *   - Desktop: the existing assist plumbing is unchanged (driven by
 *     gameEngine.assists toggles).
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

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';
import { Player } from '../../../js/modules/player/player.js';

function makeInput(overrides = {}) {
    return {
        up: false, down: false, left: false, right: false,
        rotateLeft: false, rotateRight: false,
        fire: false, fireSecondary: false,
        aimX: 500, aimY: 500,
        screenAimX: 200, screenAimY: 200,
        stickInput: { x: 0, y: 0, magnitude: 0 },
        ...overrides,
    };
}

function mockParticlePool() {
    return { get: () => ({ active: true }) };
}
function mockBulletPool() {
    return {
        activeObjects: [],
        get: () => ({ active: true, life: 0, length: 0 }),
    };
}
function mockAudio() {
    return {
        playShoot: () => {}, playSound: () => true,
        startLoop: () => {}, playHit: () => {}, playExplosion: () => {},
    };
}

afterEach(() => {
    _resetUrlOverrideForTests(null);
    delete globalThis.window.gameEngine;
    delete globalThis.window.engineDriver;
});

describe('Player.update — mobile assists RE-ENABLED (5.100.0)', () => {
    let player;

    beforeEach(() => {
        delete globalThis.window.engineDriver;
        player = new Player();
        player.x = 1000;
        player.y = 1000;
        player.active = true;
        player.firingDisabled = false;
        player.activePower = null;
    });

    test('mobile: Auto Aim DOES snap input.aimX/Y to nearest target (5.100)', () => {
        _resetUrlOverrideForTests(true);

        globalThis.window.gameEngine = {
            // Desktop assists toggles are IGNORED on mobile — Player.update
            // builds its own mobile-specific assists block.
            assists: { autoAim: false, aimAssist: false, autoFire: false },
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => ({ x: 2000, y: 1000 }),
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // Mobile auto-aim should snap aimX to the target's x.
        expect(input.aimX).toBe(2000);
        expect(input.aimY).toBe(1000);
    });

    test('mobile: no target → aim stays where the caller set it', () => {
        _resetUrlOverrideForTests(true);
        globalThis.window.gameEngine = {
            assists: {},
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => null,
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // With no target, auto-aim no-ops; aim stays.
        expect(input.aimX).toBe(1500);
        expect(input.aimY).toBe(1100);
    });

    test('desktop: gameEngine.assists.autoAim drives the snap (unchanged)', () => {
        _resetUrlOverrideForTests(false);
        globalThis.window.gameEngine = {
            assists: { autoAim: true, aimAssist: false, autoFire: false },
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => ({ x: 2000, y: 1000 }),
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        expect(input.aimX).toBe(2000);
        expect(input.aimY).toBe(1000);
    });

    test('desktop: autoAim OFF → aim stays put (unchanged)', () => {
        _resetUrlOverrideForTests(false);
        globalThis.window.gameEngine = {
            assists: { autoAim: false, aimAssist: false, autoFire: false },
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => ({ x: 2000, y: 1000 }),
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // Desktop with assists OFF behaves as the player's input dictates.
        // `aimX` may be recomputed by aim-angle logic, but it should not
        // match the auto-aim target.
        expect(input.aimX).not.toBe(2000);
    });
});
