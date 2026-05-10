//! Pair-detection collision step. Rust mirror of `js/sim/collision.js`.
//!
//! This module is the Rust-side companion to the new pure-collision system
//! introduced for the multiplayer server and the client-side prediction
//! engine. It does NOT replace the legacy `js/modules/combat/collision-system.js`
//! solo-gameplay path — that stays the single source of truth for solo
//! gameplay until the prediction wiring (Phase 3) flips over.
//!
//! ─── Scope (Phase 2.5, dispatch 1) ──────────────────────────────────
//!
//! Ported here:
//!   - Bullet-vs-asteroid pair detection (`detect_bullet_asteroid_hits`).
//!
//! Deferred to follow-up sessions (Phase 2.5, dispatch 2..N):
//!   - Player-vs-asteroid    (needs ship velocity + bounce/restitution)
//!   - Player-vs-enemy       (ramming damage, bounce, knockback)
//!   - Enemy-vs-asteroid     (push forces both ways)
//!   - Bullet-vs-enemy       (mirror of bullet-vs-asteroid, plus boss-rage)
//!   - Drops pickup          (player-vs-drop)
//!   - Power-weapon collisions  (mines, missiles, lightning arcs, charged
//!                               shots, energy slashes)
//!   - Defense-skill collisions (deflector orbs, EMP pulse, tractor shield)
//!
//! Not in scope at all:
//!   - Damage NUMBER spawning / hit-flash visuals (presentation)
//!   - Audio / particle FX / screen shake / hitstop (presentation)
//!   - Spatial-grid construction (wrapper concern; pure step takes
//!     whatever pre-filtered candidates the wrapper hands it)
//!   - XP / score / kill-streak side effects (game-state concerns; the
//!     wrapper drains events and applies them)
//!
//! The pure step **emits events**; the wrapper drains them to apply
//! damage, despawn bullets, spawn debris/orbs, and run the legacy FX
//! helpers. Mirrors `js/sim/wave.js` (Phase 1, agent F) and
//! `js/sim/asteroid.js` (Phase 1, agent C).
//!
//! ─── Design note: minimal input types ──────────────────────────────
//!
//! The detector takes `CollisionBullet` / `CollisionAsteroid` rather than
//! the full `PlayerBullet` / `Asteroid` structs defined in `bullet.rs` /
//! `asteroid.rs`. Reasons:
//!
//!   - Decouples the pure step from storage layout. When bullets/asteroids
//!     migrate to SoA pools (plan §"Contiguous storage"), the collision
//!     module won't have to change — the wrapper just maps the pool view
//!     into these small structs.
//!   - The collision check only needs `{id, x, y, vx, vy, radius, damage,
//!     piercing, active, pierced_asteroid_ids}` from a bullet — not the
//!     entire flight state, fade factor, max_range, etc.
//!   - Enemy bullets and player bullets will share this struct, even
//!     though they're different Rust types in `bullet.rs`.
//!
//! Parity fixture: `server/tests/parity_collision.rs`.

use std::collections::HashSet;

use crate::protocol::GameEvent;

use super::state::GameState;

// ─── Constants — copied verbatim from JS ────────────────────────────
//
// Extracted from `COLLISION_CONFIG` in
// `js/modules/combat/collision-system.js`. Mirrors the corresponding
// `export const` block in `js/sim/collision.js` so both Rust and JS
// keep the values in lockstep.

/// Bullet → asteroid knockback impulse multiplier. Mirrors
/// `BULLET_ASTEROID_KNOCKBACK = 0.05` in `js/sim/collision.js`.
///
/// Applied by the wrapper to the asteroid's velocity using the bullet
/// velocity reported in the event:
///   `asteroid.vx += event.bullet_vx * BULLET_ASTEROID_KNOCKBACK`
/// The pure step never mutates the asteroid — it just hands over the
/// pre-knockback bullet velocity in the event payload.
pub const BULLET_ASTEROID_KNOCKBACK: f32 = 0.05;

/// Frames the asteroid's hit-flash effect runs after a bullet impact.
/// Mirrors `BULLET_ASTEROID_HIT_FLASH_FRAMES = 10` in `js/sim/collision.js`.
///
/// Presentation concern in the strict sense, but exposed here so the
/// wrapper can set the asteroid's hit-flash from a single source of
/// truth without re-deriving the count.
pub const BULLET_ASTEROID_HIT_FLASH_FRAMES: u32 = 10;

// ─── Collision-input types ──────────────────────────────────────────

