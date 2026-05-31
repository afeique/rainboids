/**
 * PERF-07: Asteroid render-mode A/B — filled gem vs. classic wireframe
 *
 * Isolates the PURE per-frame render cost of the two asteroid renderers
 * (`window.setAsteroidRenderMode('filled'|'wireframe')`) with a direct
 * draw-loop microbench: spawn a fixed set of asteroids, then time
 * `asteroid.draw(ctx)` over many iterations in each mode on the SAME scene.
 *
 * Why a microbench instead of whole-frame FPS: headless software-Canvas FPS
 * (~7 fps) is dominated by everything else on the frame (nebula, starfield,
 * particles) and wave/enemy spawns would differ between the two measurements.
 * Timing only the asteroid draw loop, back-to-back on an identical asteroid
 * set, gives a clean, low-variance delta that is exactly the render-cost
 * difference between the two modes. Update/projection cost is identical in
 * both modes (only `drawAsteroidShape` dispatches differently), so it cancels.
 *
 * Reported per row: ms to draw ALL N asteroids once, per mode, + the ratio.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getPoolCounts } from '../helpers/game-helpers.js';

async function clearAsteroids(page) {
    await page.evaluate(() => {
        const pool = window.gameEngine.asteroidPool;
        while (pool.activeObjects.length > 0) {
            pool.release(pool.activeObjects[pool.activeObjects.length - 1]);
        }
    });
}

/** Spawn `n` asteroids of base radius `r` directly into the pool. */
async function spawnAsteroids(page, n, r) {
    await page.evaluate(({ n, r }) => {
        const ge = window.gameEngine;
        const W = window.innerWidth, H = window.innerHeight;
        for (let i = 0; i < n; i++) {
            ge.asteroidPool.get(80 + Math.random() * (W - 160),
                                 80 + Math.random() * (H - 160), r, 1);
        }
    }, { n, r });
}

/**
 * Time drawing ALL active asteroids once, in each mode, averaged over `iters`
 * iterations. Returns { n, filled, wire } in ms-per-full-draw.
 */
async function benchDraw(page, iters) {
    return page.evaluate((iters) => {
        const ge = window.gameEngine;
        const ctx = ge.ctx;
        const asts = ge.asteroidPool.activeObjects.slice();

        function drawAll() {
            ctx.save();
            for (let i = 0; i < asts.length; i++) asts[i].draw(ctx);
            ctx.restore();
        }
        function timeMode(mode) {
            window.setAsteroidRenderMode(mode);
            for (let i = 0; i < 12; i++) drawAll();          // warmup (also bakes projection)
            const t0 = performance.now();
            for (let i = 0; i < iters; i++) drawAll();
            return (performance.now() - t0) / iters;
        }
        const filled = timeMode('filled');
        const wire = timeMode('wireframe');
        window.setAsteroidRenderMode('filled');               // restore default
        return { n: asts.length, filled, wire };
    }, iters);
}

test.describe('PERF-07: asteroid render mode A/B', () => {
    test.setTimeout(120000);

    test('render cost vs asteroid COUNT (radius 55)', async ({ page }, testInfo) => {
        // The tight-loop microbench measures SYNCHRONOUS CPU rasterization
        // (headless SwiftShader/Skia). A real-GPU canvas defers draw work, so
        // timing a CPU loop around it is invalid and stalls — skip on GPU.
        test.skip(testInfo.project.name === 'performance-gpu',
            'microbench measures CPU rasterization only');
        await loadGame(page);
        await startGame(page);

        const counts = [8, 16, 40, 80];
        const rows = [];
        for (const count of counts) {
            await clearAsteroids(page);
            await spawnAsteroids(page, count, 55);
            await page.waitForTimeout(150);
            const actual = (await getPoolCounts(page)).asteroids;
            const b = await benchDraw(page, 300);
            rows.push({ n: actual, ...b });
        }

        console.log('\n  PERF-07  render cost vs COUNT (base radius 55)');
        console.log('  count | filled ms/frame | wire ms/frame | filled/ast | wire/ast | filled÷wire');
        for (const r of rows) {
            console.log(
                `  ${String(r.n).padStart(5)} | ` +
                `${r.filled.toFixed(3).padStart(15)} | ` +
                `${r.wire.toFixed(3).padStart(13)} | ` +
                `${(r.filled / r.n).toFixed(4).padStart(10)} | ` +
                `${(r.wire / r.n).toFixed(4).padStart(8)} | ` +
                `${(r.filled / r.wire).toFixed(2).padStart(11)}×`);
        }

        for (const r of rows) {
            expect(r.filled).toBeGreaterThan(0);
            expect(r.wire).toBeGreaterThan(0);
        }
    });

    test('render cost vs asteroid RADIUS (count 40) — fill-rate scaling', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const radii = [25, 45, 65, 90];
        const rows = [];
        for (const r of radii) {
            await clearAsteroids(page);
            await spawnAsteroids(page, 40, r);
            await page.waitForTimeout(150);
            const b = await benchDraw(page, 300);
            rows.push({ r, ...b });
        }

        console.log('\n  PERF-07  render cost vs RADIUS (40 asteroids)');
        console.log('  radius | filled ms/frame | wire ms/frame | filled÷wire');
        for (const row of rows) {
            console.log(
                `  ${String(row.r).padStart(6)} | ` +
                `${row.filled.toFixed(3).padStart(15)} | ` +
                `${row.wire.toFixed(3).padStart(13)} | ` +
                `${(row.filled / row.wire).toFixed(2).padStart(11)}×`);
        }

        for (const row of rows) {
            expect(row.filled).toBeGreaterThan(0);
            expect(row.wire).toBeGreaterThan(0);
        }
    });
});
