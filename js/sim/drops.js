// Pure drop-orb update step.
//
// Extracted from `js/modules/world/color-star.js`'s `update()` method
// — specifically the **collectible-orb branch** (`isBurst === true`,
// covering health and money orbs). The decorative-starfield branch
// stays in `color-star.js` untouched.
//
// This is the F-agent slice of the Phase-1 multiplayer engine refactor
// (see `docs/Multiplayer Rust Client Engine – 2026-05-07.md`,
// §"Phase 1: Engine refactor"). Mirrors agent A's `js/sim/ship.js`
// pattern: a pure `updateDrop(drop, ctx, events)` that owns drift,
// friction, magnetism, and lifetime decay. Pickup is **not** here —
// that's the collision-extract session's territory.
//
// This module is **byte-for-byte equivalent** to the existing solo
// drop-orb behavior — same friction values, same two-tier health-orb
// magnet (320 px gentle / 120 px snap), same tractor formula, same
// 7200-tick lifetime, same opacity fade-in. No tuning happens here.
//
// What lives here:
//   - Lifetime tick (life-- ; deactivate when ≤ 0)
//   - Friction (0.92 if health, else 0.985)
//   - Position update (x += vx)
//   - Opacity fade-in/fade-out (`min(1, life/120)`)
//   - Health-orb passive magnet (two-tier: 320 px gentle, 120 px snap)
//   - Tractor-beam pull (gold orbs only when `tractorEngaged=true`;
//     stacks on top of the health magnet for an even snappier scoop)
//
// What does NOT live here (stays in `ColorStar`):
//   - 3D-shape rendering (`drawOrbOverlay`, `_drawHealthShapesCanvas2D`,
//     etc. — the 5.88.5 single-player work)
//   - Twinkle/shimmer phase (visual only — driven by `frameClock.now`)
//   - Sparkle particle emission (renders via `particlePool`)
//   - Decorative starfield logic (the `else` branch in `update()`,
//     `starType === 'decorative'` — handled by the wrapper)
//   - Pickup attribution (collision-extract session)
//   - Drop spawning (driven by enemy/asteroid death events)
//
// Per-orb identification: `kind` discriminates drop variants.
//   - 'health'      — blue 3D-shape orb, magnet-attractive
//   - 'money_shape' — gold shape orb (the 1-3 "big" gold drops per kill)
//   - 'money_pixel' — gold pixel orb (the 10-25 "tiny" gold drops per kill,
//                     no sparkle, magnet-attractive only via tractor)
//   - 'powerup'     — reserved for future powerup pickups (currently no
//                     game state uses this kind at pure-sim level)

// Drop physics tuning constants — verbatim from the
// `color-star.js` collectible branch. Live here so the pure step
// is self-contained.

/** Friction multiplier for health orbs (with magnet active). */
export const DROP_FRICTION_HEALTH = 0.92;

/** Friction multiplier for non-health orbs (gold, pixel). */
export const DROP_FRICTION_DEFAULT = 0.985;

/** Outer magnet radius — gentle pull starts here.
 *  5.102.0 — Tightened 320 → 140 so the player has to fly close enough
 *  for the orb to "see" them. Trivializing the pickup is what made
 *  health feel cheap; now it's a real positional commitment. */
export const DROP_MAGNET_FAR_RADIUS = 140;

/** Inner magnet radius — strong snap kicks in here.
 *  5.102.0 — Tightened 120 → 55 so the snap only fires when the ship is
 *  basically touching the orb. */
export const DROP_MAGNET_NEAR_RADIUS = 55;

/** Gentle-pull force constant (matches the 8 in the original code). */
export const DROP_MAGNET_FAR_FORCE = 8;

/** Snap-pull force constant (matches the 22 in the original code). */
export const DROP_MAGNET_NEAR_FORCE = 22;

/**
 * 5.95.0 — Mobile auto-collect radius for health orbs. Bumped well
 * beyond the desktop 320 px so health flies to the stationary player
 * from anywhere on a small viewport. The pull force stays at the
 * desktop FAR_FORCE so existing tests pinning the desktop two-tier
 * formula don't have to change — only the radius opens up.
 *
 * The wrapper switches between the desktop and mobile radius via the
 * `ctx.mobileMagnet` boolean (see context plumbing in engine-driver-solo
 * / engine-driver-mp). Pure-sim contract stays clean: this file owns
 * the tuning, the caller owns the policy.
 */
