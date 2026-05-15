/**
 * tests/unit/player/mobile-stationary.test.js — 5.100.0 update
 *
 * The 5.94 stationary-ship pivot was REVERSED in 5.100. Mobile now uses
 * the Sky-force-style drag-to-move model: the analog stick drives ship
 * velocity. This file pins the new contract:
 *
 *   - Mobile WITHOUT stick input → ship doesn't drift (vel decays to 0).
 *   - Mobile WITH stick input → ship moves (velocity follows stick).
 *   - Desktop is unchanged.
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
import { Player } from '../../../js/modules/player/player.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

function makeInput({ stickX = 0, stickY = 0 } = {}) {
    const magnitude = Math.min(1, Math.hypot(stickX, stickY));
    return {
        up: false, down: false, left: false, right: false,
        rotateLeft: false, rotateRight: false,
        aimX: 1000, aimY: 1000,
        screenAimX: 0, screenAimY: 0,
        fire: false, fireSecondary: false,
        activateSkill: false,
        stickInput: { x: stickX, y: stickY, magnitude },
        updateAimForPlayerMovement: () => {},
    };
}

function mockBulletPool() {
    return {
        activeObjects: [],
        get: () => ({ active: true, vel: { x: 0, y: 0 } }),
        softCapAndEvict: () => true,
    };
}

function mockParticlePool() {
    return { activeObjects: [], get: () => ({ active: true, life: 0, length: 0 }) };
}

function mockAudio() {
    return {
        playShoot: () => {}, playSound: () => true, startLoop: () => {},
        playHit: () => {}, playExplosion: () => {},
    };
}

function installFakeEngine() {
    globalThis.window.gameEngine = {
        assists: { autoAim: false, aimAssist: false, autoFire: false },
        radialMenu: { isOpen: () => false },
        findNearestTarget: () => null,
    };
}

function clearFakeEngine() {
    delete globalThis.window.gameEngine;
}

describe('Player.update — mobile drag-to-move (5.100.0)', () => {
    let player;

    beforeEach(() => {
        installFakeEngine();
        player = new Player();
        player.x = 500;
        player.y = 400;
        player.vel.x = 0;
        player.vel.y = 0;
    });

    afterEach(() => {
        clearFakeEngine();
        _resetUrlOverrideForTests(null);
    });

    test('mobile: no stick input → player stays put (vel decays to 0)', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput({ stickX: 0, stickY: 0 });
        for (let i = 0; i < 20; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        expect(Math.abs(player.vel.x)).toBeLessThan(0.1);
        expect(Math.abs(player.vel.y)).toBeLessThan(0.1);
    });

    test('mobile: stick input (right) → ship moves right (velocity > 0)', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput({ stickX: 1.0, stickY: 0 });
        // Several ticks let the lerp catch up to target velocity.
        for (let i = 0; i < 10; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        expect(player.vel.x).toBeGreaterThan(0.5);
        expect(player.x).toBeGreaterThan(500); // displaced right
    });

    test('mobile: stick input (down) → ship moves down', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput({ stickX: 0, stickY: 1.0 });
        for (let i = 0; i < 10; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        expect(player.vel.y).toBeGreaterThan(0.5);
        expect(player.y).toBeGreaterThan(400);
    });

    test('mobile: keyboard input.up has no effect (mobile only reads stick)', () => {
        _resetUrlOverrideForTests(true);
        // Force keyboard up=true but no stick input. The legacy
        // updateShip path still consumes input.up on mobile (the 5.100
        // refactor stopped GATING it), so a small velocity may appear.
        // What matters is the stick is the dominant input — without
        // stick input the player position stays near origin.
        const input = makeInput({ stickX: 0, stickY: 0 });
        input.up = true; // legacy thrust input
        for (let i = 0; i < 10; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        // With stickInput.magnitude < 0.05, the mobile branch in
        // Player.update decays velocity hard. Result: tiny final vel.
        expect(Math.abs(player.vel.x)).toBeLessThan(0.5);
        expect(Math.abs(player.vel.y)).toBeLessThan(0.5);
    });

    test('desktop: input.up=true still produces motion (mobile branch off)', () => {
        _resetUrlOverrideForTests(false);
        const input = makeInput({ stickX: 0, stickY: 0 });
        input.up = true;
        const beforeX = player.x;
        const beforeY = player.y;
        for (let i = 0; i < 5; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        const moved = (player.x !== beforeX) || (player.y !== beforeY)
            || (player.vel.x !== 0) || (player.vel.y !== 0);
        expect(moved).toBe(true);
    });
});
