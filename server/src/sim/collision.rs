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

use super::drops::DropKind;
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
    /// Mirrors `{ type: 'player_hit_enemy', ... }` in `js/sim/collision.js`.
    ///
    /// IMPORTANT: math model is DIFFERENT from `PlayerHitAsteroid`. The
    /// player-vs-enemy path uses a textbook restitution-based impulse model
    /// (mirrors lines 1753–1794 of `collision-system.js`):
    ///
    ///   impulseScalar  = -(1 + BOUNCE_RESTITUTION) · velAlongNormal
    ///                    / (playerMass + enemyMass)
    ///   playerImpulse  = impulseScalar · normal · enemyMass  · BOUNCE_FORCE_MULTIPLIER
    ///   enemyImpulse   = -impulseScalar · normal · playerMass · BOUNCE_FORCE_MULTIPLIER
    ///
    /// The path BAILS on separating velocities (`velAlongNormal > 0`):
    /// impulse deltas are zero on graze frames, but damage and separation
    /// still fire. Separation is `overlap × OVERLAP_SEPARATION_RATIO` SPLIT
    /// between both bodies (player + enemy each get a mirror-image push).
    /// There is NO `OVERLAP_PUSH_FORCE` velocity nudge — that constant is
    /// asteroid-pair only. There is NO atan2 jitter — fully deterministic.
    ///
    /// Velocity deltas the wrapper applies:
    ///   - `player.vel.x += player_impulse_dx; player.vel.y += player_impulse_dy`
    ///   - `enemy.vel.x  += enemy_impulse_dx;  enemy.vel.y  += enemy_impulse_dy`
    /// Position deltas the wrapper applies:
    ///   - `player.x += separation_dx;       player.y += separation_dy`
    ///   - `enemy.x  += enemy_separation_dx; enemy.y  += enemy_separation_dy`
    ///     (wrapper applies enemy-side only if the enemy wasn't destroyed
    ///     by the damage application earlier in the legacy handler).
    PlayerHitEnemy {
        player_id: u32,
        enemy_id: u32,
        damage_to_enemy: f32,
        player_impulse_dx: f32,
        player_impulse_dy: f32,
        enemy_impulse_dx: f32,
        enemy_impulse_dy: f32,
        /// Player-side position delta (mirror of enemy_separation_*).
        separation_dx: f32,
        separation_dy: f32,
        /// Enemy-side position delta (mirror of player separation_*).
        enemy_separation_dx: f32,
        enemy_separation_dy: f32,
    },
    /// Mirrors `{ type: 'enemy_hit_asteroid', ... }` in `js/sim/collision.js`.
    ///
    /// SMALLEST event in the collision module — exactly 6 fields. No damage
    /// (`damage_*`) and no separation (`separation_*`) variants: this pair
    /// is pure push-impulse along the collision normal, applied to BOTH
    /// bodies' velocities. The legacy path only modifies velocities; the
    /// next-tick simulation moves the bodies apart on its own.
    ///
    /// Velocity deltas the wrapper applies:
    ///   - `enemy.vel.x    += enemy_impulse_dx;    enemy.vel.y    += enemy_impulse_dy`
    ///   - `asteroid.vel.x += asteroid_impulse_dx; asteroid.vel.y += asteroid_impulse_dy`
    ///
    /// Magnitudes are fixed scalars from the legacy `COLLISION_CONFIG`:
    /// `ENEMY_ASTEROID_PUSH = 4` (the enemy's bump, away from the rock) and
    /// `ASTEROID_ENEMY_PUSH = 2` (the rock's bump, away from the enemy).
    /// Direction is purely angular — `atan2(asteroid - enemy)` along the
    /// (enemy → asteroid) collision normal, with the enemy receiving
    /// `(-cos, -sin)` (pushed AWAY from the rock) and the asteroid
    /// receiving `(+cos, +sin)` (pushed AWAY from the enemy). No
    /// jitter / RNG.
    EnemyHitAsteroid {
        enemy_id: u32,
        asteroid_id: u32,
        enemy_impulse_dx: f32,
        enemy_impulse_dy: f32,
        asteroid_impulse_dx: f32,
        asteroid_impulse_dy: f32,
    },
    /// Mirrors `{ type: 'player_hit_by_enemy_bullet', ... }` in
    /// `js/sim/collision.js`. Simplest pair — enemy bullets damage the
    /// player on overlap only. No impulse, no separation, no piercing
    /// budget. Damage default 1 if `bullet.damage <= 0`.
    PlayerHitByEnemyBullet {
        player_id: u32,
        bullet_id: u32,
        damage: f32,
        bullet_x: f32,
        bullet_y: f32,
        bullet_vx: f32,
        bullet_vy: f32,
    },
    /// Mirrors `{ type: 'player_pickup_drop', ... }` in `js/sim/collision.js`.
    ///
    /// Smallest non-damaging event — pickups don't damage the player.
    /// Field count: 6 non-type (7 total including the variant tag).
    /// Intentionally NO `damage` field, NO impulse/separation/piercing fields.
    /// The pure step reports the minimal geometric pickup; wrapper applies
    /// the actual heal/coins/powerup effect (and any upgrade multipliers
    /// like MEDPACK / PAYDAY / HIGH_ROLLER) on top.
    ///
    /// `drop_x` / `drop_y` are the drop's world coordinates at pickup time —
    /// used by the wrapper to spawn the pickup sparkle ring and the
    /// "+N gold" floating text at the drop's location.
    ///
    /// `value` is reported verbatim from `drop.value` (no upgrade scaling
    /// applied pure-side). For powerup drops, `value` encodes the powerup
    /// id the wrapper dispatches into `player.applyPowerup`.
    PlayerPickupDrop {
        player_id: u32,
        drop_id: u32,
        drop_kind: DropKind,
        value: i32,
        drop_x: f32,
        drop_y: f32,
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
    /// Optional explicit mass. Consumed by the player-vs-enemy pair to
    /// scale impulse magnitudes via the textbook restitution formula.
    /// When `None`, the JS code falls back to the same ship-disk formula
    /// used for players (`π · r² · 0.5`), NOT the asteroid `(4/3)π r³`
    /// formula — see `js/sim/collision.js:1131–1133`. The live `Enemy`
    /// class assigns `mass` directly per type, so production code sets
    /// this explicitly; the fallback is for tests and defensive coverage.
    /// Bullet-vs-enemy ignores this field.
    pub mass: Option<f32>,
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
            mass: None,
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

// ── PLAYER ↔ ENEMY — Phase 2.5 ─────────
//
// IMPORTANT: This pair uses DIFFERENT math than `detect_player_asteroid_hits`.
// The legacy `handlePlayerEnemyCollision` (collision-system.js:1657–1819)
// does NOT use the heavier `ASTEROID_KNOCKBACK_MULTIPLIER` + jittered-atan2
// path. Instead it runs a textbook restitution-based impulse model:
//
//   1. Normalize collision direction (player.x - enemy.x, ...) / distance
//   2. relativeVel = player.vel - enemy.vel
//   3. velAlongNormal = relativeVel · normal
//   4. IF velAlongNormal > 0 (separating) → BAIL, no impulse applied
//   5. impulseScalar = -(1 + BOUNCE_RESTITUTION) · velAlongNormal
//                      / (playerMass + enemyMass)
//   6. impulse = impulseScalar · normal
//   7. player.vel += impulse · enemyMass · BOUNCE_FORCE_MULTIPLIER
//   8. enemy.vel  -= impulse · playerMass · BOUNCE_FORCE_MULTIPLIER
//
// Separation uses `OVERLAP_SEPARATION_RATIO × overlap` SPLIT between the
// two bodies (both move, ratio rather than full overlap + buffer); NO
// `OVERLAP_PUSH_FORCE` velocity nudge is applied (asteroid-pair only).
// NO atan2 jitter — fully deterministic.
//
// What stays the same as player-vs-asteroid:
//   - Circle-circle geometry check.
//   - Inactive-side / warping / death-flash skip gates (enemy-side
//     `_deathFlash` is the legacy name; collapsed to `death_flash` in
//     this mirror).
//   - Pure-step discipline: emit one event per hit, never mutate either
//     side's HP / vel / position directly. The wrapper applies the
//     reported deltas.
//
// What does NOT live in this module at all (stays in the wrapper):
//   - Damage application to player.hp / enemy.hp (legacy: takeDamage)
//   - Shield / Bulwark / Phase-Dash damage reduction
//   - Tank consumption / death handling on player HP ≤ 0
//   - Enemy death-flash trigger (_deathFlash = 8) and drops / XP / kills
//   - Boss-rage enrage trigger              (legacy: boss reactive logic)
//   - Hit-flash visuals, hit-stop, camera kick, screen shake, audio
//   - Damage numbers, sparks, post-hit invincibility
//
// Source-of-truth lines in `js/modules/combat/collision-system.js`:
//   - Player-side damage block:      1658–1731
//   - Enemy.takeDamage + death-flash:1733–1751
//   - Bounce / impulse model:        1753–1794
//   - Separation push:               1796–1806
//   - Impact particles:              1809–1815  (presentation only)
//
// JS reference: `js/sim/collision.js::detectPlayerEnemyHits` (lines
// 1089–1209 in PR #40 / current master).

/// Damage dealt to enemy when player collides with it. Mirrors
/// `PLAYER_ENEMY_COLLISION_DAMAGE = 5` in `js/sim/collision.js` (line 957)
/// and `COLLISION_CONFIG.PLAYER_ENEMY_COLLISION_DAMAGE = 5` in
/// `js/modules/combat/collision-system.js` (line 17).
///
/// Higher than the asteroid equivalent (2) but still tiny relative to enemy
/// HP, by design: ramming enemies is intentionally a *bad* strategy — the
/// player gets bounced off (see `BOUNCE_FORCE_MULTIPLIER`) while only
/// chipping the enemy. Killing via collision takes many rams, each
/// costing the player health.
pub const PLAYER_ENEMY_COLLISION_DAMAGE: f32 = 5.0;

// NOTE: `BOUNCE_RESTITUTION` (0.9), `BOUNCE_FORCE_MULTIPLIER` (12.0), and
// `OVERLAP_SEPARATION_RATIO` (0.6) — all consumed by this pair — are
// already declared as `pub const` in the player-vs-asteroid block above.
// We reuse them directly rather than re-exporting under enemy-specific
// aliases; the wrapper / JS mirror uses the same constant values for the
// bounce-pair path regardless of which pair it dispatches. JS mirrors
// this same scoping decision (`js/sim/collision.js` lines 959–964).

/// Detect player-vs-enemy collisions for one tick.
///
/// Pure step: reads player + enemy positions / radii / velocities,
/// decides which pairs overlap, and pushes one `PlayerHitEnemy` event per
/// detected hit with the velocity + position *deltas* the wrapper applies
/// to the live state. Does NOT mutate player or enemy — every effect is
/// reported in the event payload for the wrapper / JS mirror to apply
/// downstream.
///
/// Co-op ready: takes a slice of players. The solo wrapper passes a
/// one-element slice; future co-op sessions will pass the full ship
/// roster. Each player is scanned against every active enemy; one player
/// can emit multiple events per tick if it overlaps multiple enemies
/// simultaneously (e.g. caught in a swarm).
///
/// Geometry:
///   Circle-circle overlap: `(dx² + dy²) < (player.r + enemy.r)²`.
///   JS line refs: `js/sim/collision.js:1117–1121`.
///
/// Bounce / impulse model (mirrors JS lines 1149–1178):
///
///   nx, ny         = (player.x - enemy.x, player.y - enemy.y) / distance
///   relVx, relVy   = (player.vx - enemy.vx, player.vy - enemy.vy)
///   velAlongNormal = relVx · nx + relVy · ny
///
///   IF velAlongNormal > 0  (separating)  →  BAIL — geometry overlap is
///      reported in the event but impulse deltas are all zero. The wrapper
///      still applies damage on these "graze" frames; this matches the
///      legacy behavior where the damage block runs unconditionally on
///      overlap and the bounce block gates on `velAlongNormal > 0`.
///
///   impulseScalar  = -(1 + BOUNCE_RESTITUTION) · velAlongNormal
///                    / (playerMass + enemyMass)
///   impulseX, impulseY = impulseScalar · (nx, ny)
///
///   playerImpulseDx = impulseX · enemyMass  · BOUNCE_FORCE_MULTIPLIER
///   playerImpulseDy = impulseY · enemyMass  · BOUNCE_FORCE_MULTIPLIER
///   enemyImpulseDx  = -impulseX · playerMass · BOUNCE_FORCE_MULTIPLIER
///   enemyImpulseDy  = -impulseY · playerMass · BOUNCE_FORCE_MULTIPLIER
///
/// Determinism:
///   This pair is fully deterministic — NO atan2 jitter, NO RNG
///   consumption, NO `OVERLAP_PUSH_FORCE` velocity nudge. The asteroid
///   pair has all three of those; this pair has none.
///
/// Separation push (mirrors JS lines 1183–1190):
///   If `overlap = sumR - distance > 0`:
///     - separationForce = overlap · OVERLAP_SEPARATION_RATIO
///     - Player position delta: +(nx, ny) · separationForce
///     - Enemy  position delta: -(nx, ny) · separationForce  (mirror)
///   Both bodies move; ratio rather than `overlap + SEPARATION_BUFFER`.
///
/// Enemy damage:
///   Constant `PLAYER_ENEMY_COLLISION_DAMAGE = 5`. The wrapper subtracts
///   this from `enemy.hp` and handles death-flash + drops + kill streak.
///   The pure step just reports the number. Damage runs unconditionally
///   on geometric overlap, even on graze frames (separating velocities).
///
/// Skipped pairs (no event emitted):
///   - Inactive player    (`!player.active`)
///   - Inactive enemy     (`!enemy.active`)
///   - Warping enemy      (`enemy.warping`)
///   - Enemy mid-death    (`enemy.death_flash > 0`)
///
/// NOTE: Unlike asteroids, players themselves have no `_deathFlash` /
/// `warping` gate on the player side — the legacy path only checks
/// `player.active` (and the wrapper handles `player.invincible` as a
/// damage-reduction layer, not a collision skip). The pure step matches
/// that: invincibility is a wrapper concern, not a geometry concern.
pub fn detect_player_enemy_hits(
    players: &[CollisionPlayer],
    enemies: &[CollisionEnemy],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if players.is_empty() || enemies.is_empty() {
        return;
    }

    for player in players.iter() {
        // 1. Active-guard (JS collision.js:1095).
        if !player.active {
            continue;
        }

        let player_radius = player.radius;
        let player_vx = player.vx;
        let player_vy = player.vy;
        let player_mass = player
            .mass
            .unwrap_or_else(|| player_mass_fallback(player_radius));

        for enemy in enemies.iter() {
            // 2. Enemy gating (JS collision.js:1104–1114).
            if !enemy.active {
                continue;
            }
            if enemy.warping {
                continue;
            }
            if enemy.death_flash > 0 {
                continue;
            }

            // 3. Circle-circle overlap (JS collision.js:1117–1121).
            let dx = player.x - enemy.x;
            let dy = player.y - enemy.y;
            let sum_r = player_radius + enemy.radius;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq >= sum_r * sum_r {
                continue;
            }

            // ── Hit detected — compute impulse + separation ──

            // 4. Enemy mass — explicit when set, else the same ship-disk
            //    formula used for players (JS collision.js:1131–1133).
            //    Note that the JS code falls back to `entityMass(., 'player')`
            //    for enemies without explicit mass, NOT the asteroid formula.
            let enemy_mass = enemy
                .mass
                .unwrap_or_else(|| player_mass_fallback(enemy.radius));

            let distance = dist_sq.sqrt();

            // Default deltas to zero so a degenerate (distance == 0) hit
            // still emits a well-formed event with the correct ids +
            // damage but no nonsense math.
            let mut player_impulse_dx: f32 = 0.0;
            let mut player_impulse_dy: f32 = 0.0;
            let mut enemy_impulse_dx: f32 = 0.0;
            let mut enemy_impulse_dy: f32 = 0.0;
            let mut separation_dx: f32 = 0.0;
            let mut separation_dy: f32 = 0.0;
            let mut enemy_separation_dx: f32 = 0.0;
            let mut enemy_separation_dy: f32 = 0.0;

            if distance > 0.0 {
                // 5. Normalize the collision axis (enemy → player).
                let nx = dx / distance;
                let ny = dy / distance;

                // 6. Relative velocity, projected onto the normal
                //    (JS collision.js:1155–1157).
                let rel_vx = player_vx - enemy.vx;
                let rel_vy = player_vy - enemy.vy;
                let vel_along_normal = rel_vx * nx + rel_vy * ny;

                // 7. Only apply impulse when bodies are approaching (the
                //    textbook "do not resolve separating velocities"
                //    guard). Mirrors JS `if (velAlongNormal <= 0)` at
                //    line 1165. NOTE the asymmetry with the asteroid
                //    pair: the asteroid path NEVER gates here, it always
                //    applies the jittered knockback.
                if vel_along_normal <= 0.0 {
                    let total_mass = player_mass + enemy_mass;
                    if total_mass > 0.0 {
                        let impulse_scalar =
                            -(1.0 + BOUNCE_RESTITUTION) * vel_along_normal / total_mass;
                        let impulse_x = impulse_scalar * nx;
                        let impulse_y = impulse_scalar * ny;

                        player_impulse_dx = impulse_x * enemy_mass * BOUNCE_FORCE_MULTIPLIER;
                        player_impulse_dy = impulse_y * enemy_mass * BOUNCE_FORCE_MULTIPLIER;
                        enemy_impulse_dx = -impulse_x * player_mass * BOUNCE_FORCE_MULTIPLIER;
                        enemy_impulse_dy = -impulse_y * player_mass * BOUNCE_FORCE_MULTIPLIER;
                    }
                }

                // 8. Separation push — applied independent of the
                //    velAlongNormal gate (JS collision.js:1183–1190).
                //    Both bodies move; ratio rather than overlap + buffer.
                let overlap = sum_r - distance;
                if overlap > 0.0 {
                    let separation_force = overlap * OVERLAP_SEPARATION_RATIO;
                    separation_dx = nx * separation_force;
                    separation_dy = ny * separation_force;
                    enemy_separation_dx = -nx * separation_force;
                    enemy_separation_dy = -ny * separation_force;
                }
            }

            // 9. Emit the event (JS collision.js:1193–1206).
            events.push(CollisionEvent::PlayerHitEnemy {
                player_id: player.id,
                enemy_id: enemy.id,
                damage_to_enemy: PLAYER_ENEMY_COLLISION_DAMAGE,
                player_impulse_dx,
                player_impulse_dy,
                enemy_impulse_dx,
                enemy_impulse_dy,
                separation_dx,
                separation_dy,
                enemy_separation_dx,
                enemy_separation_dy,
            });
        }
    }
}

// ── ENEMY ↔ ASTEROID — Phase 2.5 ──────
//
// `detect_enemy_asteroid_hits` is the fifth pure-step pair, extracted from
// `handleEnemyAsteroidCollision` in `js/modules/combat/collision-system.js`
// (lines 1898–1944). UNIQUE among the five pairs so far — every prior
// pair either dealt damage, ran restitution math, applied position
// separation, or jittered the impulse via RNG. This pair does NONE of
// those things:
//
//   - NO damage to either side. Period. Enemies don't lose HP when they
//     bump asteroids; asteroids don't lose HP either. The wrapper does
//     not call `take_damage` on either body. (Legacy explicit code
//     comment at line 1943: "No enemy destruction from asteroid
//     collisions".)
//   - NO restitution / mass-aware impulse math. Just two fixed-force
//     scalar pushes, one per body, along the collision normal.
//   - NO position separation. The legacy path only modifies velocities;
//     the next-tick simulation will move the bodies apart on its own.
//   - NO jitter / RNG. Fully deterministic.
//
// Event shape: exactly 6 fields (enemy_id, asteroid_id, and the 2×2
// impulse delta block). NO `damage_*` fields. NO `separation_*` fields.
// Smallest event in the collision module so far.
//
// What stays the same as the prior pairs:
//   - Circle-circle geometry check (squared-distance compare).
//   - Inactive-side / warping / death-flash skip gates (asteroid side
//     only — enemies don't get a death-flash gate here; mirrors legacy).
//   - Pure-step discipline: emit one event per overlap, never mutate
//     either side directly. The wrapper applies the reported deltas.
//
// What does NOT live in this module at all (wrapper concerns):
//   - Hit-flash visuals, audio, particles                (presentation)
//   - Wave / boss / mission hooks                        (game-state)
//   - Velocity application to enemy.vel / asteroid.vel   (wrapper)
//
// JS reference: `js/sim/collision.js::detectEnemyAsteroidHits` (lines
// 1394–1460 in PR #44 / current master).

/// Push force applied to the ENEMY in an enemy-asteroid collision.
/// Mirrors `COLLISION_CONFIG.ENEMY_ASTEROID_PUSH = 4` (line 38 of
/// `js/modules/combat/collision-system.js`) and the matching JS const
/// in `js/sim/collision.js`. The enemy is bumped AWAY from the
/// asteroid along the collision normal:
///
///   `enemy.vel += (asteroid → enemy unit) · ENEMY_ASTEROID_PUSH`
///
/// Larger than `ASTEROID_ENEMY_PUSH` (4 vs 2) because enemies are
/// lighter than asteroids in the live game — to make the bump *visible*
/// on the enemy side, the legacy tuning gives them a stronger kick.
pub const ENEMY_ASTEROID_PUSH: f32 = 4.0;

/// Push force applied to the ASTEROID in an enemy-asteroid collision.
/// Mirrors `COLLISION_CONFIG.ASTEROID_ENEMY_PUSH = 2` (line 40 of
/// `js/modules/combat/collision-system.js`) and the matching JS const
/// in `js/sim/collision.js`. The asteroid is bumped AWAY from the
/// enemy along the collision normal:
///
///   `asteroid.vel += (enemy → asteroid unit) · ASTEROID_ENEMY_PUSH`
///
/// Smaller than `ENEMY_ASTEROID_PUSH` (2 vs 4) because asteroids are
/// heavier — the same momentum exchange yields a smaller velocity
/// change on the massive rock side.
pub const ASTEROID_ENEMY_PUSH: f32 = 2.0;

/// Detect enemy-vs-asteroid collisions for one tick.
///
/// Pure step: reads enemy + asteroid positions / radii, decides which
/// pairs overlap, and pushes one `EnemyHitAsteroid` event per detected
/// hit with the velocity deltas the wrapper applies to the live state.
/// Does NOT mutate enemy or asteroid — every effect is reported in the
/// event payload for the wrapper / JS mirror to apply downstream.
///
/// Geometry:
///   Circle-circle overlap: `(dx² + dy²) < (enemy.r + asteroid.r)²`.
///   JS line refs: `js/sim/collision.js:1419–1424`.
///
/// Push direction (mirrors JS lines 1440–1447):
///
///   angle              = atan2(asteroid.y - enemy.y, asteroid.x - enemy.x)
///   cosA, sinA         = cos(angle), sin(angle)
///
///   enemyImpulseDx     = -cosA · ENEMY_ASTEROID_PUSH
///   enemyImpulseDy     = -sinA · ENEMY_ASTEROID_PUSH
///     (enemy pushed AWAY from asteroid — negative direction)
///
///   asteroidImpulseDx  = +cosA · ASTEROID_ENEMY_PUSH
///   asteroidImpulseDy  = +sinA · ASTEROID_ENEMY_PUSH
///     (asteroid pushed AWAY from enemy — positive direction)
///
/// Determinism: fully deterministic — NO atan2 jitter, NO RNG, NO
/// restitution model, NO mass-aware scaling.
///
/// Damage / separation: this pair emits NEITHER. The event has exactly
/// 6 fields: two ids + four impulse components. Subsequent ticks of the
/// sim move the bodies apart via the applied velocity deltas; no
/// position correction is performed here.
///
/// Skipped pairs (no event emitted):
///   - Inactive enemy        (`!enemy.active`)
///   - Inactive asteroid     (`!asteroid.active`)
///   - Warping enemy         (`enemy.warping`, mid warp-in animation)
///   - Warping asteroid      (`asteroid.warping`, mid warp-in animation)
///   - Asteroid mid-death    (`asteroid.death_flash > 0`)
///   - Coincident centers    (`distance == 0`; defensive skip — atan2
///                            would return 0 deterministically but the
///                            push direction is undefined, so we mirror
///                            the legacy `distance > 0` gate)
///
/// NOTE: There is NO `enemy.death_flash` gate on the enemy side. The
/// legacy `handleEnemyAsteroidCollision` is only invoked when an enemy
/// is mid-collision with an asteroid; an enemy mid-death-flash will
/// already have `active = false` flipped elsewhere, so the active gate
/// covers it. We stay faithful to legacy behavior and don't add a
/// separate enemy-side death-flash gate.
pub fn detect_enemy_asteroid_hits(
    enemies: &[CollisionEnemy],
    asteroids: &[CollisionAsteroid],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if enemies.is_empty() || asteroids.is_empty() {
        return;
    }

    for enemy in enemies.iter() {
        // 1. Enemy gating (JS collision.js:1400–1401).
        if !enemy.active {
            continue;
        }
        if enemy.warping {
            continue;
        }

        let enemy_radius = enemy.radius;

        for asteroid in asteroids.iter() {
            // 2. Asteroid gating (JS collision.js:1407–1417).
            if !asteroid.active {
                continue;
            }
            if asteroid.warping {
                continue;
            }
            if asteroid.death_flash > 0 {
                continue;
            }

            // 3. Circle-circle overlap (JS collision.js:1420–1424).
            let dx = asteroid.x - enemy.x;
            let dy = asteroid.y - enemy.y;
            let sum_r = enemy_radius + asteroid.radius;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq >= sum_r * sum_r {
                continue;
            }

            // 4. Defensive coincident-center skip (JS collision.js:1431).
            //    atan2(0, 0) returns 0 deterministically — not NaN — but
            //    the push direction is meaningless, so we skip rather
            //    than emit a degenerate east-pointing bump. Mirrors the
            //    legacy `if (distance > 0)` gate at line 1906 of
            //    collision-system.js.
            if dist_sq == 0.0 {
                continue;
            }

            // ── Hit detected — compute push impulse ──
            //
            // `angle` points from enemy → asteroid (the collision axis
            // measured from the enemy's perspective). Enemy gets pushed
            // along the NEGATIVE of this axis (away from asteroid);
            // asteroid gets pushed along the POSITIVE axis (away from
            // enemy).
            let angle = dy.atan2(dx);
            let cos_a = angle.cos();
            let sin_a = angle.sin();

            let enemy_impulse_dx = -cos_a * ENEMY_ASTEROID_PUSH;
            let enemy_impulse_dy = -sin_a * ENEMY_ASTEROID_PUSH;
            let asteroid_impulse_dx = cos_a * ASTEROID_ENEMY_PUSH;
            let asteroid_impulse_dy = sin_a * ASTEROID_ENEMY_PUSH;

            // 5. Emit the event (JS collision.js:1449–1457).
            events.push(CollisionEvent::EnemyHitAsteroid {
                enemy_id: enemy.id,
                asteroid_id: asteroid.id,
                enemy_impulse_dx,
                enemy_impulse_dy,
                asteroid_impulse_dx,
                asteroid_impulse_dy,
            });
        }
    }
}

// ── PLAYER ↔ ENEMY-BULLET — Phase 2.5 ──────
//
// `detect_player_enemy_bullet_hits` is the 6th pure-step pair. Enemy
// bullets damage the player on geometric overlap. Simplest pair so far:
//   - NO impulse to either side
//   - NO separation
//   - NO piercing budget (enemy bullets are never piercing)
//   - NO warping/death-flash skip-gates (bullets are flight-or-despawned;
//     players have no such state in the sim layer)
//
// What the pure step DOES: circle-circle overlap + emit one
// `PlayerHitByEnemyBullet` event per detected hit, carrying `damage`
// (default 1 if `bullet.damage <= 0`, mirroring JS `bullet.damage || 1`),
// `bullet_id` for wrapper-side despawn, and bullet position + velocity
// at impact for wrapper-side hit-flash localization + shrapnel.
//
// What stays in the wrapper:
//   - Invincibility / phase-dash check
//   - Effective-shield reduction (damage · (1 - shield/100))
//   - Bulwark / IRON_WILL reduction (0.5× / 0.65×)
//   - Final HP application + tank consumption
//   - Damage numbers, hit-flash visuals, screen shake, hitstop
//   - Stat tracking, kill-streak break, XP grant
//   - Per-pattern hit SFX
//   - Bullet despawn (every enemy-bullet hit despawns; no flag needed)
//
// Reference: `js/sim/collision.js::detectPlayerEnemyBulletHits` (PR #47).

/// Minimal enemy-bullet view for collision detection. Separate from
/// `CollisionBullet` (which represents player bullets with piercing
/// state) — enemy bullets are simpler with no piercing.
#[derive(Debug, Clone, Copy)]
pub struct CollisionEnemyBullet {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    pub damage: f32,
    pub active: bool,
}

impl CollisionEnemyBullet {
    /// Construct a fresh enemy bullet at the origin with live-game defaults.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            radius: 9.0,
            damage: 2.0,
            active: true,
        }
    }
}

