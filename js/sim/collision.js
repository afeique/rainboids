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

// ─── Constants — Player-vs-asteroid pair ─────────────────────────────
//
// Extracted verbatim from `COLLISION_CONFIG` in
// `js/modules/combat/collision-system.js`. Each constant is pinned
// here so the pure step stays self-contained (no legacy-module imports
// leaking into the server / prediction path).
//
// Numerical parity with the legacy module is enforced by tests.

/**
 * Damage dealt to asteroid when player collides with it. Mirrors
 * `COLLISION_CONFIG.PLAYER_ASTEROID_COLLISION_DAMAGE = 2`. Tiny by
 * design: ramming asteroids is intentionally a *bad* strategy — the
 * player gets deflected hard (see `ASTEROID_KNOCKBACK_MULTIPLIER`) and
 * barely chips the rock. Asteroids carry 10-18 HP at full size, so
 * destruction via ramming takes many hits, each costing the player
 * health.
 */
export const PLAYER_ASTEROID_COLLISION_DAMAGE = 2;

/**
 * Bounce energy retention coefficient (0..1). Mirrors
 * `COLLISION_CONFIG.BOUNCE_RESTITUTION = 0.9`. 1.0 = perfectly elastic
 * (no energy loss), 0.0 = perfectly inelastic (stick). The 0.9 value
 * here is the high-energy floor used for bounce reflections in the
 * legacy player-asteroid path.
 *
 * Note: the legacy `handlePlayerAsteroidCollision` function does NOT
 * use BOUNCE_RESTITUTION directly — restitution is consumed by the
 * generic bounce path (`bounceObjects`, line 1774 of
 * collision-system.js). The player-asteroid path uses the higher-level
 * `ASTEROID_KNOCKBACK_MULTIPLIER` for the explosive deflection.
 * BOUNCE_RESTITUTION is exposed here for use by future pairs
 * (player-vs-enemy, enemy-vs-asteroid) and for parity with the legacy
 * config block.
 */
export const BOUNCE_RESTITUTION = 0.9;

/**
 * Multiplier for bounce impulse force used by the generic bounce-pair
 * path. Mirrors `COLLISION_CONFIG.BOUNCE_FORCE_MULTIPLIER = 12.0`. Like
 * `BOUNCE_RESTITUTION` this isn't consumed directly by the
 * player-asteroid pair (which uses the heavier
 * `ASTEROID_KNOCKBACK_MULTIPLIER` path); exposed here for symmetry with
 * the legacy config and for the upcoming enemy / asteroid-asteroid
 * pairs.
 */
export const BOUNCE_FORCE_MULTIPLIER = 12.0;

/**
 * Fraction of computed overlap used by the generic bounce-pair
 * separation push. Mirrors `COLLISION_CONFIG.OVERLAP_SEPARATION_RATIO
 * = 0.6`. Same scoping note: the player-asteroid pair uses the FULL
 * overlap plus `SEPARATION_BUFFER`, not this ratio — but the constant
 * lives here so the wrapper / Rust mirror has the full collision
 * config available without dipping back into the legacy module.
 */
export const OVERLAP_SEPARATION_RATIO = 0.6;

/**
 * Knockback multiplier for player-asteroid collisions. Mirrors
 * `COLLISION_CONFIG.ASTEROID_KNOCKBACK_MULTIPLIER = 22.0`. Applied to
 * the normal-projected relative velocity (`dvn / totalMass`) to derive
 * the impulse magnitude that flings the player off the rock.
 *
 *   player.vel += knockbackAngle * (dvn / (player.mass + asteroid.mass)) * 22.0
 *
 * Bumped from earlier values because asteroid ramming was viable in
 * older builds. The 22.0 value kills the exploit by shoving the player
 * away too hard to keep grinding the rock.
 */
export const ASTEROID_KNOCKBACK_MULTIPLIER = 22.0;

/**
 * Extra pixels added to the separation distance after computing the
 * overlap. Mirrors `COLLISION_CONFIG.SEPARATION_BUFFER = 6`. Ensures
 * the player is moved *past* the surface boundary so the very next
 * tick doesn't re-overlap and re-trigger the collision event.
 */
