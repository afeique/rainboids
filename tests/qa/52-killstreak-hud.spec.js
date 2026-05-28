/**
 * QA-52: kill-streak HUD threshold (8.14.0).
 *
 * The streak HUD only appears once the streak reaches 10 kills (on both desktop
 * and mobile), shows the rank label large with the kill count small beneath, and
 * lives in the top-right on desktop. The render is canvas-only, so this pins the
 * one queryable contract: the `_streakDrawn` marker is null below 10 kills and
 * equals the kill count at/above 10.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-52: kill-streak HUD', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        await startGame(page);
    });

    test('the streak HUD is hidden below 10 kills and shows at 10+', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const draw = () => { try { ge.drawStreakIndicator(); } catch (e) { return String(e); } return null; };
            ge.killStreakCount = 0;  const err0 = draw();  const at0 = ge._streakDrawn;
            ge.killStreakCount = 9;  draw();               const at9 = ge._streakDrawn;
            ge.killStreakCount = 10; draw();               const at10 = ge._streakDrawn;
            ge.killStreakCount = 37; draw();               const at37 = ge._streakDrawn;
            return { err0, at0, at9, at10, at37 };
        });
        expect(r.err0).toBeNull();
        expect(r.at0).toBeNull();   // 0 kills → hidden
        expect(r.at9).toBeNull();   // 9 kills → still hidden (threshold is 10)
        expect(r.at10).toBe(10);    // 10 kills → shows
        expect(r.at37).toBe(37);    // higher streaks show the live count
        const fatal = page._jsErrors.filter((m) => !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver/i.test(m));
        expect(fatal).toEqual([]);
    });
});
