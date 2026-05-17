//! Enemy AI + movement — Phase 2 port (HUNTER only).
//!
//! Mirrors a SIMPLIFIED slice of `js/sim/enemy.js::updateEnemy()` for the
//! HUNTER kind only. The full `updateEnemy` (391 lines) dispatches across
//! 10 enemy types, 6 event types, multiple movement strategies, boss-rage
//! mechanics, late-wave AI throttle, line-of-sight checks, screen-size
//! shooting ranges, music-sync shield rotation, micro-movements, fish-like
//! motion, light trails, and torus wraparound. None of that is in scope
//! for THIS port — see "Deferred" below.
//!
//! The HUNTER chase implemented here is the **simplified** chase from
//! `js/modules/enemy/movement.js::chasePlayer()` standard branch
//! (lines 73–97), NOT the production `hunter_arc` movement
//! (`movement.js::hunterArcMovement()`, lines 806–901). The real
//! HUNTER's `hunter_arc` uses sticky per-spawn random state, frameClock
//! timestamps, vortex-paced angular speed, slingshot contractions, and
//! perpendicular weave — none of which is parity-friendly without a
//! deeper RNG/clock contract. Once the wider sim has a deterministic
//! frameClock + RNG plumbed through the per-tick context, the
//! `hunter_arc` port can replace the simplified chase here.
//!
//! ── What lives here ─────────────────────────────────────────────────
//!   - `Enemy` struct (HUNTER-relevant fields only)
//!   - `EnemyKind` enum (HUNTER only)
//!   - `EnemyContext<'a>` per-tick context bag (with `frame_clock_ms`
//!     + `rng` plumbing reserved for `hunter_arc`; see "RNG / frameClock
//!     plumbing" below)
//!   - `ShipPosition` minimal ship slice (avoids dragging wire-format
//!     `ShipState` into the sim)
//!   - `EnemyEvent` / `BulletPattern` event surface (single-shot only)
//!   - `update_enemy` pure step: chase + cooldown-gated single-shot fire
//!   - `update_enemies` loop helper
//!   - HUNTER constants (speed, hp, fire cooldown) verbatim from
//!     `js/modules/enemy/enemy-data.js` and
//!     `js/modules/core/constants.js`
//!
//! ── RNG / frameClock plumbing (2026-05-10) ───────────────────────────
//!
//! `EnemyContext` now carries `frame_clock_ms: u64` and
//! `rng: Option<&'a mut Pcg64>` — the deterministic clock + RNG that the
//! production HUNTER `hunter_arc` movement (`movement.js:806-901`) needs
//! for its sticky per-spawn random init, lunge dice, and slingshot
//! contractions. **Neither field is read by `update_enemy` today** —
//! the simplified chase is the only branch that runs.
//!
//! The fields are wired now so:
//!   1. The wrapper / call sites already have somewhere to plug in a
//!      seeded `Pcg64` + ms-precision clock (no signature churn when
//!      `hunter_arc` lands).
//!   2. The parity fixture
//!      `parity_enemy::hunter_chase_with_ctx_plumbing` proves that
//!      populating these fields with non-default values does NOT alter
//!      the chase output today (same invariant agent F established for
//!      `wave::WaveContext` in PR #28).
//!
//! **JS-side limitation**: `hunter_arc` consumes `Math.random()` (the
//! global, non-seedable JS RNG) and `frameClock.now` (a session-local
//! ms counter). Cross-language byte-for-byte parity is **impossible
//! without harmonizing JS-side onto a deterministic Pcg64 + injected
//! clock**. The plumbing landing here is the Rust half of that
//! contract; the JS half (a `ctx.rng` + `ctx.now` argument threaded
//! into `hunterArcMovement` instead of the global reads) is deferred
//! to a follow-up session — see `docs/Multiplayer Rust Client Engine
//! – 2026-05-07.md` §"Phase 2.1 RNG harmonization".
//!
//! ── Deferred (Phase 2.1+) ───────────────────────────────────────────
//!
//! Enemy kinds (all 9 non-Hunter):
//!   - GUARDIAN (square movement, guardian_spread firing)
//!   - WASP (wasp_zigzag movement, wasp_machinegun firing)
//!   - STALKER (arc movement, charged_laser firing)
//!   - DRIFTER (drifter_wave movement, arc_lightning firing)
//!   - PROWLER (keep_distance movement, missile firing)
//!   - WEAVER (weaver_spinup movement, spiral_laser firing)
//!   - SENTINEL (weaver_spinup movement, sentinel_sweep firing)
//!   - TANGERINE / Bomber (chase movement, lay_mine firing)
//!   - TITAN (boulder movement, sweep_laser firing)
//!
//! Event types (5 of 6, only single-shot fire is implemented):
//!   - `enemy_debris_burst` — JS enemy.js:125 (death animation)
//!   - `enemy_fire_continuous` — JS enemy.js:320,324,328 (wasp_machinegun,
//!     sweep_laser, sentinel_sweep)
//!   - `enemy_fire_charging` — JS enemy.js:365 (laser, arc_lightning)
//!   - `enemy_fire_burst` — JS enemy.js:359 (burst_3, burst_2,
//!     square_burst, hunter_single)
//!   - `enemy_death_recycle` — JS enemy.js:270 (post-death pool recycle)
//!
//! Enemy struct fields skipped (will be added when the corresponding
//! behavior gets ported):
//!   - `_arcDirection`, `_arcRadius`, `_arcAngle`, `_arcOmega`,
//!     `_arcLungeUntil`, `_arcLungeRollAt`, `_arcSlingUntil`,
//!     `_arcSlingRollAt`, `_arcWeavePhase` — hunter_arc state
//!   - `triangleBurstState`, `triangleBurstTimer`,
//!     `triangleBurstDuration`, `burstDirection`, `burstStartPos`,
//!     `burstDistance` — triangle/wasp burst state
//!   - `_deathFlash`, `_deathFlashMax`, `_debrisBurstFired` —
//!     death sequence
//!   - `warping`, `updateWarpIn` — entry animation
//!   - `isBoss`, `bossPhase`, `_aiOffset` — boss tier mechanics
//!   - `currentTarget`, `targetPlayer` — multi-target priority
//!   - `tankState`, `canShoot` — tank/arc movement gates
//!   - `shield`, `lightTrail` — visual systems
//!   - `mass`, `radius` (currently we use a fixed radius for HUNTER)
//!
//! Behavior simplifications vs JS:
//!   - JS uses `frameClock.now` (ms since simulation start) for fire
//!     timestamps + lunge dice. Rust uses dt-accumulated cooldown
//!     countdown — semantically equivalent for the simple-chase /
//!     simple-fire path but **divergent** from the real HUNTER's
//!     burst-pattern + lunge logic.
//!   - JS standard chase adds a per-tick weave term via `Math.sin(now *
//!     0.002 + this.x * 0.01)`. The simplified port omits the weave
//!     because that depends on frameClock + the enemy's x-coord which
//!     are inputs the deferred branches need. The parity fixture has
//!     ship and enemy on a single line so the chase is purely radial
//!     and the weave (perpendicular) wouldn't change the radial result
//!     anyway — but for arbitrary inputs the divergence is real.
//!   - JS heavy-AI block (evasion, asteroid-avoid, distance-keep,
//!     bullet-dodge) skipped entirely. Same for tier-3/4 boss formation.
//!   - JS shooting decision gates on screen size, line-of-sight,
//!     aim tolerance, burst pipeline — all skipped. Rust just decrements
//!     a cooldown timer and emits a single-shot event when it hits 0.
//!
//! Parity fixture: `server/tests/parity_enemy.rs::hunter_basic_chase`.

