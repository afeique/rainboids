//! Bullet integration. Stub.
//!
//! Production form is SoA pools (see plan §"Contiguous storage"); a Vec is
//! fine until profiling justifies the layout flip.
//!
//! ── Phase 2 port (in progress) ────────────────────────────────────────────
//!
//! Mirrors `js/sim/bullet.js::updatePlayerBullet`. Currently implements the
//! straight-line player-bullet path only (linear drift + life decay + range
//! fade + boundary cull). Deferred to follow-up sessions:
//!
//!   - Helix offset (Rail-Driver double-helix bullets) — js bullet.js:92–102
//!   - Predictive-lead homing — js bullet.js:79–81 + applyPlayerHoming
//!   - Piercing / piercedEnemies counter — collision-side, not in step()
//!   - Explosive / explosionRadius — collision-side, not in step()
//!
//! Enemy bullets: 3 of ~17 movement patterns implemented (Phase 2.1):
//!
//!   - `Straight` — js `aimed`/`crescent_beam`/`crescent_slice` (no-mod path).
//!   - `Sine` — js `sine_wave_nospin` (perpendicular sine offset).
//!   - `Decelerate` — js `missile_decelerate` (subtractive speed decay).
//!
//! Deferred enemy patterns (14+ remaining, js bullet.js:259–593):
//! `mine`, `homing_mine`, `spread`, `rapid`, `spiral`, `burst`, `explosive`,
//! `laser`, `laser_beam`, `missile`, `homing`, `titan_homing`, `titan_rocket`,
//! `pulse`, `shield_burst`, `wave_energy`, `energy_slash`, `sine_wave` (with
//! rotation), `missile_fast_slow`, plus boss-rage homing composition,
//! mine HP-death, persistent timed lifetime (mines / lightning orbs),
//! and `targetPlayer` lookups.
//!
//! Order of operations is **load-bearing for parity** — exactly mirrors the
//! JS `updatePlayerBullet` body:
//!
//!   1. Active-guard (early return if !active).
//!   2. Increment `life` by 1.
//!   3. Compute `effectiveMaxLife = round(maxLife * rangeMultiplier)`.
//!   4. If `life >= effectiveMaxLife`: deactivate, set `expired_by_range`,
//!      emit Despawn, return.
//!   5. Compute `fade_factor` and visual `radius` from remaining life.
//!   6. (Skipped: homing nudge — not yet ported.)
//!   7. Position update: `x += vx; y += vy`.
//!      NOTE: player-bullet path does NOT scale by `tickScale` — only enemy
//!      bullets do. (`tickScale` is captured in the context for symmetry with
//!      the enemy path and future homing/helix work.)
//!   8. (Skipped: helix offset — not yet ported.)
//!   9. Boundary check (50 px margin): if outside, deactivate, set
//!      `expired_by_bounds`, emit Despawn.
//!
//! Parity fixture: `server/tests/parity_bullet.rs`.

// ── Existing scaffold stub — UNCHANGED ──────────────────────────────────
// The original `Bullet` struct + `integrate` function predate the Phase-2
// port; they're retained here so the wider scaffold (which doesn't yet wire
// `update_player_bullets` into `simulate_tick`) keeps compiling. Once the
// wrapper migration lands, this stub gets removed in favor of the
// `PlayerBullet` types below.

#[derive(Debug, Clone, Copy)]
pub struct Bullet {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub lifetime: f32,
    pub alive: bool,
}

