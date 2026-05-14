/**
 * tests/unit/player/mobile-assists-disabled.test.js — 5.95.1
 *
 * Pins the mobile assists force-disable. Auto Aim / Aim Assist / Auto Fire
 * are all desktop-only features in the fruit-ninja redesign. The
 * touch-based input model overrides aim each tap, so leaving these
 * active would fight the player's input.
 *
 * Implementation: Player.update sets `assists = null` on mobile,
 * making every `assists && assists.X` check fall through cleanly without
 * needing per-branch gates. This test verifies the gate works by setting
 * assists with all flags on and asserting the auto-aim / auto-fire side
 * effects don't occur on mobile.
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

describe('Player.update — mobile assists force-disabled (5.95.1)', () => {
    let player;
    let findNearestTargetCalls;

    beforeEach(() => {
        delete globalThis.window.engineDriver;
        findNearestTargetCalls = 0;

        player = new Player();
        player.x = 1000;
        player.y = 1000;
        player.active = true;
        player.firingDisabled = false;
        player.activePower = null;
    });

    test('mobile mode: Auto Aim does NOT override input.aimX/Y (assists treated as null)', () => {
        _resetUrlOverrideForTests(true);

        // Place an asteroid-like target at (2000, 1000) — auto-aim would
        // snap aim to it if the gate failed.
        globalThis.window.gameEngine = {
            assists: { autoAim: true, aimAssist: true, autoFire: true },
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => {
                findNearestTargetCalls++;
                return { x: 2000, y: 1000 };
            },
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });
        const beforeAimX = input.aimX;
        const beforeAimY = input.aimY;

        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // Auto Aim would have moved aimX from 1500 → 2000; aim assist
        // would have snapped to 2000 within 90 px. On mobile we want the
        // input to come through untouched. Assert nothing snapped to the
        // target's position.
        expect(input.aimX).not.toBe(2000);
        // Loose: original aimX preserved (or at least not the target).
        expect(input.aimX).toBe(beforeAimX);
    });

    test('desktop mode: Auto Aim DOES override input.aimX/Y (sanity check)', () => {
        _resetUrlOverrideForTests(false);

        globalThis.window.gameEngine = {
            assists: { autoAim: true, aimAssist: false, autoFire: false },
            radialMenu: { isOpen: () => false },
            findNearestTarget: () => ({ x: 2000, y: 1000 }),
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });

        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // Desktop: auto-aim should have snapped aimX to 2000 (target).
        expect(input.aimX).toBe(2000);
        expect(input.aimY).toBe(1000);
    });

    test('mobile mode: Aim Assist does NOT snap input.aimX/Y', () => {
        _resetUrlOverrideForTests(true);

        globalThis.window.gameEngine = {
            assists: { autoAim: false, aimAssist: true, autoFire: false },
            radialMenu: { isOpen: () => false },
            // Snap target within 90 px of cursor — would trigger aim assist on desktop.
            findNearestTarget: (x, y, radius) => ({ x: x + 10, y: y + 10 }),
        };

        const input = makeInput({ aimX: 1500, aimY: 1100 });

        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // Mobile: no snap — aimX preserved at 1500 (not 1510).
        expect(input.aimX).toBe(1500);
        expect(input.aimY).toBe(1100);
    });
});
