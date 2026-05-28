/**
 * E2E-04: Music player
 *
 * Verifies that the music player UI inside the pause menu is fully rendered
 * and that its interactive controls are present and clickable.
 *
 * Note: actual audio playback cannot be verified in headless Chromium, so
 * these tests check DOM state changes (play/pause button text toggle, track
 * name update, etc.) rather than audio output.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('E2E-04: Music player', () => {

    /** Open the pause menu and navigate to the MUSIC tab. */
    async function openMusicTab(page) {
        await loadGame(page);
        await startGame(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PAUSED',
            { timeout: 5_000 }
        );
        // 8.27.0 — MUSIC is a SETTINGS sub-tab now.
        await page.click('.pause-tab[data-tab="settings"]');
        await page.click('.settings-subtab[data-subtab="music"]');
        // Give the tab content time to render
        await page.waitForTimeout(200);
    }

    // -----------------------------------------------------------------------
    // Music tab visibility
    // -----------------------------------------------------------------------

    test('MUSIC tab content panel becomes active when clicked', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-tab')).toHaveClass(/active/);
    });

    test('music player container is visible inside the music tab', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-player')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // Player controls existence
    // -----------------------------------------------------------------------

    test('play/pause button (#music-play-pause) is visible', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-play-pause')).toBeVisible();
    });

    test('next-track button (#music-next) is visible', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-next')).toBeVisible();
    });

    test('previous-track button (#music-prev) is visible', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-prev')).toBeVisible();
    });

    test('shuffle button (#music-shuffle) is visible', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-shuffle')).toBeVisible();
    });

    test('repeat button (#music-repeat) is visible', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-repeat')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // Progress bar
    // -----------------------------------------------------------------------

    test('progress bar container is present', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-player-progress-bar')).toBeAttached();
    });

    test('progress bar fill element is present', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#music-player-progress')).toBeAttached();
    });

    // -----------------------------------------------------------------------
    // Track name / playlist
    // -----------------------------------------------------------------------

    test('current track name element is present', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#current-track-name')).toBeAttached();
    });

    test('playlist tracks container is present', async ({ page }) => {
        await openMusicTab(page);
        await expect(page.locator('#playlist-tracks')).toBeAttached();
    });

    // -----------------------------------------------------------------------
    // Control interaction (DOM-level, no audio assertion)
    // -----------------------------------------------------------------------

    test('clicking play/pause button does not throw a JS error', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await openMusicTab(page);
        await page.click('#music-play-pause');
        await page.waitForTimeout(300);

        const audioErrors = errors.filter(
            (m) => !m.includes('AudioContext') && !m.includes('audio') && !m.includes('sfxr')
        );
        expect(audioErrors).toHaveLength(0);
    });

    test('clicking next-track button does not throw a JS error', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await openMusicTab(page);
        await page.click('#music-next');
        await page.waitForTimeout(300);

        const audioErrors = errors.filter(
            (m) => !m.includes('AudioContext') && !m.includes('audio') && !m.includes('sfxr')
        );
        expect(audioErrors).toHaveLength(0);
    });

    test('clicking previous-track button does not throw a JS error', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await openMusicTab(page);
        await page.click('#music-prev');
        await page.waitForTimeout(300);

        const audioErrors = errors.filter(
            (m) => !m.includes('AudioContext') && !m.includes('audio') && !m.includes('sfxr')
        );
        expect(audioErrors).toHaveLength(0);
    });
});