pub fn integrate(bullets: &mut [Bullet], dt: f32) {
    for b in bullets.iter_mut() {
        if !b.alive {
            continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.lifetime -= dt;
        if b.lifetime <= 0.0 {
            b.alive = false;
        }
    }
}

// ── Phase 2: player-bullet step (linear-drift subset) ───────────────────

// JS bullet.js:73 — fade-factor knee: bullet starts visually shrinking once
// remaining life drops below 35%.
const FADE_KNEE: f32 = 0.35;

// JS bullet.js:74 — minimum visual radius factor at end-of-life
// (`baseRadius * 0.3`); the remaining 70% scales with `fade_factor`.
const RADIUS_MIN_FACTOR: f32 = 0.3;
const RADIUS_FADE_FACTOR: f32 = 0.7;

// JS bullet.js:107–110 — boundary-margin (in px) before a bullet is
// considered offscreen and culled.
const BOUNDARY_MARGIN: f32 = 50.0;

/// Minimal player-bullet state for the straight-line path.
///
/// Skips upgrade flags (helix / homing / piercing / explosive) and motion
/// state (`startX/startY` for distance-based logic, `angle/rotation` for
/// rendered orientation) — those will be added when the corresponding JS
/// branches are ported. See module docstring for the full deferred list.
#[derive(Debug, Clone, Copy)]
pub struct PlayerBullet {
    /// Stable identity for despawn events. JS bullet.id is `BulletId|number`.
    pub id: u32,

    // ── Position / velocity (px / px-per-tick) ─────────────────────────
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,

    // ── Lifetime — integer frames since spawn ──────────────────────────
    /// JS bullet.js:59 — incremented every tick.
    pub life: u32,
    /// JS bullet.js:63 — cap is `round(max_life * range_multiplier)`.
    pub max_life: u32,

    // ── Combat (informational; collision-side reads these) ─────────────
    pub damage: f32,
    /// Visual / hitbox radius — derived from `base_radius * fade_factor`
    /// each tick. JS bullet.js:74.
    pub radius: f32,
    /// Radius at full life. JS state.js:582.
    pub base_radius: f32,

    // ── Range (px) — currently unused in linear path; still tracked for
    //    future enemy-bullet / homing parity. ───────────────────────────
    pub max_range: f32,
    pub range_multiplier: f32,

    /// Visual fade in the final 35% of life. JS bullet.js:73.
    pub fade_factor: f32,

    // ── Lifecycle flags ────────────────────────────────────────────────
    pub active: bool,
    /// JS state.js:475 — wrapper triggers disappear-puff FX when set.
    pub expired_by_range: bool,
    /// JS state.js:476 — wrapper skips FX (offscreen).
    pub expired_by_bounds: bool,

    /// Owning player. `None` = system-owned (e.g. allied turret); not yet
    /// modeled but reserved for parity with JS `bullet.owner`.
    pub owner: Option<u32>,

    // TODO Phase 2.1+: helix_active, helix_freq, helix_phase, helix_amplitude
    // TODO Phase 2.1+: homing, homing_strength
    // TODO Phase 2.1+: piercing, pierced_enemies
    // TODO Phase 2.1+: explosive, explosion_radius
    // TODO Phase 2.1+: start_x, start_y (distance-based fade)
    // TODO Phase 2.1+: angle, rotation, rotation_speed (sprite orientation)
}

/// Per-tick context for player-bullet updates.
///
/// Field names mirror `BulletUpdateContext` in `js/sim/state.js`. Fields not
/// consumed by the linear-drift path (`logic_tick_seconds`, `now`, RNG,
/// homing target) are documented but elided — they'll come back when their
/// branches port.
#[derive(Debug, Clone, Copy)]
pub struct PlayerBulletContext {
    /// Render-rate scaler (`30 / 60 = 0.5`). Player-bullet linear path does
    /// NOT consume this — only enemy bullets do — but it's retained on the
    /// context so a unified `BulletUpdateContext` can serve both kinds when
    /// the enemy branch lands.
    pub tick_scale: f32,
    /// World boundaries (px). JS bullet.js:107–108.
    pub boundary_width: f32,
    pub boundary_height: f32,
    // TODO Phase 2.1+: logic_tick_seconds (enemy pattern timer + persistent)
    // TODO Phase 2.1+: bullet_speed (homing target velocity)
    // TODO Phase 2.1+: now_ms (persistent bullet age)
    // TODO Phase 2.1+: target_player (enemy homing patterns)
    // TODO Phase 2.1+: homing_target (player homing)
    // TODO Phase 2.1+: rng (rapid-pattern jitter)
}

/// Despawn signal for the wrapper to translate into pool-release + FX.
///
/// JS bullet.js does not currently emit explicit despawn events — the
/// wrapper polls `bullet.active`. Surfacing it as an enum here lets the
/// Rust caller pre-allocate an event buffer and avoid a second pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletEvent {
    Despawn { bullet_id: u32 },
}

