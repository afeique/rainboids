/**
 * tests/unit/player/afterimage.test.js — P6 Afterimage passive.
 *
 * "Dashing leaves a clone that fires your primary once." Implemented as a free
 * one-shot primary volley fired from the dash ORIGIN at _triggerDash time (the
 * dash velocity integrates afterward, so this.x/this.y is still the origin).
 * We spy firePrimary to assert it fires exactly once per dash when equipped,
 * never without, and never when the dash is gated. Browser shims mirror the
 * shift-dash sibling suite.
 */
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { vibrate: undefined };

import { beforeEach, describe, expect, test } from '@jest/globals';
import { Player } from '../../../js/modules/player/player.js';

function freshPlayer(passives = []) {
    const p = new Player();
    p.isDashing = false; p.dashTimer = 0; p.dashVelX = 0; p.dashVelY = 0; p.dashCooldown = 0;
    p.x = 500; p.y = 500; p.vel = { x: 0, y: 0 }; p.angle = 0;
    p.activePassives = new Set(passives);
    // Spy firePrimary + a minimal engine with the pools it reads.
    p.fired = [];
    p.firePrimary = (bulletPool) => { p.fired.push({ x: p.x, y: p.y, bulletPool }); };
    p.gameEngine = { bulletPool: { activeObjects: [] }, particlePool: {}, audioManager: null };
    return p;
}

describe('Afterimage — dash fires a primary volley from the origin', () => {
    test('a dash with the passive fires the primary exactly once', () => {
        const p = freshPlayer(['AFTERIMAGE']);
        expect(p._triggerDash(null)).toBe(true);
        expect(p.fired.length).toBe(1);
    });

    test('the volley fires from the dash ORIGIN (pre-move position)', () => {
        const p = freshPlayer(['AFTERIMAGE']);
        const ox = p.x, oy = p.y;
        p._triggerDash(null);
        expect(p.fired[0].x).toBe(ox);
        expect(p.fired[0].y).toBe(oy);
    });

    test('without the passive, dashing fires nothing', () => {
        const p = freshPlayer([]);
        p._triggerDash(null);
        expect(p.fired.length).toBe(0);
    });

    test('a dash blocked by cooldown does NOT fire the afterimage', () => {
        const p = freshPlayer(['AFTERIMAGE']);
        p.dashCooldown = 500;
        expect(p._triggerDash(null)).toBe(false);
        expect(p.fired.length).toBe(0);
    });

    test('safe when no engine/bulletPool is wired (no throw, no fire)', () => {
        const p = freshPlayer(['AFTERIMAGE']);
        p.gameEngine = null;
        expect(() => p._triggerDash(null)).not.toThrow();
        expect(p.fired.length).toBe(0);
    });

    test('passes the engine bullet pool to firePrimary', () => {
        const p = freshPlayer(['AFTERIMAGE']);
        const pool = p.gameEngine.bulletPool;
        p._triggerDash(null);
        expect(p.fired[0].bulletPool).toBe(pool);
    });
});
