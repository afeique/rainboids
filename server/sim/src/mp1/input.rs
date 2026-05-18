//! Phase-1 PlayerInput — the per-tick input snapshot the ship step
//! consumes. Mirrors the fields `js/sim/ship.js` reads from its
//! `InputFrame` (aimX, aimY, up/down/left/right, thrustPower, etc.).
//! Authored fresh 2026-05-17.

use serde::{Deserialize, Serialize};

/// Tick rate scale: solo's physics is calibrated at 30Hz but the loop
/// runs at 60Hz. `TICK_SCALE = 30/60 = 0.5` baked into thrust/maxV/etc.
/// Mirrors `GAME_CONFIG.TICK_SCALE` in solo's constants.js.
pub const TICK_SCALE: f32 = 0.5;

/// Per-tick thrust impulse. `2.0 * TICK_SCALE` matches the wrapper at
/// `js/modules/player/player.js:56` (`this.thrustPower = 2.0 * GAME_CONFIG.TICK_SCALE`).
pub const THRUST_PER_TICK: f32 = 2.0 * TICK_SCALE; // = 1.0

/// Speed cap (px / tick). `7 * TICK_SCALE` matches `MAX_V` in constants.js.
pub const MAX_V: f32 = 7.0 * TICK_SCALE; // = 3.5

/// Per-tick friction multiplier. `pow(0.5, TICK_SCALE)` matches the
/// wrapper at `js/modules/player/player.js:685`.
/// Computed at runtime to keep the file pure-data; f32 only.
pub fn friction_per_tick() -> f32 {
    (0.5_f32).powf(TICK_SCALE)
}

/// Velocity-snap threshold: under this magnitude, vx/vy clamps to 0
/// to prevent perpetual subpixel drift. Matches `velEpsilon = 0.05`
/// in the wrapper.
pub const VEL_EPSILON: f32 = 0.05;

/// Boundary-bounce damping factor. Matches `bounceDamp = 0.8`.
pub const BOUNCE_DAMP: f32 = 0.8;

/// Per-tick input snapshot for one player. All fields plain f32 / bool
/// for Phase 1 — the wire-format packing (PackedInput with i8/f16) is
/// deferred to Phase 2 when networking lands.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct PlayerInput {
    /// Movement keys (WASD or arrow keys; both map here).
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,

    /// World-space aim target (mouse position projected to world coords).
    pub aim_x: f32,
    pub aim_y: f32,

    /// Speed multiplier from powerups (1.0 = baseline). Phase 1 always 1.0.
    pub speed_mult: f32,

    /// Per-tick thrust impulse (already scaled by TICK_SCALE).
    /// Solo passes `Player.thrustPower` which is `2.0 * TICK_SCALE` by default.
    pub thrust_power: f32,

    /// When true, all thrust input is ignored (mirrors solo's
    /// `thrustersDisabled` powerup state). Phase 1 always false.
    pub thrusters_disabled: bool,

    /// Fire button held this tick. Reserved for Phase 3 weapons; ship
    /// step doesn't read it.
    pub fire: bool,
}

impl PlayerInput {
    /// Construct a default-tuned input frame for solo-equivalent baseline.
    pub fn neutral() -> Self {
        Self {
            up: false,
            down: false,
            left: false,
            right: false,
            aim_x: 0.0,
            aim_y: 0.0,
            speed_mult: 1.0,
            thrust_power: THRUST_PER_TICK,
            thrusters_disabled: false,
            fire: false,
        }
    }
}
