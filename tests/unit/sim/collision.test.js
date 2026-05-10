// Pure bullet-vs-asteroid collision unit tests.
//
// `detectBulletAsteroidHits` was created in the Phase-2.5 multiplayer
// engine refactor as a NEW parallel implementation alongside the legacy
// `js/modules/combat/collision-system.js::handleCollisions()`. These
// tests pin the behavior the wrapper (and the future Rust mirror) will
// depend on:
//
//   - circle-circle overlap geometry (sum-of-radii)
//   - non-piercing bullets fire one event then despawn
//   - piercing bullets emit one event per pierced asteroid up to
//     `piercing + 1` targets
//   - per-bullet `piercedAsteroidIds` Set carries across ticks so a
//     piercing bullet doesn't re-hit a target it's already passed through
//   - dead / warping / mid-death-flash asteroids are skipped
//   - event payload includes the fields the wrapper needs (impact point,
//     bullet velocity for knockback, damage, willDespawn flag)

import { describe, test, expect } from '@jest/globals';
import {
    detectBulletAsteroidHits,
    BULLET_ASTEROID_KNOCKBACK,
    BULLET_ASTEROID_HIT_FLASH_FRAMES,
} from '../../../js/sim/collision.js';
import {
    freshAsteroidState,
    freshBulletState,
} from '../../../js/sim/state.js';

// ---------------------------------------------------------------------
// Helpers — build minimal bullet/asteroid pairs that overlap (or not).
// ---------------------------------------------------------------------

/** Place a bullet at (x, y) with optional overrides. Defaults pin a
 *  small player bullet sized like the live game. */
function bullet(id, x, y, overrides = {}) {
    return freshBulletState(id, 'player', {
        x, y, radius: 4, baseRadius: 4, damage: 1, ...overrides,
    });
}

/** Place an asteroid at (x, y). Default radius matches the live game's
 *  smallest size. */
function asteroid(id, x, y, overrides = {}) {
    return freshAsteroidState(id, {
        x, y, radius: 30, hp: 10, maxHp: 10, ...overrides,
    });
}

// Empty per-tick context — the pure step doesn't consume ctx today,
// but pass an object so the signature contract is honored.
const ctx = {};

// ---------------------------------------------------------------------
// Constants exported for the wrapper / Rust mirror.
// ---------------------------------------------------------------------

describe('collision constants', () => {
    test('BULLET_ASTEROID_KNOCKBACK is 0.05 (verbatim from collision-system.js)', () => {
        expect(BULLET_ASTEROID_KNOCKBACK).toBe(0.05);
    });
    test('BULLET_ASTEROID_HIT_FLASH_FRAMES is 10 (verbatim from collision-system.js)', () => {
        expect(BULLET_ASTEROID_HIT_FLASH_FRAMES).toBe(10);
    });
});

// ---------------------------------------------------------------------
// Test 1 — single bullet hits single asteroid.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — single hit', () => {
    test('overlapping bullet + asteroid emits one event with correct fields', () => {
        const b = bullet(1, 100, 100, { vx: 8, vy: 0, damage: 3 });
        const a = asteroid(101, 110, 100); // dx=10, sumR=34 → overlap
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'bullet_hit_asteroid',
            bulletId: 1,
            asteroidId: 101,
            damage: 3,
            bulletX: 100,
            bulletY: 100,
            bulletVx: 8,
            bulletVy: 0,
            bulletWillDespawn: true,
            bulletPiercingRemaining: -1, // non-piercing
        });
    });
});

// ---------------------------------------------------------------------
// Test 2 — distance > sum of radii → no hit.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — geometry miss', () => {
    test('bullet outside (radius + asteroid.radius) emits no event', () => {
        const b = bullet(1, 0, 0);
        // dx=200 ≫ sumR=34 → clearly no overlap.
        const a = asteroid(101, 200, 0);
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('bullet just outside boundary (sum of radii + 1) emits no event', () => {
        const b = bullet(1, 0, 0, { radius: 4 });
        // sumR = 4 + 30 = 34; place asteroid center 35 px away → just outside.
        const a = asteroid(101, 35, 0, { radius: 30 });
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test 3 — piercing bullet hits multiple asteroids in same tick.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — piercing within a tick', () => {
    test('piercing=2 bullet hits 3 overlapping asteroids in same tick', () => {
        const b = bullet(1, 100, 100, { piercing: 2, damage: 1 });
        // All three asteroids overlap the bullet's circle (radius 30 each,
        // bullet radius 4 → sumR 34; bullet at (100, 100)).
        const a1 = asteroid(101, 110, 100);
        const a2 = asteroid(102, 120, 100);
        const a3 = asteroid(103,  90, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a1, a2, a3], ctx, events);
        // piercing=2 means it can hit piercing+1 = 3 targets.
        expect(events).toHaveLength(3);
        expect(events.map(e => e.asteroidId).sort()).toEqual([101, 102, 103]);
        // Last hit should mark the bullet for despawn (budget reached).
        const lastEvent = events[events.length - 1];
        expect(lastEvent.bulletWillDespawn).toBe(true);
        // Earlier events should NOT despawn — the bullet is still alive.
        expect(events[0].bulletWillDespawn).toBe(false);
        expect(events[1].bulletWillDespawn).toBe(false);
    });

    test('piercing=1 bullet hits 2 asteroids in same tick (piercing + 1)', () => {
        const b = bullet(1, 100, 100, { piercing: 1 });
        const a1 = asteroid(101, 110, 100);
        const a2 = asteroid(102, 120, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a1, a2], ctx, events);
        expect(events).toHaveLength(2);
        expect(events[0].bulletWillDespawn).toBe(false);
        expect(events[0].bulletPiercingRemaining).toBe(0);
        expect(events[1].bulletWillDespawn).toBe(true);
    });
});

