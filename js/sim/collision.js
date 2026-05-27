// js/sim/collision.js — authoritative collision resolution.
//
// Pure circle-vs-circle. v1 handles player bullets vs asteroids (the first
// real combat loop). Marks hit entities dead and emits semantic events; the
// caller (tick) removes dead entities afterward. Naive O(bullets × asteroids)
// is fine at current entity counts; a spatial hash can drop in later behind
// this same function signature.

import { EV, emit } from './events.js';

function hits(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** Resolve bullet↔asteroid collisions, mutating `world` and emitting events. */
export function resolveCollisions(world) {
  for (const [, b] of world.bullets) {
    if (!b.alive) continue;
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
      break; // one bullet hits at most one asteroid
    }
  }
}