export const DROP_MAGNET_FAR_RADIUS_MOBILE = 3000;
/** Mobile inner magnet radius — wider snap zone for finger taps. */
export const DROP_MAGNET_NEAR_RADIUS_MOBILE = 600;
/** 5.98.0 — Mobile pull-force overrides. The far/near formula in
 *  `updateDrop` uses `DROP_MAGNET_*_FORCE` even on mobile; on mobile we
 *  want a snappier pull from across the screen so the drops "fly" rather
 *  than gently drift. These two override the desktop values when
 *  `ctx.mobileMagnet === true`. */
export const DROP_MAGNET_FAR_FORCE_MOBILE = 18;
export const DROP_MAGNET_NEAR_FORCE_MOBILE = 40;

/**
 * Opacity fade-in/fade-out window — the orb opacity is
 * `min(1, life / DROP_OPACITY_FADE_FRAMES)`. With `life` starting at
 * 7200 and decrementing per tick, opacity stays at 1.0 for the first
 * ~7080 ticks, then fades out over the last 120 ticks (~2 s @60 Hz)
 * before deactivation.
 */
export const DROP_OPACITY_FADE_FRAMES = 120;

/**
 * Tractor-beam force scalar. Multiplied by the per-orb `z` and the
 * per-orb fall-off `(1 - dist/range)`. Lifted from the live engine
 * via `ctx.tractorAttraction` (which is `GAME_CONFIG.ACTIVE_STAR_ATTR
 * * 1500` in the legacy code).
 *
 * The wrapper sets `ctx.tractorAttraction` and `ctx.tractorRange` from
 * `GAME_CONFIG` before calling `updateDrop`; we read off `ctx`
 * rather than importing GAME_CONFIG so the pure module stays
 * dependency-free.
 */

/**
 * Pure drop-orb update step. Drift, friction, magnetism toward player,
 * lifetime decay. **Pickup is NOT here** — that's collision.js's job
 * in a later session.
 *
 * Drop spawning is also NOT here — drops are spawned by enemy /
 * asteroid death events. Sibling D and E emit those events; the
 * collision-extract session will own pickup. This file owns the
 * "drop is alive in the world, drifting toward the player" physics.
 *
 * Side-effect events: none today. The slot is in place for future
 * collision-extract work that may emit `drop_expired` when life hits 0.
 *
 * @param {import('./state.js').DropState} drop
 * @param {import('./state.js').DropUpdateContext} ctx — `ships`,
 *                                                       `field`, `dt`,
 *                                                       `tractorEngaged`,
 *                                                       `tractorAttraction`,
 *                                                       `tractorRange`.
 * @param {Array<*>} _events — out-buffer for future events; unused today.
 * @returns {import('./state.js').DropState} the (mutated) drop state
 */
