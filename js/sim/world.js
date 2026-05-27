// js/sim/world.js — the authoritative world state container.
//
// Plain data + a seeded RNG. Holds everything the simulation owns. Imported by
// the server (one World per room) and, later, by the client predictor (a local
// World seeded from Welcome, used to predict only the local ship).

import { makeRng } from './rng.js';
import {
  FIELD_WIDTH, FIELD_HEIGHT,
  ASTEROID_MIN_R, ASTEROID_MAX_R, ASTEROID_MIN_SPD, ASTEROID_MAX_SPD, ASTEROID_MAX_SPIN,
} from './constants.js';
import { createShip } from './ship.js';
import { createAsteroid } from './asteroid.js';
import { EV, emit } from './events.js';

export function createWorld({ seed = 1, width = FIELD_WIDTH, height = FIELD_HEIGHT } = {}) {
  return {
    tick: 0,
    seed,
    width,
    height,
    rng: makeRng(seed),
    ships: new Map(), // playerId -> ship
    asteroids: new Map(), // entityId -> asteroid
    nextEntityId: 1, // id space for non-player entities (asteroids, bullets, …)
    events: [], // cleared + repopulated each tick
  };
}

/** Populate the asteroid field. Deterministic for a fixed world seed. */
export function spawnAsteroids(world, count) {
  for (let i = 0; i < count; i++) {
    const radius = world.rng.range(ASTEROID_MIN_R, ASTEROID_MAX_R);
    const x = world.rng.range(0, world.width);
    const y = world.rng.range(0, world.height);
    const dir = world.rng.range(0, Math.PI * 2);
    const spd = world.rng.range(ASTEROID_MIN_SPD, ASTEROID_MAX_SPD);
    const spin = world.rng.range(-ASTEROID_MAX_SPIN, ASTEROID_MAX_SPIN);
    const ast = createAsteroid(
      world.nextEntityId++, x, y,
      Math.cos(dir) * spd, Math.sin(dir) * spd,
      radius, spin,
    );
    world.asteroids.set(ast.id, ast);
  }
}

/** Add a ship for a player at a spawn point and emit SHIP_SPAWN. */
export function addShip(world, playerId, x, y) {
  const ship = createShip(playerId, x, y);
  world.ships.set(playerId, ship);
  emit(world, EV.SHIP_SPAWN, { playerId, x, y });
  return ship;
}

export function removeShip(world, playerId) {
  world.ships.delete(playerId);
}

/**
 * Deterministic-ish spawn point spread around the arena center, so multiple
 * ships don't stack on join. Uses a simple ring placement by ship count.
 */
export function spawnPointFor(world) {
  const cx = world.width / 2;
  const cy = world.height / 2;
  const n = world.ships.size;
  if (n === 0) return { x: cx, y: cy };
  const ring = 160;
  const ang = (n * (Math.PI * 2)) / 4; // up to 4-way spread, then overlaps
  return { x: cx + Math.cos(ang) * ring, y: cy + Math.sin(ang) * ring };
}
