/**
 * tests/unit/net/interpolation.test.js — unit tests for the render-time
 * interpolator (`js/net/interpolation.js::Interpolator`).
 *
 * After the Phase 3 follow-up refactor the Interpolator composes a
 * `TickBuffer` internally and converts wall-clock-ms timestamps to tick
 * numbers via an anchored epoch (snapshot cadence is 20 Hz → 50 ms/tick).
 * The public API (`ingest`, `sample`) is unchanged from the original
 * hand-rolled ring implementation.
 *
 * These tests pin:
 *   - Construction creates an empty interpolator (sample → null).
 *   - Ingesting one snapshot stores it and `sample` returns it.
 *   - Exact-tick sampling returns the matching snapshot's content.
 *   - Mid-snapshot sampling lerps positions and velocities linearly.
 *   - The 4-entry ring evicts the oldest snapshot on overflow.
 *   - Out-of-order ingest is sorted internally and bracketing works.
 *   - `sample` with no snapshots ingested returns null.
 *   - `lerpSnapshot` (via `sample`) interpolates ships, enemies,
 *     asteroids, and drops uniformly.
 */

import { describe, expect, test } from '@jest/globals';

import { Interpolator } from '../../../js/net/interpolation.js';

// 20 Hz snapshot cadence — same constant as the production module.
const MS_PER_TICK = 50;

// Convenience: build a snapshot with a single entity per category at the
// given coordinates. Each category exposes the same id-keyed shape so the
// underlying `lerpKeyedById` walks them identically.
function makeSnapshot({ ship = null, enemy = null, asteroid = null, drop = null } = {}) {
    return {
        ships: ship ? [{ player: 'p1', ...ship }] : [],
        enemies: enemy ? [{ id: 'e1', ...enemy }] : [],
        asteroids: asteroid ? [{ id: 'a1', ...asteroid }] : [],
        drops: drop ? [{ id: 'd1', ...drop }] : [],
    };
}

