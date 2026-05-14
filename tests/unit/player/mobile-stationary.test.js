/**
 * tests/unit/player/mobile-stationary.test.js — 5.94.0
 *
 * Pins the stationary-player invariant on mobile. The 5.94.0 tower-
 * defense pivot gates movement input at the Player.update level: even if
 * `input.up/down/left/right` are all true (e.g. a test or rogue input
 * source sets them), the physics step in mobile mode must not displace
 * the ship and must leave velocity at (0, 0).
 *
 * Strategy mirrors mobile-auto-fire.test.js: shim browser globals, flip
 * the `isMobile()` URL override via `_resetUrlOverrideForTests`, drive
 * Player.update with a synthetic input that requests motion, then check
 * the post-update position + velocity.
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

function makeInput(motion = false) {
    return {
        up: motion, down: false, left: motion, right: false,
        rotateLeft: false, rotateRight: false,
        aimX: 1000, aimY: 1000,
        screenAimX: 0, screenAimY: 0,
        fire: false, fireSecondary: false,
        activateSkill: false,
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
        playShoot: () => {},
        playSound: () => true,
        startLoop: () => {},
        playHit: () => {},
        playExplosion: () => {},
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

describe('Player.update — mobile stationary invariant (5.94.0)', () => {
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

    test('mobile mode: input.up=true leaves player position unchanged', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput(true);
        const beforeX = player.x;
        const beforeY = player.y;
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        expect(player.x).toBe(beforeX);
        expect(player.y).toBe(beforeY);
    });

    test('mobile mode: velocity stays exactly 0 after a motion-input tick', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput(true);
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        expect(player.vel.x).toBe(0);
        expect(player.vel.y).toBe(0);
    });

    test('mobile mode: 50 ticks of motion input still leaves position unchanged', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput(true);
        const beforeX = player.x;
        const beforeY = player.y;
        for (let i = 0; i < 50; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        expect(player.x).toBe(beforeX);
        expect(player.y).toBe(beforeY);
        expect(player.vel.x).toBe(0);
        expect(player.vel.y).toBe(0);
    });

    test('mobile mode: aim angle still updates (only movement is locked)', () => {
        _resetUrlOverrideForTests(true);
        const input = makeInput(false);
        // Aim to the right of the player (player is at 500,400; aim 1000,400).
        input.aimX = 1000;
        input.aimY = 400;
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        // atan2(0, 500) = 0 (facing right)
        expect(player.angle).toBeCloseTo(0, 3);
    });

    test('desktop mode: input.up=true still produces motion', () => {
        _resetUrlOverrideForTests(false);
        const input = makeInput(true);
        const beforeX = player.x;
        const beforeY = player.y;
        // One tick may produce only a tiny displacement, so run a few.
        for (let i = 0; i < 5; i++) {
            player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        }
        // Some velocity OR position change is expected on desktop.
        const moved = (player.x !== beforeX) || (player.y !== beforeY)
            || (player.vel.x !== 0) || (player.vel.y !== 0);
        expect(moved).toBe(true);
    });
});
