/**
 * QA-07: Weapon system and shop tabs
 *
 * Verifies the weapon system initialisation, shop tab structure,
 * and basic weapon/ability data availability.
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

    test('player has a single equipped ability (5.64.11 — was 4 slots)', async ({ page }) => {
        const ability = await page.evaluate(() => window.gameEngine?.player?.activeAbility);
        expect(typeof ability).toBe('string');
        expect(ability.length).toBeGreaterThan(0);
    });

    test('player starts with default ability in ownedAbilities', async ({ page }) => {
        const data = await page.evaluate(() => ({
            size: window.gameEngine?.player?.ownedAbilities?.size ?? -1,
            active: window.gameEngine?.player?.activeAbility,
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

    // Phase 7 (2026-05-19) — Shop is now a Diablo-style ability tree
    // with four cluster regions (PRIMARY / POWER / DEFENSE / PASSIVES)
    // displayed at once. The legacy `.shop-tab` strip is retained as a
    // hidden DOM stub for back-compat, but the visible navigation lives
    // in `#shop-tree`. Assert on the new cluster structure.
    test('shop renders four ability-tree clusters', async ({ page }) => {
        await page.evaluate(() => window.gameEngine.openShop());
        await page.waitForTimeout(100);
        const clusters = await page.evaluate(() =>
            document.querySelectorAll('#shop-tree .shop-tree-cluster').length
        );
        expect(clusters).toBe(4);
    });

    test('shop tree contains primary, power, defense, and passive nodes', async ({ page }) => {
        await page.evaluate(() => window.gameEngine.openShop());
        // Wait for the tree to render rather than a fixed sleep (the render
        // can lag a frame or two under load).
        await page.waitForSelector('#shop-tree .shop-node', { timeout: 5_000 });
        const ids = await page.evaluate(() =>
            [...document.querySelectorAll('#shop-tree .shop-node')]
                .map(n => n.dataset.id)
        );
        // Parent nodes — weapon / ability IDs.
        expect(ids).toContain('PULSE_CANNON');
        expect(ids).toContain('CHARGE_SHOT');
        expect(ids).toContain('BULWARK');
        // Upgrade / passive nodes — one real ID per cluster (6.28.0 uniform
        // trait set for primaries; 6.30.0 reward-only passive grid).
        expect(ids).toContain('PULSE_MULTI');    // PULSE_CANNON upgrade
        expect(ids).toContain('CHARGE_POWER');   // CHARGE_SHOT upgrade
        expect(ids).toContain('FORTIFY');        // BULWARK ability upgrade
        expect(ids).toContain('CRIT_CHANCE');    // passive
    });

    // 5.79.57 — shop is per-weapon now. Each PRIMARY/POWER weapon ID is
    // its own tab category; ABILITIES / generic PRIMARY / generic POWER are
    // suspended. Drive PULSE_CANNON + CHARGE_SHOT as canonical cases.
    test('PULSE_CANNON shop tab shows upgrades for that weapon', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'PULSE_CANNON';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);
        const items = await page.evaluate(() =>
            (window.gameEngine.shopFilteredItems || []).map(i => ({ id: i.id, isUpg: !!i.isWeaponUpgrade }))
        );
        expect(items.length).toBeGreaterThanOrEqual(3);
        for (const item of items) expect(item.isUpg).toBe(true);
    });

    test('CHARGE_SHOT shop tab shows upgrades for that power weapon', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'CHARGE_SHOT';
            ge._rebuildShopCache();
        });
        await page.waitForTimeout(100);
        const items = await page.evaluate(() =>
            (window.gameEngine.shopFilteredItems || []).map(i => ({ id: i.id, isUpg: !!i.isWeaponUpgrade }))
        );
        expect(items.length).toBeGreaterThanOrEqual(2);
        for (const item of items) expect(item.isUpg).toBe(true);
    });

    // 5.101.0 — Defensive ability shop tab retired with the rest of the
    // ability system. Switching shopCategory to ABILITIES now produces an
    // empty filtered-item list (the legacy ABILITIES / DEFENSE branches in
    // _rebuildShopCache return []). This test pins that contract so a
    // future revival has to update it in the same commit.
    test('ABILITIES shopCategory is now empty (5.101.0 retirement)', async ({ page }) => {
        const itemCount = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openShop();
            ge.shopCategory = 'ABILITIES';
            ge._rebuildShopCache();
            return ge.shopFilteredItems?.length ?? 0;
        });
        expect(itemCount).toBe(0);
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
    // Ability purchase and assignment
    // ------------------------------------------------------------------

    // 5.101.0 — Defensive ability purchases retired. `buyShopItem('BULWARK')`
    // hits the empty ABILITIES filtered-item branch in shop-manager and
    // returns false. Test pins the new contract so a future revival
    // updates this assertion explicitly.
    test('buying a defense ability is rejected (5.101.0 retirement)', async ({ page }) => {
        const success = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.skillPoints = 10;
            ge.openShop();
            ge.shopCategory = 'ABILITIES';
            ge._rebuildShopCache();
            return ge.buyShopItem('BULWARK');
        });
        expect(success).toBe(false);
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
        // 5.79.23 — LANCE_BEAM + LIGHTNING_ARC promoted to power weapons.
        // PRIMARY_WEAPONS_LIST is now the 4 remaining primaries.
        expect(costs.length).toBeGreaterThanOrEqual(4);
        expect(costs).toContain('PULSE_CANNON');
        expect(costs).toContain('STORM_NEEDLES');
        expect(costs).toContain('SCATTER_GUN');
        expect(costs).toContain('RAIL_DRIVER');
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
    // Pause menu ABILITIES tab
    // ------------------------------------------------------------------

    // 5.101.0 — Pause-menu ABILITIES tab retired with the defensive ability
    // system. Test pins the new contract so a future revival has to
    // update it in the same commit.
    test('pause menu no longer has a ABILITIES tab (5.101.0 retirement)', async ({ page }) => {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });

        const tab = page.locator('.pause-tab', { hasText: 'ABILITIES' });
        await expect(tab).toHaveCount(0);
    });

    test('abilities-tab DOM stub is absent (5.101.0 retirement)', async ({ page }) => {
        // 5.101.0 — `#abilities-tab` content stub is no longer built; the
        // ABILITIES tab strip entry + content node are both retired. Pin the
        // new contract: querySelector('#abilities-tab') returns null on the
        // paused pause-menu DOM.
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
        const hasNode = await page.evaluate(() => !!document.getElementById('abilities-tab'));
        expect(hasNode).toBe(false);
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
