// Phase P6 — Tracer Lock passive. Repeated hits on the SAME target ramp damage
// (+8% per stack, max 5 → +40%); swapping targets resets the ramp. tracerLockStep
// is the pure ramp curve — the applyDamageToEnemy call site threads the player's
// _tracerTarget / _tracerStacks through it each hit.
import { describe, expect, test } from '@jest/globals';
import {
    tracerLockStep,
    TRACER_LOCK_PER,
    TRACER_LOCK_MAX,
} from '../../js/modules/combat/collision-system.js';

const A = { id: 'A' };
const B = { id: 'B' };

describe('Tracer Lock — same-target damage ramp', () => {
    test('first hit on a fresh target is +0 (stacks 0)', () => {
        const r = tracerLockStep(null, 0, A);
        expect(r.target).toBe(A);
        expect(r.stacks).toBe(0);
        expect(r.mult).toBe(1);
    });

    test('consecutive hits on the same target ramp one stack at a time', () => {
        let s = tracerLockStep(null, 0, A); // 0
        s = tracerLockStep(s.target, s.stacks, A); // 1
        expect(s.stacks).toBe(1);
        expect(s.mult).toBeCloseTo(1 + TRACER_LOCK_PER, 5);
        s = tracerLockStep(s.target, s.stacks, A); // 2
        expect(s.stacks).toBe(2);
        expect(s.mult).toBeCloseTo(1 + 2 * TRACER_LOCK_PER, 5);
    });

    test('ramp caps at TRACER_LOCK_MAX stacks', () => {
        let s = { target: null, stacks: 0 };
        for (let i = 0; i < 20; i++) s = tracerLockStep(s.target, s.stacks, A);
        expect(s.stacks).toBe(TRACER_LOCK_MAX);
        expect(s.mult).toBeCloseTo(1 + TRACER_LOCK_MAX * TRACER_LOCK_PER, 5);
    });

    test('swapping targets resets the ramp to 0', () => {
        let s = tracerLockStep(null, 0, A);
        s = tracerLockStep(s.target, s.stacks, A); // A: 1 stack
        s = tracerLockStep(s.target, s.stacks, A); // A: 2 stacks
        expect(s.stacks).toBe(2);
        const swap = tracerLockStep(s.target, s.stacks, B); // swap to B
        expect(swap.target).toBe(B);
        expect(swap.stacks).toBe(0);
        expect(swap.mult).toBe(1);
    });

    test('returning to a target after a swap starts the ramp over', () => {
        let s = tracerLockStep(null, 0, A);
        s = tracerLockStep(s.target, s.stacks, A); // A: 1
        s = tracerLockStep(s.target, s.stacks, B); // B: 0
        s = tracerLockStep(s.target, s.stacks, A); // back to A: 0 (not resumed)
        expect(s.target).toBe(A);
        expect(s.stacks).toBe(0);
    });
});
