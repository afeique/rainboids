/**
 * QA-53: in-run KEYSTONE TRAITS screen (8.24.0)
 *
 * Build-defining keystones live on their own pause-menu KEYSTONES tab (renamed
 * "Keystone Traits"). They no longer sit in the PASSIVES tab. The player earns
 * a keystone PICK at level 10 and level 20; a pick is spent by clicking a
 * keystone on this screen (owns + auto-equips it, budget 2).
 */
import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-53: in-run KEYSTONE TRAITS', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the pause menu has a KEYSTONES tab + content stub', async ({ page }) => {
        const r = await page.evaluate(() => ({
            tab: !!document.querySelector('.pause-tab[data-tab="keystones"]'),
            content: !!document.getElementById('keystones-tab'),
        }));
        expect(r.tab).toBe(true);
        expect(r.content).toBe(true);
    });

    test('the screen lists the keystone catalog as gold circle-icon rows', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'] });
            ge.uiManager.updateKeystoneTab();
            const rows = [...document.querySelectorAll('#keystones-tab .pause-equip-row')];
            const icons = document.querySelectorAll('#keystones-tab .pause-equip-icon--keystone').length;
            return { rowCount: rows.length, icons };
        });
        expect(r.rowCount).toBeGreaterThan(3);   // a catalog of keystones
        expect(r.icons).toBe(r.rowCount);        // every row has a (gold) keystone icon
    });

    test('without a pick, unowned keystones are locked (click is a no-op)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'] }); // L1, 0 picks
            ge.uiManager.updateKeystoneTab();
            const ownedBefore = ge.player.ownedPassives.size;
            const locked = document.querySelectorAll('#keystones-tab .pause-equip-row--locked').length;
            const row = document.querySelector('#keystones-tab .pause-equip-row');
            row.click(); // no pick banked → nothing happens
            return { locked, ownedBefore, ownedAfter: ge.player.ownedPassives.size, picks: ge.player.keystonePicksAvailable };
        });
        expect(r.picks).toBe(0);
        expect(r.locked).toBeGreaterThan(0);     // unowned keystones render locked
        expect(r.ownedAfter).toBe(r.ownedBefore); // click claimed nothing
    });

    test('leveling banks keystone picks; clicking a PICK row claims + equips one', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'] });
            ge.player.addXp(100000); // level past L10/L20 → keystone picks banked
            const picksBefore = ge.player.keystonePicksAvailable;
            ge.uiManager.updateKeystoneTab();
            const pickRow = [...document.querySelectorAll('#keystones-tab .pause-equip-row')]
                .find((row) => row.querySelector('.pause-equip-status')
                    && row.querySelector('.pause-equip-status').textContent.includes('PICK'));
            const ownedKeystonesBefore = ge.player.equippedPassives.filter((id) => id
                && ge.player.hasPassive && ge.player.hasPassive(id)).length;
            pickRow.click(); // claim it
            return {
                picksBefore,
                picksAfter: ge.player.keystonePicksAvailable,
                equippedAny: ge.player.equippedPassives.some(Boolean),
            };
        });
        expect(r.picksBefore).toBeGreaterThanOrEqual(1);
        expect(r.picksAfter).toBe(r.picksBefore - 1); // a pick was spent
        expect(r.equippedAny).toBe(true);
    });

    test('no fatal JS errors through the keystone flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'] });
            ge.player.addXp(100000);
            ge.uiManager.updateKeystoneTab();
            const rows = [...document.querySelectorAll('#keystones-tab .pause-equip-row')];
            rows.forEach((r2) => r2.click());
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
