/**
 * E2E-11: wave-clear pause race regression test (5.74.14, 5.76.2 stack
 * consolidation).
 *
 * Original bug: wave-clear kicked off a real-time setTimeout(2700) to
 * open the powerups menu, gated on `state === WAVE_TRANSITION`. If the
 * player paused (or the tab was timer-throttled) during that 2.7s
 * window, the gate failed when the timer fired and the menu never
 * opened — leaving the run stuck (waveComplete=true, state=PLAYING,
 * no progression possible).
 *
 * 5.74.14 fixed it via `_pausedFromWaveClear` flag; 5.76.2 consolidated
 * pause/shop returns into a single `_stateResumeStack` that the wave-
 * clear path tags with `fromWaveClear: true`. This spec exercises the
 * full sequence to prevent any regression on either layer:
 *
 *   1. Start the game (wave 1 begins).
 *   2. Force the wave to complete (clear entities) so wave-clear fires.
 *   3. Pause IMMEDIATELY before the 2.7s setTimeout would open the
 *      powerups menu.
 *   4. Wait past 2.7s while paused (the menu cannot open while paused).
 *   5. Resume.
 *   6. Assert that the run advances — current wave > 1, state ends up
 *      PLAYING / WAVE_TRANSITION (i.e. NOT permanently stuck).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

async function tick(page, frames = 30) {
    await page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
    }, frames);
}

test.describe('E2E-11: Wave-clear pause race', () => {
    test.setTimeout(45_000);

    test('pausing during the 2.7s wave-clear gap still advances the wave on resume', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const startWave = await page.evaluate(() => window.gameEngine.game.currentWave);
        expect(startWave).toBeGreaterThanOrEqual(1);

        // 1. Force wave 1 complete: kill every active enemy by zeroing
        //    HP. Asteroids don't gate wave completion.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (const e of [...ge.enemyPool.activeObjects]) {
                e.health = 0;
                e.active = false;
            }
            ge.enemyPool.cleanupInactive();
            // Force all sub-waves to be considered "spawned" so the
            // wave-complete check gates on enemy count alone. We don't
            // know the exact sub-wave length without importing wave-data,
            // so just bump the index past any plausible cap (10 is plenty
            // since current waves max at 3 sub-waves).
            ge.game.subWaveIndex = 99;
        });

        // 2. Tick a few frames to let `updateWaveSystem` run the wave-
        //    complete branch (sets `state = WAVE_TRANSITION` + schedules
        //    the 2.7s setTimeout).
        await tick(page, 30);

        const afterClear = await page.evaluate(() => ({
            state: window.gameEngine.game.state,
            waveComplete: window.gameEngine.game.waveComplete,
            stackDepth: (window.gameEngine._stateResumeStack || []).length,
        }));
        // The wave-clear branch should have fired. Stack should hold a
        // wave-clear frame, state should be WAVE_TRANSITION, waveComplete true.
        expect(afterClear.state).toBe('WAVE_TRANSITION');
        expect(afterClear.waveComplete).toBe(true);
        expect(afterClear.stackDepth).toBeGreaterThanOrEqual(1);

        // 3. Pause via togglePause BEFORE the 2.7s setTimeout would fire.
        await page.evaluate(() => window.gameEngine.togglePause());
        const pausedState = await page.evaluate(() => window.gameEngine.game.state);
        expect(pausedState).toBe('PAUSED');

        // 4. Wait past the 2.7s gap so the setTimeout runs while paused.
        //    The setTimeout's gate (`state === WAVE_TRANSITION`) will FAIL
        //    because we're paused; this is the race the bug exploited.
        await page.waitForTimeout(3200);

        // 5. Resume. With the stack consolidation (or the legacy
        //    `_pausedFromWaveClear` path), the resume should restore
        //    state = WAVE_TRANSITION and call startNextWave.
        await page.evaluate(() => window.gameEngine.togglePause());

        // 6. Tick a few seconds for wave intro + state transition.
        await tick(page, 240);

        const final = await page.evaluate(() => ({
            state: window.gameEngine.game.state,
            currentWave: window.gameEngine.game.currentWave,
            waveComplete: window.gameEngine.game.waveComplete,
        }));

        // Run must have advanced past wave 1 and NOT be stuck in PLAYING
        // with waveComplete=true (the original bug signature).
        expect(final.currentWave).toBeGreaterThan(startWave);
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(final.state);
        if (final.state === 'PLAYING') {
            // If we're already PLAYING, the new wave must NOT be flagged complete.
            expect(final.waveComplete).toBe(false);
        }
    });
});
