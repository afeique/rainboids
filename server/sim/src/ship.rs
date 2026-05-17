//! Ship physics — authoritative, mirroring `js/modules/player/player.js::update()`.
//!
//! Tick model: `update_all` advances each ship by exactly **one logic tick**
//! (`GAME_CONFIG.LOGIC_HZ = 60`, i.e. `1/60` s of game time). Per-tick velocity
//! is in pixels/tick; `THRUST_PER_TICK` and `FRICTION_PER_TICK` are therefore
//! unitless calibrated constants — they are **not** scaled by `dt`. The `dt`
//! argument exists for API symmetry with the rest of `simulate_tick`'s
//! subsystems and is intentionally ignored here. Calling `update_all` more
//! than once per tick will simulate that many ticks; calling at variable
//! `dt` will not produce variable-rate physics.
//!
//! All constants are copied verbatim from `js/modules/core/constants.js`
//! (`GAME_CONFIG.SHIP_THRUST` is unused by `player.js` — the live thrust
//! magnitude is `thrustPower = 2.0 * TICK_SCALE`, see player.js:37). These
//! are the binding contract with sibling A's `js/sim/ship.js`. If the
//! parity fixture (`server/tests/parity_vectors.rs::ship_basic_movement`)
//! drifts, suspect either a constant divergence or a math-order
//! divergence between the two impls.
//!
//! Out of scope for v1 (deferred to later sessions / files):
//!   - Powerup interactions (REFLEXES, LAST_STAND, STATIC_FIELD)
//!   - Damage handling (lifecycle.rs / client-authoritative for now)
//!   - Bullet emission (bullet.rs)
//!   - Health regen
//!   - Boundary handling — `update_all` does not have access to
//!     `GameState.field`; bouncing against the room field is a `room.rs`
//!     concern (or a future `update_all` signature change). The parity
//!     fixture stays well inside the field so this gap is not load-bearing.
//!   - Thrustersdisabled / EMP / phase-dash overrides — none of these
//!     are encoded in `PackedInput` yet.

use crate::protocol::ShipState;

use super::input::PlayerInput;
use super::state::PlayerInputs;

// ── Constants copied verbatim from js/modules/core/constants.js ──────────
//
// JS: `this.thrustPower = 2.0 * GAME_CONFIG.TICK_SCALE;`
// where TICK_SCALE = 30/60 = 0.5  →  thrustPower = 1.0
const THRUST_PER_TICK: f32 = 2.0 * TICK_SCALE;

// JS: `const friction = Math.pow(0.50, GAME_CONFIG.TICK_SCALE);`
// 0.50^0.5 ≈ 0.7071067811865476. The exponent form is preserved so that any
// future TICK_SCALE change on the JS side requires the same arithmetic on
// both sides (no risk of one side rounding the precomputed literal).
const FRICTION_BASE: f32 = 0.50;
const TICK_SCALE: f32 = 30.0 / 60.0;

// JS: `GAME_CONFIG.MAX_V = 7 * (30/60)` = 3.5 px/tick.
const MAX_V: f32 = 7.0 * TICK_SCALE;

// JS: `if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;`
const VEL_EPSILON: f32 = 0.05;

/// One logic tick of pure ship kinematics. Mirrors player.js update() lines
/// 521–603 (the WASD movement + friction + clamp + position-update block).
///
/// Order of operations is **load-bearing for parity** — friction is applied
/// *after* thrust, the epsilon snap runs *between* friction and the speed
/// cap, and the speed cap runs before the position write. Do not reorder
/// without a matching change in `js/sim/ship.js`.
pub fn update_all(
    ships: &mut [ShipState],
    inputs: &PlayerInputs,
    _dt: f32,
    _events: &mut Vec<crate::protocol::GameEvent>,
) {
    let friction: f32 = FRICTION_BASE.powf(TICK_SCALE);

    for ship in ships.iter_mut() {
        let input = inputs
            .get(&ship.player)
            .copied()
            .unwrap_or_else(PlayerInput::default);

        // ── Thrust ──────────────────────────────────────────────────────
        // player.js: `vel.x += cos(atan2(moveY, moveX)) * thrustForce`
        //   == thrustForce * (moveX / hypot(moveX, moveY))   when len > 0
        // We accept already-normalized [-1, 1] axes from PackedInput
        // (input.rs divides by 127.0) and re-normalize to a unit vector so
        // diagonal input is identical to cardinal input — exactly what the
        // JS atan2-then-cos formulation produces.
        let mag = (input.move_x * input.move_x + input.move_y * input.move_y).sqrt();
        if mag > 0.0 {
            let inv = 1.0 / mag;
            ship.vx += input.move_x * inv * THRUST_PER_TICK;
            ship.vy += input.move_y * inv * THRUST_PER_TICK;
        }

        // ── Friction ────────────────────────────────────────────────────
        ship.vx *= friction;
        ship.vy *= friction;

        // ── Snap to zero for negligible velocity ────────────────────────
        // Prevents endless drift after release. Identical bound on both
        // axes; checked independently per axis (matches player.js).
        if ship.vx.abs() < VEL_EPSILON {
            ship.vx = 0.0;
        }
        if ship.vy.abs() < VEL_EPSILON {
            ship.vy = 0.0;
        }

        // ── Speed cap ───────────────────────────────────────────────────
        // player.js multiplies MAX_V by a speed-boost factor; v1 has no
        // powerups on the server, so the cap is the bare MAX_V.
        let speed = (ship.vx * ship.vx + ship.vy * ship.vy).sqrt();
        if speed > MAX_V {
            let s = MAX_V / speed;
            ship.vx *= s;
            ship.vy *= s;
        }

        // ── Position update ─────────────────────────────────────────────
        // Per-tick: vel is already px/tick, no dt multiply.
        ship.x += ship.vx;
        ship.y += ship.vy;

        // ── Boundary handling: deferred to room.rs ──
        // player.js bounces against the game field with 0.8 energy loss.
        // `update_all` does not currently get a field reference; rather
        // than hardcoding 1920×1080 and risking divergence with sibling
        // A, we leave this gap explicit. The parity fixture exercises
        // tick counts/inputs that never cross any boundary.

        // ── Aim → angle ─────────────────────────────────────────────────
        // player.js: `this.angle = Math.atan2(input.aimY - this.y, input.aimX - this.x)`
        // — i.e. atan2 of a *world-space* offset, computed every tick
        // unconditionally (mouse-anchored aim).
        //
        // The wire format ships a unit-vector aim instead (PackedInput
        // aim_x/aim_y are i16 in [-32767, 32767], normalized to [-1, 1]
        // by input.rs). Sibling A's js/sim/ship.js converts the same
        // unit-vector input via `atan2(aim_y, aim_x)`. We do the same
        // here — the (0, 0) sentinel skips the update so a zero aim
        // doesn't snap angle to 0.
        if input.aim_x != 0.0 || input.aim_y != 0.0 {
            ship.angle = input.aim_y.atan2(input.aim_x);
        }
    }
}