export const SEPARATION_BUFFER = 6;

/**
 * Additional velocity push applied to the player along the
 * (asteroid → player) normal when an overlap was resolved. Mirrors
 * `COLLISION_CONFIG.OVERLAP_PUSH_FORCE = 5.0`. Stacks on top of the
 * knockback impulse — the knockback handles the "bounce off" reaction,
 * while this provides a steady outward push to prevent slow-creep
 * re-overlaps.
 */
export const OVERLAP_PUSH_FORCE = 5.0;

// ─── Player-vs-asteroid pair detection ──────────────────────────────

/**
 * Internal helper: read a "mass" off an entity, falling back to a
 * radius-derived approximation when the field isn't set.
 *
 *   - Live `Player` uses   `mass = π · r² · 0.5`
 *   - Live `Asteroid` uses `mass = (4/3) · π · r³`
 *
 * The new f32 `ShipState` / `AsteroidState` don't carry a `mass` field,
 * so for round-trip parity we fall back to the same formulas the live
 * classes use. The wrapper can override by setting `mass` explicitly on
 * the state object (matches legacy live-instance behavior).
 *
 * @param {Object} entity   live or pure-state shape
 * @param {'player'|'asteroid'} kind
 * @returns {number}
 */
function entityMass(entity, kind) {
    if (entity.mass !== undefined && entity.mass !== null) return entity.mass;
    const r = entity.radius || 0;
    if (kind === 'asteroid') return (4 / 3) * Math.PI * r * r * r;
    // player default
    return Math.PI * r * r * 0.5;
}

/**
 * Internal helper: read velocity off an entity. Live `Player` /
 * `Asteroid` instances store `vel.x` / `vel.y`; pure-state `ShipState`
 * / `AsteroidState` use top-level `vx` / `vy`. Accept either.
 *
 * @param {Object} entity
 * @returns {{ x: number, y: number }}
 */
function entityVel(entity) {
    if (entity.vel) return { x: entity.vel.x || 0, y: entity.vel.y || 0 };
    return { x: entity.vx || 0, y: entity.vy || 0 };
}

/**
 * Internal helper: read an entity's id, preferring `.id` then falling
 * back to `.player` (ShipState uses `player` as its identifier slot).
 */
function entityId(entity) {
    if (entity.id !== undefined) return entity.id;
    if (entity.player !== undefined) return entity.player;
    return null;
}

