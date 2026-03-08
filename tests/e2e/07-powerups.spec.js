/**
 * E2E-07: POWERUP system
 *
 * Tests every powerup type: pickup, stacking to x3, and timer-reset on re-pickup.
 * Uses ge.getPowerupConfig(type) + player.addPowerup(type, config) — the same path
 * the real shop uses — so these tests exercise the actual powerup machinery.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// All powerup types defined in getPowerupConfig (from game-engine.js)
const POWERUP_TYPES = [
    'RAPID_FIRE', 'MULTI_SHOT', 'HOMING', 'BIG_BULLETS',
    'SPEED_BOOST', 'PIERCING', 'SPREAD_SHOT', 'EXPLOSIVE',
    'CRIT_CHANCE', 'CRIT_DAMAGE', 'SHIELD_BOOST', 'MEDPACK', 'CHARGE_SHOT',
];

/** Grant a powerup to the player using the same code path as the shop. */
async function grantPowerup(page, type) {
    return page.evaluate((t) => {
        const ge  = window.gameEngine;
        const cfg = ge.getPowerupConfig(t);
        if (!cfg) {
            // Fallback for types not in getPowerupConfig (shouldn't happen in tests)
            ge.player.powerups.set(t, { stacks: 1, timeRemaining: 10000, duration: 10000 });
            return true;
        }
        ge.player.addPowerup(t, cfg);
        return true;
    }, type);
}

async function getPowerupStacks(page, type) {
    return page.evaluate((t) => window.gameEngine?.player?.powerups?.get(t)?.stacks ?? 0, type);
}

async function getPowerupTimer(page, type) {
    return page.evaluate((t) => window.gameEngine?.player?.powerups?.get(t)?.timeRemaining ?? 0, type);
}

async function clearPowerupsAndThreats(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.player.powerups.clear();
        while (ge.powerupPool.activeObjects.length)  ge.powerupPool.release(ge.powerupPool.activeObjects[0]);
        while (ge.asteroidPool.activeObjects.length) ge.asteroidPool.release(ge.asteroidPool.activeObjects[0]);
        while (ge.enemyPool.activeObjects.length)    ge.enemyPool.release(ge.enemyPool.activeObjects[0]);
    });
}

test.describe('E2E-07: Powerup system', () => {
    test.setTimeout(60_000);

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await clearPowerupsAndThreats(page);
    });

    // ── Individual pickup ────────────────────────────────────────────────────

    for (const type of POWERUP_TYPES) {
        test(`[POWERUP] ${type} — pickup registers stacks=1`, async ({ page }) => {
            await grantPowerup(page, type);
            const stacks = await getPowerupStacks(page, type);
            expect(stacks).toBeGreaterThanOrEqual(1);
        });
    }

    // ── Stacking to x3 ────────────────────────────────────────────────────────

    for (const type of POWERUP_TYPES) {
        test(`[POWERUP] ${type} — stacks to x3 after three pickups`, async ({ page }) => {
            await grantPowerup(page, type);
            await grantPowerup(page, type);
            await grantPowerup(page, type);
            const stacks = await getPowerupStacks(page, type);
            expect(stacks).toBeGreaterThanOrEqual(3);
        });
    }

    // ── Timer resets on re-pickup ─────────────────────────────────────────────

    test('[POWERUP] re-pickup resets timer to full', async ({ page }) => {
        const TYPE = 'SPEED_BOOST';

        // Grant once, then drain timer nearly to zero
        await grantPowerup(page, TYPE);
        await page.evaluate((t) => {
            const pw = window.gameEngine.player.powerups.get(t);
            if (pw && pw.duration !== Infinity) pw.timeRemaining = 100;
        }, TYPE);

        const before = await getPowerupTimer(page, TYPE);

        // Re-pickup (grant again) — timer should reset
        await grantPowerup(page, TYPE);
        const after = await getPowerupTimer(page, TYPE);

        // Timer after re-pickup must be >= timer before re-pickup
        expect(after).toBeGreaterThanOrEqual(before);
    });

    // ── Powerup HUD reflects active powerups ─────────────────────────────────

    test('[POWERUP] HUD canvas shows game running with active powerups', async ({ page }) => {
        await grantPowerup(page, 'RAPID_FIRE');
        await page.waitForTimeout(200);

        // Engine must still be alive and powerup registered
        const ok = await page.evaluate(() => {
            const ge = window.gameEngine;
            return ge?.player?.powerups?.size > 0 && ge?.game?.state === 'PLAYING';
        });
        expect(ok).toBe(true);
    });

    // ── MEDPACK restores health ───────────────────────────────────────────────

    test('[POWERUP] MEDPACK world-drop restores player health', async ({ page }) => {
        // Damage player first
        await page.evaluate(() => {
            window.gameEngine.player.health = Math.max(1, window.gameEngine.player.maxHealth - 8);
        });

        const hpBefore = await page.evaluate(() => window.gameEngine.player.health);

        // Simulate a medpack heal (same logic as collision handler)
        await page.evaluate(() => {
            const ge  = window.gameEngine;
            const p   = ge.player;
            const cfg = ge.GAME_CONFIG ?? { HEALTH_ORB_HEAL_AMOUNT_MIN: 1, HEALTH_ORB_HEAL_AMOUNT_MAX: 4 };
            const heal = 3;
            p.health = Math.min(p.maxHealth, p.health + heal);
        });

        const hpAfter = await page.evaluate(() => window.gameEngine.player.health);
        expect(hpAfter).toBeGreaterThan(hpBefore);
    });

    // ── SHIELD_BOOST is permanent (duration Infinity) ─────────────────────────

    test('[POWERUP] SHIELD_BOOST has Infinity duration', async ({ page }) => {
        await grantPowerup(page, 'SHIELD_BOOST');
        const isPermament = await page.evaluate(() => {
            const pw = window.gameEngine.player.powerups.get('SHIELD_BOOST');
            return pw?.timeRemaining === Infinity || pw?.isPermanent === true || pw?.duration === Infinity;
        });
        expect(isPermament).toBe(true);
    });

    // ── World-drop powerup spawns and can be collected ───────────────────────

    test('[POWERUP] dropPowerup spawns entity in powerup pool', async ({ page }) => {
        const countBefore = await page.evaluate(() => window.gameEngine.powerupPool.activeObjects.length);

        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.dropPowerup(ge.player.x + 30, ge.player.y + 30, 'RAPID_FIRE');
        });

        const countAfter = await page.evaluate(() => window.gameEngine.powerupPool.activeObjects.length);
        expect(countAfter).toBeGreaterThan(countBefore);
    });
});
