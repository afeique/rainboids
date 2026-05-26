/**
 * tests/unit/player/shift-dash.test.js — unit tests for the 5.93.0
 * SHIFT-key dash core movement primitive.
 *
 * Replaces the legacy PHASE_DASH defense ability. The dash now lives
 * directly on the Player class as `_triggerDash`, with i-frames
 * exposed via `isDashIFrameActive()` and the per-frame kinematics
 * applied in `abilities.updateActiveAbilities` (still — the dash motion
 * code stayed where it was; only the trigger path moved).
 *
 * Contract pinned here:
 *   • _triggerDash sets isDashing, dashTimer, dashVelX/Y, dashCooldown
 *     and plays the phaseDash sound.
 *   • Cooldown gate prevents re-trigger while dashCooldown > 0.
 *   • Already-dashing gate prevents overlapping dashes.
 *   • Cooldown decays each frame in updateAbilityCooldowns.
 *   • Dash kinematics produce the expected displacement over a full
 *     burst (DASH_DURATION_MS / 1000 * dashSpeed).
 *   • isDashIFrameActive mirrors isDashing during the burst window.
 *   • MP-safe: the dash trigger has no MP gate — it works in solo and
 *     online identically (pure player input + position kinematics).
 *   • Cheat-code conflict: SHIFT+Digit must not trigger dash through
 *     the input handler's dashPulse — that's tested at the input
 *     layer via the shift-dash-input.test.js sibling suite below.
 */

// ---------------------------------------------------------------------------
// Browser shims — must happen before any game module import (player.js
// reads `window.innerWidth` in its constructor). Same pattern as
// tests/unit/player/mp-ability-gate.test.js.
// ---------------------------------------------------------------------------
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
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined };
}

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { Player } from '../../../js/modules/player/player.js';
import { updateAbilityCooldowns, updateActiveAbilities } from '../../../js/modules/player/abilities.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudio() {
    const calls = [];
    return {
        calls,
        playSound: (name) => { calls.push(name); return true; },
    };
}

function freshPlayer() {
    const p = new Player();
    // Force deterministic dash state.
    p.isDashing    = false;
    p.dashTimer    = 0;
    p.dashVelX     = 0;
    p.dashVelY     = 0;
    p.dashCooldown = 0;
    p.x = 500;
    p.y = 500;
    p.vel = { x: 0, y: 0 };
    p.angle = 0; // facing +X
    return p;
}

// ---------------------------------------------------------------------------
// Tests — _triggerDash trigger path
// ---------------------------------------------------------------------------

describe('Player._triggerDash — trigger contract', () => {
    let player;
    let audio;

    beforeEach(() => {
        player = freshPlayer();
        audio = makeAudio();
    });

    test('clean trigger sets isDashing + timer + cooldown + velocity', () => {
        const result = player._triggerDash(audio);
        expect(result).toBe(true);
        expect(player.isDashing).toBe(true);
        expect(player.dashTimer).toBe(Player.DASH_DURATION_MS);
        expect(player.dashCooldown).toBe(Player.DASH_COOLDOWN_MS);
        // Aim along +X (angle=0), so velocity should be (dashSpeed, ~0).
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        expect(player.dashVelX).toBeCloseTo(dashSpeed, 3);
        expect(Math.abs(player.dashVelY)).toBeLessThan(0.001);
    });

    test('plays phaseDash sound on trigger', () => {
        player._triggerDash(audio);
        expect(audio.calls).toContain('phaseDash');
    });

    test('returns false when already dashing (no double-fire)', () => {
        // First trigger primes the dash.
        expect(player._triggerDash(audio)).toBe(true);
        const dashTimerBefore = player.dashTimer;
        const dashVelXBefore = player.dashVelX;
        // Second trigger should bail.
        const second = player._triggerDash(audio);
        expect(second).toBe(false);
        // State unchanged — original burst still active.
        expect(player.dashTimer).toBe(dashTimerBefore);
        expect(player.dashVelX).toBe(dashVelXBefore);
    });

    test('returns false when dashCooldown > 0', () => {
        player.dashCooldown = 500; // mid-cooldown
        const result = player._triggerDash(audio);
        expect(result).toBe(false);
        expect(player.isDashing).toBe(false);
        expect(player.dashTimer).toBe(0);
        // Cooldown unchanged (gate didn't burn additional cooldown).
        expect(player.dashCooldown).toBe(500);
    });

    test('uses velocity direction when ship has significant momentum', () => {
        // Moving in +Y direction at speed 1.0 (above the 0.5 threshold).
        player.vel = { x: 0, y: 1.0 };
        player.angle = 0; // aim is +X but we expect velocity-aligned dash
        player._triggerDash(audio);
        // Velocity-aligned: dash should point +Y.
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        expect(Math.abs(player.dashVelX)).toBeLessThan(0.001);
        expect(player.dashVelY).toBeCloseTo(dashSpeed, 3);
    });

    test('uses aim angle when ship is roughly stationary', () => {
        // No movement — velocity-aligned check fails, falls back to aim.
        player.vel = { x: 0.1, y: 0.1 }; // speed ≈ 0.14, below 0.5 threshold
        player.angle = Math.PI / 2; // facing +Y
        player._triggerDash(audio);
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        expect(Math.abs(player.dashVelX)).toBeLessThan(0.001);
        expect(player.dashVelY).toBeCloseTo(dashSpeed, 3);
    });

    test('handles null audio manager gracefully', () => {
        const result = player._triggerDash(null);
        expect(result).toBe(true);
        expect(player.isDashing).toBe(true);
        // No throw — the audio fallback chain bails on null.
    });
});

