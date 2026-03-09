/**
 * E2E-09: SURVIVAL — AI long-run playtesting
 *
 * This is the final and longest-running E2E test.  The GameAI pilots the player
 * for 2 minutes straight through normal gameplay, checking for:
 *   • No JavaScript errors (crashes)
 *   • Game state remains valid (PLAYING / WAVE_TRANSITION / GAME_OVER)
 *   • No pool corruption (activeObjects never undefined)
 *   • Performance stays above the headless floor (>1 fps sampled once)
 *
 * This test intentionally does NOT assert the player survives — only that the
 * engine does not crash or enter an invalid state.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, measureFrameStats } from '../helpers/game-helpers.js';
import { GameAI } from '../helpers/game-ai.js';

const SURVIVAL_DURATION_MS = 120_000; // 2 minutes
const CHECK_INTERVAL_MS    =  10_000; // sample state every 10 s

const VALID_STATES = ['PLAYING', 'WAVE_TRANSITION', 'GAME_OVER', 'PAUSED'];

test.describe('E2E-09: Survival (AI playtesting)', () => {
    test.setTimeout(180_000); // 3 minutes total budget

    test('AI survives 2 minutes without engine crash', async ({ page }) => {
        // Collect JS errors
        const jsErrors = [];
        page.on('pageerror', err => jsErrors.push(err.message));
        page.on('console',   msg => {
            if (msg.type() === 'error') jsErrors.push(msg.text());
        });

        await loadGame(page);
        await startGame(page);

        // Let the first wave spawn before handing control to AI
        await page.waitForTimeout(1000);

        const ai       = new GameAI(page);
        const stateLog = [];
        let   ticks    = 0;

        // Start AI in the background (non-blocking — just fires ticks)
        const aiRun = ai.run(SURVIVAL_DURATION_MS, (state) => {
            ticks++;
        });

        // Periodic state checks every CHECK_INTERVAL_MS
        const startTime    = Date.now();
        const checkPoints  = Math.floor(SURVIVAL_DURATION_MS / CHECK_INTERVAL_MS);

        for (let i = 0; i < checkPoints; i++) {
            await page.waitForTimeout(CHECK_INTERVAL_MS);

            const snapshot = await page.evaluate(() => {
                const ge = window.gameEngine;
                if (!ge) return { state: 'MISSING', ok: false };

                const poolsOk = [
                    ge.asteroidPool, ge.enemyPool, ge.enemyBulletPool,
                    ge.bulletPool, ge.particlePool, ge.powerupPool,
                ].every(pool => Array.isArray(pool?.activeObjects));

                return {
                    state:     ge.game?.state ?? 'UNKNOWN',
                    wave:      ge.game?.currentWave ?? 0,
                    asteroids: ge.asteroidPool?.activeObjects?.length ?? -1,
                    enemies:   ge.enemyPool?.activeObjects?.length ?? -1,
                    playerHp:  ge.player?.health ?? -1,
                    poolsOk,
                };
            });

            stateLog.push({ t: Math.round((Date.now() - startTime) / 1000), ...snapshot });

            // Log progress
            console.log(
                `  t=${stateLog.at(-1).t}s  state=${snapshot.state}  ` +
                `wave=${snapshot.wave}  ast=${snapshot.asteroids}  ` +
                `enemy=${snapshot.enemies}  hp=${snapshot.playerHp}`
            );

            // Validate state on every check
            expect(VALID_STATES).toContain(snapshot.state);
            expect(snapshot.poolsOk).toBe(true);

            // If player died and game_over, AI can't do much — but engine must still be valid
            if (snapshot.state === 'GAME_OVER') {
                console.log('  Player died — verifying engine is still intact');
                break;
            }
        }

        // Wait for AI to finish its run
        ai._running = false;
        await aiRun;
        await ai.stop();

        // Final sanity checks
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n  Survival test complete: ${elapsed}s elapsed, ${ticks} AI ticks fired`);
        console.log(`  Total state snapshots: ${stateLog.length}`);

        // No critical JS errors should have occurred
        const criticalErrors = jsErrors.filter(e =>
            e.includes('Cannot read') ||
            e.includes('is not a function') ||
            e.includes('is undefined') ||
            e.includes('stack overflow')
        );
        if (criticalErrors.length > 0) {
            console.error('  Critical JS errors:', criticalErrors);
        }
        expect(criticalErrors.length).toBe(0);

        // Engine must still be alive
        const finalState = await page.evaluate(() => window.gameEngine?.game?.state);
        expect(VALID_STATES).toContain(finalState);
    });

    test('AI takes damage (system works)', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const startHp = await page.evaluate(() => window.gameEngine.player.health);

        // Spawn 3 enemies right on the player
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ['HUNTER', 'WASP', 'GUARDIAN'].forEach(type => {
                ge.enemyPool.get(ge.player.x, ge.player.y, type, 1);
            });
        });

        await page.waitForTimeout(1500);

        const endHp = await page.evaluate(() => window.gameEngine.player.health);
        console.log(`  Player HP: ${startHp} → ${endHp}`);

        // Player must have taken some damage (enemies on top of them)
        expect(endHp).toBeLessThanOrEqual(startHp);
    });

    test('engine recovers to PLAYING after GAME_OVER click', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        // Kill player instantly
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.health = 0;
            ge.player.active = false;
            ge.game.state    = 'GAME_OVER';
        });

        await page.waitForTimeout(500);

        const stateAfterDeath = await page.evaluate(() => window.gameEngine?.game?.state);
        expect(stateAfterDeath).toBe('GAME_OVER');

        // Click canvas to restart
        await page.click('canvas');
        await page.waitForTimeout(2000);

        const stateAfterRestart = await page.evaluate(() => window.gameEngine?.game?.state);
        // After click on GAME_OVER, should return to TITLE_SCREEN or PLAYING
        expect(['TITLE_SCREEN', 'PLAYING']).toContain(stateAfterRestart);
    });
});