/**
 * Detect player-vs-asteroid collisions for one tick.
 *
 * Pure step: reads player + asteroid positions / radii / velocities,
 * decides which pairs overlap, and emits one `player_hit_asteroid`
 * event per detected hit with the velocity + position *deltas* the
 * wrapper applies to the live state. This function does NOT mutate
 * player or asteroid — every effect is reported in the event payload
 * for the wrapper / Rust mirror to apply downstream.
 *
 * Co-op ready: takes an array of players. The solo wrapper passes
 * `[player]`; future co-op sessions will pass the full ship roster.
 * Each player is scanned against every active asteroid; one player
 * can emit multiple events per tick if it overlaps multiple rocks
 * simultaneously (e.g. trapped between two boulders).
 *
 * Geometry:
 *   Circle-circle overlap: `hypot(dx, dy) < player.radius + ast.radius`.
 *   Identical to the legacy `collision()` helper.
 *
 * Bounce / impulse model (mirrors lines 2052-2073 of
 * `collision-system.js::handlePlayerAsteroidCollision`):
 *
 *   knockbackAngle = atan2(player.y - asteroid.y, player.x - asteroid.x)
 *   totalMass      = player.mass + asteroid.mass
 *   dvn            = (player.vx - asteroid.vx) · cos(angle)
 *                  + (player.vy - asteroid.vy) · sin(angle)
 *   enhancedImpulse = 2 · dvn / totalMass
 *   knockback      = enhancedImpulse · ASTEROID_KNOCKBACK_MULTIPLIER
 *
 *   player.vel  += (cos(angle + jitter), sin(angle + jitter)) · knockback
 *   asteroid.vel -= (cos(angle), sin(angle)) · knockback · 0.3 · player.mass
 *
 * Determinism / jitter:
 *   The legacy path uses `random(-π/4, π/4)` for a jitter angle. The
 *   pure step is deterministic: if `ctx.rngFloat` is provided it
 *   consumes one [0,1) sample and remaps it to `[-π/4, π/4]`; otherwise
 *   jitter defaults to 0 so server/prediction stay reproducible.
 *
 * Separation push (mirrors lines 2076-2096):
 *   If `overlap = (player.r + asteroid.r) - distance > 0`:
 *     - Position delta (player only): unit normal · (overlap +
 *       SEPARATION_BUFFER) — moves the ship clear of the surface.
 *     - Velocity push (player only): unit normal · OVERLAP_PUSH_FORCE
 *       added on top of the bounce impulse to keep the ship drifting
 *       outward instead of slow-creeping back through.
 *
 * Asteroid damage:
 *   Constant `PLAYER_ASTEROID_COLLISION_DAMAGE = 2`. The wrapper
 *   subtracts this from `asteroid.hp` (or legacy `asteroid.health`)
 *   and handles death-flash + drops. The pure step just reports the
 *   number.
 *
 * Skipped pairs (no event emitted):
 *   - Inactive player     (`!player.active`)
 *   - Inactive asteroid   (`!asteroid.active`)
 *   - Warping asteroid    (mid warp-in animation)
 *   - Asteroid mid-death  (`asteroid.deathFlash > 0` or legacy
 *                          `asteroid._deathFlash > 0`)
 *
 * @param {Array<Object>} players       active player ships. Each is
 *                                      treated as having `{x, y, vx OR
 *                                      vel.x, vy OR vel.y, radius,
 *                                      mass?, active, id OR player}`.
 *                                      Compatible with both the
 *                                      `ShipState` typedef in
 *                                      `js/sim/state.js` and the live
 *                                      `Player` instance shape.
 * @param {Array<Object>} asteroids     active asteroids. Each is
 *                                      treated as having `{x, y, vx OR
 *                                      vel.x, vy OR vel.y, radius,
 *                                      mass?, active, warping,
 *                                      deathFlash OR _deathFlash, id}`.
 * @param {Object} ctx                  per-tick context bag. Optional
 *                                      field: `rngFloat()` returning
 *                                      [0,1) for deterministic jitter.
 *                                      No `rngFloat` ⇒ jitter = 0.
 * @param {Array<Object>} events        out-buffer. Pushes objects with
 *                                      the shape documented below.
 *
 * Event shape (one per detected hit):
 *   {
 *     type: 'player_hit_asteroid',
 *     playerId:               id of the colliding ship
 *     asteroidId:             id of the colliding asteroid
 *     damageToAsteroid:       constant 2 (see PLAYER_ASTEROID_COLLISION_DAMAGE)
 *     playerImpulseDx,
 *     playerImpulseDy:        velocity delta the wrapper adds to
 *                             `player.vel` (legacy) or `player.vx/vy`
 *                             (pure-state). Includes the knockback +
 *                             overlap-push contributions.
 *     asteroidImpulseDx,
 *     asteroidImpulseDy:      velocity delta the wrapper adds to the
 *                             asteroid's velocity (much smaller — 0.3 ·
 *                             player.mass · knockback along the
 *                             un-jittered normal).
 *     separationDx,
 *     separationDy:           position delta the wrapper adds to
 *                             `player.x` / `player.y` to move the ship
 *                             clear of the rock. Zero if no overlap
 *                             was measured (defensive — the geometry
 *                             check already requires overlap, but the
 *                             distance-from-center math could degenerate
 *                             on a perfect-center coincidence).
 *   }
 */
