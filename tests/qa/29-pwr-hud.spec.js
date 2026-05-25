/**
 * QA-29: Power-Level (PWR) HUD readout (DIR-06 / §13.6)
 *
 * Smoke-tests the canvas-drawn "P {value}" power readout in the live game.
 * DIR-05 computes + caches `game.playerPWR` (a number, ≈100 for a starter)
 * and the HUD's drawLevelAndCoinsDisplay READS it each render pass, drawing
 * the readout beside the level/shield cluster and surfacing the queryable
 * marker `gameEngine._pwrDrawn` (the rounded value it drew). Asserts:
 *   (a) with a live playerPWR set, the HUD draws that rounded value
 *   (b) the readout is DEFENSIVE — if playerPWR is undefined/NaN the HUD
 *       falls back to the neutral reference (≈100) instead of throwing
 *   (c) NO fatal JS errors while the readout renders live across many frames
 *
 * Mirrors the QA-18 threat-HUD harness (debug seam + marker + error collector).
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

test.describe('QA-29: Power-Level (PWR) HUD readout', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) A live playerPWR drives the readout and surfaces the marker.
    // ------------------------------------------------------------------

    test('draws the rounded playerPWR value beside the level cluster', async ({ page }) => {
        await page.evaluate(() => {
            // Set a value with a fractional part to confirm rounding.
            window.gameEngine.game.playerPWR = 148.7;
            window.gameEngine._pwrDrawn = undefined;
        });
        // Advance frames so the HUD draw path runs and writes the marker.
        await page.waitForFunction(
            () => typeof window.gameEngine._pwrDrawn === 'number',
            { timeout: 5000 }
        );
        const drawn = await page.evaluate(() => window.gameEngine._pwrDrawn);
        expect(drawn).toBe(149);
    });

    // ------------------------------------------------------------------
    // (b) Defensive: undefined / NaN playerPWR → neutral fallback (≈100),
    //     no throw, marker is always a finite number while the HUD draws.
    // ------------------------------------------------------------------

    test('falls back to the neutral reference when playerPWR is missing/NaN', async ({ page }) => {
        const errors = attachErrorCollector(page);

        // undefined (e.g. before DIR-05 runs / a save mid-migration).
        await page.evaluate(() => {
            delete window.gameEngine.game.playerPWR;
            window.gameEngine._pwrDrawn = undefined;
        });
        await page.waitForFunction(
            () => Number.isFinite(window.gameEngine._pwrDrawn),
            { timeout: 5000 }
        );
        const undef = await page.evaluate(() => window.gameEngine._pwrDrawn);
        expect(undef).toBe(100);

        // NaN should likewise fall back, not propagate.
        await page.evaluate(() => {
            window.gameEngine.game.playerPWR = NaN;
            window.gameEngine._pwrDrawn = undefined;
        });
        await page.waitForFunction(
            () => Number.isFinite(window.gameEngine._pwrDrawn),
            { timeout: 5000 }
        );
        const nan = await page.evaluate(() => window.gameEngine._pwrDrawn);
        expect(nan).toBe(100);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });

    // ------------------------------------------------------------------
    // (c) No fatal errors while the readout renders live across frames
    //     as the value climbs (the build-strength scoreboard in motion).
    // ------------------------------------------------------------------

    test('no fatal JS errors while the readout renders and the value climbs', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await page.evaluate(() => { window.gameEngine.game.playerPWR = 100; });
        await page.waitForTimeout(250);
        await page.evaluate(() => { window.gameEngine.game.playerPWR = 320; });
        await page.waitForTimeout(250);
        await page.evaluate(() => { window.gameEngine.game.playerPWR = 1000; });
        await page.waitForTimeout(300);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);

        // The HUD ended on the final value.
        const drawn = await page.evaluate(() => window.gameEngine._pwrDrawn);
        expect(drawn).toBe(1000);
    });
});
