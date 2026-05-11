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
    detectBulletEnemyHits,
    BULLET_ENEMY_KNOCKBACK,
    BULLET_ENEMY_HIT_FLASH_FRAMES,
    detectPlayerEnemyHits,
    PLAYER_ENEMY_COLLISION_DAMAGE,
    detectEnemyAsteroidHits,
    ENEMY_ASTEROID_PUSH,
    ASTEROID_ENEMY_PUSH,
    detectPlayerEnemyBulletHits,
} from '../../../js/sim/collision.js';
import {
    freshAsteroidState,
    freshBulletState,
    freshEnemyState,
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

// ═════════════════════════════════════════════════════════════════════
// Bullet-vs-enemy pair (Phase 2.5 — dispatch 3).
// ═════════════════════════════════════════════════════════════════════
//
// `detectBulletEnemyHits` is the third pure-step pair extracted from the
// legacy `handleCollisions` in `js/modules/combat/collision-system.js`
// (lines 511-659). It's a near-mirror of `detectBulletAsteroidHits` —
// same circle-circle geometry, same piercing-budget mechanics, same
// event-emission discipline. Key differences:
//
//   - Emits `bullet_hit_enemy` events (not `bullet_hit_asteroid`).
//   - Uses a separate `piercedEnemyIds` Set on the bullet so the same
//     bullet can pierce both asteroids and enemies independently
//     (different id spaces — an asteroid with id=10 and an enemy with
//     id=10 are unrelated targets).
//   - The shared piercing counter (`bullet.piercedEnemies`) IS shared
//     across both Sets — mirrors the legacy `bullet.onHit()` semantics
//     where the single counter increments on any pierce.
//
// All side effects (damage, death-flash, boss-rage triggers, drops, XP,
// kill streak, hit-flash visuals, hit-stop, screen shake, audio) stay
// in the wrapper. The pure step only answers "did bullet B overlap
// enemy E? emit one event per yes".

// ---------------------------------------------------------------------
// Helpers — build minimal bullet/enemy pairs that overlap (or not).
// ---------------------------------------------------------------------

/** Build an enemy with an explicit radius. `freshEnemyState` is the
 *  base shape (id/x/y/active/...); the pure step also needs `radius`,
 *  and the collision skip-gates read `warping` and `deathFlash` /
 *  `_deathFlash`. Those fields aren't part of the f32 EnemyState
 *  typedef yet, so we attach them here so the tests stay self-contained.
 *
 *  Default radius=18 matches the live `Enemy` constructor for HUNTER. */
function enemyWithRadius(id, x, y, radius = 18, overrides = {}) {
    // freshEnemyState whitelists its fields (id, type, x, y, vx, vy,
    // angle, hp, maxHp, firingCooldown, lastShot, active) — anything
    // else in `overrides` is silently dropped. So we pass through only
    // the fields the factory knows about, then attach the rest manually.
    const base = freshEnemyState('HUNTER', {
        id, x, y,
        active: overrides.active,
        vx: overrides.vx, vy: overrides.vy,
    });
    base.radius = radius;
    // Skip-gate fields the pure step inspects but `freshEnemyState`
    // doesn't yet model. The live `Enemy` class has both.
    if (overrides.warping !== undefined) base.warping = overrides.warping;
    if (overrides.deathFlash !== undefined) base.deathFlash = overrides.deathFlash;
    if (overrides._deathFlash !== undefined) base._deathFlash = overrides._deathFlash;
    return base;
}

// ---------------------------------------------------------------------
// Constants — pinned to the legacy COLLISION_CONFIG block.
// ---------------------------------------------------------------------

describe('bullet-enemy collision constants', () => {
    test('BULLET_ENEMY_KNOCKBACK is 0.05 (verbatim from collision-system.js)', () => {
        expect(BULLET_ENEMY_KNOCKBACK).toBe(0.05);
    });
    test('BULLET_ENEMY_HIT_FLASH_FRAMES is 10 (verbatim from collision-system.js)', () => {
        expect(BULLET_ENEMY_HIT_FLASH_FRAMES).toBe(10);
    });
});

// ---------------------------------------------------------------------
// Test — single overlapping pair emits one fully-populated event.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — single hit', () => {
    test('overlapping bullet + enemy emits one event with all 9 fields', () => {
        // Bullet radius 4 + enemy radius 18 = sumR 22. Place enemy 10 px
        // east of bullet ⇒ overlap = 12 (clear hit).
        const b = bullet(1, 100, 100, { vx: 8, vy: -3, damage: 3 });
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'bullet_hit_enemy',
            bulletId: 1,
            enemyId: 101,
            damage: 3,
            bulletX: 100,
            bulletY: 100,
            bulletVx: 8,
            bulletVy: -3,
            bulletWillDespawn: true,
            bulletPiercingRemaining: -1, // non-piercing
        });
        // Explicit field count guard: ensure exactly 9 fields ship and
        // none silently get dropped if the implementation evolves.
        expect(Object.keys(events[0]).sort()).toEqual([
            'bulletId', 'bulletPiercingRemaining', 'bulletVx', 'bulletVy',
            'bulletWillDespawn', 'bulletX', 'bulletY', 'damage', 'enemyId',
            'type',
        ].sort());
    });
});

