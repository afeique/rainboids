// world/map/mode-manager.js
//
// v12.0.0 — drives the single OPEN arena. The multi-map Campaign (random map
// cycle + exit portals + between-map transitions) was removed; the game is one
// endless open field again. This thin manager keeps the engine's integration
// points (startCampaign / loadMap / loadMapByIndex / update / draw) so the rest
// of the engine is unchanged, but there is no portal, no map advance, and no
// movement confinement — the per-wave loop lives in the OPEN mode (map-modes.js).

import { OPEN, enemyLevelForWave, asteroidLevelForWave } from './map-modes.js';
import { Portal } from './portal.js';
import { clearCombatEntities } from './mode-utils.js';

export class ModeManager {
    constructor() {
        this.current = null;
        this.state = {};
        // Single map — `index` is always 0. `mapsCleared` is repurposed as the
        // run's wave checkpoint (highest wave reached). Both are kept because
        // serializeRunState / restoreRunState read them for the CONTINUE save.
        this.index = 0;
        this.mapsCleared = 0;
        // Retained but never spawned — kept so a future map can opt back into a
        // portal without re-plumbing the engine. draw() no-ops while inactive.
        this.portal = new Portal();
    }

    /** Begin a fresh run on the OPEN arena (called from engine.init). */
    startCampaign(engine, startWave = 0) {
        this.loadMap(engine, OPEN, Math.max(0, startWave | 0));
    }

    /** Build the OPEN field + initial spawn. `startWave` resumes a saved run. */
    loadMap(engine, mode, startWave = 0) {
        this.current = mode;
        this.state = {};
        this.index = 0;
        const w = Math.max(0, startWave | 0);
        this.mapsCleared = w;
        this.portal.deactivate();
        clearCombatEntities(engine);

        // Seed difficulty for the resumed wave; the mode's update re-derives
        // enemy/asteroid level per wave from the same helpers.
        engine.game.enemyLevel = enemyLevelForWave(w);
        engine.game.asteroidLevel = asteroidLevelForWave(w);
        engine.game.currentWave = w + 1;

        // Resize the world to the map (gameField shares this bounds object).
        engine.worldMap.setBounds(mode.size.width, mode.size.height);
        engine.worldMap.clearWalls();

        mode.setup(engine, this, this.state, w);

        // Intro banner + brief spawn-in invincibility.
        engine.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: 2600,
            title: mode.name,
            subtitle: mode.subtitle,
            phase: 'intro',
        };
        if (engine.player && engine.player.active && typeof engine.player.makeInvincible === 'function') {
            engine.player.makeInvincible(2200);
        }

        // Write the run CHECKPOINT at the start of the run. Suppressed while a
        // CONTINUE/restart is mid-restore (engine.persistMapStartSave guards on
        // _suppressWave1Save) so it can't clobber the save being loaded.
        if (typeof engine.persistMapStartSave === 'function') engine.persistMapStartSave();
    }

    /** CONTINUE / RESTART WAVE — resume the OPEN run at the saved wave. The
     *  legacy (index, mapsCleared) save shape maps to (ignored, startWave):
     *  `mapsCleared` now carries the wave checkpoint. */
    loadMapByIndex(engine, index, mapsCleared) {
        this.loadMap(engine, OPEN, Math.max(0, mapsCleared | 0));
    }

    /** Record the current wave as the run checkpoint so the CONTINUE save (and
     *  GAME OVER → RESTART WAVE) resumes here. Called at each wave start. */
    checkpointWave(engine, waveIndex) {
        this.mapsCleared = Math.max(0, waveIndex | 0);
        if (typeof engine.persistMapStartSave === 'function') engine.persistMapStartSave();
    }

    /** Per-frame tick — runs the endless wave logic. No portal, no transition. */
    update(engine, dt) {
        if (!this.current) return;
        this.current.update(engine, this, this.state, dt);

        // Player ↔ wall collision — no-op without walls (kept for future maps).
        const player = engine.player;
        if (player && engine.worldMap.hasWalls) {
            const r = player.radius || 14;
            const res = engine.worldMap.resolveCircle(player.x, player.y, r);
            if (res.hit) { player.x = res.x; player.y = res.y; }
        }
    }

    /** Draw the (dormant) portal — a no-op while it's deactivated. */
    draw(engine, ctx, now) {
        this.portal.draw(ctx, now);
    }
}
