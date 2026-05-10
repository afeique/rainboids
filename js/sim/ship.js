// Pure ship-physics step.
//
// Extracted from the monolithic `js/modules/player/player.js` `update()`
// method as the Phase-1 deliverable for the multiplayer engine refactor
// (see `docs/Multiplayer Rust Client Engine – 2026-05-07.md`, §"Phase 1:
// Engine refactor").
//
// This module is **byte-for-byte equivalent** to the existing solo
// ship-update behavior — same per-tick velocity delta, same friction
// constant, same snap-to-zero epsilon, same max-speed cap formula,
// same boundary-bounce damping. No physics tuning happens here.
//
// What lives here:
//   - Velocity integration (vx += cos(moveAngle) * thrustForce)
//   - Friction (vx *= friction)
//   - Snap-to-zero epsilon
//   - Max-speed clamp (with the 70% boost-to-cap rule)
//   - Position update (x += vx)
//   - Aim angle (angle = atan2(aimY - y, aimX - x))
//   - Boundary bounce (or wraparound fallback)
//
// What does NOT live here (stays on `Player` for now — these are
// presentation, audio, or higher-level systems that will become their
// own sim subsystems in later sessions):
//   - Rendering, particles, screen FX
//   - Audio events
//   - HUD updates
//   - Powerup state tracking (`_reflexesReadyAt`, `_lastStandUsed`, etc.)
//   - Save / restore plumbing
//   - `this.gameEngine` / `this.events` plumbing
//   - Thrust juice (`thrustLevel`, `engineStartup`) — FX-side state
//
// Scope-of-numbers: this module operates on plain f32 (JS Number).
// Fixed-point migration is a later session — sibling agent B mirrors
// this work in Rust on the same f32 basis for now (see
// `server/src/sim/ship.rs`).

/**
 * Pure ship-physics step.
 *
 * Reads the current ship state + active inputs, integrates one tick of
 * physics, and **mutates `ship` in place** (no allocation per tick).
 * The wire-protocol layer treats `ShipState` as a value type; we copy
 * once on read and once on write, so in-place mutation here is safe
 * and matches the live `Player.update` shape (which mutates `this.x`,
 * `this.vel.x`, etc. directly).
 *
 * Pushes any side-effect events (bullet spawns, hit flashes) onto the
 * `events` array — does **not** call audio / particles / renderer
 * directly. Today the ship physics emits no events; the slot is here
 * for the upcoming bullet-spawn migration.
 *
 * @param {import('./state.js').ShipState} ship    ship to step
 * @param {import('./state.js').InputFrame} input  input snapshot for this tick
 * @param {number} _dt                              seconds (typically 1/60); the
 *                                                  current physics works in
 *                                                  per-tick deltas, so dt is
 *                                                  accepted for forward
 *                                                  compatibility but not used.
 * @param {import('./rng.js').Pcg64} _rng           seeded RNG (unused today;
 *                                                  reserved for future spawn
 *                                                  jitter or AI modulation).
 * @param {Array<*>} _events                         out-buffer for events this
 *                                                  tick (currently always empty;
 *                                                  bullet spawns will populate
 *                                                  it once weapons migrate).
 * @returns {import('./state.js').ShipState} the (mutated) ship state
 */
export function updateShip(ship, input, _dt, _rng, _events) {
    if (!ship.active) return ship;

    // ── Aim angle ──
    // Mirrors `player.js` line 449-452: simple atan2 from ship to aim point.
    const dx = input.aimX - ship.x;
    const dy = input.aimY - ship.y;
    ship.angle = Math.atan2(dy, dx);

    // ── Movement integration ──
    // Mirrors `player.js` line 521-549: WASD direction → moveAngle →
    // per-tick velocity delta scaled by thrustPower * speedMult.
    // Note: this is a per-TICK delta, not a per-second integration —
    // the existing physics ignores `dt` and the wrapper passes the
    // already-scaled `thrustPower` (which embeds GAME_CONFIG.TICK_SCALE).
    const isMoving = input.up || input.down || input.left || input.right;
    if (isMoving && !input.thrustersDisabled) {
        let moveX = 0;
        let moveY = 0;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;
        if (input.up) moveY -= 1;
        if (input.down) moveY += 1;

        const moveAngle = Math.atan2(moveY, moveX);
        const thrustForce = input.thrustPower * input.speedMult;
        ship.vx += Math.cos(moveAngle) * thrustForce;
        ship.vy += Math.sin(moveAngle) * thrustForce;
    }

    // ── Friction ──
    // Mirrors `player.js` line 577-584. Note the friction value is
    // already pre-computed by the wrapper (`Math.pow(0.50, TICK_SCALE)`)
    // and passed through `input.friction` so this function stays
    // independent of GAME_CONFIG.
    ship.vx *= input.friction;
    ship.vy *= input.friction;

    // ── Snap to zero ──
    // Mirrors `player.js` line 586-591. Prevents perpetual subpixel
    // drift after the player releases keys.
    if (Math.abs(ship.vx) < input.velEpsilon) ship.vx = 0;
    if (Math.abs(ship.vy) < input.velEpsilon) ship.vy = 0;

    // ── Max-speed clamp ──
    // Mirrors `player.js` line 593-600. Speed boost only contributes
    // 70% of its multiplier to the velocity cap (so upgrades feel
    // powerful but don't trivialize positioning).
    const effectiveMaxV = input.maxV * (1 + (input.speedMult - 1) * 0.7);
    const mag = Math.hypot(ship.vx, ship.vy);
    if (mag > effectiveMaxV) {
        ship.vx = (ship.vx / mag) * effectiveMaxV;
        ship.vy = (ship.vy / mag) * effectiveMaxV;
    }

    // ── Position update ──
    // Mirrors `player.js` line 602-603.
    ship.x += ship.vx;
    ship.y += ship.vy;

    // ── Boundary bounce ──
    // Mirrors `player.js` line 605-627. Bounce dampens velocity by
    // `bounceDamp` (default 0.8) so the ship doesn't get caught in
    // a perpetual edge-rebound loop.
    const field = ship.field;
    if (field) {
        const r = ship.radius;
        const bd = input.bounceDamp;
        if (ship.x - r < 0) {
            ship.x = r;
            ship.vx = Math.abs(ship.vx) * bd;
        } else if (ship.x + r > field.width) {
            ship.x = field.width - r;
            ship.vx = -Math.abs(ship.vx) * bd;
        }
        if (ship.y - r < 0) {
            ship.y = r;
            ship.vy = Math.abs(ship.vy) * bd;
        } else if (ship.y + r > field.height) {
            ship.y = field.height - r;
            ship.vy = -Math.abs(ship.vy) * bd;
        }
    }
    // (No wraparound fallback — solo always passes a field; if a future
    // mode needs wraparound, add it here.)

    return ship;
}

/**
 * Loop helper. Calls `updateShip()` over an array of ships, looking up
 * each ship's `InputFrame` by player id.
 *
 * @param {import('./state.js').ShipState[]} ships
 * @param {Map<*, import('./state.js').InputFrame>} inputs
 * @param {number} dt
 * @param {import('./rng.js').Pcg64} rng
 * @param {Array<*>} events
 */
export function updateShips(ships, inputs, dt, rng, events) {
    for (const ship of ships) {
        const input = inputs.get(ship.player);
        if (!input) continue;
        updateShip(ship, input, dt, rng, events);
    }
}