/// Minimal bullet view for collision detection.
///
/// Mirrors the relevant JS fields read by `detectBulletAsteroidHits`:
///   `{ id, x, y, vx, vy, radius, damage, piercing, active,
///      piercedEnemies, piercedAsteroidIds }`.
///
/// Mutation surface:
///   - `pierced_enemies` is bumped per-hit (mirrors JS counter).
///   - `pierced_asteroid_ids` is a per-bullet Set the detector adds to
///     when an asteroid is pierced, so the same bullet won't re-hit
///     that asteroid on a later tick. JS lazily allocates this Set
///     on first hit; the Rust mirror starts with an empty `HashSet`
///     because allocating an empty set per bullet costs nothing.
///
/// `piercing` semantics (mirroring `js/sim/collision.js`):
///   - `0` → non-piercing; bullet despawns on first hit.
///   - `N > 0` → piercing budget; bullet may hit `N + 1` total targets
///     before despawning (matches legacy `bullet.onHit`: piercing=1
///     can hit 2 targets).
///   - `-1` is NOT a sentinel; the JS source treats `piercing | 0`
///     as a plain integer. Use `0` for non-piercing.
#[derive(Debug, Clone)]
pub struct CollisionBullet {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    pub damage: f32,
    /// Piercing budget — see struct docstring for semantics.
    pub piercing: i32,
    /// Live counter — number of pierces this bullet has performed so far.
    /// JS: `bullet.piercedEnemies | 0`.
    pub pierced_enemies: i32,
    pub active: bool,
    /// Per-bullet memory of which asteroid ids have already been pierced.
    /// JS: `bullet.piercedAsteroidIds: Set<AsteroidId|number>`.
    pub pierced_asteroid_ids: HashSet<u32>,
}

impl CollisionBullet {
    /// Construct a fresh non-piercing player bullet at the origin.
    /// Used as a building block in tests; production code populates
    /// fields directly from the live bullet pool.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            radius: 4.0,
            damage: 1.0,
            piercing: 0,
            pierced_enemies: 0,
            active: true,
            pierced_asteroid_ids: HashSet::new(),
        }
    }
}

/// Minimal asteroid view for collision detection.
///
/// Mirrors the JS fields read by `detectBulletAsteroidHits`:
///   `{ id, x, y, radius, active, warping, deathFlash }`.
///
/// The JS guards `!asteroid.active`, `asteroid.warping`, and
/// `asteroid.deathFlash > 0` collapse into the boolean / counter fields
/// below — the wrapper translates from the full sim-level `Asteroid`
/// (`asteroid.rs`) to this view by reading those fields directly.
#[derive(Debug, Clone, Copy)]
pub struct CollisionAsteroid {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub active: bool,
    pub warping: bool,
    /// Frames remaining of mid-death flash. Treated as "skip if > 0".
    /// JS accepts either `deathFlash` or `_deathFlash`; the Rust mirror
    /// collapses both into this single counter (the wrapper picks the
    /// right field on the JS side).
    pub death_flash: u32,
}

impl CollisionAsteroid {
    /// Construct a fresh asteroid at the origin with default radius.
    /// Test convenience.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            radius: 30.0,
            active: true,
            warping: false,
            death_flash: 0,
        }
    }
}

/// Per-tick context for `detect_bullet_asteroid_hits`. Currently empty —
/// reserved for future extensions (e.g. spatial-grid filter, one-punch-man
/// cheat flag). Matches the empty-object `ctx` in `js/sim/collision.js`.
#[derive(Debug, Clone, Copy, Default)]
pub struct CollisionContext;

/// Events emitted by the collision pair-detection step.
///
/// One variant per pair (currently just `BulletHitAsteroid`; further
/// pairs land as additional variants when their dispatches port).
/// Field names mirror the JS event keys with snake_case translation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CollisionEvent {
    /// Mirrors `{ type: 'bullet_hit_asteroid', ... }` in `js/sim/collision.js`.
    BulletHitAsteroid {
        bullet_id: u32,
        asteroid_id: u32,
        damage: f32,
        bullet_x: f32,
        bullet_y: f32,
        bullet_vx: f32,
        bullet_vy: f32,
        /// How many more piercing hits the bullet has after this one.
        /// `-1` ↔ non-piercing (bullet despawns now).
        bullet_piercing_remaining: i32,
        /// `true` ↔ wrapper should remove the bullet from the pool.
        bullet_will_despawn: bool,
    },
}

// ─── Bullet-vs-asteroid pair detection ──────────────────────────────

