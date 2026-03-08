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

    test('pause menu has POWERUPS tab', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'POWERUPS' });
        await expect(tab).toBeVisible();
    });

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

    test('clicking POWERUPS tab shows powerups content', async ({ page }) => {
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        await page.click('.pause-tab[data-tab="powerups"]');
        const content = page.locator('#powerups-tab');
        await expect(content).toHaveClass(/active/);
    });

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
        await page.click('#hud-pause-btn');

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
