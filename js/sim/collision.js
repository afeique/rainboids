// Pure collision-detection step (server / prediction path).
//
// This module is a NEW parallel implementation of the collision system,
// designed for the multiplayer server and the client-side prediction
// engine. It does NOT replace `js/modules/combat/collision-system.js` —
// the legacy, solo-gameplay path stays untouched. The two run side by
// side:
//
//   - Solo:           `collision-system.js::handleCollisions()` (legacy)
//   - Multiplayer:    `js/sim/collision.js` pure functions          (new)
//   - Prediction:     `js/sim/collision.js` pure functions          (new)
//
// Solo-gameplay stability is paramount. Refactoring collision is high
// risk; instead, the new code is written from scratch as a set of pure
// pair-detection functions that the wrapper drains via an event queue.
// The legacy module remains the single source of truth for solo play
// until the prediction wiring (Phase 3) is ready to switch over.
//
// ─── Scope of THIS file (Phase 2.5, dispatch 1) ──────────────────────
//
// What's ported here:
//   - Bullet-vs-asteroid pair detection (`detectBulletAsteroidHits`)
//
// What's deferred to follow-up sessions (Phase 2.5, dispatch 2..N):
//   - Player-vs-asteroid (needs ship velocity + bounce/restitution)
//   - Player-vs-enemy   (ramming damage, bounce, knockback)
//   - Enemy-vs-asteroid (push forces both ways)
//   - Bullet-vs-enemy   (mirror of bullet-vs-asteroid, plus boss-rage)
//   - Drops pickup (player-vs-drop, magnet/tractor pulls happen earlier)
//   - Power-weapon collisions (mines, missiles, lightning arcs, charged
//     shots, energy slashes)
//   - Defense-skill collisions (deflector orbs absorb enemy bullets,
//     EMP pulse stuns enemies, tractor shield repels)
//
// What does NOT live in this module at all:
//   - Damage NUMBER spawning / hit-flash visuals (presentation)
//   - Audio events / particle FX (presentation)
//   - Screen shake / hitstop (presentation)
//   - Spatial-grid construction (a wrapper concern; the pure step takes
//     pre-filtered candidates if the wrapper wants to use a grid)
//   - XP / score / kill-streak side effects (game-state concerns; the
//     wrapper drains events and applies them)
//
// The pure step **emits events**; the wrapper drains them to apply
// damage, despawn bullets, spawn debris/orbs, and run the legacy FX
// helpers. This mirrors the pattern used by `js/sim/wave.js` (Phase 1,
// agent F) and `js/sim/asteroid.js` (Phase 1, agent C).

// ─── Constants ──────────────────────────────────────────────────────
//
// Extracted verbatim from `COLLISION_CONFIG` in
// `js/modules/combat/collision-system.js` so the pure step is
// self-contained — no hidden constants leaking from the legacy module.
// Only the constants this pair (bullet-asteroid) consumes live here;
// the next dispatches will append the constants for their pairs.

/**
 * Bullet → asteroid knockback impulse multiplier. Mirrors
 * `COLLISION_CONFIG.BULLET_KNOCKBACK = 0.05`. Applied to the bullet's
 * velocity when imparting momentum to the asteroid:
 *   `asteroid.vx += bullet.vx * BULLET_ASTEROID_KNOCKBACK`
 * (the wrapper performs this mutation, this module just reports the
 * pre-knockback bullet velocity in the event).
 */
export const BULLET_ASTEROID_KNOCKBACK = 0.05;

/**
 * Frames the asteroid's hit-flash effect runs for after a bullet
 * impact. Mirrors `COLLISION_CONFIG.HIT_FLASH_FRAMES = 10`. Presentation
 * concern in the strict sense, but the wrapper sets it from the event
 * so we expose it here for convenience.
 */
export const BULLET_ASTEROID_HIT_FLASH_FRAMES = 10;

// ─── Bullet-vs-asteroid pair detection ──────────────────────────────

