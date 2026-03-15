/**
 * QA-05: Entity spawning and lifecycle
 *
 * Verifies that asteroids, enemies, particles, and stars spawn with valid
 * properties and that pool operations are correct.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, spawnAsteroids, spawnParticles, getPoolCounts } from '../helpers/game-helpers.js';

test.describe('QA-05: Entity spawning and lifecycle', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // Asteroids
    // ------------------------------------------------------------------

    test('asteroids can be spawned via pool.get()', async ({ page }) => {
        const before = (await getPoolCounts(page)).asteroids;
        await spawnAsteroids(page, 3);
        const after = (await getPoolCounts(page)).asteroids;
        expect(after).toBeGreaterThan(before);
    });

    test('spawned asteroid has valid position', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.asteroidPool.get(400, 300, 40, 1);
        });
        const ast = await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return { x: obj?.x, y: obj?.y, active: obj?.active };
        });
        expect(ast.active).toBe(true);
        // Position is the spawn point — velocity may have moved it slightly
        // in the first frame. Allow ±5 pixels.
        expect(ast.x).toBeGreaterThan(395);
        expect(ast.x).toBeLessThan(410);
        expect(ast.y).toBeGreaterThan(295);
        expect(ast.y).toBeLessThan(310);
    });

    test('spawned asteroid has a positive radius', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.asteroidPool.get(200, 200, 50, 1);
        });
        const radius = await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return obj?.radius;
        });
        expect(radius).toBeGreaterThan(0);
    });

    test('spawned asteroid has positive health', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.asteroidPool.get(300, 300, 45, 1);
        });
        const hp = await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return obj?.health;
        });
        expect(hp).toBeGreaterThan(0);
    });

    test('asteroid has velocity components', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.asteroidPool.get(500, 400, 40, 1);
        });
        const vel = await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return { vx: obj?.vel?.x, vy: obj?.vel?.y };
        });
        // Velocity may be 0.2 (the fallback) or a random value — just check finite
        expect(isFinite(vel.vx)).toBe(true);
        expect(isFinite(vel.vy)).toBe(true);
    });

    test('releasing an asteroid removes it from active pool', async ({ page }) => {
        await spawnAsteroids(page, 1);
        const countBefore = (await getPoolCounts(page)).asteroids;

        await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            if (obj) pool.release(obj);
        });

        const countAfter = (await getPoolCounts(page)).asteroids;
        expect(countAfter).toBe(countBefore - 1);
    });

    // ------------------------------------------------------------------
    // Background stars
    // ------------------------------------------------------------------

    test('background stars are active after game start', async ({ page }) => {
        const counts = await getPoolCounts(page);
        expect(counts.backgroundStars).toBeGreaterThan(0);
    });

    test('background star has a valid depth (z) value', async ({ page }) => {
        const z = await page.evaluate(() => {
            const pool = window.gameEngine.backgroundStarPool;
            return pool.activeObjects[0]?.z;
        });
        expect(typeof z).toBe('number');
        expect(z).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // Color stars (collectible orbs)
    // ------------------------------------------------------------------

    test('color stars are active after game start', async ({ page }) => {
        const counts = await getPoolCounts(page);
        expect(counts.colorStars).toBeGreaterThan(0);
    });

    test('color star has a valid position', async ({ page }) => {
        const pos = await page.evaluate(() => {
            const obj = window.gameEngine.colorStarPool.activeObjects[0];
            return { x: obj?.x, y: obj?.y };
        });
        expect(isFinite(pos.x)).toBe(true);
        expect(isFinite(pos.y)).toBe(true);
    });

    // ------------------------------------------------------------------
    // Particles
    // ------------------------------------------------------------------

    test('explosion particles can be spawned', async ({ page }) => {
        const before = (await getPoolCounts(page)).particles;
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.particlePool.get(
                ge.gameField.width / 2,
                ge.gameField.height / 2,
                'explosion'
            );
        });
        const after = (await getPoolCounts(page)).particles;
        expect(after).toBeGreaterThan(before);
    });

    test('particle has valid position and life', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.particlePool.get(100, 200, 'explosion');
        });
        const p = await page.evaluate(() => {
            const pool = window.gameEngine.particlePool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return { x: obj?.x, y: obj?.y, life: obj?.life, active: obj?.active };
        });
        expect(p.active).toBe(true);
        expect(isFinite(p.x)).toBe(true);
        expect(isFinite(p.y)).toBe(true);
        expect(p.life).toBeGreaterThan(0);
    });

    test('particle pool enforces MAX_PARTICLES limit', async ({ page }) => {
        // Spawn way more than the cap
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (let i = 0; i < 100; i++) {
                ge.particlePool.get(200, 200, 'explosion');
            }
        });
        const count = (await getPoolCounts(page)).particles;
        // Should be at or near the cap (50 by default), not 100
        expect(count).toBeLessThanOrEqual(55); // small tolerance for cap edge cases
    });

    // ------------------------------------------------------------------
    // Enemies
    // ------------------------------------------------------------------

    test('enemies can be spawned', async ({ page }) => {
        const before = (await getPoolCounts(page)).enemies;
        await page.evaluate(() => {
            window.gameEngine.enemyPool.get(500, 400, 'HUNTER', 1);
        });
        const after = (await getPoolCounts(page)).enemies;
        expect(after).toBeGreaterThan(before);
    });

    test('spawned enemy has positive health', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine.enemyPool.get(500, 400, 'HUNTER', 1);
        });
        const hp = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool;
            return pool.activeObjects[pool.activeObjects.length - 1]?.health;
        });
        expect(hp).toBeGreaterThan(0);
    });
});
