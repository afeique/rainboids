// world/map/map-modes.js
//
// v11.0.0 — the Campaign's map encounters. Each mode is a plain object the
// ModeManager drives: setup() builds the field + initial spawn, update() runs
// the per-frame spawn/objective logic and returns `true` once the map is
// cleared, constrainPlayer() applies any movement rule, and portalAt() says
// where the exit portal appears.
//
//   CHAOS   — the classic open arena: a few fully-randomized waves of chaos.
//   DUNGEON — 4× world, procedural glowing labyrinth; navigate to the exit.
//   ASSAULT — vertical shmup: hold the bottom band, clear descending formations.
//   SIEGE   — radial tower-defense: hold the centre, survive converging rings.

import { generateDungeon, buildFlowField, flowWaypoint } from './dungeon-generator.js';
import {
    randomEnemyType, spawnEnemyAt, liveEnemyCount, placePlayer,
} from './mode-utils.js';
import { frameClock } from '../../core/frame-clock.js';

function _now() { return frameClock.now || 0; }
function _tickScale(dt) { return Math.max(0.25, Math.min(2, (dt || 16.67) / 16.67)); }

// Spawn n enemies at random points on the field's perimeter (just inside).
function _spawnEdgeWave(engine, n, level) {
    const { width, height } = engine.worldMap.bounds;
    for (let i = 0; i < n; i++) {
        const side = (Math.random() * 4) | 0;
        let x, y;
        const m = 60;
        if (side === 0) { x = Math.random() * width; y = m; }
        else if (side === 1) { x = width - m; y = Math.random() * height; }
        else if (side === 2) { x = Math.random() * width; y = height - m; }
        else { x = m; y = Math.random() * height; }
        spawnEnemyAt(engine, randomEnemyType(), x, y, level);
    }
}

// ── CHAOS ──────────────────────────────────────────────────────────────────
export const CHAOS = {
    id: 'CHAOS',
    name: 'CHAOS FIELD',
    subtitle: 'Pure randomized mayhem — clear the waves.',
    size: { width: 1920, height: 1080 },
    spawnsOwnPortal: false,

    setup(engine, mm, state) {
        engine.worldMap.clearWalls();
        const { width, height } = this.size;
        placePlayer(engine, width / 2, height / 2);
        state.waves = 3;
        state.waveIndex = 0;
        state.nextAt = _now() + 600;
        state.spawned = false;
    },

    update(engine, mm, state, dt) {
        const now = _now();
        if (!state.spawned && now >= state.nextAt) {
            state.spawned = true;
            const n = 4 + state.waveIndex * 3;
            _spawnEdgeWave(engine, n, engine.game.enemyLevel);
            engine.game.asteroidLevel = 1 + state.waveIndex;
            if (typeof engine.spawnLeveledAsteroids === 'function') {
                engine.spawnLeveledAsteroids(3 + state.waveIndex);
            }
            return false;
        }
        if (state.spawned && liveEnemyCount(engine) === 0 && now >= state.nextAt + 800) {
            state.waveIndex++;
            if (state.waveIndex >= state.waves) return true; // cleared
            state.spawned = false;
            state.nextAt = now + 700;
        }
        return false;
    },

    portalAt(engine) {
        return { x: this.size.width / 2, y: this.size.height / 2 };
    },
};

