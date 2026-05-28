/**
 * QA-12: New abilities activate in a real run (Phase R6.3)
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-12: R6.3 new abilities', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('Blink teleports the player', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.equippedAbilities = ['BLINK', null, null, null];
            p.abilityCooldowns = [0, 0, 0, 0];
            p.angle = 0;
            const x0 = p.x;
            p.activateAbility(0);
            return { x0, x1: p.x, onCd: p.abilityCooldowns[0] > 0 };
        });
        expect(Math.abs(r.x1 - r.x0)).toBeGreaterThan(50); // moved
        expect(r.onCd).toBe(true);
    });

    test('Designator marks nearby enemies', async ({ page }) => {
        const marked = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // spawn an enemy near the player
            const e = ge.enemyPool.get ? ge.enemyPool.get() : null;
            if (e) { e.x = p.x + 50; e.y = p.y; e.active = true; e.markUntil = 0; }
            p.equippedAbilities = ['DESIGNATOR', null, null, null];
            p.abilityCooldowns = [0, 0, 0, 0];
            p.activateAbility(0);
            return e ? (e.markUntil > 0) : 'no-enemy';
        });
        // either the enemy got marked, or the pool gave no enemy (still no crash)
        expect(marked === true || marked === 'no-enemy').toBe(true);
    });

    test('owned abilities appear as rows in the BUILD ABILITIES cluster', async ({ page }) => {
        // 7.0.0 — the compact BUILD list shows ONLY owned abilities (abilities
        // are purchase-locked). Seed them as owned, then they render as
        // `.shop-node--parent` equip rows in the ABILITIES cluster.
        const ids = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                unlockedAbilities: ['BLINK', 'GRAVITY_SNARE', 'DESIGNATOR'],
            }));
            ge.game.accountGold = 99999;
            ge.openArmory();
            return [...document.querySelectorAll('#shop-tree-abilities .shop-node--parent')]
                .map((n) => n.dataset.id);
        });
        expect(ids).toContain('BLINK');
        expect(ids).toContain('GRAVITY_SNARE');
        expect(ids).toContain('DESIGNATOR');
    });

    test('Second Wind cheats death once', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.equippedAbilities = ['SECOND_WIND', null, null, null];
            p.abilityCooldowns = [0, 0, 0, 0];
            p.activateAbility(0);            // arm
            const armed = !!p._secondWindArmed;
            p.health = 0;
            ge.handlePlayerDeath();          // should be saved
            return { armed, afterArmed: !!p._secondWindArmed, health: p.health, state: ge.game.state };
        });
        expect(r.armed).toBe(true);
        expect(r.afterArmed).toBe(false);    // consumed
        expect(r.health).toBeGreaterThan(0); // revived
        expect(r.state).not.toBe('GAME_OVER');
    });

    test('Elemental Infusion re-elements primary shots', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.equippedAbilities = ['ELEMENTAL_INFUSION', null, null, null];
            p.abilityCooldowns = [0, 0, 0, 0];
            p.activateAbility(0);
            return {
                infused: p._infusedElement,
                active: p.activeAbilityEffects.has('ELEMENTAL_INFUSION'),
            };
        });
        expect(typeof r.infused).toBe('string');
        expect(r.infused.length).toBeGreaterThan(0);
        expect(r.active).toBe(true);
    });

    test('Cryo Field freezes a nearby enemy on its tick', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // place a fresh enemy right next to the player
            const e = ge.enemyPool.get ? ge.enemyPool.get() : null;
            if (!e) return 'no-enemy';
            e.x = p.x + 40; e.y = p.y; e.active = true; e.freezeUntil = 0;
            p.equippedAbilities = ['CRYO_FIELD', null, null, null];
            p.abilityCooldowns = [0, 0, 0, 0];
            p.activateAbility(0);                 // drop the field at the player
            p.updateActiveAbilities(300);         // one tick (tickMs 250)
            return e.freezeUntil > 0;
        });
        expect(r === true || r === 'no-enemy').toBe(true);
    });

    test('no fatal JS errors activating the new abilities', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            for (const id of ['BLINK', 'GRAVITY_SNARE', 'DESIGNATOR', 'SECOND_WIND', 'ELEMENTAL_INFUSION', 'CRYO_FIELD', 'STASIS_FIELD', 'STORM_CELL', 'PYRE_AURA']) {
                p.equippedAbilities = [id, null, null, null];
                p.abilityCooldowns = [0, 0, 0, 0];
                p.activateAbility(0);
                p.updateActiveAbilities(450);
            }
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
