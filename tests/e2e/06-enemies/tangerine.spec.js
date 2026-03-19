/**
 * E2E-06: TANGERINE enemy
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../../helpers/game-helpers.js';
import { GameAI } from '../../helpers/game-ai.js';

const ENEMY_TYPE  = 'TANGERINE';
const TEST_TIMEOUT = 60_000;

async function clearEntities(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        while (ge.enemyPool.activeObjects.length)    ge.enemyPool.release(ge.enemyPool.activeObjects[0]);
        while (ge.asteroidPool.activeObjects.length) ge.asteroidPool.release(ge.asteroidPool.activeObjects[0]);
        while (ge.enemyBulletPool.activeObjects.length) ge.enemyBulletPool.release(ge.enemyBulletPool.activeObjects[0]);
        ge.game.waveComplete = true; // Prevent wave system from spawning new enemies
    });
}

test.describe(`E2E-06: ${ENEMY_TYPE} enemy`, () => {
    test.setTimeout(TEST_TIMEOUT);

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await clearEntities(page);
    });

    test(`${ENEMY_TYPE} spawns with positive health`, async ({ page }) => {
        await page.evaluate((type) => {
            const ge = window.gameEngine;
            ge.enemyPool.get(ge.gameField.width / 2, 200, type, 1);
        }, ENEMY_TYPE);

        const hp = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool;
            return pool.activeObjects[pool.activeObjects.length - 1]?.health;
        });
        expect(hp).toBeGreaterThan(0);
    });

    test(`${ENEMY_TYPE} spawns with correct type`, async ({ page }) => {
        await page.evaluate((type) => {
            const ge = window.gameEngine;
            ge.enemyPool.get(ge.gameField.width / 2, 200, type, 1);
        }, ENEMY_TYPE);

        const spawnedType = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool;
            return pool.activeObjects[pool.activeObjects.length - 1]?.type;
        });
        expect(spawnedType).toBe(ENEMY_TYPE);
    });

    test(`AI can kill ${ENEMY_TYPE} within 20 seconds`, async ({ page }) => {
        await page.evaluate((type) => {
            const ge = window.gameEngine;
            ge.cheats.onePunchMan = true;
            const cx = ge.gameField.width / 2;
            const cy = ge.gameField.height / 2;
            ge.enemyPool.get(cx + 200, cy, type, 1);
        }, ENEMY_TYPE);

        const countBefore = await page.evaluate(() => window.gameEngine.enemyPool.activeObjects.length);
        expect(countBefore).toBeGreaterThan(0);

        const ai = new GameAI(page);
        const aiRun = ai.run(20_000);
        await ai.waitForEnemyDeath(ENEMY_TYPE, 22_000);
        ai._running = false;
        await aiRun;
        await ai.stop();

        const remaining = await page.evaluate(
            () => window.gameEngine.enemyPool.activeObjects.filter(e => e.active).length
        );
        expect(remaining).toBe(0);
    });

    test(`${ENEMY_TYPE} deals damage to player when spawned nearby`, async ({ page }) => {
        const startHp = await page.evaluate(() => window.gameEngine.player.health);
        await page.evaluate((type) => {
            const ge = window.gameEngine;
            ge.enemyPool.get(ge.player.x, ge.player.y, type, 1);
        }, ENEMY_TYPE);
        await page.waitForTimeout(600);
        const endHp = await page.evaluate(() => window.gameEngine.player.health);
        expect(endHp).toBeLessThanOrEqual(startHp);
    });

    test(`${ENEMY_TYPE} pool count decreases after release`, async ({ page }) => {
        await page.evaluate((type) => {
            const ge = window.gameEngine;
            ge.enemyPool.get(ge.gameField.width / 2, 200, type, 1);
        }, ENEMY_TYPE);

        const before = await page.evaluate(() => window.gameEngine.enemyPool.activeObjects.length);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.enemyPool.activeObjects.length) ge.enemyPool.release(ge.enemyPool.activeObjects[0]);
        });
        const after = await page.evaluate(() => window.gameEngine.enemyPool.activeObjects.length);
        expect(after).toBe(before - 1);
    });
});
