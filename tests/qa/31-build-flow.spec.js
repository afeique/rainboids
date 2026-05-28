/**
 * QA-31: BUILD / RUN-SETUP end-to-end round-trip (UI-02)
 *
 * The pre-run BUILD screen (gameEngine.openArmory → the #shop-overlay bubble
 * tree in pre-run mode) is the start-of-run configurator. It carries six
 * cluster tabs (gear / primary / power / defense / passiveskills / passive),
 * the RUN SETUP control group (stages + waves/stage + difficulty MODE), and
 * the START RUN button. Selections + run shape flow through
 * beginPreRunFromTree → startNewRun → init(), landing on game.runConfig and
 * player loadout state (activePrimary / activePower / equippedAbilities).
 *
 * Existing specs cover slices of this:
 *   - QA-07  shop tabs + weapon data (in-run shop, player owned sets)
 *   - QA-19  RUN SETUP controls → game.runConfig (stages/wps/mode units)
 * This spec fills the GAP: the full open → review-all-tabs → select-loadout →
 * configure-run → START round-trip as one integration, plus the seeding
 * (meta.loadout) round-trip back into a freshly-opened BUILD screen.
 *
 * Discovered hooks/selectors used for the round-trip assertions:
 *   - window.gameEngine.openArmory()                — enters pre-run BUILD
 *   - .shop-tree-tab[data-tab=...]                  — the six cluster tabs
 *   - .shop-node--parent[data-id][data-category]   — loadout equip toggles
 *       (data-prerunSelectable="1" when the id is unlocked/equippable)
 *   - #shop-runsetup-wps-{3,6,9} / -stages-inc/-dec / -mode-{...}
 *   - #shop-prerun-start                            — START RUN button
 *   - game.runConfig {stages,wavesPerStage,mode}    — the started run shape
 *   - player.activePrimary / activePower / equippedAbilities — live loadout
 *
 * Reality notes (adapted from the plan):
 *   - With a clean meta only the BASE_LOADOUT ids are *unlocked/selectable*:
 *     primaries=[PULSE_CANNON], powers=[CHARGE_SHOT], abilities=[BULWARK,
 *     FIELD_MEDIC]. Other parent nodes render locked (prerunSelectable="0"),
 *     so the "select a loadout" assertions drive the base ids + toggle the
 *     ability between BULWARK and FIELD_MEDIC (the one category with two
 *     unlocked options on a clean meta).
 *   - "Seeding" exists as the meta.loadout persistence path: beginPreRunFromTree
 *     saves the chosen loadout via saveMeta({loadout}); a later openArmory
 *     re-seeds the BUILD selection from it. The seeding test asserts that
 *     round-trip rather than any separate "profile/pre-equip" surface (none
 *     exists beyond meta.loadout).
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

// 8.x — the tabs VISIBLE in pre-run BUILD mode. Weapons are equipped gear now,
// so PRIMARY/POWER are hidden in BUILD (they're in-run-shop-only); GEAR (equip
// weapons + gear), ABILITIES, PASSIVES, and STATS remain.
const BUILD_TABS = ['gear', 'abilities', 'passiveskills', 'passive'];

// Filter the page-error list down to genuinely fatal JS errors (ignore the
// known audio/font/network noise other QA specs also filter out).
function fatalErrors(errors) {
    return errors.filter((m) =>
        !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver|Failed to load resource/i.test(m));
}

test.describe('QA-31: BUILD / RUN-SETUP end-to-end round-trip', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
        // Clean meta so the run shape + loadout start at the canonical
        // defaults (10×3 NORMAL, BASE_LOADOUT) for deterministic assertions.
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    // ------------------------------------------------------------------
    // 1. Every tab is reachable and switching them doesn't throw.
    // ------------------------------------------------------------------
    test('opening BUILD reaches every visible cluster tab; PRIMARY/POWER are hidden', async ({ page }) => {
        const r = await page.evaluate((tabs) => {
            const ge = window.gameEngine;
            ge.openArmory();
            const overlay = document.getElementById('shop-overlay');
            const tree = document.getElementById('shop-tree');
            const tabStrip = document.getElementById('shop-tree-tabs');
            const seen = [];
            // Click through each BUILD-visible tab and record the tree's active-tab.
            for (const tab of tabs) {
                const btn = tabStrip.querySelector(`.shop-tree-tab[data-tab="${tab}"]`);
                if (!btn) { seen.push(`MISSING:${tab}`); continue; }
                const hidden = btn.style.display === 'none';
                btn.click();
                seen.push(`${tab}:${tree.dataset.activeTab}:${hidden ? 'hidden' : 'shown'}`);
            }
            const wepTab = (t) => tabStrip.querySelector(`.shop-tree-tab[data-tab="${t}"]`);
            return {
                state: ge.game.state,
                overlayShown: overlay && getComputedStyle(overlay).display === 'flex',
                clusterCount: document.querySelectorAll('#shop-tree .shop-tree-cluster').length,
                seen,
                primaryHidden: wepTab('primary').style.display === 'none',
                powerHidden: wepTab('power').style.display === 'none',
            };
        }, BUILD_TABS);

        // openArmory transitions into the ARMORY (pre-run BUILD) state.
        expect(r.state).toBe('ARMORY');
        expect(r.overlayShown).toBe(true);
        // Six cluster containers still exist in the DOM (the in-run shop reuses them).
        expect(r.clusterCount).toBe(6);
        // Every BUILD-visible tab was present, shown, and drove data-active-tab.
        for (const tab of BUILD_TABS) {
            expect(r.seen).toContain(`${tab}:${tab}:shown`);
        }
        // The weapon tabs are hidden — weapons are equipped gear now.
        expect(r.primaryHidden).toBe(true);
        expect(r.powerHidden).toBe(true);
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 2. The default BUILD selection reflects BASE_LOADOUT and the base
    //    parents render as selectable equip toggles.
    // ------------------------------------------------------------------
    test('GEAR tab hosts the WEAPON panel; no PRIMARY/POWER pickers exist in BUILD', async ({ page }) => {
        // 8.x — weapons are equipped gear: the GEAR tab carries a WEAPON panel
        // (equipped readout + stash swaps), and the old PRIMARY/POWER equip
        // toggles are gone from the pre-run BUILD entirely.
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const gear = document.getElementById('shop-tree-gear');
            return {
                gearText: gear ? gear.textContent : '',
                pulseParent: !!document.querySelector('.shop-node--parent[data-id="PULSE_CANNON"]'),
                chargeParent: !!document.querySelector('.shop-node--parent[data-id="CHARGE_SHOT"]'),
                anyPrimaryParent: !!document.querySelector('.shop-node--parent[data-category="primaries"]'),
                anyPowerParent: !!document.querySelector('.shop-node--parent[data-category="powers"]'),
            };
        });

        // The GEAR tab now hosts the weapon-equip UI (8.7.1 — Title-Case labels).
        expect(r.gearText).toContain('Primary Weapon');
        expect(r.gearText).toContain('Equipped');
        // No weapon/power equip toggles render in the pre-run BUILD anymore.
        expect(r.pulseParent).toBe(false);
        expect(r.chargeParent).toBe(false);
        expect(r.anyPrimaryParent).toBe(false);
        expect(r.anyPowerParent).toBe(false);
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 3. Toggling an ability across the DEFENSE tab mutates the selection.
    // ------------------------------------------------------------------
    test('toggling a defense ability updates the equipped state', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // 7.0.0 — abilities are owned-only now; seed FIELD_MEDIC as owned so
            // it renders as a toggleable row (equipped state = shop-node--equipped).
            localStorage.setItem('rainboidsMeta', JSON.stringify({ unlockedAbilities: ['BULWARK', 'FIELD_MEDIC'] }));
            ge.openArmory();
            const medic = () => document.querySelector('.shop-node--parent[data-id="FIELD_MEDIC"]');
            const before = medic().classList.contains('shop-node--equipped');
            medic().click();                 // toggle FIELD_MEDIC
            const after1 = medic().classList.contains('shop-node--equipped');
            medic().click();                 // toggle back
            const after2 = medic().classList.contains('shop-node--equipped');
            return { before, after1, after2 };
        });
        // Toggling flips the equipped state, and flips it back on a second click.
        expect(r.after1).toBe(!r.before);
        expect(r.after2).toBe(r.before);
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 4. The core integration: BUILD selection + RUN SETUP → started run.
    //    Configure a non-default run shape + difficulty, pick the loadout,
    //    START, and assert the choices round-trip into game.runConfig AND
    //    the live player loadout, with the run actually beginning.
    // ------------------------------------------------------------------
    test('START threads run shape + loadout into the live run', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // 7.0.0 — seed the two former base abilities as owned so they render
            // in the compact (owned-only) DEFENSE list and can be toggled.
            localStorage.setItem('rainboidsMeta', JSON.stringify({ unlockedAbilities: ['BULWARK', 'FIELD_MEDIC'] }));
            ge.openArmory();

            // Configure a NON-default run: 60 waves + HARD mode.
            const slider = document.getElementById('shop-runsetup-waves');
            slider.value = '60'; slider.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('shop-runsetup-mode-hard').click();

            // Pick the loadout: ensure PULSE_CANNON (primary), CHARGE_SHOT
            // (power), and exactly FIELD_MEDIC for the ability slot. Equipped
            // state is marked with `shop-node--equipped` (7.0.0 compact list).
            const ensureEquipped = (id) => {
                const n = document.querySelector(`.shop-node--parent[data-id="${id}"]`);
                if (n && !n.classList.contains('shop-node--equipped')) n.click();
            };
            const ensureUnequipped = (id) => {
                const n = document.querySelector(`.shop-node--parent[data-id="${id}"]`);
                if (n && n.classList.contains('shop-node--equipped')) n.click();
            };
            ensureEquipped('PULSE_CANNON');
            ensureEquipped('CHARGE_SHOT');
            ensureUnequipped('BULWARK');
            ensureEquipped('FIELD_MEDIC');

            const startBtn = document.getElementById('shop-prerun-start');
            const startDisabled = startBtn.disabled;
            startBtn.click();

            const p = ge.player;
            return {
                startDisabled,
                runConfig: ge.game.runConfig,
                state: ge.game.state,
                hasPlayer: !!p,
                activePrimary: p && p.activePrimary,
                activePower: p && p.activePower,
                equippedAbilities: p && [...(p.equippedAbilities || [])].filter(Boolean),
                ownedPrimaries: p && [...(p.ownedPrimaries || [])],
            };
        });

        // START was enabled (a primary was equipped) and a run began.
        expect(r.startDisabled).toBe(false);
        expect(r.hasPlayer).toBe(true);
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(r.state);

        // The chosen run shape round-tripped into game.runConfig (mode too).
        expect(r.runConfig).toEqual({ maxWaves: 60, mode: 'HARD' });

        // The chosen loadout round-tripped into the live player state.
        expect(r.activePrimary).toBe('PULSE_CANNON');
        expect(r.activePower).toBe('CHARGE_SHOT');
        expect(r.ownedPrimaries).toEqual(['PULSE_CANNON']);
        // FIELD_MEDIC was the equipped ability (BULWARK was removed).
        expect(r.equippedAbilities).toContain('FIELD_MEDIC');
        expect(r.equippedAbilities).not.toContain('BULWARK');

        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 5. The default (untouched) BUILD flow starts the canonical 10×3 NORMAL.
    // ------------------------------------------------------------------
    test('an untouched BUILD flow starts the canonical 30-wave NORMAL run', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            // Don't touch RUN SETUP or the loadout — just START with the defaults.
            document.getElementById('shop-prerun-start').click();
            return { runConfig: ge.game.runConfig, state: ge.game.state };
        });
        expect(r.runConfig).toEqual({ maxWaves: 30, mode: 'NORMAL' });
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(r.state);
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 6. Seeding round-trip: a chosen run shape persists to meta.loadout and
    //    re-seeds a freshly-opened BUILD screen (the only persistent
    //    pre-equip path the BUILD flow exposes — no separate profile surface).
    // ------------------------------------------------------------------
    test('the chosen run shape seeds the next BUILD open via meta.loadout', async ({ page }) => {
        // First BUILD: pick 90 waves + EASY, then START (which persists the
        // loadout to meta via saveMeta({loadout})).
        const first = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            const slider = document.getElementById('shop-runsetup-waves');
            slider.value = '90'; slider.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('shop-runsetup-mode-easy').click();
            document.getElementById('shop-prerun-start').click();
            return { runConfig: ge.game.runConfig };
        });
        expect(first.runConfig).toEqual({ maxWaves: 90, mode: 'EASY' });

        // The persisted run shape should be readable from meta.loadout.runConfig.
        const meta = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem('rainboidsMeta')); } catch { return null; }
        });
        expect(meta && meta.loadout && meta.loadout.runConfig).toEqual({ maxWaves: 90, mode: 'EASY' });

        // Re-open BUILD: the RUN SETUP controls re-seed from that meta — the
        // slider at 90 and EASY active.
        const seeded = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            const easy = document.getElementById('shop-runsetup-mode-easy');
            const normal = document.getElementById('shop-runsetup-mode-normal');
            return {
                waves: document.getElementById('shop-runsetup-waves').value,
                wavesLabel: document.getElementById('shop-runsetup-waves-value').textContent,
                easyActive: easy.classList.contains('active'),
                normalActive: normal.classList.contains('active'),
            };
        });
        expect(seeded.waves).toBe('90');
        expect(seeded.wavesLabel).toBe('90 waves');
        expect(seeded.easyActive).toBe(true);
        expect(seeded.normalActive).toBe(false);
        expect(fatalErrors(page._jsErrors)).toEqual([]);
    });

    // ------------------------------------------------------------------
    // 7. No fatal JS errors through the whole open → review-all-tabs →
    //    select → configure → START sequence.
    // ------------------------------------------------------------------
    test('no fatal JS errors through the full BUILD sequence', async ({ page }) => {
        await page.evaluate((tabs) => {
            const ge = window.gameEngine;
            ge.openArmory();
            // Review every tab.
            const tabStrip = document.getElementById('shop-tree-tabs');
            for (const tab of tabs) {
                const btn = tabStrip.querySelector(`.shop-tree-tab[data-tab="${tab}"]`);
                if (btn) btn.click();
            }
            // Exercise RUN SETUP (waves slider sweep + a gated mode no-op).
            const slider = document.getElementById('shop-runsetup-waves');
            for (const v of [100, 10, 50, 30]) { slider.value = String(v); slider.dispatchEvent(new Event('input', { bubbles: true })); }
            document.getElementById('shop-runsetup-mode-easy').click();
            document.getElementById('shop-runsetup-mode-hard').click();
            document.getElementById('shop-runsetup-mode-epic').click(); // gated no-op
            // Toggle a loadout pick.
            const medic = document.querySelector('.shop-node--parent[data-id="FIELD_MEDIC"]');
            if (medic) { medic.click(); medic.click(); }
            // START the run.
            document.getElementById('shop-prerun-start').click();
        }, BUILD_TABS);

        expect(fatalErrors(page._jsErrors)).toEqual([]);
        // The run actually started.
        const state = await page.evaluate(() => window.gameEngine.game.state);
        expect(['PLAYING', 'WAVE_TRANSITION']).toContain(state);
    });
});
