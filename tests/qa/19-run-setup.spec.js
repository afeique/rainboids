/**
 * QA-19: RUN SETUP UI (8.10.0 — flat waves; 8.21.0 — own screen)
 *
 * 8.21.0 — the pre-run is two screens: BUILD (equip gear) → RUN SETUP. The RUN
 * SETUP screen carries a single WAVES slider (10–100, step 10), a difficulty
 * MODE selector (Easy→Legendary), and a live readout ("N waves · MODE ·
 * rewards ×M"). The chosen run shape ({ maxWaves, mode }) flows into
 * game.runConfig on START RUN. Tests advance BUILD → RUN SETUP first (the
 * BUILD primary button reads "RUN SETUP →" and switches screens).
 *
 * Mirrors the QA-08 BUILD-flow harness (loadGame → openArmory → advance → RUN
 * SETUP, then drive the engine via page.evaluate).
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-19: RUN SETUP UI', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('RUN SETUP controls are visible on the RUN SETUP screen with the default readout', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const group = document.getElementById('shop-runsetup');
            const readout = document.getElementById('shop-runsetup-readout');
            const slider = document.getElementById('shop-runsetup-waves');
            const val = document.getElementById('shop-runsetup-waves-value');
            return {
                visible: group && getComputedStyle(group).display !== 'none',
                hasSlider: !!(slider && val),
                sliderMin: slider && slider.min,
                sliderMax: slider && slider.max,
                sliderStep: slider && slider.step,
                sliderValue: slider && slider.value,
                wavesLabel: val && val.textContent,
                readout: readout && readout.textContent,
            };
        });
        expect(r.visible).toBe(true);
        expect(r.hasSlider).toBe(true);
        expect(r.sliderMin).toBe('10');
        expect(r.sliderMax).toBe('100');
        expect(r.sliderStep).toBe('10');
        expect(r.sliderValue).toBe('30');
        expect(r.wavesLabel).toBe('30 waves');
        expect(r.readout).toBe('30 waves · NORMAL · rewards ×1.0');
    });

    test('the RUN SETUP group is hidden in the in-run shop', async ({ page }) => {
        const display = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.init();
            ge.openShop();
            const group = document.getElementById('shop-runsetup');
            return group && getComputedStyle(group).display;
        });
        expect(display).toBe('none');
    });

    test('dragging the waves slider updates the value + live readout', async ({ page }) => {
        const r = await page.evaluate((waves) => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const s = document.getElementById('shop-runsetup-waves');
            s.value = String(waves);
            s.dispatchEvent(new Event('input', { bubbles: true }));
            return {
                value: document.getElementById('shop-runsetup-waves-value').textContent,
                readout: document.getElementById('shop-runsetup-readout').textContent,
            };
        }, 60);
        expect(r.value).toBe('60 waves');
        expect(r.readout).toBe('60 waves · NORMAL · rewards ×1.0');
    });

    test('the waves slider clamps to [10,100]', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const s = document.getElementById('shop-runsetup-waves');
            const setVal = (n) => { s.value = String(n); s.dispatchEvent(new Event('input', { bubbles: true })); };
            const lbl = () => document.getElementById('shop-runsetup-waves-value').textContent;
            setVal(500);
            const atMax = lbl();
            setVal(0);
            const atMin = lbl();
            return { atMax, atMin };
        });
        expect(r.atMax).toBe('100 waves');
        expect(r.atMin).toBe('10 waves');
    });

    test('START RUN threads the chosen wave count into game.runConfig', async ({ page }) => {
        const r = await page.evaluate((waves) => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const s = document.getElementById('shop-runsetup-waves');
            s.value = String(waves);
            s.dispatchEvent(new Event('input', { bubbles: true }));
            const startBtn = document.getElementById('shop-prerun-start');
            const startDisabled = startBtn.disabled;
            startBtn.click();
            return { startDisabled, runConfig: ge.game.runConfig, state: ge.game.state };
        }, 60);
        expect(r.startDisabled).toBe(false);
        expect(r.runConfig).toEqual({ maxWaves: 60, mode: 'NORMAL' });
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(r.state);
    });

    test('default run (untouched RUN SETUP) keeps the canonical 30-wave NORMAL run', async ({ page }) => {
        const runConfig = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            ge.beginPreRunFromTree({}); // no runConfig passed
            return ge.game.runConfig;
        });
        expect(runConfig).toEqual({ maxWaves: 30, mode: 'NORMAL' });
    });

    // ── difficulty MODE selector (unchanged by 8.10.0) ────────────────
    test('MODE controls render with NORMAL active + EPIC/LEGENDARY locked by default', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const group = document.getElementById('shop-runsetup-mode');
            const ids = ['easy', 'normal', 'hard', 'epic', 'legendary'];
            const btns = Object.fromEntries(ids.map((k) => [k, document.getElementById(`shop-runsetup-mode-${k}`)]));
            return {
                visible: group && getComputedStyle(group).display !== 'none',
                allPresent: ids.every((k) => !!btns[k]),
                normalActive: btns.normal && btns.normal.classList.contains('active'),
                hardDisabled: btns.hard.disabled,
                epicDisabled: btns.epic.disabled,
                legendaryDisabled: btns.legendary.disabled,
                epicTitle: btns.epic.getAttribute('title'),
            };
        });
        expect(r.visible).toBe(true);
        expect(r.allPresent).toBe(true);
        expect(r.normalActive).toBe(true);
        expect(r.hardDisabled).toBe(false);
        expect(r.epicDisabled).toBe(true);
        expect(r.legendaryDisabled).toBe(true);
        expect(r.epicTitle).toMatch(/Locked/i);
    });

    test('clicking an unlocked mode (HARD) selects it + the readout updates', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            document.getElementById('shop-runsetup-mode-hard').click();
            const hard = document.getElementById('shop-runsetup-mode-hard');
            const normal = document.getElementById('shop-runsetup-mode-normal');
            return {
                hardActive: hard.classList.contains('active'),
                normalActive: normal.classList.contains('active'),
                readout: document.getElementById('shop-runsetup-readout').textContent,
            };
        });
        expect(r.hardActive).toBe(true);
        expect(r.normalActive).toBe(false);
        expect(r.readout).toBe('30 waves · HARD · rewards ×1.3');
    });

    test('a locked mode (EPIC) is disabled and clicking it is a no-op', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const epic = document.getElementById('shop-runsetup-mode-epic');
            epic.click();
            const normal = document.getElementById('shop-runsetup-mode-normal');
            return {
                epicDisabled: epic.disabled,
                epicActive: epic.classList.contains('active'),
                normalStillActive: normal.classList.contains('active'),
            };
        });
        expect(r.epicDisabled).toBe(true);
        expect(r.epicActive).toBe(false);
        expect(r.normalStillActive).toBe(true);
    });

    test('START RUN threads the chosen mode into game.runConfig.mode', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            document.getElementById('shop-runsetup-mode-hard').click();
            document.getElementById('shop-prerun-start').click();
            return { mode: ge.game.runConfig.mode };
        });
        expect(r.mode).toBe('HARD');
    });

    test('no fatal JS errors through the RUN SETUP flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.getElementById('shop-prerun-start').click(); // 8.21.0 BUILD -> RUN SETUP
            const s = document.getElementById('shop-runsetup-waves');
            for (const v of [90, 50, 10, 100]) { s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }
            document.getElementById('shop-runsetup-mode-easy').click();
            document.getElementById('shop-runsetup-mode-hard').click();
            document.getElementById('shop-runsetup-mode-epic').click(); // gated no-op
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
