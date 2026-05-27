// js/sim/drop.js — loot orbs (health / gold). Drift with friction, magnet
// toward the nearest ship when close, despawn on TTL. Collection happens in
// collision.js (authoritative). Pure state.

import { DROP_RADIUS, DROP_TTL, DROP_FRICTION, DROP_MAGNET_RADIUS, DROP_MAGNET_ACCEL } from './constants.js';
import { nearestShip } from './enemy.js';

export function createDrop(id, x, y, vx, vy, kind, value) {
  return { id, x, y, vx, vy, kind, value, radius: DROP_RADIUS, ttl: DROP_TTL, alive: true };
}

/** Advance one drop: age, magnet toward a nearby ship, friction, integrate. */
export function stepDrop(drop, world) {
  drop.ttl -= 1;
  if (drop.ttl <= 0) { drop.alive = false; return; }

  const target = nearestShip(world.ships, drop.x, drop.y);
  if (target) {
    const dx = target.x - drop.x;
    const dy = target.y - drop.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < DROP_MAGNET_RADIUS) {
      drop.vx += (dx / d) * DROP_MAGNET_ACCEL;
      drop.vy += (dy / d) * DROP_MAGNET_ACCEL;
    }
  }

  drop.vx *= DROP_FRICTION;
  drop.vy *= DROP_FRICTION;
  drop.x += drop.vx;
  drop.y += drop.vy;
}
