/**
 * QA-21: inventory resist readout (ITEM-01)
 *
 * The inventory overlay ('I' key) shows each equipped item's affixes. ITEM-01
 * adds a compact GROUPED resist readout (RESIST  Pyro+8%  Cryo+5%) so a player
 * can read elemental defensive coverage at a glance. Verifies the readout
 * renders for a resist-bearing item, is absent for a non-resist item, and the
 * raw resist affix labels still show — all without fatal JS errors.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-21: inventory resist readout', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
    });

    test('a resist-bearing equipped item shows a grouped resist readout', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // Equip a hull carrying two element resists + one non-resist affix.
            ge.player.equippedItems.hull = {
                slot: 'hull', level: 10, rarity: 'epic', name: 'Test Resist Hull',
                rarityLabel: 'EPIC', rarityColor: '#c060ff',
                affixes: [
                    { type: 'hp', value: 40, label: '+40 MAX HP' },
                    { type: 'pyroResist', value: 8, label: '+8% PYRO RESIST' },
                    { type: 'cryoResist', value: 5, label: '+5% CRYO RESIST' },
                ],
            };
            // Open the inventory overlay (pauses + renders).
            ge.toggleInventoryScreen();
            const readouts = document.querySelectorAll('#inventory-body .inv-item-resists');
            const chips = document.querySelectorAll('#inventory-body .inv-item-resists .inv-resist-chip');
            const tag = document.querySelector('#inventory-body .inv-resist-tag');
            const affixText = [...document.querySelectorAll('#inventory-body .item-card__affix')]
                .map((n) => n.textContent).join(' | ');
            return {
                readoutCount: readouts.length,
                chipCount: chips.length,
                tagText: tag && tag.textContent,
                chipTexts: [...chips].map((c) => c.textContent),
                affixText,
            };
        });
        // The grouped readout exists with one tag + two element chips.
        expect(r.readoutCount).toBeGreaterThanOrEqual(1);
        expect(r.chipCount).toBe(2);
        expect(r.tagText).toBe('RESIST');
        expect(r.chipTexts).toEqual(expect.arrayContaining(['Pyro+8%', 'Cryo+5%']));
        // The raw affix labels still render (readout is additive, not a replacement).
        expect(r.affixText).toContain('PYRO RESIST');
        expect(r.affixText).toContain('CRYO RESIST');
    });

    test('a non-resist equipped item shows NO resist readout', async ({ page }) => {
        await startGame(page);
        const count = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.equippedItems = { cockpit: null, hull: null, shielding: null, chassis: null, nanites: null };
            ge.player.equippedItems.cockpit = {
                slot: 'cockpit', level: 5, rarity: 'rare', name: 'Plain Core',
                rarityLabel: 'RARE', rarityColor: '#5cc6ff',
                affixes: [
                    { type: 'hp', value: 20, label: '+20 MAX HP' },
                    { type: 'toughness', value: 3, label: '+3% DEF' },
                ],
            };
            ge.toggleInventoryScreen();
            return document.querySelectorAll('#inventory-body .inv-item-resists').length;
        });
        expect(count).toBe(0);
    });

    test('no fatal JS errors opening the inventory with a resist item', async ({ page }) => {
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.equippedItems.shielding = {
                slot: 'shielding', level: 8, rarity: 'legendary', name: 'Warded Aegis',
                rarityLabel: 'LEGENDARY', rarityColor: '#ffb43a',
                affixes: [
                    { type: 'toxicResist', value: 6, label: '+6% TOXIC RESIST' },
                    { type: 'voidResist', value: 4, label: '+4% VOID RESIST' },
                ],
            };
            ge.toggleInventoryScreen();
            ge.toggleInventoryScreen(); // close
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
