/**
 * Path A / S3 — FX hook interface.
 *
 * The simulation must not directly spawn particles, play audio, shake the
 * camera, or buzz the gamepad — those are presentation. Instead it calls an
 * injected `fx` object with these hooks. Two implementations:
 *
 *   • createNoopFx()  — the HEADLESS SERVER. Every hook is a no-op; cosmetic
 *     side-effects don't run server-side. The client re-derives particles /
 *     sounds / shake from the authoritative SEMANTIC EVENT STREAM (death, hit,
 *     spawn, pickup, …) that the sim already emits — so multiplayer looks
 *     identical without the server simulating cosmetics.
 *
 *   • createClientFx({...}) — the BROWSER (single-player and the MP client).
 *     Thin passthroughs to the real systems, so call sites map 1:1
 *     (e.g. `fx.particle(...args)` → `particlePool.get(...args)`).
 *
 * This file is import-clean (no browser globals at load), so the Node server can
 * import it. The only `navigator` reference is guarded inside `haptic()`.
 *
 * Nothing imports this yet — wiring existing call sites onto `fx` happens during
 * the sim-extraction phases (it's the per-file CUT work in the plan).
 */

const NOOP = () => {};

/** Headless / server FX: everything is a no-op. */
export function createNoopFx() {
  return {
    // Cosmetic spawns.
    particle: NOOP,
    lineDebris: NOOP,
    shard: NOOP,
    // Audio.
    sound: NOOP,
    shoot: NOOP,
    hit: NOOP,
    explosion: NOOP,
    playerExplosion: NOOP,
    coin: NOOP,
    powerup: NOOP,
    shield: NOOP,
    healthRegen: NOOP,
    tractorBeam: NOOP,
    // Camera / feel.
    shake: NOOP,
    kick: NOOP,
    haptic: NOOP,
    isHeadless: true,
  };
}

/**
 * Browser FX: wrap the real systems. Any system not provided degrades to a
 * no-op for that hook, so partial wiring is safe.
 * @param {object} deps - { particlePool, lineDebrisPool, asteroidShardPool, audioManager, engine }
 */
export function createClientFx({
  particlePool, lineDebrisPool, asteroidShardPool, audioManager, engine,
} = {}) {
  const am = audioManager;
  return {
    particle: particlePool ? (...a) => particlePool.get(...a) : NOOP,
    lineDebris: lineDebrisPool ? (...a) => lineDebrisPool.get(...a) : NOOP,
    shard: asteroidShardPool ? (...a) => asteroidShardPool.get(...a) : NOOP,

    sound: am ? (name) => am.playSound(name) : NOOP,
    shoot: am && am.playShoot ? (...a) => am.playShoot(...a) : NOOP,
    hit: am && am.playHit ? (...a) => am.playHit(...a) : NOOP,
    explosion: am && am.playExplosion ? (...a) => am.playExplosion(...a) : NOOP,
    playerExplosion: am && am.playPlayerExplosion ? (...a) => am.playPlayerExplosion(...a) : NOOP,
    coin: am && am.playCoin ? (...a) => am.playCoin(...a) : NOOP,
    powerup: am && am.playPowerup ? (...a) => am.playPowerup(...a) : NOOP,
    shield: am && am.playShield ? (...a) => am.playShield(...a) : NOOP,
    healthRegen: am && am.playHealthRegen ? (...a) => am.playHealthRegen(...a) : NOOP,
    tractorBeam: am && am.playTractorBeam ? (...a) => am.playTractorBeam(...a) : NOOP,

    shake: engine && engine.triggerScreenShake ? (...a) => engine.triggerScreenShake(...a) : NOOP,
    kick: engine && engine.triggerCameraKick ? (...a) => engine.triggerCameraKick(...a) : NOOP,
    haptic: (ms) => { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms); } catch { /* ignore */ } },

    isHeadless: false,
  };
}