/// Single-bullet step. Mirrors `js/sim/bullet.js::updatePlayerBullet`,
/// linear-drift subset only.
///
/// Mutates `b` in place; appends despawn events to `events`. See module
/// docstring for the deferred branches.
pub fn update_player_bullet(
    b: &mut PlayerBullet,
    ctx: &PlayerBulletContext,
    events: &mut Vec<BulletEvent>,
) {
    // 1. Active-guard (JS bullet.js:57).
    if !b.active {
        return;
    }

    // 2. Lifetime increment (JS bullet.js:59).
    b.life = b.life.saturating_add(1);

    // 3. Effective lifetime = round(max_life * range_multiplier)
    //    (JS bullet.js:63 — Math.round on the float product, then compared
    //    as integer-vs-integer).
    //
    //    `f32::round` matches JS `Math.round` for positive values within
    //    the exactly-representable u32 range. The cap is small (≪ 2^24),
    //    so float→int conversion is lossless.
    let effective_max_life =
        ((b.max_life as f32) * b.range_multiplier).round() as u32;

    // 4. Lifetime expiry (JS bullet.js:64–67).
    if b.life >= effective_max_life {
        b.active = false;
        b.expired_by_range = true;
        events.push(BulletEvent::Despawn { bullet_id: b.id });
        return;
    }

    // 5. Fade factor + visual radius (JS bullet.js:72–74). The fade ramps
    //    linearly from 1.0 → 0.0 over the final FADE_KNEE fraction of life.
    let remaining = 1.0 - (b.life as f32) / (effective_max_life as f32);
    b.fade_factor = if remaining < FADE_KNEE {
        remaining / FADE_KNEE
    } else {
        1.0
    };
    b.radius = b.base_radius * (RADIUS_MIN_FACTOR + RADIUS_FADE_FACTOR * b.fade_factor);

    // 6. Homing — DEFERRED (Phase 2.1+). JS bullet.js:79–81 calls
    //    applyPlayerHoming when `homing && ctx.homingTarget`.

    // 7. Position update (JS bullet.js:84–85). Player-bullet path does NOT
    //    scale by tick_scale — that's enemy-bullets only. `_` to silence
    //    unused-field lint for the field-on-context that's retained for
    //    later branches.
    let _ = ctx.tick_scale;
    b.x += b.vx;
    b.y += b.vy;

    // 8. Helix offset — DEFERRED (Phase 2.1+). JS bullet.js:92–102.

    // 9. Boundary check (JS bullet.js:107–113). 50 px margin on each side.
    let w = ctx.boundary_width;
    let h = ctx.boundary_height;
    if b.x < -BOUNDARY_MARGIN
        || b.x > w + BOUNDARY_MARGIN
        || b.y < -BOUNDARY_MARGIN
        || b.y > h + BOUNDARY_MARGIN
    {
        b.active = false;
        b.expired_by_bounds = true;
        events.push(BulletEvent::Despawn { bullet_id: b.id });
    }
}

/// Loop helper. Mirrors `js/sim/bullet.js::updateBullets` but specialized
/// to player bullets (the enemy-bullet branch isn't ported yet).
pub fn update_player_bullets(
    bullets: &mut [PlayerBullet],
    ctx: &PlayerBulletContext,
    events: &mut Vec<BulletEvent>,
) {
    for b in bullets.iter_mut() {
        update_player_bullet(b, ctx, events);
    }
}

// ── ENEMY BULLETS ───────────────────────────────────────────────────────
//
// `js/sim/bullet.js::updateEnemyBullet` switches on `movementPattern` and
// has ~17 distinct cases. Phase 2.1 implements the 3 simplest:
//
//   - `Straight` (aimed / crescent_beam / crescent_slice — no-mod path).
//   - `Sine` (sine_wave_nospin — perpendicular sin(phase)*amp offset).
//   - `Decelerate` (missile_decelerate — subtract decel each tick, clamp
//     at min_speed; expire when at floor).
//
// The remaining patterns are TODO; see module docstring for the full list.
//
// Order of operations is **load-bearing for parity** — exactly mirrors the
// JS `updateEnemyBullet` body (js bullet.js:183–249):
//
//   1. Active-guard (early return if !active).
//   2. `applyEnemyMovementPattern(b, ctx)` — pattern-specific velocity
//      mutation. May set `active=false` + `expired_by_distance=true`
//      (decelerate at min-speed floor).
//   3. Position update: `x += vx * tick_scale; y += vy * tick_scale`.
//      NOTE: enemy-bullet path **does** scale by tick_scale; player does not.
//   4. Rotation tick — skipped here (cosmetic; not modeled).
//   5. `pattern_timer += logic_tick_seconds`.
//   6. Mine HP death — skipped (mine pattern not yet ported).
//   7. Lifetime / fade:
//        - Persistent (mines, lightning) — TODO; not implemented.
//        - Distance-based: dist from (start_x, start_y); if progress >=
//          1.0 → deactivate + `expired_by_range`; else fade `life`.
//   8. Out-of-bounds despawn (50 px margin).