// ---------------------------------------------------------------------
// Test 4 — non-piercing bullet only hits ONE asteroid.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — non-piercing single-hit', () => {
    test('non-piercing bullet emits exactly one event when 3 asteroids overlap', () => {
        const b = bullet(1, 100, 100, { piercing: 0 });
        const a1 = asteroid(101, 110, 100);
        const a2 = asteroid(102, 120, 100);
        const a3 = asteroid(103,  90, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a1, a2, a3], ctx, events);
        expect(events).toHaveLength(1);
        // It should hit the FIRST overlapping asteroid in array order.
        expect(events[0].asteroidId).toBe(101);
        expect(events[0].bulletWillDespawn).toBe(true);
        expect(events[0].bulletPiercingRemaining).toBe(-1);
    });
});

// ---------------------------------------------------------------------
// Test 5 — piercedAsteroidIds Set carry-over across frames.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — piercedAsteroidIds across ticks', () => {
    test('a piercing bullet that hit asteroid X last frame does NOT re-hit it this frame', () => {
        const b = bullet(1, 100, 100, { piercing: 5, damage: 1 });
        const a = asteroid(101, 110, 100);

        // ── Frame 1 ──
        const frame1Events = [];
        detectBulletAsteroidHits([b], [a], ctx, frame1Events);
        expect(frame1Events).toHaveLength(1);
        // After frame 1, the bullet should remember it pierced this asteroid.
        expect(b.piercedAsteroidIds).toBeDefined();
        expect(b.piercedAsteroidIds.has(101)).toBe(true);

        // ── Frame 2 — same asteroid, still overlapping ──
        const frame2Events = [];
        detectBulletAsteroidHits([b], [a], ctx, frame2Events);
        expect(frame2Events).toHaveLength(0);
    });

    test('piercedAsteroidIds is lazily created (not pre-allocated)', () => {
        // A bullet that never hits anything shouldn't carry a Set.
        const b = bullet(1, 0, 0);
        const a = asteroid(101, 999, 999); // Far away — no hit.
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
        // Set should not have been allocated (defensive — keeps GC quiet).
        expect(b.piercedAsteroidIds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------
// Test 6 — empty inputs.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — empty inputs', () => {
    test('empty bullets array → no events', () => {
        const events = [];
        detectBulletAsteroidHits([], [asteroid(101, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty asteroids array → no events', () => {
        const events = [];
        detectBulletAsteroidHits([bullet(1, 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectBulletAsteroidHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null bullets → no events (defensive)', () => {
        const events = [];
        detectBulletAsteroidHits(null, [asteroid(101, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null asteroids → no events (defensive)', () => {
        const events = [];
        detectBulletAsteroidHits([bullet(1, 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test 7 — damage carries through to event.
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — damage propagation', () => {
    test('event.damage matches bullet.damage', () => {
        const b = bullet(1, 100, 100, { damage: 7 });
        const a = asteroid(101, 110, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(7);
    });

    test('event.damage defaults to 1 when bullet.damage is missing/zero', () => {
        const b = bullet(1, 100, 100, { damage: 0 });
        const a = asteroid(101, 110, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events[0].damage).toBe(1);
    });
});

// ---------------------------------------------------------------------
// Test 8 — skipped pairs (inactive / warping / death-flash).
// ---------------------------------------------------------------------

describe('detectBulletAsteroidHits — skipped pairs', () => {
    test('inactive bullet is skipped', () => {
        const b = bullet(1, 100, 100, { active: false });
        const a = asteroid(101, 110, 100);
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('inactive asteroid is skipped', () => {
        const b = bullet(1, 100, 100);
        const a = asteroid(101, 110, 100, { active: false });
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('warping asteroid is skipped', () => {
        const b = bullet(1, 100, 100);
        const a = asteroid(101, 110, 100, { warping: true });
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('asteroid mid-death-flash (deathFlash > 0) is skipped', () => {
        const b = bullet(1, 100, 100);
        const a = asteroid(101, 110, 100, { deathFlash: 5 });
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('legacy _deathFlash field is also honored (live-game compat)', () => {
        const b = bullet(1, 100, 100);
        // Live `Asteroid` instances use the underscore-prefix name.
        const a = { id: 101, x: 110, y: 100, radius: 30, active: true,
                    warping: false, _deathFlash: 5 };
        const events = [];
        detectBulletAsteroidHits([b], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});
