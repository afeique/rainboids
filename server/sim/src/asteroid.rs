//! Asteroid physics — authoritative, mirroring `js/sim/asteroid.js::updateAsteroid()`.
//!
//! Tick model: `update_asteroid` advances one asteroid by exactly one logic
//! tick. Position deltas are scaled by `ctx.tick_scale` (matching the JS
//! `30/60 = 0.5` used in solo gameplay). The constants `ASTEROID_MAX_SPEED`
//! and `ASTEROID_BOUNCE_DAMP` are copied verbatim from `js/sim/asteroid.js`
//! and are the binding contract with the JS pure step.
//!
//! The `Asteroid` struct here is the SIM-LEVEL working state — distinct
//! from the wire-level `crate::protocol::AsteroidState` (which is just
//! `id`/`size`/`x`/`y` for snapshots). The wire type and the sim type
//! converge in Phase 3 when client prediction wires through.
//!
//! What lives here:
//!   - Speed-cap clamp (currentSpeed > 2.0 → renormalize to 2.0)
//!   - Position update (x += vx * tick_scale)
//!   - Boundary bounce (with 0.9 damp) OR wraparound fallback
//!   - 3D rotation accumulation (rot_x += rot_vel_x, etc.)
//!   - Death-flash countdown (tick down, deactivate at 0)
//!
//! Out of scope (deferred to later sessions):
//!   - Warp-in entry animation (presentation; wrapper handles)
//!   - 3D vertex projection (drawing concern)
//!   - Hit-flash visual timer (presentation)
//!   - Split logic — the live game does it from the collision system,
//!     which will move into `sim/collision.rs` in a later session.
//!
//! Parity fixture: `server/tests/parity_asteroid.rs::asteroid_basic_drift`
//! drives 60 ticks of pure linear drift with field 1920×1080 and asserts
//! agreement with JS within f32 tolerance (0.01 px / 0.001 rad).
//!
//! The existing `update_all` stub at the bottom of this file is a
//! placeholder for the wire-state integration that gets wired in Phase 3
//! (snapshot diff). It is intentionally left untouched here; the new
//! `update_asteroid` is the parity-tested function.

use crate::protocol::{AsteroidState, GameEvent};

use super::state::Field;

// ── Constants copied verbatim from js/sim/asteroid.js ───────────────────
//
// JS: `const ASTEROID_MAX_SPEED = 2.0;` (asteroid.js:37)
// Drift cap (px per logic tick, post-scale). Split fragments may spawn
// at 4.5–7.5 initial speed and renormalize to this on the next tick.
pub const ASTEROID_MAX_SPEED: f32 = 2.0;

// JS: `const ASTEROID_BOUNCE_DAMP = 0.9;` (asteroid.js:41)
// Boundary-bounce energy retention — slightly more elastic than the
// ship's 0.8 (intentional gameplay feel difference).
pub const ASTEROID_BOUNCE_DAMP: f32 = 0.9;

/// Sim-level asteroid state. Mirrors the JS `AsteroidState` typedef
/// in `js/sim/state.js` (lines 387–407, agent E's round-2 addition).
///
/// `f32` throughout for parity with the JS f64 → f32 boundary at the
/// snapshot wire layer. `bool` for `active` / `warping`. `u32` for the
/// death-flash countdown (frames remaining, decremented per tick).
#[derive(Debug, Clone, Copy)]
pub struct Asteroid {
    pub id: u32,
    pub size: f32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    pub rot_x: f32,
    pub rot_y: f32,
    pub rot_z: f32,
    pub rot_vel_x: f32,
    pub rot_vel_y: f32,
    pub rot_vel_z: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub level: u32,
    pub active: bool,
    pub warping: bool,
    pub death_flash: u32,
}

impl Asteroid {
    /// Construct a fresh asteroid with the JS `freshAsteroidState`
    /// defaults (state.js:501–523). Override fields by mutating after
    /// construction or via struct-update syntax.
    pub fn fresh(id: u32) -> Self {
        Self {
            id,
            size: 30.0,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            radius: 30.0,
            rot_x: 0.0,
            rot_y: 0.0,
            rot_z: 0.0,
            rot_vel_x: 0.0,
            rot_vel_y: 0.0,
            rot_vel_z: 0.0,
            hp: 1.0,
            max_hp: 1.0,
            level: 1,
            active: true,
            warping: false,
            death_flash: 0,
        }
    }
}

/// Per-tick context for `update_asteroid`. Mirrors the JS
/// `AsteroidUpdateContext` typedef (state.js:410–415).
///
/// `field: None` selects the wraparound branch (effectively dead in
/// solo play; kept for robustness — see `update_asteroid` for details).
#[derive(Debug, Clone)]
pub struct AsteroidContext {
    pub field: Option<Field>,
    pub tick_scale: f32,
    pub wrap_width: f32,
    pub wrap_height: f32,
}