/// Detect bullet-vs-asteroid collisions for one tick.
///
/// Pure step: reads bullet + asteroid positions/radii, decides which
/// pairs collided, and pushes one `BulletHitAsteroid` event per detected
/// hit. The function does NOT mutate asteroid state — no damage, no
/// death-flash — the wrapper drains events into the legacy damage /
/// despawn / FX helpers.
///
/// Mutation surface on `bullets`:
///   - `pierced_asteroid_ids` — Set is mutated; asteroid id is inserted
///     on each hit. Carried across ticks so a piercing bullet doesn't
///     re-hit a target it's already passed through. JS line refs:
///     `js/sim/collision.js:238–241`.
///   - `pierced_enemies` — running counter; bumped on each hit so the
///     "budget exhausted?" check on the next tick sees the latest value.
///     JS line refs: `js/sim/collision.js:251–252`.
///
/// Iteration order: for each bullet, scan asteroids in slice order. The
/// first hit a non-piercing bullet detects becomes its only event for
/// the tick. A bullet with `piercing > 0` may emit up to `piercing + 1`
/// hit events per tick.
///
/// Geometry: circle-circle overlap using squared distance to skip the
/// sqrt. `(dx² + dy²) < (br + ar)²`. JS line refs: `js/sim/collision.js:225–231`.
///
/// Skipped pairs (no event emitted):
///   - Inactive bullet            (`!bullet.active`)
///   - Inactive asteroid          (`!asteroid.active`)
///   - Warping asteroid           (`asteroid.warping`)
///   - Asteroid mid-death-flash   (`asteroid.death_flash > 0`)
///   - Asteroid already pierced   (id in `bullet.pierced_asteroid_ids`)
///   - Piercing budget exhausted  (`bullet.pierced_enemies > bullet.piercing`)
pub fn detect_bullet_asteroid_hits(
    bullets: &mut [CollisionBullet],
    asteroids: &[CollisionAsteroid],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if bullets.is_empty() || asteroids.is_empty() {
        return;
    }

    for bullet in bullets.iter_mut() {
        // 1. Active-guard (JS collision.js:185).
        if !bullet.active {
            continue;
        }

        // 2. Piercing-budget exhausted? (JS collision.js:191–201).
        //    A piercing bullet that's already eaten its `piercing + 1`
        //    targets has `pierced_enemies > piercing`. A non-piercing
        //    bullet that's somehow active with prior hits is similarly
        //    guarded defensively.
        let piercing = bullet.piercing;
        if piercing > 0 && bullet.pierced_enemies > piercing {
            continue;
        }
        if piercing == 0 && bullet.pierced_enemies > 0 {
            continue;
        }

        let bullet_radius = bullet.radius;

        for asteroid in asteroids.iter() {
            // 3. Asteroid gating (JS collision.js:207–217).
            if !asteroid.active {
                continue;
            }
            if asteroid.warping {
                continue;
            }
            if asteroid.death_flash > 0 {
                continue;
            }

            // 4. Already-pierced? (JS collision.js:222–223).
            if bullet.pierced_asteroid_ids.contains(&asteroid.id) {
                continue;
            }

            // 5. Circle-circle overlap (JS collision.js:227–231).
            let dx = bullet.x - asteroid.x;
            let dy = bullet.y - asteroid.y;
            let sum_r = bullet_radius + asteroid.radius;
            if dx * dx + dy * dy >= sum_r * sum_r {
                continue;
            }

            // ── Hit detected ──

            // 6. Update piercing tracker (JS collision.js:238–242).
            bullet.pierced_asteroid_ids.insert(asteroid.id);
            bullet.pierced_enemies += 1;
            let pierced_so_far = bullet.pierced_enemies;

            // 7. Despawn / piercing-remaining decision
            //    (JS collision.js:258–263).
            let will_despawn = if piercing == 0 {
                true
            } else {
                pierced_so_far > piercing
            };
            let piercing_remaining = if piercing == 0 {
                -1
            } else {
                (piercing - pierced_so_far).max(0)
            };

            // 8. Damage default — JS `bullet.damage || 1`. We treat any
            //    non-positive `damage` (0 or NaN-less zero) as the
            //    default-1 fallback (JS truthy check on a number).
            let damage = if bullet.damage > 0.0 { bullet.damage } else { 1.0 };

            // 9. Emit the event (JS collision.js:265–276).
            events.push(CollisionEvent::BulletHitAsteroid {
                bullet_id: bullet.id,
                asteroid_id: asteroid.id,
                damage,
                bullet_x: bullet.x,
                bullet_y: bullet.y,
                bullet_vx: bullet.vx,
                bullet_vy: bullet.vy,
                bullet_piercing_remaining: piercing_remaining,
                bullet_will_despawn: will_despawn,
            });

            // 10. Non-piercing or budget reached → stop scanning more
            //     asteroids for this bullet (JS collision.js:278–279).
            if will_despawn {
                break;
            }
        }
    }
}

// ─── Wire-state integration stub (Phase 3) ──────────────────────────
//
// Existing entry point called from `simulate_tick` in `mod.rs`. The real
// wire ↔ sim bridging will land when client prediction wires up; for
// now this is a no-op that satisfies the existing call site. Mirrors
// the matching stub in `asteroid.rs::update_all`.
pub fn detect_and_resolve(_state: &mut GameState, _events: &mut Vec<GameEvent>) {}
