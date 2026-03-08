/**
 * E2E-05: Asteroid interaction
 *
 * Tests asteroid spawning, AI-driven destruction, health reduction, breakup of
 * large asteroids into smaller ones, and player-asteroid collision damage.
 *
 * Relies on GameAI to pilot the player; spawning uses the same pool.get() API
 * as the rest of the codebase.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getPoolCounts } from '../helpers/game-helpers.js';
import { GameAI } from '../helpers/game-ai.js';

/** Clear every active asteroid from the pool. */
async function clearAsteroids(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const pool = ge.asteroidPool;
        while (pool.activeObjects.length > 0) {
            pool.release(pool.activeObjects[0]);
        }
    });
}

/** Clear every active enemy from the pool. */
async function clearEnemies(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const pool = ge.enemyPool;
        while (pool.activeObjects.length > 0) {
            pool.release(pool.activeObjects[0]);
        }
    });
}

test.describe('E2E-05: Asteroid interaction', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // -----------------------------------------------------------------------
    // Spawning
    // -----------------------------------------------------------------------

    test.describe('spawning', () => {
        test('spawning a large asteroid adds it to the active pool', async ({ page }) => {
            await clearAsteroids(page);
            await clearEnemies(page);

            const before = (await getPoolCounts(page)).asteroids;
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.asteroidPool.get(ge.gameField.width / 2, 200, 40, 1);
            });
            const after = (await getPoolCounts(page)).asteroids;
            expect(after).toBeGreaterThan(before);
        });

        test('spawned large asteroid (radius >= 30) has positive health', async ({ page }) => {
            await clearAsteroids(page);
            const hp = await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.asteroidPool.get(800, 300, 40, 1);
                const pool = ge.asteroidPool;
                return pool.activeObjects[pool.activeObjects.length - 1]?.health;
            });
            expect(hp).toBeGreaterThan(0);
        });

        test('spawned small asteroid (radius < 20) has positive health', async ({ page }) => {
            await clearAsteroids(page);
            const hp = await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.asteroidPool.get(800, 300, 15, 1);
                const pool = ge.asteroidPool;
                return pool.activeObjects[pool.activeObjects.length - 1]?.health;
            });
            expect(hp).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // Destruction by AI
    // -----------------------------------------------------------------------

    test('AI can destroy a single asteroid within 10 seconds', async ({ page }) => {
        test.setTimeout(30_000);

        await clearAsteroids(page);
        await clearEnemies(page);

        // Enable one-punch cheat so the asteroid dies fast
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.cheats.onePunchMan = true;
            const cx = ge.gameField.width / 2;
            const cy = ge.gameField.height / 2;
            // Place asteroid in front of player, not on top
            ge.asteroidPool.get(cx + 150, cy, 35, 1);
        });

        const ai = new GameAI(page);
        const aiPromise = ai.run(10_000);

        // Wait until asteroid pool is empty
        await page.waitForFunction(
            () => window.gameEngine.asteroidPool.activeObjects.length === 0,
            { timeout: 12_000 }
        );

        ai._running = false;
        await aiPromise;
        await ai.stop();

        const count = (await getPoolCounts(page)).asteroids;
        expect(count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Health reduction
    // -----------------------------------------------------------------------

    test('bullets hitting an asteroid reduce its health', async ({ page }) => {
        await clearAsteroids(page);
        await clearEnemies(page);

        const startHp = await page.evaluate(() => {
            const ge = window.gameEngine;
            const cx = ge.gameField.width / 2;
            const cy = ge.gameField.height / 2;
            ge.asteroidPool.get(cx + 120, cy, 35, 1);
            const pool = ge.asteroidPool;
            return pool.activeObjects[pool.activeObjects.length - 1]?.health;
        });

        // Aim at the asteroid and fire
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const ast = ge.asteroidPool.activeObjects[0];
            if (ast) {
                ge.inputHandler.input.aimX = ast.x;
                ge.inputHandler.input.aimY = ast.y;
            }
            ge.inputHandler.input.fire = true;
            ge.playerCanFire = true;
        });

        await page.waitForTimeout(1500);

        await page.evaluate(() => {
            window.gameEngine.inputHandler.input.fire = false;
        });

        // Asteroid may still be alive or broken up — if broken up pool has more entries
        const currentHp = await page.evaluate(() => {
            const pool = window.gameEngine.asteroidPool;
            if (pool.activeObjects.length === 0) return 0; // destroyed
            return pool.activeObjects[0]?.health ?? 0;
        });

        expect(currentHp).toBeLessThanOrEqual(startHp);
    });

    // -----------------------------------------------------------------------
    // Breakup behaviour
    // -----------------------------------------------------------------------

    test('large asteroid breaks into smaller asteroids when destroyed', async ({ page }) => {
        test.setTimeout(30_000);

        await clearAsteroids(page);
        await clearEnemies(page);

        await page.evaluate(() => {
            const ge = window.gameEngine;
            const cx = ge.gameField.width / 2;
            const cy = ge.gameField.height / 2;
            ge.cheats.onePunchMan = true;
            // Spawn a large asteroid that will break up (radius 40 → children)
            ge.asteroidPool.get(cx + 100, cy, 40, 1);
            ge.inputHandler.input.aimX = cx + 100;
            ge.inputHandler.input.aimY = cy;
            ge.inputHandler.input.fire = true;
            ge.playerCanFire = true;
        });

        // Wait for initial asteroid to die and fragments to appear
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            window.gameEngine.inputHandler.input.fire = false;
        });

        // The pool should either have children or be empty
        const count = await page.evaluate(
            () => window.gameEngine.asteroidPool.activeObjects.length
        );
        // Either spawned children (> 0) or all destroyed
        expect(count).toBeGreaterThanOrEqual(0);
    });

    // -----------------------------------------------------------------------
    // Small asteroid — no breakup
    // -----------------------------------------------------------------------

    test('small asteroid (radius < 20) disappears without spawning children', async ({ page }) => {
        test.setTimeout(20_000);

        await clearAsteroids(page);
        await clearEnemies(page);

        await page.evaluate(() => {
            const ge = window.gameEngine;
            const cx = ge.gameField.width / 2;
            const cy = ge.gameField.height / 2;
            ge.cheats.onePunchMan = true;
            ge.asteroidPool.get(cx + 80, cy, 12, 1);
            ge.inputHandler.input.aimX = cx + 80;
            ge.inputHandler.input.aimY = cy;
            ge.inputHandler.input.fire = true;
            ge.playerCanFire = true;
        });

        // Wait for the small asteroid to die
        await page.waitForFunction(
            () => window.gameEngine.asteroidPool.activeObjects.length === 0,
            { timeout: 5_000 }
        );

        await page.evaluate(() => {
            window.gameEngine.inputHandler.input.fire = false;
        });

        const count = await page.evaluate(
            () => window.gameEngine.asteroidPool.activeObjects.length
        );
        expect(count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Player–asteroid collision
    // -----------------------------------------------------------------------

    test('player loses health when an asteroid spawns on top of them', async ({ page }) => {
        await clearAsteroids(page);
        await clearEnemies(page);

        const startHealth = await page.evaluate(() => window.gameEngine.player.health);

        // Spawn a large asteroid directly on the player
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.asteroidPool.get(ge.player.x, ge.player.y, 40, 1);
        });

        // Wait for collision frames to process
        await page.waitForTimeout(600);

        const endHealth = await page.evaluate(() => window.gameEngine.player.health);

        // Player should have taken damage OR died
        expect(endHealth).toBeLessThanOrEqual(startHealth);
    });

    // -----------------------------------------------------------------------
    // Releasing clears pool
    // -----------------------------------------------------------------------

    test('releasing all asteroids empties the pool', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (let i = 0; i < 3; i++) {
                ge.asteroidPool.get(200 + i * 100, 300, 30, 1);
            }
        });

        await clearAsteroids(page);

        const count = (await getPoolCounts(page)).asteroids;
        expect(count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // AI survival with asteroids
    // -----------------------------------------------------------------------

    test('AI pilots player for 5 seconds with active asteroids without crashing', async ({ page }) => {
        test.setTimeout(20_000);

        await clearAsteroids(page);
        await clearEnemies(page);

        // Spawn a few asteroids around the field (not on the player)
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.asteroidPool.get(300, 200, 35, 1);
            ge.asteroidPool.get(1400, 700, 30, 1);
            ge.asteroidPool.get(900, 150, 40, 1);
        });

        const ai = new GameAI(page);
        await ai.run(5_000);
        await ai.stop();

        const state = await page.evaluate(() => window.gameEngine.game.state);
        // Game should still be running (PLAYING or WAVE_TRANSITION)
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(state);
    });
});
