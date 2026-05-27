/**
 * QA-19: RUN SETUP UI (RUN-06)
 *
 * The pre-run BUILD screen's footer now carries a RUN SETUP control group:
 * a waves-per-stage selector (3 / 6 / 9), a stages stepper (10..100, step 10),
 * and a live readout (total waves + reward multiplier). The chosen run shape
 * flows into game.runConfig on START RUN.
 *
 * Mirrors the QA-08 BUILD-flow harness (loadGame → openArmory → BUILD tree,
 * then drive the engine via page.evaluate).
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-19: RUN SETUP UI', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        // Clean meta so the run shape starts at the default 10×3.
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('RUN SETUP controls are visible in BUILD mode with the default readout', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const group = document.getElementById('shop-runsetup');
            const readout = document.getElementById('shop-runsetup-readout');
            const w3 = document.getElementById('shop-runsetup-wps-3');
            const w6 = document.getElementById('shop-runsetup-wps-6');
            const w9 = document.getElementById('shop-runsetup-wps-9');
            const dec = document.getElementById('shop-runsetup-stages-dec');
            const inc = document.getElementById('shop-runsetup-stages-inc');
            const val = document.getElementById('shop-runsetup-stages-value');
            return {
                visible: group && getComputedStyle(group).display !== 'none',
                hasButtons: !!(w3 && w6 && w9 && dec && inc && val),
                stages: val && val.textContent,
                readout: readout && readout.textContent,
                wps3Active: w3 && w3.classList.contains('active'),
                decDisabled: dec && dec.disabled, // at min (10) the dec is disabled
            };
        });
        expect(r.visible).toBe(true);
        expect(r.hasButtons).toBe(true);
        expect(r.stages).toBe('10');
        // DIR-09 — the readout now carries the mode + its per-mode reward mult.
        expect(r.readout).toBe('30 waves · NORMAL · rewards ×1.0 ×1.0');
        expect(r.wps3Active).toBe(true);   // default wps = 3
        expect(r.decDisabled).toBe(true);  // clamped at the floor (10)
    });

    test('the RUN SETUP group is hidden in the in-run shop', async ({ page }) => {
        const display = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.init(); // start a run so openShop shows the in-run shop
            ge.openShop();
            const group = document.getElementById('shop-runsetup');
            return group && getComputedStyle(group).display;
        });
        expect(display).toBe('none');
    });

    test('selecting 6 waves/stage + bumping stages updates the live readout', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            // Pick 6 waves/stage.
            document.getElementById('shop-runsetup-wps-6').click();
            // Bump stages 10 → 20 (one increment of 10).
            document.getElementById('shop-runsetup-stages-inc').click();
            const w6 = document.getElementById('shop-runsetup-wps-6');
            const w3 = document.getElementById('shop-runsetup-wps-3');
            return {
                stages: document.getElementById('shop-runsetup-stages-value').textContent,
                readout: document.getElementById('shop-runsetup-readout').textContent,
                w6Active: w6.classList.contains('active'),
                w3Active: w3.classList.contains('active'),
            };
        });
        expect(r.stages).toBe('20');
        expect(r.w6Active).toBe(true);
        expect(r.w3Active).toBe(false);
        // 20 stages × 6 waves = 120 waves; wps 6 → ×1.3; default mode NORMAL ×1.0.
        expect(r.readout).toBe('120 waves · NORMAL · rewards ×1.3 ×1.0');
    });

    test('the stages stepper clamps to [10,100]', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const inc = document.getElementById('shop-runsetup-stages-inc');
            const dec = document.getElementById('shop-runsetup-stages-dec');
            const val = () => document.getElementById('shop-runsetup-stages-value').textContent;
            // Spam increments past the cap.
            for (let i = 0; i < 20; i++) inc.click();
            const atMax = { stages: val(), incDisabled: inc.disabled };
            // Spam decrements past the floor.
            for (let i = 0; i < 20; i++) dec.click();
            const atMin = { stages: val(), decDisabled: dec.disabled };
            return { atMax, atMin };
        });
        expect(r.atMax.stages).toBe('100');
        expect(r.atMax.incDisabled).toBe(true);
        expect(r.atMin.stages).toBe('10');
        expect(r.atMin.decDisabled).toBe(true);
    });

    test('START RUN threads the chosen run shape into game.runConfig', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            // Pick 6 waves/stage + bump stages to 20.
            document.getElementById('shop-runsetup-wps-6').click();
            document.getElementById('shop-runsetup-stages-inc').click();
            // Equip a primary so START enables (PULSE_CANNON is the base primary).
            // 7.0.0 — compact list marks the active pick with `shop-node--equipped`
            // (Pulse Cannon is equipped by default); only click to select if it isn't.
            const primary = document.querySelector('#shop-tree-primary .shop-node--parent[data-id="PULSE_CANNON"]');
            if (primary && !primary.classList.contains('shop-node--equipped')) primary.click();
            const startBtn = document.getElementById('shop-prerun-start');
            const startDisabled = startBtn.disabled;
            startBtn.click();
            return {
                startDisabled,
                runConfig: ge.game.runConfig,
                state: ge.game.state,
            };
        });
        expect(r.startDisabled).toBe(false);
        // DIR-09 — runConfig now also carries the difficulty mode (default NORMAL).
        expect(r.runConfig).toEqual({ stages: 20, wavesPerStage: 6, mode: 'NORMAL' });
        // The run has begun — playing or the brief wave-transition lead-in.
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(r.state);
    });

    test('default run (untouched RUN SETUP) keeps the canonical 10×3', async ({ page }) => {
        const runConfig = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({ primaries: ['PULSE_CANNON'] }); // no runConfig passed
            return ge.game.runConfig;
        });
        expect(runConfig).toEqual({ stages: 10, wavesPerStage: 3, mode: 'NORMAL' });
    });

    // ── DIR-09 — difficulty MODE selector ─────────────────────────────
    test('MODE controls render with NORMAL active + EPIC/LEGENDARY locked by default', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const group = document.getElementById('shop-runsetup-mode');
            const ids = ['easy', 'normal', 'hard', 'epic', 'legendary'];
            const btns = Object.fromEntries(ids.map((k) => [k, document.getElementById(`shop-runsetup-mode-${k}`)]));
            return {
                visible: group && getComputedStyle(group).display !== 'none',
                allPresent: ids.every((k) => !!btns[k]),
                normalActive: btns.normal && btns.normal.classList.contains('active'),
                easyDisabled: btns.easy.disabled,
                hardDisabled: btns.hard.disabled,
                epicDisabled: btns.epic.disabled,
                legendaryDisabled: btns.legendary.disabled,
                epicTitle: btns.epic.getAttribute('title'),
            };
        });
        expect(r.visible).toBe(true);
        expect(r.allPresent).toBe(true);
        expect(r.normalActive).toBe(true);     // default mode = NORMAL
        expect(r.easyDisabled).toBe(false);    // always open
        expect(r.hardDisabled).toBe(false);    // always open
        expect(r.epicDisabled).toBe(true);     // §14.7 gated (default meta)
        expect(r.legendaryDisabled).toBe(true);
        expect(r.epicTitle).toMatch(/Locked/i); // unlock hint present
    });

    test('clicking an unlocked mode (HARD) selects it + the readout updates', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
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
        // 10 × 3 = 30 waves; wps 3 → ×1.0; HARD per-mode reward → ×1.3.
        expect(r.readout).toBe('30 waves · HARD · rewards ×1.0 ×1.3');
    });

    test('a locked mode (EPIC) is disabled and clicking it is a no-op', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const epic = document.getElementById('shop-runsetup-mode-epic');
            epic.click(); // should not select (disabled + gated)
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
            document.getElementById('shop-runsetup-mode-hard').click();
            // 7.0.0 — compact list marks the active pick with `shop-node--equipped`
            // (Pulse Cannon is equipped by default); only click to select if it isn't.
            const primary = document.querySelector('#shop-tree-primary .shop-node--parent[data-id="PULSE_CANNON"]');
            if (primary && !primary.classList.contains('shop-node--equipped')) primary.click();
            document.getElementById('shop-prerun-start').click();
            return { mode: ge.game.runConfig.mode };
        });
        expect(r.mode).toBe('HARD');
    });

    test('no fatal JS errors through the RUN SETUP flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            document.getElementById('shop-runsetup-wps-9').click();
            const inc = document.getElementById('shop-runsetup-stages-inc');
            for (let i = 0; i < 5; i++) inc.click();
            document.getElementById('shop-runsetup-wps-3').click();
            document.getElementById('shop-runsetup-stages-dec').click();
            // DIR-09 — exercise the mode selector too.
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