/// Detect player-vs-enemy-bullet collisions for one tick.
///
/// Pure step: emits one `PlayerHitByEnemyBullet` event per overlap.
/// Co-op ready: scans every active player against every active bullet.
///
/// Skip-gates: `!player.active`, `!bullet.active`. No warping or
/// death-flash gates. Damage default = 1 if `bullet.damage <= 0`.
pub fn detect_player_enemy_bullet_hits(
    players: &[CollisionPlayer],
    bullets: &[CollisionEnemyBullet],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if players.is_empty() || bullets.is_empty() {
        return;
    }

    for player in players.iter() {
        if !player.active {
            continue;
        }

        let player_radius = player.radius;

        for bullet in bullets.iter() {
            if !bullet.active {
                continue;
            }

            let dx = player.x - bullet.x;
            let dy = player.y - bullet.y;
            let sum_r = player_radius + bullet.radius;
            if dx * dx + dy * dy >= sum_r * sum_r {
                continue;
            }

            let damage = if bullet.damage > 0.0 { bullet.damage } else { 1.0 };

            events.push(CollisionEvent::PlayerHitByEnemyBullet {
                player_id: player.id,
                bullet_id: bullet.id,
                damage,
                bullet_x: bullet.x,
                bullet_y: bullet.y,
                bullet_vx: bullet.vx,
                bullet_vy: bullet.vy,
            });
        }
    }
}

