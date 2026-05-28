/**
 * QA-09: pre-run BUILD → run start (8.x — weapons are equipped gear).
 *
 * The pre-run BUILD tree no longer picks weapons. The run's PRIMARY comes from
 * the equipped weapon item (meta.equippedWeapon, its archetype → firing
 * pattern); POWERS are auto-granted (everything unlocked); only the optional
 * ABILITY picks + run shape flow through `beginPreRunFromTree(sel)`. These tests
 * drive that live path.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

// A minimal stash-ready weapon item (the shape createWeaponItem produces: a
// synthetic slot:'weapon'/kind:'weapon' carrying an archetype + traits).
const RAIL_ITEM = { kind: 'weapon', slot: 'weapon', archetype: 'RAIL', name: 'Test Rail', level: 5, rarity: 'rare', traits: [] };

test.describe('QA-09: BUILD → run start (weapons-as-gear)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('the run primary comes from the EQUIPPED weapon item', async ({ page }) => {
        const r = await page.evaluate((wpn) => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({ equippedWeapon: wpn }));
            ge.openArmory();
            ge.beginPreRunFromTree({}); // no weapon pick — comes from the equipped item
            return {
                active: ge.player.activePrimary,
                owned: [...ge.player.ownedPrimaries].sort(),
                equippedName: ge.player.equippedWeapon && ge.player.equippedWeapon.name,
                state: ge.game.state,
            };
        }, RAIL_ITEM);
        expect(r.active).toBe('RAIL_DRIVER');          // RAIL archetype → its firing pattern
        expect(r.owned).toEqual(['RAIL_DRIVER']);      // primary pool = the equipped weapon only
        expect(r.equippedName).toBe('Test Rail');
        expect(['WAVE_TRANSITION', 'PLAYING']).toContain(r.state);
    });

    test('with no equipped weapon, the run falls back to the default Pulse Cannon', async ({ page }) => {
        const active = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({ levelMigrated: true })); // no weapon, no stash
            ge.openArmory();
            ge.beginPreRunFromTree({});
            return ge.player.activePrimary;
        });
        expect(active).toBe('PULSE_CANNON');
    });

    test('a stash weapon is auto-equipped when none is equipped (pre-pivot migration)', async ({ page }) => {
        const r = await page.evaluate((wpn) => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({ stash: [wpn], levelMigrated: true }));
            ge.openArmory();
            ge.beginPreRunFromTree({});
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { active: ge.player.activePrimary, equipped: meta.equippedWeapon && meta.equippedWeapon.name };
        }, RAIL_ITEM);
        expect(r.active).toBe('RAIL_DRIVER');
        expect(r.equipped).toBe('Test Rail'); // migrated out of the stash into the weapon slot
    });

    test('the run power comes from the EQUIPPED power weapon item', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                equippedPowerWeapon: { kind: 'powerweapon', slot: 'power', powerId: 'NOVA_BLAST', name: 'Nova Blast', level: 1 },
                levelMigrated: true,
            }));
            ge.openArmory();
            ge.beginPreRunFromTree({});
            return { active: ge.player.activePower, owned: [...ge.player.ownedPowers].sort() };
        });
        expect(r.active).toBe('NOVA_BLAST');
        expect(r.owned).toEqual(['NOVA_BLAST']); // power pool = the equipped power only
    });

    test('with no equipped power weapon, the power falls back to Charge Shot', async ({ page }) => {
        const active = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({ levelMigrated: true }));
            ge.openArmory();
            ge.beginPreRunFromTree({});
            return ge.player.activePower;
        });
        expect(active).toBe('CHARGE_SHOT');
    });

    test('chosen abilities fill the ability slots', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // 8.x — abilities are gold-gated; only OWNED abilities can be equipped,
            // so seed them as unlocked first (the gold-buy path is covered by QA-49).
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedAbilities: ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE'],
            }));
            ge.beginPreRunFromTree({ abilities: ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE'] });
            return ge.player.equippedAbilities;
        });
        expect(r).toEqual(['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE']);
    });

    test('chosen abilities persist to meta for next time (weapons/powers do not)', async ({ page }) => {
        const saved = await page.evaluate(() => {
            const ge = window.gameEngine;
            // 8.x — must OWN an ability to equip it (gold-gated); seed it unlocked.
            localStorage.setItem('rainboidsMeta', JSON.stringify({ unlockedAbilities: ['BULWARK'] }));
            ge.openArmory();
            ge.beginPreRunFromTree({ abilities: ['BULWARK'] });
            return JSON.parse(localStorage.getItem('rainboidsMeta') || '{}').loadout;
        });
        expect(saved).toBeTruthy();
        expect(saved.abilities).toContain('BULWARK');
        expect(saved.primaries).toBeUndefined(); // weapons are equipped gear, not part of the loadout
        expect(saved.powers).toBeUndefined();
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

    test('no fatal JS errors through the BUILD flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.cancelPreRunToTitle();
            ge.openArmory();
            ge.beginPreRunFromTree({ abilities: ['BULWARK'] });
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
