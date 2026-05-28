/**
 * E2E-01: Title screen and pause menu
 *
 * Covers every interactive element of the pause menu and the title-screen
 * → gameplay transition. Does NOT duplicate tests already in qa/04-hud.spec.js
 * (escape-to-pause, overlay visibility, tab switching, RESUME button).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getGameState } from '../helpers/game-helpers.js';

test.describe('E2E-01: Title screen and pause menu', () => {

    // -----------------------------------------------------------------------
    // Title screen → start
    // -----------------------------------------------------------------------

    test.describe('title screen', () => {
        test('initial state is TITLE_SCREEN before any interaction', async ({ page }) => {
            await loadGame(page);
            const state = await getGameState(page);
            expect(state).toBe('TITLE_SCREEN');
        });

        test('clicking the canvas starts the game', async ({ page }) => {
            await loadGame(page);
            await page.click('#gameCanvas');
            await page.waitForFunction(
                () => window.gameEngine?.game?.state === 'PLAYING',
                { timeout: 10_000 }
            );
            expect(await getGameState(page)).toBe('PLAYING');
        });

        test('pressing Space starts the game', async ({ page }) => {
            await loadGame(page);
            await page.keyboard.press('Space');
            await page.waitForFunction(
                () => window.gameEngine?.game?.state === 'PLAYING',
                { timeout: 10_000 }
            );
            expect(await getGameState(page)).toBe('PLAYING');
        });

        test('pressing Enter starts the game', async ({ page }) => {
            await loadGame(page);
            await page.keyboard.press('Enter');
            await page.waitForFunction(
                () => window.gameEngine?.game?.state === 'PLAYING',
                { timeout: 10_000 }
            );
            expect(await getGameState(page)).toBe('PLAYING');
        });
    });

    // -----------------------------------------------------------------------
    // Pause menu — structure
    // -----------------------------------------------------------------------

    test.describe('pause menu structure', () => {
        test.beforeEach(async ({ page }) => {
            await loadGame(page);
            await startGame(page);
            await page.keyboard.press('Escape');
            await page.waitForFunction(
                () => window.gameEngine?.game?.state === 'PAUSED',
                { timeout: 5_000 }
            );
        });

        test('pause overlay is visible when paused', async ({ page }) => {
            await expect(page.locator('#pause-overlay')).toBeVisible();
        });

        test('RESUME button is visible in pause menu', async ({ page }) => {
            await expect(page.locator('#pause-resume-button')).toBeVisible();
        });

        test('CONTROLS sub-tab is visible under SETTINGS', async ({ page }) => {
            // 8.27.0 — Controls is a SETTINGS sub-tab now.
            await page.click('.pause-tab[data-tab="settings"]');
            await expect(page.locator('.settings-subtab[data-subtab="controls"]')).toBeVisible();
        });

        test('POWERUPS tab is visible', async ({ page }) => {
            await expect(page.locator('.pause-tab[data-tab="powerups"]')).toBeVisible();
        });

        test('MUSIC sub-tab is visible under SETTINGS', async ({ page }) => {
            await page.click('.pause-tab[data-tab="settings"]');
            await expect(page.locator('.settings-subtab[data-subtab="music"]')).toBeVisible();
        });

        test('SFX sub-tab is visible under SETTINGS', async ({ page }) => {
            await page.click('.pause-tab[data-tab="settings"]');
            await expect(page.locator('.settings-subtab[data-subtab="sfx"]')).toBeVisible();
        });
    });

    // -----------------------------------------------------------------------
    // Pause menu — tab navigation
    // -----------------------------------------------------------------------

    test.describe('pause menu tab navigation', () => {
        test.beforeEach(async ({ page }) => {
            await loadGame(page);
            await startGame(page);
            await page.keyboard.press('Escape');
            await page.waitForFunction(
                () => window.gameEngine?.game?.state === 'PAUSED',
                { timeout: 5_000 }
            );
        });

        test('CONTROLS tab is active by default', async ({ page }) => {
            const activeTab = page.locator('#controls-tab');
            await expect(activeTab).toHaveClass(/active/);
        });

        test('clicking POWERUPS tab activates powerups content panel', async ({ page }) => {
            await page.click('.pause-tab[data-tab="powerups"]');
            await expect(page.locator('#powerups-tab')).toHaveClass(/active/);
        });

        test('clicking the MUSIC sub-tab activates the music content panel', async ({ page }) => {
            // 8.27.0 — Music/SFX/Controls are SETTINGS sub-tabs now.
            await page.click('.pause-tab[data-tab="settings"]');
            await page.click('.settings-subtab[data-subtab="music"]');
            await expect(page.locator('#music-tab')).toHaveClass(/active/);
        });

        test('clicking the SFX sub-tab activates the sfx content panel', async ({ page }) => {
            await page.click('.pause-tab[data-tab="settings"]');
            await page.click('.settings-subtab[data-subtab="sfx"]');
            await expect(page.locator('#sfx-tab')).toHaveClass(/active/);
        });

        test('clicking the CONTROLS sub-tab re-activates the controls panel', async ({ page }) => {
            await page.click('.pause-tab[data-tab="settings"]');
            await page.click('.settings-subtab[data-subtab="music"]'); // switch away first
            await page.click('.settings-subtab[data-subtab="controls"]');
            await expect(page.locator('#controls-tab')).toHaveClass(/active/);
        });
    });

    // -----------------------------------------------------------------------
    // Pause menu — resume paths
    // -----------------------------------------------------------------------

    test.describe('pause menu resume actions', () => {
        test.beforeEach(async ({ page }) => {
            await loadGame(page);
            await startGame(page);
        });

        test('RESUME button click returns game to PLAYING', async ({ page }) => {
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
            await page.click('#pause-resume-button');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PLAYING', { timeout: 5_000 });
            expect(await getGameState(page)).toBe('PLAYING');
        });

        test('second Escape press while paused resumes the game', async ({ page }) => {
            await page.keyboard.press('Escape'); // pause
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
            await page.keyboard.press('Escape'); // resume
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PLAYING', { timeout: 5_000 });
            expect(await getGameState(page)).toBe('PLAYING');
        });

        test('HUD pause button pauses the game', async ({ page }) => {
            await page.click('#hud-pause-btn');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
            expect(await getGameState(page)).toBe('PAUSED');
        });

        test('pause overlay hides after resuming via RESUME button', async ({ page }) => {
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
            await page.click('#pause-resume-button');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PLAYING', { timeout: 5_000 });
            await expect(page.locator('#pause-overlay')).toBeHidden();
        });
    });

    // -----------------------------------------------------------------------
    // Music tab content
    // -----------------------------------------------------------------------

    test.describe('music tab', () => {
        test.beforeEach(async ({ page }) => {
            await loadGame(page);
            await startGame(page);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
            // 8.27.0 — MUSIC is a SETTINGS sub-tab now.
            await page.click('.pause-tab[data-tab="settings"]');
            await page.click('.settings-subtab[data-subtab="music"]');
        });

        test('music player element is present', async ({ page }) => {
            await expect(page.locator('#music-player')).toBeAttached();
        });

        test('play/pause button is visible', async ({ page }) => {
            await expect(page.locator('#music-play-pause')).toBeVisible();
        });

        test('next track button is visible', async ({ page }) => {
            await expect(page.locator('#music-next')).toBeVisible();
        });

        test('previous track button is visible', async ({ page }) => {
            await expect(page.locator('#music-prev')).toBeVisible();
        });

        test('progress bar is present', async ({ page }) => {
            await expect(page.locator('#music-player-progress-bar')).toBeAttached();
        });
    });
});