export function detectPlayerAsteroidHits(players, asteroids, ctx, events) {
    if (!players || !asteroids) return;
    if (players.length === 0 || asteroids.length === 0) return;

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        if (!player || !player.active) continue;

        const playerRadius = player.radius || 0;
        const playerVel = entityVel(player);
        const playerMass = entityMass(player, 'player');
        const pId = entityId(player);

        for (let j = 0; j < asteroids.length; j++) {
            const asteroid = asteroids[j];
            if (!asteroid || !asteroid.active) continue;
            if (asteroid.warping) continue;

            // Death-flash gate — same dual-name accept as bullet path.
            const dF = asteroid.deathFlash !== undefined
                ? asteroid.deathFlash
                : asteroid._deathFlash;
            if (dF && dF > 0) continue;

            // Circle-circle overlap check.
            const dx = player.x - asteroid.x;
            const dy = player.y - asteroid.y;
            const sumR = playerRadius + (asteroid.radius || 0);
            const distSq = dx * dx + dy * dy;
            if (distSq >= sumR * sumR) continue;

            // ── Hit detected — compute impulse + separation ──

            const asteroidVel = entityVel(asteroid);
            const asteroidMass = entityMass(asteroid, 'asteroid');

            // Knockback angle: from asteroid → player. Defensive: if
            // the centers exactly coincide (distSq === 0) use a
            // fallback angle of 0 to avoid NaN from atan2(0,0)=0 and
            // skip the separation-direction divide-by-zero.
            const distance = Math.sqrt(distSq);
            const knockbackAngle = distance > 0
                ? Math.atan2(dy, dx)
                : 0;

            const totalMass = playerMass + asteroidMass;
            const cosA = Math.cos(knockbackAngle);
            const sinA = Math.sin(knockbackAngle);
            const dvn = (playerVel.x - asteroidVel.x) * cosA
                      + (playerVel.y - asteroidVel.y) * sinA;
            const enhancedImpulse = totalMass > 0 ? (2 * dvn) / totalMass : 0;
            const knockback = enhancedImpulse * ASTEROID_KNOCKBACK_MULTIPLIER;

            // Deterministic jitter: ctx.rngFloat ∈ [0,1) → [-π/4, π/4].
            const jitterFraction = (ctx && typeof ctx.rngFloat === 'function')
                ? ctx.rngFloat()
                : 0.5; // 0.5 ⇒ centered ⇒ jitter = 0
            const jitter = (jitterFraction - 0.5) * (Math.PI / 2);

            let playerImpulseDx = Math.cos(knockbackAngle + jitter) * knockback;
            let playerImpulseDy = Math.sin(knockbackAngle + jitter) * knockback;

            const asteroidImpulseDx = -knockback * 0.3 * playerMass * cosA;
            const asteroidImpulseDy = -knockback * 0.3 * playerMass * sinA;

            // Separation push (player-only position + velocity nudge).
            let separationDx = 0;
            let separationDy = 0;
            const overlap = sumR - distance;
            if (overlap > 0 && distance > 0) {
                const nx = dx / distance;
                const ny = dy / distance;
                const totalSeparation = overlap + SEPARATION_BUFFER;
                separationDx = nx * totalSeparation;
                separationDy = ny * totalSeparation;
                playerImpulseDx += nx * OVERLAP_PUSH_FORCE;
                playerImpulseDy += ny * OVERLAP_PUSH_FORCE;
            }

            events.push({
                type: 'player_hit_asteroid',
                playerId: pId,
                asteroidId: asteroid.id,
                damageToAsteroid: PLAYER_ASTEROID_COLLISION_DAMAGE,
                playerImpulseDx,
                playerImpulseDy,
                asteroidImpulseDx,
                asteroidImpulseDy,
                separationDx,
                separationDy,
            });
        }
    }
}

