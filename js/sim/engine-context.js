// Path A / S4 — Headless EngineContext (scaffold).
//
// The SP simulation is written as `fn.call(this)` free functions (collision,
// wave, player/enemy sub-modules) where `this` is the GameEngine. To run that
// same logic headless, the server binds those functions to an EngineContext —
// an engine-shaped object exposing what the sim reads: pools, player(s),
// gameField, game, events, spatialGrid, frameClock, rng, fx, _gameTimers, plus
// the delegated sim methods (handleCollisions, updateWaveSystem, spawnHazard,
// requestEnemySpawn, findNearestTarget, …).
//
// THIS SCAFFOLD assembles only the parts that don't depend on the still-coupled
// entity classes: it installs the deterministic clock (S1) + seeded RNG (S2),
// builds gameField / events / spatialGrid / game / _gameTimers / fx (S3), and
// leaves the entity pools + player(s) + delegated methods as null placeholders
// to be attached during the sim-wiring phases (once the entity classes import
// cleanly in Node and their update() paths route through ctx/fx/rng).
//
// ── IMPORTANT (one-sim-per-process) ──────────────────────────────────────────
// `frameClock` and the `utils.random` source are module-level GLOBALS that the
// SP code reads directly. createEngineContext() mutates those globals, so a
// single Node process hosts ONE deterministic sim at a time. The MP server's
// scaling model is therefore process-per-room (which it already anticipated).
// Making the clock/RNG per-context would require threading them through every
// reader — a much larger change, intentionally NOT done here.

import { frameClock } from '../modules/core/frame-clock.js';
import { setRandomSource } from '../modules/core/utils.js';
import { GAME_CONFIG } from '../modules/core/constants.js';
import { EventBus } from '../modules/core/event-bus.js';
import { SpatialGrid } from '../modules/performance/spatial-grid.js';
import { makeRng } from './rng.js';
import { createNoopFx } from '../modules/core/fx.js';

/** Minimal run-state object (shape mirrors GameEngine.this.game's sim fields). */
export function createDefaultGameState() {
  return {
    money: 0,
    accountGold: 0,
    cores: 0,
    currentWave: 1,
    enemyLevel: 1,
    survivalTime: 0,
    runConfig: { stages: 10, wavesPerStage: 3, mode: 'NORMAL' },
    stats: { shotsHit: 0, totalDamageDealt: 0 },
    state: 'PLAYING',
  };
}

/**
 * Assemble a headless deterministic engine context. Installs the global
 * deterministic clock + seeded RNG as a side-effect (see one-sim-per-process
 * note above); call disposeEngineContext() to restore wall-clock/Math.random.
 */
export function createEngineContext({
  seed = 1,
  gameField = { width: GAME_CONFIG.FIELD_WIDTH, height: GAME_CONFIG.FIELD_HEIGHT },
  fx = createNoopFx(),
  game = null,
} = {}) {
  const rng = makeRng(seed);
  // Deterministic time + seeded randomness for the whole sim (S1 + S2).
  frameClock.setDeterministic(true, { startNow: 0, dtMs: GAME_CONFIG.LOGIC_TICK_MS });
  setRandomSource(rng);

  return {
    // Deterministic environment.
    seed,
    rng,
    fx,
    frameClock,
    gameField,
    events: new EventBus(),
    spatialGrid: new SpatialGrid(gameField.width, gameField.height, 8, 6),
    _gameTimers: [],
    game: game || createDefaultGameState(),

    // Entity collections + delegated sim methods — attached during sim wiring
    // (kept here so the context shape is stable for consumers/tests).
    player: null,
    players: new Map(),
    bulletPool: null,
    enemyPool: null,
    enemyBulletPool: null,
    asteroidPool: null,
    powerupPool: null,
    goldCoinPool: null,
    goldShapePool: null,
    formationManager: null,
    hazardField: null,
  };
}

/** Restore global wall-clock + Math.random (teardown / tests / process reuse). */
export function disposeEngineContext() {
  frameClock.reset();
  setRandomSource(null);
}
