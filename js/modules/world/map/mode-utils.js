// world/map/mode-utils.js
//
// v11.0.0 — shared helpers used by the map modes + the ModeManager. Kept
// separate to avoid a modes ⇄ manager import cycle.

// The 10 fully-implemented enemy archetypes. Weighted toward lighter fighters
// so a randomized spawn isn't a wall of tanks.
export const SPAWNABLE_ENEMIES = [
    'HUNTER', 'HUNTER', 'WASP', 'WASP', 'DRIFTER', 'STALKER',
    'PROWLER', 'WEAVER', 'GUARDIAN', 'SENTINEL', 'TANGERINE', 'TITAN',
];

export function randomEnemyType(rng = Math.random) {
    return SPAWNABLE_ENEMIES[(rng() * SPAWNABLE_ENEMIES.length) | 0];
}

/** Spawn one enemy at a world position at the given level. Returns it (or null
 *  if the pool refused). `warp` plays the scale-in pop + brief spawn grace. */
export function spawnEnemyAt(engine, type, x, y, level, { warp = true } = {}) {
    const e = engine.enemyPool.get();
    if (!e) return null;
    e.reset(x, y, type, level, engine);
    if (e.bulletSpeedMul == null) e.bulletSpeedMul = 1;
    if (warp && typeof e.startWarpIn === 'function') e.startWarpIn(x, y);
    return e;
}

/** Clear every combat entity (enemies, bullets, asteroids, debris, powerups)
 *  for a clean slate between map encounters. The player is preserved. */
export function clearCombatEntities(engine) {
    const pools = [
        engine.enemyPool, engine.enemyBulletPool, engine.bulletPool,
        engine.asteroidPool, engine.asteroidShardPool, engine.lineDebrisPool,
        engine.powerupPool,
    ];
    for (const p of pools) { if (p && typeof p.drainActive === 'function') p.drainActive(); }
    if (engine.formationManager && typeof engine.formationManager.clear === 'function') {
        engine.formationManager.clear();
    } else if (engine.formationManager) {
        // best-effort: drop any tracked formations
        if (Array.isArray(engine.formationManager.formations)) engine.formationManager.formations.length = 0;
    }
}

/** Count active, non-dying enemies (the clear-condition signal). */
export function liveEnemyCount(engine) {
    let n = 0;
    const a = engine.enemyPool.activeObjects;
    for (let i = 0; i < a.length; i++) {
        const e = a[i];
        if (e.active && !(e._deathFlash > 0)) n++;
    }
    return n;
}

/** Position the player at a world point with zeroed velocity. */
export function placePlayer(engine, x, y) {
    const p = engine.player;
    if (!p) return;
    p.x = x; p.y = y;
    if (p.vel) { p.vel.x = 0; p.vel.y = 0; }
    // Snap the camera so the new map doesn't pan from the old position.
    if (engine.camera) {
        engine.camera.targetX = x - engine.width / 2;
        engine.camera.targetY = y - engine.height / 2;
        engine.camera.x = engine.camera.targetX;
        engine.camera.y = engine.camera.targetY;
    }
}
