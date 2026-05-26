/**
 * QA-39: CD "blood" sustain passives (T9) — SANGUINE + HEMOGLUTTON.
 *
 *   • SANGUINE — each enemy kill heals 4% of effective max HP, routed through
 *     gainHealth (so over-heal banks toward a tank). Gated on the passive in
 *     combat-manager.onEnemyKill.
 *   • HEMOGLUTTON — Vampirism lifesteal heals DOUBLE when it lands on a
 *     status-afflicted enemy (reuses _enemyHasStatus). Gated at the enemy
 *     lifesteal site in collision-system.js.
 *
 * These exercise the LIVE game (ge.onEnemyKill / ge.applyDamageToEnemy on a real
 * pooled enemy) and verify:
 *   • SANGUINE: a kill heals ~4% max HP while equipped (the on-kill heal)
 *   • SANGUINE DEFAULT-SAFE: WITHOUT the passive, a kill heals nothing
 *   • HEMOGLUTTON: lifesteal on a status-afflicted enemy heals ~2× the heal vs a
 *     status-free enemy (same applied damage + same Vampirism)
 *   • HEMOGLUTTON DEFAULT-SAFE: WITHOUT the passive, status-afflicted lifesteal
 *     equals the status-free baseline (byte-for-byte)
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Equip (or strip) a single passive on the live player, give Vampirism stacks if
// requested, clear invincibility + base shield, and drop HP below max so any heal
// is measurable (and never clamped at the cap). Returns the live equip state.
async function primePlayer(page, { passive = null, vampStacks = 0, hpFrac = 0.5 } = {}) {
    return page.evaluate(({ passive, vampStacks, hpFrac }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (passive) {
            p.setOwnedPassives([passive]);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, passive);
        } else {
            p.setOwnedPassives([]);
            p.equippedPassives[0] = null;
            p._rebuildActivePassives();
        }
        p.invincible = false;
        p.invincibilityTimer = 0;
        p.shield = 0;
        // Vampirism stacks live in the powerups Map (5% lifesteal per stack).
        if (vampStacks > 0) p.powerups.set('VAMPIRISM', { stacks: vampStacks });
        else p.powerups.delete('VAMPIRISM');
        // Drop HP below max so a heal is measurable.
        const maxHp = (typeof p.getEffectiveMaxHealth === 'function')
            ? p.getEffectiveMaxHealth() : p.maxHealth;
        p.health = maxHp * hpFrac;
        return {
            hasPassive: passive ? p.hasPassive(passive) : false,
            maxHp, health: p.health,
        };
    }, { passive, vampStacks, hpFrac });
}

// Spawn one clean HUNTER, give it a big HP pool (so a single hit can't kill or
// clamp). `afflict` stamps a future-dated burn status so _enemyHasStatus() reads
// true. Returns whether the target landed.
async function spawnTarget(page, { afflict = false } = {}) {
    return page.evaluate(({ afflict }) => {
        const ge = window.gameEngine;
        // Clear the pool so we own exactly one target.
        for (const e of [...ge.enemyPool.activeObjects]) {
            ge.applyDamageToEnemy(e, 1e9, { showNumber: false });
        }
        ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
        const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
        if (!enemy) return false;
        enemy.maxHealth = 1e6;
        enemy.health = 1e6;
        enemy.armor = 0;
        enemy.charge = null;
        // _enemyHasStatus reads frameClock.now (~Date.now() while the loop runs);
        // a far-future stamp guarantees the burn status is "active".
        if (afflict) enemy.brnUntil = Date.now() + 1e6;
        else enemy.brnUntil = 0;
        return true;
    }, { afflict });
}

// Fire a single player bullet at the spawned HUNTER's exact position and run the
// LIVE handleCollisions() bullet→enemy pass — the path that owns the enemy
// lifesteal site we edited. Returns the player's HP gain from that one hit.
async function lifestealHpGain(page, damage) {
    return page.evaluate((damage) => {
        const ge = window.gameEngine;
        const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
        if (!enemy) return null;
        // Clear any stray bullets, then spawn one on top of the enemy so the
        // collision check hits immediately. reset(x, y, angle) — piercing/bounces
        // default to 0 (single hit), radius is the base.
        for (const b of [...ge.bulletPool.activeObjects]) b.active = false;
        const bullet = ge.bulletPool.get(enemy.x, enemy.y, 0);
        bullet.damage = damage;
        bullet.piercing = 0;
        bullet.bounces = 0;
        const before = ge.player.health;
        ge.handleCollisions();          // the LIVE bullet→enemy pass (lifesteal site)
        return ge.player.health - before;
    }, damage);
}

test.describe('QA-39: SANGUINE + HEMOGLUTTON blood sustain', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('SANGUINE: a kill heals ~4% of max HP while equipped', async ({ page }) => {
        const prime = await primePlayer(page, { passive: 'SANGUINE', hpFrac: 0.5 });
        expect(prime.hasPassive).toBe(true);
        await spawnTarget(page, { afflict: false });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const before = ge.player.health;
            ge.onEnemyKill(enemy);            // the canonical kill hook
            const maxHp = ge.player.getEffectiveMaxHealth();
            return { before, after: ge.player.health, maxHp };
        });
        const healed = r.after - r.before;
        expect(healed).toBeGreaterThan(0);
        expect(healed).toBeCloseTo(r.maxHp * 0.04, 1); // 4% of max HP
    });

    test('SANGUINE DEFAULT-SAFE: no passive → a kill heals nothing', async ({ page }) => {
        await primePlayer(page, { passive: null, hpFrac: 0.5 });
        await spawnTarget(page, { afflict: false });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const before = ge.player.health;
            ge.onEnemyKill(enemy);
            return { before, after: ge.player.health };
        });
        expect(r.after).toBeCloseTo(r.before, 3); // byte-for-byte: no heal
    });

    test('HEMOGLUTTON: lifesteal heals ~2× on a status-afflicted enemy', async ({ page }) => {
        // HP dropped low + a small hit so neither the base nor the doubled heal
        // clamps at the HP cap (2 Vampirism stacks = 10% lifesteal; dmg 100 → 10
        // base / 20 doubled, both inside the headroom).
        // Baseline: HEMOGLUTTON equipped, but a STATUS-FREE enemy → plain lifesteal.
        await primePlayer(page, { passive: 'HEMOGLUTTON', vampStacks: 2, hpFrac: 0.1 });
        await spawnTarget(page, { afflict: false });
        const baseHeal = await lifestealHpGain(page, 100);

        // Doubled: same passive + Vampirism + applied damage, but an AFFLICTED enemy.
        await primePlayer(page, { passive: 'HEMOGLUTTON', vampStacks: 2, hpFrac: 0.1 });
        await spawnTarget(page, { afflict: true });
        const afflictedHeal = await lifestealHpGain(page, 100);

        expect(baseHeal).toBeGreaterThan(0);
        expect(afflictedHeal).toBeGreaterThan(baseHeal);
        expect(afflictedHeal).toBeCloseTo(baseHeal * 2, 1); // lifesteal ×2 vs status
    });

    test('HEMOGLUTTON DEFAULT-SAFE: no passive → status enemy = baseline lifesteal', async ({ page }) => {
        // No passive, status-free enemy → plain lifesteal baseline.
        await primePlayer(page, { passive: null, vampStacks: 2, hpFrac: 0.1 });
        await spawnTarget(page, { afflict: false });
        const baseHeal = await lifestealHpGain(page, 100);

        // No passive, AFFLICTED enemy → must still be the baseline (no doubling).
        await primePlayer(page, { passive: null, vampStacks: 2, hpFrac: 0.1 });
        await spawnTarget(page, { afflict: true });
        const afflictedHeal = await lifestealHpGain(page, 100);

        expect(baseHeal).toBeGreaterThan(0);
        expect(afflictedHeal).toBeCloseTo(baseHeal, 3); // byte-for-byte: no doubling
    });

    test('no fatal JS errors through the blood-sustain flow', async ({ page }) => {
        await primePlayer(page, { passive: 'HEMOGLUTTON', vampStacks: 2, hpFrac: 0.1 });
        await spawnTarget(page, { afflict: true });
        await lifestealHpGain(page, 100); // live bullet→enemy lifesteal ×2 pass
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            if (enemy) ge.onEnemyKill(enemy);
            // Re-equip SANGUINE and run a kill heal too.
            ge.player.setOwnedPassives(['SANGUINE']);
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.equipPassive(0, 'SANGUINE');
            ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
            const e2 = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            ge.onEnemyKill(e2);
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
