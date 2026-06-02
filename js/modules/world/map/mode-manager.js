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
        // Random-order cycle state (a shuffled "bag" of map indices).
        this._bag = null;
        this._bagPos = 0;
        this._lastIndex = null;
    }

    // RANDOM ORDER — draw maps from a shuffled bag of every map, so the cycle
    // order is random but each map appears once before any repeats, and no map
    // repeats back-to-back across bag boundaries.
    _buildBag() {
        const idxs = this.campaign.map((_, i) => i);
        for (let i = idxs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t;
        }
        if (this._lastIndex != null && idxs.length > 1 && idxs[0] === this._lastIndex) {
            const t = idxs[0]; idxs[0] = idxs[1]; idxs[1] = t;
        }
        this._bag = idxs;
        this._bagPos = 0;
    }

    _nextIndex() {
        if (!this._bag || this._bagPos >= this._bag.length) this._buildBag();
        const idx = this._bag[this._bagPos++];
        this._lastIndex = idx;
        return idx;
    }

    /** Begin a fresh campaign run (called from engine.init). */
    startCampaign(engine) {
        this.mapsCleared = 0;
        this._transitioning = false;
        this._bag = null;
        this._lastIndex = null;
        this.index = this._nextIndex();
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

        // v11.1.1 — write the run CHECKPOINT at every map start. This is what
        // the GAME OVER "RESTART WAVE" button restores: replaying the map you
        // died on with the gold/loadout you had entering it. Suppressed while a
        // CONTINUE/restart is mid-restore (so it can't clobber the save being
        // loaded — engine.persistMapStartSave guards on _suppressWave1Save).
        if (typeof engine.persistMapStartSave === 'function') engine.persistMapStartSave();
    }

    /** Jump straight to a specific campaign slot + reload it (used by CONTINUE /
     *  RESTART WAVE to resume on the map the player died on). */
    loadMapByIndex(engine, index, mapsCleared) {
        const len = this.campaign.length;
        this.index = ((((index | 0) % len) + len) % len);
        this.mapsCleared = Math.max(0, mapsCleared | 0);
        this._transitioning = false;
        // Resuming this map seeds the random cycle: the next advance draws a
        // fresh bag and won't immediately repeat the resumed map.
        this._lastIndex = this.index;
        this._bag = null;
        this.loadMap(engine, this.campaign[this.index]);
    }

    /** Advance to the next (randomly-ordered) map in the cycle. */
    advance(engine) {
        if (this._transitioning) return;
        this._transitioning = true;
        this.mapsCleared++;
        this.index = this._nextIndex();
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
