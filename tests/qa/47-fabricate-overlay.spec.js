/**
 * QA-47: FABRICATE is its own overlay.
 *
 * The fabricate controls (craft gear/weapons for R$) moved OUT of the pre-run
 * GEAR tab into a standalone `#fabricate-overlay`. The GEAR tab now shows an
 * "OPEN FABRICATOR" button; this spec opens BUILD → GEAR, opens the fabricator,
 * asserts the overlay shows with its controls, and closes it — with no page
 * errors through the round-trip.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

function fatalErrors(errors) {
    return errors.filter((m) =>
        !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver|Failed to load resource/i.test(m));
}

test.describe('QA-47: FABRICATE overlay', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('GEAR tab opens a standalone Fabricate overlay with controls; closes clean', async ({ page }) => {
        // Open BUILD → GEAR tab.
        await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.querySelector('#shop-tree-tabs .shop-tree-tab[data-tab="gear"]')?.click();
        });

        // The GEAR tab shows an "OPEN FABRICATOR" button (no inline fabricate rows).
        const openBtn = page.locator('.armory-fab-open');
        await expect(openBtn).toBeVisible();

        // Opening it shows the standalone overlay with its craft controls.
        await openBtn.click();
        const state = await page.evaluate(() => {
            const ov = document.getElementById('fabricate-overlay');
            const body = document.getElementById('fabricate-body');
            return {
                shown: ov && getComputedStyle(ov).display === 'flex',
                bodyRows: body ? body.querySelectorAll('.armory-row').length : 0,
                hasGearBtn: !!(body && [...body.querySelectorAll('button')].find((b) => /FABRICATE GEAR/i.test(b.textContent))),
                hasWeaponBtn: !!(body && [...body.querySelectorAll('button')].find((b) => /FABRICATE WEAPON/i.test(b.textContent))),
            };
        });
        expect(state.shown).toBe(true);
        expect(state.bodyRows).toBeGreaterThanOrEqual(3); // rarity + gear + weapon rows
        expect(state.hasGearBtn).toBe(true);
        expect(state.hasWeaponBtn).toBe(true);

        // Close via the × button.
        await page.locator('#fabricate-close').click();
        const closed = await page.evaluate(() =>
            getComputedStyle(document.getElementById('fabricate-overlay')).display === 'none');
        expect(closed).toBe(true);

        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });
});
