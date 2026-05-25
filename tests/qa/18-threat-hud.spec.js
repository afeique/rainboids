/**
 * QA-18: Threat-Level HUD (CD-16 / T15, R-THREATUI)
 *
 * Smoke-tests the canvas-drawn 5-pip Threat meter in the live game. The
 * Adaptive Difficulty Director is NOT yet instantiated (that wiring lands in
 * RUN-01/RUN-05), so the HUD hook is defensive and no-ops until something
 * supplies a level. These tests drive it through the DEBUG SEAM
 * (`gameEngine._debugThreatLevel`), which the hook honors when no live director
 * is present. Asserts:
 *   (a) with NO director and NO override, the hook draws nothing (no marker)
 *   (b) setting the debug override → the HUD draws at that level, surfacing the
 *       queryable marker `gameEngine._threatLevelDrawn`
 *   (c) the override clamps to [1,5]
 *   (d) NO fatal JS errors while the meter renders live across many frames
 *
 * The HUD hook is invoked via `.call(this)` from drawHUD where `this` is the
 * GameEngine, so the debug override + marker both live on `window.gameEngine`.
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

test.describe('QA-18: Threat-Level HUD', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) No director, no override → the hook no-ops (nothing drawn).
    // ------------------------------------------------------------------

    test('no-ops with no director and no debug override', async ({ page }) => {
        const drawn = await page.evaluate(() => {
            const ge = window.gameEngine;
            // Ensure a clean slate: no override set.
            delete ge._debugThreatLevel;
            ge._threatLevelDrawn = undefined;
            return ge._threatLevelDrawn;
        });
        // Let a few frames render with no source of a level.
        await page.waitForTimeout(200);
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(drawn).toBeUndefined();
        expect(marker).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // (b) Debug override → the meter draws at that level.
    // ------------------------------------------------------------------

    test('debug override drives the meter and surfaces the marker', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine._debugThreatLevel = 4;
            window.gameEngine._threatLevelDrawn = undefined;
        });
        // Advance several frames so the HUD draw path runs the hook.
        await page.waitForFunction(
            () => window.gameEngine._threatLevelDrawn === 4,
            { timeout: 5000 }
        );
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBe(4);

        // The anim state machine was created and adopted the level.
        const anim = await page.evaluate(() => {
            const a = window.gameEngine._threatAnim;
            return a ? { shownLevel: a.shownLevel } : null;
        });
        expect(anim).not.toBeNull();
        expect(anim.shownLevel).toBe(4);
    });

    // ------------------------------------------------------------------
    // (c) Override clamps to [1,5].
    // ------------------------------------------------------------------

    test('out-of-range debug override clamps into [1,5]', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine._debugThreatLevel = 99;
            window.gameEngine._threatLevelDrawn = undefined;
        });
        await page.waitForFunction(
            () => typeof window.gameEngine._threatLevelDrawn === 'number',
            { timeout: 5000 }
        );
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBe(5);
    });

    // ------------------------------------------------------------------
    // (d) No fatal errors while the meter renders live (incl. a level change
    //     so the toast + pulse render paths execute).
    // ------------------------------------------------------------------

    test('no fatal JS errors while the meter renders and the level changes', async ({ page }) => {
        const errors = attachErrorCollector(page);

        // Start low so the next bump is an INCREASE (toast ↑ + pulse).
        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 2; });
        await page.waitForTimeout(300);
        // Increase → exercises the THREAT ↑ toast + active-pip pulse render.
        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 5; });
        await page.waitForTimeout(300);
        // Decrease → exercises the THREAT ↓ toast (subtler) render.
        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 1; });
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);

        // The meter ended on the final (clamped) level.
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBe(1);
    });
});
