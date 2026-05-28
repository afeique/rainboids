/**
 * QA-49: Abilities are gold-gated (not free under the looter pivot).
 *
 * The 8.x looter pivot unlocks gear/weapons/powers from the start (power is
 * looted, not bought), but ABILITIES stay an account-gold sink: a fresh account
 * owns NONE and buys them in the BUILD ABILITIES tab's "Unlock more" store.
 * This spec asserts a clean account shows zero owned abilities + a populated
 * unlock store, and that buying one with gold makes it an owned equip row.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-49: abilities gold-gated', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('a fresh account owns no abilities and sees a gold-unlock store', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const cluster = document.getElementById('shop-tree-abilities');
            const owned = cluster
                ? [...cluster.querySelectorAll('.shop-prerun-pick:not(.shop-prerun-pick--locked)')].map((n) => n.dataset.id)
                : [];
            const lockedBuys = cluster
                ? cluster.querySelectorAll('.shop-prerun-pick--locked').length
                : 0;
            return { ownedCount: owned.length, lockedBuys };
        });
        // Nothing free at start, and the store offers locked abilities to buy.
        expect(r.ownedCount).toBe(0);
        expect(r.lockedBuys).toBeGreaterThan(0);
    });

    test('buying an ability with gold makes it an owned equip row', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.accountGold = 999999;
            const bought = ge.unlockPreRunItem('abilities', 'BLINK');
            ge.openArmory();
            const cluster = document.getElementById('shop-tree-abilities');
            const owned = cluster
                ? [...cluster.querySelectorAll('.shop-prerun-pick:not(.shop-prerun-pick--locked)')].map((n) => n.dataset.id)
                : [];
            return { bought, owned };
        });
        expect(r.bought).toBe(true);
        expect(r.owned).toContain('BLINK');
    });

    test('no fatal JS errors through the gated ABILITIES flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.accountGold = 999999;
            ge.openArmory();
            ge.unlockPreRunItem('abilities', 'BLINK');
            ge.openArmory();
        });
        const fatal = page._jsErrors.filter((m) =>
            !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver/i.test(m));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toEqual([]);
    });
});
