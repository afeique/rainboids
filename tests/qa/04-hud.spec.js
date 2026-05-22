/**
 * QA-04: HUD and UI elements
 *
 * Verifies that the in-game HUD, pause menu, and UI overlay elements work
 * correctly across state transitions.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getGameState } from '../helpers/game-helpers.js';

test.describe('QA-04: HUD and UI', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
    });

    // ------------------------------------------------------------------
    // Pre-start DOM elements
    // ------------------------------------------------------------------

    test('pause button is attached to DOM before game starts', async ({ page }) => {
        // Button exists in DOM (may be CSS-hidden before game starts)
        await expect(page.locator('#hud-pause-btn')).toBeAttached();
    });

    test('pause overlay is hidden before game starts', async ({ page }) => {
        const overlay = page.locator('#pause-overlay');
        // Should either be hidden or not display:flex
        const display = await overlay.evaluate(el => el.style.display);
        expect(display).toBe('none');
    });

    // ------------------------------------------------------------------
    // Pause / resume via Escape key
    // ------------------------------------------------------------------

    test('pressing Escape during gameplay pauses the game', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');

        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PAUSED',
            { timeout: 5_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('PAUSED');
    });

    test('pause overlay becomes visible when paused', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');

        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PAUSED',
            { timeout: 5_000 }
        );
        const overlay = page.locator('#pause-overlay');
        await expect(overlay).toBeVisible();
    });

    test('pressing Escape again resumes the game', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape'); // pause
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PAUSED',
            { timeout: 5_000 }
        );
        await page.keyboard.press('Escape'); // resume
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PLAYING',
            { timeout: 5_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });

    test('pause overlay hides after resuming', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PLAYING', { timeout: 5_000 });

        const overlay = page.locator('#pause-overlay');
        await expect(overlay).toBeHidden();
    });

    // ------------------------------------------------------------------
    // Pause menu content
    // ------------------------------------------------------------------

    test('pause menu has CONTROLS tab', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'CONTROLS' });
        await expect(tab).toBeVisible();
    });

    // NOTE: the POWERUPS pause-menu tab was removed in 6.1.0 — powerups are
    // now bought in the shop overlay (covered by QA-07). The former
    // "pause menu has POWERUPS tab" / "clicking POWERUPS tab" tests were
    // removed as obsolete.

    test('pause menu has MUSIC tab', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'MUSIC' });
        await expect(tab).toBeVisible();
    });

    test('pause menu has SFX tab', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'SFX' });
        await expect(tab).toBeVisible();
    });

    test('RESUME button in pause menu resumes the game', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        await page.click('#pause-resume-button');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PLAYING', { timeout: 5_000 });

        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });

    // ------------------------------------------------------------------
    // Pause menu tab switching
    // ------------------------------------------------------------------

    test('clicking MUSIC tab shows music player', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        await page.click('.pause-tab[data-tab="music"]');
        const content = page.locator('#music-tab');
        await expect(content).toHaveClass(/active/);
    });

    // ------------------------------------------------------------------
    // HUD pause button
    // ------------------------------------------------------------------

    test('clicking HUD pause button pauses the game', async ({ page }) => {
        await startGame(page);
        // The HUD PAUSE button is canvas-drawn (5.79.2 — the DOM
        // #hud-pause-btn is vestigial / display:none). It's hit-tested from
        // `_hudButtonRects.pause`; clicking the canvas there calls
        // togglePause() (see event-setup.js). Convert the rect's canvas-pixel
        // coords to client coords and click it.
        await page.waitForFunction(
            () => window.gameEngine?._hudButtonRects?.pause,
            { timeout: 5_000 }
        );
        const pos = await page.evaluate(() => {
            const ge = window.gameEngine;
            const r = ge._hudButtonRects.pause;
            const c = ge.canvas;
            const cb = c.getBoundingClientRect();
            return {
                x: cb.left + (r.x + r.w / 2) * (cb.width / c.width),
                y: cb.top + (r.y + r.h / 2) * (cb.height / c.height),
            };
        });
        await page.mouse.click(pos.x, pos.y);

        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PAUSED',
            { timeout: 5_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('PAUSED');
    });

    // ------------------------------------------------------------------
    // Powerup HUD
    // ------------------------------------------------------------------

    test('powerup HUD element exists', async ({ page }) => {
        await expect(page.locator('#powerup-hud')).toBeAttached();
    });
});
