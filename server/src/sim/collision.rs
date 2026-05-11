//! Pair-detection collision step. Rust mirror of `js/sim/collision.js`.
//!
//! This module is the Rust-side companion to the new pure-collision system
//! introduced for the multiplayer server and the client-side prediction
//! engine. It does NOT replace the legacy `js/modules/combat/collision-system.js`
//! solo-gameplay path — that stays the single source of truth for solo
//! gameplay until the prediction wiring (Phase 3) flips over.
//!
//! ─── Scope (Phase 2.5, dispatch 1 + dispatch 2) ──────────────────────
//!
//! Ported here:
//!   - Bullet-vs-asteroid pair detection (`detect_bullet_asteroid_hits`).
//!   - Player-vs-asteroid pair detection (`detect_player_asteroid_hits`).
//!
//! Deferred to follow-up sessions (Phase 2.5, dispatch 3..N):
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
//! The detector takes `CollisionBullet` / `CollisionAsteroid` /
//! `CollisionPlayer` rather than the full `PlayerBullet` / `Asteroid` /
//! `ShipState` structs defined elsewhere. Reasons:
//!
//!   - Decouples the pure step from storage layout. When entities migrate
//!     to SoA pools (plan §"Contiguous storage"), the collision module
//!     won't have to change — the wrapper just maps the pool view into
//!     these small structs.
//!   - The collision check only needs the geometry-and-physics subset of
//!     each entity, not the full lifecycle / FX / range / fade state.
//!   - Enemy bullets and player bullets share `CollisionBullet`, even
//!     though they're different Rust types in `bullet.rs`.
//!
//! Parity fixture: `server/tests/parity_collision.rs`.

use std::collections::HashSet;

use crate::protocol::GameEvent;

use super::state::GameState;

// ─── Constants — Bullet-vs-asteroid pair ────────────────────────────
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

// ─── Constants — Player-vs-asteroid pair ────────────────────────────
//
// Extracted verbatim from `COLLISION_CONFIG` in
// `js/modules/combat/collision-system.js`. Each constant is pinned here
// so the pure step stays self-contained — no legacy-module imports
// leaking into the server / prediction path. Numerical parity with the
// legacy module is enforced by the parity tests.

/// Damage dealt to asteroid when player collides with it. Mirrors
/// `PLAYER_ASTEROID_COLLISION_DAMAGE = 2` in `js/sim/collision.js`.
///
/// Tiny by design: ramming asteroids is intentionally a *bad* strategy.
/// The player gets deflected hard (see `ASTEROID_KNOCKBACK_MULTIPLIER`)
/// and barely chips the rock.
pub const PLAYER_ASTEROID_COLLISION_DAMAGE: f32 = 2.0;

/// Bounce energy retention coefficient (0..1). Mirrors
/// `BOUNCE_RESTITUTION = 0.9` in `js/sim/collision.js`. Used by the
/// generic bounce path; not consumed directly by the player-asteroid
/// pair (which uses the heavier `ASTEROID_KNOCKBACK_MULTIPLIER`).
/// Exposed for parity + future enemy/asteroid-asteroid pair use.
pub const BOUNCE_RESTITUTION: f32 = 0.9;

/// Multiplier for bounce impulse force used by the generic bounce-pair
/// path. Mirrors `BOUNCE_FORCE_MULTIPLIER = 12.0` in `js/sim/collision.js`.
/// Not consumed directly by the player-asteroid pair; exposed for
/// symmetry with the legacy config and upcoming pairs.
pub const BOUNCE_FORCE_MULTIPLIER: f32 = 12.0;

/// Fraction of computed overlap used by the generic bounce-pair
/// separation push. Mirrors `OVERLAP_SEPARATION_RATIO = 0.6` in
/// `js/sim/collision.js`. The player-asteroid pair uses the FULL
/// overlap + `SEPARATION_BUFFER` rather than this ratio — exposed here
/// for parity with the legacy config block.
pub const OVERLAP_SEPARATION_RATIO: f32 = 0.6;

