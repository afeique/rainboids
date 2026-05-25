/**
 * QA-17: Modular bosses (BOSS-15)
 *
 * Smoke-tests the BOSS-04 spawn → render → hit → kill pipeline end-to-end in the
 * live game, using the debug spawn hook `gameEngine.spawnBoss(...)`. Asserts:
 *   (a) the boss is active in the enemy pool, flagged isBoss + carrying a bossId
 *   (b) the boss healthbar layout surfaces (the HUD hook finds it)
 *   (c) damaging it reduces HP AND weak-points gate the core (core invuln while
 *       shielding parts live; killable once they're cleared)
 *   (d) it is killable (core HP → 0)
 *   (e) NO fatal JS errors through spawn → fight → death
 *
 * The debug hook spawns with warp:false (instantly fightable), but the boss
 * still arms its INTRO sequence — which blocks damage. The tests force the intro
 * to "done" up front so the fight assertions exercise the parts/core gate rather
 * than the intro invuln (which 02 covers implicitly by waiting it out).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Collect any page errors so we can assert "no fatal JS errors" at the end.
function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

// Spawn a boss via the debug hook and force its intro complete so it's
// immediately fightable. Returns a snapshot of the spawned boss.
async function spawnBossReady(page, which) {
    return page.evaluate((id) => {
        const ge = window.gameEngine;
        const boss = ge.spawnBoss(id);
        if (!boss) return null;
        // Force the intro sequence to "done" so damage isn't intro-gated.
        if (boss._introSeq) boss._introSeq.done = true;
        boss.warping = false;
        // Drive one update tick so part positions settle.
        if (typeof boss._bossDriver === 'function') boss._bossDriver(boss, ge, Date.now());
        return {
            bossId: boss.bossId,
            isBoss: boss.isBoss,
            isFinalBoss: boss.isFinalBoss,
            active: boss.active,
            health: boss.health,
            maxHealth: boss.maxHealth,
            name: boss.name,
            element: boss.element,
        };
    }, which);
}

test.describe('QA-17: Modular bosses', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Spawn + pool presence
    // ------------------------------------------------------------------

    test('debug hook spawns the Harbinger as an active boss in the pool', async ({ page }) => {
        const snap = await spawnBossReady(page, 'HARBINGER');
        expect(snap).not.toBeNull();
        expect(snap.bossId).toBe('HARBINGER');
        expect(snap.isBoss).toBe(true);
        expect(snap.isFinalBoss).toBe(false);
        expect(snap.active).toBe(true);
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.element).toBe('KINETIC');

        // It is present in the active enemy pool, found by bossId.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.bossId === 'HARBINGER' && e.isBoss && e.active);
        });
        expect(inPool).toBe(true);
    });

    test('spawnBoss by STAGE number maps to the right descriptor', async ({ page }) => {
        const byStage = await page.evaluate(() => {
            const ge = window.gameEngine;
            const b = ge.spawnBoss(1); // stage 1 → Harbinger
            return b ? b.bossId : null;
        });
        expect(byStage).toBe('HARBINGER');
    });

    // ------------------------------------------------------------------
    // (b) Healthbar surfaces
    // ------------------------------------------------------------------

    test('boss healthbar layout surfaces for the spawned boss', async ({ page }) => {
        await spawnBossReady(page, 'HARBINGER');
        // computeBossHealthbarLayout is the pure layout the HUD hook draws.
        const layout = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const boss = ge.enemyPool.activeObjects.find((e) => e.bossId === 'HARBINGER');
            const mod = await import('/js/modules/hud/boss-healthbar.js');
            return {
                drawable: mod.isDrawableBoss(boss),
                layout: mod.computeBossHealthbarLayout(boss, ge.width),
            };
        });
        expect(layout.drawable).toBe(true);
        expect(layout.layout.name).toContain('HARBINGER');
        expect(layout.layout.hpFraction).toBeCloseTo(1, 1);
        expect(layout.layout.segments).toBeGreaterThanOrEqual(1);
    });

    // ------------------------------------------------------------------
    // (c) Weak-points gate the core
    // ------------------------------------------------------------------

    test('core is invulnerable while weak-points live, vulnerable once cleared', async ({ page }) => {
        await spawnBossReady(page, 'HARBINGER');
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const boss = ge.enemyPool.activeObjects.find((e) => e.bossId === 'HARBINGER');
            const parts = await import('/js/modules/enemy/boss-parts.js');

            const livingBefore = parts.livingPartCount(boss);
            const coreGatedBefore = parts.coreBlocksDamage(boss);

            // Try to damage the CORE while shielding parts live — should be blocked.
            const hpBefore = boss.health;
            ge.applyDamageToEnemy(boss, 200, { showNumber: false });
            const hpAfterGated = boss.health;

            // Clear every living part (as the bullet→part router would).
            for (const p of parts.livingParts(boss)) parts.damageBossPart(boss, p, 1e9, ge);
            const coreGatedAfter = parts.coreBlocksDamage(boss);

            // Now the core should take damage.
            const hpBeforeCore = boss.health;
            ge.applyDamageToEnemy(boss, 200, { showNumber: false });
            const hpAfterCore = boss.health;

            return {
                livingBefore, coreGatedBefore,
                hpBefore, hpAfterGated,
                coreGatedAfter,
                hpBeforeCore, hpAfterCore,
            };
        });

        // Parts present + gating the core at spawn.
        expect(result.livingBefore).toBeGreaterThan(0);
        expect(result.coreGatedBefore).toBe(true);
        // Core HP unchanged while parts live.
        expect(result.hpAfterGated).toBe(result.hpBefore);
        // After clearing parts, the gate is open and the core takes damage.
        expect(result.coreGatedAfter).toBe(false);
        expect(result.hpAfterCore).toBeLessThan(result.hpBeforeCore);
    });

    // ------------------------------------------------------------------
    // (d) Killable
    // ------------------------------------------------------------------

    test('Harbinger is killable — core HP reaches 0', async ({ page }) => {
        await spawnBossReady(page, 'HARBINGER');
        const killed = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const boss = ge.enemyPool.activeObjects.find((e) => e.bossId === 'HARBINGER');
            const parts = await import('/js/modules/enemy/boss-parts.js');

            // Pump damage across phases: clear parts → hit core → repeat. Each
            // phase re-arms a fresh bolt ring, so we loop until HP hits 0 or we
            // exhaust a generous iteration budget.
            for (let i = 0; i < 60 && boss.health > 0; i++) {
                for (const p of parts.livingParts(boss)) parts.damageBossPart(boss, p, 1e9, ge);
                // Advance the boss driver so phase transitions + re-arms fire.
                if (typeof boss._bossDriver === 'function') boss._bossDriver(boss, ge, Date.now());
                // Clear any phase-transition invuln window for the test.
                if (boss._phaseState) boss._phaseState.invulnUntil = 0;
                ge.applyDamageToEnemy(boss, 300, { showNumber: false });
            }
            return { health: boss.health };
        });
        expect(killed.health).toBe(0);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → fight → death
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → fight → death', async ({ page }) => {
        const errors = attachErrorCollector(page);

        // Spawn, run a few real frames, then kill it and run a few more so the
        // death sequence + boss-fx + camera-shake all execute live.
        await spawnBossReady(page, 'HARBINGER');

        // Let the live game loop tick a handful of frames.
        await page.waitForTimeout(300);

        // Kill the boss through the real damage path.
        await page.evaluate(async () => {
            const ge = window.gameEngine;
            const boss = ge.enemyPool.activeObjects.find((e) => e.bossId === 'HARBINGER');
            if (!boss) return;
            const parts = await import('/js/modules/enemy/boss-parts.js');
            for (let i = 0; i < 60 && boss.health > 0; i++) {
                for (const p of parts.livingParts(boss)) parts.damageBossPart(boss, p, 1e9, ge);
                if (typeof boss._bossDriver === 'function') boss._bossDriver(boss, ge, Date.now());
                if (boss._phaseState) boss._phaseState.invulnUntil = 0;
                if (boss._introSeq) boss._introSeq.done = true;
                ge.applyDamageToEnemy(boss, 400, { showNumber: false });
            }
            // Mirror the bullet-path kill ceremony so onEnemyKill fires the
            // death-sequence arming + FX.
            if (boss.health <= 0) {
                boss._deathFlash = 8;
                boss._deathFlashMax = 8;
                ge.onEnemyKill(boss);
            }
        });

        // Run more frames so the death detonation FX + camera-shake render.
        await page.waitForTimeout(500);

        // The boss healthbar / FX hooks should have run without throwing.
        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });

    // ------------------------------------------------------------------
    // Final boss → run-complete
    // ------------------------------------------------------------------

    test('final boss (Prismarch) death routes to GAME_COMPLETE', async ({ page }) => {
        const state = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const boss = ge.spawnBoss('PRISMARCH');
            if (!boss) return { spawned: false };
            if (boss._introSeq) boss._introSeq.done = true;
            boss.warping = false;
            const parts = await import('/js/modules/enemy/boss-parts.js');
            for (let i = 0; i < 120 && boss.health > 0; i++) {
                for (const p of parts.livingParts(boss)) parts.damageBossPart(boss, p, 1e9, ge);
                if (typeof boss._bossDriver === 'function') boss._bossDriver(boss, ge, Date.now());
                if (boss._phaseState) boss._phaseState.invulnUntil = 0;
                ge.applyDamageToEnemy(boss, 500, { showNumber: false });
            }
            // Fire the kill hook (final-boss death → completeRun).
            const killedHealth = boss.health;
            boss._deathFlash = 8;
            ge.onEnemyKill(boss);
            return { spawned: true, isFinalBoss: boss.isFinalBoss, killedHealth, finalBossDefeated: !!ge._finalBossDefeated };
        });
        expect(state.spawned).toBe(true);
        expect(state.isFinalBoss).toBe(true);
        expect(state.killedHealth).toBe(0);
        expect(state.finalBossDefeated).toBe(true);

        // completeRun routes WAVE_TRANSITION → GAME_COMPLETE on a short timer.
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'GAME_COMPLETE',
            { timeout: 5000 }
        );
    });
});
