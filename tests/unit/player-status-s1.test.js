/**
 * tests/unit/player-status-s1.test.js — Phase A.E9-S1 player-side statuses.
 *
 * CHILL (Cryo → slowed thrust) + CORRODE (Toxic → +incoming damage), applied to
 * the player by elemental enemy hits. Pure helpers; no browser deps.
 */

import { describe, expect, test } from '@jest/globals';
import {
    initPlayerStatus, cleansePlayerStatus, applyPlayerStatus, tickPlayerStatus,
    playerChillSpeedMult, playerCorrodeMult,
} from '../../js/modules/player/player-status.js';

// (tickPlayerStatus now returns the burn damage to apply this frame — S1b.)

function mkPlayer() { const p = {}; initPlayerStatus(p); return p; }
const NOW = 10000;

describe('A.E9-S1 player elemental statuses', () => {
    test('initPlayerStatus zeroes the timers', () => {
        const p = mkPlayer();
        expect(p.pChillUntil).toBe(0);
        expect(p.pCorrodeUntil).toBe(0);
        expect(p.pCorrodeStacks).toBe(0);
    });

    test('CRYO hit applies CHILL → reduced speed while active', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'CRYO', NOW);
        expect(p.pChillUntil).toBe(NOW + 1500);
        expect(playerChillSpeedMult(p, NOW + 100)).toBeCloseTo(0.7);
        expect(playerChillSpeedMult(p, NOW + 2000)).toBe(1); // expired
    });

    test('TOXIC hit applies CORRODE → +15%/stack incoming damage, cap 2', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'TOXIC', NOW);
        expect(p.pCorrodeStacks).toBe(1);
        expect(playerCorrodeMult(p, NOW + 100)).toBeCloseTo(1.15);
        applyPlayerStatus(p, 'TOXIC', NOW);
        applyPlayerStatus(p, 'TOXIC', NOW); // would be 3, capped at 2
        expect(p.pCorrodeStacks).toBe(2);
        expect(playerCorrodeMult(p, NOW + 100)).toBeCloseTo(1.30);
    });

    test('PYRO hit applies BURN (S1b); VOLT shock still deferred', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'PYRO', NOW);
        expect(p.pBurnStacks).toBe(1);
        expect(p.pBurnUntil).toBe(NOW + 2000);
        applyPlayerStatus(p, 'VOLT', NOW); // no-op
        expect(p.pChillUntil).toBe(0);
        expect(p.pCorrodeStacks).toBe(0);
    });

    test('BURN ticks return damage (scaling with stacks) over its window, then clear', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'PYRO', NOW); // 1 stack, first tick at NOW+500
        applyPlayerStatus(p, 'PYRO', NOW); // 2 stacks
        expect(p.pBurnStacks).toBe(2);
        expect(tickPlayerStatus(p, NOW + 100)).toBe(0);   // before first tick
        expect(tickPlayerStatus(p, NOW + 500)).toBe(2);   // 1 tick × 2 stacks × 1 dmg
        // run out the window → stacks clear, no more damage
        tickPlayerStatus(p, NOW + 5000);
        expect(p.pBurnStacks).toBe(0);
        expect(tickPlayerStatus(p, NOW + 6000)).toBe(0);
    });

    test('BURN stacks cap at 3', () => {
        const p = mkPlayer();
        for (let i = 0; i < 6; i++) applyPlayerStatus(p, 'PYRO', NOW);
        expect(p.pBurnStacks).toBe(3);
    });

    test('tickPlayerStatus clears CORRODE after its window (returns 0 burn)', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'TOXIC', NOW);
        expect(tickPlayerStatus(p, NOW + 100)).toBe(0);
        expect(p.pCorrodeStacks).toBe(1); // still active
        tickPlayerStatus(p, NOW + 4000);  // past 3000ms window
        expect(p.pCorrodeStacks).toBe(0);
        expect(playerCorrodeMult(p, NOW + 4000)).toBe(1);
    });

    test('cleansePlayerStatus clears everything (Second Wind)', () => {
        const p = mkPlayer();
        applyPlayerStatus(p, 'CRYO', NOW);
        applyPlayerStatus(p, 'TOXIC', NOW);
        cleansePlayerStatus(p);
        expect(playerChillSpeedMult(p, NOW + 100)).toBe(1);
        expect(playerCorrodeMult(p, NOW + 100)).toBe(1);
    });

    test('mults are safe with a null/empty player', () => {
        expect(playerChillSpeedMult(null, NOW)).toBe(1);
        expect(playerCorrodeMult(undefined, NOW)).toBe(1);
        expect(() => applyPlayerStatus(null, 'CRYO', NOW)).not.toThrow();
    });
});