/// Knockback multiplier for player-asteroid collisions. Mirrors
/// `ASTEROID_KNOCKBACK_MULTIPLIER = 22.0` in `js/sim/collision.js`.
///
/// Applied to the normal-projected relative velocity (`dvn / totalMass`)
/// to derive the impulse magnitude that flings the player off the rock.
///
///   player.vel += knockbackAngle * (dvn / (player.mass + asteroid.mass)) * 22.0
pub const ASTEROID_KNOCKBACK_MULTIPLIER: f32 = 22.0;

/// Extra pixels added to the separation distance after computing the
/// overlap. Mirrors `SEPARATION_BUFFER = 6` in `js/sim/collision.js`.
///
/// Ensures the player is moved *past* the surface boundary so the very
/// next tick doesn't re-overlap and re-trigger the collision event.
pub const SEPARATION_BUFFER: f32 = 6.0;

/// Additional velocity push applied to the player along the
/// (asteroid → player) normal when an overlap was resolved. Mirrors
/// `OVERLAP_PUSH_FORCE = 5.0` in `js/sim/collision.js`. Stacks on top
/// of the knockback impulse — the knockback handles the "bounce off"
/// reaction, while this provides a steady outward push to prevent
/// slow-creep re-overlaps.
pub const OVERLAP_PUSH_FORCE: f32 = 5.0;

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
    /// Per-bullet memory of which enemy ids have already been pierced.
    /// DISTINCT from `pierced_asteroid_ids` — different id spaces. A
    /// bullet that pierced asteroid 101 can still hit enemy 101 the same
    /// tick. The piercing BUDGET (`pierced_enemies` counter) is shared
    /// across both Sets — mirrors legacy `bullet.onHit()` semantics
    /// (`js/modules/player/bullet.js:404–418`). JS:
    /// `bullet.piercedEnemyIds: Set<EnemyId|number>`.
    pub pierced_enemy_ids: HashSet<u32>,
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
            pierced_enemy_ids: HashSet::new(),
        }
    }
}

/// Minimal asteroid view for collision detection.
///
/// Mirrors the JS fields read by `detectBulletAsteroidHits` and
/// `detectPlayerAsteroidHits`:
///   `{ id, x, y, vx, vy, radius, active, warping, deathFlash }`.
///
/// `vx` / `vy` are read only by the player-vs-asteroid path (to compute
/// the relative-velocity normal-projection `dvn` for the bounce
/// impulse). The bullet-vs-asteroid path ignores them — asteroids are
/// treated as static from the bullet's perspective.
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
    /// Asteroid velocity. Used by the player-vs-asteroid pair to compute
    /// the relative-velocity normal-projection (`dvn`). Bullet-vs-asteroid
    /// ignores this field.
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    /// Optional explicit mass. When `None`, the player-vs-asteroid pair
    /// falls back to the JS formula `(4/3) · π · r³` (matching the live
    /// `Asteroid` class). Bullet-vs-asteroid ignores this field.
    pub mass: Option<f32>,
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
            vx: 0.0,
            vy: 0.0,
            radius: 30.0,
            mass: None,
            active: true,
            warping: false,
            death_flash: 0,
        }
    }
}

/// Minimal player view for collision detection.
///
/// Mirrors the relevant JS fields read by `detectPlayerAsteroidHits`:
///   `{ id, x, y, vx, vy, radius, mass?, active }`.
///
/// The pure step does NOT read player state outside this struct — no
/// `warping`, no `isDying`, no `_deathFlash` on players (those are
/// enemy / asteroid concerns). The wrapper filters the active roster
/// before handing it to the detector.
///
/// Mass is optional: when `None`, the JS formula `π · r² · 0.5`
/// (matching the live `Player` class) is used as a fallback. The
/// wrapper can override by setting `mass` explicitly to match
/// powerup-modified ship mass on the live side.
#[derive(Debug, Clone, Copy)]
pub struct CollisionPlayer {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    /// Optional explicit mass. `None` ⇒ fallback to `π · r² · 0.5`.
    pub mass: Option<f32>,
    pub active: bool,
}

impl CollisionPlayer {
    /// Construct a fresh player at the origin with a live-game ship
    /// radius of 15 px. Test convenience.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            radius: 15.0,
            mass: None,
            active: true,
        }
    }
}

