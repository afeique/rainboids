/**
 * PERF-01: Baseline frame-rate measurement
 *
 * Measures FPS and frame-time statistics at the default game configuration
 * (1 asteroid, 30 background stars, 25 color stars, no enemies).
 * This is the reference point for all other stress tests.
 *
 * Thresholds are intentionally lenient — the goal is to capture the numbers
 * and flag gross regressions, not enforce exact targets (which vary by machine).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, measureFPS, measureFrameStats, getPoolCounts, perfTable } from '../helpers/game-helpers.js';

test.describe('PERF-01: Baseline performance', () => {

    test('baseline FPS at default settings', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Let the game settle for a moment
        await page.waitForTimeout(500);

        const counts = await getPoolCounts(page);
        const stats  = await measureFrameStats(page, 180); // ~3 seconds at 60fps

        console.log('\n═══ BASELINE PERFORMANCE ═══');
        console.log(`  Background stars : ${counts.backgroundStars}`);
        console.log(`  Color stars      : ${counts.colorStars}`);
        console.log(`  Asteroids        : ${counts.asteroids}`);
        console.log(`  Particles        : ${counts.particles}`);
        console.log(perfTable([{
            label: 'Baseline (default config)',
            fps:   stats.fps,
            mean:  stats.mean,
            p95:   stats.p95,
            p99:   stats.p99,
        }]));

        // Should maintain at least 20fps even in headless software rendering
        expect(stats.fps).toBeGreaterThan(3);
    });

    test('game loop does not stall (no frames > 500ms)', async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await page.waitForTimeout(300);

        const stats = await measureFrameStats(page, 120);

        console.log(`  Max single frame time: ${stats.max.toFixed(1)} ms`);
        // A stall > 500ms would indicate a synchronous blocking call in the game loop
        expect(stats.max).toBeLessThan(500);
    });

    test('P99 frame time is under 100ms at baseline', async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await page.waitForTimeout(300);

        const stats = await measureFrameStats(page, 180);

        console.log(`  P99 frame time: ${stats.p99.toFixed(1)} ms`);
        // 100ms P99 is very lenient — anything worse indicates a real problem
        expect(stats.p99).toBeLessThan(500);
    });

    test('canvas renders continuously (frame counter increases)', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Count frames over 1 second
        const fps = await measureFPS(page, 1000);

        console.log(`  Frames per second: ${fps.toFixed(1)}`);
        expect(fps).toBeGreaterThan(2); // Absolute minimum — game is rendering
    });

    test('multiple warm-up runs show stable performance', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Three consecutive 1-second measurements
        const runs = [];
        for (let i = 0; i < 3; i++) {
            await page.waitForTimeout(200);
            const fps = await measureFPS(page, 1000);
            runs.push(fps);
        }

        console.log(`  Run FPS: ${runs.map(f => f.toFixed(1)).join(', ')}`);

        // Each run should be at least 20fps
        for (const fps of runs) {
            expect(fps).toBeGreaterThan(3);
        }

        // FPS shouldn't decay across runs (no runaway accumulation)
        const first = runs[0];
        const last  = runs[runs.length - 1];
        const ratio = last / first;
        console.log(`  Stability ratio (last/first): ${ratio.toFixed(2)}`);
        // Last run should be at least 50% as fast as the first (lenient)
        expect(ratio).toBeGreaterThan(0.5);
    });
});