// JS bullet.js:228 — distance-based lifetime fade knee (life is held at 1.0
// until 65% of max_range is traveled, then ramps 1.0 → 0.5 over the final
// 35%).
const DISTANCE_FADE_KNEE: f32 = 0.65;
const DISTANCE_FADE_RANGE: f32 = 0.35;
const DISTANCE_FADE_FINAL: f32 = 0.5;

/// Enemy-bullet movement pattern. Phase 2.1 covers the 3 simplest cases
/// only. The full JS dispatcher has ~17 — see module docstring for the
/// deferred list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletPattern {
    /// JS `aimed` / `crescent_beam` / `crescent_slice` — straight-line drift,
    /// no per-tick velocity adjustment.
    Straight,
    /// JS `sine_wave_nospin` — drift along base velocity plus perpendicular
    /// `sin(sine_phase) * sine_amp` offset; advances `sine_phase` by
    /// `sine_freq` each tick. (The `sine_wave` variant additionally aligns
    /// rotation to travel direction; not modeled here.)
    Sine,
    /// JS `missile_decelerate` — subtractive speed decay each tick. When the
    /// speed reaches `min_speed`, the bullet expires (`expired_by_distance`).
    Decelerate,
    // TODO Phase 2.1+: Helix, Homing, Ricochet, Rocket, Mine, Spiral,
    // EnergySlash, Bezier, Charge, Spread, Rapid, Burst, Explosive, Laser,
    // LaserBeam, Missile, TitanHoming, TitanRocket, Pulse, ShieldBurst,
    // WaveEnergy, SineWave (with rotation), MissileFastSlow, HomingMine.
}

/// Minimal enemy-bullet state for the 3 patterns above.
///
/// Skips fields used only by deferred patterns (`shape`, `health`,
/// `is_persistent`, `creation_time`, `target_player`, `boss_rage_homing`,
/// `helix_*`, `rocket_speed`, `slash_progress`, etc.). See module docstring.
#[derive(Debug, Clone, Copy)]
pub struct EnemyBullet {
    /// Stable identity for despawn events.
    pub id: u32,
    /// Dispatches per-tick velocity logic.
    pub pattern: BulletPattern,

    // ── Position / velocity (px / px-per-tick) ─────────────────────────
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,

    /// Origin — used for distance-based lifetime + fade. JS bullet.js:228.
    pub start_x: f32,
    pub start_y: f32,

    /// Pre-pattern velocity baseline for Sine. JS state.js:430.
    pub base_vx: f32,
    pub base_vy: f32,

    // ── Lifetime ───────────────────────────────────────────────────────
    /// Distance-fade ratio (1.0 → DISTANCE_FADE_FINAL near max_range).
    /// JS state.js:435 — **enemy** life is a 0..1 fade, not an int frame
    /// counter (player path uses int frames).
    pub life: f32,
    /// Player-style frame cap (unused by these 3 patterns but kept for
    /// parity with the JS struct). TODO Phase 2.1+ when persistent bullets
    /// land.
    #[allow(dead_code)]
    pub max_life: u32,

    // ── Combat (informational) ────────────────────────────────────────
    pub damage: f32,
    pub radius: f32,
    pub base_radius: f32,

    // ── Range / distance (px) ─────────────────────────────────────────
    /// JS bullet.js:229 — distance-based fade horizon.
    pub max_range: f32,
    /// JS state.js:585 — LONG_RANGE upgrade (player only; enemy
    /// bullets typically pass 1.0 here).
    pub range_multiplier: f32,

    // ── Pattern timing (seconds since spawn) ──────────────────────────
    /// JS bullet.js:200 — incremented each tick by `logic_tick_seconds`.
    pub pattern_timer: f32,
    /// JS state.js:456 — pattern-specific phase offset (used by spread,
    /// energy_slash, etc.). Reserved; not consumed by the 3 ported
    /// patterns but kept on the struct for parity.
    #[allow(dead_code)]
    pub pattern_phase: f32,

    // ── Sine pattern state ────────────────────────────────────────────
    /// JS state.js:462. Advanced by `sine_freq` each tick.
    pub sine_phase: f32,
    pub sine_freq: f32,
    pub sine_amp: f32,
    /// Perpendicular axis (unit vector) along which the sine displaces
    /// velocity. JS state.js:465–466.
    pub sine_perp_x: f32,
    pub sine_perp_y: f32,

