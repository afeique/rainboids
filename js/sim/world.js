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
import { createBullet } from './bullet.js';
import { createEnemy } from './enemy.js';
import { createDrop } from './drop.js';
import {
  BULLET_RADIUS, BULLET_DAMAGE, BULLET_TTL,
  ENEMY_MAX_COUNT, ENEMY_SPAWN_INTERVAL,
} from './constants.js';
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
    bullets: new Map(), // entityId -> bullet
    enemies: new Map(), // entityId -> enemy
    drops: new Map(), // entityId -> drop
    enemySpawnTimer: ENEMY_SPAWN_INTERVAL,
    nextEntityId: 1, // id space for non-player entities (asteroids, bullets, …)
    events: [], // cleared + repopulated each tick
  };
}

/** Spawn a player bullet; returns it. */
export function spawnBullet(world, x, y, vx, vy, ownerId) {
  const b = createBullet(world.nextEntityId++, x, y, vx, vy, ownerId, BULLET_RADIUS, BULLET_DAMAGE, BULLET_TTL);
  world.bullets.set(b.id, b);
  return b;
}

/** Spawn a loot drop at (x, y) with a small random pop; emits DROP_SPAWN. */
export function spawnDrop(world, x, y, kind, value) {
  const ang = world.rng.range(0, Math.PI * 2);
  const spd = world.rng.range(0.5, 2);
  const d = createDrop(world.nextEntityId++, x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, kind, value);
  world.drops.set(d.id, d);
  emit(world, EV.DROP_SPAWN, { id: d.id, x, y, kind });
  return d;
}

/** Spawn an enemy at (x, y); emits ENEMY_SPAWN. */
export function spawnEnemy(world, x, y, type = 'chaser') {
  const e = createEnemy(world.nextEntityId++, x, y, type);
  world.enemies.set(e.id, e);
  emit(world, EV.ENEMY_SPAWN, { id: e.id, x, y, type });
  return e;
}

/**
 * Periodic enemy spawner: while players are present and the field is below the
 * cap, spawn a chaser at a random arena-edge point on an interval. (A full
 * wave system with pacing/scaling lands in a later iteration.)
 */
export function tickEnemySpawner(world) {
  if (world.ships.size === 0) return;
  if (world.enemies.size >= ENEMY_MAX_COUNT) return;
  if (--world.enemySpawnTimer > 0) return;
  world.enemySpawnTimer = ENEMY_SPAWN_INTERVAL;

  // Random point on the perimeter.
  const edge = world.rng.int(0, 3);
  let x; let y;
  if (edge === 0) { x = world.rng.range(0, world.width); y = 0; }
  else if (edge === 1) { x = world.rng.range(0, world.width); y = world.height; }
  else if (edge === 2) { x = 0; y = world.rng.range(0, world.height); }
  else { x = world.width; y = world.rng.range(0, world.height); }
  spawnEnemy(world, x, y, 'chaser');
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
