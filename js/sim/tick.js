// js/sim/tick.js — one authoritative simulation step.
//
// tick(world, inputsByPlayer) advances the world by one fixed step and returns
// the list of events emitted during the step. Pure w.r.t. its inputs (mutates
// `world`). This is the single function the server's room loop calls, and the
// same step the client predictor runs locally for the owned ship.

import { stepShip, EMPTY_INPUT } from './ship.js';
import { stepAsteroid } from './asteroid.js';
import { stepBullet } from './bullet.js';
import { stepEnemy } from './enemy.js';
import { stepDrop } from './drop.js';
import { spawnBullet } from './world.js';
import { resolveCollisions } from './collision.js';
import { updateRevives } from './coop.js';
import { updateWaves } from './wave.js';
import { EV, emit } from './events.js';
import { BULLET_SPEED, FIRE_COOLDOWN_TICKS } from './constants.js';

/**
 * @param {object} world  - from createWorld()
 * @param {Map<number, object>} inputsByPlayer - playerId -> latest input frame
 * @returns {Array} events emitted this tick
 */
export function tick(world, inputsByPlayer) {
  world.tick++;
  world.events.length = 0;

  for (const [playerId, ship] of world.ships) {
    const input = (inputsByPlayer && inputsByPlayer.get(playerId)) || EMPTY_INPUT;
    stepShip(ship, input, world.width, world.height);
    if (typeof input.clientTick === 'number' && input.clientTick > ship.lastInputTick) {
      ship.lastInputTick = input.clientTick;
    }

    // Primary fire: spawn a forward bullet when held and off cooldown.
    if (ship.fireCooldown > 0) ship.fireCooldown -= 1;
    if (ship.alive && input.fire && ship.fireCooldown <= 0) {
      const bx = ship.x + Math.cos(ship.angle) * ship.radius;
      const by = ship.y + Math.sin(ship.angle) * ship.radius;
      spawnBullet(world, bx, by, Math.cos(ship.angle) * BULLET_SPEED, Math.sin(ship.angle) * BULLET_SPEED, playerId);
      ship.fireCooldown = FIRE_COOLDOWN_TICKS;
      emit(world, EV.BULLET_SPAWN, { x: bx, y: by, ownerId: playerId });
    }
  }

  for (const [, enemy] of world.enemies) {
    stepEnemy(enemy, world);
  }
  for (const [, ast] of world.asteroids) {
    stepAsteroid(ast, world.width, world.height);
  }
  for (const [, b] of world.bullets) {
    stepBullet(b, world.width, world.height);
  }
  for (const [, d] of world.drops) {
    stepDrop(d, world);
  }

  // Authoritative collisions (bullets↔enemies/asteroids, enemies↔ships,
  // drops↔ships), then remove the dead.
  resolveCollisions(world);
  for (const [id, b] of world.bullets) if (!b.alive) world.bullets.delete(id);
  for (const [id, a] of world.asteroids) if (!a.alive) world.asteroids.delete(id);
  for (const [id, e] of world.enemies) if (!e.alive) world.enemies.delete(id);
  for (const [id, d] of world.drops) if (!d.alive) world.drops.delete(id);

  updateRevives(world);
  updateWaves(world);

  return world.events;
}
