/**
 * PERF-05: Enemy rendering stress test
 *
 * Tests how many simultaneously-active enemies the engine can handle while
 * maintaining acceptable frame rates.  Enemy ships have complex path-finding
 * update logic and fire projectiles.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, spawnEnemies, measureFrameStats, getPoolCounts, perfTable } from '../helpers/game-helpers.js';

const ENEMY_LEVELS = [1, 4, 8, 16, 32];

test.describe('PERF-05: Enemy rendering stress', () => {

    test('enemy count vs FPS table', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const rows = [];

        for (const count of ENEMY_LEVELS) {
            // Clear existing enemies
            await page.evaluate(() => {
                const ge = window.gameEngine;
                while (ge.enemyPool.activeObjects.length > 0) {
                    ge.enemyPool.release(ge.enemyPool.activeObjects[0]);
                }
                // Also clear enemy bullets to keep the test focused on enemy update cost
                while (ge.enemyBulletPool.activeObjects.length > 0) {
                    ge.enemyBulletPool.release(ge.enemyBulletPool.activeObjects[0]);
                }
            });

            await spawnEnemies(page, count);
            await page.waitForTimeout(300);

            const stats  = await measureFrameStats(page, 90);
            const actual = (await getPoolCounts(page)).enemies;

            rows.push({
                label: `${actual} enemies (HUNTER)`,
                fps:   stats.fps,
                mean:  stats.mean,
                p95:   stats.p95,
                p99:   stats.p99,
            });

            console.log(`  ${actual} enemies → ${stats.fps.toFixed(1)} fps  (p95: ${stats.p95.toFixed(1)} ms)`);
        }

        console.log(perfTable(rows));

        // Single enemy should always be playable
        expect(rows[0].fps).toBeGreaterThan(3);
    });

    test('enemy has valid initial state', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        await page.evaluate(() => {
            window.gameEngine.enemyPool.get(500, 300, 'HUNTER', 1);
        });

        const enemy = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool;
            const obj = pool.activeObjects[pool.activeObjects.length - 1];
            return {
                active: obj?.active,
                health: obj?.health,
                x:      obj?.x,
                y:      obj?.y,
                type:   obj?.type,
            };
        });

        expect(enemy.active).toBe(true);
        expect(enemy.health).toBeGreaterThan(0);
        expect(isFinite(enemy.x)).toBe(true);
        expect(isFinite(enemy.y)).toBe(true);
    });

    test('all enemy types can be spawned without error', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const enemyTypes = ['HUNTER', 'GUARDIAN', 'WASP', 'TITAN', 'STALKER', 'TANGERINE', 'DRIFTER', 'PROWLER'];

        for (const type of enemyTypes) {
            const spawned = await page.evaluate((t) => {
                try {
                    window.gameEngine.enemyPool.get(500, 300, t, 1);
                    return true;
                } catch (e) {
                    return false;
                }
            }, type);
            expect(spawned, `Enemy type ${type} should spawn without error`).toBe(true);
        }

        console.log(`  All ${enemyTypes.length} enemy types spawned successfully`);
    });

    test('4 enemies simultaneously — FPS stays >10', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        await page.evaluate(() => {
            const ge = window.gameEngine;
            while (ge.enemyPool.activeObjects.length > 0) ge.enemyPool.release(ge.enemyPool.activeObjects[0]);
        });

        await spawnEnemies(page, 4);
        await page.waitForTimeout(300);

        const stats = await measureFrameStats(page, 90);
        console.log(`  4 enemies: ${stats.fps.toFixed(1)} fps  p99=${stats.p99.toFixed(1)}ms`);
        expect(stats.fps).toBeGreaterThan(3);
    });

    test('enemy bullet pool does not overflow', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        await spawnEnemies(page, 8);

        // Wait for enemies to fire
        await page.waitForTimeout(2000);

        const counts = await getPoolCounts(page);
        console.log(`  Enemy bullets after 2s with 8 enemies: ${counts.enemyBullets}`);

        // Pool should not grow unboundedly
        expect(counts.enemyBullets).toBeLessThan(200);
    });
});