// ── PLAYER ↔ DROP PICKUP — Phase 2.5 ──────
//
// `detect_player_drop_pickups` is the 7th pure-step pair. Players pick up
// drops (health orbs, money shapes, money pixels, powerup orbs) on
// geometric overlap. Smallest non-damaging event — pickups don't damage
// the player.
//
// What the pure step does NOT include:
//   - NO impulse (drops don't bounce off the ship; they get consumed)
//   - NO separation (consumed drops vanish)
//   - NO piercing budget (drops aren't bullets)
//   - NO warping/death-flash skip-gates (drops fade out via lifetime in
//     drops.rs — `active` flips off when life expires)
//
// What the pure step DOES: circle-circle overlap + emit one
// `PlayerPickupDrop` event per detected overlap, carrying `drop_id` for
// wrapper-side despawn, `drop_kind` for wrapper-side effect dispatch
// (health → heal, money_* → coins, powerup → applyPowerup), `value` for
// the heal-amount / coin-count / powerup-id, and `drop_x` / `drop_y` for
// the wrapper-side sparkle-ring particle spawn at the pickup site.
//
// What stays in the wrapper:
//   - Actual HP / coins / powerup application
//   - Upgrade multipliers (MEDPACK, DOCTOR, PAYDAY, HIGH_ROLLER)
//   - Drop deactivation + pool release
//   - Pickup sparkle FX + floating text
//   - Stat tracking, sound effects
//   - Two-player conflict resolution (pure step emits one event per
//     (player, drop) overlap; wrapper picks the winner)
//
// Reference: `js/sim/collision.js::detectPlayerDropPickups` (PR #52).

