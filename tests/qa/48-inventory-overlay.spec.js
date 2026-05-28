/**
 * QA-48: Diablo-style Inventory overlay ('I' key).
 *
 * The inventory is its own full-screen overlay that pauses the run. It shows a
 * paper-doll EQUIPPED grid (primary weapon + power weapon + the five gear slots)
 * and a rarity-colored STASH grid of banked items, with a right-hand stat sheet
 * that previews compare deltas on hover/focus. This spec opens it mid-run with a
 * seeded stash, asserts the equipped + stash grids render, and closes it clean.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

function fatalErrors(errors) {
    return errors.filter((m) =>
        !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver|Failed to load resource/i.test(m));
}

test.describe('QA-48: Inventory overlay', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        await startGame(page);
    });

    test('equipped paper-doll + rarity-colored stash grid render and close clean', async ({ page }) => {
        // Seed a stash item so the grid has content, then open the overlay.
        const opened = await page.evaluate(() => {
            const cur = (() => { try { return JSON.parse(localStorage.getItem('rainboidsMeta')) || {}; } catch { return {}; } })();
            cur.stash = [{
                slot: 'hull', level: 4,
                rarityColor: '#ffae3a', rarityLabel: 'Refined', name: 'Refined Hull Plate',
                affixes: [{ type: 'hp', value: 22, label: 'HP +22' }, { type: 'toughness', value: 6, label: 'Tough +6' }],
            }];
            localStorage.setItem('rainboidsMeta', JSON.stringify(cur));
            return window.gameEngine.toggleInventoryScreen();
        });
        expect(opened).toBe(true);

        const state = await page.evaluate(() => {
            const ov = document.getElementById('inventory-overlay');
            const eqGrid = document.querySelector('#inventory-body .inv-equipped-grid');
            const stashGrid = document.querySelector('#inventory-body .inv-stash-grid');
            const statSheet = document.querySelector('#inventory-body .item-stats-panel');
            return {
                shown: ov && getComputedStyle(ov).display === 'flex',
                paused: window.gameEngine.game.state === 'PAUSED',
                equippedCards: eqGrid ? eqGrid.querySelectorAll('.item-card').length : 0,
                stashCards: stashGrid ? stashGrid.querySelectorAll('.item-card').length : 0,
                stashName: stashGrid ? (stashGrid.querySelector('.item-card__name')?.textContent || '') : '',
                hasStatSheet: !!statSheet,
            };
        });
        expect(state.shown).toBe(true);
        expect(state.paused).toBe(true);
        // primary weapon + power weapon + 5 gear slots = 7 equipped cards.
        expect(state.equippedCards).toBe(7);
        expect(state.stashCards).toBe(1);
        expect(state.stashName).toContain('Refined Hull Plate');
        expect(state.hasStatSheet).toBe(true);

        // Close via the × button → overlay hidden, run resumes.
        await page.locator('#inventory-close').click();
        const after = await page.evaluate(() => ({
            hidden: getComputedStyle(document.getElementById('inventory-overlay')).display === 'none',
            state: window.gameEngine.game.state,
        }));
        expect(after.hidden).toBe(true);
        expect(after.state).toBe('PLAYING');

        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });
});
