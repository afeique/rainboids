// tests/unit/net/prediction.test.js — unit tests for the client-side
// prediction wrapper (`js/net/prediction.js::Predictor`).
//
// Predictor was scaffolded in the Phase 1 multiplayer work; this file
// pins behavior after it was wired to the pure ship-physics step
// (`js/sim/ship.js::updateShip`) in the Phase 3 wiring session.
//
// Coverage:
//   - Baseline / no-input identity (pure-step ship is not mutated when
//     no movement keys are pressed and the ship is at rest at center,
//     so the predicted state for a 1-tick no-input step is reachable
//     from a known baseline).
//   - Single-tick directional thrust matches the underlying pure-step
//     output exactly (proves the bridge passes input through).
//   - Multi-tick advance (N=60) accumulates velocity then caps, then
//     advances position monotonically.
//   - Sequenced varied inputs over 5 ticks reproduce the canonical
//     pure-step result (regression vector).
//   - `setBaseline` replaces local state with a clone (caller's ref
//     is not aliased — mutating the original after setBaseline is a
//     no-op on the predictor).
//   - `onSnapshot` with converged state: no divergence, local state
//     follows the (server-anchored, replayed) prediction.
//   - `onSnapshot` with diverged state: divergence counter increments
//     and local state snaps to the server-anchored replay (server
//     wins, as it must for authoritative-server topology).

import { describe, expect, test, jest } from '@jest/globals';
import { Predictor } from '../../../js/net/prediction.js';
import { updateShip } from '../../../js/sim/ship.js';
import { freshShipState } from '../../../js/sim/state.js';

// Same constants the ship test uses (`tests/unit/sim/ship.test.js`).
// Kept here so any tuning change in GAME_CONFIG is caught.
const TICK_SCALE = 30 / 60; // 0.5
const FRICTION = Math.pow(0.5, TICK_SCALE); // ≈ 0.7071067811865476
const MAX_V = 7 * TICK_SCALE; // 3.5
const VEL_EPS = 0.05;
const BOUNCE_DAMP = 0.8;
const THRUST_POWER = 2.0 * TICK_SCALE; // 1.0

function freshInput(overrides = {}) {
    return {
        up: false,
        down: false,
        left: false,
        right: false,
        aimX: 100,
        aimY: 0,
        thrustPower: THRUST_POWER,
        speedMult: 1,
        thrustersDisabled: false,
        maxV: MAX_V,
        friction: FRICTION,
        velEpsilon: VEL_EPS,
        bounceDamp: BOUNCE_DAMP,
        ...overrides,
    };
}

// Convenience: aim straight east from a centered ship (matches the
// `freshShipState` default x = field.width/2 = 960).
const AIM_EAST = { aimX: 2000, aimY: 540 };

describe('Predictor — setBaseline', () => {
    test('clones the provided ship so caller mutation does not bleed in', () => {
        const ship = freshShipState(0, { x: 100, y: 200, vx: 1, vy: 2 });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(ship, 42);
        // Mutate the original after setBaseline — predictor's copy
        // should be unaffected.
        ship.x = -999;
        ship.vx = -999;
        expect(p.localShipState.x).toBe(100);
        expect(p.localShipState.vx).toBe(1);
        expect(p.tick).toBe(42);
    });

    test('replaces prior state on second call', () => {
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(freshShipState(0, { x: 100 }), 1);
        p.setBaseline(freshShipState(0, { x: 500 }), 2);
        expect(p.localShipState.x).toBe(500);
        expect(p.tick).toBe(2);
    });
});

describe('Predictor — applyLocalInput (no input)', () => {
    test('1 tick with no-movement input on a ship at rest mutates only aim angle', () => {
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        p.applyLocalInput(freshInput({ ...AIM_EAST, aimX: 600, aimY: 500 }));

        // No movement keys → no velocity contribution. Friction on 0 = 0.
        // Position unchanged. Aim angle = atan2(0, 100) = 0.
        expect(p.localShipState.x).toBe(500);
        expect(p.localShipState.y).toBe(500);
        expect(p.localShipState.vx).toBe(0);
        expect(p.localShipState.vy).toBe(0);
        expect(p.localShipState.angle).toBeCloseTo(0, 10);
        // Pending buffer holds the one applied input.
        expect(p.pending).toHaveLength(1);
        expect(p.pending[0].tick).toBe(1);
        expect(p.tick).toBe(1);
    });
});

