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
//!   - Enemy bullets (movementPattern dispatch + per-pattern velocity, mine
//!     HP, persistent timed lifetime, distance-based fade, boss-rage homing)
//!     — js bullet.js:183–593. See `update_enemy_bullet` stub below.
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
