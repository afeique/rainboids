/**
 * tests/unit/swarm-cohesion-e8a.test.js — Phase E8a WASP swarm cohesion.
 *
 * Pins the pure `swarmCohesion` helper: a bounded velocity nudge toward the
 * average position of nearby same-type enemies (so Wasps cluster → a Cryo hit
 * freeze-shatters the pack). Ignores other types, inactive, and out-of-radius.
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}

import { describe, expect, test } from '@jest/globals';
import { swarmCohesion } from '../../js/modules/enemy/movement.js';

const self = () => ({ x: 0, y: 0, type: 'WASP', active: true });

describe('swarmCohesion (E8a)', () => {
    test('nudges toward a single nearby same-type neighbor (normalized × pull)', () => {
        const s = self();
        const pool = [s, { x: 100, y: 0, type: 'WASP', active: true }];
        const c = swarmCohesion(s, pool, 220, 0.5);
        expect(c.x).toBeCloseTo(0.5); // unit +x × pull
        expect(c.y).toBeCloseTo(0);
    });

    test('aims at the average of multiple neighbors', () => {
        const s = self();
        const pool = [s, { x: 100, y: 0, type: 'WASP', active: true }, { x: 0, y: 100, type: 'WASP', active: true }];
        const c = swarmCohesion(s, pool, 220, 0.5);
        // center (50,50) → equal x/y components
        expect(c.x).toBeCloseTo(c.y);
        expect(c.x).toBeGreaterThan(0);
        expect(Math.hypot(c.x, c.y)).toBeCloseTo(0.5); // magnitude == pull
    });

    test('ignores out-of-radius neighbors', () => {
        const s = self();
        const pool = [s, { x: 1000, y: 0, type: 'WASP', active: true }];
        expect(swarmCohesion(s, pool, 220, 0.5)).toEqual({ x: 0, y: 0 });
    });

    test('ignores other enemy types and inactive enemies', () => {
        const s = self();
        const pool = [
            s,
            { x: 100, y: 0, type: 'HUNTER', active: true },  // different type
            { x: 0, y: 100, type: 'WASP', active: false },    // inactive
        ];
        expect(swarmCohesion(s, pool, 220, 0.5)).toEqual({ x: 0, y: 0 });
    });

    test('no pool / no neighbors → no nudge', () => {
        const s = self();
        expect(swarmCohesion(s, null, 220, 0.5)).toEqual({ x: 0, y: 0 });
        expect(swarmCohesion(s, [s], 220, 0.5)).toEqual({ x: 0, y: 0 });
    });
});
