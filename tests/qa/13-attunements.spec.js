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

    test('weapon clusters show attunement orbit nodes in BUILD mode', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const nodes = [...document.querySelectorAll('#shop-tree-primary .shop-node--attune')];
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