use crate::protocol::{EnemyState, GameEvent, ShipState};
use rand_pcg::Pcg64;

// ── Constants copied verbatim from JS sources ─────────────────────────────
//
// JS: `TICK_SCALE: 30 / 60` (constants.js:116).
// Position deltas are scaled by this factor each tick to convert
// frame-based velocity (calibrated at 30 Hz) to logic ticks (60 Hz).
pub const TICK_SCALE: f32 = 30.0 / 60.0;

// JS: HUNTER `speed: 2.6` (enemy-data.js:16).
// Maximum velocity magnitude (px/tick) before the chase clamps.
pub const HUNTER_SPEED: f32 = 2.6;

// JS: HUNTER `health: 5` (enemy-data.js:11).
// Base HP at level 1 (level scaling from `initializeEnemy` is deferred).
pub const HUNTER_HP: f32 = 5.0;

// JS: HUNTER `size: 32` (enemy-data.js:17).
// Visual + collision radius at level 1 (level-based scaling deferred).
pub const HUNTER_RADIUS: f32 = 32.0;

// JS: standard chase `acceleration = 0.012` (movement.js:79).
// Per-tick acceleration applied to velocity along the chase direction.
pub const CHASE_ACCEL: f32 = 0.012;

// JS: standard chase `maxSpeed = this.config.speed * 1.08` (movement.js:92).
// Velocity cap multiplier for the standard chase. HUNTER's effective cap is
// `HUNTER_SPEED * CHASE_SPEED_CAP_MULT = 2.808 px/tick`.
pub const CHASE_SPEED_CAP_MULT: f32 = 1.08;

