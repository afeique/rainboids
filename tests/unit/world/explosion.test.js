/**
 * tests/unit/world/explosion.test.js — 10.1.0 procedural fireball+smoke.
 *
 * Validates spawnExplosion() spawns a cluster of 'fireballPuff' particles with
 * sane fields, and that a fireballPuff particle ramps fire → smoke → death
 * through its lifecycle (Particle.reset/update).
 */
import { describe, expect, test } from '@jest/globals';
import { spawnExplosion } from '../../../js/modules/world/explosion.js';
import { Particle } from '../../../js/modules/world/particle.js';

// Minimal pool stub: records every spawned particle and returns a real
// Particle so spawnExplosion's field overrides exercise the real reset().
function makePool() {
    const spawned = [];
    return {
        spawned,
        get(x, y, type, ...args) {
            const p = new Particle();
            p.reset(x, y, type, ...args);
            spawned.push(p);
            return p;
        },
    };
}

describe('spawnExplosion', () => {
    test('spawns a cluster of fireballPuff particles around the centre', () => {
        const pool = makePool();
        spawnExplosion(pool, 100, 200, { radius: 40 });
        expect(pool.spawned.length).toBeGreaterThanOrEqual(5);
        for (const p of pool.spawned) {
            expect(p.type).toBe('fireballPuff');
            expect(p.active).toBe(true);
            expect(p.life).toBeGreaterThan(0);
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(p.radius).toBeGreaterThan(0);
            expect(p.maxRadius).toBeGreaterThan(p.radius);
            // Puffs are seeded within a couple blast-radii of the centre.
            expect(Math.hypot(p.x - 100, p.y - 200)).toBeLessThan(120);
        }
    });

    test('bigger blasts spawn more puffs (bounded)', () => {
        const small = makePool();
        const big = makePool();
        spawnExplosion(small, 0, 0, { radius: 12 });
        spawnExplosion(big, 0, 0, { radius: 200 });
        expect(big.spawned.length).toBeGreaterThanOrEqual(small.spawned.length);
        expect(big.spawned.length).toBeLessThanOrEqual(18);
    });

    test('is a no-op for a missing / invalid pool', () => {
        expect(() => spawnExplosion(null, 0, 0)).not.toThrow();
        expect(() => spawnExplosion({}, 0, 0)).not.toThrow();
    });
});

describe('fireballPuff lifecycle', () => {
    test('starts in the fire phase and ends fully faded (life ≤ 0)', () => {
        const p = new Particle();
        p.reset(0, 0, 'fireballPuff', 16);
        expect(p.life).toBe(1);
        expect(p.life).toBeGreaterThan(p._smokeStart); // born in the fire phase
        // Run it to completion; it must deactivate (no lingering particle).
        let ticks = 0;
        while (p.active && ticks < 1000) { p.update(); ticks++; }
        expect(p.active).toBe(false);
        expect(p.life).toBeLessThanOrEqual(0);
    });

    test('crosses into the smoke phase and the puff only ever grows', () => {
        const p = new Particle();
        p.reset(0, 0, 'fireballPuff', 16);
        const start = p.radius;
        let sawSmoke = false;
        let prevR = p.radius;
        for (let i = 0; i < 200 && p.active; i++) {
            p.update();
            if (p.active) expect(p.radius).toBeGreaterThanOrEqual(prevR - 1e-6); // monotonic growth
            prevR = p.radius;
            if (p.life > 0 && p.life < p._smokeStart) sawSmoke = true;
        }
        expect(sawSmoke).toBe(true);
        expect(prevR).toBeGreaterThanOrEqual(start);
    });
});