// ---------------------------------------------------------------------
// Test — geometry miss (centers further than sumR apart).
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — geometry miss', () => {
    test('bullet outside (bullet.r + enemy.r) emits no event', () => {
        const b = bullet(1, 0, 0);
        // 200 px ≫ sumR=22 → clearly no overlap.
        const e = enemyWithRadius(101, 200, 0);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('bullet just outside boundary (sumR + 1) emits no event', () => {
        const b = bullet(1, 0, 0, { radius: 4 });
        // sumR = 4 + 18 = 22; place enemy center 23 px away → just outside.
        const e = enemyWithRadius(101, 23, 0, 18);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — piercing bullet hits multiple enemies in same tick.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — piercing within a tick', () => {
    test('piercing=2 bullet hits 3 overlapping enemies in same tick', () => {
        const b = bullet(1, 100, 100, { piercing: 2, damage: 1 });
        // All three enemies overlap the bullet's circle (radius 18 each,
        // bullet radius 4 → sumR 22; bullet at (100, 100)).
        const e1 = enemyWithRadius(101, 110, 100);
        const e2 = enemyWithRadius(102, 115, 100);
        const e3 = enemyWithRadius(103,  90, 100);
        const events = [];
        detectBulletEnemyHits([b], [e1, e2, e3], ctx, events);
        // piercing=2 means it can hit piercing+1 = 3 targets.
        expect(events).toHaveLength(3);
        expect(events.map(e => e.enemyId).sort()).toEqual([101, 102, 103]);
        // Last hit should mark the bullet for despawn (budget reached).
        const lastEvent = events[events.length - 1];
        expect(lastEvent.bulletWillDespawn).toBe(true);
        // Earlier events should NOT despawn — the bullet is still alive.
        expect(events[0].bulletWillDespawn).toBe(false);
        expect(events[1].bulletWillDespawn).toBe(false);
        // Piercing-remaining counter decrements: 1, 0, 0 (clamped).
        expect(events[0].bulletPiercingRemaining).toBe(1);
        expect(events[1].bulletPiercingRemaining).toBe(0);
        expect(events[2].bulletPiercingRemaining).toBe(0);
    });

    test('piercing=1 bullet hits 2 enemies in same tick (piercing + 1)', () => {
        const b = bullet(1, 100, 100, { piercing: 1 });
        const e1 = enemyWithRadius(101, 110, 100);
        const e2 = enemyWithRadius(102, 115, 100);
        const events = [];
        detectBulletEnemyHits([b], [e1, e2], ctx, events);
        expect(events).toHaveLength(2);
        expect(events[0].bulletWillDespawn).toBe(false);
        expect(events[0].bulletPiercingRemaining).toBe(0);
        expect(events[1].bulletWillDespawn).toBe(true);
    });
});

// ---------------------------------------------------------------------
// Test — non-piercing bullet only hits ONE enemy.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — non-piercing single-hit', () => {
    test('non-piercing bullet emits exactly one event when 3 enemies overlap', () => {
        const b = bullet(1, 100, 100, { piercing: 0 });
        const e1 = enemyWithRadius(101, 110, 100);
        const e2 = enemyWithRadius(102, 115, 100);
        const e3 = enemyWithRadius(103,  90, 100);
        const events = [];
        detectBulletEnemyHits([b], [e1, e2, e3], ctx, events);
        expect(events).toHaveLength(1);
        // It should hit the FIRST overlapping enemy in array order.
        expect(events[0].enemyId).toBe(101);
        expect(events[0].bulletWillDespawn).toBe(true);
        expect(events[0].bulletPiercingRemaining).toBe(-1);
    });
});

