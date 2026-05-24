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
            const opp = rows.find((row) => row.textContent.includes('Opportunist'));
            opp.click(); // equip into slot 0
            return {
                rowCount: rows.length,
                equipped0: ge.player.equippedPassives[0],
                active: [...ge.player.activePassives],
            };
        });
        expect(r.rowCount).toBe(3);            // all 3 owned, slot-deliverable
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

    test('the keystone budget (2) is enforced from the swap panel', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: [] });
            ge.player.setPassiveSlotsUnlocked(3);
            // 3 slot-only keystones owned.
            ge.player.setOwnedPassives(['GLASS_CANNON', 'PURIST', 'PRISMATIC_SOUL']);
            ge.player.equipPassive(0, 'GLASS_CANNON');
            ge.player.equipPassive(1, 'PURIST');
            ge.uiManager.updatePassivesTab();
            const row = [...document.querySelectorAll('#passives-tab .pause-equip-row')]
                .find((r2) => r2.textContent.includes('Prismatic Soul'));
            row.click(); // 3rd keystone — should be rejected by the budget
            return { active: [...ge.player.activePassives] };
        });
        expect(r.active).not.toContain('PRISMATIC_SOUL');
        expect(r.active.length).toBe(2);
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
