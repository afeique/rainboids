/**
 * QA-52: ASSISTS-tab Co-Pilot tuning (mobile P7 · AS-2/3/4)
 *
 * The ASSISTS pause-menu tab gained a Co-Pilot LEVEL preset, an AUTO-DODGE
 * intensity selector, and an AGGRESSION slider. These verify the UI round-trips
 * into the engine's persisted assist config (game.assists) + localStorage, and
 * that the LEVEL preset applies its bundled toggles.
 *
 * The tab is desktop-visible (hidden only on touch-only mobile), so the default
 * desktop QA project exercises it directly.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

async function openAssistsTab(page) {
    await startGame(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.gameEngine?.game?.state === 'PAUSED', { timeout: 5_000 });
    // 8.27.0 — ASSISTS is a SETTINGS sub-tab now.
    await page.click('.pause-tab[data-tab="settings"]');
    await page.click('.settings-subtab[data-subtab="assists"]');
    await expect(page.locator('#assists-tab')).toHaveClass(/active/);
}

const assists = (page) => page.evaluate(() => window.gameEngine?.assists);

test.describe('QA-52: ASSISTS Co-Pilot tuning', () => {
    test.beforeEach(async ({ page }) => {
        await loadGame(page);
    });

    test('ASSISTS tab exposes the level / auto-dodge / aggression controls', async ({ page }) => {
        await openAssistsTab(page);
        await expect(page.locator('#assist-level-co-pilot')).toBeVisible();
        await expect(page.locator('#assist-dodge-aggressive')).toBeVisible();
        await expect(page.locator('#assist-aggression-slider')).toBeVisible();
    });

    test('selecting AUTOPILOT sets the level + applies the preset bundle', async ({ page }) => {
        await openAssistsTab(page);
        await page.click('#assist-level-autopilot');
        const a = await assists(page);
        expect(a.level).toBe('autopilot');
        // Autopilot bundle: aggressive auto-dodge + all auto-casts on.
        expect(a.autoDodge).toBe('aggressive');
        expect(a.autoCastAbilities).toBe(true);
        expect(a.autoFire).toBe(true);
        // The chosen segment is highlighted.
        await expect(page.locator('#assist-level-autopilot')).toHaveClass(/active/);
        // And the bundle is reflected in the dodge segment + checkboxes.
        await expect(page.locator('#assist-dodge-aggressive')).toHaveClass(/active/);
        await expect(page.locator('#assist-auto-fire')).toBeChecked();
    });

    test('MANUAL level clears the auto-* bundle', async ({ page }) => {
        await openAssistsTab(page);
        await page.click('#assist-level-autopilot');   // turn things on first
        await page.click('#assist-level-manual-touch'); // then back to manual
        const a = await assists(page);
        expect(a.level).toBe('manual-touch');
        expect(a.autoDodge).toBe('off');
        expect(a.autoCastAbilities).toBe(false);
        expect(a.autoFire).toBe(false);
    });

    test('auto-dodge intensity segment sets config.autoDodge', async ({ page }) => {
        await openAssistsTab(page);
        await page.click('#assist-dodge-conservative');
        expect((await assists(page)).autoDodge).toBe('conservative');
        await expect(page.locator('#assist-dodge-conservative')).toHaveClass(/active/);
        await page.click('#assist-dodge-off');
        expect((await assists(page)).autoDodge).toBe('off');
    });

    test('aggression slider maps 10–100% to the 0.1–1.0 config value', async ({ page }) => {
        await openAssistsTab(page);
        await page.evaluate(() => {
            const s = document.getElementById('assist-aggression-slider');
            s.value = '80';
            s.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const a = await assists(page);
        expect(a.aggression).toBeCloseTo(0.8, 5);
        await expect(page.locator('#assist-aggression-value')).toHaveText('80%');
    });

    test('tuning persists to localStorage', async ({ page }) => {
        await openAssistsTab(page);
        await page.click('#assist-level-autopilot');
        await page.click('#assist-dodge-conservative');
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rainboidsAssists') || '{}'));
        expect(stored.level).toBe('autopilot');
        expect(stored.autoDodge).toBe('conservative');
    });
});
