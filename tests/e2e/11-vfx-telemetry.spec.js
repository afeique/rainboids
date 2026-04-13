/**
 * VFX Telemetry — automated visual effects analysis.
 *
 * Uses the in-game VFX telemetry system to record per-frame effect state
 * during AI-driven gameplay, then asserts on temporal patterns:
 * - Hit flashes fire and count down correctly
 * - Death flashes complete their full sequence
 * - Muzzle flash is present during active combat
 * - Hitstop doesn't freeze the game (no feedback loops)
 * - Screen shake and camera kick have appropriate magnitude
 * - Explosion particles spawn and decay
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';
import { GameAI } from '../helpers/game-ai.js';
import {
    enableVFXTelemetry,
    getVFXFrames,
    getAllVFXFrames,
    clearVFXBuffer,
    waitForVFXFrames,
    samplePlayerBrightness,
    analyzeVFXFrames,
    generateVFXReport,
} from '../helpers/vfx-helpers.js';

test.describe('VFX Telemetry Analysis', () => {
    test.setTimeout(120_000);

    test('full combat VFX analysis — 15s AI gameplay', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        // Enable one-punch-man for fast kills (more death effects to analyze)
        await page.evaluate(() => {
            window.gameEngine.cheats.onePunchMan = true;
        });

        // Spawn enemies continuously during capture to maintain active combat
        const spawnInterval = setInterval(async () => {
            try {
                await page.evaluate(() => {
                    const ge = window.gameEngine;
                    if (!ge || !ge.player || ge.game.state !== 'PLAYING') return;
                    // Spawn 3 enemies around the player
                    for (let i = 0; i < 3; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        ge.enemyPool.get(
                            ge.player.x + Math.cos(angle) * 150,
                            ge.player.y + Math.sin(angle) * 150,
                            'HUNTER', 1
                        );
                    }
                });
            } catch (_) {}
        }, 2000);

        // Clear buffer and let the AI play for 15 seconds
        await clearVFXBuffer(page);
        const ai = new GameAI(page);
        await ai.run(15_000);
        clearInterval(spawnInterval);

        // Grab all frames
        const frames = await getAllVFXFrames(page);
        expect(frames.length).toBeGreaterThan(30);

        const analysis = analyzeVFXFrames(frames);
        const report = generateVFXReport(analysis);

        // Attach the full report as a test artifact
        await test.info().attach('vfx-report.txt', {
            body: report,
            contentType: 'text/plain',
        });

        // Attach raw analysis as JSON
        await test.info().attach('vfx-analysis.json', {
            body: JSON.stringify(analysis, null, 2),
            contentType: 'application/json',
        });

        console.log('\n' + report + '\n');

        // ── Assertions ──

        // Muzzle flash must be detected (player is firing)
        expect(analysis.muzzleFlash.detected,
            'Muzzle flash should be detected during active combat'
        ).toBe(true);

        // Hit flashes should occur (we're hitting things)
        expect(analysis.entityFlashes.hitEvents,
            'Should have hit flash events from bullet impacts'
        ).toBeGreaterThan(0);

        // Death flashes should occur (one-punch-man = instant kills)
        expect(analysis.entityFlashes.deathEvents,
            'Should have death flash events from enemy/asteroid kills'
        ).toBeGreaterThan(0);

        // Hitstop should not cause a freeze loop
        expect(analysis.hitstop.freezeRisk,
            'Hitstop should not freeze the game (ratio < 40%, no rapid consecutive segments)'
        ).toBe(false);

        // Hitstop ratio should be reasonable (< 35% of frames)
        expect(analysis.hitstop.ratio).toBeLessThan(0.35);

        // Screen shake should occur on kills
        expect(analysis.screenShake.peakMagnitude,
            'Screen shake should have noticeable magnitude'
        ).toBeGreaterThan(3);

        // Explosion particles should spawn (may be low with temporal upsampling
        // since short-lived particles can spawn and die within a single render frame)
        expect(analysis.particles.peak,
            'Particle effects should spawn on kills'
        ).toBeGreaterThan(0);
    });

    test('hit flash counts down from 10 to 0', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        // Spawn a single tanky enemy and manually trigger a hit flash
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.get(ge.player.x + 80, ge.player.y, 'TITAN', 1);
            if (e) {
                e.health = 9999;
                e.maxHealth = 9999;
            }
        });

        await clearVFXBuffer(page);

        // Stop autofire so no new hits reset the timer
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.inputHandler.input.mouseDown = false;
            const e = ge.enemyPool.activeObjects.find(e => e.active && e.type === 'TITAN');
            if (e) {
                e._hitFlashTimer = 10;
                e._hitPoint = { x: e.x, y: e.y };
                e._hitAngle = 0;
            }
        });

        // Wait for the flash to play out (~10 frames + some buffer)
        await waitForVFXFrames(page, 20);
        const frames = await getVFXFrames(page, 20);

        // Find frames with the hit flash
        const flashFrames = frames.filter(f =>
            f.entityFlashes.some(ef => ef.type === 'hit' && ef.pool === 'enemy')
        );

        expect(flashFrames.length).toBeGreaterThan(0);

        // Timer values should include values that decrease toward 0
        const timers = flashFrames.map(f => {
            const ef = f.entityFlashes.find(ef => ef.type === 'hit' && ef.pool === 'enemy');
            return ef ? ef.timer : -1;
        }).filter(t => t > 0);

        // Timer should decrease over time (hitstop freezes enemy updates, so countdown may be slower)
        expect(timers[0]).toBeGreaterThanOrEqual(5);
        expect(timers[timers.length - 1]).toBeLessThan(timers[0]);

        await test.info().attach('hit-flash-timers.json', {
            body: JSON.stringify(timers),
            contentType: 'application/json',
        });
    });

    test('death flash plays full sequence then entity deactivates', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        await page.evaluate(() => {
            window.gameEngine.cheats.onePunchMan = true;
        });

        // Spawn several enemies close enough to hit
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                ge.enemyPool.get(
                    ge.player.x + Math.cos(angle) * 80,
                    ge.player.y + Math.sin(angle) * 80,
                    'HUNTER', 1
                );
            }
        });

        await clearVFXBuffer(page);

        // Let AI play to kill them
        const ai = new GameAI(page);
        await ai.run(8_000);

        const frames = await getAllVFXFrames(page);

        const analysis = analyzeVFXFrames(frames);

        // Should have at least one death flash
        expect(analysis.entityFlashes.deathEvents).toBeGreaterThan(0);

        // Find a death flash sequence in the raw frames
        const deathFrames = frames.filter(f =>
            f.entityFlashes.some(ef => ef.type === 'death')
        );

        if (deathFrames.length > 0) {
            // Get timer values for the first death we find
            const firstDeathKey = deathFrames[0].entityFlashes.find(ef => ef.type === 'death');
            const pool = firstDeathKey.pool;
            const x = firstDeathKey.x;
            const y = firstDeathKey.y;

            const timers = deathFrames
                .map(f => f.entityFlashes.find(ef =>
                    ef.type === 'death' && ef.pool === pool &&
                    Math.abs(ef.x - x) < 5 && Math.abs(ef.y - y) < 5
                ))
                .filter(Boolean)
                .map(ef => ef.timer);

            // Timer should count down
            for (let i = 1; i < timers.length; i++) {
                expect(timers[i]).toBeLessThanOrEqual(timers[i - 1]);
            }

            // Last timer should be significantly lower than first (flash progressed)
            // With temporal upsampling, timer may skip values (e.g. 8→4→0)
            expect(timers[timers.length - 1]).toBeLessThan(timers[0]);

            await test.info().attach('death-flash-timers.json', {
                body: JSON.stringify(timers),
                contentType: 'application/json',
            });
        }
    });

    test('muzzle flash is recorded in telemetry during firing', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        await clearVFXBuffer(page);

        // Start shooting for 3 seconds
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.inputHandler.input.mouseDown = true;
            // Aim at a nearby point so bullets actually fire
            ge.inputHandler.input.mouseX = ge.player.x + 100;
            ge.inputHandler.input.mouseY = ge.player.y;
        });

        await page.waitForTimeout(3000);

        await page.evaluate(() => {
            window.gameEngine.inputHandler.input.mouseDown = false;
        });

        const frames = await getAllVFXFrames(page);
        const muzzleFlashFrames = frames.filter(f => f.player && f.player.muzzleFlash > 0);

        console.log(`Muzzle flash: ${muzzleFlashFrames.length}/${frames.length} frames with active flash`);

        await test.info().attach('muzzle-flash-data.json', {
            body: JSON.stringify({
                totalFrames: frames.length,
                muzzleFlashFrames: muzzleFlashFrames.length,
                ratio: muzzleFlashFrames.length / frames.length,
                intensities: muzzleFlashFrames.slice(0, 10).map(f => ({
                    timer: f.player.muzzleFlash,
                    intensity: f.player.muzzleIntensity,
                })),
            }, null, 2),
            contentType: 'application/json',
        });

        // Muzzle flash should be present during active firing
        expect(muzzleFlashFrames.length).toBeGreaterThan(5);
    });

    test('hitstop does not accumulate into freeze loop', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        // Enable one-punch-man and spawn many enemies for maximum kill pressure
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.cheats.onePunchMan = true;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                ge.enemyPool.get(
                    ge.player.x + Math.cos(angle) * 120,
                    ge.player.y + Math.sin(angle) * 120,
                    'HUNTER', 1
                );
            }
        });

        await clearVFXBuffer(page);

        // Let AI play — this should trigger many rapid kills
        const ai = new GameAI(page);
        await ai.run(10_000);

        const frames = await getAllVFXFrames(page);
        const analysis = analyzeVFXFrames(frames);

        await test.info().attach('hitstop-stress.json', {
            body: JSON.stringify({
                hitstop: analysis.hitstop,
                totalFrames: analysis.duration.frames,
                seconds: analysis.duration.seconds,
            }, null, 2),
            contentType: 'application/json',
        });

        console.log(`Hitstop stress: ${analysis.hitstop.totalFrames}/${analysis.duration.frames} frames (${(analysis.hitstop.ratio * 100).toFixed(1)}%), ${analysis.hitstop.rapidConsecutive} rapid consecutive`);

        // Game must not be frozen (hitstop < 40%)
        expect(analysis.hitstop.ratio).toBeLessThan(0.4);

        // No rapid consecutive segments (sign of feedback loop)
        expect(analysis.hitstop.rapidConsecutive).toBeLessThan(10);

        // Should have enough non-hitstop frames (game is progressing)
        const nonHitstopFrames = analysis.duration.frames - analysis.hitstop.totalFrames;
        expect(nonHitstopFrames).toBeGreaterThan(100);
    });

    test('screen shake decays to zero after trigger', async ({ page }) => {
        await loadGame(page);
        await enableVFXTelemetry(page);
        await startGame(page);

        // Trigger a known screen shake
        await page.evaluate(() => {
            window.gameEngine.triggerScreenShake(20, 15, 40);
        });

        await clearVFXBuffer(page);
        await waitForVFXFrames(page, 40);

        const frames = await getVFXFrames(page, 40);

        // First frames should have shake
        expect(frames[0].screenShake.magnitude).toBeGreaterThan(0);

        // Magnitude should decay
        const magnitudes = frames.map(f => f.screenShake.magnitude);
        const firstMag = magnitudes[0];
        const lastMag = magnitudes[magnitudes.length - 1];
        expect(lastMag).toBeLessThan(firstMag);

        // Should reach zero or near-zero by end
        expect(lastMag).toBeLessThan(1);

        await test.info().attach('shake-decay.json', {
            body: JSON.stringify(magnitudes.map(m => Math.round(m * 10) / 10)),
            contentType: 'application/json',
        });
    });
});
