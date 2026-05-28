/**
 * QA-13: weapon attunements/mods RETIRED from the pre-run BUILD (8.x).
 *
 * Weapons are loot now (archetype + ROLLED traits), so the old pre-run
 * per-weapon attunement/mod pickers are gone — the PRIMARY/POWER clusters
 * aren't even rendered in BUILD mode, and any attunements/mods handed to
 * `beginPreRunFromTree` are dropped. Weapon elements/behaviors come from the
 * equipped weapon item's traits instead. Ability attunements (W6) survive —
 * abilities are still picked on the DEFENSE tab.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-13: weapon attunements/mods retired from BUILD', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the PRIMARY/POWER clusters render no equip/attune nodes in BUILD mode', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            return {
                primaryNodes: document.querySelectorAll('#shop-tree-primary .shop-node').length,
                powerNodes: document.querySelectorAll('#shop-tree-power .shop-node').length,
            };
        });
        expect(r.primaryNodes).toBe(0); // weapons are equipped gear — not picked here
        expect(r.powerNodes).toBe(0);
    });

    test('the PRIMARY/POWER tabs are hidden in BUILD mode', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const tab = (t) => document.querySelector(`.shop-tree-tab[data-tab="${t}"]`);
            return {
                primaryHidden: tab('primary').style.display === 'none',
                powerHidden: tab('power').style.display === 'none',
                gearShown: tab('gear').style.display !== 'none',
                defenseShown: tab('abilities').style.display !== 'none',
            };
        });
        expect(r.primaryHidden).toBe(true);
        expect(r.powerHidden).toBe(true);
        expect(r.gearShown).toBe(true);
        expect(r.defenseShown).toBe(true);
    });

    test('weapon attunements handed to START RUN are dropped (no longer plumbed)', async ({ page }) => {
        const active = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({ attunements: { PULSE_CANNON: ['PULSE_CANNON_PYRO'] } });
            return ge.player.activeAttunements; // weapon attunements no longer applied
        });
        expect(active).toEqual({});
    });

    test('weapon mechanic mods handed to START RUN are dropped', async ({ page }) => {
        const stacks = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({ mods: { PULSE_CANNON: ['PULSE_PIERCING'] } });
            return ge.player.getPowerupStacks('PULSE_PIERCING');
        });
        expect(stacks).toBe(0);
    });

    test('no fatal JS errors through the BUILD flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({ abilities: ['BULWARK'] });
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});

test.describe('QA-13c: Ability attunements survive (Phase W6 plumbing)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('an ability attunement chosen in the loadout applies to the player on START', async ({ page }) => {
        const attune = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({
                abilities: ['EMP_PULSE', null, null, null],
                abilityAttune: { EMP_PULSE: 'EMP_PULSE_VOLT' },
            });
            return ge.player.activeAbilityAttune.EMP_PULSE;
        });
        expect(attune).toBe('EMP_PULSE_VOLT');
    });

    test('an unknown ability attunement id is dropped on START RUN', async ({ page }) => {
        const attune = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({
                abilities: ['EMP_PULSE', null, null, null],
                abilityAttune: { EMP_PULSE: 'EMP_PULSE_NONEXISTENT' }, // not a known attunement
            });
            return ge.player.activeAbilityAttune.EMP_PULSE;
        });
        expect(attune).toBeUndefined();
    });
});