// JS: HUNTER firing cooldown range `MIN: 600, MAX: 2200` ms (constants.js:187).
// `getEnemyFiringCooldown('HUNTER', level)` interpolates MAX→MIN as level
// rises 1→10. We expose both so callers can mirror the level-scaling.
pub const HUNTER_FIRE_COOLDOWN_MIN_MS: f32 = 600.0;
pub const HUNTER_FIRE_COOLDOWN_MAX_MS: f32 = 2200.0;

// ── Types ────────────────────────────────────────────────────────────────

/// Enemy kind discriminator. HUNTER only for Phase 2; the other 9 kinds
/// (Guardian, Wasp, Stalker, Drifter, Prowler, Weaver, Sentinel,
/// Tangerine, Titan) land in follow-up sessions — see module docstring.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnemyKind {
    Hunter,
    // TODO Phase 2.1+: Guardian, Wasp, Stalker, Drifter, Prowler, Weaver,
    // Sentinel, Tangerine, Titan. Each adds a movement-pattern dispatch
    // branch in `update_enemy` plus its own struct field set.
}

/// Bullet emission pattern. Single-shot only for HUNTER's simplified
/// fire path. The full set (`hunter_single` burst, `wasp_machinegun`,
/// `sweep_laser`, `sentinel_sweep`, `charged_laser`, `arc_lightning`,
/// `missile`, `lay_mine`, `spiral_laser`, `guardian_spread`,
/// `square_burst`, `burst_2`, `burst_3`) lands with the corresponding
/// enemy kind ports.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletPattern {
    SingleShot,
    // TODO Phase 2.1+: HunterBurst, WaspMachinegun, SweepLaser,
    // SentinelSweep, ChargedLaser, ArcLightning, Missile, LayMine,
    // SpiralLaser, GuardianSpread, SquareBurst, Burst2, Burst3.
}

/// Sim-level enemy state. Mirrors the `EnemyState` typedef in
/// `js/sim/state.js` (lines 656–670, agent D's round-2 addition) but
/// scoped to HUNTER's chase + single-shot fire. Fields beyond this
/// minimal set are listed in the module docstring under
/// "Enemy struct fields skipped".
#[derive(Debug, Clone, Copy)]
pub struct Enemy {
    /// Stable id for the enemy slot. JS enemy.id is `EnemyId|number`.
    pub id: u32,

    /// Enemy kind discriminator.
    pub kind: EnemyKind,

    // ── Position / velocity (px / px-per-tick) ───────────────────────
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,

    /// Aim angle in radians. Cosmetic — the simplified fire path emits
    /// the angle as part of the event so the wrapper can spawn a bullet
    /// without re-computing.
    pub angle: f32,

    /// Current HP. Decremented by collisions; when ≤ 0.001 the enemy
    /// dies. JS death threshold: `enemy.health <= 0.001` (enemy.js:268).
    pub hp: f32,

    /// HP cap. Computed from `config.health * levelMultiplier` in JS;
    /// Rust mirrors HUNTER level=1 → max_hp = HUNTER_HP.
    pub max_hp: f32,

    /// Difficulty level (1..). Used by JS to scale HP / size / speed.
    /// In the simplified port we only honor it for fire cooldown
    /// interpolation; movement uses base `HUNTER_SPEED` regardless.
    pub level: u32,

    /// False when destroyed. Mirrors JS `enemy.active`.
    pub active: bool,