    // ── Decelerate pattern state ──────────────────────────────────────
    /// JS state.js:472 — speed subtracted per tick (NOT a multiplier).
    pub deceleration: f32,
    /// JS state.js:473 — floor for the speed clamp.
    pub min_speed: f32,

    // ── Lifecycle flags ───────────────────────────────────────────────
    pub active: bool,
    /// JS state.js:475 — wrapper triggers disappear-puff FX.
    pub expired_by_range: bool,
    /// JS state.js:476 — wrapper skips FX (offscreen).
    pub expired_by_bounds: bool,
    /// JS state.js:477 — wrapper triggers explosion FX (decelerate hits
    /// floor; titan_rocket out-of-distance).
    pub expired_by_distance: bool,

    // TODO Phase 2.1+: shape (mine vs needle vs ...) — drives mine HP
    //   death + persistent-vs-distance lifetime branch.
    // TODO Phase 2.1+: health, max_health (mine HP).
    // TODO Phase 2.1+: is_persistent, max_lifetime_override, creation_time
    //   (time-based lifetime for mines / lightning orbs).
    // TODO Phase 2.1+: target_player (homing patterns).
    // TODO Phase 2.1+: boss_rage_homing.
    // TODO Phase 2.1+: rocket_speed, max_distance, distance_traveled
    //   (titan_rocket).
    // TODO Phase 2.1+: slash_progress (energy_slash).
    // TODO Phase 2.1+: rotation, rotation_speed (sprite orientation).
}

/// Per-tick context for enemy-bullet updates. Mirrors the relevant subset
/// of `BulletUpdateContext` in `js/sim/state.js`.
#[derive(Debug, Clone, Copy)]
pub struct EnemyBulletContext {
    /// Render-rate scaler (`30 / 60 = 0.5`). JS bullet.js:190–191 — enemy
    /// position update **does** consume this (player does not).
    pub tick_scale: f32,
    /// Seconds-per-logic-tick. JS bullet.js:200 — adds to `pattern_timer`.
    pub logic_tick_seconds: f32,
    /// World boundaries (px). JS bullet.js:242–243.
    pub boundary_width: f32,
    pub boundary_height: f32,
    // TODO Phase 2.1+: now_ms (persistent bullet age — mines, lightning).
    // TODO Phase 2.1+: bullet_speed (homing target velocity).
    // TODO Phase 2.1+: target_player (homing patterns).
    // TODO Phase 2.1+: rng (rapid-pattern jitter).
}

/// Pattern-specific velocity adjustment. Mirrors
/// `applyEnemyMovementPattern` in js/sim/bullet.js, restricted to the 3
/// patterns this module implements.
fn apply_enemy_movement_pattern(b: &mut EnemyBullet, _ctx: &EnemyBulletContext) {
    // JS bullet.js:260–263 — guard: when both base velocities are zero AND
    // pattern is not `mine`, the legacy code early-returned. None of our 3
    // patterns are `mine`, so we mirror the early-return. (`Straight` with
    // base_vx/base_vy=0 means "stationary"; matches JS behavior.)
    if b.base_vx == 0.0 && b.base_vy == 0.0 {
        return;
    }

    match b.pattern {
        // JS bullet.js:270–272 — `aimed` (and crescent_*): no velocity
        // modification; the bullet drifts straight.
        BulletPattern::Straight => {}

        // JS bullet.js:536–543 — `sine_wave_nospin`. The `sine_wave` variant
        // additionally aligns `rotation` with travel direction; we don't
        // model rotation here.
        BulletPattern::Sine => {
            b.sine_phase += b.sine_freq;
            let displacement = b.sine_phase.sin() * b.sine_amp;
            b.vx = b.base_vx + b.sine_perp_x * displacement;
            b.vy = b.base_vy + b.sine_perp_y * displacement;
        }

        // JS bullet.js:450–475 — `missile_decelerate`. Subtractive decay,
        // clamped at min_speed. When the bullet is already at the floor, it
        // expires with `expired_by_distance` set. The JS branch also has a
        // max-distance check (lines 465–473); the wrapper sets
        // `bullet.maxDistance` from constants — we don't model that field
        // yet (it's a TODO above), so the deceleration-floor exit is the
        // only despawn route from this case.
        BulletPattern::Decelerate => {
            let current_speed = (b.vx * b.vx + b.vy * b.vy).sqrt();
            if current_speed > b.min_speed {
                let direction = b.vy.atan2(b.vx);
                let new_speed = (current_speed - b.deceleration).max(b.min_speed);
                b.vx = direction.cos() * new_speed;
                b.vy = direction.sin() * new_speed;
            } else {
                b.active = false;
                b.expired_by_distance = true;
            }
        }
    }
}