/// Per-tick context for the collision-detection step. Currently empty —
/// reserved for future extensions (e.g. spatial-grid filter,
/// one-punch-man cheat flag, deterministic RNG handle). Matches the
/// empty-object `ctx` in `js/sim/collision.js`.
///
/// Determinism note: the JS path uses `ctx.rngFloat()` for the
/// player-asteroid bounce jitter; the Rust mirror is deterministic-by-
/// default and treats `rngFloat()` as the centered value 0.5 (yielding
/// zero jitter), matching the parity tests on the JS side which pass
/// `{ rngFloat: () => 0.5 }`.
#[derive(Debug, Clone, Copy, Default)]
pub struct CollisionContext;

/// Events emitted by the collision pair-detection step.
///
/// One variant per pair (currently `BulletHitAsteroid` and
/// `PlayerHitAsteroid`; further pairs land as additional variants when
/// their dispatches port). Field names mirror the JS event keys with
/// snake_case translation.
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
    /// Mirrors `{ type: 'player_hit_asteroid', ... }` in `js/sim/collision.js`.
    ///
    /// Velocity deltas the wrapper applies:
    ///   - `player.vel.x += player_impulse_dx; player.vel.y += player_impulse_dy`
    ///   - `asteroid.vel.x += asteroid_impulse_dx; asteroid.vel.y += asteroid_impulse_dy`
    /// Position deltas the wrapper applies:
    ///   - `player.x += separation_dx; player.y += separation_dy`
    ///
    /// All deltas come from the pure step — no mutation happens here.
    PlayerHitAsteroid {
        player_id: u32,
        asteroid_id: u32,
        damage_to_asteroid: f32,
        player_impulse_dx: f32,
        player_impulse_dy: f32,
        asteroid_impulse_dx: f32,
        asteroid_impulse_dy: f32,
        separation_dx: f32,
        separation_dy: f32,
    },
    /// Mirrors `{ type: 'bullet_hit_enemy', ... }` in `js/sim/collision.js`.
    ///
    /// Structurally identical to `BulletHitAsteroid` (same nine fields) —
    /// the wrapper differentiates by the `enemy_id` field key and dispatches
    /// to enemy-specific side effects (HP damage, death-flash, drops,
    /// boss-rage triggers) rather than the asteroid-side effects.
    BulletHitEnemy {
        bullet_id: u32,
        enemy_id: u32,
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

// ─── Player-vs-asteroid pair detection ──────────────────────────────

/// Player mass fallback formula — mirrors the live `Player` class:
///   `mass = π · r² · 0.5`
/// Called when `CollisionPlayer::mass` is `None`. JS line ref:
/// `js/sim/collision.js:394–398`.
#[inline]
fn player_mass_fallback(radius: f32) -> f32 {
    std::f32::consts::PI * radius * radius * 0.5
}

/// Asteroid mass fallback formula — mirrors the live `Asteroid` class:
///   `mass = (4/3) · π · r³`
/// Called when `CollisionAsteroid::mass` is `None`. JS line ref:
/// `js/sim/collision.js:394–398`.
#[inline]
fn asteroid_mass_fallback(radius: f32) -> f32 {
    (4.0 / 3.0) * std::f32::consts::PI * radius * radius * radius
}

/// Detect player-vs-asteroid collisions for one tick.
///
/// Pure step: reads player + asteroid positions / radii / velocities,
/// decides which pairs overlap, and emits one `PlayerHitAsteroid` event
/// per detected hit with the velocity + position *deltas* the wrapper
/// applies to the live state. This function does NOT mutate player or
/// asteroid — every effect is reported in the event payload for the
/// wrapper / JS mirror to apply downstream.
///
/// Co-op ready: takes a slice of players. The solo wrapper passes a
/// one-element slice; future co-op sessions will pass the full ship
/// roster. Each player is scanned against every active asteroid; one
/// player can emit multiple events per tick if it overlaps multiple
/// rocks simultaneously (e.g. trapped between two boulders).
///
/// Geometry:
///   Circle-circle overlap: `(dx² + dy²) < (player.r + ast.r)²`.
///   JS line refs: `js/sim/collision.js:555–559`.
///
/// Bounce / impulse model (mirrors JS lines 562–593):
///
///   distance      = sqrt(dx² + dy²)         [dx = player.x - asteroid.x]
///   angle         = atan2(dy, dx)           [asteroid → player normal]
///   totalMass     = player.mass + asteroid.mass
///   cosA, sinA    = cos(angle), sin(angle)
///   dvn           = (player.vx - asteroid.vx) · cosA
///                 + (player.vy - asteroid.vy) · sinA
///   enhanced      = (2 · dvn) / totalMass   [0 if totalMass ≤ 0]
///   knockback     = enhanced · ASTEROID_KNOCKBACK_MULTIPLIER
///
///   playerImpulseDx = cos(angle + jitter) · knockback
///   playerImpulseDy = sin(angle + jitter) · knockback
///   asteroidImpulseDx = -knockback · 0.3 · player.mass · cosA
///   asteroidImpulseDy = -knockback · 0.3 · player.mass · sinA
///
/// Determinism / jitter:
///   The JS path uses `ctx.rngFloat() ∈ [0,1)` to derive a jitter
///   angle in `[-π/4, π/4]`. The Rust mirror is deterministic-by-
///   default and uses `rngFloat = 0.5` (i.e. zero jitter), matching
///   the JS tests which pass `{ rngFloat: () => 0.5 }`. When a real
///   RNG is wired into `CollisionContext` later, the jitter formula
///   reactivates without changing this function's signature.
///
/// Separation push (mirrors JS lines 596–607):
///   If `overlap = sumR - distance > 0` and `distance > 0`:
///     - Position delta: unit normal · (overlap + SEPARATION_BUFFER)
///     - Velocity push:  unit normal · OVERLAP_PUSH_FORCE
///     The normal is `(dx/distance, dy/distance)` — pointing from
///     asteroid → player (away from the rock).
///
/// Asteroid damage:
///   Constant `PLAYER_ASTEROID_COLLISION_DAMAGE = 2`. The wrapper
///   subtracts this from `asteroid.hp` and handles death-flash + drops.
///   The pure step just reports the number.
///
/// Skipped pairs (no event emitted):
///   - Inactive player     (`!player.active`)
///   - Inactive asteroid   (`!asteroid.active`)
///   - Warping asteroid    (mid warp-in animation)
///   - Asteroid mid-death  (`asteroid.death_flash > 0`)
pub fn detect_player_asteroid_hits(
    players: &[CollisionPlayer],
    asteroids: &[CollisionAsteroid],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if players.is_empty() || asteroids.is_empty() {
        return;
    }

    for player in players.iter() {
        // 1. Active-guard (JS collision.js:536).
        if !player.active {
            continue;
        }

        let player_radius = player.radius;
        let player_mass = player
            .mass
            .unwrap_or_else(|| player_mass_fallback(player_radius));

        for asteroid in asteroids.iter() {
            // 2. Asteroid gating (JS collision.js:544–552).
            if !asteroid.active {
                continue;
            }
            if asteroid.warping {
                continue;
            }
            if asteroid.death_flash > 0 {
                continue;
            }

            // 3. Circle-circle overlap (JS collision.js:555–559).
            let dx = player.x - asteroid.x;
            let dy = player.y - asteroid.y;
            let sum_r = player_radius + asteroid.radius;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq >= sum_r * sum_r {
                continue;
            }

            // ── Hit detected — compute impulse + separation ──

            let asteroid_mass = asteroid
                .mass
                .unwrap_or_else(|| asteroid_mass_fallback(asteroid.radius));

            // 4. Knockback angle: asteroid → player (JS collision.js:570–573).
            //    Defensive: if centers exactly coincide, fall back to angle = 0.
            let distance = dist_sq.sqrt();
            let knockback_angle = if distance > 0.0 {
                dy.atan2(dx)
            } else {
                0.0
            };

            // 5. Bounce impulse formula (JS collision.js:575–581).
            let total_mass = player_mass + asteroid_mass;
            let cos_a = knockback_angle.cos();
            let sin_a = knockback_angle.sin();
            let dvn = (player.vx - asteroid.vx) * cos_a + (player.vy - asteroid.vy) * sin_a;
            let enhanced_impulse = if total_mass > 0.0 {
                (2.0 * dvn) / total_mass
            } else {
                0.0
            };
            let knockback = enhanced_impulse * ASTEROID_KNOCKBACK_MULTIPLIER;

            // 6. Jitter — deterministic-by-default (JS collision.js:584–587).
            //    JS path: jitterFraction = ctx.rngFloat() OR 0.5;
            //             jitter = (jitterFraction - 0.5) · π/2
            //    Rust mirror has no RNG wired into CollisionContext yet,
            //    so we mirror the "rngFloat = 0.5" centered case ⇒
            //    jitter = 0. Future RNG plumbing fills this in without
            //    changing the signature.
            let jitter: f32 = 0.0;
            let angle_with_jitter = knockback_angle + jitter;

            let mut player_impulse_dx = angle_with_jitter.cos() * knockback;
            let mut player_impulse_dy = angle_with_jitter.sin() * knockback;

            // 7. Asteroid impulse — heavy mass scaler dampens the rock's
            //    reaction (JS collision.js:592–593).
            let asteroid_impulse_dx = -knockback * 0.3 * player_mass * cos_a;
            let asteroid_impulse_dy = -knockback * 0.3 * player_mass * sin_a;

            // 8. Separation push (JS collision.js:596–607).
            //    Pushes the player along the (asteroid → player) unit normal
            //    by (overlap + buffer); also adds OVERLAP_PUSH_FORCE to the
            //    player velocity along the same normal to keep the ship
            //    drifting outward.
            let mut separation_dx = 0.0;
            let mut separation_dy = 0.0;
            let overlap = sum_r - distance;
            if overlap > 0.0 && distance > 0.0 {
                let nx = dx / distance;
                let ny = dy / distance;
                let total_separation = overlap + SEPARATION_BUFFER;
                separation_dx = nx * total_separation;
                separation_dy = ny * total_separation;
                player_impulse_dx += nx * OVERLAP_PUSH_FORCE;
                player_impulse_dy += ny * OVERLAP_PUSH_FORCE;
            }

            // 9. Emit the event (JS collision.js:609–620).
            events.push(CollisionEvent::PlayerHitAsteroid {
                player_id: player.id,
                asteroid_id: asteroid.id,
                damage_to_asteroid: PLAYER_ASTEROID_COLLISION_DAMAGE,
                player_impulse_dx,
                player_impulse_dy,
                asteroid_impulse_dx,
                asteroid_impulse_dy,
                separation_dx,
                separation_dy,
            });
        }
    }
}

// ── BULLET ↔ ENEMY — Phase 2.5 dispatch (this PR) ─────────────
//
// Near-mirror of `detect_bullet_asteroid_hits`. Same circle-circle geometry,
// same piercing-budget mechanics, same event-emission discipline. Key
// differences from the asteroid pair:
//
//   - Target slice is `&[CollisionEnemy]` not `&[CollisionAsteroid]`.
//   - Emits `CollisionEvent::BulletHitEnemy` instead of `BulletHitAsteroid`.
//   - Uses a SEPARATE `pierced_enemy_ids: HashSet<u32>` on the bullet so the
//     same bullet can pierce both asteroids and enemies independently
//     (different id spaces — an asteroid with id=10 and an enemy with id=10
//     are unrelated targets).
//   - The shared piercing counter (`bullet.pierced_enemies`) IS shared
//     across both Sets — mirrors the legacy `bullet.onHit()` semantics
//     where the single counter increments on any pierce regardless of
//     target type.
//
// Reference: `js/sim/collision.js::detectBulletEnemyHits` (lines 789–892
// in PR #38 / current master).
//
// What this module does NOT touch (stays in the wrapper):
//   - Damage application to enemy HP             (legacy: enemy.takeDamage)
//   - Enemy death-flash trigger                  (legacy: enemy._deathFlash = 8)
//   - Drops / coins / experience / kill streak   (legacy: dropOrbsFromEntity)
//   - Boss-rage enrage trigger                   (legacy: boss reactive logic)
//   - Hit-flash visuals, hit-stop, screen shake  (presentation)
//   - Audio events                               (presentation)
//   - Combo / mission hooks                      (game-state)

/// Bullet → enemy knockback impulse multiplier. Mirrors
/// `BULLET_ENEMY_KNOCKBACK = 0.05` in `js/sim/collision.js` (line 673).
///
/// Same numerical value as `BULLET_ASTEROID_KNOCKBACK` — both originate
/// from the single `COLLISION_CONFIG.BULLET_KNOCKBACK = 0.05` constant
/// in `js/modules/combat/collision-system.js`. Exposed as a separate
/// name here for symmetry with the asteroid pair and to allow future
/// per-pair tuning without renaming.
pub const BULLET_ENEMY_KNOCKBACK: f32 = 0.05;

/// Frames the enemy's hit-flash effect runs after a bullet impact.
/// Mirrors `BULLET_ENEMY_HIT_FLASH_FRAMES = 10` in `js/sim/collision.js`
/// (line 686). Same value as `BULLET_ASTEROID_HIT_FLASH_FRAMES` — both
/// originate from `COLLISION_CONFIG.HIT_FLASH_FRAMES = 10` in the legacy
/// module. Presentation concern in the strict sense, but exposed here so
/// the wrapper can set the timer from a single source of truth.
pub const BULLET_ENEMY_HIT_FLASH_FRAMES: u32 = 10;

/// Minimal enemy view for collision detection.
///
/// Mirrors the JS fields read by `detectBulletEnemyHits`:
///   `{ id, x, y, vx, vy, radius, hp, active, warping, deathFlash OR
///      _deathFlash }`.
///
/// `vx` / `vy` / `hp` aren't consumed by the bullet-vs-enemy pair detector
/// today — the pure step only emits an event with the *bullet's* velocity
/// for downstream knockback application; enemy velocity/HP are wrapper
/// concerns. They're carried in the struct anyway for parity with the JS
/// shape (and for use by future pairs like player-vs-enemy and
/// enemy-vs-asteroid that consume them).
///
/// The JS guards `!enemy.active`, `enemy.warping`, and
/// `enemy.deathFlash > 0` collapse into the boolean / counter fields
/// below — the wrapper translates from the live sim-level `Enemy` struct
/// to this view by reading those fields directly. `death_flash`
/// consolidates JS's dual-name (`deathFlash` and `_deathFlash`) into a
/// single counter on the Rust side.
#[derive(Debug, Clone, Copy)]
pub struct CollisionEnemy {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    /// Enemy velocity. Currently unused by `detect_bullet_enemy_hits`
    /// (the bullet velocity drives knockback, not the enemy's). Carried
    /// for parity with the JS shape and future pair-dispatch use.
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    /// Current hit points. Unused by the pair-detection step (the wrapper
    /// applies damage); carried for parity.
    pub hp: f32,
    pub active: bool,
    /// `true` while the enemy is mid-warp-in animation (invulnerable).
    /// JS: `enemy.warping`.
    pub warping: bool,
    /// Frames remaining of mid-death flash. Treated as "skip if > 0".
    /// JS accepts either `deathFlash` or `_deathFlash`; the Rust mirror
    /// collapses both into this single counter.
    pub death_flash: u32,
}

impl CollisionEnemy {
    /// Construct a fresh enemy at the origin with the live HUNTER default
    /// radius of 18 px. Test convenience.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            radius: 18.0,
            hp: 1.0,
            active: true,
            warping: false,
            death_flash: 0,
        }
    }
}

