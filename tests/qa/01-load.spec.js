/**
 * QA-01: Page load and initialisation
 *
 * Verifies that the game page loads cleanly, the canvas is present,
 * and the game engine initialises to its expected initial state before any
 * user interaction.
 */

import { test, expect } from '@playwright/test';
import { loadGame, getGameState, canvasHasContent } from '../helpers/game-helpers.js';

test.describe('QA-01: Game load and initialisation', () => {

    test.beforeEach(async ({ page }) => {
        // Collect JS errors during the test
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
    });

    test('page loads without fatal JS errors', async ({ page }) => {
        // Audio errors and external library timeouts are expected in headless;
        // anything else is a real bug.
        const fatalErrors = page._jsErrors.filter(msg =>
            !msg.includes('sfxr') &&
            !msg.includes('AudioContext') &&
            !msg.includes('audio') &&
            !msg.includes('Audio') &&
            !msg.includes('Font') &&
            !msg.includes('net::ERR') // external CDN failures are acceptable
        );
        expect(fatalErrors, `Fatal JS errors: ${fatalErrors.join('; ')}`).toHaveLength(0);
    });

    test('canvas element exists and is visible', async ({ page }) => {
        const canvas = page.locator('#gameCanvas');
        await expect(canvas).toBeVisible();
    });

    test('canvas has non-zero dimensions', async ({ page }) => {
        const dims = await page.evaluate(() => {
            const c = document.getElementById('gameCanvas');
            return { width: c?.width ?? 0, height: c?.height ?? 0 };
        });
        expect(dims.width).toBeGreaterThan(0);
        expect(dims.height).toBeGreaterThan(0);
    });

    test('window.gameEngine is defined', async ({ page }) => {
        const exists = await page.evaluate(() => typeof window.gameEngine !== 'undefined');
        expect(exists).toBe(true);
    });

    test('window.game is defined (alias for gameEngine)', async ({ page }) => {
        const exists = await page.evaluate(() => typeof window.game !== 'undefined');
        expect(exists).toBe(true);
    });

    test('initial game state is TITLE_SCREEN', async ({ page }) => {
        const state = await getGameState(page);
        expect(state).toBe('TITLE_SCREEN');
    });

    test('game field dimensions are set', async ({ page }) => {
        const field = await page.evaluate(() => {
            const ge = window.gameEngine;
            return { width: ge?.gameField?.width, height: ge?.gameField?.height };
        });
        expect(field.width).toBeGreaterThan(0);
        expect(field.height).toBeGreaterThan(0);
    });

    test('all entity pools are initialised', async ({ page }) => {
        const pools = await page.evaluate(() => {
            const ge = window.gameEngine;
            return {
                particlePool:       typeof ge?.particlePool,
                bulletPool:         typeof ge?.bulletPool,
                asteroidPool:       typeof ge?.asteroidPool,
                enemyPool:          typeof ge?.enemyPool,
                enemyBulletPool:    typeof ge?.enemyBulletPool,
                colorStarPool:      typeof ge?.colorStarPool,
                backgroundStarPool: typeof ge?.backgroundStarPool,
                lineDebrisPool:     typeof ge?.lineDebrisPool,
                powerupPool:        typeof ge?.powerupPool,
            };
        });
        for (const [name, type] of Object.entries(pools)) {
            expect(type, `${name} should be an object`).toBe('object');
        }
    });

    test('player object is initialised', async ({ page }) => {
        const player = await page.evaluate(() => {
            const ge = window.gameEngine;
            return { exists: typeof ge?.player !== 'undefined' };
        });
        expect(player.exists).toBe(true);
    });

    test('HUD pause button is attached to DOM', async ({ page }) => {
        // The button may be hidden before the game starts (CSS-driven),
        // but it must exist in the DOM.
        const btn = page.locator('#hud-pause-btn');
        await expect(btn).toBeAttached();
    });

    test('lives display is present in DOM', async ({ page }) => {
        const lives = page.locator('#lives-display');
        await expect(lives).toBeAttached();
    });

    test('game renders something on the canvas', async ({ page }) => {
        // Wait a couple of frames for the title screen to render
        await page.waitForTimeout(500);
        const hasContent = await canvasHasContent(page);
        expect(hasContent).toBe(true);
    });
});
