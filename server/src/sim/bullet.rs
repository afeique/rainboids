//! Bullet integration. Stub.
//!
//! Production form is SoA pools (see plan §"Contiguous storage"); a Vec is
//! fine until profiling justifies the layout flip.
//!
//! ── Phase 2 port (in progress) ────────────────────────────────────────────
//!
//! Mirrors `js/sim/bullet.js`. **Player bullets** (`update_player_bullet`)
//! implement the linear drift + helix offset + predictive-lead homing
//! branches (PR #27). **Enemy bullets** (`update_enemy_bullet`) implement
//! 11 of ~17 movement patterns:
//!
//!   - `Straight` — js `aimed`/`crescent_beam`/`crescent_slice` (no-mod path). (PR #29)
//!   - `Sine` — js `sine_wave_nospin` (perpendicular sine offset). (PR #29)
//!   - `Decelerate` — js `missile_decelerate` (subtractive speed decay). (PR #29)
//!   - `Spread` — js `spread` (patternTimer-driven sine on a perp-of-base axis).
//!   - `Spiral` — js `spiral` (rotating velocity vector + spreading radius).
//!   - `WaveEnergy` — js `wave_energy` (large-amplitude sine on perp-of-base axis).
//!   - `ShieldBurst` — js `shield_burst` (high-freq wobble on perp-of-base axis).
//!   - `Burst` — js `burst` (patternTimer-driven linear acceleration on base velocity).
//!   - `Pulse` — js `pulse` (patternTimer-driven linear acceleration on base velocity, steeper).
//!   - `EnergySlash` — js `energy_slash` (slashProgress curve + patternTimer pulse).
//!   - `SineWaveRotation` — js `sine_wave` (Sine variant that aligns rotation
//!     to travel direction; differs from `Sine` only via the `rotation` field).
//!
//! Deferred to follow-up sessions:
//!
//!   - Piercing / piercedEnemies counter — collision-side, Phase 2.5
//!   - Explosive / explosionRadius — collision-side, Phase 2.5
//!   - 6 remaining enemy patterns (js bullet.js:259–593): `mine`,
//!     `homing_mine`, `rapid`, `explosive`, `laser`, `laser_beam`,
//!     `missile`, `homing`, `titan_homing`, `titan_rocket`,
//!     `missile_fast_slow`. (Several require `target_player`, RNG, or
//!     persistent-timed lifetime; gated on context-plumbing PRs.)
//!   - Boss-rage homing composition, mine HP-death, persistent timed
//!     lifetime (mines / lightning orbs), `targetPlayer` lookups.
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
//!   6. Homing nudge — JS bullet.js:79–81 + applyPlayerHoming. Applied
//!      BEFORE position update.
//!   7. Position update: `x += vx; y += vy`.
//!      NOTE: player-bullet path does NOT scale by `tickScale` — only enemy
//!      bullets do. (`tickScale` is captured in the context for symmetry with
//!      the enemy path.)
//!   8. Helix offset — JS bullet.js:92–102. Applied AFTER position update.
//!      Adds the **delta** of the per-frame sine so the underlying rail
//!      position still advances by `vel` exactly.
//!   9. Boundary check (50 px margin): if outside, deactivate, set
//!      `expired_by_bounds`, emit Despawn.
//!
//! Parity fixtures: `server/tests/parity_bullet.rs` (linear-drift, helix,
//! homing).

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

// ── Phase 2: player-bullet step (linear-drift + helix + homing) ─────────

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

// JS bullet.js:128 — predictive-lead horizon (frames) for homing.
const HOMING_LEAD_TIME: f32 = 8.0;

// JS bullet.js:140 — maximum per-tick angular turn rate (radians) for
// homing. Hard clamps the bullet's heading change so it can still miss.
const HOMING_MAX_TURN_RATE: f32 = 0.15;

// JS bullet.js:151 — distance-based homing strength bonus radius (px).
// Within `HOMING_RAMP_RADIUS` of the target, homing strength scales up
// linearly to 2× its base value at zero distance.
const HOMING_RAMP_RADIUS: f32 = 200.0;

// JS bullet.js:162 — speed multiplier applied after the homing turn so
// homing bullets travel slightly faster than baseline.
const HOMING_SPEED_BOOST: f32 = 1.1;

