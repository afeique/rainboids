// js/sim/ship.js — headless ship state + per-tick physics.
//
// Faithful port of the single-player ship physics integration
// (js/modules/player/player.js update()): WASD → thrust along move angle,
// exponential friction, snap-to-zero, max-speed clamp, position integrate,
// damped boundary bounce. No rendering, no audio, no pools — pure state.

import {
  SHIP_THRUST_PER_TICK,
  SHIP_FRICTION,
  SHIP_MAX_V,
  SHIP_VEL_EPSILON,
  SHIP_BOUNCE_DAMP,
  SHIP_RADIUS,
  SHIP_MAX_HP,
} from './constants.js';

/** A neutral input frame (no keys, no aim change). */
export const EMPTY_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false,
  fire: false, aimX: null, aimY: null, clientTick: 0,
});

export function createShip(playerId, x, y) {
  return {
    playerId,
    x, y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2, // facing "up", matches SP spawn
    radius: SHIP_RADIUS,
    hp: SHIP_MAX_HP,
    maxHp: SHIP_MAX_HP,
    alive: true,
    downed: false, // set when hp hits 0; awaits a co-op revive
    reviveProgress: 0, // ticks of nearby-teammate presence accrued while downed
    // Ticks until this ship can fire again (counts down in tick()).
    fireCooldown: 0,
    // Last input tick the sim has applied for this ship — echoed in snapshots
    // so the owning client can reconcile its prediction (replay unconfirmed
    // inputs from lastInputTick + 1).
    lastInputTick: 0,
  };
}

/**
 * Advance one ship by one tick. Pure w.r.t. (ship, input) — mutates `ship`.
 * `width`/`height` are the arena bounds for boundary bounce.
 */
export function stepShip(ship, input, width, height) {
  if (!ship.alive) return;

  // Aim → facing angle (cursor/stick world point).
  if (input.aimX != null && input.aimY != null) {
    ship.angle = Math.atan2(input.aimY - ship.y, input.aimX - ship.x);
  }

  // Thrust along the 8-way move vector.
  const moving = input.up || input.down || input.left || input.right;
  if (moving) {
    let mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (mx !== 0 || my !== 0) {
      const moveAngle = Math.atan2(my, mx);
      ship.vx += Math.cos(moveAngle) * SHIP_THRUST_PER_TICK;
      ship.vy += Math.sin(moveAngle) * SHIP_THRUST_PER_TICK;
    }
  }

  // Friction.
  ship.vx *= SHIP_FRICTION;
  ship.vy *= SHIP_FRICTION;

  // Snap to zero (prevents subpixel drift after release).
  if (Math.abs(ship.vx) < SHIP_VEL_EPSILON) ship.vx = 0;
  if (Math.abs(ship.vy) < SHIP_VEL_EPSILON) ship.vy = 0;

  // Max-speed clamp.
  const mag = Math.hypot(ship.vx, ship.vy);
  if (mag > SHIP_MAX_V) {
    ship.vx = (ship.vx / mag) * SHIP_MAX_V;
    ship.vy = (ship.vy / mag) * SHIP_MAX_V;
  }

  // Integrate position.
  ship.x += ship.vx;
  ship.y += ship.vy;

  // Damped boundary bounce.
  const r = ship.radius;
  if (ship.x - r < 0) { ship.x = r; ship.vx = Math.abs(ship.vx) * SHIP_BOUNCE_DAMP; }
  else if (ship.x + r > width) { ship.x = width - r; ship.vx = -Math.abs(ship.vx) * SHIP_BOUNCE_DAMP; }
  if (ship.y - r < 0) { ship.y = r; ship.vy = Math.abs(ship.vy) * SHIP_BOUNCE_DAMP; }
  else if (ship.y + r > height) { ship.y = height - r; ship.vy = -Math.abs(ship.vy) * SHIP_BOUNCE_DAMP; }
}