    /// Time until next single-shot fire (ms). Decremented by
    /// `dt * 1000` each tick; emits an event + resets when ≤ 0.
    /// JS uses `lastShot` timestamps + `firingCooldown`; Rust uses a
    /// countdown to avoid carrying a wall-clock dependency.
    pub fire_cooldown_ms: f32,

    /// Reset value when the cooldown expires. JS computes this from
    /// `getEnemyFiringCooldown(type, level)` after each shot; Rust
    /// mirrors via `hunter_fire_cooldown_ms_for_level`.
    pub fire_cooldown_reset_ms: f32,

    /// Velocity scale (1.0 = baseline). Reserved for Phase 2.1+
    /// upgrade flags (e.g. boss rage tantrum slow); currently always 1.0.
    pub speed_multiplier: f32,
}

impl Enemy {
    /// Construct a fresh HUNTER at the given position. Mirrors the
    /// JS `freshEnemyState('HUNTER', { x, y, ... })` factory plus the
    /// `initializeEnemy` HP / radius defaults at level 1.
    pub fn fresh_hunter(id: u32, x: f32, y: f32) -> Self {
        Self {
            id,
            kind: EnemyKind::Hunter,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: HUNTER_HP,
            max_hp: HUNTER_HP,
            level: 1,
            active: true,
            fire_cooldown_ms: HUNTER_FIRE_COOLDOWN_MAX_MS,
            fire_cooldown_reset_ms: HUNTER_FIRE_COOLDOWN_MAX_MS,
            speed_multiplier: 1.0,
        }
    }
}

/// Minimal ship slice the chase needs. We deliberately avoid borrowing
/// `crate::protocol::ShipState` directly — that struct is the wire
/// format and dragging it through the sim creates an unwanted coupling.
/// `update_enemy` only reads position + velocity from each ship.
#[derive(Debug, Clone, Copy)]
pub struct ShipPosition {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
}

/// Per-tick context for `update_enemy`. Mirrors the JS
/// `EnemyUpdateContext` typedef (state.js:673–681).
///
/// **Currently unread fields** (`frame_clock_ms`, `rng`):
///
/// The JS `hunterArcMovement` (`movement.js:806-901`) reads
/// `frameClock.now` (a session-local ms counter) on every tick for its
/// lunge / slingshot dice rolls, and consumes `Math.random()` on first
/// call for the sticky per-spawn `_arcDirection` / `_arcRadius` /
/// `_arcOmega` init. The Rust mirror needs both behind a deterministic
/// contract before that branch can be ported — so the fields are wired
/// now and the simplified chase ignores them.
///
/// We carry the fields in the Rust shape anyway so:
///   1. The wrapper / call sites already have somewhere to plug in a
///      seeded `Pcg64` + ms-precision clock (no signature churn when
///      `hunter_arc` lands).
///   2. The parity fixture `parity_enemy::hunter_chase_with_ctx_plumbing`
///      proves that populating these fields with non-default values
///      does NOT alter the chase output today (same invariant agent F
///      established for `wave::WaveContext` in PR #28).
///
/// When `hunter_arc` is ported, `update_enemy` will start reading
/// these fields and the `#[allow(dead_code)]` attribute on `rng` will
/// be removed. See module docstring §"RNG / frameClock plumbing" for
/// the cross-language harmonization story.
#[allow(dead_code)] // `frame_clock_ms` + `rng` reserved for `hunter_arc` port — see doc comment.
pub struct EnemyContext<'a> {
    /// Active player ships. The chase picks the nearest; if empty the
    /// enemy idles in place (no chase target). Stored as `Vec<ShipPosition>`
    /// rather than a borrow to avoid lifetime gymnastics — the caller
    /// can populate this once per tick from the wire `ShipState` slice.
    pub ships: Vec<ShipPosition>,

    /// Seconds elapsed this tick. Typically `1/60`.
    pub dt: f32,

    /// Position-integration scale. Typically `0.5` (matches JS
    /// `GAME_CONFIG.TICK_SCALE`).
    pub tick_scale: f32,

    /// World bounds (px). Currently unused by the HUNTER chase but
    /// reserved for the boundary-bounce branch (enemy.js:243–256) when
    /// it lands.
    pub field_width: f32,
    pub field_height: f32,

    /// Wall-clock ms since session start. Mirrors `frameClock.now` on
    /// the JS side. Reserved for `hunter_arc` (lunge / slingshot dice
    /// rolls keyed off `now > arc_lunge_roll_at`), music-sync shield
    /// rotation, and fire timestamps. **Unread by `update_enemy` today.**
    pub frame_clock_ms: u64,

    /// Seeded RNG. `None` = no RNG available (also acceptable — the
    /// current implementation never touches it). When `hunter_arc`
    /// lands, the first-call init will pull four values for
    /// `_arcDirection`, `_arcRadius`, `_arcOmega`, `_arcLungeRollAt`,
    /// `_arcSlingRollAt`, `_arcWeavePhase` — at which point this field
    /// becomes load-bearing and the `#[allow(dead_code)]` goes away.
    /// **Unread by `update_enemy` today.**
    pub rng: Option<&'a mut Pcg64>,
}

