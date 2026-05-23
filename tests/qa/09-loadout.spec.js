/**
 * QA-09: LOADOUT screen + chosen-loadout narrowing (Phase R5)
 */

import { test, expect } from '@playwright/test';
import { loadGame, getGameState } from '../helpers/game-helpers.js';

test.describe('QA-09: Loadout screen (Phase R5)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('ARMORY → LOADOUT: START RUN opens the loadout screen', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge._armoryOverlay.startRun();   // routes to the loadout screen
            const ov = document.getElementById('loadout-overlay');
            return { state: ge.game.state, display: ov && ov.style.display, open: ge.isLoadoutOpen() };
        });
        expect(r.state).toBe('LOADOUT');
        expect(r.display).toBe('flex');
        expect(r.open).toBe(true);
    });

    test('toggling picks respects the 4-slot cap', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // Unlock plenty of primaries so we can try to over-pick.
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedPrimaries: ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM'],
            }));
            ge.openLoadout();
            const lo = ge._loadoutOverlay;
            lo.chosen.primaries = [];
            for (const id of ['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM']) {
                lo.toggle('primaries', id);
            }
            return lo.chosen.primaries.length;
        });
        expect(r).toBe(4); // capped
    });

    test('BEGIN narrows the run owned pool to the chosen loadout', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedPrimaries: ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER'],
            }));
            ge.openLoadout();
            const lo = ge._loadoutOverlay;
            // choose exactly 2 primaries out of 4 unlocked (PULSE base + 3)
            lo.chosen.primaries = ['PULSE_CANNON', 'STORM_NEEDLES'];
            lo.begin();
            return {
                owned: [...ge.player.ownedPrimaries].sort(),
                active: ge.player.activePrimary,
                state: ge.game.state,
            };
        });
        expect(r.owned).toEqual(['PULSE_CANNON', 'STORM_NEEDLES']); // narrowed, NOT all 4 unlocked
        expect(r.active).toBe('PULSE_CANNON');
        expect(['WAVE_TRANSITION', 'PLAYING']).toContain(r.state);
    });

    test('chosen abilities fill the 4 ability slots', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedAbilities: ['EMP_PULSE', 'SENTRY_DRONE'],
            }));
            ge.openLoadout();
            const lo = ge._loadoutOverlay;
            lo.chosen.abilities = ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE'];
            lo.begin();
            return ge.player.equippedAbilities;
        });
        expect(r).toEqual(['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE']);
    });

    test('loadout persists to meta for next time', async ({ page }) => {
        const saved = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openLoadout();
            ge._loadoutOverlay.chosen.powers = ['CHARGE_SHOT'];
            ge._loadoutOverlay.begin();
            return JSON.parse(localStorage.getItem('rainboidsMeta') || '{}').loadout;
        });
        expect(saved).toBeTruthy();
        expect(saved.powers).toContain('CHARGE_SHOT');
    });

    test('BACK returns to the ARMORY', async ({ page }) => {
        const state = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openLoadout();
            ge._loadoutOverlay.back();
            return ge.game.state;
        });
        expect(state).toBe('ARMORY');
    });

    test('no fatal JS errors through the loadout flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge._armoryOverlay.startRun();
            ge._loadoutOverlay.toggle('primaries', 'PULSE_CANNON');
            ge._loadoutOverlay.toggle('abilities', 'BULWARK');
            ge._loadoutOverlay.back();
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
