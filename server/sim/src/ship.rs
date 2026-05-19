//! Phase-1 ship physics — pure step function authored fresh from
//! `js/sim/ship.js` (174 lines) as of 2026-05-17. Byte-for-byte
//! behavioral parity with solo. See WASM pivot plan for context:
//! `docs/Multiplayer WASM Pivot – 2026-05-17.md`.
//!
//! Solo's `updateShip` is the spec. This file mirrors it step-for-step
//! in the same order: aim, move-integration, friction, snap-to-zero,
//! max-speed clamp, position update, boundary bounce. No new behavior;
//! no powerup interactions, no bullet emission, no audio/FX side
//! effects. Those live in higher-level systems (see solo's player.js
//! wrapper for what's intentionally NOT in here).
//!
//! All per-tick constants (`MAX_V`, `VEL_EPSILON`, `BOUNCE_DAMP`,
//! `friction_per_tick`) come from `crate::input` — they are passed
//! implicitly by being imported, not via the input struct, since
//! they're fixed for Phase 1. The wrapper still gets to override
//! per-player tunables (`speed_mult`, `thrust_power`,
//! `thrusters_disabled`) through `PlayerInput`.

use super::input::{friction_per_tick, PlayerInput, BOUNCE_DAMP, MAX_V, VEL_EPSILON};
use super::state::{GameState, ShipState};

/// One tick of ship physics. Mutates `ship` in place. No allocation.
/// Mirrors `updateShip(ship, input, _dt, _rng, _events)` in
/// `js/sim/ship.js`. `dt` is accepted for forward compatibility but
/// unused — solo's physics works in per-tick deltas, not per-second
/// integration, and the per-tick constants (thrust, friction, MAX_V)
/// already bake in the 30Hz→60Hz `TICK_SCALE` rescale.
pub fn update_ship(
    ship: &mut ShipState,
    input: &PlayerInput,
    field_w: f64,
    field_h: f64,
    _dt: f64,
) {
    // Mirrors js/sim/ship.js:70 — inactive ships skip the step entirely.
    if !ship.active {
        return;
    }

    // ── Aim angle ──
    // Mirrors js/sim/ship.js:73-76. Atan2 from ship to aim point.
    let dx = input.aim_x - ship.x;
    let dy = input.aim_y - ship.y;
    ship.angle = dy.atan2(dx);

    // ── Movement integration ──
    // Mirrors js/sim/ship.js:78-97. WASD → moveX/moveY (−1/0/+1) →
    // moveAngle → per-tick velocity delta = thrustPower * speedMult.
    // The wrapper passes `thrust_power` already scaled by TICK_SCALE,
    // so no extra `dt` factor here.
    let is_moving = input.up || input.down || input.left || input.right;
    if is_moving && !input.thrusters_disabled {
        let mut move_x: f64 = 0.0;
        let mut move_y: f64 = 0.0;
        if input.left {
            move_x -= 1.0;
        }
        if input.right {
            move_x += 1.0;
        }
        if input.up {
            move_y -= 1.0;
        }
        if input.down {
            move_y += 1.0;
        }

        let move_angle = move_y.atan2(move_x);
        let thrust_force = input.thrust_power * input.speed_mult;
        ship.vx += move_angle.cos() * thrust_force;
        ship.vy += move_angle.sin() * thrust_force;
    }

    // ── Friction ──
    // Mirrors js/sim/ship.js:99-105. Per-tick multiplier; the wrapper
    // pre-computes `pow(0.5, TICK_SCALE)` in solo and passes it via
    // `input.friction`. Phase 1 uses the constant directly from
    // `crate::input::friction_per_tick()`.
    let friction = friction_per_tick();
    ship.vx *= friction;
    ship.vy *= friction;

    // ── Snap to zero ──
    // Mirrors js/sim/ship.js:107-111. Prevents perpetual subpixel
    // drift after the player releases keys.
    if ship.vx.abs() < VEL_EPSILON {
        ship.vx = 0.0;
    }
    if ship.vy.abs() < VEL_EPSILON {
        ship.vy = 0.0;
    }

    // ── Max-speed clamp ──
    // Mirrors js/sim/ship.js:113-122. Speed boost contributes only 70%
    // of its multiplier to the velocity cap so upgrades feel powerful
    // without trivializing positioning.
    let effective_max_v = MAX_V * (1.0 + (input.speed_mult - 1.0) * 0.7);
    let mag = ship.vx.hypot(ship.vy);
    if mag > effective_max_v {
        ship.vx = (ship.vx / mag) * effective_max_v;
        ship.vy = (ship.vy / mag) * effective_max_v;
    }

    // ── Position update ──
    // Mirrors js/sim/ship.js:124-127.
    ship.x += ship.vx;
    ship.y += ship.vy;

    // ── Boundary bounce ──
    // Mirrors js/sim/ship.js:129-151. Clamp to [r, field - r] on
    // contact and multiply velocity by ±BOUNCE_DAMP so the ship
    // doesn't get caught in a perpetual edge-rebound loop. Solo
    // always passes a field; Phase 1 likewise always bounces.
    let r = ship.radius;
    if ship.x - r < 0.0 {
        ship.x = r;
        ship.vx = ship.vx.abs() * BOUNCE_DAMP;
    } else if ship.x + r > field_w {
        ship.x = field_w - r;
        ship.vx = -ship.vx.abs() * BOUNCE_DAMP;
    }
    if ship.y - r < 0.0 {
        ship.y = r;
        ship.vy = ship.vy.abs() * BOUNCE_DAMP;
    } else if ship.y + r > field_h {
        ship.y = field_h - r;
        ship.vy = -ship.vy.abs() * BOUNCE_DAMP;
    }
}

/// Helper: tick the single ship in a GameState. Phase 1 entry point
/// called by the WASM client glue and (eventually) the server room
/// loop. Increments `state.tick` exactly once per call.
pub fn tick_phase1(state: &mut GameState, input: &PlayerInput, dt: f64) {
    update_ship(&mut state.ship, input, state.field_w, state.field_h, dt);
    state.tick = state.tick.wrapping_add(1);
}
