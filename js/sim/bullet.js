// js/sim/bullet.js — headless player-bullet state + per-tick step.
//
// Straight-line projectile. Server-authoritative for now (snapshotted like
// other entities); a later iteration can switch to spawn-event + client-local
// simulation to cut bandwidth and hide latency on fast projectiles.

import { BULLET_OOB_MARGIN } from './constants.js';

export function createBullet(id, x, y, vx, vy, ownerId, radius, damage, ttl) {
  return { id, x, y, vx, vy, ownerId, radius, damage, ttl, alive: true };
}

/** Advance one bullet: integrate, age, despawn on TTL or leaving the arena. */
export function stepBullet(b, width, height) {
  b.x += b.vx;
  b.y += b.vy;
  b.ttl -= 1;
  const m = BULLET_OOB_MARGIN;
  if (b.ttl <= 0 || b.x < -m || b.x > width + m || b.y < -m || b.y > height + m) {
    b.alive = false;
  }
}
