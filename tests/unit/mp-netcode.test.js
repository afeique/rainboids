/**
 * tests/unit/mp-netcode.test.js — client netcode (prediction/reconciliation +
 * interpolation). Pure logic, runs headless in Node.
 */

import { describe, it, expect } from '@jest/globals';
import { Predictor } from '../../js/mp/netcode/predictor.js';
import { Interpolator } from '../../js/mp/netcode/interpolator.js';
import { createShip, stepShip } from '../../js/sim/ship.js';
import { FIELD_WIDTH, FIELD_HEIGHT } from '../../js/sim/constants.js';

const HELD_RIGHT = { up: false, down: false, left: false, right: true, fire: false, aimX: null, aimY: null };

describe('Predictor', () => {
  it('predicts the local ship forward on input', () => {
    const p = new Predictor(1, 500, 500, FIELD_WIDTH, FIELD_HEIGHT);
    for (let i = 0; i < 5; i++) p.step(HELD_RIGHT);
    expect(p.clientTick).toBe(5);
    expect(p.pending.length).toBe(5);
    expect(p.ship.x).toBeGreaterThan(500);
  });

  it('reconciles to authoritative state + replays unacked inputs', () => {
    const p = new Predictor(1, 500, 500, FIELD_WIDTH, FIELD_HEIGHT);
    for (let i = 0; i < 5; i++) p.step(HELD_RIGHT);

    // Server applied the same input for 3 ticks (acked clientTick 3).
    const auth = createShip(1, 500, 500);
    for (let i = 0; i < 3; i++) stepShip(auth, HELD_RIGHT, FIELD_WIDTH, FIELD_HEIGHT);

    p.reconcile({ x: auth.x, y: auth.y, vx: auth.vx, vy: auth.vy, angle: auth.angle }, 3);

    // After reconcile, only ticks 4 & 5 remain pending...
    expect(p.pending.map((f) => f.clientTick)).toEqual([4, 5]);
    // ...and the ship equals a clean 5-step prediction (auth@3 + replay 4,5).
    const ref = createShip(1, 500, 500);
    for (let i = 0; i < 5; i++) stepShip(ref, HELD_RIGHT, FIELD_WIDTH, FIELD_HEIGHT);
    expect(p.ship.x).toBeCloseTo(ref.x, 6);
    expect(p.ship.y).toBeCloseTo(ref.y, 6);
  });

  it('clears pending when the server acks everything', () => {
    const p = new Predictor(1, 500, 500, FIELD_WIDTH, FIELD_HEIGHT);
    for (let i = 0; i < 4; i++) p.step(HELD_RIGHT);
    p.reconcile({ x: 600, y: 500, vx: 0, vy: 0, angle: 0 }, 4);
    expect(p.pending.length).toBe(0);
    expect(p.ship.x).toBe(600);
  });
});

describe('Interpolator', () => {
  function snap(tick, ships) { return { t: 'snapshot', tick, ships }; }

  it('interpolates a remote ship halfway between two snapshots', () => {
    const interp = new Interpolator();
    interp.add(snap(1, [{ id: 2, x: 100, y: 0, a: 0, hp: 100, mhp: 100 }]), 1000);
    interp.add(snap(2, [{ id: 2, x: 200, y: 0, a: 0, hp: 100, mhp: 100 }]), 1100);
    // INTERP_DELAY_MS = 100 → render time t = now - 100.
    const out = interp.sample(1150, /* localId */ 1); // t = 1050, halfway
    expect(out.get(2).x).toBeCloseTo(150, 3);
  });

  it('excludes the local ship from interpolation', () => {
    const interp = new Interpolator();
    interp.add(snap(1, [{ id: 1, x: 0, y: 0, a: 0 }, { id: 2, x: 100, y: 0, a: 0 }]), 1000);
    interp.add(snap(2, [{ id: 1, x: 0, y: 0, a: 0 }, { id: 2, x: 200, y: 0, a: 0 }]), 1100);
    const out = interp.sample(1150, 1);
    expect(out.has(1)).toBe(false);
    expect(out.has(2)).toBe(true);
  });

  it('sampleShipById returns the interpolated authoritative state for ANY id (incl. local)', () => {
    // The local ship is rendered from this (drift-free) rather than predicted —
    // so the camera follows the server's truth and the world can't drift/jitter.
    const interp = new Interpolator();
    interp.add(snap(1, [{ id: 1, x: 0, y: 0, a: 0, vx: 0, vy: 0 }]), 1000);
    interp.add(snap(2, [{ id: 1, x: 100, y: 0, a: 0, vx: 0, vy: 0 }]), 1100);
    const local = interp.sampleShipById(1150, 1); // local id 1, t=1050 halfway
    expect(local).not.toBeNull();
    expect(local.x).toBeCloseTo(50, 3);
    expect(interp.sampleShipById(1150, 99)).toBeNull(); // unknown id → null
  });

  it('snaps to the latest snapshot when there is no history yet', () => {
    const interp = new Interpolator();
    interp.add(snap(1, [{ id: 2, x: 42, y: 7, a: 0 }]), 1000);
    const out = interp.sample(1200, 1);
    expect(out.get(2).x).toBe(42);
  });

  it('interpolates asteroids independently of ships', () => {
    const interp = new Interpolator();
    const s1 = { t: 'snapshot', tick: 1, ships: [], asteroids: [{ id: 5, x: 0, y: 0, a: 0, r: 30 }] };
    const s2 = { t: 'snapshot', tick: 2, ships: [], asteroids: [{ id: 5, x: 100, y: 40, a: 0, r: 30 }] };
    interp.add(s1, 1000);
    interp.add(s2, 1100);
    const out = interp.sampleAsteroids(1150); // t = 1050, halfway
    expect(out.get(5).x).toBeCloseTo(50, 3);
    expect(out.get(5).y).toBeCloseTo(20, 3);
    expect(out.get(5).r).toBe(30);
  });
});