// ── DUNGEON ──────────────────────────────────────────────────────────────────
export const DUNGEON = {
    id: 'DUNGEON',
    name: 'THE LABYRINTH',
    subtitle: 'Navigate the glowing maze. Reach the exit portal.',
    size: { width: 3840, height: 2160 },
    spawnsOwnPortal: true,

    setup(engine, mm, state) {
        const d = generateDungeon(this.size.width, this.size.height, {
            cellSize: 220,
            enemyCount: 14 + Math.min(10, engine.game.enemyLevel),
        });
        state.dungeon = d;
        state.dist = null;
        state.distAt = 0;
        engine.worldMap.setWalls(d.walls);
        placePlayer(engine, d.playerStart.x, d.playerStart.y);
        for (const sp of d.enemySpawns) {
            spawnEnemyAt(engine, randomEnemyType(), sp.x, sp.y, engine.game.enemyLevel);
        }
        mm.portal.spawn(d.portalPos.x, d.portalPos.y, 70);
    },

    update(engine, mm, state, dt) {
        const d = state.dungeon;
        if (!d) return false;
        const now = _now();
        const p = engine.player;
        const pr = p.radius || 14;
        // Refresh the BFS flow-field a few times a second.
        if (!state.dist || now - state.distAt > 380) {
            state.dist = buildFlowField(d, p.x, p.y);
            state.distAt = now;
        }
        const ts = _tickScale(dt);
        const en = engine.enemyPool.activeObjects;
        const wm = engine.worldMap;
        for (let i = 0; i < en.length; i++) {
            const e = en[i];
            if (!e.active || e.warping || e._deathFlash > 0) continue;
            const er = e.radius || 18;
            const spd = (e.config && e.config.speed) ? e.config.speed : 2;
            const ddx = p.x - e.x, ddy = p.y - e.y;
            const distP = Math.hypot(ddx, ddy) || 1;
            // Hold a STANDOFF gap so the maze nav never herds the whole pack
            // onto the player and ram-kills them — they path to range, then
            // engage with their firing AI instead of dive-bombing.
            const standoff = er + pr + 130;

            // SEPARATION — push apart from nearby enemies so they don't stack
            // into a single instant-kill blob in the corridors.
            let sepx = 0, sepy = 0;
            for (let j = 0; j < en.length; j++) {
                if (j === i) continue;
                const o = en[j];
                if (!o.active || o.warping) continue;
                const dx = e.x - o.x, dy = e.y - o.y;
                const dd = dx * dx + dy * dy;
                const minD = er + (o.radius || 18) + 10;
                if (dd > 0.001 && dd < minD * minD) {
                    const dl = Math.sqrt(dd);
                    sepx += (dx / dl) * (minD - dl);
                    sepy += (dy / dl) * (minD - dl);
                }
            }

            let vx, vy;
            if (distP > standoff) {
                // PATH toward the player via the flow-field waypoint (routes
                // around walls); blend in separation.
                const wp = flowWaypoint(d, state.dist, e.x, e.y);
                let ax = wp ? wp.x - e.x : ddx;
                let ay = wp ? wp.y - e.y : ddy;
                const al = Math.hypot(ax, ay) || 1;
                vx = (ax / al) * spd + sepx * 0.5;
                vy = (ay / al) * spd + sepy * 0.5;
            } else if (distP < standoff - 24) {
                // Too close — back off toward the standoff ring (+ separation).
                vx = (-ddx / distP) * spd + sepx * 0.6;
                vy = (-ddy / distP) * spd + sepy * 0.6;
            } else {
                // At range — orbit slowly so the pack spreads around the player
                // and keeps line-of-fire, rather than crashing in.
                vx = (-ddy / distP) * spd * 0.5 + sepx * 0.6;
                vy = (ddx / distP) * spd * 0.5 + sepy * 0.6;
            }
            e.x += vx * ts;
            e.y += vy * ts;
            if (e.vel) { e.vel.x = vx; e.vel.y = vy; }

            // Keep enemies out of walls (corridor-bound; also stops separation
            // from shoving them through a wall).
            if (wm.hasWalls) {
                const res = wm.resolveCircle(e.x, e.y, er);
                if (res.hit) { e.x = res.x; e.y = res.y; }
            }
        }
        // Bullets are stopped by walls.
        _despawnBulletsInWalls(engine);
        return false; // cleared by reaching the portal (manager handles touch)
    },
};

function _despawnBulletsInWalls(engine) {
    const wm = engine.worldMap;
    if (!wm.hasWalls) return;
    for (const pool of [engine.bulletPool, engine.enemyBulletPool]) {
        const a = pool.activeObjects;
        for (let i = a.length - 1; i >= 0; i--) {
            const b = a[i];
            if (b.active && wm.pointInWall(b.x, b.y)) {
                b.active = false;
                pool.release(b);
            }
        }
    }
}

