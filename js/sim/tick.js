// js/sim/tick.js — one authoritative simulation step.
//
// tick(world, inputsByPlayer) advances the world by one fixed step and returns
// the list of events emitted during the step. Pure w.r.t. its inputs (mutates
// `world`). This is the single function the server's room loop calls, and the
// same step the client predictor runs locally for the owned ship.

import { stepShip, EMPTY_INPUT } from './ship.js';
import { stepAsteroid } from './asteroid.js';

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
  }

  for (const [, ast] of world.asteroids) {
    stepAsteroid(ast, world.width, world.height);
  }

  // Future systems (enemies, bullets, collisions, waves, drops) tick here in
  // dependency order, each emitting events as needed.

  return world.events;
}