/// Minimal drop view for collision detection. Separate from the full
/// `sim::drops::Drop` (which carries velocity / lifetime / opacity /
/// parallax) — pickup detection only needs position, radius, and the
/// per-pickup payload (kind + value).
///
/// Mirrors the `DropState` typedef in `js/sim/state.js` line 274+ but
/// reduced to the collision-relevant subset.
#[derive(Debug, Clone, Copy)]
pub struct CollisionDrop {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub kind: DropKind,
    /// Heal-amount (for `Health` drops), coin-count (for `Money*` drops),
    /// or powerup-id (for `Powerup` drops). Reported verbatim in the
    /// pickup event — wrapper applies upgrade multipliers downstream.
    pub value: i32,
    pub active: bool,
}

impl CollisionDrop {
    /// Construct a fresh drop at the origin with live-game defaults.
    /// `radius = 14` matches the JS test helper `dropOrb`'s default and
    /// the live-game `Drop` class. `value = 1` is the minimal positive
    /// integer (heal-amount or coin-count of 1).
    pub fn fresh(id: u32, kind: DropKind) -> Self {
        Self {
            id,
            x: 0.0,
            y: 0.0,
            radius: 14.0,
            kind,
            value: 1,
            active: true,
        }
    }
}

/// Detect player-vs-drop pickup overlaps for one tick.
///
/// Pure step: emits one `PlayerPickupDrop` event per (player, drop)
/// overlap. Co-op ready: scans every active player against every active
/// drop, so a single drop near two ships emits TWO events (one per
/// player); the wrapper resolves which player claims it.
///
/// Geometry: circle-circle overlap `(dx² + dy²) < (player.r + drop.r)²`.
/// Squared form avoids the sqrt. JS line refs: `js/sim/collision.js:1810–1814`.
///
/// Skip-gates: `!player.active`, `!drop.active`. NO warping or
/// death-flash gates — drops fade out via lifetime in `drops.rs`
/// (`active` flips off when `life` reaches 0).
///
/// The function does NOT mutate `drop.active`, does NOT apply HP / coins /
/// powerups, and does NOT release the drop back to its pool. All of that
/// is wrapper-side work dispatched on `drop_kind`.
pub fn detect_player_drop_pickups(
    players: &[CollisionPlayer],
    drops: &[CollisionDrop],
    _ctx: &CollisionContext,
    events: &mut Vec<CollisionEvent>,
) {
    if players.is_empty() || drops.is_empty() {
        return;
    }

    for player in players.iter() {
        // 1. Active-guard (JS collision.js:1798).
        if !player.active {
            continue;
        }

        let player_radius = player.radius;

        for drop in drops.iter() {
            // 2. Drop gating (JS collision.js:1805).
            if !drop.active {
                continue;
            }

            // 3. Circle-circle overlap (JS collision.js:1810–1814).
            let dx = player.x - drop.x;
            let dy = player.y - drop.y;
            let sum_r = player_radius + drop.radius;
            if dx * dx + dy * dy >= sum_r * sum_r {
                continue;
            }

            // 4. Emit the pickup event (JS collision.js:1822–1830).
            //    NO mutation of `drop.active` — wrapper handles that.
            events.push(CollisionEvent::PlayerPickupDrop {
                player_id: player.id,
                drop_id: drop.id,
                drop_kind: drop.kind,
                value: drop.value,
                drop_x: drop.x,
                drop_y: drop.y,
            });
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
