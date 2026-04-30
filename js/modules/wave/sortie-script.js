// Sortie runner — Galaxian-mode top-down stream.
//
// Stages run for `duration` ms with a continuous stream of enemies and
// asteroids entering from the top edge, following fixed paths down the
// screen, exiting off-bottom (or off-side, for diagonal/swoop paths).
// No formation hold — enemies are always in motion southward.
//
// Honors `stage.events` for one-shot timeline beats (banner, scripted
// type spawns); the bulk of pacing comes from `spawnEvery` / `asteroidEvery`.

import { getStage } from './stage-data.js';
import { GameDimensions, random } from '../core/utils.js';
import { pickPathForType, buildPathParams } from './spawn-paths.js';

function pickInRange(range) {
    if (!range) return 1500;
    return range[0] + Math.random() * (range[1] - range[0]);
}

export class SortieRunner {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.stage = null;
        this.startTime = 0;
        this.eventIdx = 0;
        this.complete = false;
        this.spawningClosed = false;
        this._spawnAt = 0;
        this._asteroidAt = 0;
        this._poolIdx = 0;
    }

    start(stageNum) {
        this.stage = getStage(stageNum);
        this.startTime = performance.now();
        this.eventIdx = 0;
        this.complete = false;
        this.spawningClosed = false;
        const now = performance.now();
        // Use refillEvery as the per-enemy cadence (legacy field name) so
        // existing stage data continues to work.
        const enemyEvery = this.stage.spawnEvery ?? this.stage.refillEvery ?? [1400, 2400];
        this._enemyEvery = enemyEvery;
        this._spawnAt = now + 600;
        this._asteroidAt = now + (this.stage.asteroidEvery ? pickInRange(this.stage.asteroidEvery) : 3500);
        this._poolIdx = 0;
    }

    tick() {
        if (this.complete || !this.stage) return;
        const now = performance.now();
        const elapsed = now - this.startTime;

        // Drain one-shot timeline events
        while (this.eventIdx < (this.stage.events?.length ?? 0) &&
               this.stage.events[this.eventIdx].at <= elapsed) {
            this.handleEvent(this.stage.events[this.eventIdx]);
            this.eventIdx++;
        }

        // Stage duration elapsed → close spawning, wait for cleanup.
        if (!this.spawningClosed && elapsed >= this.stage.duration) {
            this.spawningClosed = true;
        }

        if (!this.spawningClosed) {
            // Continuous enemy stream
            if (now >= this._spawnAt) {
                this.spawnPathEnemy();
                this._spawnAt = now + pickInRange(this._enemyEvery);
            }
            // Asteroid stream
            if (now >= this._asteroidAt) {
                for (let i = 0; i < (this.stage.asteroidCount ?? 1); i++) {
                    this.spawnFallingAsteroid();
                }
                this._asteroidAt = now + pickInRange(this.stage.asteroidEvery ?? [3000, 4500]);
            }
        }

        // Stage completes when spawning is closed AND playfield is clear.
        if (this.spawningClosed) {
            const live = this.engine.enemyPool.activeObjects.filter(e => !e._deathFlash).length;
            if (live === 0) this.complete = true;
        }
    }

    handleEvent(ev) {
        switch (ev.kind) {
            case 'banner':
                this.engine.waveMessage = {
                    active: true,
                    startTime: Date.now(),
                    duration: ev.duration ?? 1500,
                    title: ev.title,
                    subtitle: ev.subtitle ?? '',
                };
                break;
            case 'spawn':
                for (let i = 0; i < (ev.count ?? 1); i++) {
                    this.spawnPathEnemy(ev.type);
                }
                break;
            case 'asteroid':
                for (let i = 0; i < (ev.count ?? 1); i++) {
                    this.spawnFallingAsteroid();
                }
                break;
        }
    }

    spawnPathEnemy(typeOverride = null) {
        const engine = this.engine;
        const enemy = engine.enemyPool.get();
        if (!enemy) return;
        const type = typeOverride ?? this.nextPoolType();
        const w = engine.gameField.width;
        // Spawn x is biased to top-edge band; clamp inside playfield
        const sx = w * 0.12 + Math.random() * w * 0.76;
        const sy = -60 - Math.random() * 80;
        enemy.reset(sx, sy, type, engine.game.enemyLevel || 1, engine);
        if (typeof engine.applyEnemyLevelScaling === 'function') {
            engine.applyEnemyLevelScaling(enemy);
        }
        // Pick a path. Speed scaled by stage difficulty + enemy level.
        const baseSpeed = 1.6 + Math.random() * 0.8 + (engine.game.enemyLevel - 1) * 0.12;
        const pathName = pickPathForType(type);
        // Diagonal/swoop paths bias direction inward when spawning near edge
        const dirHint = sx < w * 0.3 ? 1 : sx > w * 0.7 ? -1 : null;
        enemy.galaxianPath = buildPathParams(pathName, { speed: baseSpeed, dir: dirHint });
        enemy.pathStartTime = performance.now();
        enemy.pathStartX = sx;
        enemy.pathStartY = sy;
        enemy.diveSouth = true;
        enemy.inFormation = false;
        enemy._formationNextFireAt = null;
        // Initial velocity hint so warp-in face direction is downward
        enemy.vel.x = 0;
        enemy.vel.y = enemy.galaxianPath.speed;
        enemy.faceAngle = Math.PI / 2;
        // Skip warp-in — top-down spawn flies in directly (cleaner read)
        enemy.warping = false;
    }

    nextPoolType() {
        const pool = this.stage.pool || ['HUNTER'];
        const t = pool[this._poolIdx % pool.length];
        this._poolIdx++;
        return t;
    }

    // Vertical-stream asteroid: spawns above top edge, falls straight down
    // with slight horizontal drift. Released when off-bottom.
    spawnFallingAsteroid() {
        const engine = this.engine;
        const w = engine.gameField.width;
        const r = random(28, 56);
        const x = random(w * 0.08, w * 0.92);
        const y = -r - 40;
        const ast = engine.asteroidPool.get(x, y, r, engine.game.asteroidLevel || 1, engine);
        if (!ast) return;
        if (typeof ast.initializeAsteroid === 'function') {
            ast.initializeAsteroid(x, y, r, engine.game.asteroidLevel || 1, engine);
        }
        ast.vel = {
            x: random(-0.5, 0.5),
            y: 1.0 + Math.random() * 1.4,
        };
        ast.fallingAsteroid = true;
    }

    onEnemyKilled(enemy) {
        if (enemy.formationSlot) {
            enemy.formationSlot.occupant = null;
            enemy.formationSlot = null;
        }
        enemy.inFormation = false;
        enemy.galaxianPath = null;
    }
}
