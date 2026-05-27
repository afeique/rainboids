// js/sim/events.js — semantic event kinds the sim emits each tick.
//
// The sim never plays a sound or spawns a particle directly. Instead it emits
// these one-shot events; the presentation layer (MP client, and eventually the
// refactored single-player game) consumes them to drive juice. This same event
// stream is what the server forwards to clients on the reliable channel.

export const EV = Object.freeze({
  SHIP_SPAWN: 'ship_spawn',
  SHIP_HIT: 'ship_hit',
  SHIP_DOWNED: 'ship_downed',
  // Grows additively as systems are ported: BULLET_SPAWN, ENEMY_DEATH,
  // DROP, WAVE_START, REVIVE, ...
});

/** Push an event onto the world's per-tick event list. */
export function emit(world, type, data) {
  world.events.push({ type, tick: world.tick, ...data });
}
