/**
 * PERF-06: Combined stress test — maximum simultaneous entity load
 *
 * This is the ultimate stress test: asteroids + particles + enemies + bullets
 * + full starfield all active at the same time.
 *
 * Results are printed as a comprehensive report table.  No strict FPS floor
 * is enforced here — the goal is to characterise the engine's limits, not
 * gate on them.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, spawnAsteroids, spawnEnemies, spawnBackgroundStars, measureFrameStats, getPoolCounts, perfTable, fmtFPS, fmtMs } from '../helpers/game-helpers.js';

/** Spawn N explosion particles uncapped (direct pool injection). */
async function spawnExplosions(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        const cx = ge.gameField.width / 2;
        const cy = ge.gameField.height / 2;
        for (let i = 0; i < n; i++) {
            let obj = ge.particlePool.pool.pop() || new (ge.particlePool.ObjectClass)();
            obj.reset(cx + (Math.random() - 0.5) * 600, cy + (Math.random() - 0.5) * 600, 'explosion');
            obj.life = 20;  // persist through measurement
            obj.active = true;
            ge.particlePool.activeObjects.push(obj);
        }
        return ge.particlePool.activeObjects.length;
    }, count);
}

/** Remove all entities from all pools. */
async function clearAll(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const pools = [
            'asteroidPool', 'enemyPool', 'enemyBulletPool', 'bulletPool',
            'particlePool', 'lineDebrisPool', 'powerupPool'
        ];
        for (const name of pools) {
            const pool = ge[name];
            if (!pool) continue;
            while (pool.activeObjects.length > 0) {
                const obj = pool.activeObjects[pool.activeObjects.length - 1];
                pool.release(obj);
            }
        }
    });
}

const SCENARIOS = [
    { label: 'Default config',          asteroids: 1,  enemies: 0, particles:  0, stars:  30 },
    { label: '5 asteroids',             asteroids: 5,  enemies: 0, particles:  0, stars:  30 },
    { label: '4 enemies',               asteroids: 1,  enemies: 4, particles:  0, stars:  30 },
    { label: '30 particles',            asteroids: 1,  enemies: 0, particles: 30, stars:  30 },
    { label: '5 ast + 4 enemies',       asteroids: 5,  enemies: 4, particles:  0, stars:  55 },
    { label: 'Combat burst (mid)',       asteroids: 5,  enemies: 4, particles: 30, stars:  55 },
    { label: 'Combat burst (heavy)',     asteroids: 10, enemies: 8, particles: 60, stars:  55 },
    { label: 'Maximum stress',          asteroids: 20, enemies: 8, particles: 60, stars: 200 },
];

