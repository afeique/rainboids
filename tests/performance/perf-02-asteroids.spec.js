/**
 * PERF-02: Asteroid performance — dynamic upper-limit discovery + wave-limit validation
 *
 * Test 1 — Dynamic discovery: increments asteroid count until FPS drops below
 *   the headless target (5 fps), recording the last "safe" count.
 *   This count is stored as a sanity reference; wave logic must never exceed it.
 *
 * Test 2 — Wave limit validation: spawns exactly MAX_WAVE_ASTEROIDS (12) and
 *   asserts the engine handles it without stalling (>2 fps headless baseline).
 *
 * Test 3 — Proportionality: frame time at 12 asteroids must not be more than
 *   20× the frame time at 1 asteroid.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, spawnAsteroids, measureFrameStats, getPoolCounts, perfTable } from '../helpers/game-helpers.js';

// Hard cap from game constants — performance must hold at this count
const MAX_WAVE_ASTEROIDS = 12;

// Headless FPS floor — below this we consider the count "unsafe"
const FPS_FLOOR = 5;

/** Release all active asteroids. */
async function clearAsteroids(page) {
    await page.evaluate(() => {
        const pool = window.gameEngine.asteroidPool;
        while (pool.activeObjects.length > 0) pool.release(pool.activeObjects[pool.activeObjects.length - 1]);
    });
}

test.describe('PERF-02: Asteroid performance', () => {

    test('dynamic upper-limit discovery — find max safe asteroid count', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const rows = [];
        let lastSafeCount = 0;

        // Start from 1 and double until FPS drops; never exceed a generous ceiling
        const testCounts = [1, 2, 4, 6, 8, 10, 12, 16, 20, 30];

        for (const count of testCounts) {
            await clearAsteroids(page);
            await spawnAsteroids(page, count);
            await page.waitForTimeout(300);

            const stats  = await measureFrameStats(page, 60);
            const actual = (await getPoolCounts(page)).asteroids;

            rows.push({ label: `${actual} asteroids`, fps: stats.fps, mean: stats.mean, p95: stats.p95, p99: stats.p99 });
            console.log(`  ${actual} asteroids → ${stats.fps.toFixed(1)} fps  (mean: ${stats.mean.toFixed(1)} ms)`);

            if (stats.fps >= FPS_FLOOR) {
                lastSafeCount = actual;
            } else {
                console.log(`  ⚠  FPS dropped below ${FPS_FLOOR} at ${actual} asteroids — stopping discovery`);
                break;
            }
        }

        console.log(perfTable(rows));
        console.log(`\n  Max safe asteroid count (headless, >${FPS_FLOOR} fps): ${lastSafeCount}`);
        console.log(`  MAX_WAVE_ASTEROIDS constant: ${MAX_WAVE_ASTEROIDS}`);

        // The configured wave limit must always be within the safe range
        expect(MAX_WAVE_ASTEROIDS).toBeLessThanOrEqual(lastSafeCount);

        // Baseline: at least 1 asteroid must run above floor
        expect(rows[0].fps).toBeGreaterThan(3);
    });

    test(`MAX_WAVE_ASTEROIDS (${MAX_WAVE_ASTEROIDS}) maintains acceptable FPS`, async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await clearAsteroids(page);

        await spawnAsteroids(page, MAX_WAVE_ASTEROIDS);
        await page.waitForTimeout(400);

        const stats  = await measureFrameStats(page, 120);
        const actual = (await getPoolCounts(page)).asteroids;
        console.log(`  ${actual} asteroids (wave cap): ${stats.fps.toFixed(1)} fps  p95=${stats.p95.toFixed(1)}ms  p99=${stats.p99.toFixed(1)}ms`);

        // Must remain above the headless floor at the game's configured maximum
        expect(stats.fps).toBeGreaterThan(2);
    });

    test('1 asteroid baseline always passes', async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await clearAsteroids(page);
        await spawnAsteroids(page, 1);
        await page.waitForTimeout(300);

        const stats = await measureFrameStats(page, 120);
        console.log(`  1 asteroid: ${stats.fps.toFixed(1)} fps`);
        expect(stats.fps).toBeGreaterThan(3);
    });

    test('frame time is proportional to asteroid count (no cliff)', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        await clearAsteroids(page);
        await spawnAsteroids(page, 1);
        await page.waitForTimeout(200);
        const stats1 = await measureFrameStats(page, 60);

        await clearAsteroids(page);
        await spawnAsteroids(page, MAX_WAVE_ASTEROIDS);
        await page.waitForTimeout(200);
        const statsMax = await measureFrameStats(page, 60);

        console.log(`  1 asteroid: ${stats1.mean.toFixed(2)} ms mean`);
        console.log(`  ${MAX_WAVE_ASTEROIDS} asteroids: ${statsMax.mean.toFixed(2)} ms mean`);
        console.log(`  Overhead ratio (${MAX_WAVE_ASTEROIDS}x/1): ${(statsMax.mean / stats1.mean).toFixed(2)}`);

        // Must not be worse than 20× the single-asteroid cost (headless is noisy)
        expect(statsMax.mean / stats1.mean).toBeLessThan(20);
    });
});
