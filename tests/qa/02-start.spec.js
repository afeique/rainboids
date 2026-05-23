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

    test('game starts when the NEW GAME button is clicked (event-driven path)', async ({ page }) => {
        // The title buttons are canvas-drawn; main.js hit-tests
        // `_titleButtonRects` on click and only launches on a button hit
        // (clicking empty canvas does nothing). Click the NEW GAME rect,
        // converting its canvas-pixel coords to client coords the same way
        // main.js's hitId() inverts them.
        await page.waitForFunction(
            () => window.gameEngine?._titleButtonRects?.newGame,
            { timeout: 10_000 }
        );
        const pos = await page.evaluate(() => {
            const ge = window.gameEngine;
            const r = ge._titleButtonRects.newGame;
            const c = ge.canvas;
            const cb = c.getBoundingClientRect();
            return {
                x: cb.left + (r.x + r.w / 2) * (cb.width / c.width),
                y: cb.top + (r.y + r.h / 2) * (cb.height / c.height),
            };
        });
        await page.mouse.click(pos.x, pos.y);

        // Phase R2/W0 — NEW GAME opens the pre-run BUILD screen (the bubble
        // tree in BUILD mode), not the run directly. START RUN there begins
        // the run.
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'ARMORY',
            { timeout: 10_000 }
        );
        const r = await page.evaluate(() => ({
            state: window.gameEngine.game.state,
            display: (document.getElementById('shop-overlay') || {}).style?.display,
        }));
        expect(r.state).toBe('ARMORY');
        expect(r.display).toBe('flex');
    });

    test('a title keypress opens the pre-run BUILD screen (event-driven path)', async ({ page }) => {
        await page.keyboard.press('Space');
        // A title keypress launches NEW GAME → the BUILD screen (Phase R2/W0).
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'ARMORY',
            { timeout: 10_000 }
        );
        const state = await getGameState(page);
        expect(state).toBe('ARMORY');
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

    test('player starts with 3 energy tanks (5.88.0)', async ({ page }) => {
        await startGame(page);
        const tanks = await page.evaluate(() => window.gameEngine?.healthTanks);
        expect(tanks).toBe(3);
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
