/**
 * QA-18: Threat-Level HUD (CD-16 / T15, R-THREATUI)
 *
 * 8.0.0 — The Threat meter is DISABLED in all builds (THREAT_HUD_ENABLED =
 * false in js/modules/hud/threat-level.js). It crowded the top-center on
 * mobile and read as noise on desktop. This spec now pins the DISABLED
 * contract: `drawThreatLevelHook` early-returns, so the meter never renders
 * and `gameEngine._threatLevelDrawn` stays unset — even when a debug override
 * is present and across many frames, with no fatal JS errors.
 *
 * The pure helpers (computeThreatLayout / threatPipColor / updateThreatAnim)
 * are still covered by tests/unit/hud/threat-level.test.js. When the meter is
 * re-enabled (flip THREAT_HUD_ENABLED to true), restore the rendering
 * assertions from git history.
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

test.describe('QA-18: Threat-Level HUD (disabled)', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // The module-level master switch is off.
    // ------------------------------------------------------------------

    test('THREAT_HUD_ENABLED is false', async ({ page }) => {
        const enabled = await page.evaluate(async () => {
            const mod = await import('/js/modules/hud/threat-level.js');
            return mod.THREAT_HUD_ENABLED;
        });
        expect(enabled).toBe(false);
    });

    // ------------------------------------------------------------------
    // No override → nothing drawn (no marker).
    // ------------------------------------------------------------------

    test('no-ops with no director and no debug override', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            delete ge._debugThreatLevel;
            ge._threatLevelDrawn = undefined;
        });
        await page.waitForTimeout(200);
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // Even WITH a debug override, the disabled hook draws nothing.
    // ------------------------------------------------------------------

    test('debug override does NOT drive the meter while disabled', async ({ page }) => {
        await page.evaluate(() => {
            window.gameEngine._debugThreatLevel = 4;
            window.gameEngine._threatLevelDrawn = undefined;
        });
        // Give the HUD draw path many frames to run the (now no-op) hook.
        await page.waitForTimeout(400);
        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // No fatal errors while the disabled hook runs every frame.
    // ------------------------------------------------------------------

    test('no fatal JS errors while the disabled hook renders', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 2; });
        await page.waitForTimeout(250);
        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 5; });
        await page.waitForTimeout(250);
        await page.evaluate(() => { window.gameEngine._debugThreatLevel = 1; });
        await page.waitForTimeout(300);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);

        const marker = await page.evaluate(() => window.gameEngine._threatLevelDrawn);
        expect(marker).toBeUndefined();
    });
});
