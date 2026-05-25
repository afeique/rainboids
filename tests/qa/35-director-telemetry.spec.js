/**
 * QA-35: Adaptive Difficulty Director — telemetry capture (CD-17)
 *
 * CD-17 adds READ-ONLY per-wave telemetry: on each wave-clear the wave-manager
 * snapshots the director's post-feed state + the wave outcome into a per-run
 * buffer (game.directorTelemetry). This is instrumentation for the future
 * RUN-07 balance pass — it MUST NOT perturb the live director. These tests
 * confirm:
 *   (a) game.directorTelemetry exists + is empty at run start
 *   (b) clearing several waves accrues records (length grows per wave) with the
 *       expected finite numeric fields (D_hp/D_thr/Po/Pd/threatLevel/clearTime)
 *   (c) game.dumpDirectorTelemetry() returns valid JSON ({ summary, records })
 *   (d) the live director's D values still MOVE exactly as in QA-20 — telemetry
 *       did not perturb the difficulty loop — and there are NO fatal JS errors
 *
 * Waves are advanced through the REAL live path (mirrors QA-20): drain the
 * pools + mark sub-waves done, run updateWaveSystem() (fires the wave-clear feed
 * → tickWave → telemetry capture), then startNextWave()+spawnWaveEntities().
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

// Drive `count` live wave clears through the real updateWaveSystem feed path.
// Same mechanism as QA-20's advanceWaves; additionally returns the telemetry
// record count + director D after each clear so we can assert accrual + that the
// director still moves (telemetry didn't perturb it).
async function advanceWaves(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        const snaps = [];
        for (let i = 0; i < n; i++) {
            ge._waveStartMs = Date.now() - 8000; // ~8s clear vs 35s target
            ge.player.health = ge.player.getEffectiveMaxHealth();

            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.asteroidPool.activeObjects.slice().forEach((a) => { a.active = false; });
            ge.enemyPool.cleanupInactive();
            ge.asteroidPool.cleanupInactive();

            if (ge._waveState) {
                ge._waveState.phase = 'complete';
                ge._waveState.subWaveIndex = 999;
            }
            ge.game.subWaveIndex = 999;
            ge.game.waveComplete = false;
            ge.game.state = 'PLAYING';

            const recsBefore = ge.game.directorTelemetry
                ? ge.game.directorTelemetry.records.length : null;

            // Live wave-clear branch → feedDirectorOnWaveClear → tickWave + telemetry.
            ge.updateWaveSystem();

            const dir = ge.game.difficultyDirector;
            const tel = ge.game.directorTelemetry;
            const last = tel && tel.records.length ? tel.records[tel.records.length - 1] : null;
            snaps.push({
                recordCount: tel ? tel.records.length : null,
                grew: tel ? tel.records.length > recsBefore : false,
                D_hp: dir ? dir.D_hp : null,
                D_thr: dir ? dir.D_thr : null,
                last,
            });

            ge.game.waveComplete = false;
            ge.startNextWave();
            ge.spawnWaveEntities();
            ge.game.state = 'PLAYING';
        }
        return snaps;
    }, count);
}

test.describe('QA-35: Director telemetry (CD-17)', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await page.evaluate(() => { window.gameEngine.cheats.onePunchMan = true; });
    });

    // ------------------------------------------------------------------
    // (a) Telemetry buffer exists + empty at run start.
    // ------------------------------------------------------------------

    test('directorTelemetry buffer is created on new-run init, empty at start', async ({ page }) => {
        const snap = await page.evaluate(() => {
            const t = window.gameEngine.game.directorTelemetry;
            if (!t) return null;
            return {
                isArray: Array.isArray(t.records),
                length: t.records.length,
                hasRunStartedAt: Number.isFinite(t.runStartedAt),
            };
        });
        expect(snap).not.toBeNull();
        expect(snap.isArray).toBe(true);
        expect(snap.length).toBe(0);
        expect(snap.hasRunStartedAt).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Records accrue per wave-clear with the expected finite fields.
    // ------------------------------------------------------------------

    test('records accrue per wave-clear with expected finite numeric fields', async ({ page }) => {
        const snaps = await advanceWaves(page, 6);
        expect(snaps.length).toBe(6);
        // Every clear grew the buffer by one.
        expect(snaps.every((s) => s.grew)).toBe(true);
        // Record count tracks the number of cleared waves.
        expect(snaps[snaps.length - 1].recordCount).toBe(6);

        // Each record carries the expected numeric fields, all finite.
        for (const s of snaps) {
            const r = s.last;
            expect(r).not.toBeNull();
            for (const key of ['wave', 'pwr', 'Po', 'Pd', 'D_hp', 'D_thr', 'threatLevel', 'clearTimeMs', 'hpRetainedFrac']) {
                expect(Number.isFinite(r[key])).toBe(true);
            }
            // threatLevel is an integer pip in [1,5].
            expect(Number.isInteger(r.threatLevel)).toBe(true);
            expect(r.threatLevel).toBeGreaterThanOrEqual(1);
            expect(r.threatLevel).toBeLessThanOrEqual(5);
            // D within hard clamps.
            expect(r.D_hp).toBeGreaterThanOrEqual(0.6);
            expect(r.D_hp).toBeLessThanOrEqual(3.0);
            expect(r.D_thr).toBeGreaterThanOrEqual(0.6);
            expect(r.D_thr).toBeLessThanOrEqual(1.8);
        }
    });

    // ------------------------------------------------------------------
    // (c) dumpDirectorTelemetry() returns valid JSON.
    // ------------------------------------------------------------------

    test('dumpDirectorTelemetry() returns valid JSON with summary + records', async ({ page }) => {
        await advanceWaves(page, 5);
        const parsed = await page.evaluate(() => {
            const json = window.gameEngine.dumpDirectorTelemetry();
            return { type: typeof json, parsed: JSON.parse(json) };
        });
        expect(parsed.type).toBe('string');
        expect(parsed.parsed).toHaveProperty('summary');
        expect(parsed.parsed).toHaveProperty('records');
        expect(parsed.parsed.records.length).toBe(5);
        expect(parsed.parsed.summary.count).toBe(5);
        expect(parsed.parsed.summary.waveRange.min).toBeLessThanOrEqual(parsed.parsed.summary.waveRange.max);
    });

    // ------------------------------------------------------------------
    // (d) Telemetry did NOT perturb the director: D still moves past
    //     cold-start exactly like QA-20 — and no fatal JS errors.
    // ------------------------------------------------------------------

    test('director D still moves (telemetry did not perturb it) + no fatal errors', async ({ page }) => {
        const errors = attachErrorCollector(page);
        const snaps = await advanceWaves(page, 8);
        await page.waitForTimeout(300);

        // Cold-start (waves 1–2) holds D=1; sustained fast/full-HP over-performance
        // must push D_hp above 1 by the end — identical to QA-20's assertion. This
        // proves the read-only telemetry capture didn't disturb the loop.
        expect(snaps[1].D_hp).toBeCloseTo(1, 5);
        expect(snaps[snaps.length - 1].D_hp).toBeGreaterThan(1);

        // D stays inside the hard clamps every wave.
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