/// Side-effect events emitted by `update_enemy`. Currently single-shot
/// fire only; the other 5 event types from `js/sim/enemy.js`
/// (`enemy_debris_burst`, `enemy_fire_continuous`, `enemy_fire_charging`,
/// `enemy_fire_burst`, `enemy_death_recycle`) land with the deferred
/// branches.
#[derive(Debug, Clone, Copy)]
pub enum EnemyEvent {
    /// A single bullet spawn. The wrapper drains this and calls the
    /// matching helper from `firing.js` (HUNTER's `hunter_single`
    /// pattern). `kind` is `BulletPattern::SingleShot` for now.
    Fire {
        enemy_id: u32,
        x: f32,
        y: f32,
        angle: f32,
        kind: BulletPattern,
    },
}

// ── Helpers ─────────────────────────────────────────────────────────────

/// Linear-interpolate HUNTER fire cooldown by level. Mirrors
/// `getEnemyFiringCooldown('HUNTER', level)` in
/// `js/modules/core/constants.js:201–212`. Level 1 → MAX, level ≥ 10 →
/// MIN, in between is a straight linear blend.
pub fn hunter_fire_cooldown_ms_for_level(level: u32) -> f32 {
    let level_progress = ((level.saturating_sub(1)) as f32 / 9.0).min(1.0);
    HUNTER_FIRE_COOLDOWN_MAX_MS
        - (HUNTER_FIRE_COOLDOWN_MAX_MS - HUNTER_FIRE_COOLDOWN_MIN_MS) * level_progress
}

/// Pick the nearest ship to `enemy`. Returns `None` if `ships` is empty.
fn nearest_ship(enemy: &Enemy, ships: &[ShipPosition]) -> Option<ShipPosition> {
    let mut best: Option<(f32, ShipPosition)> = None;
    for s in ships {
        let dx = s.x - enemy.x;
        let dy = s.y - enemy.y;
        let d2 = dx * dx + dy * dy;
        match best {
            Some((d, _)) if d <= d2 => {}
            _ => best = Some((d2, *s)),
        }
    }
    best.map(|(_, s)| s)
}

// ── Pure step ───────────────────────────────────────────────────────────

/// One tick of HUNTER chase + single-shot fire. Mirrors the simplified
/// path described in the module docstring.
///
/// Order of operations (load-bearing for parity):
///
///   1. Active-guard. JS enemy.js:93.
///   2. Pick nearest ship as chase target. JS enemy.js:97 picks
///      `ctx.ships[0]`; we pick nearest because the multiplayer port
///      will have multiple ships.
///   3. Standard chase: dx/dy/distance, accelerate toward target,
///      cap velocity. Mirrors `chasePlayer()` standard branch
///      (movement.js:73–97), minus the weave term.
///   4. Cooldown decrement + fire emission. Mirrors
///      `decideEnemyShooting()` non-burst path (enemy.js:370–376),
///      but uses a countdown rather than a wall-clock comparison.
///   5. Position integration. Mirrors enemy.js:229–230. Always uses
///      `ctx.tick_scale` (matches JS `GAME_CONFIG.TICK_SCALE`).
///
/// Boundary handling (enemy.js:242–264) is deferred — for the parity
/// fixture the enemy stays well clear of the field bounds.
pub fn update_enemy(enemy: &mut Enemy, ctx: &EnemyContext<'_>, events: &mut Vec<EnemyEvent>) {
    if !enemy.active {
        return;
    }

    match enemy.kind {
        EnemyKind::Hunter => update_hunter(enemy, ctx, events),
        // TODO Phase 2.1+: dispatch other kinds. Until then, any other
        // kind is a logic error — but we leave the match exhaustive
        // by virtue of `EnemyKind` only having the `Hunter` variant.
    }
}