// ---------------------------------------------------------------------------
// Tests — FB-2 Co-Pilot auto-dodge cue flag
// ---------------------------------------------------------------------------

describe('Player._triggerDash — FB-2 _coPilotDashActive flag', () => {
    let player;
    let audio;

    beforeEach(() => {
        player = freshPlayer();
        audio = makeAudio();
    });

    test('a Co-Pilot auto-dodge dash (_assistDashAngle) flags the cue', () => {
        player._assistDashAngle = Math.PI / 4; // Co-Pilot decided this dodge
        player._triggerDash(audio);
        expect(player._coPilotDashActive).toBe(true);
        // The assist angle is consumed by the trigger.
        expect(player._assistDashAngle).toBeNull();
    });

    test('a manual key/aim dash does NOT flag the cue', () => {
        player._triggerDash(audio); // no _assistDashAngle set
        expect(player._coPilotDashActive).toBe(false);
    });

    test('a tap-directed dash does NOT flag the cue', () => {
        player._triggerDash(audio, player.x + 120, player.y); // tap target
        expect(player._coPilotDashActive).toBe(false);
    });

    test('a manual dash after a Co-Pilot dash clears the cue flag', () => {
        player._assistDashAngle = 0;
        player._triggerDash(audio);
        expect(player._coPilotDashActive).toBe(true);
        // Clear the burst + cooldown so a second dash can fire.
        player.isDashing = false;
        player.dashTimer = 0;
        player.dashCooldown = 0;
        player._triggerDash(audio); // manual this time
        expect(player._coPilotDashActive).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Tests — kinematics and lifecycle
// ---------------------------------------------------------------------------

describe('Player dash kinematics + lifecycle', () => {
    let player;
    let audio;

    beforeEach(() => {
        player = freshPlayer();
        audio = makeAudio();
    });

    test('updateActiveAbilities integrates dash velocity into position', () => {
        player._triggerDash(audio);
        const startX = player.x;
        // Advance 100ms worth of dash motion.
        updateActiveAbilities.call(player, 100);
        const expectedDelta = player.dashVelX * (100 / 1000); // px/sec × sec
        expect(player.x).toBeCloseTo(startX + expectedDelta, 3);
        expect(player.isDashing).toBe(true); // still mid-burst
    });

    test('full-burst integration produces ~DASH_DISTANCE_PX displacement', () => {
        // Aim along +X (angle=0). After integrating for DASH_DURATION_MS,
        // total displacement should equal DASH_DISTANCE_PX (within float tolerance).
        player.angle = 0;
        player.vel = { x: 0, y: 0 };
        player._triggerDash(audio);
        const startX = player.x;
        // Step through the whole burst in 1ms ticks to be precise.
        for (let i = 0; i < Player.DASH_DURATION_MS; i++) {
            updateActiveAbilities.call(player, 1);
        }
        const delta = player.x - startX;
        expect(delta).toBeCloseTo(Player.DASH_DISTANCE_PX, 1);
    });

    test('dashTimer expires after DASH_DURATION_MS, isDashing becomes false', () => {
        player._triggerDash(audio);
        // Drain the timer in one big tick.
        updateActiveAbilities.call(player, Player.DASH_DURATION_MS + 10);
        expect(player.isDashing).toBe(false);
        expect(player.dashTimer).toBeLessThanOrEqual(0);
    });

    test('dashCooldown decays in updateAbilityCooldowns', () => {
        player._triggerDash(audio);
        expect(player.dashCooldown).toBe(Player.DASH_COOLDOWN_MS);
        // Burn half the cooldown.
        updateAbilityCooldowns.call(player, Player.DASH_COOLDOWN_MS / 2);
        expect(player.dashCooldown).toBeCloseTo(Player.DASH_COOLDOWN_MS / 2, 3);
        // Burn the rest.
        updateAbilityCooldowns.call(player, Player.DASH_COOLDOWN_MS);
        expect(player.dashCooldown).toBe(0);
    });

    test('after cooldown elapses, a new dash can be triggered', () => {
        player._triggerDash(audio);
        // Skip past the dash burst.
        updateActiveAbilities.call(player, Player.DASH_DURATION_MS + 10);
        // Burn the full cooldown.
        updateAbilityCooldowns.call(player, Player.DASH_COOLDOWN_MS);
        expect(player.dashCooldown).toBe(0);
        expect(player.isDashing).toBe(false);
        // Second dash should succeed.
        const result = player._triggerDash(audio);
        expect(result).toBe(true);
        expect(player.isDashing).toBe(true);
        expect(audio.calls.length).toBe(2); // two phaseDash sounds played
    });
});

// ---------------------------------------------------------------------------
// Tests — i-frame helper
// ---------------------------------------------------------------------------

describe('Player.isDashIFrameActive', () => {
    let player;

    beforeEach(() => {
        player = freshPlayer();
    });

    test('returns false when not dashing', () => {
        expect(player.isDashIFrameActive()).toBe(false);
    });

    test('returns true during active dash burst', () => {
        player._triggerDash(makeAudio());
        expect(player.isDashIFrameActive()).toBe(true);
    });

    test('returns false after dash burst ends', () => {
        player._triggerDash(makeAudio());
        updateActiveAbilities.call(player, Player.DASH_DURATION_MS + 10);
        expect(player.isDashIFrameActive()).toBe(false);
    });

    test('returns false during cooldown (after burst)', () => {
        player._triggerDash(makeAudio());
        // Burst over, still in cooldown.
        updateActiveAbilities.call(player, Player.DASH_DURATION_MS + 1);
        expect(player.isDashing).toBe(false);
        expect(player.dashCooldown).toBeGreaterThan(0);
        expect(player.isDashIFrameActive()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Tests — MP-safe: no gate at the dash trigger
// ---------------------------------------------------------------------------

describe('Player dash is MP-safe (5.93.0)', () => {
    let player;

    beforeEach(() => {
        player = freshPlayer();
    });

    afterEach(() => {
        delete globalThis.window.engineDriver;
    });

    test('online mode does NOT suppress dash (PHASE_DASH off the unsafe list)', () => {
        // Set the engine to online — the activateAbility gate would
        // suppress a defense ability here, but _triggerDash has no gate.
        globalThis.window.engineDriver = { isOnline: true };
        const result = player._triggerDash(makeAudio());
        expect(result).toBe(true);
        expect(player.isDashing).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Tests — collision i-frame integration: dashing player takes no damage
// ---------------------------------------------------------------------------
//
// The two collision-system.js sites zero `reducedDamage` when
// `player.isDashIFrameActive()` is true. We can't easily import the
// collision-system module without a full GameEngine, but we can verify
// the helper's truthiness contract — the collision sites only read
// player.isDashIFrameActive() and player.isDashing, so the helper's
// behavior IS the collision contract.

describe('Dash i-frame collision contract', () => {
    let player;

    beforeEach(() => {
        player = freshPlayer();
    });

    test('helper is true during dash → collision sites zero damage', () => {
        player._triggerDash(makeAudio());
        // Simulate what the collision code does: read the helper.
        let reducedDamage = 25;
        if (player.isDashIFrameActive && player.isDashIFrameActive()) {
            reducedDamage = 0;
        }
        expect(reducedDamage).toBe(0);
    });

    test('helper is false when not dashing → collision sites apply full damage', () => {
        // No dash triggered — damage should pass through.
        let reducedDamage = 25;
        if (player.isDashIFrameActive && player.isDashIFrameActive()) {
            reducedDamage = 0;
        }
        expect(reducedDamage).toBe(25);
    });
});
