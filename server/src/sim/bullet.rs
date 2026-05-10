//! Bullet integration. Stub.
//!
//! Production form is SoA pools (see plan §"Contiguous storage"); a Vec is
//! fine until profiling justifies the layout flip.
//!
//! ── Phase 2 port (in progress) ────────────────────────────────────────────
//!
//! Mirrors `js/sim/bullet.js::updatePlayerBullet`. Implements the linear
//! drift, helix offset, and predictive-lead homing branches of the player
//! bullet step. Piercing / explosive remain deferred (collision-side, Phase
//! 2.5). Enemy bullets remain deferred as well — see `update_enemy_bullet`
//! stub below.
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

// ── Phase 2.1+: enemy-bullet step ───────────────────────────────────────
//
// `js/sim/bullet.js::updateEnemyBullet` switches on `movementPattern` and
// has 17 distinct cases (aimed, mine, homing_mine, spread, rapid, spiral,
// burst, explosive, laser, laser_beam, missile, homing, titan_homing,
// titan_rocket, missile_decelerate, pulse, shield_burst, wave_energy,
// energy_slash, crescent_*, sine_wave, sine_wave_nospin, missile_fast_slow)
// plus boss-rage homing composition, mine HP-death, persistent timed
// lifetime (mines / lightning orbs), and distance-based fade. That's a
// session of its own — leaving an unimplemented marker so the wiring agent
// gets a clear "not yet" instead of silent fallthrough.
#[allow(dead_code)]
pub fn update_enemy_bullet() {
    // TODO Phase 2.1+: port js/sim/bullet.js::updateEnemyBullet.
    // See module docstring for the full deferred-branches list.
    unimplemented!("enemy bullets not yet ported — see module docstring");
}
