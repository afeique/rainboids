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

    test('the panel lists owned passives and click equips into a free slot', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.setOwnedPassives(['OPPORTUNIST', 'LAST_BASTION', 'GLASS_CANNON']);
            ge.uiManager.updatePassivesTab();
            const rows = [...document.querySelectorAll('#passives-tab .pause-equip-row')];
            // 8.22.0 — each row carries a circular icon bubble.
            const iconCount = document.querySelectorAll('#passives-tab .pause-equip-icon svg, #passives-tab .pause-equip-icon .icon-fallback').length;
            const names = rows.map((row) => row.textContent).join(' ');
            const opp = rows.find((row) => row.textContent.includes('Opportunist'));
            opp.click(); // equip into slot 0
            return {
                rowCount: rows.length,
                iconCount,
                names,
                equipped0: ge.player.equippedPassives[0],
                active: [...ge.player.activePassives],
            };
        });
        // 8.24.0 — only MODULAR passives here; the keystone GLASS_CANNON is on
        // the dedicated Keystone Traits screen, not this tab.
        expect(r.rowCount).toBe(2);            // OPPORTUNIST + LAST_BASTION (modular)
        expect(r.iconCount).toBe(2);           // a circle icon per row (8.22.0)
        expect(r.names).not.toContain('Glass'); // GLASS_CANNON filtered out
        expect(r.equipped0).toBe('OPPORTUNIST');
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
            return { names: rows.map((r2) => r2.textContent).join(' '), count: rows.length };
        });
        expect(r.count).toBe(1);                 // only OPPORTUNIST (modular)
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