// =====================================================================
// BULLET ↔ ENEMY — Phase 2.5 dispatch 3
// =====================================================================
//
// Near-mirror of `detectBulletAsteroidHits` above. Same circle-circle
// geometry, same piercing-budget mechanics, same event-emission pattern.
// The only structural differences are the target array (enemies instead
// of asteroids), the event type (`bullet_hit_enemy`), the per-bullet
// pierced-id Set name (`piercedEnemyIds` instead of `piercedAsteroidIds`),
// and the additional `enemy.warping` skip-gate (asteroids also have a
// `warping` flag but enemies use it for mid-warp-in invulnerability while
// the spawn animation finishes; either way we skip).
//
// Source-of-truth lines in `js/modules/combat/collision-system.js`:
//   - Outer bullet/enemy loop:               lines 511-518
//   - Piercing skip via `hasHitEnemy`:       lines 520-523
//   - Geometry check + damage application:   lines 525-548
//   - `bullet.onHit(enemy)` despawn logic:   line 651 → bullet.js:404-418
//
// What this module does NOT touch (stays in the wrapper):
//   - Damage application to enemy HP             (legacy: enemy.takeDamage)
//   - Enemy death-flash trigger                  (legacy: enemy._deathFlash = 8)
//   - Drops / coins / experience / kill streak   (legacy: dropOrbsFromEntity et al.)
//   - Boss-rage enrage trigger                   (legacy: boss reactive logic)
//   - Hit-flash visuals, hit-stop, screen shake  (presentation)
//   - Audio events                               (presentation)
//   - Combo / mission hooks                      (game-state)
//
// The pure step's only job is: "for each (bullet, enemy) pair this tick,
// does the bullet's circle overlap the enemy's circle? if so, emit the
// hit with enough info for the wrapper to drive its side effects".

/**
 * Bullet → enemy knockback impulse multiplier. Mirrors
 * `COLLISION_CONFIG.BULLET_KNOCKBACK = 0.05` from
 * `js/modules/combat/collision-system.js` — the same constant the
 * bullet-asteroid path uses (the legacy module has a single
 * `BULLET_KNOCKBACK` constant shared across both pair-types).
 *
 * Exposed as a separate name here for two reasons:
 *   - Symmetry with `BULLET_ASTEROID_KNOCKBACK` so future tuning can
 *     diverge per-pair without renaming.
 *   - Self-documenting at the call-site: `BULLET_ENEMY_KNOCKBACK`
 *     reads more clearly than referring to the asteroid constant
 *     when applying knockback to a Hunter or Titan.
 *
 * Numerical parity with the legacy module is enforced by tests.
 */
export const BULLET_ENEMY_KNOCKBACK = 0.05;

/**
 * Frames the enemy's hit-flash effect runs for after a bullet impact.
 * Mirrors `COLLISION_CONFIG.HIT_FLASH_FRAMES = 10` from
 * `js/modules/combat/collision-system.js` (same constant the
 * bullet-asteroid path uses; see line 555:
 * `enemy._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES`).
 *
 * Presentation concern in the strict sense, but exposed here so the
 * wrapper can set the timer directly from the event without consulting
 * the legacy config block.
 */
export const BULLET_ENEMY_HIT_FLASH_FRAMES = 10;

// ─── Bullet-vs-enemy pair detection ─────────────────────────────────