// ── ASSAULT ──────────────────────────────────────────────────────────────────
export const ASSAULT = {
    id: 'ASSAULT',
    name: 'ASSAULT RUN',
    subtitle: 'Hold the line — shoot down the descending swarm.',
    size: { width: 1600, height: 1120 },
    spawnsOwnPortal: false,

    setup(engine, mm, state) {
        engine.worldMap.clearWalls();
        const { width, height } = this.size;
        placePlayer(engine, width / 2, height - 130);
        state.waves = 3;
        state.waveIndex = 0;
        state.nextAt = _now() + 600;
        state.spawned = false;
        state.cleared = false;
    },

    update(engine, mm, state, dt) {
        const now = _now();
        const { width } = this.size;
        if (!state.spawned && now >= state.nextAt) {
            state.spawned = true;
            const cols = 6 + state.waveIndex;
            const rows = 2 + state.waveIndex;
            const gap = width / (cols + 1);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = gap * (c + 1);
                    const y = 80 + r * 90;
                    spawnEnemyAt(engine, randomEnemyType(), x, y, engine.game.enemyLevel);
                }
            }
            return false;
        }
        if (state.spawned && liveEnemyCount(engine) === 0 && now >= state.nextAt + 800) {
            state.waveIndex++;
            if (state.waveIndex >= state.waves) { state.cleared = true; return true; }
            state.spawned = false;
            state.nextAt = now + 700;
        }
        return false;
    },

    constrainPlayer(engine, player, state) {
        // Confine to the bottom band until cleared (so it plays like Galaga);
        // once cleared, free the player to reach the centre portal.
        if (state.cleared) return;
        const { height } = this.size;
        const top = height * 0.5, bot = height - 40;
        if (player.y < top) { player.y = top; if (player.vel) player.vel.y = 0; }
        if (player.y > bot) { player.y = bot; if (player.vel) player.vel.y = 0; }
    },

    portalAt() { return { x: this.size.width / 2, y: this.size.height / 2 }; },
};

// ── SIEGE ──────────────────────────────────────────────────────────────────
export const SIEGE = {
    id: 'SIEGE',
    name: 'THE SIEGE',
    subtitle: 'Hold the centre — they come from every side.',
    size: { width: 1500, height: 1500 },
    spawnsOwnPortal: false,
    tether: 250,

    setup(engine, mm, state) {
        engine.worldMap.clearWalls();
        const { width, height } = this.size;
        placePlayer(engine, width / 2, height / 2);
        state.waves = 4;
        state.waveIndex = 0;
        state.nextAt = _now() + 600;
        state.spawned = false;
        state.cleared = false;
    },

    update(engine, mm, state, dt) {
        const now = _now();
        const { width, height } = this.size;
        const cx = width / 2, cy = height / 2;
        if (!state.spawned && now >= state.nextAt) {
            state.spawned = true;
            const n = 6 + state.waveIndex * 3;
            const R = Math.min(width, height) * 0.46;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
                spawnEnemyAt(engine, randomEnemyType(), cx + Math.cos(a) * R, cy + Math.sin(a) * R, engine.game.enemyLevel);
            }
            return false;
        }
        if (state.spawned && liveEnemyCount(engine) === 0 && now >= state.nextAt + 800) {
            state.waveIndex++;
            if (state.waveIndex >= state.waves) { state.cleared = true; return true; }
            state.spawned = false;
            state.nextAt = now + 700;
        }
        return false;
    },

    constrainPlayer(engine, player, state) {
        if (state.cleared) return; // free to reach the centre portal (already there)
        const { width, height } = this.size;
        const cx = width / 2, cy = height / 2;
        const dx = player.x - cx, dy = player.y - cy;
        const d = Math.hypot(dx, dy);
        if (d > this.tether) {
            player.x = cx + (dx / d) * this.tether;
            player.y = cy + (dy / d) * this.tether;
            if (player.vel) { player.vel.x *= 0.4; player.vel.y *= 0.4; }
        }
    },

    portalAt() { return { x: this.size.width / 2, y: this.size.height / 2 }; },
};

// The Campaign cycle. Built to grow — add variants here and they slot into the
// rotation. CHAOS leads (a gentle, familiar intro) then the three new arenas.
export const CAMPAIGN = [CHAOS, DUNGEON, ASSAULT, SIEGE];

export const MAP_MODES = { CHAOS, DUNGEON, ASSAULT, SIEGE };