/// Minimal player-bullet state for the linear/helix/homing path.
///
/// Skips piercing / explosive flags and motion state (`startX/startY` for
/// distance-based logic, `angle/rotation` for rendered orientation) — those
/// will be added when their JS branches port. See module docstring for the
/// full deferred list.
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

    // ── Helix (Rail-Driver double-helix bullets) — JS bullet.js:92–102 ─
    /// Enables the perpendicular-sine offset. When false, the helix
    /// branch is bypassed entirely.
    pub helix_active: bool,
    /// Angular frequency of the sine, applied to `life` each tick. JS
    /// state.js:591.
    pub helix_freq: f32,
    /// Phase offset (radians) — paired Rail-Driver bullets typically use
    /// 0 and π so they cross every half-period. JS state.js:592.
    pub helix_phase: f32,
    /// Amplitude (px) of the sine offset. JS state.js:593.
    pub helix_amplitude: f32,

    // ── Homing — JS bullet.js:79–81 + applyPlayerHoming ────────────────
    /// Enables the predictive-lead homing branch. When false, the homing
    /// nudge is skipped entirely.
    pub homing: bool,
    /// Base homing-strength factor. JS state.js:589. Distance-scaled
    /// inside `apply_player_homing` (stronger when closer).
    pub homing_strength: f32,

    // TODO Phase 2.5: piercing, pierced_enemies (collision-side)
    // TODO Phase 2.5: explosive, explosion_radius (collision-side)
    // TODO Phase 2.1+: start_x, start_y (distance-based fade)
    // TODO Phase 2.1+: angle, rotation, rotation_speed (sprite orientation)
}

/// Predictive-lead homing target — current position + velocity. Lifted
/// from JS `BulletUpdateContext.homingTarget` (passed as `target.x`,
/// `target.y`, `target.vel.x`, `target.vel.y`). Flattened here to avoid
/// an extra indirection — the wrapper translates from the JS shape.
#[derive(Debug, Clone, Copy)]
pub struct TargetPosition {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
}

/// Per-tick context for player-bullet updates.
///
/// Field names mirror `BulletUpdateContext` in `js/sim/state.js`. Fields not
/// consumed by the linear/helix/homing path (`logic_tick_seconds`, `now`,
/// RNG, enemy-side `target_player`) are documented but elided — they'll
/// come back when their branches port.
#[derive(Debug, Clone, Copy)]
pub struct PlayerBulletContext {
    /// Render-rate scaler (`30 / 60 = 0.5`). Player-bullet linear path does
    /// NOT consume this — only enemy bullets do — but it's retained on the
    /// context so a unified `BulletUpdateContext` can serve both kinds when
    /// the enemy branch lands.
    pub tick_scale: f32,
    /// Baseline bullet speed (`GAME_CONFIG.BULLET_SPEED`). Used by the
    /// homing branch to compute `desiredVel` magnitude and the post-turn
    /// speed cap. JS bullet.js:80, 137, 162.
    pub bullet_speed: f32,
    /// World boundaries (px). JS bullet.js:107–108.
    pub boundary_width: f32,
    pub boundary_height: f32,
    /// Predictive-lead homing target. `None` disables the homing nudge
    /// (matches the JS `bullet.homing && ctx.homingTarget` short-circuit
    /// at bullet.js:79). JS state.js:489.
    pub homing_target: Option<TargetPosition>,
    // TODO Phase 2.1+: logic_tick_seconds (enemy pattern timer + persistent)
    // TODO Phase 2.1+: now_ms (persistent bullet age)
    // TODO Phase 2.1+: target_player (enemy homing patterns)
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

/// Single-bullet step. Mirrors `js/sim/bullet.js::updatePlayerBullet`
/// (linear-drift + helix + predictive-lead homing).
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

    // 6. Homing — predictive-lead nudge applied BEFORE the position step.
    //    JS bullet.js:79–81. The wrapper supplies the chosen target via
    //    `ctx.homing_target`; if either the bullet flag or the target is
    //    missing, the branch is bypassed.
    if b.homing {
        if let Some(target) = ctx.homing_target {
            apply_player_homing(b, &target, ctx.bullet_speed);
        }
    }

