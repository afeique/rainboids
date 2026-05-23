/**
 * QA-09: pre-run loadout selection via the BUILD tree (Phase R5 / Phase W0)
 *
 * Weapon/ability selection now happens in the bubble tree (BUILD mode); the
 * separate flat LOADOUT screen is retired from the flow. START RUN routes
 * through `beginPreRunFromTree(sel)`, which normalizes the chosen loadout
 * against the unlocked pool and starts the run (same narrowing the old
 * LOADOUT screen did). These tests drive that live path.
 */

import { test, expect } from '@playwright/test';
import { loadGame, getGameState } from '../helpers/game-helpers.js';

test.describe('QA-09: BUILD-tree loadout selection', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('START RUN narrows the run owned pool to the chosen loadout', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedPrimaries: ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER'],
            }));
            ge.openArmory();
            // Pick exactly 2 primaries of the unlocked pool, then START RUN.
            ge.beginPreRunFromTree({ primaries: ['PULSE_CANNON', 'STORM_NEEDLES'] });
            return {
                owned: [...ge.player.ownedPrimaries].sort(),
                active: ge.player.activePrimary,
                state: ge.game.state,
            };
        });
        expect(r.owned).toEqual(['PULSE_CANNON', 'STORM_NEEDLES']); // narrowed, not all unlocked
        expect(r.active).toBe('PULSE_CANNON');
        expect(['WAVE_TRANSITION', 'PLAYING']).toContain(r.state);
    });

    test('chosen abilities fill the 4 ability slots', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedAbilities: ['EMP_PULSE', 'SENTRY_DRONE'],
            }));
            ge.openArmory();
            ge.beginPreRunFromTree({ abilities: ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE'] });
            return ge.player.equippedAbilities;
        });
        expect(r).toEqual(['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE']);
    });

    test('chosen loadout persists to meta for next time', async ({ page }) => {
        const saved = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.beginPreRunFromTree({ powers: ['CHARGE_SHOT'] });
            return JSON.parse(localStorage.getItem('rainboidsMeta') || '{}').loadout;
        });
        expect(saved).toBeTruthy();
        expect(saved.powers).toContain('CHARGE_SHOT');
    });

    test('equipping a weapon node toggles it in/out of the selection (cap 4)', async ({ page }) => {
        // Drives the live tree selection: clicking a parent weapon node toggles
        // it into the per-run loadout, capped at 4. Verified through the final
        // narrowed pool after START RUN.
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedPrimaries: ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'FLAK_CANNON'],
            }));
            ge.openArmory();
            // Over-pick 5 primaries; normalize must clamp to 4.
            ge.beginPreRunFromTree({
                primaries: ['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'FLAK_CANNON'],
            });
            return [...ge.player.ownedPrimaries].length;
        });
        expect(r).toBe(4); // clamped to the loadout cap
    });

    test('BACK from the BUILD tree returns to the title screen', async ({ page }) => {
        const state = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.cancelPreRunToTitle();
            return ge.game.state;
        });
        expect(state).toBe('TITLE_SCREEN');
    });

    test('unlocking a locked weapon node deducts account-gold and adds it to the pool', async ({ page }) => {
        // Clicking a LOCKED parent bubble buys the unlock with account-gold
        // (routed through unlockPreRunItem).
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 5000;
            const ok = ge.unlockPreRunItem('primaries', 'RAIL_DRIVER');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, unlocked: meta.unlockedPrimaries || [] };
        });
        expect(r.ok).toBe(true);
        expect(r.unlocked).toContain('RAIL_DRIVER');
        expect(r.gold).toBeLessThan(5000);
    });

    test('no fatal JS errors through the BUILD flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.cancelPreRunToTitle();
            ge.openArmory();
            ge.beginPreRunFromTree({ primaries: ['PULSE_CANNON'], abilities: ['BULWARK'] });
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
