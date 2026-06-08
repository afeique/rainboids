// world/map/map-modes.js
//
// v12.0.0 — the game is a SINGLE open, fixed-size arena again. The multi-map
// Campaign (CHAOS / ASSAULT / SIEGE, plus the earlier DUNGEON) was removed: it
// confined the ship to bands/tethers and shrank the field below the viewport,
// so big regions of the screen were unreachable. The game is now one OPEN SPACE
// map — free roam across the whole fixed field, endless escalating waves of
// enemies + asteroids, no movement confinement and no exit portals.
//
// The mode is still a plain object the ModeManager drives: setup() builds the
// field + initial spawn, update() runs the per-frame spawn logic. There is no
// constrainPlayer() (free roam) and no portalAt() (you play until you die).
//
// The WorldMap wall API (walls, push-out collision, neon rendering) is retained
// as generic, no-op-without-walls infrastructure for any future map.

import { GAME_CONFIG } from '../../core/constants.js';
import {
    randomEnemyType, spawnEnemyAt, liveEnemyCount, placePlayer,
} from './mode-utils.js';
import { frameClock } from '../../core/frame-clock.js';

function _now() { return frameClock.now || 0; }

// Spawn n enemies at random points on the field's perimeter (just inside).
function _spawnEdgeWave(engine, n, level) {
    const { width, height } = engine.worldMap.bounds;
    const m = 60;
    for (let i = 0; i < n; i++) {
        const side = (Math.random() * 4) | 0;
        let x, y;
        if (side === 0) { x = Math.random() * width; y = m; }
        else if (side === 1) { x = width - m; y = Math.random() * height; }
        else if (side === 2) { x = Math.random() * width; y = height - m; }
        else { x = m; y = Math.random() * height; }
        spawnEnemyAt(engine, randomEnemyType(), x, y, level);
    }
}

// Per-wave difficulty escalation (endless). Enemy level climbs ~1.2 per wave to
// a cap; asteroid level half as fast. Pulled out so loadMap (resume) and update
// (per-wave) derive level identically from the wave index.
function _enemyLevelFor(waveIndex) { return Math.min(30, 1 + Math.floor(waveIndex * 1.2)); }
function _asteroidLevelFor(waveIndex) { return Math.min(12, 1 + Math.floor(waveIndex / 2)); }

// ── OPEN SPACE — the whole game ──────────────────────────────────────────────
// One fixed-size arena. Free roam, shoot, survive. Each wave clears into the
// next (endless): the field never transitions, so no exit portal ever spawns.
export const OPEN = {
    id: 'OPEN',
    name: 'RAINBOIDS',
    subtitle: 'Open space — clear the endless swarm.',
    size: { width: GAME_CONFIG.FIELD_WIDTH, height: GAME_CONFIG.FIELD_HEIGHT },
    spawnsOwnPortal: false,
    endless: true,

    // `startWave` lets CONTINUE / RESTART resume the run at the wave the player
    // died on (difficulty + counter) rather than always from wave 1.
    setup(engine, mm, state, startWave = 0) {
        engine.worldMap.clearWalls();
        const { width, height } = this.size;
        placePlayer(engine, width / 2, height / 2);
        state.waveIndex = Math.max(0, startWave | 0);
        state.spawned = false;
        state.nextAt = _now() + 700;
    },

    update(engine, mm, state, dt) {
        const now = _now();
        if (!state.spawned && now >= state.nextAt) {
            state.spawned = true;
            engine.game.enemyLevel = _enemyLevelFor(state.waveIndex);
            engine.game.asteroidLevel = _asteroidLevelFor(state.waveIndex);
            engine.game.currentWave = state.waveIndex + 1;
            // Checkpoint the run at each wave start so RESTART WAVE / CONTINUE
            // resumes on the wave the player is actually on.
            mm.checkpointWave(engine, state.waveIndex);
            const n = 4 + state.waveIndex * 2;
            _spawnEdgeWave(engine, n, engine.game.enemyLevel);
            if (typeof engine.spawnLeveledAsteroids === 'function') {
                engine.spawnLeveledAsteroids(3 + Math.min(9, state.waveIndex));
            }
            return false;
        }
        if (state.spawned && liveEnemyCount(engine) === 0 && now >= state.nextAt + 800) {
            // Wave cleared → roll straight into the next one. Endless: the field
            // never clears, so the manager never spawns a portal or advances.
            state.waveIndex++;
            state.spawned = false;
            state.nextAt = now + 900;
        }
        return false;
    },
};

// The level helpers are shared with the ModeManager (resume path).
export { _enemyLevelFor as enemyLevelForWave, _asteroidLevelFor as asteroidLevelForWave };

// A single open map. The array/object shapes are kept so the ModeManager and
// any save-compat code that indexes a "campaign" still work unchanged.
export const CAMPAIGN = [OPEN];
export const MAP_MODES = { OPEN };