/// Pure asteroid-update step. One tick of motion + rotation.
///
/// Order of operations is **load-bearing for parity** — see the
/// matching block comments in `js/sim/asteroid.js::updateAsteroid()`.
/// Do not reorder without a matching change on the JS side.
///
/// The `events` out-buffer is currently never written to; the slot
/// reserves space for the upcoming split migration when collision
/// moves into the sim layer.
pub fn update_asteroid(
    asteroid: &mut Asteroid,
    ctx: &AsteroidContext,
    _events: &mut Vec<AsteroidEvent>,
) {
    if !asteroid.active {
        return;
    }

    // ── Warp-in: skip motion / boundary while phasing in ──
    // The wrapper handles the warp animation (presentation concern).
    // Early-exit so rotation & position don't double-advance.
    if asteroid.warping {
        return;
    }

    // ── Death flash: tick down, deactivate at zero ──
    // JS asteroid.js:70–76. Motion stops once mid-explosion.
    if asteroid.death_flash > 0 {
        asteroid.death_flash -= 1;
        if asteroid.death_flash == 0 {
            asteroid.active = false;
        }
        return;
    }

    // ── Speed cap ──
    // JS asteroid.js:83–87. Renormalize when |v| > 2.0.
    let speed = (asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy).sqrt();
    if speed > ASTEROID_MAX_SPEED {
        asteroid.vx = (asteroid.vx / speed) * ASTEROID_MAX_SPEED;
        asteroid.vy = (asteroid.vy / speed) * ASTEROID_MAX_SPEED;
    }

    // ── Position update ──
    // JS asteroid.js:92–93. The `* tick_scale` factor matches the
    // 30 Hz logical units the JS engine stores velocities in.
    asteroid.x += asteroid.vx * ctx.tick_scale;
    asteroid.y += asteroid.vy * ctx.tick_scale;

    // ── Boundary handling ──
    // JS asteroid.js:98–126. With a field, bounce with 0.9 damp;
    // without a field, fall back to torus wraparound at radius * 2 buffer.
    if let Some(field) = &ctx.field {
        let r = asteroid.radius;
        if asteroid.x - r < 0.0 {
            asteroid.x = r;
            asteroid.vx = asteroid.vx.abs() * ASTEROID_BOUNCE_DAMP;
        } else if asteroid.x + r > field.width {
            asteroid.x = field.width - r;
            asteroid.vx = -asteroid.vx.abs() * ASTEROID_BOUNCE_DAMP;
        }
        if asteroid.y - r < 0.0 {
            asteroid.y = r;
            asteroid.vy = asteroid.vy.abs() * ASTEROID_BOUNCE_DAMP;
        } else if asteroid.y + r > field.height {
            asteroid.y = field.height - r;
            asteroid.vy = -asteroid.vy.abs() * ASTEROID_BOUNCE_DAMP;
        }
    } else {
        // Wraparound — only used when no field is supplied. Live engine
        // call sites always pass a field; kept for robustness.
        let buf = asteroid.radius * 2.0;
        if asteroid.x < -buf {
            asteroid.x = ctx.wrap_width + buf;
        }
        if asteroid.x > ctx.wrap_width + buf {
            asteroid.x = -buf;
        }
        if asteroid.y < -buf {
            asteroid.y = ctx.wrap_height + buf;
        }
        if asteroid.y > ctx.wrap_height + buf {
            asteroid.y = -buf;
        }
    }

    // ── 3D rotation ──
    // JS asteroid.js:133–135. Always runs (even if motion is clamped)
    // matching the original "for consistency" comment.
    asteroid.rot_x += asteroid.rot_vel_x;
    asteroid.rot_y += asteroid.rot_vel_y;
    asteroid.rot_z += asteroid.rot_vel_z;
}

/// Loop helper. Calls `update_asteroid` over a slice with the same context.
pub fn update_asteroids(
    asteroids: &mut [Asteroid],
    ctx: &AsteroidContext,
    events: &mut Vec<AsteroidEvent>,
) {
    for asteroid in asteroids.iter_mut() {
        update_asteroid(asteroid, ctx, events);
    }
}

/// Side-effect events emitted by `update_asteroid`. Currently empty;
/// reserved for the upcoming split migration when collision moves
/// into the sim layer (the split happens on bullet-hit, not on tick,
/// so the variant set here is conservative).
#[derive(Debug, Clone, Copy)]
pub enum AsteroidEvent {
    /// Reserved. The split event will land here when collision moves
    /// into the sim layer — `parent_id` plus the spawned fragment count
    /// will let the engine driver materialize the children pool entries.
    Split { parent_id: u32, fragments: u8 },
}

// ── Wire-state integration stub (Phase 3) ───────────────────────────────
//
// Existing entry point called from `simulate_tick` in `mod.rs`. The
// real wire ↔ sim bridging will land when client prediction wires up;
// for now this is a no-op that satisfies the existing call site.
pub fn update_all(_asteroids: &mut Vec<AsteroidState>, _dt: f32, _events: &mut Vec<GameEvent>) {}