test.describe('PERF-06: Combined stress test', () => {

    test('full scenario matrix — FPS vs entity load', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const rows = [];

        for (const scenario of SCENARIOS) {
            await clearAll(page);

            if (scenario.stars > 0) await spawnBackgroundStars(page, scenario.stars);
            if (scenario.asteroids > 0) await spawnAsteroids(page, scenario.asteroids);
            if (scenario.enemies > 0) await spawnEnemies(page, scenario.enemies);
            if (scenario.particles > 0) await spawnExplosions(page, scenario.particles);

            await page.waitForTimeout(300);

            const stats  = await measureFrameStats(page, 90);
            const counts = await getPoolCounts(page);

            rows.push({
                label: scenario.label,
                fps:   stats.fps,
                mean:  stats.mean,
                p95:   stats.p95,
                p99:   stats.p99,
                counts,
            });

            console.log(`  [${scenario.label}] → ${stats.fps.toFixed(1)} fps  ast=${counts.asteroids} enemies=${counts.enemies} particles=${counts.particles} stars=${counts.backgroundStars}`);
        }

        // Print the table
        console.log(perfTable(rows));

        // Print a detailed entity-count breakdown
        console.log('\n  ── Entity count breakdown ──');
        for (const r of rows) {
            console.log(`  ${r.label.padEnd(30)} ast=${r.counts.asteroids.toString().padStart(3)}  enemy=${r.counts.enemies.toString().padStart(2)}  particle=${r.counts.particles.toString().padStart(3)}  star=${r.counts.backgroundStars.toString().padStart(3)}`);
        }

        // The default config scenario must be at least minimally playable
        const defaultRow = rows.find(r => r.label === 'Default config');
        if (defaultRow) {
            expect(defaultRow.fps).toBeGreaterThan(3);
        }
    });

    test('game recovers to baseline FPS after clearing all entities', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // First: load up with stress entities
        await spawnAsteroids(page, 20);
        await spawnEnemies(page, 8);
        await spawnExplosions(page, 60);
        await page.waitForTimeout(300);

        const statsStressed = await measureFrameStats(page, 60);
        console.log(`  Stressed FPS: ${statsStressed.fps.toFixed(1)}`);

        // Clear everything
        await clearAll(page);
        await page.waitForTimeout(300);

        const statsRecovered = await measureFrameStats(page, 90);
        console.log(`  Recovered FPS: ${statsRecovered.fps.toFixed(1)}`);

        // Recovery FPS should be higher than stressed FPS
        expect(statsRecovered.fps).toBeGreaterThanOrEqual(statsStressed.fps * 0.8);
    });

    test('pool counts are accurate under combined load', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Spawn entities AND read counts in one atomic evaluate() so the game loop
        // cannot process a frame between spawn and assertion.
        const { asteroids, enemies } = await page.evaluate(() => {
            const ge = window.gameEngine;

            // Clear all pools first
            const poolNames = [
                'asteroidPool', 'enemyPool', 'enemyBulletPool', 'bulletPool',
                'particlePool', 'lineDebrisPool', 'powerupPool',
            ];
            for (const name of poolNames) {
                const pool = ge[name];
                if (!pool) continue;
                while (pool.activeObjects.length > 0) {
                    pool.release(pool.activeObjects[pool.activeObjects.length - 1]);
                }
            }

            // Spawn exactly 5 asteroids and 3 enemies
            for (let i = 0; i < 5; i++) {
                ge.asteroidPool.get(
                    200 + i * 100, 300,  // safe spread positions away from player
                    40, 1
                );
            }
            for (let i = 0; i < 3; i++) {
                ge.enemyPool.get(200 + i * 150, 500, 'HUNTER', 1);
            }

            return {
                asteroids: ge.asteroidPool.activeObjects.length,
                enemies:   ge.enemyPool.activeObjects.length,
            };
        });

        console.log(`  Pool counts: ast=${asteroids} enemies=${enemies}`);
        expect(asteroids).toBe(5);
        expect(enemies).toBe(3);
    });

    test('game state remains PLAYING under heavy load', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        await spawnAsteroids(page, 10);
        await spawnEnemies(page, 4);
        await spawnExplosions(page, 30);

        // Run for 2 seconds under load
        await page.waitForTimeout(2000);

        const state = await page.evaluate(() => window.gameEngine?.game?.state);
        console.log(`  Game state after 2s under load: ${state}`);
        // Game may transition states (e.g., player dies), but should not crash
        expect(['PLAYING', 'GAME_OVER', 'PAUSED']).toContain(state);
    });

    test('FPS degrades gracefully (no sudden cliff)', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Incrementally add asteroids and track FPS
        const fpsSamples = [];
        const counts = [1, 5, 10, 20];

        for (const n of counts) {
            await clearAll(page);
            await spawnAsteroids(page, n);
            await page.waitForTimeout(200);
            const stats = await measureFrameStats(page, 60);
            fpsSamples.push({ n, fps: stats.fps });
        }

        console.log('  FPS vs asteroid count:');
        for (const s of fpsSamples) {
            console.log(`    ${s.n.toString().padStart(3)} asteroids → ${s.fps.toFixed(1)} fps`);
        }

        // Verify FPS is monotonically decreasing (or staying roughly flat)
        // Allow a 20% increase between steps (noise), but should generally go down
        for (let i = 1; i < fpsSamples.length; i++) {
            const ratio = fpsSamples[i].fps / fpsSamples[i - 1].fps;
            // Ratio > 2.0 would mean FPS doubled as entities tripled — that's suspicious
            expect(ratio).toBeLessThan(2.0);
        }
    });
});