/**
 * Detect bullet-vs-asteroid collisions for one tick.
 *
 * Pure step: reads bullet + asteroid positions/radii, decides which
 * pairs collided, and emits one `bullet_hit_asteroid` event per
 * detected hit. This function does NOT mutate asteroid state (no
 * damage, no death-flash); the wrapper drains events into the legacy
 * damage / despawn / FX helpers.
 *
 * Mutation note — `bullet.piercedAsteroidIds`:
 *   The pure step DOES mutate one field on the bullet: a
 *   `piercedAsteroidIds: Set<AsteroidId|number>` carrying the ids of
 *   asteroids this bullet has already pierced. This is allowed because
 *   the Set is intrinsic to that single bullet's state — it's the
 *   bullet's "memory" of which targets it has already passed through,
 *   conceptually equivalent to the legacy `bullet.hitTargets` Set on
 *   the live `Bullet` class.
 *
 *   Lifetime of the Set:
 *     - Lazily created on first hit (we don't pre-allocate per-bullet)
 *     - Carried across ticks for as long as the bullet lives
 *     - The wrapper is responsible for destroying / pooling the bullet
 *       which clears the Set with it
 *
 *   Why not a separate `Map<bullet_id, Set<asteroid_id>>` in ctx?
 *     - Putting it on the bullet keeps the bullet's collision history
 *       co-located with the bullet itself (matching legacy semantics)
 *     - Avoids the wrapper having to manage a separate map keyed by
 *       bullet id (and the map cleanup when bullets despawn)
 *     - Server / prediction path can serialize `piercedAsteroidIds`
 *       as part of the bullet's state if needed for rollback
 *
 * Iteration order:
 *   For each bullet, scan asteroids in array order. The first hit a
 *   non-piercing bullet detects becomes its only event for the tick;
 *   the bullet then has `piercedAsteroidIds` containing that asteroid's
 *   id and any future call (this tick or next) will skip it. A bullet
 *   with `piercing > 0` may emit up to `piercing + 1` hit events per
 *   tick (matching `bullet.onHit` legacy semantics where piercing=1
 *   means it can hit 2 targets — the original target plus 1 more).
 *
 * Geometry:
 *   Circle-circle overlap: `hypot(dx, dy) < bullet.radius + ast.radius`.
 *   Mirrors the live `collision()` helper in `js/modules/core/utils.js`.
 *
 * Skipped pairs (no event emitted):
 *   - Inactive bullet         (`!bullet.active`)
 *   - Inactive asteroid       (`!asteroid.active`)
 *   - Warping asteroid        (asteroid is mid warp-in animation)
 *   - Asteroid mid-death      (`asteroid.deathFlash > 0` or legacy
 *                              `asteroid._deathFlash > 0`)
 *   - Asteroid already pierced by this bullet (id in
 *     `bullet.piercedAsteroidIds`)
 *   - Bullet's piercing budget exhausted
 *     (`bullet.piercedEnemies > bullet.piercing`)
 *
 * @param {Array<Object>} bullets       - active player bullets. Each
 *                                        bullet is treated as having
 *                                        `{x, y, vx, vy, radius, damage,
 *                                        piercing, piercedEnemies,
 *                                        piercedAsteroidIds?, active,
 *                                        id}`. Compatible with both
 *                                        the BulletState typedef in
 *                                        `js/sim/state.js` and the
 *                                        live `Bullet` instance shape.
 * @param {Array<Object>} asteroids     - active asteroids. Each is
 *                                        treated as having `{x, y,
 *                                        radius, active, warping, hp
 *                                        OR health, deathFlash OR
 *                                        _deathFlash, id}`.
 * @param {Object} ctx                  - per-tick context bag
 *                                        (currently unused; reserved
 *                                        for future extensions like
 *                                        a one-punch-man cheat flag,
 *                                        or a spatial-grid filter).
 * @param {Array<Object>} events        - out-buffer. Pushes objects:
 *                                        `{ type, bulletId, asteroidId,
 *                                          damage, bulletX, bulletY,
 *                                          bulletVx, bulletVy,
 *                                          bulletPiercingRemaining,
 *                                          bulletWillDespawn }`
 *                                        See "Event shape" below.
 *
 * Event shape (one event per detected hit):
 *   {
 *     type: 'bullet_hit_asteroid',
 *     bulletId:                bullet.id,
 *     asteroidId:              asteroid.id,
 *     damage:                  bullet.damage (defaults to 1),
 *     bulletX, bulletY:        impact point (used for hit-flash
 *                              localization + shrapnel particles)
 *     bulletVx, bulletVy:      bullet velocity, used by the wrapper to
 *                              apply knockback to the asteroid via
 *                              BULLET_ASTEROID_KNOCKBACK
 *     bulletPiercingRemaining: how many more piercing hits the bullet
 *                              has after this one. -1 means non-
 *                              piercing (bullet despawns now).
 *     bulletWillDespawn:       true iff the bullet should be removed
 *                              after this hit (non-piercing OR piercing
 *                              budget reached).
 *   }
 */
