/**
 * QA-50: HEAT_SINK keystone — uncapped sustained-fire ramp + vent AoE reward.
 *
 * HEAT_SINK is a §6c no-downside offense keystone (pure upside):
 *   • While held, holding primary fire ramps the effective fire RATE faster over
 *     sustained fire — PAST the normal fire-rate cap — building HEAT as primaries
 *     fire (each shot adds 1, up to HEAT_SINK_MAX).
 *   • The uncapped ramp is HARD-FLOORED at HEAT_SINK_FIRE_FLOOR_MS so the bullet
 *     rate can never explode (perf floor).
 *   • At max HEAT the ship VENTs an AoE burst: nearby enemies take damage, HEAT
 *     resets, and the ramp restarts. NO firing lockout — fire keeps flowing.
 *
 * Verified through the live game surface (PULSE_CANNON — deterministic single
 * bullet per shot):
 *   • with HEAT_SINK, the effective fire rate at high heat is FASTER (shorter
 *     interval) than the heat-0 baseline AND than a non-holder's capped value;
 *   • sustained fire BUILDS heat and at max heat VENTs — a nearby enemy loses
 *     health, heat resets to ~0, and firing is NOT locked out (a shot still fires
 *     immediately after the vent);
 *   • DEFAULT-SAFE: without HEAT_SINK, the fire rate is the normal capped value,
 *     heat stays 0, and no vent occurs;
 *   • no fatal JS errors.
 *
 * Bounded: equips one passive, drives the fire loop synchronously a few times.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const FATAL = (m) =>
    !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
    !m.includes('Font') && !m.includes('net::ERR') &&
    !/favicon|ResizeObserver|AudioContext|Failed to load resource/i.test(m);

// Equip (or clear) HEAT_SINK via the real owned+slot+equip path and pin the
// primary to PULSE_CANNON (one bullet per shot). Returns the resolved state.
async function primePlayer(page, { heatSink = false } = {}) {
    return page.evaluate(({ heatSink }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        for (const k of Object.keys(p.spStats)) p.spStats[k] = 0; // clean 0-SP baseline
        if (heatSink) {
            p.setOwnedPassives(['HEAT_SINK']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'HEAT_SINK');
        } else {
            p.equippedPassives = [null, null, null, null, null];
            p._rebuildActivePassives();
        }
        p.activePrimary = 'PULSE_CANNON';
        p.heat = 0;
        p._fireHoldTime = 0;
        return {
            heatSink: p.hasPassive('HEAT_SINK'),
            baseFireRate: p.getActivePrimaryConfig().fireRate,
        };
    }, { heatSink });
}

test.describe('QA-50: HEAT_SINK uncapped ramp + vent AoE', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('with HEAT_SINK, high heat ramps the fire rate FASTER than the heat-0 baseline', async ({ page }) => {
        const prime = await primePlayer(page, { heatSink: true });
        expect(prime.heatSink).toBe(true);

        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.heat = 0;
            const cold = p.getEffectivePrimaryFireRate();
            p.heat = 100; // HEAT_SINK_MAX
            const hot = p.getEffectivePrimaryFireRate();
            p.heat = 50;
            const warm = p.getEffectivePrimaryFireRate();
            return { cold, warm, hot };
        });
        // Shorter interval = faster fire. Ramp is monotonic with heat.
        expect(r.hot).toBeLessThan(r.cold);
        expect(r.warm).toBeLessThan(r.cold);
        expect(r.hot).toBeLessThan(r.warm);
        // Perf floor honored — the uncapped ramp never goes below 18ms.
        expect(r.hot).toBeGreaterThanOrEqual(18);
    });

    test('the HEAT_SINK rate at max heat beats a non-holder’s capped value (uncapped)', async ({ page }) => {
        await primePlayer(page, { heatSink: false });
        const capped = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.heat = 0;
            return p.getEffectivePrimaryFireRate(); // non-holder = the normal cap
        });
        await primePlayer(page, { heatSink: true });
        const ramped = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.heat = 100;
            return p.getEffectivePrimaryFireRate();
        });
        expect(ramped).toBeLessThan(capped); // ramped past the normal cap
    });

    test('sustained fire BUILDS heat and at max heat VENTs (enemy damaged, heat resets, NO lockout)', async ({ page }) => {
        await primePlayer(page, { heatSink: true });

        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Place an enemy on top of the ship so it's inside the vent radius.
            const enemy = ge.enemyPool.get(p.x + 20, p.y + 20, 'TITAN', 1, ge);
            enemy.health = 99999;       // tanky so the vent damages but doesn't kill it
            enemy.maxHealth = 99999;
            const hpBefore = enemy.health;

            const input = { fire: true, fireSecondary: false };
            // Drive the fire loop. Each tick we force the cooldown to be ready by
            // backdating lastShotTime, so every call fires one primary shot and
            // adds 1 heat. 120 shots > HEAT_SINK_MAX (100) guarantees a vent, and
            // crossing it proves firing continues through the vent (no lockout).
            let maxHeatSeen = 0;
            let ventOccurred = false;
            let firedAfterVent = false;
            let prevHeat = 0;
            for (let i = 0; i < 130; i++) {
                p.lastShotTime = 0; // force cooldownReady
                p._fireHoldTime = (p._fireHoldTime || 0) + 16;
                p.updateChargingSystem(input, ge.bulletPool, ge.audioManager, ge.particlePool);
                maxHeatSeen = Math.max(maxHeatSeen, p.heat);
                // A vent is detected when heat drops back toward 0 after climbing.
                if (prevHeat >= 90 && p.heat < prevHeat) ventOccurred = true;
                // After a vent (heat reset), the very next forced tick must still fire.
                if (ventOccurred && !firedAfterVent) {
                    const before = ge.bulletPool.activeObjects.length;
                    p.lastShotTime = 0;
                    p.updateChargingSystem(input, ge.bulletPool, ge.audioManager, ge.particlePool);
                    firedAfterVent = ge.bulletPool.activeObjects.length > before || p.heat > 0;
                }
                prevHeat = p.heat;
            }
            return {
                maxHeatSeen,
                ventOccurred,
                firedAfterVent,
                heatAfter: p.heat,
                enemyDamaged: enemy.health < hpBefore,
            };
        });

        expect(r.maxHeatSeen).toBeGreaterThanOrEqual(90); // heat actually builds toward max
        expect(r.ventOccurred).toBe(true);                // vent fired at max heat
        expect(r.enemyDamaged).toBe(true);                // nearby enemy took AoE damage
        expect(r.heatAfter).toBeLessThan(100);            // heat reset after the vent
        expect(r.firedAfterVent).toBe(true);              // NO lockout — fire continues
    });

    test('DEFAULT-SAFE: without HEAT_SINK, fire rate is the normal cap, heat stays 0, no vent', async ({ page }) => {
        const prime = await primePlayer(page, { heatSink: false });
        expect(prime.heatSink).toBe(false);

        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const enemy = ge.enemyPool.get(p.x + 20, p.y + 20, 'TITAN', 1, ge);
            enemy.health = 99999; enemy.maxHealth = 99999;
            const hpBefore = enemy.health;

            const baseRate = p.getEffectivePrimaryFireRate(); // capped value (no ramp)
            const input = { fire: true, fireSecondary: false };
            for (let i = 0; i < 130; i++) {
                p.lastShotTime = 0;
                p.updateChargingSystem(input, ge.bulletPool, ge.audioManager, ge.particlePool);
            }
            // Heat is never touched; rate is unchanged regardless of "held time".
            const rateAfter = p.getEffectivePrimaryFireRate();
            return {
                heat: p.heat || 0,
                baseRate,
                rateAfter,
                enemyDamaged: enemy.health < hpBefore,
            };
        });
        expect(r.heat).toBe(0);                 // no heat accumulation without the passive
        expect(r.rateAfter).toBe(r.baseRate);   // fire rate byte-for-byte unchanged
        expect(r.enemyDamaged).toBe(false);     // no vent → enemy untouched by AoE
    });

    test('no fatal JS errors through the heat-sink flow', async ({ page }) => {
        await primePlayer(page, { heatSink: true });
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            ge.enemyPool.get(p.x, p.y, 'HUNTER', 1, ge);
            const input = { fire: true, fireSecondary: false };
            for (let i = 0; i < 130; i++) {
                p.lastShotTime = 0;
                p.updateChargingSystem(input, ge.bulletPool, ge.audioManager, ge.particlePool);
            }
        });
        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