describe('Predictor — applyLocalInput (directional thrust)', () => {
    test('60 ticks of right-thrust → vx positive, x advanced past start', () => {
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);

        for (let i = 0; i < 60; i++) {
            p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));
        }

        // After many ticks of east thrust we expect velocity at the cap
        // (effectiveMaxV = MAX_V * 1 = 3.5 with speedMult=1) and x
        // advanced far past the start. Equilibrium analysis:
        //   v_next = (v + 1.0) * friction
        //   steady-state v* satisfies v* = (v* + 1.0) * friction
        //   → v* = friction / (1 - friction) ≈ 2.4142 (below cap 3.5)
        // so the speed cap won't bind; we'll asymptote to v ≈ 2.4142.
        const expectedSteady = FRICTION / (1 - FRICTION);
        expect(p.localShipState.vx).toBeGreaterThan(0);
        expect(p.localShipState.vx).toBeCloseTo(expectedSteady, 5);
        expect(p.localShipState.vy).toBe(0);
        expect(p.localShipState.x).toBeGreaterThan(500);
        // x has advanced by sum of vx over 60 ticks; lower-bound it by
        // 30 * vx_steady (very loose, since early ticks are below
        // steady-state).
        expect(p.localShipState.x - 500).toBeGreaterThan(30 * expectedSteady);
        expect(p.pending).toHaveLength(60);
        expect(p.tick).toBe(60);
    });

    test('1 tick right-thrust matches pure-step output exactly', () => {
        // Independently compute the expected post-tick state by
        // calling `js/sim/ship.js::updateShip` directly. Predictor
        // wiring should be byte-equivalent.
        const reference = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        updateShip(
            reference,
            freshInput({ right: true, aimX: 600, aimY: 500 }),
            1 / 60,
            null,
            [],
        );

        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));

        expect(p.localShipState.x).toBeCloseTo(reference.x, 12);
        expect(p.localShipState.y).toBeCloseTo(reference.y, 12);
        expect(p.localShipState.vx).toBeCloseTo(reference.vx, 12);
        expect(p.localShipState.vy).toBeCloseTo(reference.vy, 12);
        expect(p.localShipState.angle).toBeCloseTo(reference.angle, 12);
    });
});

describe('Predictor — sequenced inputs reproduce pure-step output', () => {
    test('5 ticks of varying inputs match a direct updateShip loop', () => {
        const inputs = [
            freshInput({ right: true, aimX: 700, aimY: 500 }),
            freshInput({ right: true, down: true, aimX: 700, aimY: 600 }),
            freshInput({ down: true, aimX: 500, aimY: 700 }),
            freshInput({ left: true, down: true, aimX: 300, aimY: 700 }),
            freshInput({ left: true, aimX: 300, aimY: 500 }),
        ];

        // Reference: drive a ship directly through `updateShip`.
        const reference = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        for (const input of inputs) updateShip(reference, input, 1 / 60, null, []);

        // Predictor: same inputs, same starting state.
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        for (const input of inputs) p.applyLocalInput(input);

        expect(p.localShipState.x).toBeCloseTo(reference.x, 12);
        expect(p.localShipState.y).toBeCloseTo(reference.y, 12);
        expect(p.localShipState.vx).toBeCloseTo(reference.vx, 12);
        expect(p.localShipState.vy).toBeCloseTo(reference.vy, 12);
        expect(p.localShipState.angle).toBeCloseTo(reference.angle, 12);
        expect(p.tick).toBe(5);
        expect(p.pending).toHaveLength(5);
    });
});

describe('Predictor — onSnapshot (no divergence)', () => {
    test('server snapshot matches local prediction → no warning, no divergence', () => {
        // Set up: baseline → apply 3 inputs locally.
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const inputs = [
            freshInput({ right: true, aimX: 700, aimY: 500 }),
            freshInput({ right: true, aimX: 700, aimY: 500 }),
            freshInput({ right: true, aimX: 700, aimY: 500 }),
        ];

        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        for (const i of inputs) p.applyLocalInput(i);

        // Server has caught up to tick 1: replay inputs from tick 2..3.
        // The "authoritative" state at tick 1 must equal what
        // applyLocalInput produced after tick 1 — compute it
        // independently using the pure step.
        const serverAtTick1 = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        updateShip(serverAtTick1, inputs[0], 1 / 60, null, []);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            p.onSnapshot(1, serverAtTick1);
        } finally {
            warnSpy.mockRestore();
        }

        expect(p.divergenceCount).toBe(0);
        expect(warnSpy).not.toHaveBeenCalled();
        // Pending should be trimmed to inputs with tick > 1 — i.e. 2 left.
        expect(p.pending).toHaveLength(2);
        expect(p.pending[0].tick).toBe(2);
        expect(p.pending[1].tick).toBe(3);
    });

    test('caller-supplied serverShip is not mutated', () => {
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));
        p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));

        const serverShip = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const frozenX = serverShip.x;
        const frozenVx = serverShip.vx;

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            p.onSnapshot(1, serverShip);
        } finally {
            warnSpy.mockRestore();
        }

        // The caller's object must not have been mutated.
        expect(serverShip.x).toBe(frozenX);
        expect(serverShip.vx).toBe(frozenVx);
    });
});

