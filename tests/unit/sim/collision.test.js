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
    detectPlayerAsteroidHits,
    PLAYER_ASTEROID_COLLISION_DAMAGE,
    BOUNCE_RESTITUTION,
    BOUNCE_FORCE_MULTIPLIER,
    OVERLAP_SEPARATION_RATIO,
    ASTEROID_KNOCKBACK_MULTIPLIER,
    SEPARATION_BUFFER,
    OVERLAP_PUSH_FORCE,
} from '../../../js/sim/collision.js';
import {
    freshAsteroidState,
    freshBulletState,
    freshShipState,
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

// ═════════════════════════════════════════════════════════════════════
// Player-vs-asteroid pair (Phase 2.5 — dispatch 2).
// ═════════════════════════════════════════════════════════════════════
//
// `detectPlayerAsteroidHits` is the second pure-step pair extracted
// from the legacy `handlePlayerAsteroidCollision` in
// `js/modules/combat/collision-system.js` (lines 1946-2120). The legacy
// path bundles damage + visuals + audio + camera kicks; the pure step
// reports only the mechanical deltas — velocity impulses and a position
// separation — that the wrapper applies to live state. Visuals / SFX /
// XP stay on the wrapper side.
//
// The tests below pin:
//   - the seven constants (verbatim values from COLLISION_CONFIG)
//   - geometry overlap (circle-circle)
//   - all event payload fields (impulse + separation deltas)
//   - skip gates (inactive / warping / death-flash)
//   - multiple hits per tick (player jammed between two rocks)
//   - bounce direction (eastbound player off a westward rock ⇒ westbound impulse)
//   - defensive empty / null inputs

// ---------------------------------------------------------------------
// Helpers — build minimal player/asteroid pairs.
// ---------------------------------------------------------------------

/** Build a player at (x, y). Defaults to a small radius=15 ship to
 *  match the live `Player` constructor. */
function makePlayer(playerId, x, y, overrides = {}) {
    return freshShipState(playerId, {
        x, y, radius: 15, ...overrides,
    });
}

/** Build a heavier asteroid at (x, y) with explicit velocity so the
 *  bounce math has nonzero relative velocity to chew on. */
function makeAsteroid(id, x, y, overrides = {}) {
    return freshAsteroidState(id, {
        x, y, radius: 30, ...overrides,
    });
}

// ---------------------------------------------------------------------
// Constants — pinned to the legacy COLLISION_CONFIG block.
// ---------------------------------------------------------------------

describe('player-asteroid collision constants', () => {
    test('PLAYER_ASTEROID_COLLISION_DAMAGE is 2 (verbatim)', () => {
        expect(PLAYER_ASTEROID_COLLISION_DAMAGE).toBe(2);
    });
    test('BOUNCE_RESTITUTION is 0.9 (verbatim)', () => {
        expect(BOUNCE_RESTITUTION).toBe(0.9);
    });
    test('BOUNCE_FORCE_MULTIPLIER is 12.0 (verbatim)', () => {
        expect(BOUNCE_FORCE_MULTIPLIER).toBe(12.0);
    });
    test('OVERLAP_SEPARATION_RATIO is 0.6 (verbatim)', () => {
        expect(OVERLAP_SEPARATION_RATIO).toBe(0.6);
    });
    test('ASTEROID_KNOCKBACK_MULTIPLIER is 22.0 (verbatim)', () => {
        expect(ASTEROID_KNOCKBACK_MULTIPLIER).toBe(22.0);
    });
    test('SEPARATION_BUFFER is 6 (verbatim)', () => {
        expect(SEPARATION_BUFFER).toBe(6);
    });
    test('OVERLAP_PUSH_FORCE is 5.0 (verbatim)', () => {
        expect(OVERLAP_PUSH_FORCE).toBe(5.0);
    });
});

// ---------------------------------------------------------------------
// Test — single overlapping pair emits one fully-populated event.
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — single hit', () => {
    test('overlapping player + asteroid emits one event with all delta fields', () => {
        // Player radius 15, asteroid radius 30 ⇒ sumR = 45.
        // Place them 30 px apart on the x-axis ⇒ overlap = 15 (clear hit).
        const p = makePlayer('p1', 100, 100, { vx: 5, vy: 0 });
        const a = makeAsteroid(10, 130, 100, { vx: 0, vy: 0 });
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);

        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.type).toBe('player_hit_asteroid');
        expect(ev.playerId).toBe('p1');
        expect(ev.asteroidId).toBe(10);
        expect(ev.damageToAsteroid).toBe(PLAYER_ASTEROID_COLLISION_DAMAGE);
        // All six numeric delta fields must be defined and finite numbers.
        expect(typeof ev.playerImpulseDx).toBe('number');
        expect(typeof ev.playerImpulseDy).toBe('number');
        expect(typeof ev.asteroidImpulseDx).toBe('number');
        expect(typeof ev.asteroidImpulseDy).toBe('number');
        expect(typeof ev.separationDx).toBe('number');
        expect(typeof ev.separationDy).toBe('number');
        expect(Number.isFinite(ev.playerImpulseDx)).toBe(true);
        expect(Number.isFinite(ev.playerImpulseDy)).toBe(true);
        expect(Number.isFinite(ev.asteroidImpulseDx)).toBe(true);
        expect(Number.isFinite(ev.asteroidImpulseDy)).toBe(true);
        expect(Number.isFinite(ev.separationDx)).toBe(true);
        expect(Number.isFinite(ev.separationDy)).toBe(true);
        // Geometry overlapped ⇒ separation must be nonzero on the
        // collision axis (x here).
        expect(ev.separationDx).not.toBe(0);
    });
});

