/**
 * QA-13: Attunements equippable in the BUILD tree (Phase W5 / W1 payoff).
 *
 * Attunements show as orbit bubbles on each weapon in the pre-run BUILD tree;
 * a locked node unlocks with account-gold, an owned node toggles active for the
 * run; START RUN feeds the active set into player.activeAttunements, and the
 * weapon's bullets then carry that element (W1 multi-element stamping).
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-13: Attunements (BUILD tree)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the equipped weapon shows attunement chips in BUILD mode', async ({ page }) => {
        // 7.0.0 — the pre-run BUILD screen is now a compact owned-only list;
        // attunements render as `.shop-prerun-chip[data-kind="attunement"]`
        // dropdown chips under the EQUIPPED weapon (Pulse Cannon by default).
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const nodes = [...document.querySelectorAll('#shop-tree-primary .shop-prerun-chip[data-kind="attunement"]')];
            return { count: nodes.length, ids: nodes.map((n) => n.dataset.id) };
        });
        expect(r.count).toBeGreaterThan(0);
        // Pulse Cannon's six attunements are present.
        expect(r.ids).toContain('PULSE_CANNON_PYRO');
        expect(r.ids).toContain('PULSE_CANNON_VOID');
    });

    test('unlocking an attunement deducts account-gold and persists', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            const ok = ge.unlockPreRunItem('attunements', 'PULSE_CANNON_PYRO');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, owned: meta.unlockedAttunements || [] };
        });
        expect(r.ok).toBe(true);
        expect(r.gold).toBeLessThan(20000);
        expect(r.owned).toContain('PULSE_CANNON_PYRO');
    });

    test('START RUN applies owned active attunements to the player', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            ge.unlockPreRunItem('attunements', 'PULSE_CANNON_PYRO');
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                attunements: { PULSE_CANNON: ['PULSE_CANNON_PYRO'] },
            });
            return {
                active: ge.player.activeAttunements.PULSE_CANNON || [],
                state: ge.game.state,
            };
        });
        expect(r.active).toContain('PULSE_CANNON_PYRO');
        expect(['WAVE_TRANSITION', 'PLAYING']).toContain(r.state);
    });

    test('a non-owned attunement is dropped on START RUN', async ({ page }) => {
        const active = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            // CRYO was never unlocked → must not leak into the run.
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                attunements: { PULSE_CANNON: ['PULSE_CANNON_CRYO'] },
            });
            return ge.player.activeAttunements.PULSE_CANNON || [];
        });
        expect(active).not.toContain('PULSE_CANNON_CRYO');
        expect(active).toHaveLength(0);
    });

    test('an active attunement makes the weapon fire that element', async ({ page }) => {
        const els = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            ge.unlockPreRunItem('attunements', 'PULSE_CANNON_PYRO');
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                attunements: { PULSE_CANNON: ['PULSE_CANNON_PYRO'] },
            });
            // Stamp a fresh bullet via the live fire-path chokepoint.
            const bullet = {};
            ge.player.applyGlobalBulletUpgrades(bullet);
            return bullet.elements;
        });
        expect(els).toEqual(['PYRO']); // base KINETIC replaced by the attunement
    });

    test('no fatal JS errors through the attunement flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 99999;
            ge.unlockPreRunItem('attunements', 'PULSE_CANNON_PYRO');
            ge.unlockPreRunItem('attunements', 'PULSE_CANNON_CRYO');
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                attunements: { PULSE_CANNON: ['PULSE_CANNON_PYRO', 'PULSE_CANNON_CRYO'] },
            });
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});

test.describe('QA-13b: Mechanic mods (BUILD tree, Phase W5)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the equipped weapon shows mechanic-mod chips in BUILD mode', async ({ page }) => {
        // 7.0.0 — mods render as `.shop-prerun-chip[data-kind="mod"]` dropdown
        // chips under the equipped weapon (compact list replaced the orbit tree).
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const nodes = [...document.querySelectorAll('#shop-tree-primary .shop-prerun-chip[data-kind="mod"]')];
            return { count: nodes.length, ids: nodes.map((n) => n.dataset.id) };
        });
        expect(r.count).toBeGreaterThan(0);
        expect(r.ids).toContain('PULSE_PIERCING');
        expect(r.ids).toContain('PULSE_EXPLODE');
    });

    test('unlocking a mod deducts account-gold and persists', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            const ok = ge.unlockPreRunItem('mods', 'PULSE_PIERCING');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, owned: meta.unlockedMods || [] };
        });
        expect(r.ok).toBe(true);
        expect(r.gold).toBeLessThan(20000);
        expect(r.owned).toContain('PULSE_PIERCING');
    });

    test('START RUN grants an owned active mod as a powerup stack', async ({ page }) => {
        const stacks = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            ge.unlockPreRunItem('mods', 'PULSE_PIERCING');
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                mods: { PULSE_CANNON: ['PULSE_PIERCING'] },
            });
            return ge.player.getPowerupStacks('PULSE_PIERCING');
        });
        expect(stacks).toBeGreaterThanOrEqual(1);
    });

    test('a non-owned mod is dropped on START RUN', async ({ page }) => {
        const stacks = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON'],
                mods: { PULSE_CANNON: ['PULSE_EXPLODE'] }, // never unlocked
            });
            return ge.player.getPowerupStacks('PULSE_EXPLODE');
        });
        expect(stacks).toBe(0);
    });
});

test.describe('QA-13c: Ability attunements (Phase W6 plumbing)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('unlocking an ability attunement deducts account-gold + persists', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            const ok = ge.unlockPreRunItem('abilityAttunements', 'EMP_PULSE_VOLT');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, owned: meta.unlockedAbilityAttunements || [] };
        });
        expect(r.ok).toBe(true);
        expect(r.gold).toBeLessThan(20000);
        expect(r.owned).toContain('EMP_PULSE_VOLT');
    });

    test('START RUN applies an owned ability attunement to the player', async ({ page }) => {
        const attune = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 20000;
            ge.unlockPreRunItem('abilityAttunements', 'EMP_PULSE_VOLT');
            ge.beginPreRunFromTree({
                abilities: ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', null],
                abilityAttune: { EMP_PULSE: 'EMP_PULSE_VOLT' },
            });
            return ge.player.activeAbilityAttune.EMP_PULSE;
        });
        expect(attune).toBe('EMP_PULSE_VOLT');
    });

    test('a non-owned ability attunement is dropped on START RUN', async ({ page }) => {
        const attune = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({
                abilities: ['EMP_PULSE', null, null, null],
                abilityAttune: { EMP_PULSE: 'EMP_PULSE_CRYO' }, // never unlocked
            });
            return ge.player.activeAbilityAttune.EMP_PULSE;
        });
        expect(attune).toBeUndefined();
    });
});
