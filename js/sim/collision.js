// js/sim/collision.js — authoritative collision resolution.
//
// Pure circle-vs-circle. v1 handles player bullets vs asteroids (the first
// real combat loop). Marks hit entities dead and emits semantic events; the
// caller (tick) removes dead entities afterward. Naive O(bullets × asteroids)
// is fine at current entity counts; a spatial hash can drop in later behind
// this same function signature.

import { EV, emit } from './events.js';
import { ENEMY_CONTACT_DAMAGE, ENEMY_CONTACT_COOLDOWN } from './constants.js';

function hits(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/**
 * Resolve all collisions, mutating `world` and emitting events:
 *   - player bullets vs enemies (then vs asteroids — a bullet hits one thing)
 *   - enemies vs ships (cooldown-gated contact damage; downs ships at 0 HP)
 */
export function resolveCollisions(world) {
  for (const [, b] of world.bullets) {
    if (!b.alive) continue;

    // Enemies take priority over asteroids for the same bullet.
    let consumed = false;
    for (const [, e] of world.enemies) {
      if (!e.alive) continue;
      if (!hits(b.x, b.y, b.radius, e.x, e.y, e.radius)) continue;
      b.alive = false;
      e.hp -= b.damage;
      emit(world, EV.ENEMY_HIT, { id: e.id, x: b.x, y: b.y, ownerId: b.ownerId });
      if (e.hp <= 0) {
        e.alive = false;
        emit(world, EV.ENEMY_DEATH, { id: e.id, x: e.x, y: e.y, ownerId: b.ownerId });
      }
      consumed = true;
      break;
    }
    if (consumed) continue;

    for (const [, ast] of world.asteroids) {
      if (!ast.alive) continue;
      if (!hits(b.x, b.y, b.radius, ast.x, ast.y, ast.radius)) continue;
      b.alive = false;
      ast.hp -= b.damage;
      emit(world, EV.ASTEROID_HIT, { id: ast.id, x: b.x, y: b.y, ownerId: b.ownerId });
      if (ast.hp <= 0) {
        ast.alive = false;
        emit(world, EV.ASTEROID_DESTROYED, { id: ast.id, x: ast.x, y: ast.y, r: ast.radius, ownerId: b.ownerId });
      }
      break;
    }
  }

  // Enemy contact damage to ships (contactCooldown is decremented in stepEnemy).
  for (const [, e] of world.enemies) {
    if (!e.alive || e.contactCooldown > 0) continue;
    for (const [, ship] of world.ships) {
      if (!ship.alive) continue;
      if (!hits(e.x, e.y, e.radius, ship.x, ship.y, ship.radius)) continue;
      ship.hp -= ENEMY_CONTACT_DAMAGE;
      e.contactCooldown = ENEMY_CONTACT_COOLDOWN;
      emit(world, EV.SHIP_HIT, { id: ship.playerId, x: ship.x, y: ship.y });
      if (ship.hp <= 0) {
        ship.hp = 0;
        ship.alive = false;
        ship.downed = true;
        emit(world, EV.SHIP_DOWNED, { id: ship.playerId, x: ship.x, y: ship.y });
      }
      break; // one enemy hits at most one ship per contact
    }
  }
}