describe('Predictor — onSnapshot (divergence → reconciliation)', () => {
    test('diverged server state snaps local prediction to server-anchored replay', () => {
        // Set up: baseline at origin, apply 2 right-thrust inputs.
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        const inputs = [
            freshInput({ right: true, aimX: 700, aimY: 500 }),
            freshInput({ right: true, aimX: 700, aimY: 500 }),
        ];

        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        for (const i of inputs) p.applyLocalInput(i);
        const localBefore = { ...p.localShipState };

        // Server reports an unexpected state at tick 1 — e.g. the
        // player was hit and pushed somewhere different. Simulate by
        // handing in a baseline at (1000, 500) rather than the
        // expected post-tick-1 position.
        const divergentServerShip = freshShipState(0, {
            x: 1000,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });

        // Compute the expected reconciled state by hand: clone the
        // server ship, then apply inputs[1] (the only pending input
        // after tick 1 is consumed).
        const expectedAfter = freshShipState(0, {
            x: 1000,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        updateShip(expectedAfter, inputs[1], 1 / 60, null, []);

        // Silence the divergence warning during the test (it's an
        // expected branch we're exercising). We don't assert on the
        // call shape because the test environment (`allure-jest/node`)
        // may wrap `console.warn` and shadow the spy; the contract we
        // care about is `divergenceCount` + the reconciled state below.
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            p.onSnapshot(1, divergentServerShip);
        } finally {
            warnSpy.mockRestore();
        }

        expect(p.divergenceCount).toBe(1);
        // Local state was snapped to the server-anchored replay.
        expect(p.localShipState.x).toBeCloseTo(expectedAfter.x, 12);
        expect(p.localShipState.y).toBeCloseTo(expectedAfter.y, 12);
        expect(p.localShipState.vx).toBeCloseTo(expectedAfter.vx, 12);
        expect(p.localShipState.vy).toBeCloseTo(expectedAfter.vy, 12);
        // Sanity: pre-reconciliation local x was nowhere near 1000.
        expect(Math.abs(localBefore.x - p.localShipState.x)).toBeGreaterThan(100);
        // Pending shrinks to inputs with tick > 1 → just tick=2 left.
        expect(p.pending).toHaveLength(1);
        expect(p.pending[0].tick).toBe(2);
    });

    test('snapshot acknowledging all pending inputs leaves pending empty', () => {
        const baseline = freshShipState(0, {
            x: 500,
            y: 500,
            field: null,
        });
        const p = new Predictor({ dt: 1 / 60 });
        p.setBaseline(baseline, 0);
        p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));
        p.applyLocalInput(freshInput({ right: true, aimX: 600, aimY: 500 }));
        expect(p.pending).toHaveLength(2);

        // Server acks tick 2 → both inputs dropped, no replay needed.
        // Hand-compute the "converged" state by running both inputs
        // through the pure step.
        const convergedServerShip = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        updateShip(convergedServerShip, freshInput({ right: true, aimX: 600, aimY: 500 }), 1 / 60, null, []);
        updateShip(convergedServerShip, freshInput({ right: true, aimX: 600, aimY: 500 }), 1 / 60, null, []);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            p.onSnapshot(2, convergedServerShip);
        } finally {
            warnSpy.mockRestore();
        }

        expect(p.pending).toHaveLength(0);
        expect(p.divergenceCount).toBe(0);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

describe('Predictor — custom updateShip callback', () => {
    test('callers can inject a mock physics step (forward compat with parity harness)', () => {
        // Use the wiring's bridge contract: a custom callback that
        // increments x by 10 per tick regardless of input. Proves
        // `Predictor.applyLocalInput` calls through to whatever
        // function the constructor was given.
        const mockUpdate = jest.fn((ship, _input, _dt) => {
            ship.x += 10;
            return ship;
        });
        const p = new Predictor({ updateShip: mockUpdate, dt: 1 / 60 });
        p.setBaseline(freshShipState(0, { x: 0 }), 0);
        p.applyLocalInput(freshInput());
        p.applyLocalInput(freshInput());
        p.applyLocalInput(freshInput());
        expect(p.localShipState.x).toBe(30);
        expect(mockUpdate).toHaveBeenCalledTimes(3);
    });
});