/**
 * Detect bullet-vs-enemy collisions for one tick.
 *
 * Pure step: reads bullet + enemy positions/radii, decides which pairs
 * collided, and emits one `bullet_hit_enemy` event per detected hit.
 * Does NOT mutate enemy state (no damage, no death-flash, no rage
 * trigger) — every effect is reported through the event payload for the
 * wrapper / Rust mirror to apply downstream.
 *
 * Mutation note — `bullet.piercedEnemyIds`:
 *   The pure step DOES mutate one field on the bullet: a
 *   `piercedEnemyIds: Set<EnemyId|number>` carrying the ids of enemies
 *   this bullet has already pierced. This is allowed because the Set is
 *   intrinsic to that single bullet's state — it's the bullet's "memory"
 *   of which enemies it has already passed through.
 *
 *   The Set is DISTINCT from `piercedAsteroidIds`: a piercing bullet can
 *   pass through one asteroid AND one enemy in the same frame, and each
 *   Set tracks its own target type independently. Note however that the
 *   piercing BUDGET (`bullet.piercedEnemies` counter) is SHARED across
 *   both Sets — this matches the legacy `bullet.onHit()` behavior in
 *   `js/modules/player/bullet.js:404-418`, where the single
 *   `piercedEnemies` counter increments on any pierce regardless of
 *   whether it was an asteroid or an enemy. So a piercing=1 bullet that
 *   pierces 1 asteroid this tick has 0 enemy pierces left in this tick,
 *   and vice versa.
 *
 *   Lifetime of the Set:
 *     - Lazily created on first hit (no pre-allocation per bullet).
 *     - Carried across ticks for as long as the bullet lives.
 *     - The wrapper is responsible for destroying / pooling the bullet,
 *       which clears the Set with it.
 *
 * Iteration order:
 *   For each bullet, scan enemies in array order. The first hit a
 *   non-piercing bullet detects becomes its only event for the tick;
 *   any future call (this tick or next) will skip that enemy via the
 *   pierced-id Set. A bullet with `piercing > 0` may emit up to
 *   `piercing + 1` hit events per tick (matching `bullet.onHit` legacy
 *   semantics where piercing=1 means it can hit 2 targets — the original
 *   plus 1 more).
 *
 * Geometry:
 *   Circle-circle overlap: `hypot(dx, dy) < bullet.radius + enemy.radius`.
 *   Identical to the legacy `collision(bullet, enemy)` helper.
 *
 * Skipped pairs (no event emitted):
 *   - Inactive bullet                  (`!bullet.active`)
 *   - Inactive enemy                   (`!enemy.active`)
 *   - Enemy mid-warp-in                (`enemy.warping`)
 *   - Enemy mid-death                  (`enemy._deathFlash > 0` or
 *                                       new-style `enemy.deathFlash > 0`)
 *   - Enemy already pierced by this bullet (id in
 *     `bullet.piercedEnemyIds`)
 *   - Bullet's piercing budget exhausted
 *     (`bullet.piercedEnemies > bullet.piercing`)
 *
 * @param {Array<Object>} bullets       active player bullets. Each is
 *                                      treated as having `{x, y, vx, vy,
 *                                      radius, damage, piercing,
 *                                      piercedEnemies, piercedEnemyIds?,
 *                                      piercedAsteroidIds?, active, id}`.
 *                                      Compatible with both the
 *                                      BulletState typedef in
 *                                      `js/sim/state.js` and the live
 *                                      `Bullet` instance shape.
 * @param {Array<Object>} enemies       active enemies. Each is treated
 *                                      as having `{x, y, radius, active,
 *                                      warping, deathFlash OR
 *                                      _deathFlash, id}`. Compatible
 *                                      with both `EnemyState` and the
 *                                      live `Enemy` instance shape.
 * @param {Object} ctx                  per-tick context bag (currently
 *                                      unused; reserved for future use,
 *                                      e.g. a one-punch-man cheat flag
 *                                      or spatial-grid filter).
 * @param {Array<Object>} events        out-buffer. Pushes objects with
 *                                      the shape documented below.
 *
 * Event shape (one event per detected hit):
 *   {
 *     type: 'bullet_hit_enemy',
 *     bulletId:                bullet.id,
 *     enemyId:                 enemy.id,
 *     damage:                  bullet.damage (defaults to 1),
 *     bulletX, bulletY:        impact point (used for hit-flash
 *                              localization + shrapnel particles)
 *     bulletVx, bulletVy:      bullet velocity, used by the wrapper to
 *                              apply knockback via BULLET_ENEMY_KNOCKBACK
 *                              and to compute the impact angle for
 *                              localized sparks.
 *     bulletPiercingRemaining: how many more piercing hits the bullet
 *                              has after this one. -1 means non-piercing
 *                              (bullet despawns now).
 *     bulletWillDespawn:       true iff the bullet should be removed
 *                              after this hit (non-piercing OR piercing
 *                              budget reached).
 *   }
 */