    // 7. Position update (JS bullet.js:84–85). Player-bullet path does NOT
    //    scale by tick_scale — that's enemy-bullets only. `_` to silence
    //    unused-field lint for the field-on-context that's retained for
    //    later branches.
    let _ = ctx.tick_scale;
    b.x += b.vx;
    b.y += b.vy;

    // 8. Helix offset (JS bullet.js:92–102). Applied AFTER the position
    //    update. We add the **delta** of the sine each frame so the
    //    underlying rail position still advances by `vel` exactly. Two
    //    bullets with phases 0 and π cross every half-period.
    if b.helix_active {
        let speed = b.vx.hypot(b.vy);
        // JS guards against zero-speed division with `|| 1` (line 93).
        let speed = if speed == 0.0 { 1.0 } else { speed };
        let ux = -b.vy / speed;
        let uy = b.vx / speed;
        let t = b.life as f32;
        let s_now = (t * b.helix_freq + b.helix_phase).sin();
        let s_prev = ((t - 1.0) * b.helix_freq + b.helix_phase).sin();
        let delta = (s_now - s_prev) * b.helix_amplitude;
        b.x += ux * delta;
        b.y += uy * delta;
    }

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

/// Predictive-lead homing nudge. Mirrors
/// `js/sim/bullet.js::applyPlayerHoming` byte-for-byte (lines 127–167).
///
/// 1. Project the target's position 8 frames ahead using its velocity.
/// 2. Compute the desired velocity direction (unit vector → bulletSpeed).
/// 3. Compute the angular delta from the bullet's current heading,
///    clamped to `HOMING_MAX_TURN_RATE` per tick.
/// 4. Lerp the bullet's velocity toward the new heading by a
///    distance-scaled `homing_strength`.
/// 5. Re-normalize speed to `bulletSpeed * HOMING_SPEED_BOOST`.
fn apply_player_homing(b: &mut PlayerBullet, target: &TargetPosition, bullet_speed: f32) {
    // Lead the target by 8 frames (JS bullet.js:128–130).
    let predicted_x = target.x + target.vx * HOMING_LEAD_TIME;
    let predicted_y = target.y + target.vy * HOMING_LEAD_TIME;

    let dx = predicted_x - b.x;
    let dy = predicted_y - b.y;
    let distance = dx.hypot(dy);
    if distance <= 0.0 {
        return;
    }

    let desired_vel_x = (dx / distance) * bullet_speed;
    let desired_vel_y = (dy / distance) * bullet_speed;

    let current_angle = b.vy.atan2(b.vx);
    let desired_angle = desired_vel_y.atan2(desired_vel_x);

    // Wrap angle delta into [-π, π] (JS bullet.js:144–146).
    let mut angle_diff = desired_angle - current_angle;
    if angle_diff > std::f32::consts::PI {
        angle_diff -= 2.0 * std::f32::consts::PI;
    }
    if angle_diff < -std::f32::consts::PI {
        angle_diff += 2.0 * std::f32::consts::PI;
    }
    let actual_turn = angle_diff.signum() * angle_diff.abs().min(HOMING_MAX_TURN_RATE);
    let new_angle = current_angle + actual_turn;

    // Distance-based homing strength — 1× at HOMING_RAMP_RADIUS, 2× at
    // zero distance. JS bullet.js:151.
    let near_distance = distance.min(HOMING_RAMP_RADIUS);
    let homing_strength =
        b.homing_strength * (1.0 + (HOMING_RAMP_RADIUS - near_distance) / HOMING_RAMP_RADIUS);

    let current_speed = b.vx.hypot(b.vy);
    let target_vel_x = new_angle.cos() * current_speed;
    let target_vel_y = new_angle.sin() * current_speed;

    // Lerp current velocity toward target velocity (JS bullet.js:157–158).
    b.vx = b.vx * (1.0 - homing_strength) + target_vel_x * homing_strength;
    b.vy = b.vy * (1.0 - homing_strength) + target_vel_y * homing_strength;

    // Maintain consistent speed with slight boost when homing (JS
    // bullet.js:161–166).
    let speed_after = b.vx.hypot(b.vy);
    let target_speed = bullet_speed * HOMING_SPEED_BOOST;
    if speed_after > 0.0 {
        b.vx = (b.vx / speed_after) * target_speed;
        b.vy = (b.vy / speed_after) * target_speed;
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
// has ~17 distinct cases. Implemented so far (11):
//
//   - `Straight` (aimed / crescent_beam / crescent_slice — no-mod path).
//   - `Sine` (sine_wave_nospin — perpendicular sin(phase)*amp offset).
//   - `Decelerate` (missile_decelerate — subtract decel each tick, clamp
//     at min_speed; expire when at floor).
//   - `Spread` (patternTimer-driven sin offset on baseAngle+π/2 axis;
//     amplitude 0.5, frequency 3, plus a fixed patternPhase offset).
//   - `Spiral` (per-tick rotation of velocity vector; speed taken from
//     baseVx/baseVy magnitude, angle drifts at `spiral_rate * patternTimer`,
//     with a centrifugal `patternTimer * 0.05` perpendicular term).
//   - `WaveEnergy` (high-amplitude sin on baseAngle+π/2 axis with the
//     0.1 attenuation factor; pattern timer ramp).
//   - `ShieldBurst` (high-freq sin(patternTimer*8)*0.2 wobble on
//     baseAngle+π/2 axis).
//   - `Burst` (`baseVel *= 1 + patternTimer * 0.5` — pure timer-driven
//     linear acceleration on base velocity).
//   - `Pulse` (`baseVel *= 1 + patternTimer * 0.8` — same shape as `Burst`
//     but steeper).
//   - `EnergySlash` (slashProgress curve on perp axis + patternTimer pulse
//     intensity scale; no RNG, no target).
//   - `SineWaveRotation` (Sine variant that additionally aligns
//     `bullet.rotation` to atan2(vy, vx) inside the pattern step; the
//     post-step rotation accumulator then adds `rotation_speed * tick_scale`).
//
// The remaining patterns are TODO; see module docstring for the full list.
//
// Order of operations is **load-bearing for parity** — exactly mirrors the
// JS `updateEnemyBullet` body (js bullet.js:183–249):
//
//   1. Active-guard (early return if !active).
//   2. `applyEnemyMovementPattern(b, ctx)` — pattern-specific velocity
//      mutation. May set `active=false` + `expired_by_distance=true`
//      (decelerate at min-speed floor). For `SineWaveRotation` it also
//      writes `bullet.rotation = atan2(vy, vx)`.
//   3. Position update: `x += vx * tick_scale; y += vy * tick_scale`.
//      NOTE: enemy-bullet path **does** scale by tick_scale; player does not.
//   4. Rotation accumulator: `rotation += rotation_speed * tick_scale`
//      (JS bullet.js:197). Composes with any rotation written by the
//      pattern step — e.g. `SineWaveRotation` overwrites rotation in step
//      2, then step 4 adds the per-tick rotation_speed delta.
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

// JS bullet.js:300–301 — `spread` pattern: per-tick sin frequency and
// amplitude (px/tick equivalent units). The wave is applied on the
// `baseAngle + π/2` axis with an additional fixed `patternPhase` offset.
const SPREAD_WAVE_FREQ: f32 = 3.0;
const SPREAD_WAVE_AMP: f32 = 0.5;

// JS bullet.js:319–323 — `spiral` pattern: `spiralRate` controls how fast
// the velocity vector rotates per second; `0.1` is the perpendicular
// centrifugal contribution applied to a radius that grows as
// `patternTimer * 0.5`. The final formula factors to `patternTimer * 0.05`
// on the perpendicular axis.
const SPIRAL_RATE: f32 = 2.0;
const SPIRAL_RADIUS_RATE: f32 = 0.5;
const SPIRAL_PERP_FACTOR: f32 = 0.1;

// JS bullet.js:493–494 — `wave_energy`: large amplitude (15) gated by a
// `0.1` factor, plus frequency 3. Same perp axis as `spread`.
const WAVE_ENERGY_FREQ: f32 = 3.0;
const WAVE_ENERGY_AMP: f32 = 15.0;
const WAVE_ENERGY_VEL_SCALE: f32 = 0.1;

// JS bullet.js:485 — `shield_burst`: sin(patternTimer*8)*0.2 wobble.
const SHIELD_BURST_FREQ: f32 = 8.0;
const SHIELD_BURST_AMP: f32 = 0.2;

// JS bullet.js:328 — `burst`: linear timer-acceleration on base velocity.
// `bullet.vx = bullet.baseVx * (1 + patternTimer * 0.5)`.
const BURST_ACCEL_RATE: f32 = 0.5;

// JS bullet.js:478 — `pulse`: linear timer-acceleration on base velocity.
// Same shape as `burst` but steeper coefficient: `*(1 + patternTimer * 0.8)`.
const PULSE_ACCEL_RATE: f32 = 0.8;

// JS bullet.js:507–509 — `energy_slash`: perpendicular curve driven by
// `sin(slashProgress * π)` with amplitude `0.3`. JS code:
//   curveOffset = sin(slashProgress * π) * 0.3
const ENERGY_SLASH_CURVE_INTENSITY: f32 = 0.3;

// JS bullet.js:515 — `energy_slash`: post-curve velocity scale by
// `1 + sin(patternTimer * 8) * 0.1`. High-freq pulse, low amplitude.
const ENERGY_SLASH_PULSE_FREQ: f32 = 8.0;
const ENERGY_SLASH_PULSE_AMP: f32 = 0.1;

/// Enemy-bullet movement pattern. 11 of ~17 ported so far — see module
/// docstring for the deferred list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletPattern {
    /// JS `aimed` / `crescent_beam` / `crescent_slice` — straight-line drift,
    /// no per-tick velocity adjustment.
    Straight,
    /// JS `sine_wave_nospin` — drift along base velocity plus perpendicular
    /// `sin(sine_phase) * sine_amp` offset; advances `sine_phase` by
    /// `sine_freq` each tick. Does NOT modify rotation. (The `SineWaveRotation`
    /// variant additionally aligns rotation to travel direction.)
    Sine,
    /// JS `missile_decelerate` — subtractive speed decay each tick. When the
    /// speed reaches `min_speed`, the bullet expires (`expired_by_distance`).
    Decelerate,
    /// JS `spread` — patternTimer-driven sin offset on the `baseAngle+π/2`
    /// axis. Frequency 3, amplitude 0.5, plus a fixed `pattern_phase`
    /// offset that fans out a single volley.
    Spread,
    /// JS `spiral` — rotating velocity vector. Speed comes from the magnitude
    /// of (base_vx, base_vy); the angle drifts at `SPIRAL_RATE * patternTimer`
    /// relative to baseAngle, and the bullet also accumulates a centrifugal
    /// perpendicular contribution that grows linearly with patternTimer.
    Spiral,
    /// JS `wave_energy` — large-amplitude sin offset on the `baseAngle+π/2`
    /// axis. Frequency 3, amplitude 15, scaled down by 0.1 in velocity units.
    WaveEnergy,
    /// JS `shield_burst` — high-frequency `sin(patternTimer*8)*0.2` wobble
    /// on the `baseAngle+π/2` axis. No pattern_phase or extra state.
    ShieldBurst,
    /// JS `burst` — `vx = baseVx * (1 + patternTimer * 0.5)`. Pure timer-driven
    /// linear acceleration on the base velocity (both axes scaled identically).
    Burst,
    /// JS `pulse` — `vx = baseVx * (1 + patternTimer * 0.8)`. Same shape as
    /// `Burst` with a steeper acceleration coefficient.
    Pulse,
    /// JS `energy_slash` — perpendicular curve from `sin(slashProgress * π)`
    /// (amplitude `ENERGY_SLASH_CURVE_INTENSITY`) added to the base velocity,
    /// then the whole vector is scaled by `1 + sin(patternTimer * 8) * 0.1`.
    /// Reads `slash_progress` from the bullet; that field is treated as 0 if
    /// unset (matches JS `bullet.slashProgress || 0`).
    EnergySlash,
    /// JS `sine_wave` — same as `Sine` (perpendicular sin offset) but also
    /// writes `bullet.rotation = atan2(vy, vx)` inside the pattern step so
    /// the bullet visually faces its travel direction. The post-step rotation
    /// accumulator then adds `rotation_speed * tick_scale` to the overwritten
    /// value, exactly matching the JS order of operations.
    SineWaveRotation,
    // TODO Phase 2.1+: Helix, Homing, Ricochet, Rocket, Mine, Bezier, Charge,
    // Rapid, Explosive, Laser, LaserBeam, Missile, TitanHoming, TitanRocket,
    // MissileFastSlow, HomingMine.
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
    /// JS state.js:456 — pattern-specific phase offset (used by `Spread`
    /// for fan-out; reserved for other future patterns like `energy_slash`).
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

    // ── EnergySlash pattern state ─────────────────────────────────────
    /// JS state.js:474 — 0..1 progress used by `energy_slash` to drive the
    /// `sin(slashProgress * π) * curveIntensity` perpendicular curve. JS
    /// treats this as 0 if absent (`bullet.slashProgress || 0` at
    /// bullet.js:508). The wrapper sets it from the spawning enemy's
    /// slash animation; the pattern step does NOT advance it.
    pub slash_progress: f32,

    // ── Rotation (sprite orientation) ─────────────────────────────────
    /// JS state.js:433 — bullet rotation in radians. Set per-tick by some
    /// patterns (`SineWaveRotation`, `missile`, `missile_fast_slow`) and
    /// also incremented by `rotation_speed * tick_scale` after the position
    /// update (JS bullet.js:197). Default 0.
    pub rotation: f32,
    /// JS state.js:434 — per-tick rotation delta (radians). Added each tick
    /// after the position update, regardless of pattern. Default 0.
    pub rotation_speed: f32,

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

        // JS bullet.js:299–306 — `spread`. Sin wave on the perp axis of the
        // base direction. Note the JS `speed` and `baseAngle` are computed
        // from `bullet.baseVx/baseVy` at the TOP of `applyEnemyMovementPattern`
        // (lines 265–266) — we recompute baseAngle locally where it's used.
        BulletPattern::Spread => {
            let base_angle = b.base_vy.atan2(b.base_vx);
            let perp_angle = base_angle + std::f32::consts::FRAC_PI_2;
            let wave_offset = (b.pattern_timer * SPREAD_WAVE_FREQ + b.pattern_phase).sin()
                * SPREAD_WAVE_AMP;
            b.vx = b.base_vx + perp_angle.cos() * wave_offset;
            b.vy = b.base_vy + perp_angle.sin() * wave_offset;
        }

        // JS bullet.js:318–324 — `spiral`. Speed comes from the magnitude of
        // the base velocity; angle rotates at `SPIRAL_RATE * patternTimer`.
        // A perpendicular centrifugal term grows linearly with patternTimer
        // (`patternTimer * SPIRAL_RADIUS_RATE * SPIRAL_PERP_FACTOR`, which
        // is the JS `spiralRadius * 0.1` factored).
        BulletPattern::Spiral => {
            let speed = (b.base_vx * b.base_vx + b.base_vy * b.base_vy).sqrt();
            let base_angle = b.base_vy.atan2(b.base_vx);
            let spiral_angle = base_angle + b.pattern_timer * SPIRAL_RATE;
            let spiral_radius = b.pattern_timer * SPIRAL_RADIUS_RATE;
            let perp_angle = spiral_angle + std::f32::consts::FRAC_PI_2;
            b.vx = spiral_angle.cos() * speed
                + perp_angle.cos() * spiral_radius * SPIRAL_PERP_FACTOR;
            b.vy = spiral_angle.sin() * speed
                + perp_angle.sin() * spiral_radius * SPIRAL_PERP_FACTOR;
        }

        // JS bullet.js:492–502 — `wave_energy`. Large-amplitude (15)
        // patternTimer-driven sin on the perp axis, scaled by 0.1 in
        // velocity units.
        BulletPattern::WaveEnergy => {
            let base_angle = b.base_vy.atan2(b.base_vx);
            let perp_angle = base_angle + std::f32::consts::FRAC_PI_2;
            let energy_wave_offset =
                (b.pattern_timer * WAVE_ENERGY_FREQ).sin() * WAVE_ENERGY_AMP;
            let wave_vel_x = perp_angle.cos() * energy_wave_offset * WAVE_ENERGY_VEL_SCALE;
            let wave_vel_y = perp_angle.sin() * energy_wave_offset * WAVE_ENERGY_VEL_SCALE;
            b.vx = b.base_vx + wave_vel_x;
            b.vy = b.base_vy + wave_vel_y;
        }

        // JS bullet.js:484–489 — `shield_burst`. High-frequency sin wobble
        // on the perp axis.
        BulletPattern::ShieldBurst => {
            let wobble = (b.pattern_timer * SHIELD_BURST_FREQ).sin() * SHIELD_BURST_AMP;
            let perp_angle = b.base_vy.atan2(b.base_vx) + std::f32::consts::FRAC_PI_2;
            b.vx = b.base_vx + perp_angle.cos() * wobble;
            b.vy = b.base_vy + perp_angle.sin() * wobble;
        }

        // JS bullet.js:327–332 — `burst`. `accelFactor = 1 + patternTimer * 0.5`.
        // Both axes scaled identically; same direction as base velocity.
        BulletPattern::Burst => {
            let accel_factor = 1.0 + b.pattern_timer * BURST_ACCEL_RATE;
            b.vx = b.base_vx * accel_factor;
            b.vy = b.base_vy * accel_factor;
        }

        // JS bullet.js:477–482 — `pulse`. Same shape as `Burst` but
        // steeper acceleration (`* 0.8` vs `* 0.5`).
        BulletPattern::Pulse => {
            let pulse_accel = 1.0 + b.pattern_timer * PULSE_ACCEL_RATE;
            b.vx = b.base_vx * pulse_accel;
            b.vy = b.base_vy * pulse_accel;
        }

        // JS bullet.js:505–519 — `energy_slash`. Three-step velocity build:
        //   1. Compute `curveOffset = sin(slashProgress * π) * 0.3`.
        //   2. Add curve along the perp-of-slash-direction axis.
        //   3. Multiply final velocity by `1 + sin(patternTimer * 8) * 0.1`.
        // `slashProgress` is read from the bullet; JS treats absent as 0.
        BulletPattern::EnergySlash => {
            let slash_direction = b.base_vy.atan2(b.base_vx);
            let curve_offset =
                (b.slash_progress * std::f32::consts::PI).sin() * ENERGY_SLASH_CURVE_INTENSITY;
            let perp_slash_direction = slash_direction + std::f32::consts::FRAC_PI_2;
            let curve_vel_x = perp_slash_direction.cos() * curve_offset;
            let curve_vel_y = perp_slash_direction.sin() * curve_offset;
            b.vx = b.base_vx + curve_vel_x;
            b.vy = b.base_vy + curve_vel_y;
            let pulse_intensity =
                1.0 + (b.pattern_timer * ENERGY_SLASH_PULSE_FREQ).sin() * ENERGY_SLASH_PULSE_AMP;
            b.vx *= pulse_intensity;
            b.vy *= pulse_intensity;
        }

        // JS bullet.js:526–534 — `sine_wave` (rotation variant of `Sine`).
        // Same perpendicular sin displacement as `Sine`, but additionally
        // writes `bullet.rotation = atan2(vy, vx)` so the needle visually
        // points in its travel direction. The post-step rotation accumulator
        // then adds `rotation_speed * tick_scale` to this value.
        BulletPattern::SineWaveRotation => {
            b.sine_phase += b.sine_freq;
            let displacement = b.sine_phase.sin() * b.sine_amp;
            b.vx = b.base_vx + b.sine_perp_x * displacement;
            b.vy = b.base_vy + b.sine_perp_y * displacement;
            // Align rotation with travel direction (JS bullet.js:532).
            b.rotation = b.vy.atan2(b.vx);
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

    // 4. Rotation accumulator (JS bullet.js:197). Adds `rotation_speed *
    //    tick_scale` regardless of pattern. For patterns that overwrite
    //    `rotation` inside step 2 (e.g. `SineWaveRotation`), this delta
    //    composes on top of the just-written value — matching JS order
    //    of operations exactly. For patterns whose `rotation_speed` is
    //    0 (the default), this is a no-op.
    b.rotation += b.rotation_speed * ctx.tick_scale;

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
