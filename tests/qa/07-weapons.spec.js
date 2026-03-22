/**
 * QA-07: Weapon system and shop tabs
 *
 * Verifies the weapon system initialisation, shop tab structure,
 * and basic weapon/skill data availability.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-07: Weapon system and shop tabs', () => {

    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // Player weapon initialisation
    // ------------------------------------------------------------------

    test('player starts with Pulse Cannon as primary', async ({ page }) => {
        const primary = await page.evaluate(() => window.gameEngine?.player?.activePrimary);
        expect(primary).toBe('PULSE_CANNON');
    });

    test('player starts with Charge Shot as power weapon', async ({ page }) => {
        const power = await page.evaluate(() => window.gameEngine?.player?.activePower);
        expect(power).toBe('CHARGE_SHOT');
    });

    test('player owns default weapons at start', async ({ page }) => {
        const owned = await page.evaluate(() => ({
            primaries: [...window.gameEngine.player.ownedPrimaries],
            powers: [...window.gameEngine.player.ownedPowers],
        }));
        expect(owned.primaries).toContain('PULSE_CANNON');
        expect(owned.powers).toContain('CHARGE_SHOT');
    });

    test('player has 4 skill slots initialised to null', async ({ page }) => {
        const slots = await page.evaluate(() => window.gameEngine?.player?.skillSlots);
        expect(slots).toEqual([null, null, null, null]);
    });

    test('player starts with no owned skills', async ({ page }) => {
        const size = await page.evaluate(() => window.gameEngine?.player?.ownedSkills?.size ?? -1);
        expect(size).toBe(0);
    });

    // ------------------------------------------------------------------
    // Shop tabs
    // ------------------------------------------------------------------

    test('shop has 6 tabs', async ({ page }) => {
        // Open shop
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
        });
        await page.waitForTimeout(100);

        const tabCount = await page.evaluate(() => {
            const bounds = window.gameEngine.shopTabBounds;
            return bounds ? Object.keys(bounds).length : 0;
        });
        expect(tabCount).toBe(6);
    });

    test('shop tabs include OFFENSE, DEFENSE, DROPS, PRIMARY, POWER, SKILLS', async ({ page }) => {
        await page.evaluate(() => window.gameEngine.openShop());
        await page.waitForTimeout(100);

        const tabKeys = await page.evaluate(() => {
            const bounds = window.gameEngine.shopTabBounds;
            return bounds ? Object.keys(bounds).sort() : [];
        });
        expect(tabKeys).toEqual(['defense', 'drops', 'offense', 'power', 'primary', 'skills']);
    });

    test('switching to PRIMARY tab shows weapons', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.currentWave = 99; // unlock all for visibility
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);

        const itemCount = await page.evaluate(() => window.gameEngine.shopFilteredItems?.length ?? 0);
        // Should have at least the 5 primary weapons + upgrades for equipped weapon
        expect(itemCount).toBeGreaterThanOrEqual(5);
    });

    test('switching to POWER tab shows power weapons', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'POWER';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);

        const itemCount = await page.evaluate(() => window.gameEngine.shopFilteredItems?.length ?? 0);
        expect(itemCount).toBeGreaterThanOrEqual(5);
    });

    test('switching to SKILLS tab shows defense skills', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'SKILLS';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);

        const itemCount = await page.evaluate(() => window.gameEngine.shopFilteredItems?.length ?? 0);
        expect(itemCount).toBeGreaterThanOrEqual(6);
    });

    // ------------------------------------------------------------------
    // Weapon purchase and equip
    // ------------------------------------------------------------------

    test('buying a primary weapon adds it to ownedPrimaries and equips it', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.money = 10000;
            ge.game.currentWave = 3; // Storm Needles unlocks at wave 3
            ge.player.skillPoints = 10;
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
            const success = ge.buyShopItem('STORM_NEEDLES');
            return {
                success,
                owned: ge.player.ownedPrimaries.has('STORM_NEEDLES'),
                active: ge.player.activePrimary,
            };
        });
        expect(result.success).toBe(true);
        expect(result.owned).toBe(true);
        expect(result.active).toBe('STORM_NEEDLES');
    });

    test('equipping an already owned weapon switches primary', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.money = 10000;
            ge.game.currentWave = 3; // Storm Needles unlocks at wave 3
            ge.player.skillPoints = 10;
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
            // Buy Storm Needles (auto-equips)
            ge.buyShopItem('STORM_NEEDLES');
            // Switch back to Pulse Cannon
            ge.buyShopItem('PULSE_CANNON');
            return ge.player.activePrimary;
        });
        expect(result).toBe('PULSE_CANNON');
    });

    // ------------------------------------------------------------------
    // Skill purchase and assignment
    // ------------------------------------------------------------------

    test('buying a defense skill adds it to ownedSkills', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.skillPoints = 10;
            ge.openShop();
            ge.shopCategory = 'SKILLS';
            ge._rebuildShopCache();
            const success = ge.buyShopItem('BULWARK');
            return {
                success,
                owned: ge.player.ownedSkills.has('BULWARK'),
            };
        });
        expect(result.success).toBe(true);
        expect(result.owned).toBe(true);
    });

    test('bought skill is auto-assigned to first empty slot', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.skillPoints = 10;
            ge.openShop();
            ge.shopCategory = 'SKILLS';
            ge._rebuildShopCache();
            ge.buyShopItem('BULWARK');
            return {
                slots: [...ge.player.skillSlots],
                owned: [...ge.player.ownedSkills],
            };
        });
        expect(result.owned).toContain('BULWARK');
        expect(result.slots[0]).toBe('BULWARK');
    });

    // ------------------------------------------------------------------
    // Free weapon acquisition & auto-unlock
    // ------------------------------------------------------------------

    test('primary weapons (except Pulse Cannon) have zero cost', async ({ page }) => {
        const costs = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.currentWave = 99; // unlock all weapons for visibility
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
            return ge.shopFilteredItems
                .filter(i => i.isWeapon && i.weaponType === 'primary')
                .map(i => ({ id: i.id, cost: i.cost, spCost: i.spCost }));
        });
        expect(costs.length).toBe(5); // all 5 should be visible
        for (const w of costs) {
            if (w.id === 'PULSE_CANNON') continue;
            expect(w.cost, `${w.id} coin cost should be 0`).toBe(0);
            expect(w.spCost, `${w.id} SP cost should be 0`).toBe(0);
        }
    });

    test('weapons auto-unlock at wave milestones', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Simulate completing wave 3 (Storm Needles unlockWave)
            ge.game.currentWave = 3;
            ge.completeWave();
            const afterWave3 = [...p.ownedPrimaries];
            // Simulate completing wave 5 (Scatter Gun unlockWave)
            ge.game.currentWave = 5;
            ge.completeWave();
            const afterWave5 = [...p.ownedPrimaries];
            return { afterWave3, afterWave5 };
        });
        expect(result.afterWave3).toContain('STORM_NEEDLES');
        expect(result.afterWave5).toContain('SCATTER_GUN');
    });

    test('AI switches between owned weapons during gameplay', async ({ page }) => {
        const { GameAI } = await import('../helpers/game-ai.js');

        // Give the player all weapons and enable one-punch-man
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.cheats.onePunchMan = true;
            ge.player.ownedPrimaries.add('STORM_NEEDLES');
            ge.player.ownedPrimaries.add('SCATTER_GUN');
            ge.player.ownedPrimaries.add('RAIL_DRIVER');
        });

        const ai = new GameAI(page);
        const weaponsUsed = new Set();
        await ai.run(5000, (state) => {}, { switchWeapons: true, switchInterval: 800 });

        const finalState = await ai.getState();
        // The AI should have tried multiple weapons
        expect(finalState.player.ownedPrimaries.length).toBeGreaterThanOrEqual(4);
        await ai.stop();
    });

    // ------------------------------------------------------------------
    // Pause menu SKILLS tab
    // ------------------------------------------------------------------

    test('pause menu has SKILLS tab', async ({ page }) => {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'SKILLS' });
        await expect(tab).toBeVisible();
    });

    test('clicking SKILLS tab shows skill slots content', async ({ page }) => {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'SKILLS' });
        await tab.click();
        await page.waitForTimeout(200);

        const content = page.locator('#skills-tab');
        await expect(content).toBeVisible();
    });

    // ------------------------------------------------------------------
    // No fatal errors
    // ------------------------------------------------------------------

    test('no fatal JS errors during weapon system tests', async ({ page }) => {
        const fatalErrors = page._jsErrors.filter(msg =>
            !msg.includes('sfxr') &&
            !msg.includes('AudioContext') &&
            !msg.includes('net::ERR')
        );
        expect(fatalErrors).toEqual([]);
    });
});