fn update_hunter(enemy: &mut Enemy, ctx: &EnemyContext<'_>, events: &mut Vec<EnemyEvent>) {
    // ── Step 2: target selection (movement.js:73 implicit; sim/enemy.js:97) ──
    // The target may be `None` if there are no ships — mirror JS
    // `if (!playerRef) return enemy;` (enemy.js:143).
    let target = match nearest_ship(enemy, &ctx.ships) {
        Some(s) => s,
        None => return,
    };

    // ── Step 3: standard chase (movement.js:73–97) ──
    // dx/dy/distance toward target.
    let dx = target.x - enemy.x;
    let dy = target.y - enemy.y;
    let distance = (dx * dx + dy * dy).sqrt();

    if distance > 0.0 {
        // movement.js:80-81: per-tick acceleration along chase direction.
        // (We omit the weave term — see module docstring.)
        let target_vel_x = (dx / distance) * CHASE_ACCEL;
        let target_vel_y = (dy / distance) * CHASE_ACCEL;

        enemy.vx += target_vel_x;
        enemy.vy += target_vel_y;

        // movement.js:91-96: clamp velocity magnitude to
        // `config.speed * 1.08`. HUNTER speed = 2.6.
        let speed = (enemy.vx * enemy.vx + enemy.vy * enemy.vy).sqrt();
        let max_speed = HUNTER_SPEED * enemy.speed_multiplier * CHASE_SPEED_CAP_MULT;
        if speed > max_speed {
            enemy.vx = (enemy.vx / speed) * max_speed;
            enemy.vy = (enemy.vy / speed) * max_speed;
        }
    }

    // Update aim angle for the fire event. JS `enemy.faceAngle` is
    // computed inside `updateFaceDirection`; we simplify to point
    // straight at the chase target.
    enemy.angle = dy.atan2(dx);

    // ── Step 4: cooldown + fire (enemy.js:370–376 simplified) ──
    // Decrement by milliseconds elapsed this tick. When the cooldown
    // hits zero we emit one fire event and reset to the level-scaled
    // value. The JS path uses `now - lastShot > firingCooldown`; the
    // countdown form here is semantically equivalent for a single-shot
    // pattern (no burst, no charging).
    enemy.fire_cooldown_ms -= ctx.dt * 1000.0;
    if enemy.fire_cooldown_ms <= 0.0 {
        events.push(EnemyEvent::Fire {
            enemy_id: enemy.id,
            x: enemy.x,
            y: enemy.y,
            angle: enemy.angle,
            kind: BulletPattern::SingleShot,
        });
        enemy.fire_cooldown_ms = enemy.fire_cooldown_reset_ms;
    }

    // ── Step 5: position integration (enemy.js:229–230) ──
    enemy.x += enemy.vx * ctx.tick_scale;
    enemy.y += enemy.vy * ctx.tick_scale;
}

/// Loop helper. Calls `update_enemy` over a slice with the same context.
pub fn update_enemies(
    enemies: &mut [Enemy],
    ctx: &EnemyContext<'_>,
    events: &mut Vec<EnemyEvent>,
) {
    for enemy in enemies.iter_mut() {
        update_enemy(enemy, ctx, events);
    }
}

// ── Wire-state integration stub (Phase 3) ───────────────────────────────
//
// Existing entry point called from `simulate_tick` in `mod.rs`. The
// real wire ↔ sim bridging will land when client prediction wires up;
// for now this is a no-op that satisfies the existing call site.
// Untouched from the original scaffold.
pub fn update_all(
    _enemies: &mut Vec<EnemyState>,
    _ships: &[ShipState],
    _dt: f32,
    _rng: &mut Pcg64,
    _events: &mut Vec<GameEvent>,
) {
    // 10 enemy types per CLAUDE.md memory: HUNTER, GUARDIAN, WASP, STALKER,
    // DRIFTER, PROWLER, WEAVER, SENTINEL, TANGERINE, TITAN. Behaviors live
    // in the JS sim today and get ported per the week 7–9 plan.
}
