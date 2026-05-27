// js/sim/enemy.js — headless enemy state + per-tick AI step.
//
// v1 ships one type: 'chaser' — homes on the nearest living ship (a simplified
// HUNTER). More types (and richer AI) are ported here additively, each behind
// the `type` discriminator. Pure state; no rendering.

import { ENEMY_CHASER_HP, ENEMY_CHASER_RADIUS, ENEMY_CHASER_SPEED } from './constants.js';

export function createEnemy(id, x, y, type = 'chaser', hpOverride = null) {
  const hp = hpOverride != null ? hpOverride : ENEMY_CHASER_HP;
  return {
    id,
    type,
    x, y,
    vx: 0, vy: 0,
    angle: 0,
    radius: ENEMY_CHASER_RADIUS,
    speed: ENEMY_CHASER_SPEED,
    hp,
    maxHp: hp,
    alive: true,
    contactCooldown: 0, // ticks until this enemy can deal contact damage again
  };
}

/** Nearest living ship to (x, y), or null. */
export function nearestShip(ships, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const [, s] of ships) {
    if (!s.alive) continue;
    const dx = s.x - x;
    const dy = s.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Advance one enemy: cool down contact, chase the nearest living ship. */
export function stepEnemy(enemy, world) {
  if (enemy.contactCooldown > 0) enemy.contactCooldown--;

  const target = nearestShip(world.ships, enemy.x, enemy.y);
  if (!target) return;

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  enemy.angle = Math.atan2(dy, dx);
  enemy.vx = (dx / d) * enemy.speed;
  enemy.vy = (dy / d) * enemy.speed;
  enemy.x += enemy.vx;
  enemy.y += enemy.vy;
}
