/**
 * QA-20: Adaptive Difficulty Director — LIVE wiring (RUN-05a)
 *
 * The director (RUN-04) and the Threat-Level HUD (CD-16 / QA-18) shipped inert;
 * RUN-05a instantiates the director on new-run init, applies D_hp (enemy HP) +
 * D_thr (incoming player damage) at the two chokepoints, and feeds the director
 * one outcome per wave clear. These tests confirm it is now ALIVE end-to-end:
 *   (a) game.difficultyDirector exists with D_hp/D_thr ≈ 1 at run start
 *   (b) clearing several waves advances the director's `wave` count + lets D move
 *   (c) getThreatLevel(director) returns an integer in [1,5]
 *   (d) the threat HUD marker (_threatLevelDrawn) is now SET (HUD fed live)
 *   (e) D_hp stays in [0.6,3.0] and D_thr in [0.6,1.8] after several waves
 *   (f) NO fatal JS/console errors through the run
 *
 * Waves are advanced through the REAL live path: drain the pools + mark the
 * wave's sub-waves done, run updateWaveSystem() (which fires the wave-clear
 * feed → tickWave), then startNextWave()+spawnWaveEntities() to begin the next.
 * one-punch-man is enabled like the enemy tests so any real-frame play is fast.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Collect page errors so we can assert "no fatal JS errors" at the end.
function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

// Drive `count` live wave clears through the real updateWaveSystem feed path.
// Each iteration: stamp a fast-clear / full-HP profile, drain pools, mark all
// sub-waves spawned, run the wave-clear branch (fires feedDirectorOnWaveClear),
// then advance to the next wave. Returns a snapshot of director state per wave.
async function advanceWaves(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        const snaps = [];
        for (let i = 0; i < n; i++) {
            // Make the clear look fast + full-HP so the director has a clear
            // signal to act on once cold-start (waves 1–2) ends.
            ge._waveStartMs = Date.now() - 8000; // ~8s clear vs 35s target
            ge.player.health = ge.player.getEffectiveMaxHealth();

            // Drain the field so the wave reads as cleared.
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.asteroidPool.activeObjects.slice().forEach((a) => { a.active = false; });
            ge.enemyPool.cleanupInactive();
            ge.asteroidPool.cleanupInactive();

            // Mark every sub-wave spawned so the wave-clear gate opens.
            if (ge._waveState) {
                ge._waveState.phase = 'complete';
                ge._waveState.subWaveIndex = 999;
            }
            ge.game.subWaveIndex = 999;
            ge.game.waveComplete = false;
            ge.game.state = 'PLAYING';

            const waveBefore = ge.game.difficultyDirector
                ? ge.game.difficultyDirector.wave : null;

            // Live wave-clear branch → feedDirectorOnWaveClear → tickWave.
            ge.updateWaveSystem();

            const dir = ge.game.difficultyDirector;
            snaps.push({
                directorWave: dir ? dir.wave : null,
                advanced: dir ? dir.wave > waveBefore : false,
                D_hp: dir ? dir.D_hp : null,
                D_thr: dir ? dir.D_thr : null,
            });

            // Advance to the next wave through the real path so the next
            // updateWaveSystem clear has a wave to end. startNextWave flips to
            // WAVE_TRANSITION + arms timers; spawnWaveEntities resets wave state.
            ge.game.waveComplete = false;
            ge.startNextWave();
            ge.spawnWaveEntities();
            ge.game.state = 'PLAYING';
        }
        return snaps;
    }, count);
}

test.describe('QA-20: Adaptive Difficulty Director — LIVE', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        // Fast kills for any real-frame play (mirrors the enemy tests).
        await page.evaluate(() => { window.gameEngine.cheats.onePunchMan = true; });
    });

    // ------------------------------------------------------------------
    // (a) Director exists at run start, neutral.
    // ------------------------------------------------------------------

    test('director is instantiated on new-run init, neutral at start', async ({ page }) => {
        const snap = await page.evaluate(() => {
            const dir = window.gameEngine.game.difficultyDirector;
            if (!dir) return null;
            return { D_hp: dir.D_hp, D_thr: dir.D_thr, wave: dir.wave, hasCfg: !!dir.cfg };
        });
        expect(snap).not.toBeNull();
        expect(snap.hasCfg).toBe(true);
        expect(snap.D_hp).toBeCloseTo(1, 5);
        expect(snap.D_thr).toBeCloseTo(1, 5);
        expect(snap.wave).toBe(0);
    });

    // ------------------------------------------------------------------
    // (b) Clearing several waves advances the director's wave count.
    // ------------------------------------------------------------------

    test('clearing several waves advances the director and lets D move past cold-start', async ({ page }) => {
        const snaps = await advanceWaves(page, 6);
        // Every iteration recorded a wave (wave count strictly increasing).
        expect(snaps.length).toBe(6);
        expect(snaps.every((s) => s.advanced)).toBe(true);
        expect(snaps[snaps.length - 1].directorWave).toBeGreaterThanOrEqual(6);
        // Cold-start (waves 1–2) holds D=1; by the end D_hp must have responded
        // to the sustained fast / full-HP over-performance.
        expect(snaps[1].D_hp).toBeCloseTo(1, 5);
        expect(snaps[snaps.length - 1].D_hp).toBeGreaterThan(1);
    });

    // ------------------------------------------------------------------
    // (c) getThreatLevel returns an integer in [1,5].
    // ------------------------------------------------------------------

    test('getThreatLevel(director) returns an integer in [1,5]', async ({ page }) => {
        await advanceWaves(page, 5);
        const pip = await page.evaluate(async () => {
            const mod = await import('/js/modules/wave/difficulty-director.js');
            return mod.getThreatLevel(window.gameEngine.game.difficultyDirector);
        });
        expect(Number.isInteger(pip)).toBe(true);
        expect(pip).toBeGreaterThanOrEqual(1);
        expect(pip).toBeLessThanOrEqual(5);
    });

    // ------------------------------------------------------------------
    // (d) The threat HUD marker is now set (HUD fed live by the director).
    // ------------------------------------------------------------------

    test('threat HUD marker is set live (no debug override needed)', async ({ page }) => {
        // Ensure there is NO debug override in play — the live director must be
        // the source of the level.
        await page.evaluate(() => {
            delete window.gameEngine._debugThreatLevel;
            delete window.gameEngine.game._debugThreatLevel;
            window.gameEngine._threatLevelDrawn = undefined;
        });
        await advanceWaves(page, 4);
        // Let the live HUD draw path run a few frames now that a director exists.
        await page.waitForFunction(
            () => typeof window.gameEngine._threatLevelDrawn === 'number',
            { timeout: 5000 }
        );
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(Number.isInteger(marker)).toBe(true);
        expect(marker).toBeGreaterThanOrEqual(1);
        expect(marker).toBeLessThanOrEqual(5);
    });

    // ------------------------------------------------------------------
    // (e) Safety: D stays inside its hard clamps after several waves.
    // (f) No fatal JS errors through the run.
    // ------------------------------------------------------------------

    test('D stays inside [0.6,3.0]/[0.6,1.8] and no fatal errors through several waves', async ({ page }) => {
        const errors = attachErrorCollector(page);
        const snaps = await advanceWaves(page, 8);
        // Run a few real frames so the live HUD + difficulty reads execute.
        await page.waitForTimeout(300);

        for (const s of snaps) {
            expect(s.D_hp).toBeGreaterThanOrEqual(0.6);
            expect(s.D_hp).toBeLessThanOrEqual(3.0);
            expect(s.D_thr).toBeGreaterThanOrEqual(0.6);
            expect(s.D_thr).toBeLessThanOrEqual(1.8);
        }

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
