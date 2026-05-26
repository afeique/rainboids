/**
 * QA-38: BLOODLUST passive (CD-11) — stacking on-kill outgoing-damage buff.
 *
 * The offensive complement to BLOODSHIELD: each enemy kill grants a Bloodlust
 * stack; stacks give +4% outgoing damage each (cap +40% at 10 stacks) and decay
 * one stack per interval without a kill. These tests exercise the LIVE game
 * (ge.applyDamageToEnemy on a real pooled enemy / ge.onEnemyKill / player.update
 * decay) and verify:
 *   • outgoing damage scales with the stack count (more stacks → more HP loss)
 *   • a kill grants a stack while the passive is equipped (the gain hook)
 *   • stacks decay over time without a fresh kill
 *   • DEFAULT-SAFE: a player WITHOUT the passive / with 0 stacks deals baseline
 *     damage (byte-for-byte) — the hot combat path is unchanged
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Equip (or strip) the BLOODLUST passive on the live player, clear invincibility
// + base shield so the damage arithmetic is exact, and set the stack count.
async function primePlayer(page, { stacks = 0, equipBloodlust = false } = {}) {
    return page.evaluate(({ stacks, equipBloodlust }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (equipBloodlust) {
            p.setOwnedPassives(['BLOODLUST']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'BLOODLUST');
        } else {
            p.setOwnedPassives([]);
            p.equippedPassives[0] = null;
            p._rebuildActivePassives();
        }
        p.invincible = false;
        p.invincibilityTimer = 0;
        p.shield = 0;
        p.bloodlustStacks = stacks;
        p._bloodlustRefreshMs = Date.now();
        return { hasPassive: p.hasPassive('BLOODLUST'), stacks: p.bloodlustStacks };
    }, { stacks, equipBloodlust });
}

// Spawn one clean HUNTER, give it a big HP pool (so a fixed hit can't kill it or
// clamp), apply `damage` once through the LIVE damage path, return the HP drop.
// `showNumber:false` keeps the test off the damage-number renderer.
async function measureHpDrop(page, damage) {
    return page.evaluate((damage) => {
        const ge = window.gameEngine;
        // Clear the pool so we own exactly one target.
        for (const e of [...ge.enemyPool.activeObjects]) {
            ge.applyDamageToEnemy(e, 1e9, { showNumber: false });
        }
        ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
        const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
        if (!enemy) return null;
        enemy.maxHealth = 1e6;
        enemy.health = 1e6;
        enemy.armor = 0;            // strip the armor floor (HUNTER has none, but be exact)
        enemy.stunUntil = 0;        // no EMP_OVERLOAD amplifier
        enemy.charge = null;        // no JUGGERNAUT rear-exposed window
        const before = enemy.health;
        ge.applyDamageToEnemy(enemy, damage, { showNumber: false });
        return before - enemy.health;
    }, damage);
}

test.describe('QA-38: BLOODLUST stacking damage buff', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('outgoing damage scales with the stack count (+4% per stack)', async ({ page }) => {
        const BASE = 1000;
        // 0 stacks (passive equipped, but no buff) → baseline.
        await primePlayer(page, { stacks: 0, equipBloodlust: true });
        const drop0 = await measureHpDrop(page, BASE);
        // 10 stacks (full) → +40%.
        await primePlayer(page, { stacks: 10, equipBloodlust: true });
        const dropFull = await measureHpDrop(page, BASE);

        expect(drop0).toBeCloseTo(BASE, 3);          // 0 stacks → exactly base
        expect(dropFull).toBeGreaterThan(drop0);     // more stacks → more damage
        expect(dropFull).toBeCloseTo(BASE * 1.4, 1); // +4% × 10 = +40%
    });

    test('a kill grants a Bloodlust stack while equipped (the gain hook)', async ({ page }) => {
        await primePlayer(page, { stacks: 0, equipBloodlust: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const before = ge.player.bloodlustStacks;
            ge.onEnemyKill(enemy);            // the canonical kill hook
            return { before, after: ge.player.bloodlustStacks };
        });
        expect(r.before).toBe(0);
        expect(r.after).toBe(1);
    });

    test('stacks decay over time without a fresh kill', async ({ page }) => {
        await primePlayer(page, { stacks: 6, equipBloodlust: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Backdate the refresh stamp well past the decay interval, then step
            // update() once with a positive dt. At least one stack must shed.
            p._bloodlustRefreshMs = Date.now() - 60000;
            p._lastEnergyTime = Date.now() - 16;
            const before = p.bloodlustStacks;
            // update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged, gameField)
            p.update({}, ge.particlePool, ge.bulletPool, ge.audioManager, ge.colorStarPool, false, ge.gameField);
            return { before, after: p.bloodlustStacks };
        });
        expect(r.before).toBe(6);
        expect(r.after).toBeLessThan(r.before);   // decayed
    });

    test('DEFAULT-SAFE: no passive / 0 stacks → baseline damage', async ({ page }) => {
        const BASE = 1000;
        await primePlayer(page, { stacks: 0, equipBloodlust: false });
        const drop = await measureHpDrop(page, BASE);
        // No passive → the Bloodlust block is skipped entirely; full base lands.
        expect(drop).toBeCloseTo(BASE, 3);
    });

    test('no fatal JS errors through the bloodlust flow', async ({ page }) => {
        await primePlayer(page, { stacks: 4, equipBloodlust: true });
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.spawnLeveledEnemies('HUNTER', 2, { onScreen: true, cap: 9999 });
            for (const e of [...ge.enemyPool.activeObjects]) {
                ge.applyDamageToEnemy(e, 50, { showNumber: false }); // buffed hit
                ge.onEnemyKill(e);                                   // stack gain
            }
            ge.player._bloodlustRefreshMs = Date.now() - 60000;
            ge.player._lastEnergyTime = Date.now() - 16;
            ge.player.update({}, ge.particlePool, ge.bulletPool, ge.audioManager, ge.colorStarPool, false, ge.gameField); // decay
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
