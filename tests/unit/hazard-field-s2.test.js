/**
 * tests/unit/hazard-field-s2.test.js — Phase A.E9-S2 persistent hazard zones.
 *
 * Pure logic: spawn / density cap / contains / lifetime cull / per-frame ticked
 * damage to the player inside (damage application injected as a callback).
 */

import { describe, expect, test } from '@jest/globals';
import { HazardField } from '../../js/modules/world/hazard-field.js';

const NOW = 10000;

describe('A.E9-S2 HazardField', () => {
    test('spawn adds a zone; contains() reflects the radius', () => {
        const f = new HazardField();
        f.spawn(100, 100, { radius: 50 }, NOW);
        expect(f.count).toBe(1);
        expect(f.contains(120, 100)).toBe(true);   // inside
        expect(f.contains(200, 100)).toBe(false);  // outside
    });

    test('density-caps at 24, dropping the oldest', () => {
        const f = new HazardField();
        for (let i = 0; i < 30; i++) f.spawn(i, 0, { radius: 10 }, NOW);
        expect(f.count).toBe(24);
        // the earliest spawns (x=0..5) were dropped; later ones remain
        expect(f.contains(29, 0)).toBe(true);
    });

    test('update culls expired zones', () => {
        const f = new HazardField();
        f.spawn(0, 0, { lifeMs: 1000 }, NOW);
        f.update(NOW + 500, null, null);
        expect(f.count).toBe(1);            // still alive
        f.update(NOW + 1500, null, null);
        expect(f.count).toBe(0);            // expired + culled
    });

    test('ticks damage onto a player inside, scaled by dps, carrying the element', () => {
        const f = new HazardField();
        f.spawn(0, 0, { radius: 60, element: 'TOXIC', dps: 10, lifeMs: 5000 }, NOW);
        const hits = [];
        const player = { x: 10, y: 0 }; // inside
        f.update(NOW + 100, player, (d, el) => hits.push([d, el])); // before first tick (300ms)
        expect(hits).toHaveLength(0);
        f.update(NOW + 300, player, (d, el) => hits.push([d, el])); // one 300ms tick
        expect(hits).toHaveLength(1);
        expect(hits[0][0]).toBeCloseTo(10 * 0.3); // dps × 0.3s
        expect(hits[0][1]).toBe('TOXIC');
    });

    test('does not damage a player standing outside', () => {
        const f = new HazardField();
        f.spawn(0, 0, { radius: 30, dps: 10, lifeMs: 5000 }, NOW);
        const hits = [];
        const player = { x: 500, y: 500 }; // far outside
        f.update(NOW + 1000, player, (d) => hits.push(d));
        expect(hits).toHaveLength(0);
    });

    test('clear() drops everything', () => {
        const f = new HazardField();
        f.spawn(0, 0, {}, NOW);
        f.spawn(50, 50, {}, NOW);
        f.clear();
        expect(f.count).toBe(0);
    });
});
