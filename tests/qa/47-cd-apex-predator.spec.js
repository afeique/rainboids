/**
 * QA-47: APEX PREDATOR keystone (CD-02 §6c) — live execute mechanic.
 *
 * Apex Predator is a no-downside offense keystone: your damage EXECUTES enemies
 * the hit would leave at/below 15% of their max HP. Bosses are exempt. The
 * mechanic lives in collision-system.applyDamageToEnemy, gated on
 * hasPassive('APEX_PREDATOR') — exposed on the engine via ge.applyDamageToEnemy.
 *
 * Verifies, through the live game surface:
 *   • a chipped-below-15% enemy is EXECUTED by the next (tiny) hit when equipped;
 *   • the SAME chipped enemy SURVIVES that hit with NO passive (default-safe);
 *   • an above-threshold enemy takes normal damage (no early execute);
 *   • a boss at low HP is NEVER executed;
 *   • no fatal JS errors through the flow.
 *
 * Bounded: spawns a couple of enemies, applies a handful of hits, no AI loop.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const FATAL = (m) =>
    !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
    !m.includes('Font') && !m.includes('net::ERR') &&
    !/favicon|ResizeObserver|AudioContext|Failed to load resource/i.test(m);

test.describe('QA-47: Apex Predator execute keystone', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('a chipped (<15%) enemy is EXECUTED by a tiny hit when APEX_PREDATOR is equipped', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Equip APEX_PREDATOR via the real owned+slot+equip path.
            p.setOwnedPassives(['APEX_PREDATOR']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'APEX_PREDATOR');
            // Fresh enemy, chipped to a 14% sliver (≤ 15% of 100 maxHP).
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.enemyPool.cleanupInactive();
            const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
            e.maxHealth = 100; e.health = 14;
            const res = ge.applyDamageToEnemy(e, 1, { showNumber: false }); // 14 − 1 = 13 ≤ 15 → execute
            return { equipped: p.hasPassive('APEX_PREDATOR'), health: e.health, destroyed: !!res.destroyed };
        });
        expect(r.equipped).toBe(true);
        expect(r.health).toBe(0);       // executed (health driven to 0)
        expect(r.destroyed).toBe(true); // kill path fired
    });

    test('DEFAULT-SAFE: the SAME chipped enemy SURVIVES the tiny hit with NO passive', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.setOwnedPassives([]);              // nothing equipped
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.enemyPool.cleanupInactive();
            const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
            e.maxHealth = 100; e.health = 14;
            ge.applyDamageToEnemy(e, 1, { showNumber: false });
            return { hasApex: p.hasPassive('APEX_PREDATOR'), health: e.health, active: e.active };
        });
        expect(r.hasApex).toBe(false);
        expect(r.health).toBeCloseTo(13); // normal: 14 − 1
        expect(r.active).toBe(true);
    });

    test('an above-threshold enemy takes NORMAL damage with APEX_PREDATOR (no early execute)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.setOwnedPassives(['APEX_PREDATOR']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'APEX_PREDATOR');
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.enemyPool.cleanupInactive();
            const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
            e.maxHealth = 100; e.health = 60;
            ge.applyDamageToEnemy(e, 10, { showNumber: false }); // 60 − 10 = 50, well above 15
            return { health: e.health, active: e.active };
        });
        expect(r.health).toBeCloseTo(50);
        expect(r.active).toBe(true);
    });

    test('a BOSS at low HP is NEVER executed by APEX_PREDATOR', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.setOwnedPassives(['APEX_PREDATOR']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'APEX_PREDATOR');
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.enemyPool.cleanupInactive();
            const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
            // Mark it a boss with no invuln/phase/core/intro state → reaches the
            // damage path but is execute-exempt.
            e.isBoss = true;
            e.maxHealth = 100; e.health = 14;
            ge.applyDamageToEnemy(e, 1, { showNumber: false });
            return { health: e.health, active: e.active };
        });
        expect(r.health).toBeCloseTo(13); // normal hit only — not executed
        expect(r.active).toBe(true);
    });

    test('no fatal JS errors through the Apex Predator flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.setOwnedPassives(['APEX_PREDATOR']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'APEX_PREDATOR');
            const e = ge.enemyPool.get(400, 400, 'HUNTER', 1);
            e.maxHealth = 100; e.health = 12;
            ge.applyDamageToEnemy(e, 1, { showNumber: false });
        });
        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
