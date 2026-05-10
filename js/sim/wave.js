// Pure wave-spawn step.
//
// Extracted from `js/modules/wave/wave-manager.js`'s sub-wave pacing
// + wave-completion logic as part of the Phase-1 multiplayer engine
// refactor (see `docs/Multiplayer Rust Client Engine – 2026-05-07.md`,
// §"Phase 1: Engine refactor"). Mirrors agent A's `js/sim/ship.js`
// pattern: a pure `updateWave(wave, ctx, events)` that decides "spawn
// next sub-wave now?" and emits `enemy_spawn` events; the wrapper in
// `WaveManager.updateWaveSystem` drains those events and constructs
// the actual Enemy instances via the existing `spawnLeveledEnemies`
// helpers (which know about pools, warp-in, level scaling, mini-boss
// promotion, boss linking).
//
// This module is **byte-for-byte equivalent** to the existing solo
// wave-pacing behavior — same ≤2-enemy advance trigger, same 12 s
// stale-fallback, same "all sub-waves spawned + zero enemies"
// wave-clear gate. No tuning happens here.
//
// What lives here:
//   - Wave phase machine ('intro' → 'spawning' → 'clearing' → 'complete')
//   - Sub-wave advance decision (≤2 enemies OR 12 s elapsed)
//   - End-of-wave detection (zero enemies + all sub-waves spawned)
//   - `enemy_spawn` event emission (one per group in the spawning
//     sub-wave)
//   - `wave_clear` event emission (when the last enemy of the last
//     sub-wave dies)
//
// What does NOT live here (stays in `WaveManager`):
//   - Pool cleanup (`enemyPool.cleanupInactive()` etc.)
//   - Audio (wave intro chime, wave clear stinger, boss music swap)
//   - UI overlays (wave intro splash, wave clear toast, sub-wave
//     phase toast, mission announce, boss-rage indicator)
//   - Wave-clear bonuses (XP, coins, +1 SP)
//   - Mission resolution / mission state (`startWaveMission`,
//     `resolveMissionOnWaveClear`)
//   - Persistent wave-start save (`persistWaveStartSave`)
//   - Powerups menu trigger (`openWaveClearPowerupsMenu`)
//   - Player invincibility grace window (`makeInvincible(3000)`)
//   - The Enemy / Asteroid construction (the wrapper drains events
//     and calls the existing `spawnLeveledEnemies` / `spawnLeveledAsteroids`)
//
// Drop spawning is also NOT here — drops are spawned by enemy /
// asteroid death events. The collision-extract session will own
// pickup; this file owns "wave schedule decisions only".

import {
    getWaveConfig as _getWaveConfig,
    getEnemyLevel,
    getAsteroidLevel,
    isBossWave,
} from '../modules/wave/wave-data.js';

// Sub-wave advance thresholds — copied verbatim from
// `wave-manager.js`'s `tryAdvanceSubWave`. Live in this module so the
// pure step is self-contained (no hidden constants leaking from the
// engine module).
export const SUB_WAVE_ADVANCE_ENEMY_THRESHOLD = 2;     // ≤2 enemies → advance
export const SUB_WAVE_ADVANCE_STALE_MS = 12000;        // 12 s stale fallback

/**
 * Read the static wave config for a given wave number. Pure lookup.
 *
 * Re-exported from `js/modules/wave/wave-data.js` so the simulation
 * layer's public surface is `js/sim/index.js` only — callers don't
 * need to reach into `js/modules/`. Returns the same object shape
 * the live engine consumes: `{ asteroids, subWaves, isBossWave?,
 * bossTier?, isFinalBoss? }`.
 *
 * @param {number} waveNumber  1..MAX_WAVES (clamped at boundaries)
 * @returns {Object}           wave config entry
 */
export function getWaveConfig(waveNumber) {
    return _getWaveConfig(waveNumber);
}

/**
 * Pure wave-spawn step.
 *
 * Reads the current wave state, ticks the spawn timer / countdown,
 * and emits `enemy_spawn` events when the schedule fires. The wrapper
 * drains the events and constructs the actual Enemy instances
 * (sibling D's territory).
 *
 * Wave phases:
 *   - 'intro'    — wave just started, sub-wave 0 has not spawned yet.
 *                  The wrapper transitions intro → spawning when the
 *                  intro overlay lifts (legacy timing: ~700 ms after
 *                  startNextWave).
 *   - 'spawning' — at least one sub-wave has spawned; more may follow.
 *                  This is the steady state during gameplay.
 *   - 'clearing' — all sub-waves have spawned but enemies remain.
 *                  No further spawn events fire.
 *   - 'complete' — all sub-waves spawned AND zero enemies. The wrapper
 *                  observes this and triggers the wave-clear flow
 *                  (mission resolve, bonus XP/coins, powerups menu).
 *
 * @param {import('./state.js').WaveState} wave
 * @param {import('./state.js').WaveUpdateContext} ctx — `enemyCount`,
 *                                                  `ships`, `dt`, `rng`
 *                                                  (rng currently unused;
 *                                                  reserved for future
 *                                                  randomized scheduling).
 * @param {Array<*>} events — out-buffer for events this tick. Pushes:
 *                            - `{ type: 'enemy_spawn', enemyType, count,
 *                                 isBoss?, bossTier?, level, wave }` per
 *                                 group in the spawning sub-wave.
 *                            - `{ type: 'wave_clear', wave }` when the
 *                                 wave transitions to 'complete'.
 * @returns {import('./state.js').WaveState} the (mutated) wave state
 */
