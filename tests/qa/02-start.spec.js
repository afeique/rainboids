/**
 * QA-02: Game start and state transition
 *
 * Verifies that the game correctly transitions from TITLE_SCREEN to PLAYING
 * and that the initial playing state is properly set up.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getGameState, getPoolCounts, canvasHasContent } from '../helpers/game-helpers.js';

test.describe('QA-02: Game start and state transitions', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
    });

    test('game transitions to PLAYING state after startGame()', async ({ page }) => {
        await startGame(page);
        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });

    test('game starts when canvas is clicked (event-driven path)', async ({ page }) => {
        // Click the canvas — should trigger the startGame handler in main.js
        await page.click('#gameCanvas');

        // Give it time to process
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PLAYING',
            { timeout: 10_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });

    test('game starts when a key is pressed (event-driven path)', async ({ page }) => {
        await page.keyboard.press('Space');
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PLAYING',
            { timeout: 10_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });

    test('background stars are active after game starts', async ({ page }) => {
        await startGame(page);
        const counts = await getPoolCounts(page);
        expect(counts.backgroundStars).toBeGreaterThan(0);
    });

    test('color stars (collectibles) are active after game starts', async ({ page }) => {
        await startGame(page);
        const counts = await getPoolCounts(page);
        expect(counts.colorStars).toBeGreaterThan(0);
    });

    test('player has valid initial position', async ({ page }) => {
        await startGame(page);
        const info = await page.evaluate(() => {
            const ge = window.gameEngine;
            return { x: ge.player?.x, y: ge.player?.y };
        });
        expect(info.x).toBeGreaterThan(0);
        expect(info.y).toBeGreaterThan(0);
    });

    test('player is positioned within the game field', async ({ page }) => {
        await startGame(page);
        const info = await page.evaluate(() => {
            const ge = window.gameEngine;
            return {
                x:           ge.player?.x,
                y:           ge.player?.y,
                fieldWidth:  ge.gameField?.width,
                fieldHeight: ge.gameField?.height,
            };
        });
        expect(info.x).toBeGreaterThanOrEqual(0);
        expect(info.y).toBeGreaterThanOrEqual(0);
        expect(info.x).toBeLessThanOrEqual(info.fieldWidth);
        expect(info.y).toBeLessThanOrEqual(info.fieldHeight);
    });

    test('player has positive health at game start', async ({ page }) => {
        await startGame(page);
        const health = await page.evaluate(() => window.gameEngine?.player?.health);
        expect(health).toBeGreaterThan(0);
    });

    test('player starts with 3 lives', async ({ page }) => {
        await startGame(page);
        const lives = await page.evaluate(() => window.gameEngine?.game?.lives);
        expect(lives).toBe(3);
    });

    test('game money starts at zero', async ({ page }) => {
        await startGame(page);
        const money = await page.evaluate(() => window.gameEngine?.game?.money);
        expect(money).toBe(0);
    });

    test('canvas continues to render content during gameplay', async ({ page }) => {
        await startGame(page);
        await page.waitForTimeout(300);
        const hasContent = await canvasHasContent(page);
        expect(hasContent).toBe(true);
    });

    test('game re-initialises cleanly on second call to startGame()', async ({ page }) => {
        await startGame(page);
        // Simulate dying and restarting — just verify init() can be called again
        await page.evaluate(() => {
            window.gameEngine.game.state = 'TITLE_SCREEN';
        });
        await startGame(page);
        const state = await getGameState(page);
        expect(state).toBe('PLAYING');
    });
});