export function updateDrop(drop, ctx, _events) {
    if (!drop || !drop.active) return drop;

    const isHealth = drop.kind === 'health';

    // ── Lifetime tick ──
    // Mirrors `color-star.js` line 181-185. Once the drop's life
    // counter reaches 0 it deactivates and the wrapper removes it
    // from the active pool on the next cleanup pass.
    // 5.102.0 — Health drops are PERMANENT. The player only gets a
    // few health pickups per wave; despawning them on a 2-minute timer
    // punished players who couldn't safely route to the orb. Skip the
    // life decrement entirely for health drops so they sit on the
    // field forever (until collected via collision).
    if (!isHealth) {
        drop.life--;
        if (drop.life <= 0) {
            drop.active = false;
            return drop;
        }
    }

    // ── Friction ──
    // Health orbs use a heavier friction (0.92) so the magnet's
    // per-tick force pump doesn't accelerate them to absurd speeds —
    // steady-state v ≈ F/(1−f). Other orbs (gold shape, gold pixel)
    // drift more freely (0.985) because they're tractor-only.
    const friction = isHealth ? DROP_FRICTION_HEALTH : DROP_FRICTION_DEFAULT;
    drop.vx *= friction;
    drop.vy *= friction;

    // ── Position update ──
    // Mirrors `color-star.js` line 222-223. Per-tick delta, not
    // per-second integration (legacy behavior).
    drop.x += drop.vx;
    drop.y += drop.vy;

    // ── Opacity fade ──
    // Mirrors `color-star.js` line 225. Stays at 1.0 for the long
    // tail and fades out over the last `DROP_OPACITY_FADE_FRAMES`
    // ticks. Stored on the drop because the renderer reads it
    // directly (no separate "fade-state" component).
    // 5.102.0 — Health drops are permanent, so pin opacity at 1.0.
    drop.opacity = isHealth ? 1 : Math.min(1, drop.life / DROP_OPACITY_FADE_FRAMES);

    // ── Find the closest ship for magnet/tractor calculations ──
    // The legacy code reads off `playerPos` (a single ship). For
    // co-op we'll need to find the nearest of `ctx.ships` so each
    // drop tracks the closest player. For solo this is a single
    // ship and the formula is identical.
    const ships = ctx.ships;
    if (!ships || ships.length === 0) return drop;

    let nearestShip = null;
    let nearestDx = 0;
    let nearestDy = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        if (!s || s.active === false) continue;
        const dx = s.x - drop.x;
        const dy = s.y - drop.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestDx = dx;
            nearestDy = dy;
            nearestShip = s;
        }
    }
    if (!nearestShip) return drop;

    const dist = nearestDist;

    // ── Health-orb passive magnet (two-tier) ──
    // Mirrors `color-star.js` line 237-247. Health orbs only —
    // gold orbs (shape and pixel) drift freely until the player's
    // tractor beam scoops them.
    //
    // 5.95.0 — On mobile (ctx.mobileMagnet=true), use the wider mobile
    // radii so health orbs auto-collect from anywhere on the playfield.
    // Force values stay the same so the desktop two-tier formula tests
    // don't move; only the engagement radius grows.
    const farR = ctx.mobileMagnet ? DROP_MAGNET_FAR_RADIUS_MOBILE : DROP_MAGNET_FAR_RADIUS;
    const nearR = ctx.mobileMagnet ? DROP_MAGNET_NEAR_RADIUS_MOBILE : DROP_MAGNET_NEAR_RADIUS;
    const farF = ctx.mobileMagnet ? DROP_MAGNET_FAR_FORCE_MOBILE : DROP_MAGNET_FAR_FORCE;
    const nearF = ctx.mobileMagnet ? DROP_MAGNET_NEAR_FORCE_MOBILE : DROP_MAGNET_NEAR_FORCE;
    if (isHealth && dist > 1 && dist < farR) {
        const inv = 1 / dist;
        const farFactor = (farR - dist) / farR;
        drop.vx += nearestDx * inv * farF * farFactor;
        drop.vy += nearestDy * inv * farF * farFactor;
        if (dist < nearR) {
            const nearFactor = (nearR - dist) / nearR;
            drop.vx += nearestDx * inv * nearF * nearFactor;
            drop.vy += nearestDy * inv * nearF * nearFactor;
        }
    }

    // ── Tractor beam pull ──
    // Mirrors `color-star.js` line 251-259. When the player's
    // tractor skill is engaged, every drop within `tractorRange`
    // gets a fall-off pull scaled by the orb's `z` parallax depth.
    // Stacks on top of the health magnet for an even snappier scoop.
    if (dist > 1 && ctx.tractorEngaged) {
        const tractorAttraction = ctx.tractorAttraction || 0;
        const tractorDist = ctx.tractorRange || 0;
        if (tractorDist > 0 && dist < tractorDist) {
            const tractorForce = tractorAttraction * (1 - dist / tractorDist);
            const z = drop.z !== undefined ? drop.z : 1;
            drop.vx += (nearestDx / dist) * tractorForce * z;
            drop.vy += (nearestDy / dist) * tractorForce * z;
        }
    }

    return drop;
}

/**
 * Loop helper. Calls `updateDrop()` over an array of drops.
 *
 * Provided for parity with `updateShips` in `js/sim/ship.js` —
 * the wrapper passes its active-orb collection in one shot and the
 * pure layer iterates internally.
 *
 * @param {import('./state.js').DropState[]} drops
 * @param {import('./state.js').DropUpdateContext} ctx
 * @param {Array<*>} events
 */
export function updateDrops(drops, ctx, events) {
    if (!drops) return;
    for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d && d.active) updateDrop(d, ctx, events);
    }
}
