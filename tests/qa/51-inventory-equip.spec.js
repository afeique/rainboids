/**
 * QA-51: the inventory management system equips gear (mid-run, live).
 *
 * 8.13.0 — the inventory overlay is a full equip manager: tap a stash item to
 * equip it (primary weapon, power weapon, or a gear slot); tap an equipped piece
 * to unequip it. It works MID-RUN, applying to the live player immediately (gear
 * is no longer locked once a run starts), and is reachable from the BUILD GEAR
 * tab's "Open Inventory" button as well as the 'I' key.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const HULL = { slot: 'hull', level: 5, name: 'Test Hull', rarityColor: '#ffae3a', affixes: [{ type: 'hp', value: 30, label: '+30 HP' }] };
const RAIL = { kind: 'weapon', slot: 'weapon', archetype: 'RAIL', name: 'Test Rail', level: 5, rarity: 'rare', traits: [] };

function fatalErrors(errs) {
    return errs.filter((m) => !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver/i.test(m));
}

test.describe('QA-51: inventory equip (mid-run, live)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        await startGame(page);
    });

    test('equipping a stash gear item mid-run applies live + persists + leaves the stash', async ({ page }) => {
        await page.evaluate((hull) => {
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                stash: [hull], equippedItems: {}, equippedWeapon: null, equippedPowerWeapon: null,
            }));
            window.gameEngine.toggleInventoryScreen();
        }, HULL);

        // The stash card shows an EQUIP button; click it.
        const equipBtn = page.locator('#inventory-body .inv-stash-grid .inv-act-btn');
        await expect(equipBtn.first()).toBeVisible();
        await equipBtn.first().click();

        const r = await page.evaluate(() => {
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            const p = window.gameEngine.player;
            return {
                playerHull: p.equippedItems && p.equippedItems.hull ? p.equippedItems.hull.name : null,
                metaHull: meta.equippedItems && meta.equippedItems.hull ? meta.equippedItems.hull.name : null,
                stashLen: Array.isArray(meta.stash) ? meta.stash.length : -1,
            };
        });
        expect(r.playerHull).toBe('Test Hull'); // applied to the LIVE player
        expect(r.metaHull).toBe('Test Hull');   // persisted to meta
        expect(r.stashLen).toBe(0);             // moved out of the stash
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    test('equipping a stash weapon mid-run swaps the live primary', async ({ page }) => {
        await page.evaluate((rail) => {
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                stash: [rail], equippedItems: {}, equippedWeapon: null, equippedPowerWeapon: null,
            }));
            window.gameEngine.toggleInventoryScreen();
        }, RAIL);

        await page.locator('#inventory-body .inv-stash-grid .inv-act-btn').first().click();

        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return {
                activePrimary: p.activePrimary,
                metaWeapon: meta.equippedWeapon ? meta.equippedWeapon.name : null,
            };
        });
        expect(r.activePrimary).toBe('RAIL_DRIVER'); // RAIL archetype → its firing pattern, live
        expect(r.metaWeapon).toBe('Test Rail');
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    test('unequipping a gear slot returns it to the stash', async ({ page }) => {
        await page.evaluate((hull) => {
            // Start with the hull already equipped — on the LIVE player (the
            // mid-run source of truth the overlay renders from) AND in meta.
            const ge = window.gameEngine;
            if (ge.player && ge.player.equippedItems) ge.player.equippedItems.hull = hull;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                stash: [], equippedItems: { hull }, equippedWeapon: null, equippedPowerWeapon: null,
            }));
            ge.toggleInventoryScreen();
        }, HULL);

        // The equipped hull card carries an UNEQUIP button.
        const unequip = page.locator('#inventory-body .inv-equipped-grid .inv-act-btn');
        await expect(unequip.first()).toBeVisible();
        await unequip.first().click();

        const r = await page.evaluate(() => {
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            const p = window.gameEngine.player;
            return {
                playerHull: p.equippedItems ? p.equippedItems.hull : 'missing',
                stashLen: Array.isArray(meta.stash) ? meta.stash.length : -1,
            };
        });
        expect(r.playerHull).toBeFalsy();   // cleared on the live player
        expect(r.stashLen).toBe(1);         // back in the stash
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    test('the BUILD GEAR tab has an "Open Inventory" button (no inline equip lists)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.querySelector('#shop-tree-tabs .shop-tree-tab[data-tab="gear"]')?.click();
            const gear = document.getElementById('shop-tree-gear');
            const btns = gear ? [...gear.querySelectorAll('button')].map((b) => b.textContent) : [];
            return {
                hasInventoryBtn: btns.some((t) => /Open Inventory/i.test(t)),
                hasFabricateBtn: btns.some((t) => /Open Fabricator/i.test(t)),
            };
        });
        expect(r.hasInventoryBtn).toBe(true);
        expect(r.hasFabricateBtn).toBe(true);
    });
});
