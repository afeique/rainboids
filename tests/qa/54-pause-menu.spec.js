/**
 * QA-54: pause-menu declutter (8.25.0)
 *
 * The LOADOUT tab is gone (weapons are equipped via the INVENTORY overlay), and
 * the pause menu gained an INVENTORY button that opens that overlay (same screen
 * as the 'I' key). Opening the inventory pauses the game.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-54: pause-menu declutter', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('the LOADOUT tab is gone; an INVENTORY tab is present', async ({ page }) => {
        const r = await page.evaluate(() => ({
            loadout: !!document.querySelector('.pause-tab[data-tab="loadout"]'),
            inventory: !!document.querySelector('.pause-tab[data-tab="inventory"]'),
        }));
        expect(r.loadout).toBe(false);
        expect(r.inventory).toBe(true);
    });

    test('clicking the INVENTORY pause button opens the inventory overlay', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.togglePause(); // open the pause menu
            document.querySelector('.pause-tab[data-tab="inventory"]').click();
            const inv = document.getElementById('inventory-overlay');
            return { display: inv && inv.style.display, open: ge.isInventoryScreenOpen && ge.isInventoryScreenOpen() };
        });
        expect(r.display).toBe('flex');
        expect(r.open).toBe(true);
    });

    test('no fatal JS errors opening the inventory from the pause menu', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.togglePause();
            document.querySelector('.pause-tab[data-tab="inventory"]').click();
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
