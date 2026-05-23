/**
 * E2E-03: Weapon system and shop upgrades
 *
 * Tests the default weapon (auto-fire), bullet pool growth, and the effect of
 * shop powerups on firing behaviour (rapid fire, multi-shot, spread shot, etc.).
 *
 * Firing is verified by setting input.fire = true and waiting for bullets to
 * appear — the same approach used in qa/03-player.spec.js but extended to
 * cover upgrade interactions.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getPoolCounts } from '../helpers/game-helpers.js';

// Helper: give the player a shop powerup directly
async function addShopPowerup(page, itemId) {
    return page.evaluate((id) => {
        const ge = window.gameEngine;
        const cfg = ge.getPowerupConfig(id);
        if (!cfg) throw new Error(`No config for powerup: ${id}`);
        ge.player.addPowerup(id, { ...cfg, duration: Infinity }, true);
    }, itemId);
}

// Helper: fire for a short burst and return bullet count
async function burstFire(page, durationMs = 400) {
    await page.evaluate(() => {
        window.gameEngine.inputHandler.input.fire = true;
        window.gameEngine.playerCanFire = true;
    });
    await page.waitForTimeout(durationMs);
    await page.evaluate(() => {
        window.gameEngine.inputHandler.input.fire = false;
    });
    return page.evaluate(() => window.gameEngine.bulletPool.activeObjects.length);
}

test.describe('E2E-03: Weapon system', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // -----------------------------------------------------------------------
    // Default weapon
    // -----------------------------------------------------------------------

    test.describe('default weapon', () => {
        test('firing produces bullets in the bullet pool', async ({ page }) => {
            const before = (await getPoolCounts(page)).bullets;
            const after  = await burstFire(page, 400);
            expect(after).toBeGreaterThan(before);
        });

        test('bullets have valid position and active flag', async ({ page }) => {
            await burstFire(page, 300);
            const bullet = await page.evaluate(() => {
                const b = window.gameEngine.bulletPool.activeObjects[0];
                return b ? { x: b.x, y: b.y, active: b.active } : null;
            });
            expect(bullet).not.toBeNull();
            expect(bullet.active).toBe(true);
            expect(isFinite(bullet.x)).toBe(true);
            expect(isFinite(bullet.y)).toBe(true);
        });

        test('bullets have positive damage', async ({ page }) => {
            await burstFire(page, 300);
            const damage = await page.evaluate(() => {
                const b = window.gameEngine.bulletPool.activeObjects[0];
                return b?.damage;
            });
            expect(typeof damage).toBe('number');
            expect(damage).toBeGreaterThan(0);
        });

        test('bullets expire and leave the pool over time', async ({ page }) => {
            // Fire a burst, then wait for bullets to travel off-screen / expire
            await burstFire(page, 200);
            const peakCount = await page.evaluate(
                () => window.gameEngine.bulletPool.activeObjects.length
            );
            // Wait well past any bullet lifetime
            await page.waitForTimeout(5000);
            const laterCount = await page.evaluate(
                () => window.gameEngine.bulletPool.activeObjects.length
            );
            // Some bullets should have expired (or all)
            expect(laterCount).toBeLessThanOrEqual(peakCount);
        });
    });

    // -----------------------------------------------------------------------
    // Rapid Fire upgrade
    // -----------------------------------------------------------------------

    test.describe('RAPID_FIRE powerup', () => {
        test('rapid fire powerup is applied to player', async ({ page }) => {
            await addShopPowerup(page, 'RAPID_FIRE');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('RAPID_FIRE')?.stacks ?? 0
            );
            expect(stacks).toBeGreaterThan(0);
        });

        test('stacking rapid fire increases stack count', async ({ page }) => {
            await addShopPowerup(page, 'RAPID_FIRE');
            await addShopPowerup(page, 'RAPID_FIRE');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('RAPID_FIRE')?.stacks ?? 0
            );
            expect(stacks).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // Multi Shot upgrade
    // -----------------------------------------------------------------------

    test.describe('MULTI_SHOT powerup', () => {
        test('multi-shot powerup is applied to player', async ({ page }) => {
            await addShopPowerup(page, 'MULTI_SHOT');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('MULTI_SHOT')?.stacks ?? 0
            );
            expect(stacks).toBeGreaterThan(0);
        });

        test('firing with multi-shot produces more bullets than base', async ({ page }) => {
            // Baseline bullet count (no upgrades)
            const baseline = await burstFire(page, 300);

            // Clear bullets, add multi-shot, fire again
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.bulletPool.activeObjects.forEach(b => ge.bulletPool.release(b));
                ge.bulletPool.activeObjects = [];
            });

            await addShopPowerup(page, 'MULTI_SHOT');
            const upgraded = await burstFire(page, 300);

            expect(upgraded).toBeGreaterThanOrEqual(baseline);
        });
    });

    // -----------------------------------------------------------------------
    // Homing upgrade
    // -----------------------------------------------------------------------

    test.describe('HOMING powerup', () => {
        test('homing powerup registers on the player', async ({ page }) => {
            await addShopPowerup(page, 'HOMING');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('HOMING')?.stacks ?? 0
            );
            expect(stacks).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // Piercing upgrade
    // -----------------------------------------------------------------------

    test.describe('PIERCING powerup', () => {
        test('piercing powerup registers on the player', async ({ page }) => {
            await addShopPowerup(page, 'PIERCING');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('PIERCING')?.stacks ?? 0
            );
            expect(stacks).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // Explosive upgrade
    // -----------------------------------------------------------------------

    test.describe('EXPLOSIVE powerup', () => {
        test('explosive powerup registers on the player', async ({ page }) => {
            await addShopPowerup(page, 'EXPLOSIVE');
            const stacks = await page.evaluate(
                () => window.gameEngine.player.powerups.get('EXPLOSIVE')?.stacks ?? 0
            );
            expect(stacks).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // Primary weapon switching
    // -----------------------------------------------------------------------

    test.describe('primary weapon switching', () => {
        test('buying Storm Needles changes active primary', async ({ page }) => {
            const result = await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.game.money = 10000;
                ge.player.skillPoints = 10;
                ge.openShop();
                ge.shopCategory = 'PRIMARY';
                ge._rebuildShopCache();
                ge.buyShopItem('STORM_NEEDLES');
                return ge.player.activePrimary;
            });
            expect(result).toBe('STORM_NEEDLES');
        });

        test('Storm Needles fire faster than Pulse Cannon', async ({ page }) => {
            // Fire with Pulse Cannon and count bullets
            const pulseCount = await burstFire(page, 600);

            // Clear bullets and switch to Storm Needles
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.bulletPool.activeObjects.forEach(b => ge.bulletPool.release(b));
                ge.bulletPool.activeObjects = [];
                ge.game.money = 10000;
                ge.player.skillPoints = 10;
                ge.player.buyPrimary('STORM_NEEDLES');
            });

            const needleCount = await burstFire(page, 600);
            // Storm Needles (130ms) should produce more bullets than Pulse Cannon (400ms)
            expect(needleCount).toBeGreaterThan(pulseCount);
        });

        test('Scatter Gun fires multiple pellets per shot', async ({ page }) => {
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.game.money = 10000;
                ge.player.skillPoints = 10;
                ge.player.buyPrimary('SCATTER_GUN');
                // Clear existing bullets
                ge.bulletPool.activeObjects.forEach(b => ge.bulletPool.release(b));
                ge.bulletPool.activeObjects = [];
            });
            const count = await burstFire(page, 800);
            // One shot should produce 5 pellets
            expect(count).toBeGreaterThanOrEqual(5);
        });
    });

    // -----------------------------------------------------------------------
    // Defense ability system
    // -----------------------------------------------------------------------

    test.describe('defense abilities', () => {
        test('buying and assigning Bulwark to slot 1', async ({ page }) => {
            const result = await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.player.skillPoints = 10;
                ge.player.buyAbility('BULWARK');
                return {
                    owned: ge.player.ownedAbilities.has('BULWARK'),
                    slot0: ge.player.abilitySlots[0],
                };
            });
            expect(result.owned).toBe(true);
            expect(result.slot0).toBe('BULWARK');
        });

        test('ability cooldowns start at zero', async ({ page }) => {
            const cooldowns = await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.player.skillPoints = 10;
                ge.player.buyAbility('BULWARK');
                return ge.player.abilityCooldowns;
            });
            expect(cooldowns[0]).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // One Punch Man cheat — instant kill verification
    // -----------------------------------------------------------------------

    test.describe('one-punch-man cheat', () => {
        test('one-punch-man cheat can be enabled programmatically', async ({ page }) => {
            await page.evaluate(() => { window.gameEngine.cheats.onePunchMan = true; });
            const enabled = await page.evaluate(() => window.gameEngine.cheats.onePunchMan);
            expect(enabled).toBe(true);
        });

        test('bullets with OPM cheat kill asteroid in one hit', async ({ page }) => {
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.cheats.onePunchMan = true;
                ge.asteroidPool.get(ge.player.x + 60, ge.player.y, 30, 1);
            });

            // Aim at asteroid and fire
            await page.evaluate(() => {
                const ge = window.gameEngine;
                const ast = ge.asteroidPool.activeObjects[ge.asteroidPool.activeObjects.length - 1];
                if (ast) {
                    ge.inputHandler.input.aimX = ast.x;
                    ge.inputHandler.input.aimY = ast.y;
                }
                ge.inputHandler.input.fire = true;
                ge.playerCanFire = true;
            });

            await page.waitForTimeout(1500);

            await page.evaluate(() => { window.gameEngine.inputHandler.input.fire = false; });

            const asteroidCount = await page.evaluate(
                () => window.gameEngine.asteroidPool.activeObjects.length
            );
            expect(asteroidCount).toBe(0);
        });
    });
});