export function updateWave(wave, ctx, events) {
    if (!wave) return wave;

    // ── 'intro' or 'complete' phases: nothing to do ──
    // 'intro' is a brief overlay phase; the wrapper transitions to
    // 'spawning' once it spawns sub-wave 0. 'complete' is terminal —
    // the wrapper opens the powerups menu and the next wave starts a
    // fresh WaveState.
    if (wave.phase === 'intro' || wave.phase === 'complete') {
        return wave;
    }

    const config = _getWaveConfig(wave.number);
    const subWaves = config.subWaves || (config.enemies ? [config.enemies] : []);
    const totalSubWaves = subWaves.length;

    // ── 'clearing' phase: all sub-waves out, watch for last enemy ──
    if (wave.phase === 'clearing') {
        if (ctx.enemyCount === 0) {
            wave.phase = 'complete';
            events.push({ type: 'wave_clear', wave: wave.number });
        }
        return wave;
    }

    // ── 'spawning' phase: try to advance to the next sub-wave ──
    // Exit condition: every sub-wave has been emitted. Move to
    // 'clearing' so the next tick watches for `enemyCount === 0`.
    const idx = wave.subWaveIndex | 0;
    if (idx >= totalSubWaves) {
        // All sub-waves out. If the field is already empty, jump
        // straight to 'complete' (e.g., final sub-wave was a single
        // boss that died on the same tick it spawned — vanishingly
        // rare, but cheap to handle). Otherwise sit in 'clearing'.
        wave.phase = 'clearing';
        if (ctx.enemyCount === 0) {
            wave.phase = 'complete';
            events.push({ type: 'wave_clear', wave: wave.number });
        }
        return wave;
    }

    // Advance trigger: ≤2 enemies left (player has the field
    // mostly cleared) OR 12 s since last sub-wave spawn (defensive
    // build is stalling the wave). Mirrors `tryAdvanceSubWave` in
    // `wave-manager.js`.
    const elapsed = (wave.spawnTimer | 0);
    const ready = ctx.enemyCount <= SUB_WAVE_ADVANCE_ENEMY_THRESHOLD
                  || elapsed >= SUB_WAVE_ADVANCE_STALE_MS;
    if (!ready) {
        // Not yet — accumulate elapsed time. dt is in seconds; the
        // legacy code uses Date.now() deltas in ms. We use the same
        // wall-clock dt the wrapper passes (typically 1/60 s ⇒ ~16.6 ms
        // per tick) so the 12 s threshold still triggers at the same
        // wall time.
        wave.spawnTimer = elapsed + Math.floor((ctx.dt || 0) * 1000);
        return wave;
    }

    // Emit one `enemy_spawn` event per group in this sub-wave. The
    // wrapper drains these and calls `spawnLeveledEnemies(type,
    // count, opts)` to actually instantiate Enemy objects. Bosses
    // get their `bossTier` carried through so the wrapper knows to
    // apply BOSS_TIER_STATS.
    const groups = subWaves[idx];
    if (groups && groups.length > 0) {
        const enemyLevel = getEnemyLevel(wave.number);
        for (const group of groups) {
            const evt = {
                type: 'enemy_spawn',
                enemyType: group.type,
                count: group.count | 0,
                level: enemyLevel,
                wave: wave.number,
                subWaveIndex: idx,
            };
            if (group.isBoss) evt.isBoss = true;
            if (group.bossTier) evt.bossTier = group.bossTier | 0;
            events.push(evt);
        }
    }

    // Bookkeeping: bump the index, reset the per-sub-wave spawn
    // timer, and decrement `remainingToSpawn` (informational; the
    // wrapper doesn't use it but tests + the server mirror will).
    wave.subWaveIndex = idx + 1;
    wave.spawnTimer = 0;
    if (typeof wave.remainingToSpawn === 'number') {
        wave.remainingToSpawn = Math.max(0, totalSubWaves - wave.subWaveIndex);
    }
    return wave;
}

// Re-export the helper readers from wave-data so callers consuming the
// pure surface (`import { … } from 'js/sim/wave.js'`) don't need to
// reach into the legacy module path.
export { getEnemyLevel, getAsteroidLevel, isBossWave };
