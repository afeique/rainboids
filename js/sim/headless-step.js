// Path A / S6 — headless sim step (scaffold).
//
// The server's replacement for gameLoop()'s real-time accumulator: ONE fixed-dt
// logic tick with NO rendering, requestAnimationFrame, camera, screen-shake, or
// VFX-pool updates. It defines the canonical per-tick STAGE ORDER and delegates
// each stage to a method on the EngineContext (S4). Every stage is optional /
// null-guarded, so the driver runs correctly through the incremental wiring
// phases — a stage that isn't attached yet is simply skipped.
//
// The stage methods (stepPlayers, stepEntities, stepSystems, handleCollisions,
// updateWaveSystem, drainEvents) are attached to the context during the
// sim-wiring phases as the SP `fn.call(this)` logic is bound to ctx. This file
// owns ONLY the ordering + the events-drain contract, mirroring the SIM-only
// subset of game-engine.js update() (PLAYING branch) identified in the plan.

import { GAME_CONFIG } from '../modules/core/constants.js';

const EMPTY_INPUT = Object.freeze({});

/**
 * Advance the headless simulation by one fixed tick.
 * @param {object} ctx - an EngineContext (see js/sim/engine-context.js)
 * @param {Map<number, object>} inputsByPlayer - playerId → input frame
 * @returns {Array} the semantic event stream emitted this tick (for the client)
 */
export function headlessStep(ctx, inputsByPlayer = new Map()) {
  const dt = GAME_CONFIG.LOGIC_TICK_MS;

  // 1. Deterministic clock (S1).
  ctx.frameClock.advance();

  // 2. Game timers (the deterministic setTimeout replacement, S5).
  for (const t of ctx._gameTimers) if (t && typeof t.tick === 'function') t.tick(dt);

  // 3. Players: apply each slot's input + run player.update.
  ctx.stepPlayers?.(inputsByPlayer, dt, EMPTY_INPUT);

  // 4. Entity pools (bullets, enemies, enemy-bullets, asteroids, orbs) — sim only.
  ctx.stepEntities?.(dt);

  // 5. Field systems (formations, hazard field, gravity/storm/suppress auras).
  ctx.stepSystems?.(dt);

  // 6. Authoritative collisions — damage, deaths, drops, scoring (the core sim).
  ctx.handleCollisions?.();

  // 7. Wave progression + spawning.
  ctx.updateWaveSystem?.();

  // 8. Drain + return the per-tick semantic event stream (death/hit/spawn/…)
  //    that the client turns into particles/sounds/shake.
  return ctx.drainEvents?.() ?? [];
}