/// Detect bullet-vs-enemy collisions for one tick.
///
/// Pure step: reads bullet + enemy positions/radii, decides which pairs
/// collided, and pushes one `BulletHitEnemy` event per detected hit. The
/// function does NOT mutate enemy state — no damage, no death-flash, no
/// rage trigger — every effect is reported through the event payload for
/// the wrapper to apply downstream.
///
/// Mutation surface on `bullets`:
///   - `pierced_enemy_ids` — Set is mutated; enemy id is inserted on each
///     hit. Carried across ticks so a piercing bullet doesn't re-hit an
///     enemy it has already passed through. DISTINCT from
///     `pierced_asteroid_ids`: different id spaces, different Sets.
///     JS line refs: `js/sim/collision.js:852–855`.
///   - `pierced_enemies` — running counter SHARED with the asteroid pair.
///     Bumped on each hit so subsequent ticks (and the asteroid pair, if
///     it runs after) see the latest value. JS line refs:
///     `js/sim/collision.js:862–863`.
///
/// Iteration order: for each bullet, scan enemies in slice order. The
/// first hit a non-piercing bullet detects becomes its only event for
/// the tick. A bullet with `piercing > 0` may emit up to `piercing + 1`
/// hit events per tick (matching legacy `bullet.onHit` semantics).
///
/// Geometry: circle-circle overlap using squared distance to skip the
/// sqrt. `(dx² + dy²) < (br + er)²`. JS line refs:
/// `js/sim/collision.js:842–846`.
///
/// Skipped pairs (no event emitted):
///   - Inactive bullet            (`!bullet.active`)
///   - Inactive enemy             (`!enemy.active`)
///   - Warping enemy              (`enemy.warping`)
///   - Enemy mid-death-flash      (`enemy.death_flash > 0`)
///   - Enemy already pierced      (id in `bullet.pierced_enemy_ids`)
///   - Piercing budget exhausted  (`bullet.pierced_enemies > bullet.piercing`)
pub fn detect_bullet_enemy_hits(
    bullets: &mut [CollisionBullet],
    enemies: &[CollisionEnemy],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if bullets.is_empty() || enemies.is_empty() {
        return;
    }

    for bullet in bullets.iter_mut() {
        // 1. Active-guard (JS collision.js:795).
        if !bullet.active {
            continue;
        }

        // 2. Piercing-budget exhausted? (JS collision.js:800–813).
        //    A piercing bullet that's already eaten its `piercing + 1`
        //    targets has `pierced_enemies > piercing`. A non-piercing
        //    bullet that's somehow active with prior hits is similarly
        //    guarded defensively (e.g. if the asteroid pair already
        //    consumed its single hit earlier this tick and the wrapper
        //    hasn't flipped `active = false` yet).
        let piercing = bullet.piercing;
        if piercing > 0 && bullet.pierced_enemies > piercing {
            continue;
        }
        if piercing == 0 && bullet.pierced_enemies > 0 {
            continue;
        }

        let bullet_radius = bullet.radius;

        for enemy in enemies.iter() {
            // 3. Enemy gating (JS collision.js:819–830).
            if !enemy.active {
                continue;
            }
            if enemy.warping {
                continue;
            }
            if enemy.death_flash > 0 {
                continue;
            }

            // 4. Already-pierced? (JS collision.js:837–838).
            //    DISTINCT from pierced_asteroid_ids — different id space.
            if bullet.pierced_enemy_ids.contains(&enemy.id) {
                continue;
            }

            // 5. Circle-circle overlap (JS collision.js:842–846).
            let dx = bullet.x - enemy.x;
            let dy = bullet.y - enemy.y;
            let sum_r = bullet_radius + enemy.radius;
            if dx * dx + dy * dy >= sum_r * sum_r {
                continue;
            }

            // ── Hit detected ──

            // 6. Update enemy-pierce tracker (JS collision.js:852–855).
            //    Distinct Set from the asteroid pierce-tracker.
            bullet.pierced_enemy_ids.insert(enemy.id);
            bullet.pierced_enemies += 1;
            let pierced_so_far = bullet.pierced_enemies;

            // 7. Despawn / piercing-remaining decision
            //    (JS collision.js:868–873).
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
            //    non-positive `damage` (0) as the default-1 fallback to
            //    match JS truthy check on a number.
            let damage = if bullet.damage > 0.0 { bullet.damage } else { 1.0 };

            // 9. Emit the event (JS collision.js:875–886).
            events.push(CollisionEvent::BulletHitEnemy {
                bullet_id: bullet.id,
                enemy_id: enemy.id,
                damage,
                bullet_x: bullet.x,
                bullet_y: bullet.y,
                bullet_vx: bullet.vx,
                bullet_vy: bullet.vy,
                bullet_piercing_remaining: piercing_remaining,
                bullet_will_despawn: will_despawn,
            });

            // 10. Non-piercing or budget reached → stop scanning more
            //     enemies for this bullet (JS collision.js:888–889).
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
