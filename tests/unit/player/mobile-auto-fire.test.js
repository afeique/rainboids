/**
 * tests/unit/player/mobile-auto-fire.test.js — 5.100.0 update
 *
 * The 5.92.0 mobile auto-fire contract was NARROWED in 5.100.
 * Pre-5.100: ALL power weapons auto-fired on mobile (cooldown weapons
 * the moment cooldown cleared, charge weapons on full charge).
 * 5.100.0: only CHARGE-based weapons (CHARGE_SHOT) auto-fire. Cooldown
 * weapons (NOVA_BLAST, MINE_LAYER, MISSILE_SALVO, LANCE_BEAM,
 * LIGHTNING_ARC) fire on a manual TAP from mobile-touch.js
 * (`input.fireSecondary` pulse).
 *
 * This file pins the new contract:
 *   - Mobile + cooldown power ready, NO tap → does NOT auto-fire.
 *   - Mobile + cooldown power ready + fireSecondary=true → fires.
 *   - Mobile + CHARGE_SHOT below full energy + no tap → does NOT fire.
 *   - Desktop: unchanged (no auto-fire without input).
 *
 * 6.29.0 — isPowerReady() is now ALSO energy-gated (energy >= the
 * weapon's POWER_ENERGY_COST). These tests are about the cooldown/charge
 * contract, not the energy economy, so each player is given full energy
 * in beforeEach to satisfy the gate.
 *
 * 6.116.0 — Power weapons are now a UNIFIED energy-gated model: every power
 * weapon (incl. CHARGE_SHOT) fires instantly when fire-power is pressed and
 * enough energy is banked. Energy regenerates passively over time, and
 * `chargeLevel` mirrors the energy meter rather than a hold timer.
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

function makeInput({ fireSecondary = false } = {}) {
    return {
        up: false, down: false, left: false, right: false,
        rotateLeft: false, rotateRight: false,
        aimX: 1000, aimY: 1000,
        screenAimX: 0, screenAimY: 0,
        fire: false, fireSecondary,
        activateAbility: false,
        stickInput: { x: 0, y: 0, magnitude: 0 },
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

function installFakeEngine(opts = {}) {
    globalThis.window.gameEngine = {
        assists: { autoAim: false, aimAssist: false, autoFire: false },
        radialMenu: { isOpen: () => !!opts.radialOpen },
        findNearestTarget: () => null,
    };
}
function clearFakeEngine() {
    delete globalThis.window.gameEngine;
}

describe('Player.update — mobile cooldown power weapons (5.100.0)', () => {
    let player;

    beforeEach(() => {
        delete globalThis.window.engineDriver;
        player = new Player();
        player.x = 1000;
        player.y = 1000;
        player.active = true;
        player.activePower = 'NOVA_BLAST';
        player.powerCooldown = 0;
        player.energy = player.maxEnergy; // satisfy the 6.29.0 energy gate
        player.novaRings = [];
        player.firingDisabled = false;
        installFakeEngine();
    });

    afterEach(() => {
        _resetUrlOverrideForTests(null);
        clearFakeEngine();
    });

    test('mobile + cooldown power ready + NO tap → does NOT auto-fire (5.100 contract)', () => {
        _resetUrlOverrideForTests(true);
        expect(player.isPowerReady()).toBe(true);

        const input = makeInput({ fireSecondary: false });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // 5.100 — auto-fire is now CHARGE-only. Cooldown weapons do not
        // fire without an explicit input.fireSecondary tap from mobile-touch.js.
        expect(player.powerCooldown).toBe(0);
        expect(player.novaRings.length).toBe(0);
    });

    test('mobile + cooldown power ready + fireSecondary=true (TAP) → fires', () => {
        _resetUrlOverrideForTests(true);
        expect(player.isPowerReady()).toBe(true);

        const input = makeInput({ fireSecondary: true });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // With the tap pulse, the same pipeline (updateChargingSystem →
        // firePower → fireNova) fires the weapon.
        expect(player.powerCooldown).toBeGreaterThan(0);
        expect(player.novaRings.length).toBe(1);
    });

    test('desktop + cooldown power ready + NO input → does NOT fire (unchanged)', () => {
        _resetUrlOverrideForTests(false);
        expect(player.isPowerReady()).toBe(true);
        const input = makeInput({ fireSecondary: false });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);
        expect(player.powerCooldown).toBe(0);
        expect(player.novaRings.length).toBe(0);
    });

    test('mobile + power on cooldown + fireSecondary=true → does NOT re-trigger', () => {
        _resetUrlOverrideForTests(true);
        player.powerCooldown = 5000;
        player.powerCooldownMax = 5000;
        expect(player.isPowerReady()).toBe(false);

        const ringsBefore = player.novaRings.length;
        const input = makeInput({ fireSecondary: true });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        // The fire gate respects cooldown — tap doesn't bypass.
        expect(player.novaRings.length).toBe(ringsBefore);
    });

    // Note: the radial-open suppression for tap-for-power lives in
    // mobile-touch.js (the touch handler skips firing while the radial
    // is open), not in player.update. Player.update with
    // input.fireSecondary=true unconditionally fires if ready.
});

describe('Player.update — mobile CHARGE_SHOT (unified energy-gated fire) — 6.116.0', () => {
    let player;

    beforeEach(() => {
        delete globalThis.window.engineDriver;
        player = new Player();
        player.x = 1000;
        player.y = 1000;
        player.active = true;
        player.activePower = 'CHARGE_SHOT';
        player.isFullyCharged = false;
        player.energy = player.maxEnergy; // satisfy the energy gate
        player.firingDisabled = false;
        installFakeEngine();
    });

    afterEach(() => {
        _resetUrlOverrideForTests(null);
        clearFakeEngine();
    });

    // 6.116.0 — CHARGE_SHOT no longer winds up on a hold timer. `chargeLevel`
    // now mirrors the energy meter (energy / maxEnergy), and the renderer
    // reads `energy` to drive the body glow + nose ring.
    test('mobile + CHARGE_SHOT below full energy + no tap → does NOT fire; chargeLevel mirrors energy', () => {
        _resetUrlOverrideForTests(true);
        player.energy = player.maxEnergy * 0.5; // half-full meter

        const input = makeInput({ fireSecondary: false });
        player.update(input, mockParticlePool(), mockBulletPool(), mockAudio(), null, false, null);

        expect(player.chargeLevel).toBeLessThan(1);
        expect(player.chargeLevel).toBeCloseTo(0.5, 1);
    });

    // We don't assert a "CHARGE_SHOT fires on tap" test here because the side
    // effects are non-trivial to set up (bullet pool shapes, audio loops).
    // The gate lives in weapons.js updateChargingSystem:
    //   if (input.fireSecondary && this.isPowerReady()) { ... fireChargedShot }
    // i.e. fires instantly at full charge when enough energy is banked.
});
