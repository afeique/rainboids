// world/map/mode-manager.js
//
// v11.0.0 — drives the Campaign. Replaces the wave-progression loop: each map
// is a self-contained encounter (map-modes.js); clearing it opens an EXIT
// PORTAL; touching the portal warps to the next map in the cycle. Owns the
// portal, the per-frame objective tick, player↔wall collision, and the
// between-map transition.

import { CAMPAIGN } from './map-modes.js';
import { Portal } from './portal.js';
import { clearCombatEntities } from './mode-utils.js';
import { GAME_STATES } from '../../core/constants.js';

export class ModeManager {
    constructor() {
        this.campaign = CAMPAIGN;
        this.index = 0;
        this.mapsCleared = 0;
        this.current = null;
        this.state = {};
        this.portal = new Portal();
        this._transitioning = false;
    }

    /** Begin a fresh campaign run (called from engine.init). */
    startCampaign(engine) {
        this.index = 0;
        this.mapsCleared = 0;
        this._transitioning = false;
        this.loadMap(engine, this.campaign[this.index]);
    }

    /** Tear down the field and set up `mode` as the active encounter. */
    loadMap(engine, mode) {
        this.current = mode;
        this.state = {};
        this.portal.deactivate();
        clearCombatEntities(engine);

        // Campaign escalation: each cleared map lifts enemy level.
        engine.game.enemyLevel = Math.min(30, 1 + this.mapsCleared * 2);
        engine.game.asteroidLevel = Math.min(12, 1 + this.mapsCleared);
        engine.game.currentWave = this.mapsCleared + 1; // keep legacy helpers sane

        // Resize the world to this map (gameField shares this bounds object).
        engine.worldMap.setBounds(mode.size.width, mode.size.height);
        engine.worldMap.clearWalls();

        mode.setup(engine, this, this.state);

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
    }

    /** Advance to the next map in the cycle. */
    advance(engine) {
        if (this._transitioning) return;
        this._transitioning = true;
        this.mapsCleared++;
        this.index = (this.index + 1) % this.campaign.length;
        // Quick screen flash to mask the field swap.
        engine._postInitFade = { startTime: Date.now(), duration: 600 };
        this.loadMap(engine, this.campaign[this.index]);
        this._transitioning = false;
    }

    /** Per-frame campaign tick. Called from engine.update during PLAYING. */
    update(engine, dt) {
        if (!this.current) return;
        const player = engine.player;
        this.portal.update(dt);

        // Portal reached → next map.
        if (this.portal.active && player && this.portal.contains(player.x, player.y)) {
            this.advance(engine);
            return;
        }

        // Objective tick.
        const cleared = this.current.update(engine, this, this.state, dt);
        if (cleared && !this.portal.active && !this.current.spawnsOwnPortal) {
            const pos = this.current.portalAt ? this.current.portalAt(engine, this.state) : null;
            if (pos) {
                this.portal.spawn(pos.x, pos.y, 70);
                engine.waveMessage = {
                    active: true, startTime: Date.now(), duration: 2200,
                    title: 'MAP CLEAR', subtitle: 'The exit portal is open.', phase: 'intro',
                };
            }
        }

        // Per-mode movement rule (Galaga band / Siege tether).
        if (player && typeof this.current.constrainPlayer === 'function') {
            this.current.constrainPlayer(engine, player, this.state);
        }

        // Player ↔ wall collision (dungeon).
        if (player && engine.worldMap.hasWalls) {
            const r = player.radius || 14;
            const res = engine.worldMap.resolveCircle(player.x, player.y, r);
            if (res.hit) {
                player.x = res.x; player.y = res.y;
            }
        }
    }

    /** Draw the portal (walls are drawn by WorldMap in the engine draw pass). */
    draw(engine, ctx, now) {
        this.portal.draw(ctx, now);
    }
}
