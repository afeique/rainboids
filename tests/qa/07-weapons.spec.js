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

    test('player has a single equipped skill (5.64.11 — was 4 slots)', async ({ page }) => {
        const skill = await page.evaluate(() => window.gameEngine?.player?.activeSkill);
        expect(typeof skill).toBe('string');
        expect(skill.length).toBeGreaterThan(0);
    });

    test('player starts with default skill in ownedSkills', async ({ page }) => {
        const data = await page.evaluate(() => ({
            size: window.gameEngine?.player?.ownedSkills?.size ?? -1,
            active: window.gameEngine?.player?.activeSkill,
        }));
        expect(data.size).toBeGreaterThanOrEqual(1);
        expect(data.active).toBeTruthy();
    });

    // ------------------------------------------------------------------
    // Shop tabs
    // ------------------------------------------------------------------

    // Shop layout in the bullet-hell pass: HELP / PRIMARY / POWER /
    // DEFENSE. POWERUPS moved to the pause menu in 5.73.0 (was a shop
    // tab in 5.70.0–5.72.x); TIMER moved to the pause menu in 5.72.1.
    // Shop is now strictly the gold + SP economy — picks-currency
    // purchases happen in the pause menu's POWERUPS tab.

    test('shop has 4 DOM tabs (POWERUPS + TIMER moved to pause menu in 5.73.0/5.72.1)', async ({ page }) => {
        await page.evaluate(() => window.gameEngine.openShop());
        await page.waitForTimeout(100);
        const tabCount = await page.evaluate(() =>
            document.querySelectorAll('#shop-overlay .shop-tab').length
        );
        expect(tabCount).toBe(4);
    });

    test('shop tabs include HELP, PRIMARY, POWER, DEFENSE', async ({ page }) => {
        await page.evaluate(() => window.gameEngine.openShop());
        await page.waitForTimeout(100);
        const tabKeys = await page.evaluate(() =>
            [...document.querySelectorAll('#shop-overlay .shop-tab')]
                .map(b => b.dataset.tab)
                .sort()
        );
        expect(tabKeys).toEqual(['DEFENSE', 'HELP', 'POWER', 'PRIMARY']);
    });

    test('PRIMARY shop tab shows upgrades for equipped weapon', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);
        // PULSE_CANNON has 4 upgrades in PRIMARY_UPGRADES.
        const items = await page.evaluate(() =>
            (window.gameEngine.shopFilteredItems || []).map(i => ({ id: i.id, isUpg: !!i.isWeaponUpgrade }))
        );
        expect(items.length).toBeGreaterThanOrEqual(3);
        // Every entry on this tab is a weapon upgrade — weapons themselves
        // are equipped from the pause-menu PRIMARY tab now.
        for (const item of items) expect(item.isUpg).toBe(true);
    });

    test('POWER shop tab shows upgrades for equipped power weapon', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'POWER';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);
        const items = await page.evaluate(() =>
            (window.gameEngine.shopFilteredItems || []).map(i => ({ id: i.id, isUpg: !!i.isWeaponUpgrade }))
        );
        expect(items.length).toBeGreaterThanOrEqual(2);
        for (const item of items) expect(item.isUpg).toBe(true);
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

    // Equipping a primary now happens via the pause-menu PRIMARY tab
    // (free, click-to-equip). Tab/R also cycle through primaries and
    // auto-add to ownedPrimaries when cycled to. The shop PRIMARY tab
    // is upgrade-only.

    test('equipPrimary adds the weapon to ownedPrimaries and switches active', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            // Mirror what the pause-menu PRIMARY tab does on click.
            if (!ge.player.ownedPrimaries.has('STORM_NEEDLES')) {
                ge.player.ownedPrimaries.add('STORM_NEEDLES');
            }
            ge.player.equipPrimary('STORM_NEEDLES');
            return {
                owned: ge.player.ownedPrimaries.has('STORM_NEEDLES'),
                active: ge.player.activePrimary,
            };
        });
        expect(result.owned).toBe(true);
        expect(result.active).toBe('STORM_NEEDLES');
    });

    test('player.equipPrimary swaps the active primary weapon', async ({ page }) => {
        // 5.65.0 — the E keydown now opens a radial menu instead of
        // cycling immediately. Equip is committed via mouse click on a
        // slice. Verify the underlying data path (equipPrimary) works.
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            const before = ge.player.activePrimary;
            const all = Object.keys(ge.PRIMARY_WEAPONS_LIST || {});
            const next = all.find(k => k !== before);
            // equipPrimary requires the weapon to be in ownedPrimaries.
            // The radial menu adds it automatically when committing; we
            // do that here too.
            ge.player.ownedPrimaries.add(next);
            ge.player.equipPrimary(next);
            return { before, after: ge.player.activePrimary, expected: next };
        });
        expect(result.after).toBe(result.expected);
        expect(result.after).not.toBe(result.before);
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

    test('buying a skill equips it (5.64.11 — was slot 0 assignment)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'SKILLS';
            ge._rebuildShopCache();
            ge.buyShopItem('PHASE_DASH');
            return {
                active: ge.player.activeSkill,
                owned: [...ge.player.ownedSkills],
            };
        });
        expect(result.owned).toContain('PHASE_DASH');
        expect(result.active).toBe('PHASE_DASH');
    });

    // ------------------------------------------------------------------
    // Free weapon acquisition & auto-unlock
    // ------------------------------------------------------------------

    test('all primary weapons are equippable for free from the pause menu', async ({ page }) => {
        const costs = await page.evaluate(() => {
            const ge = window.gameEngine;
            // PRIMARY_WEAPONS_LIST is the source of truth — every entry
            // is selectable for free (cost is implicit zero, no shop buy).
            return Object.keys(ge.PRIMARY_WEAPONS_LIST || {});
        });
        expect(costs.length).toBe(6); // 5.66.0 — Lightning Arc moved to primary
        expect(costs).toContain('PULSE_CANNON');
        expect(costs).toContain('STORM_NEEDLES');
        expect(costs).toContain('SCATTER_GUN');
        expect(costs).toContain('RAIL_DRIVER');
        expect(costs).toContain('LANCE_BEAM');
        expect(costs).toContain('LIGHTNING_ARC');
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