describe('Interpolator', () => {
    test('new interpolator is empty — sample returns null', () => {
        const interp = new Interpolator();
        expect(interp.sample(0)).toBeNull();
        expect(interp.sample(1234)).toBeNull();
    });

    test('ingesting one snapshot — sample returns it for any time', () => {
        const interp = new Interpolator();
        const snap = makeSnapshot({ ship: { x: 100, y: 50 } });
        interp.ingest(1000, snap);
        // With only one snapshot, every sample returns the stored snapshot
        // regardless of the requested server time — preserves the old API.
        expect(interp.sample(1000)).toBe(snap);
        expect(interp.sample(500)).toBe(snap);
        expect(interp.sample(2000)).toBe(snap);
    });

    test('sample at an exact ingested time returns that snapshot (content-equal)', () => {
        const interp = new Interpolator();
        const a = makeSnapshot({ ship: { x: 0, y: 0 } });
        const b = makeSnapshot({ ship: { x: 100, y: 0 } });
        const c = makeSnapshot({ ship: { x: 200, y: 0 } });
        interp.ingest(1000, a);
        interp.ingest(1050, b);
        interp.ingest(1100, c);

        // Exact match at the middle snapshot — short-circuits the lerp.
        const out = interp.sample(1050);
        expect(out.ships).toEqual(b.ships);
        // Exact match at the newest — also returned directly.
        expect(interp.sample(1100).ships).toEqual(c.ships);
    });

    test('sample mid-way between two snapshots lerps ship x/y/vx/vy', () => {
        const interp = new Interpolator();
        interp.ingest(1000, makeSnapshot({ ship: { x: 0,   y: 0,   vx: 0,  vy: 0 } }));
        interp.ingest(1050, makeSnapshot({ ship: { x: 100, y: 200, vx: 10, vy: 20 } }));

        // Sample at the midpoint (25 ms in).
        const mid = interp.sample(1025);
        expect(mid.ships).toHaveLength(1);
        const ship = mid.ships[0];
        expect(ship.x).toBeCloseTo(50);
        expect(ship.y).toBeCloseTo(100);
        expect(ship.vx).toBeCloseTo(5);
        expect(ship.vy).toBeCloseTo(10);
    });

    test('4-snapshot ring evicts the oldest snapshot on overflow', () => {
        const interp = new Interpolator();
        // Ingest 5 snapshots at the 20 Hz cadence — capacity is 4.
        interp.ingest(1000, makeSnapshot({ ship: { x: 0,   y: 0 } }));
        interp.ingest(1050, makeSnapshot({ ship: { x: 100, y: 0 } }));
        interp.ingest(1100, makeSnapshot({ ship: { x: 200, y: 0 } }));
        interp.ingest(1150, makeSnapshot({ ship: { x: 300, y: 0 } }));
        interp.ingest(1200, makeSnapshot({ ship: { x: 400, y: 0 } })); // evicts t=1000

        // Sampling at the evicted time falls back to a buffered snapshot
        // (per the original API: "never return null when any data is
        // buffered"). Old behavior returned the newest snapshot when the
        // request time fell outside the buffered range; verify the same
        // contract here.
        const old = interp.sample(1000);
        expect(old).not.toBeNull();
        // The evicted snapshot had ship.x=0; result must be a buffered
        // snapshot. Specifically the fallback returns the newest (x=400).
        expect(old.ships[0].x).toBe(400);
        // And it must NOT be the (now-evicted) oldest snapshot's content.
        expect(old.ships[0].x).not.toBe(0);

        // Sampling at the newest still returns the newest snapshot.
        const newest = interp.sample(1200);
        expect(newest.ships[0].x).toBe(400);

        // Sampling between the two newest interpolates between them.
        const between = interp.sample(1175);
        expect(between.ships[0].x).toBeCloseTo(350);
    });

    test('out-of-order ingests are sorted internally (latest snapshot wins)', () => {
        const interp = new Interpolator();
        interp.ingest(1000, makeSnapshot({ ship: { x: 0,   y: 0 } }));
        // Ingest the *third* snapshot before the second — TickBuffer
        // should re-sort by tick so bracketing still works.
        interp.ingest(1100, makeSnapshot({ ship: { x: 200, y: 0 } }));
        interp.ingest(1050, makeSnapshot({ ship: { x: 100, y: 0 } }));

        // Midway between t=1050 and t=1100 should lerp 100 → 200 → x = 150.
        const mid = interp.sample(1075);
        expect(mid.ships[0].x).toBeCloseTo(150);

        // Latest snapshot is t=1100; sampling past it returns the latest.
        const past = interp.sample(2000);
        expect(past.ships[0].x).toBe(200);
    });

    test('sample with no snapshots returns null', () => {
        const interp = new Interpolator();
        expect(interp.sample(0)).toBeNull();
        expect(interp.sample(Date.now())).toBeNull();
        // Constructing with a custom render delay shouldn't affect this.
        const interp2 = new Interpolator({ renderDelayMs: 200 });
        expect(interp2.sample(99999)).toBeNull();
    });

    test('lerpSnapshot lerps ships, enemies, asteroids, and drops uniformly', () => {
        const interp = new Interpolator();
        interp.ingest(1000, {
            ships:     [{ player: 'p1', x: 0,   y: 0,   vx: 0,  vy: 0 }],
            enemies:   [{ id: 'e1',     x: 10,  y: 20,  vx: 1,  vy: 2 }],
            asteroids: [{ id: 'a1',     x: 30,  y: 40,  vx: 3,  vy: 4 }],
            drops:     [{ id: 'd1',     x: 50,  y: 60,  vx: 5,  vy: 6 }],
        });
        interp.ingest(1050, {
            ships:     [{ player: 'p1', x: 100, y: 200, vx: 10, vy: 20 }],
            enemies:   [{ id: 'e1',     x: 110, y: 220, vx: 11, vy: 22 }],
            asteroids: [{ id: 'a1',     x: 130, y: 240, vx: 13, vy: 24 }],
            drops:     [{ id: 'd1',     x: 150, y: 260, vx: 15, vy: 26 }],
        });

        // Sample at the midpoint — every category should be lerped t=0.5.
        const mid = interp.sample(1025);

        expect(mid.ships[0].x).toBeCloseTo(50);
        expect(mid.ships[0].y).toBeCloseTo(100);
        expect(mid.ships[0].vx).toBeCloseTo(5);
        expect(mid.ships[0].vy).toBeCloseTo(10);

        expect(mid.enemies[0].x).toBeCloseTo(60);
        expect(mid.enemies[0].y).toBeCloseTo(120);
        expect(mid.enemies[0].vx).toBeCloseTo(6);
        expect(mid.enemies[0].vy).toBeCloseTo(12);

        expect(mid.asteroids[0].x).toBeCloseTo(80);
        expect(mid.asteroids[0].y).toBeCloseTo(140);
        expect(mid.asteroids[0].vx).toBeCloseTo(8);
        expect(mid.asteroids[0].vy).toBeCloseTo(14);

        expect(mid.drops[0].x).toBeCloseTo(100);
        expect(mid.drops[0].y).toBeCloseTo(160);
        expect(mid.drops[0].vx).toBeCloseTo(10);
        expect(mid.drops[0].vy).toBeCloseTo(16);
    });

    test('large wall-clock timestamps do not overflow int32 tick coercion', () => {
        // The original ring stored serverT directly. TickBuffer coerces
        // keys via `tick | 0`, which would corrupt typical Date.now()
        // values (≈ 1.7e12). The epoch-anchored shim keeps ticks small
        // enough that int32 truncation is lossless.
        const interp = new Interpolator();
        const NOW = 1_750_000_000_000; // ~2025 in ms
        interp.ingest(NOW,      makeSnapshot({ ship: { x: 0,   y: 0 } }));
        interp.ingest(NOW + 50, makeSnapshot({ ship: { x: 100, y: 0 } }));
        interp.ingest(NOW +100, makeSnapshot({ ship: { x: 200, y: 0 } }));

        // Mid-sample between t=NOW+50 and t=NOW+100 → x = 150.
        const mid = interp.sample(NOW + 75);
        expect(mid).not.toBeNull();
        expect(mid.ships[0].x).toBeCloseTo(150);
    });

    test('renderDelayMs option is preserved on the instance', () => {
        // Public API surface check: callers may read `renderDelayMs` to
        // schedule their sample time. The refactor must not drop this.
        const def = new Interpolator();
        expect(def.renderDelayMs).toBe(100);
        const custom = new Interpolator({ renderDelayMs: 200 });
        expect(custom.renderDelayMs).toBe(200);
    });
});