export function detectBulletAsteroidHits(bullets, asteroids, ctx, events) {
    if (!bullets || !asteroids) return;
    if (bullets.length === 0 || asteroids.length === 0) return;

    for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!bullet || !bullet.active) continue;

        // Piercing budget already exhausted? Skip — the wrapper hasn't
        // despawned this bullet yet but it has no more hits in it. This
        // mirrors the legacy `bullet.onHit()` behavior where a piercing
        // bullet starts dying once `piercedEnemies > piercing`.
        const piercing = bullet.piercing | 0;
        // Live-tracked counter — starts at the bullet's running total,
        // bumps once per detected hit during this scan. Persisted back
        // onto the bullet at the end so subsequent ticks see the
        // accumulated count.
        let piercedSoFar = bullet.piercedEnemies | 0;
        if (piercing > 0 && piercedSoFar > piercing) continue;
        // Non-piercing bullet that's somehow still active despite already
        // hitting something this scan: skip. (Defensive — the wrapper
        // should have flipped active=false, but we guard anyway.)
        if (piercing === 0 && piercedSoFar > 0) continue;

        const bulletRadius = bullet.radius || 0;

        for (let j = 0; j < asteroids.length; j++) {
            const asteroid = asteroids[j];
            if (!asteroid || !asteroid.active) continue;
            if (asteroid.warping) continue;

            // Death flash gate — accept either the new sim field name
            // (`deathFlash`) or the legacy underscore-prefix
            // (`_deathFlash`). Same semantic: "rock is mid-explosion,
            // don't re-hit it".
            const dF = asteroid.deathFlash !== undefined
                ? asteroid.deathFlash
                : asteroid._deathFlash;
            if (dF && dF > 0) continue;

            // Has this bullet already pierced this asteroid (this or
            // a prior tick)? The Set lives on the bullet — see
            // mutation note in the JSDoc above.
            const pierced = bullet.piercedAsteroidIds;
            if (pierced && pierced.has(asteroid.id)) continue;

            // Geometry check — circle-circle overlap. Mirrors
            // `collision(a, b)` in `js/modules/core/utils.js`.
            const dx = bullet.x - asteroid.x;
            const dy = bullet.y - asteroid.y;
            const sumR = bulletRadius + (asteroid.radius || 0);
            // Squared distance avoids the sqrt; equivalent test.
            if (dx * dx + dy * dy >= sumR * sumR) continue;

            // ── Hit detected ──

            // Update the bullet's piercing-tracker Set. Lazy create.
            // This is the one bullet-state mutation this pure step
            // performs; see JSDoc note.
            if (!bullet.piercedAsteroidIds) {
                bullet.piercedAsteroidIds = new Set();
            }
            bullet.piercedAsteroidIds.add(asteroid.id);

            // Bookkeeping: bump the live pierce counter and persist it
            // onto the bullet so the outer "budget exhausted?" check
            // sees the latest value next tick. Matches the legacy
            // `onHit` increment (the wrapper still calls
            // `bullet.onHit(ast)` on the live Bullet to drive the
            // hitTargets Set + startDying — this counter is the
            // sim-side mirror so the pure step can decide despawn
            // without consulting the wrapper).
            piercedSoFar += 1;
            bullet.piercedEnemies = piercedSoFar;

            // Despawn decision — matches legacy `onHit`:
            //   - Non-piercing: dies on first hit
            //   - Piercing > 0: dies once piercedEnemies > piercing
            //     (i.e. it's already hit `piercing + 1` targets)
            const willDespawn = piercing === 0
                ? true
                : (piercedSoFar > piercing);
            const piercingRemaining = piercing === 0
                ? -1
                : Math.max(0, piercing - piercedSoFar);

            events.push({
                type: 'bullet_hit_asteroid',
                bulletId: bullet.id,
                asteroidId: asteroid.id,
                damage: (bullet.damage || 1),
                bulletX: bullet.x,
                bulletY: bullet.y,
                bulletVx: bullet.vx,
                bulletVy: bullet.vy,
                bulletPiercingRemaining: piercingRemaining,
                bulletWillDespawn: willDespawn,
            });

            // If the bullet despawned, stop scanning asteroids for it.
            if (willDespawn) break;
        }
    }
}
