// Pure asteroid-update step.
//
// Extracted from `js/modules/world/asteroid.js`'s `update()` method as
// part of the Phase-1 multiplayer engine refactor (see
// `docs/Multiplayer Rust Client Engine – 2026-05-07.md`, §"Phase 1:
// Engine refactor"). Mirrors the agent-A pattern that landed for ship
// physics in `js/sim/ship.js`.
//
// This module is **byte-for-byte equivalent** to the existing solo
// asteroid-update behavior — same speed cap, same per-tick position
// delta (scaled by TICK_SCALE), same boundary-bounce 0.9 damping, same
// 3D-rotation accumulation. No tuning happens here.
//
// What lives here:
//   - Speed-cap clamp (currentSpeed > 2.0 → renormalize to 2.0)
//   - Position update (x += vx * TICK_SCALE)
//   - Boundary bounce (with 0.9 damp) OR wraparound fallback
//   - 3D rotation accumulation (rotX += rotVelX, etc.)
//   - Death-flash countdown (tick down, deactivate at 0)
//
// What does NOT live here (stays on `Asteroid` for now):
//   - Warp-in entry animation (presentation; wrapper handles)
//   - 3D vertex projection (drawing concern)
//   - Hit-flash visual timer (presentation)
//   - Sprite/health-bar rendering
//   - Audio events / particle FX
//
// Split logic (1 large → N fragments) is NOT here because the live
// game does it from `js/modules/combat/collision-system.js` when a
// bullet hit destroys a parent asteroid. Once collision moves into
// the sim layer (separate session), it will produce a "split" event
// that the engine driver drains — for now this update step never
// emits events.

// Asteroid drift cap (px per logic tick, post-scale). Mirrors the
// `maxSpeed = 2.0` literal in the legacy `Asteroid.update()`.
const ASTEROID_MAX_SPEED = 2.0;

// Boundary-bounce energy retention. Mirrors the `0.9` factor in the
// legacy code (slightly more elastic than the ship's 0.8).
const ASTEROID_BOUNCE_DAMP = 0.9;

/**
 * Pure asteroid-update step.
 *
 * Reads the current asteroid state, integrates one tick of motion,
 * advances rotation, and **mutates `asteroid` in place** (no allocation
 * per tick). Pushes side-effect events onto `events` — currently never
 * emits anything, but the slot reserves space for the upcoming split
 * migration.
 *
 * @param {import('./state.js').AsteroidState} asteroid
 * @param {import('./state.js').AsteroidUpdateContext} ctx
 * @param {Array<*>} events            out-buffer for split / despawn events
 * @returns {import('./state.js').AsteroidState} the (mutated) asteroid
 */
export function updateAsteroid(asteroid, ctx, events) {
    if (!asteroid.active) return asteroid;

    // ── Warp-in: skip motion / boundary while phasing in ──
    // The wrapper handles the warp animation itself (it touches projection
    // dirtiness which is a presentation concern). We just early-exit so
    // the rotation & position don't double-advance.
    if (asteroid.warping) return asteroid;

    // ── Death flash: tick down, deactivate at zero ──
    // Mirrors the original `if (this._deathFlash > 0) { … return; }`
    // block at the top of update(). We early-return so motion doesn't
    // continue once the rock is mid-explosion.
    if (asteroid.deathFlash > 0) {
        asteroid.deathFlash--;
        if (asteroid.deathFlash <= 0) {
            asteroid.active = false;
        }
        return asteroid;
    }

    // ── Speed cap ──
    // Mirrors `Asteroid.update()` line 343-349. Renormalizes velocity
    // when |v| > 2.0 so split fragments (which can spawn with 4.5–7.5
    // initial speed) settle into a manageable drift instead of streaking
    // off-screen.
    const speed = Math.hypot(asteroid.vx, asteroid.vy);
    if (speed > ASTEROID_MAX_SPEED) {
        asteroid.vx = (asteroid.vx / speed) * ASTEROID_MAX_SPEED;
        asteroid.vy = (asteroid.vy / speed) * ASTEROID_MAX_SPEED;
    }

    // ── Position update ──
    // Mirrors lines 351-352. Note the `* TICK_SCALE` factor; legacy
    // `vel` is stored as 30Hz units and scaled per render frame.
    asteroid.x += asteroid.vx * ctx.tickScale;
    asteroid.y += asteroid.vy * ctx.tickScale;

    // ── Boundary handling ──
    // Mirrors lines 354-380. With a field, bounce with 0.9 damp; without
    // a field, fall back to torus wraparound at radius * 2 buffer.
    const field = ctx.field;
    if (field) {
        const r = asteroid.radius;
        if (asteroid.x - r < 0) {
            asteroid.x = r;
            asteroid.vx = Math.abs(asteroid.vx) * ASTEROID_BOUNCE_DAMP;
        } else if (asteroid.x + r > field.width) {
            asteroid.x = field.width - r;
            asteroid.vx = -Math.abs(asteroid.vx) * ASTEROID_BOUNCE_DAMP;
        }
        if (asteroid.y - r < 0) {
            asteroid.y = r;
            asteroid.vy = Math.abs(asteroid.vy) * ASTEROID_BOUNCE_DAMP;
        } else if (asteroid.y + r > field.height) {
            asteroid.y = field.height - r;
            asteroid.vy = -Math.abs(asteroid.vy) * ASTEROID_BOUNCE_DAMP;
        }
    } else {
        // Wraparound fallback — only used when no field is supplied.
        // Live engine call sites always pass a field, so this branch
        // is effectively dead in solo play; kept for robustness.
        const wrapW = ctx.wrapWidth;
        const wrapH = ctx.wrapHeight;
        const buf = asteroid.radius * 2;
        if (asteroid.x < -buf) asteroid.x = wrapW + buf;
        if (asteroid.x > wrapW + buf) asteroid.x = -buf;
        if (asteroid.y < -buf) asteroid.y = wrapH + buf;
        if (asteroid.y > wrapH + buf) asteroid.y = -buf;
    }

    // ── 3D rotation ──
    // Mirrors lines 382-385. The actual projection is presentation work
    // (it lives in the wrapper / draw path); here we just advance the
    // rotation angles each tick. Always runs, even if motion is clamped,
    // matching the original "for consistency" comment.
    asteroid.rotX += asteroid.rotVelX;
    asteroid.rotY += asteroid.rotVelY;
    asteroid.rotZ += asteroid.rotVelZ;

    return asteroid;
}

/**
 * Loop helper. Calls `updateAsteroid()` over an array of asteroids,
 * passing the same context to each.
 *
 * @param {import('./state.js').AsteroidState[]} asteroids
 * @param {import('./state.js').AsteroidUpdateContext} ctx
 * @param {Array<*>} events
 */
export function updateAsteroids(asteroids, ctx, events) {
    for (const asteroid of asteroids) {
        updateAsteroid(asteroid, ctx, events);
    }
}

// Re-export the constants so the wrapper / tests can compare without
// duplicating the literals.
export { ASTEROID_MAX_SPEED, ASTEROID_BOUNCE_DAMP };
