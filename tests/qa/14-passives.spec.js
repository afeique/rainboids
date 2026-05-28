/**
 * QA-14: in-run PASSIVES swap panel (Phase P5b)
 *
 * The pause menu gains a PASSIVES tab — assign any owned, slot-deliverable
 * passive into any unlocked slot, and unequip, mid-run (free swap). Verifies
 * the panel renders the run's owned pool and that clicking equips/unequips
 * through player.equipPassive (which enforces the keystone budget).
 */
import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-14: in-run PASSIVES swap (Phase P5b)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the pause menu has a PASSIVES tab + content stub', async ({ page }) => {
        const r = await page.evaluate(() => ({
            tab: !!document.querySelector('.pause-tab[data-tab="passives"]'),
            content: !!document.getElementById('passives-tab'),
        }));
        expect(r.tab).toBe(true);
        expect(r.content).toBe(true);
    });

    test('the panel shows the full modular catalog — owned are lit + equippable, unowned grayed', async ({ page }) => {
        // 8.25.0 — catalog style (like KEYSTONES): the FULL modular-passive list
        // renders, with owned ones lit/equippable and unowned ones grayed.
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.setOwnedPassives(['OPPORTUNIST', 'LAST_BASTION']);
            ge.uiManager.updatePassivesTab();
            const rows = [...document.querySelectorAll('#passives-tab .pause-equip-row')];
            const iconCount = document.querySelectorAll('#passives-tab .pause-equip-icon svg, #passives-tab .pause-equip-icon .icon-fallback').length;
            const lockedCount = document.querySelectorAll('#passives-tab .pause-equip-row--locked').length;
            const opp = rows.find((row) => row.textContent.includes('Opportunist'));
            const oppLocked = opp.classList.contains('pause-equip-row--locked');
            opp.click(); // equip the owned one
            return {
                rowCount: rows.length, iconCount, lockedCount, oppLocked,
                equipped0: ge.player.equippedPassives[0],
                active: [...ge.player.activePassives],
            };
        });
        expect(r.rowCount).toBeGreaterThan(2);   // full catalog, not owned-only
        expect(r.iconCount).toBe(r.rowCount);    // a circle icon per row
        expect(r.lockedCount).toBeGreaterThan(0); // unowned modulars are grayed
        expect(r.oppLocked).toBe(false);          // owned = lit
        expect(r.equipped0).toBe('OPPORTUNIST');  // owned row equips on click
        expect(r.active).toContain('OPPORTUNIST');
    });

    test('clicking an equipped passive unequips it', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.setOwnedPassives(['OPPORTUNIST']);
            ge.player.equipPassive(0, 'OPPORTUNIST');
            ge.uiManager.updatePassivesTab();
            const row = [...document.querySelectorAll('#passives-tab .pause-equip-row')]
                .find((r2) => r2.textContent.includes('Opportunist'));
            row.click(); // toggle off
            return { equipped0: ge.player.equippedPassives[0], active: [...ge.player.activePassives] };
        });
        expect(r.equipped0).toBeNull();
        expect(r.active).not.toContain('OPPORTUNIST');
    });

    test('keystones do NOT appear in the PASSIVES tab (they have their own screen)', async ({ page }) => {
        // 8.24.0 — keystone TRAITS moved to the dedicated Keystone Traits screen;
        // the PASSIVES tab lists only modular passives.
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(3);
            ge.player.setOwnedPassives(['OPPORTUNIST', 'GLASS_CANNON', 'PURIST']);
            ge.uiManager.updatePassivesTab();
            const rows = [...document.querySelectorAll('#passives-tab .pause-equip-row')];
            return { names: rows.map((r2) => r2.textContent).join(' ') };
        });
        // The catalog lists modular passives only — keystones live on their own
        // screen and never appear here (owned or not).
        expect(r.names).toContain('Opportunist');
        expect(r.names).not.toContain('Glass');  // GLASS_CANNON keystone excluded
        expect(r.names).not.toContain('Purist'); // PURIST keystone excluded
    });

    test('no fatal JS errors through the passives swap flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.setOwnedPassives(['OPPORTUNIST', 'LAST_BASTION']);
            ge.uiManager.updatePassivesTab();
            const rows = [...document.querySelectorAll('#passives-tab .pause-equip-row')];
            rows.forEach((r2) => r2.click());
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