export function detectBulletEnemyHits(bullets, enemies, ctx, events) {
    if (!bullets || !enemies) return;
    if (bullets.length === 0 || enemies.length === 0) return;

    for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!bullet || !bullet.active) continue;

        // Piercing budget already exhausted? Skip — mirrors the
        // bullet-asteroid path. The wrapper hasn't despawned this bullet
        // yet but it has no more hits in it.
        const piercing = bullet.piercing | 0;
        // Live-tracked counter — starts at the bullet's running total,
        // bumps once per detected hit during this scan. Persisted back
        // onto the bullet so subsequent ticks (and the bullet-asteroid
        // pair, which shares the same counter) see the latest value.
        let piercedSoFar = bullet.piercedEnemies | 0;
        if (piercing > 0 && piercedSoFar > piercing) continue;
        // Non-piercing bullet that's somehow still active despite already
        // hitting something this scan: skip. Defensive guard — the
        // wrapper should have flipped active=false, but the bullet-
        // asteroid pair may have just consumed this bullet's single hit
        // earlier in the same tick, so we need to honor the counter
        // even if the wrapper hasn't run yet.
        if (piercing === 0 && piercedSoFar > 0) continue;

        const bulletRadius = bullet.radius || 0;

        for (let j = 0; j < enemies.length; j++) {
            const enemy = enemies[j];
            if (!enemy || !enemy.active) continue;
            if (enemy.warping) continue;

            // Death flash gate — accept either the new sim field name
            // (`deathFlash`) or the legacy underscore-prefix
            // (`_deathFlash`). Live `Enemy` instances use the legacy
            // name (see collision-system.js line 518); future
            // `EnemyState` will use the new name.
            const dF = enemy.deathFlash !== undefined
                ? enemy.deathFlash
                : enemy._deathFlash;
            if (dF && dF > 0) continue;

            // Has this bullet already pierced this enemy (this or a
            // prior tick)? The Set lives on the bullet — see mutation
            // note in the JSDoc above. Distinct from
            // `piercedAsteroidIds`: a bullet that pierced asteroid X
            // earlier can still hit enemy X (different id space).
            const pierced = bullet.piercedEnemyIds;
            if (pierced && pierced.has(enemy.id)) continue;

            // Geometry check — circle-circle overlap. Mirrors
            // `collision(bullet, enemy)` in `js/modules/core/utils.js`.
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const sumR = bulletRadius + (enemy.radius || 0);
            // Squared distance avoids the sqrt; equivalent test.
            if (dx * dx + dy * dy >= sumR * sumR) continue;

            // ── Hit detected ──

            // Update the bullet's enemy-pierce Set. Lazy create. This is
            // the one bullet-state mutation this pure step performs.
            if (!bullet.piercedEnemyIds) {
                bullet.piercedEnemyIds = new Set();
            }
            bullet.piercedEnemyIds.add(enemy.id);

            // Bookkeeping: bump the live (shared) pierce counter and
            // persist it onto the bullet so the outer "budget exhausted?"
            // check sees the latest value next tick, and so the
            // bullet-asteroid pair (if it runs after this one) sees the
            // updated total too.
            piercedSoFar += 1;
            bullet.piercedEnemies = piercedSoFar;

            // Despawn decision — matches legacy `onHit`:
            //   - Non-piercing: dies on first hit.
            //   - Piercing > 0: dies once piercedEnemies > piercing.
            const willDespawn = piercing === 0
                ? true
                : (piercedSoFar > piercing);
            const piercingRemaining = piercing === 0
                ? -1
                : Math.max(0, piercing - piercedSoFar);

            events.push({
                type: 'bullet_hit_enemy',
                bulletId: bullet.id,
                enemyId: enemy.id,
                damage: (bullet.damage || 1),
                bulletX: bullet.x,
                bulletY: bullet.y,
                bulletVx: bullet.vx,
                bulletVy: bullet.vy,
                bulletPiercingRemaining: piercingRemaining,
                bulletWillDespawn: willDespawn,
            });

            // If the bullet despawned, stop scanning enemies for it.
            if (willDespawn) break;
        }
    }
}