// ---------------------------------------------------------------------
// Test — piercedEnemyIds Set carry-over across frames.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — piercedEnemyIds across ticks', () => {
    test('a piercing bullet that hit enemy X last frame does NOT re-hit it this frame', () => {
        const b = bullet(1, 100, 100, { piercing: 5, damage: 1 });
        const e = enemyWithRadius(101, 110, 100);

        // ── Frame 1 ──
        const frame1Events = [];
        detectBulletEnemyHits([b], [e], ctx, frame1Events);
        expect(frame1Events).toHaveLength(1);
        // After frame 1, the bullet should remember it pierced this enemy.
        expect(b.piercedEnemyIds).toBeDefined();
        expect(b.piercedEnemyIds.has(101)).toBe(true);

        // ── Frame 2 — same enemy, still overlapping ──
        const frame2Events = [];
        detectBulletEnemyHits([b], [e], ctx, frame2Events);
        expect(frame2Events).toHaveLength(0);
    });

    test('piercedEnemyIds is lazily created (not pre-allocated)', () => {
        // A bullet that never hits anything shouldn't carry a Set.
        const b = bullet(1, 0, 0);
        const e = enemyWithRadius(101, 999, 999); // Far away — no hit.
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
        expect(b.piercedEnemyIds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------
// Test — piercedEnemyIds is DISTINCT from piercedAsteroidIds.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — independent from piercedAsteroidIds', () => {
    test('a bullet that pierced asteroid X can still hit enemy with same id', () => {
        // Pre-seed the bullet as if it had already pierced asteroid 101
        // in an earlier pair-dispatch this tick.
        const b = bullet(1, 100, 100, { piercing: 3, damage: 1 });
        b.piercedAsteroidIds = new Set([101]);
        b.piercedEnemies = 1; // shared counter already shows one pierce

        // Enemy ALSO with id=101 (different id space, different target).
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        // The enemy must NOT be skipped — its id is in piercedAsteroidIds
        // but NOT in piercedEnemyIds.
        expect(events).toHaveLength(1);
        expect(events[0].enemyId).toBe(101);
        // Now the bullet's enemy-pierce set is populated, but the
        // asteroid-pierce set should still hold the original id only.
        expect(b.piercedEnemyIds.has(101)).toBe(true);
        expect(b.piercedAsteroidIds.has(101)).toBe(true);
        // Shared counter ticked up by 1 (now 2 — one ast + one enemy).
        expect(b.piercedEnemies).toBe(2);
    });

    test('piercedEnemyIds does NOT leak into piercedAsteroidIds (one-direction)', () => {
        const b = bullet(1, 100, 100, { piercing: 1 });
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(1);
        expect(b.piercedEnemyIds.has(101)).toBe(true);
        // Asteroid-pierce set must NOT have been touched.
        expect(b.piercedAsteroidIds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------
// Test — skip gates.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — skipped pairs', () => {
    test('inactive bullet is skipped', () => {
        const b = bullet(1, 100, 100, { active: false });
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('inactive enemy is skipped', () => {
        const b = bullet(1, 100, 100);
        const e = enemyWithRadius(101, 110, 100, 18, { active: false });
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('warping enemy is skipped', () => {
        const b = bullet(1, 100, 100);
        const e = enemyWithRadius(101, 110, 100, 18, { warping: true });
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('enemy mid-death-flash (new deathFlash field) is skipped', () => {
        const b = bullet(1, 100, 100);
        const e = enemyWithRadius(101, 110, 100, 18, { deathFlash: 5 });
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('enemy mid-death-flash (legacy _deathFlash) is skipped', () => {
        const b = bullet(1, 100, 100);
        // Live Enemy instances use the underscore-prefix name.
        const e = { id: 101, x: 110, y: 100, radius: 18, active: true,
                    warping: false, _deathFlash: 5 };
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — empty / null inputs defensive guards.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — empty inputs', () => {
    test('empty bullets array → no events', () => {
        const events = [];
        detectBulletEnemyHits([], [enemyWithRadius(101, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty enemies array → no events', () => {
        const events = [];
        detectBulletEnemyHits([bullet(1, 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectBulletEnemyHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null bullets → no events (defensive)', () => {
        const events = [];
        detectBulletEnemyHits(null, [enemyWithRadius(101, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null enemies → no events (defensive)', () => {
        const events = [];
        detectBulletEnemyHits([bullet(1, 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — damage propagates through to the event.
// ---------------------------------------------------------------------

describe('detectBulletEnemyHits — damage propagation', () => {
    test('event.damage matches bullet.damage', () => {
        const b = bullet(1, 100, 100, { damage: 7 });
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(7);
    });

    test('event.damage defaults to 1 when bullet.damage is missing/zero', () => {
        const b = bullet(1, 100, 100, { damage: 0 });
        const e = enemyWithRadius(101, 110, 100);
        const events = [];
        detectBulletEnemyHits([b], [e], ctx, events);
        expect(events[0].damage).toBe(1);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Player-vs-enemy pair (Phase 2.5 — dispatch 4).
// ═════════════════════════════════════════════════════════════════════
//
// `detectPlayerEnemyHits` is the fourth pure-step pair extracted from the
// legacy `handlePlayerEnemyCollision` in `js/modules/combat/collision-system.js`
// (lines 1657-1819). The legacy path bundles damage + visuals + audio +
// camera kicks + tank consumption + boss-rage triggers; the pure step
// reports only the mechanical deltas — impulse + separation deltas for
// BOTH bodies — that the wrapper applies to live state.
//
// IMPORTANT — math is DIFFERENT from the asteroid pair:
//   - Asteroid pair: jittered atan2-knockback × ASTEROID_KNOCKBACK_MULTIPLIER
//     (22.0), separation = overlap + SEPARATION_BUFFER, plus OVERLAP_PUSH_FORCE
//     velocity nudge. The asteroid path ALWAYS applies the knockback.
//   - Enemy pair: textbook restitution impulse model with `-(1 + R) · vN /
//     totalMass`, BOUNCE_FORCE_MULTIPLIER (12.0), separation =
//     overlap × OVERLAP_SEPARATION_RATIO split between both bodies, NO
//     velocity push-force nudge. The enemy path BAILS on velAlongNormal > 0
//     (separating velocities) — only the geometric overlap is emitted in
//     that case (and the wrapper still applies damage).
//
// The tests below pin:
//   - the damage constant (5, vs 2 for asteroids)
//   - geometry overlap (circle-circle)
//   - all event payload fields (impulse + separation for BOTH bodies)
//   - skip gates (inactive / warping / death-flash on enemy side)
//   - multiple enemies in one tick
//   - bounce direction (eastbound player off a westward enemy ⇒ westbound impulse)
//   - separating velocities bail-out (no impulse, but separation still applies)
//   - defensive empty / null inputs

// ---------------------------------------------------------------------
// Helpers — build player + enemy pairs. `makePlayer` and `enemyWithRadius`
// are already defined for earlier dispatches; reuse them here. Enemy
// needs a `mass` field set for the impulse math (live `Enemy` instances
// assign mass directly per type).
// ---------------------------------------------------------------------

/** Build an enemy with explicit radius + mass + velocity. Default mass=200
 *  matches a small-to-medium enemy ship in the live game. */
function makeEnemy(id, x, y, overrides = {}) {
    const e = enemyWithRadius(id, x, y, overrides.radius || 18, {
        active: overrides.active,
        warping: overrides.warping,
        deathFlash: overrides.deathFlash,
        _deathFlash: overrides._deathFlash,
        vx: overrides.vx,
        vy: overrides.vy,
    });
    e.mass = overrides.mass !== undefined ? overrides.mass : 200;
    return e;
}

// ---------------------------------------------------------------------
// Constants — pinned to the legacy COLLISION_CONFIG block.
// ---------------------------------------------------------------------

describe('player-enemy collision constants', () => {
    test('PLAYER_ENEMY_COLLISION_DAMAGE is 5 (verbatim from collision-system.js)', () => {
        expect(PLAYER_ENEMY_COLLISION_DAMAGE).toBe(5);
    });
    // Reused constants — pinned here as a defensive parity guard for the
    // enemy pair specifically. They were already pinned for the asteroid
    // pair above, but if those constants ever drift the enemy pair tests
    // will catch the breakage independently.
    test('BOUNCE_RESTITUTION still 0.9 (consumed by player-enemy bounce)', () => {
        expect(BOUNCE_RESTITUTION).toBe(0.9);
    });
    test('BOUNCE_FORCE_MULTIPLIER still 12.0 (consumed by player-enemy bounce)', () => {
        expect(BOUNCE_FORCE_MULTIPLIER).toBe(12.0);
    });
    test('OVERLAP_SEPARATION_RATIO still 0.6 (consumed by player-enemy separation)', () => {
        expect(OVERLAP_SEPARATION_RATIO).toBe(0.6);
    });
});

// ---------------------------------------------------------------------
// Test — single overlapping pair emits one fully-populated event.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — single hit', () => {
    test('overlapping player + enemy emits one event with all 12 fields', () => {
        // Player radius 15, enemy radius 18 ⇒ sumR = 33.
        // Place player and enemy 20 px apart on x-axis ⇒ overlap = 13.
        // Player moving east (vx=8), enemy still ⇒ approaching (vAN < 0).
        const p = makePlayer('p1', 100, 100, { vx: 8, vy: 0 });
        const e = makeEnemy(10, 120, 100, { vx: 0, vy: 0 });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);

        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.type).toBe('player_hit_enemy');
        expect(ev.playerId).toBe('p1');
        expect(ev.enemyId).toBe(10);
        expect(ev.damageToEnemy).toBe(PLAYER_ENEMY_COLLISION_DAMAGE);
        expect(ev.damageToEnemy).toBe(5);
        // All eight numeric delta fields must be defined and finite.
        const deltaFields = [
            'playerImpulseDx', 'playerImpulseDy',
            'enemyImpulseDx', 'enemyImpulseDy',
            'separationDx', 'separationDy',
            'enemySeparationDx', 'enemySeparationDy',
        ];
        for (const f of deltaFields) {
            expect(typeof ev[f]).toBe('number');
            expect(Number.isFinite(ev[f])).toBe(true);
        }
        // Field-key guard — exactly 12 keys, none silently dropped.
        expect(Object.keys(ev).sort()).toEqual([
            'damageToEnemy', 'enemyId', 'enemyImpulseDx', 'enemyImpulseDy',
            'enemySeparationDx', 'enemySeparationDy',
            'playerId', 'playerImpulseDx', 'playerImpulseDy',
            'separationDx', 'separationDy', 'type',
        ].sort());
        // Geometry overlapped ⇒ separation must be nonzero on the
        // collision axis (x here). Player gets pushed west (negative).
        expect(ev.separationDx).toBeLessThan(0);
        expect(ev.separationDy).toBe(0);
        // Enemy separation is the mirror image — enemy gets pushed east.
        expect(ev.enemySeparationDx).toBeGreaterThan(0);
        expect(ev.enemySeparationDx).toBeCloseTo(-ev.separationDx, 10);
    });
});

// ---------------------------------------------------------------------
// Test — geometry miss.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — geometry miss', () => {
    test('player outside (player.r + enemy.r) emits no event', () => {
        const p = makePlayer('p1', 0, 0);
        // 200 ≫ sumR=33 → clearly no overlap.
        const e = makeEnemy(10, 200, 0);
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('player just outside boundary (sumR + 1) emits no event', () => {
        const p = makePlayer('p1', 0, 0, { radius: 15 });
        // sumR = 33; place enemy center 34 px away → just outside.
        const e = makeEnemy(10, 34, 0, { radius: 18 });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — one player overlapping multiple enemies ⇒ multiple events.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — multiple enemies in one tick', () => {
    test('player caught between two enemies emits two events', () => {
        const p = makePlayer('p1', 100, 100, { vx: 0, vy: 0 });
        // Place enemies east + west, both close enough to overlap
        // (sumR=33, place them 20 px out).
        const east = makeEnemy(10, 120, 100);
        const west = makeEnemy(20,  80, 100);
        const events = [];
        detectPlayerEnemyHits([p], [east, west], ctx, events);
        expect(events).toHaveLength(2);
        const ids = events.map(e => e.enemyId).sort((a, b) => a - b);
        expect(ids).toEqual([10, 20]);
        for (const ev of events) {
            expect(ev.playerId).toBe('p1');
            expect(ev.type).toBe('player_hit_enemy');
            expect(ev.damageToEnemy).toBe(5);
        }
    });
});

// ---------------------------------------------------------------------
// Test — skip gates (inactive / warping / death-flash on enemy side).
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — skipped pairs', () => {
    test('inactive player → no event', () => {
        const p = makePlayer('p1', 100, 100, { active: false });
        const e = makeEnemy(10, 120, 100);
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('inactive enemy → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const e = makeEnemy(10, 120, 100, { active: false });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('warping enemy → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const e = makeEnemy(10, 120, 100, { warping: true });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('enemy mid death-flash (new field name) → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const e = makeEnemy(10, 120, 100, { deathFlash: 5 });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('enemy mid death-flash (legacy _deathFlash) → no event', () => {
        const p = makePlayer('p1', 100, 100);
        // Live Enemy instances use the underscore-prefix name; the pure
        // step honors both for round-trip parity with the legacy module.
        const e = { id: 10, x: 120, y: 100, radius: 18, mass: 200,
                    active: true, warping: false, _deathFlash: 5,
                    vx: 0, vy: 0 };
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — bounce direction. Player moving east into an enemy east of it
// should get deflected back west (negative dx on player impulse).
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — bounce direction', () => {
    test('eastbound player ramming a westward enemy gets impulse pushing west', () => {
        // Geometry:
        //   - Player at (100, 100), radius 15, moving east (vx=10).
        //   - Enemy 20 px east at (120, 100), radius 18, moving west
        //     (vx=-2). distance=20, sumR=33 ⇒ overlap=13.
        //
        // Normal (enemy → player) = (-1, 0).
        // relVx = 10 - (-2) = 12, dot normal = -12 < 0 ⇒ APPROACHING
        // (impulse fires).
        //
        // impulseScalar = -(1+0.9) · (-12) / (playerMass + enemyMass)
        //               = +22.8 / totalMass     → POSITIVE
        // impulseX      = +22.8 / totalMass · (-1) → NEGATIVE
        // playerImpulseDx = impulseX · enemyMass · 12.0 → NEGATIVE
        //                 = (player gets shoved WEST, away from enemy).
        // enemyImpulseDx  = -impulseX · playerMass · 12.0 → POSITIVE
        //                 = (enemy gets shoved EAST, away from player).
        const p = makePlayer('p1', 100, 100, { vx: 10, vy: 0 });
        const e = makeEnemy(10, 120, 100, { vx: -2, vy: 0 });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        // Player gets pushed west.
        expect(ev.playerImpulseDx).toBeLessThan(0);
        expect(ev.playerImpulseDy).toBeCloseTo(0, 10);
        // Enemy gets pushed east (opposite direction).
        expect(ev.enemyImpulseDx).toBeGreaterThan(0);
        expect(ev.enemyImpulseDy).toBeCloseTo(0, 10);
        // Newton's third law (within the multiplier asymmetry): the
        // ratio of impulses equals enemyMass/playerMass.
        // |playerImpulseDx| · playerMass ≈ |enemyImpulseDx| · enemyMass.
        const playerMass = Math.PI * 15 * 15 * 0.5; // entityMass fallback
        const enemyMass = 200; // explicit
        // Left side: |player Δv| · mP. Right side: |enemy Δv| · mE.
        const lhs = Math.abs(ev.playerImpulseDx) * playerMass;
        const rhs = Math.abs(ev.enemyImpulseDx) * enemyMass;
        // These should be exactly equal under the bounce-force formula.
        expect(lhs).toBeCloseTo(rhs, 6);
    });
});

// ---------------------------------------------------------------------
// Test — separating velocities. Bodies overlap but their relative
// velocity already points outward ⇒ impulse must be zero, but the
// separation push and the damage event still fire (matches legacy
// line 1771 bail-out behavior + the wrapper still damaging on graze).
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — separating velocities', () => {
    test('player moving away from enemy still overlaps: damage + separation fire, impulse is zero', () => {
        // Geometry: player + enemy still overlap (distance=20, sumR=33).
        // But player is moving AWAY from the enemy now (player westbound,
        // enemy stationary). Normal points (-1, 0); relVx = -5 (player
        // westbound), velAlongNormal = (-5)·(-1) = +5 > 0 ⇒ separating.
        const p = makePlayer('p1', 100, 100, { vx: -5, vy: 0 });
        const e = makeEnemy(10, 120, 100, { vx: 0, vy: 0 });
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        // Damage still applies (graze frame).
        expect(ev.damageToEnemy).toBe(5);
        // Impulse is zero on both bodies (the bail-out branch).
        expect(ev.playerImpulseDx).toBe(0);
        expect(ev.playerImpulseDy).toBe(0);
        expect(ev.enemyImpulseDx).toBe(0);
        expect(ev.enemyImpulseDy).toBe(0);
        // But separation still moves them apart (overlap > 0 path).
        expect(ev.separationDx).toBeLessThan(0);
        expect(ev.enemySeparationDx).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------
// Test — separation magnitude follows OVERLAP_SEPARATION_RATIO.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — separation magnitude', () => {
    test('separation = overlap × OVERLAP_SEPARATION_RATIO along (enemy → player) normal', () => {
        // Player at (100, 100), radius 15; enemy at (120, 100), radius 18.
        // distance = 20, sumR = 33 ⇒ overlap = 13.
        // Normal points west (-1, 0).
        // separationForce = 13 · 0.6 = 7.8.
        // separation = (-1, 0) · 7.8 = (-7.8, 0).
        const p = makePlayer('p1', 100, 100);
        const e = makeEnemy(10, 120, 100);
        const events = [];
        detectPlayerEnemyHits([p], [e], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.separationDx).toBeCloseTo(-13 * OVERLAP_SEPARATION_RATIO, 5);
        expect(ev.separationDy).toBeCloseTo(0, 5);
        // Enemy separation is the negative mirror.
        expect(ev.enemySeparationDx).toBeCloseTo(13 * OVERLAP_SEPARATION_RATIO, 5);
        expect(ev.enemySeparationDy).toBeCloseTo(0, 5);
    });
});

// ---------------------------------------------------------------------
// Test — empty / null inputs defensive guards.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyHits — empty inputs', () => {
    test('empty players → no events', () => {
        const events = [];
        detectPlayerEnemyHits([], [makeEnemy(10, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty enemies → no events', () => {
        const events = [];
        detectPlayerEnemyHits([makePlayer('p1', 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectPlayerEnemyHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null players → no events (defensive)', () => {
        const events = [];
        detectPlayerEnemyHits(null, [makeEnemy(10, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null enemies → no events (defensive)', () => {
        const events = [];
        detectPlayerEnemyHits([makePlayer('p1', 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Enemy-vs-asteroid pair (Phase 2.5 — dispatch 5).
// ═════════════════════════════════════════════════════════════════════
//
// `detectEnemyAsteroidHits` is the fifth pure-step pair, extracted from
// `handleEnemyAsteroidCollision` in `js/modules/combat/collision-system.js`
// (lines 1898-1944). This pair is DIFFERENT from every prior pair:
//
//   - NO damage to either side. Period. Enemies don't lose HP when they
//     bump asteroids; asteroids don't lose HP either. The wrapper does
//     not call `takeDamage` on either body. (Legacy explicit code comment
//     at line 1943: "No enemy destruction from asteroid collisions".)
//   - NO restitution / mass-aware impulse math. Just two fixed-force
//     scalar pushes, one per body, along the collision normal.
//   - NO position separation. The legacy path only modifies velocities;
//     the next-tick simulation moves the bodies apart on its own.
//   - NO jitter / RNG. Fully deterministic.
//
// Event shape: exactly 6 non-type fields (enemyId, asteroidId, and the
// 2x2 impulse delta block). NO `damage` field. NO `separation` fields.
// Total 7 keys with `type`.
//
// The tests below pin:
//   - the two push-force constants (4 and 2, verbatim from COLLISION_CONFIG)
//   - geometry overlap (circle-circle)
//   - single-overlap event shape (exactly 6 non-type fields)
//   - geometry miss (no event)
//   - multiple overlaps in one tick (multiple events)
//   - skip gates (inactive enemy/asteroid, warping enemy/asteroid, death-flash)
//   - push direction (enemy west of asteroid ⇒ enemy gets pushed further west)
//   - defensive empty / null inputs

// ---------------------------------------------------------------------
// Helpers — reuse `enemyWithRadius` and `makeAsteroid` from earlier
// dispatches. Enemies don't need a `mass` field for this pair (no
// mass-aware math) — just position + radius + skip-gate fields.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Constants — pinned to the legacy COLLISION_CONFIG block.
// ---------------------------------------------------------------------

describe('enemy-asteroid collision constants', () => {
    test('ENEMY_ASTEROID_PUSH is 4 (verbatim from collision-system.js:38)', () => {
        expect(ENEMY_ASTEROID_PUSH).toBe(4);
    });
    test('ASTEROID_ENEMY_PUSH is 2 (verbatim from collision-system.js:40)', () => {
        expect(ASTEROID_ENEMY_PUSH).toBe(2);
    });
});

// ---------------------------------------------------------------------
// Test — single overlap emits one event with exactly 6 non-type fields.
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — single hit', () => {
    test('overlapping enemy + asteroid emits one event with all 6 non-type fields', () => {
        // Enemy radius 18 + asteroid radius 30 = sumR 48. Place asteroid
        // 20 px east of enemy ⇒ overlap = 28 (clear hit).
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.type).toBe('enemy_hit_asteroid');
        expect(ev.enemyId).toBe(7);
        expect(ev.asteroidId).toBe(42);
        // All four numeric delta fields must be defined and finite.
        const deltaFields = [
            'enemyImpulseDx', 'enemyImpulseDy',
            'asteroidImpulseDx', 'asteroidImpulseDy',
        ];
        for (const f of deltaFields) {
            expect(typeof ev[f]).toBe('number');
            expect(Number.isFinite(ev[f])).toBe(true);
        }
        // Explicit field-count guard: exactly 7 keys (type + 6
        // non-type fields). NO `damage` field. NO `separation` fields.
        // If the implementation ever adds damage or separation, this
        // guard will catch it and force the test contract to be
        // updated explicitly.
        expect(Object.keys(ev).sort()).toEqual([
            'asteroidId',
            'asteroidImpulseDx', 'asteroidImpulseDy',
            'enemyId',
            'enemyImpulseDx', 'enemyImpulseDy',
            'type',
        ].sort());
        // Defensive: confirm there is NO damage field of any name.
        expect(ev.damage).toBeUndefined();
        expect(ev.damageToEnemy).toBeUndefined();
        expect(ev.damageToAsteroid).toBeUndefined();
        // Defensive: confirm there are NO separation fields.
        expect(ev.separationDx).toBeUndefined();
        expect(ev.separationDy).toBeUndefined();
        expect(ev.enemySeparationDx).toBeUndefined();
        expect(ev.asteroidSeparationDx).toBeUndefined();
    });

    test('impulse magnitudes match the push-force constants verbatim', () => {
        // Geometry: enemy at (100, 100), asteroid 20 px east at (120, 100).
        // angle = atan2(0, 20) = 0 ⇒ cos=1, sin=0.
        // Enemy gets (-cos·4, -sin·4) = (-4, 0).
        // Asteroid gets (+cos·2, +sin·2) = (+2, 0).
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.enemyImpulseDx).toBeCloseTo(-ENEMY_ASTEROID_PUSH, 10);
        expect(ev.enemyImpulseDy).toBeCloseTo(0, 10);
        expect(ev.asteroidImpulseDx).toBeCloseTo(ASTEROID_ENEMY_PUSH, 10);
        expect(ev.asteroidImpulseDy).toBeCloseTo(0, 10);
    });
});

// ---------------------------------------------------------------------
// Test — geometry miss (centers further than sumR apart).
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — geometry miss', () => {
    test('enemy outside (enemy.r + asteroid.r) emits no event', () => {
        const e = enemyWithRadius(7, 0, 0);
        // 200 px ≫ sumR=48 → clearly no overlap.
        const a = makeAsteroid(42, 200, 0);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('enemy just outside boundary (sumR + 1) emits no event', () => {
        const e = enemyWithRadius(7, 0, 0, 18);
        // sumR = 18 + 30 = 48; place asteroid center 49 px away → just
        // outside.
        const a = makeAsteroid(42, 49, 0, { radius: 30 });
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — multiple overlaps in one tick emit one event per pair.
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — multiple overlaps in one tick', () => {
    test('one enemy overlapping two asteroids emits two events', () => {
        // Enemy at (100, 100), radius 18. Two asteroids close enough on
        // east + west to overlap (sumR=48; place 20 px out).
        const e = enemyWithRadius(7, 100, 100);
        const east = makeAsteroid(10, 120, 100); // dx=20, sumR=48 ⇒ overlap
        const west = makeAsteroid(20,  80, 100); // dx=-20, sumR=48 ⇒ overlap
        const events = [];
        detectEnemyAsteroidHits([e], [east, west], ctx, events);
        expect(events).toHaveLength(2);
        const ids = events.map(ev => ev.asteroidId).sort((a, b) => a - b);
        expect(ids).toEqual([10, 20]);
        // Each event carries the enemy's id and the correct type.
        for (const ev of events) {
            expect(ev.enemyId).toBe(7);
            expect(ev.type).toBe('enemy_hit_asteroid');
        }
    });

    test('two enemies overlapping the same asteroid both emit events', () => {
        // Enemies on east + west of one asteroid at (100, 100). Both
        // close enough to overlap with sumR=48.
        const eastEnemy = enemyWithRadius(7, 120, 100);
        const westEnemy = enemyWithRadius(8,  80, 100);
        const a = makeAsteroid(42, 100, 100);
        const events = [];
        detectEnemyAsteroidHits([eastEnemy, westEnemy], [a], ctx, events);
        expect(events).toHaveLength(2);
        // Both events reference the same asteroid but distinct enemies.
        expect(events.map(ev => ev.asteroidId)).toEqual([42, 42]);
        expect(events.map(ev => ev.enemyId).sort()).toEqual([7, 8]);
    });
});

// ---------------------------------------------------------------------
// Test — skip gates (inactive enemy/asteroid, warping, death-flash).
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — skipped pairs', () => {
    test('inactive enemy → no event', () => {
        const e = enemyWithRadius(7, 100, 100, 18, { active: false });
        const a = makeAsteroid(42, 120, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('inactive asteroid → no event', () => {
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100, { active: false });
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('warping enemy → no event', () => {
        const e = enemyWithRadius(7, 100, 100, 18, { warping: true });
        const a = makeAsteroid(42, 120, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('warping asteroid → no event', () => {
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100, { warping: true });
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('asteroid mid death-flash (new deathFlash field) → no event', () => {
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100, { deathFlash: 5 });
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('asteroid mid death-flash (legacy _deathFlash) → no event', () => {
        const e = enemyWithRadius(7, 100, 100);
        // Live Asteroid instances use the underscore-prefix name; the
        // pure step honors both for round-trip parity with the legacy
        // module.
        const a = { id: 42, x: 120, y: 100, radius: 30, active: true,
                    warping: false, _deathFlash: 5 };
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — push direction. An enemy positioned WEST of an asteroid should
// be pushed FURTHER WEST (negative dx), and the asteroid should be
// pushed FURTHER EAST (positive dx).
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — push direction', () => {
    test('enemy west of asteroid → enemy pushed west, asteroid pushed east', () => {
        // Enemy at (100, 100); asteroid east at (120, 100). The enemy
        // is therefore WEST of the asteroid.
        //   dx = asteroid.x - enemy.x = +20 → angle = 0
        //   cos(angle)=1, sin(angle)=0
        //   enemyImpulseDx  = -1·4 = -4  (west — away from asteroid)
        //   asteroidImpulseDx = +1·2 = +2 (east — away from enemy)
        const e = enemyWithRadius(7, 100, 100);
        const a = makeAsteroid(42, 120, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        // Enemy gets pushed west (negative x).
        expect(ev.enemyImpulseDx).toBeLessThan(0);
        expect(ev.enemyImpulseDy).toBeCloseTo(0, 10);
        // Asteroid gets pushed east (positive x).
        expect(ev.asteroidImpulseDx).toBeGreaterThan(0);
        expect(ev.asteroidImpulseDy).toBeCloseTo(0, 10);
        // The two impulses point in OPPOSITE directions along x.
        expect(Math.sign(ev.enemyImpulseDx)).toBe(-Math.sign(ev.asteroidImpulseDx));
    });

    test('enemy north of asteroid → enemy pushed north, asteroid pushed south', () => {
        // Enemy at (100, 80); asteroid at (100, 100). Enemy is north
        // (smaller y in screen coords).
        //   dx = 0, dy = +20 → angle = π/2 (pointing south)
        //   cos=0, sin=1
        //   enemyImpulseDy  = -1·4 = -4 (north — away from asteroid)
        //   asteroidImpulseDy = +1·2 = +2 (south — away from enemy)
        const e = enemyWithRadius(7, 100, 80);
        const a = makeAsteroid(42, 100, 100);
        const events = [];
        detectEnemyAsteroidHits([e], [a], ctx, events);
        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.enemyImpulseDx).toBeCloseTo(0, 10);
        expect(ev.enemyImpulseDy).toBeLessThan(0); // pushed north
        expect(ev.asteroidImpulseDx).toBeCloseTo(0, 10);
        expect(ev.asteroidImpulseDy).toBeGreaterThan(0); // pushed south
    });
});

// ---------------------------------------------------------------------
// Test — empty / null inputs defensive guards.
// ---------------------------------------------------------------------

describe('detectEnemyAsteroidHits — empty inputs', () => {
    test('empty enemies → no events', () => {
        const events = [];
        detectEnemyAsteroidHits([], [makeAsteroid(42, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty asteroids → no events', () => {
        const events = [];
        detectEnemyAsteroidHits([enemyWithRadius(7, 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectEnemyAsteroidHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null enemies → no events (defensive)', () => {
        const events = [];
        detectEnemyAsteroidHits(null, [makeAsteroid(42, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null asteroids → no events (defensive)', () => {
        const events = [];
        detectEnemyAsteroidHits([enemyWithRadius(7, 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════════════
// Player-vs-enemy-bullet pair (Phase 2.5 — dispatch 6).
// ═════════════════════════════════════════════════════════════════════
//
// `detectPlayerEnemyBulletHits` is the sixth pure-step pair, extracted
// from `handlePlayerEnemyBulletCollision` in
// `js/modules/combat/collision-system.js` (lines 1821-1896). This pair
// is the SIMPLEST so far:
//
//   - NO bounce / restitution / impulse on either side.
//   - NO position separation.
//   - NO mass-aware math.
//   - The pure step only emits a damage event with bullet metadata
//     (position + velocity) for the wrapper to localize FX. The wrapper
//     applies damage (with shield / bulwark / phase-dash / tanks
//     policy), despawns the bullet, and runs all the presentation /
//     audio / particle effects.
//
// Event shape: exactly 7 fields including `type`. The wrapper consumes
// `damage` + `playerId` to apply HP loss and `bulletId` to despawn.
//
// The tests below pin:
//   - single hit happy path (all 7 fields populated correctly)
//   - geometry miss (no event)
//   - multiple bullets in one tick (one event per overlap)
//   - skip gates (inactive player, inactive bullet)
//   - damage passthrough (bullet.damage = 7 → event.damage = 7;
//     bullet.damage = 0 → event.damage = 1 default)
//   - defensive empty / null inputs

// ---------------------------------------------------------------------
// Helpers — reuse `makePlayer` from the player-asteroid block. Build
// enemy bullets with `freshBulletState(id, 'enemy', ...)`. Default
// radius=9 matches the live `EnemyBullet` constructor.
// ---------------------------------------------------------------------

function enemyBullet(id, x, y, overrides = {}) {
    return freshBulletState(id, 'enemy', {
        x, y, radius: 9, baseRadius: 9, damage: 2, ...overrides,
    });
}

// ---------------------------------------------------------------------
// (No new constants for this pair — damage value comes from the bullet.
// The default-damage fallback of 1 is an implementation detail of
// detectPlayerEnemyBulletHits and is verified directly by the damage
// passthrough tests below.)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Test — single hit happy path (all 7 event fields populated).
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — single hit', () => {
    test('overlapping player + enemy bullet emits one event with all 7 fields', () => {
        // Player radius 15 + bullet radius 9 = sumR = 24. Place bullet
        // 10 px east of player → overlap = 14 (clear hit).
        const p = makePlayer('p1', 100, 100);
        const b = enemyBullet(42, 110, 100, { vx: -3, vy: 1, damage: 4 });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);

        expect(events).toHaveLength(1);
        const ev = events[0];
        expect(ev.type).toBe('player_hit_by_enemy_bullet');
        expect(ev.playerId).toBe('p1');
        expect(ev.bulletId).toBe(42);
        expect(ev.damage).toBe(4);
        expect(ev.bulletX).toBe(110);
        expect(ev.bulletY).toBe(100);
        expect(ev.bulletVx).toBe(-3);
        expect(ev.bulletVy).toBe(1);

        // Explicit field-count guard — exactly 8 keys (type + 7
        // non-type fields). If a future change adds a separation /
        // impulse field (bullets shouldn't push the player), this
        // catches it.
        expect(Object.keys(ev).sort()).toEqual([
            'bulletId', 'bulletVx', 'bulletVy', 'bulletX', 'bulletY',
            'damage', 'playerId', 'type',
        ].sort());

        // Defensive: confirm there is NO impulse / separation field on
        // this pair. Bullets are massless on the physics side.
        expect(ev.playerImpulseDx).toBeUndefined();
        expect(ev.playerImpulseDy).toBeUndefined();
        expect(ev.bulletImpulseDx).toBeUndefined();
        expect(ev.bulletImpulseDy).toBeUndefined();
        expect(ev.separationDx).toBeUndefined();
        expect(ev.separationDy).toBeUndefined();
        // Defensive: no despawn flag — enemy bullets always despawn on
        // hit, so the wrapper handles it unconditionally.
        expect(ev.bulletWillDespawn).toBeUndefined();
    });
});

// ---------------------------------------------------------------------
// Test — geometry miss.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — geometry miss', () => {
    test('bullet outside (player.r + bullet.r) emits no event', () => {
        const p = makePlayer('p1', 0, 0);
        // 200 ≫ sumR=24 → clearly no overlap.
        const b = enemyBullet(42, 200, 0);
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('bullet just outside boundary (sumR + 1) emits no event', () => {
        const p = makePlayer('p1', 0, 0, { radius: 15 });
        // sumR = 15 + 9 = 24; place bullet center 25 px away → just
        // outside.
        const b = enemyBullet(42, 25, 0, { radius: 9 });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — multiple bullets in one tick.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — multiple bullets in one tick', () => {
    test('player caught in a barrage emits one event per overlapping bullet', () => {
        // Player at (100, 100). Place three bullets that all overlap
        // (sumR=24): two close (east + west), and one further away
        // that misses. Verify the two overlapping bullets emit events
        // and the third does not.
        const p = makePlayer('p1', 100, 100);
        const east = enemyBullet(10, 115, 100); // dx=15, sumR=24 ⇒ overlap
        const west = enemyBullet(20,  85, 100); // dx=-15, sumR=24 ⇒ overlap
        const far  = enemyBullet(30, 200, 100); // dx=100 ≫ sumR ⇒ miss
        const events = [];
        detectPlayerEnemyBulletHits([p], [east, west, far], ctx, events);
        expect(events).toHaveLength(2);
        const ids = events.map(e => e.bulletId).sort((a, b) => a - b);
        expect(ids).toEqual([10, 20]);
        for (const ev of events) {
            expect(ev.playerId).toBe('p1');
            expect(ev.type).toBe('player_hit_by_enemy_bullet');
        }
    });
});

// ---------------------------------------------------------------------
// Test — skip gates (inactive player, inactive bullet).
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — skipped pairs', () => {
    test('inactive player → no event', () => {
        const p = makePlayer('p1', 100, 100, { active: false });
        const b = enemyBullet(42, 110, 100);
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('inactive bullet → no event', () => {
        const p = makePlayer('p1', 100, 100);
        const b = enemyBullet(42, 110, 100, { active: false });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(0);
    });

    test('both inactive → no event', () => {
        const p = makePlayer('p1', 100, 100, { active: false });
        const b = enemyBullet(42, 110, 100, { active: false });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------
// Test — damage passthrough. Bullet damage value is reported verbatim
// in the event, with a default of 1 if the bullet has no damage or it's
// falsy. The wrapper applies shield/bulwark/phase-dash on top.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — damage passthrough', () => {
    test('bullet.damage = 7 → event.damage = 7 (verbatim)', () => {
        const p = makePlayer('p1', 100, 100);
        const b = enemyBullet(42, 110, 100, { damage: 7 });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(7);
    });

    test('bullet.damage = 0 → event.damage = 1 (default fallback)', () => {
        // The pure step's geometric-default of 1 ensures the event
        // always carries a positive integer when the wrapper consumes
        // it. (The legacy wrapper has its own default of 15 if .damage
        // is missing, but it applies that at the wrapper boundary — the
        // pure step picks the safer geometric default.)
        const p = makePlayer('p1', 100, 100);
        const b = enemyBullet(42, 110, 100, { damage: 0 });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(1);
    });

    test('bullet.damage = 25 (explosive-style high damage) → event.damage = 25', () => {
        // EnemyBullet sets damage=3 for explosive, but the wrapper may
        // bump it higher per pattern. Verify the pure step passes any
        // positive value through unchanged.
        const p = makePlayer('p1', 100, 100);
        const b = enemyBullet(42, 110, 100, { damage: 25 });
        const events = [];
        detectPlayerEnemyBulletHits([p], [b], ctx, events);
        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(25);
    });
});

// ---------------------------------------------------------------------
// Test — empty / null inputs defensive guards.
// ---------------------------------------------------------------------

describe('detectPlayerEnemyBulletHits — empty inputs', () => {
    test('empty players → no events', () => {
        const events = [];
        detectPlayerEnemyBulletHits([], [enemyBullet(42, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('empty bullets → no events', () => {
        const events = [];
        detectPlayerEnemyBulletHits([makePlayer('p1', 0, 0)], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('both empty → no events', () => {
        const events = [];
        detectPlayerEnemyBulletHits([], [], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null players → no events (defensive)', () => {
        const events = [];
        detectPlayerEnemyBulletHits(null, [enemyBullet(42, 0, 0)], ctx, events);
        expect(events).toHaveLength(0);
    });
    test('null bullets → no events (defensive)', () => {
        const events = [];
        detectPlayerEnemyBulletHits([makePlayer('p1', 0, 0)], null, ctx, events);
        expect(events).toHaveLength(0);
    });
});
