/**
 * QA-40: CD sustain powerups (CD-04 / T2) — REGENERATOR + LIFE_ON_KILL.
 *
 *   • REGENERATOR — while held, the effective-regen ceiling rises 3.0 → 5.0
 *     HP/s, read as a gated cap in progression.getEffectiveRegen. The doc's
 *     "in-combat +0.5/s" nuance is DEFERRED; this ships the cap raise only.
 *   • LIFE_ON_KILL — each enemy kill restores a small flat amount of HP, routed
 *     through gainHealth (so over-heal banks toward a tank). Gated on the
 *     powerup in combat-manager.onEnemyKill.
 *
 * These exercise the LIVE game (ge.player.getEffectiveRegen / ge.onEnemyKill on a
 * real pooled enemy) and verify:
 *   • REGENERATOR: with enough regen to exceed 3, getEffectiveRegen exceeds 3
 *     (up to 5) while held
 *   • REGENERATOR DEFAULT-SAFE: WITHOUT it, regen is capped at 3 even with the
 *     same regen sources
 *   • LIFE_ON_KILL: a kill raises HP while held
 *   • LIFE_ON_KILL DEFAULT-SAFE: WITHOUT it, a kill heals nothing
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Toggle a powerup on the live player by stamping the powerups Map directly (same
// path the blood-sustain spec uses for VAMPIRISM), clear invincibility + base
// shield, and optionally seed item regen affixes so total regen exceeds 3 HP/s.
async function primePlayer(page, { regenerator = false, lifeOnKill = false, itemRegen = 0, hpFrac = 0.5 } = {}) {
    return page.evaluate(({ regenerator, lifeOnKill, itemRegen, hpFrac }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (regenerator) p.powerups.set('REGENERATOR', { stacks: 1 });
        else p.powerups.delete('REGENERATOR');
        if (lifeOnKill) p.powerups.set('LIFE_ON_KILL', { stacks: 1 });
        else p.powerups.delete('LIFE_ON_KILL');
        p.invincible = false;
        p.invincibilityTimer = 0;
        p.shield = 0;
        // Seed a fat regen affix on an equipped item so total regen blows past 3
        // HP/s — lets us prove the cap (3 vs 5) without depending on REGEN drops.
        if (itemRegen > 0) {
            if (!p.equippedItems) p.equippedItems = {};
            p.equippedItems.__qaRegen = { affixes: [{ type: 'regen', value: itemRegen }] };
        } else if (p.equippedItems) {
            delete p.equippedItems.__qaRegen;
        }
        // Drop HP below max so a heal is measurable (and never clamped at the cap).
        const maxHp = (typeof p.getEffectiveMaxHealth === 'function')
            ? p.getEffectiveMaxHealth() : p.maxHealth;
        p.health = maxHp * hpFrac;
        return {
            regenerator: p.getPowerupStacks('REGENERATOR') > 0,
            lifeOnKill: p.getPowerupStacks('LIFE_ON_KILL') > 0,
            regen: p.getEffectiveRegen(),
            maxHp, health: p.health,
        };
    }, { regenerator, lifeOnKill, itemRegen, hpFrac });
}

// Spawn one clean HUNTER with a big HP pool so onEnemyKill has a real target.
async function spawnTarget(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        for (const e of [...ge.enemyPool.activeObjects]) {
            ge.applyDamageToEnemy(e, 1e9, { showNumber: false });
        }
        ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
        const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
        if (!enemy) return false;
        enemy.maxHealth = 1e6;
        enemy.health = 1e6;
        return true;
    });
}

test.describe('QA-40: REGENERATOR + LIFE_ON_KILL sustain powerups', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('REGENERATOR: regen can exceed 3 (up to 5) while held', async ({ page }) => {
        const prime = await primePlayer(page, { regenerator: true, itemRegen: 10 });
        expect(prime.regenerator).toBe(true);
        expect(prime.regen).toBeGreaterThan(3);
        expect(prime.regen).toBeLessThanOrEqual(5);
        expect(prime.regen).toBeCloseTo(5, 5); // 10 HP/s of regen clamps to the 5 cap
    });

    test('REGENERATOR DEFAULT-SAFE: without it, regen is capped at 3', async ({ page }) => {
        const prime = await primePlayer(page, { regenerator: false, itemRegen: 10 });
        expect(prime.regenerator).toBe(false);
        expect(prime.regen).toBeCloseTo(3, 5); // same regen sources, base cap
    });

    test('LIFE_ON_KILL: a kill raises HP while held', async ({ page }) => {
        await primePlayer(page, { lifeOnKill: true, hpFrac: 0.5 });
        await spawnTarget(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const before = ge.player.health;
            ge.onEnemyKill(enemy);
            return { before, after: ge.player.health };
        });
        expect(r.after).toBeGreaterThan(r.before); // flat heal landed
    });

    test('LIFE_ON_KILL DEFAULT-SAFE: no powerup → a kill heals nothing', async ({ page }) => {
        await primePlayer(page, { lifeOnKill: false, hpFrac: 0.5 });
        await spawnTarget(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const before = ge.player.health;
            ge.onEnemyKill(enemy);
            return { before, after: ge.player.health };
        });
        expect(r.after).toBeCloseTo(r.before, 3); // byte-for-byte: no heal
    });

    test('no fatal JS errors through the sustain-powerup flow', async ({ page }) => {
        await primePlayer(page, { regenerator: true, lifeOnKill: true, itemRegen: 10, hpFrac: 0.3 });
        await spawnTarget(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.getEffectiveRegen();
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            if (enemy) ge.onEnemyKill(enemy);
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
