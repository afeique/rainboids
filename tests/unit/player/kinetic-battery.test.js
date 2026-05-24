/**
 * tests/unit/player/kinetic-battery.test.js — Phase P6 Kinetic Battery passive.
 *
 * A successful SHIFT dash refunds KINETIC_BATTERY_REFUND power energy. The
 * refund rides _triggerDash (so it's naturally gated by the dash cooldown) and
 * only fires when the player has the passive. Browser shims mirror the
 * shift-dash sibling suite (player.js touches window in its constructor).
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
import { Player, KINETIC_BATTERY_REFUND } from '../../../js/modules/player/player.js';

function freshPlayer(passives = []) {
    const p = new Player();
    p.isDashing = false; p.dashTimer = 0; p.dashVelX = 0; p.dashVelY = 0; p.dashCooldown = 0;
    p.x = 500; p.y = 500; p.vel = { x: 0, y: 0 }; p.angle = 0;
    p.activePassives = new Set(passives);
    p.energy = 0;
    return p;
}

describe('Kinetic Battery — dash refunds energy', () => {
    let active;

    beforeEach(() => { active = freshPlayer(['KINETIC_BATTERY']); });

    test('a successful dash refunds KINETIC_BATTERY_REFUND energy', () => {
        expect(active.energy).toBe(0);
        expect(active._triggerDash(null)).toBe(true);
        expect(active.energy).toBe(KINETIC_BATTERY_REFUND);
    });

    test('without the passive, dashing refunds nothing', () => {
        const plain = freshPlayer([]);
        plain._triggerDash(null);
        expect(plain.energy).toBe(0);
    });

    test('a dash blocked by cooldown does NOT refund', () => {
        active.dashCooldown = 500; // gate closed
        const before = active.energy;
        expect(active._triggerDash(null)).toBe(false);
        expect(active.energy).toBe(before);
    });

    test('the refund clamps to maxEnergy (addEnergy never overfills)', () => {
        active.energy = active.maxEnergy - 5; // only 5 of headroom
        active._triggerDash(null);
        expect(active.energy).toBe(active.maxEnergy);
    });

    test('repeated dashes (after cooldown) keep refunding', () => {
        active._triggerDash(null);
        const afterFirst = active.energy;
        // Clear dash + cooldown to allow a second dash.
        active.isDashing = false; active.dashTimer = 0; active.dashCooldown = 0;
        active._triggerDash(null);
        expect(active.energy).toBe(Math.min(active.maxEnergy, afterFirst + KINETIC_BATTERY_REFUND));
    });
});