// ---------------------------------------------------------------------
// Test — geometry miss (centers further than sumR apart).
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — geometry miss', () => {
    test('player outside (player.r + asteroid.r) emits no event', () => {
        const p = makePlayer('p1', 0, 0);
        const a = makeAsteroid(10, 200, 0); // 200 px ≫ sumR=45
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('player just outside boundary (sumR + 1) emits no event', () => {
        const p = makePlayer('p1', 0, 0, { radius: 15 });
        // sumR = 45; place asteroid center 46 px away ⇒ just outside.
        const a = makeAsteroid(10, 46, 0, { radius: 30 });
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — one player overlapping multiple rocks ⇒ multiple events.
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — multiple asteroids in one tick', () => {
    test('player wedged between two asteroids emits two events', () => {
        // Player at (100, 100), radius 15. Place rocks east + west, both
        // close enough to overlap.
        const p = makePlayer('p1', 100, 100, { vx: 0, vy: 0 });
        const east = makeAsteroid(10, 130, 100); // dx=30, sumR=45 ⇒ overlap
        const west = makeAsteroid(20,  70, 100); // dx=-30, sumR=45 ⇒ overlap
        const events = [];
        detectPlayerAsteroidHits([p], [east, west], ctx, events);
        expect(events).toHaveLength(2);
        const ids = events.map(e => e.asteroidId).sort((a, b) => a - b);
        expect(ids).toEqual([10, 20]);
        // Each event carries the player's id.
        for (const ev of events) {
            expect(ev.playerId).toBe('p1');
            expect(ev.type).toBe('player_hit_asteroid');
        }
    });
});

// ---------------------------------------------------------------------
// Test — skip gates (inactive / warping / death-flash).
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — skipped pairs', () => {
    test('inactive player → no event', () => {
        const p = makePlayer('p1', 100, 100, { active: false });
        const a = makeAsteroid(10, 130, 100);
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('inactive asteroid → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const a = makeAsteroid(10, 130, 100, { active: false });
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('warping asteroid → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const a = makeAsteroid(10, 130, 100, { warping: true });
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('asteroid mid death-flash (new field name) → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const a = makeAsteroid(10, 130, 100, { deathFlash: 5 });
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('asteroid mid death-flash (legacy _deathFlash) → no event', () => {
        const p = makePlayer('p1', 100, 100);
        // Live Asteroid instances use the underscore-prefix name; the
        // pure step honors both.
        const a = { id: 10, x: 130, y: 100, radius: 30, active: true,
                    warping: false, _deathFlash: 5 };
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — bounce direction. Player moving east into an asteroid east of
// it should get deflected back west (negative dx on player impulse).
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — bounce direction', () => {
    test('eastbound player ramming a westward rock gets impulse pushing west', () => {
        // Geometry:
        //   - Player at (100, 100), radius 15, moving east (vx=10).
        //   - Asteroid 30 px east at (130, 100), radius 30, moving
        //     west (vx=-2). distance=30, sumR=45 ⇒ overlap=15.
        //
        // Expected delta directions:
        //   - The separation normal points from asteroid → player,
        //     which is westward → separationDx < 0.
        //   - The OVERLAP_PUSH_FORCE term adds nx · 5 = -5 to
        //     playerImpulseDx (westward).
        //   - The knockback term is mass-dominated by the much heavier
        //     asteroid (≈113k vs ≈353), making its contribution to
        //     playerImpulseDx orders of magnitude smaller than the
        //     OVERLAP_PUSH_FORCE term, so playerImpulseDx stays
        //     strictly negative.
        //
        // Jitter is disabled by passing rngFloat() = 0.5 (centered).
        const p = makePlayer('p1', 100, 100, { vx: 10, vy: 0 });
        const a = makeAsteroid(10, 130, 100, { vx: -2, vy: 0 });
        const events = [];
        detectPlayerAsteroidHits([p], [a], { rngFloat: () => 0.5 }, events);
        expect(events).toHaveLength(1);
        // Separation points westward (away from the east-of-player rock).
        expect(events[0].separationDx).toBeLessThan(0);
        expect(events[0].separationDy).toBe(0);
        // Net player impulse is dominated by the westward overlap push.
        expect(events[0].playerImpulseDx).toBeLessThan(0);
    });
});

// ---------------------------------------------------------------------
// Test — empty / null inputs defensive guards.
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — empty inputs', () => {
    test('empty players → no events', () => {
        const events = [];
        detectPlayerAsteroidHits([], [makeAsteroid(10, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty asteroids → no events', () => {
        const events = [];
        detectPlayerAsteroidHits([makePlayer('p1', 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectPlayerAsteroidHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null players → no events (defensive)', () => {
        const events = [];
        detectPlayerAsteroidHits(null, [makeAsteroid(10, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null asteroids → no events (defensive)', () => {
        const events = [];
        detectPlayerAsteroidHits([makePlayer('p1', 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — separation push fields are populated proportional to overlap.
// ---------------------------------------------------------------------

describe('detectPlayerAsteroidHits — separation magnitude', () => {
    test('separation distance = overlap + SEPARATION_BUFFER along (asteroid → player) normal', () => {
        // Player at (100, 100), radius 15; asteroid at (130, 100),
        // radius 30. distance = 30, sumR = 45 ⇒ overlap = 15.
        // Normal points west (-1, 0). separation should be
        // (-1, 0) · (15 + 6) = (-21, 0).
        const p = makePlayer('p1', 100, 100);
        const a = makeAsteroid(10, 130, 100);
        const events = [];
        detectPlayerAsteroidHits([p], [a], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.separationDx).toBeCloseTo(-(15 + SEPARATION_BUFFER), 5);
        expect(ev.separationDy).toBeCloseTo(0, 5);
    });
});