/// Single enemy-bullet step. Mirrors `js/sim/bullet.js::updateEnemyBullet`,
/// restricted to the 3 patterns above.
///
/// Mutates `b` in place; appends despawn events to `events`.
pub fn update_enemy_bullet(
    b: &mut EnemyBullet,
    ctx: &EnemyBulletContext,
    events: &mut Vec<BulletEvent>,
) {
    // 1. Active-guard (JS bullet.js:184).
    if !b.active {
        return;
    }

    // 2. Apply movement pattern (JS bullet.js:187). May deactivate the bullet
    //    (decelerate floor); the JS code does NOT early-return after this,
    //    so the post-processing below still runs — including position update
    //    and despawn-event emission via the lifetime branches.
    apply_enemy_movement_pattern(b, ctx);

    // 3. Position update — scaled for tick rate (JS bullet.js:190–191).
    b.x += b.vx * ctx.tick_scale;
    b.y += b.vy * ctx.tick_scale;

    // 4. Rotation accumulator — skipped (cosmetic; not modeled).

    // 5. Pattern timer (JS bullet.js:200).
    b.pattern_timer += ctx.logic_tick_seconds;

    // 6. Mine HP death — skipped (mine pattern is TODO).

    // 7. Lifetime / fade. We only handle the distance-based branch here
    //    (persistent bullets are TODO).
    //
    //    JS bullet.js:228–238: dist = hypot(x - startX, y - startY);
    //    progress = dist / maxRange. If progress >= 1.0, deactivate +
    //    `expiredByRange`. Otherwise life ramps 1.0 → 0.5 over the final
    //    35% (held at 1.0 during the first 65%).
    //
    //    NOTE: `range_multiplier` is a player-bullet upgrade (LONG_RANGE);
    //    enemy bullets typically pass 1.0. We multiply for parity in case
    //    a future enemy-side modifier wants to use it.
    let dx = b.x - b.start_x;
    let dy = b.y - b.start_y;
    let dist = (dx * dx + dy * dy).sqrt();
    let effective_range = b.max_range * b.range_multiplier;
    let progress = if effective_range > 0.0 {
        dist / effective_range
    } else {
        0.0
    };
    if progress >= 1.0 {
        // Only emit a single despawn event per bullet — if the pattern step
        // already deactivated us (decelerate floor), don't double-emit.
        if b.active {
            events.push(BulletEvent::Despawn { bullet_id: b.id });
        }
        b.active = false;
        b.expired_by_range = true;
        return;
    }
    b.life = if progress < DISTANCE_FADE_KNEE {
        1.0
    } else {
        1.0 - (progress - DISTANCE_FADE_KNEE) / DISTANCE_FADE_RANGE * DISTANCE_FADE_FINAL
    };

    // 8. Out-of-bounds despawn (JS bullet.js:241–246). 50 px margin.
    let w = ctx.boundary_width;
    let h = ctx.boundary_height;
    if b.x < -BOUNDARY_MARGIN
        || b.x > w + BOUNDARY_MARGIN
        || b.y < -BOUNDARY_MARGIN
        || b.y > h + BOUNDARY_MARGIN
    {
        if b.active {
            events.push(BulletEvent::Despawn { bullet_id: b.id });
        }
        b.active = false;
        b.expired_by_bounds = true;
        return;
    }

    // If the pattern step deactivated us (e.g. decelerate floor) and we
    // didn't otherwise emit a despawn above, do so now so the wrapper can
    // release the slot.
    if !b.active {
        events.push(BulletEvent::Despawn { bullet_id: b.id });
    }
}

/// Loop helper. Mirrors `js/sim/bullet.js::updateBullets` but specialized
/// to enemy bullets.
pub fn update_enemy_bullets(
    bullets: &mut [EnemyBullet],
    ctx: &EnemyBulletContext,
    events: &mut Vec<BulletEvent>,
) {
    for b in bullets.iter_mut() {
        update_enemy_bullet(b, ctx, events);
    }
}
