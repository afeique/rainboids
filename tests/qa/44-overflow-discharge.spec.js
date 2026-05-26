/**
 * QA-44: energy-synergy powerup — OVERFLOW_DISCHARGE.
 *
 *   • OVERFLOW_DISCHARGE (1-stack) — while held, casting a power weapon at FULL
 *     energy makes that cast FREE (0 energy) AND boosts its damage +40%. Rewards
 *     timing the meter to its cap instead of wasting overcap. The full-energy
 *     capture + cost zero-out + damage boost all live in weapons.firePower
 *     (gated on getPowerupStacks('OVERFLOW_DISCHARGE') > 0 + full energy).
 *
 * Exercised LIVE on the running game by firing NOVA_BLAST (a non-charge power with
 * a fixed energy cost + a `ringDamage` damage field, spent synchronously) through
 * ge.player.firePower. We spy on player.fireNova to capture the (boosted) config
 * it receives, and read the energy delta. Verifies:
 *   • FULL energy + powerup: the cast spends ~0 (free) AND the config it dispatches
 *     carries +40% damage (ringDamage ≈ 1.4× base)
 *   • NON-FULL energy + powerup: the cast costs normally + base damage (no trigger)
 *   • DEFAULT-SAFE: without the powerup, a full-energy cast costs normally + base
 *     damage (byte-for-byte unchanged)
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Toggle the powerup on the live player, pick NOVA_BLAST (deterministic non-charge
// power), optionally top off energy to FULL, and install a spy on fireNova that
// records the ringDamage of the config it actually dispatches.
async function primePlayer(page, { discharge = false, full = true } = {}) {
    return page.evaluate(({ discharge, full }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (discharge) p.powerups.set('OVERFLOW_DISCHARGE', { stacks: 1 });
        else p.powerups.delete('OVERFLOW_DISCHARGE');
        // Make sure no other energy-free powerups interfere with the spend delta.
        p.powerups.delete('SURGE_BATTERY');
        p.powerups.delete('FLUX');
        p._surgeBatteryReady = false;
        // NOVA_BLAST — non-charge, fixed energy cost, carries a `ringDamage` field.
        p.activePower = 'NOVA_BLAST';
        p.powerCooldown = 0;
        const max = p.getEffectiveMaxEnergy();
        p.energy = full ? max : Math.max(0, p.getPowerEnergyCost()); // exactly enough, not full
        // Spy: capture the ringDamage of the config fireNova receives, then no-op
        // the rest of the original (avoid spawning lots of bullets in the test).
        const orig = p.fireNova.bind(p);
        window.__lastRingDamage = null;
        window.__baseRingDamage = p.getActivePowerConfig().ringDamage;
        p.fireNova = function (config) {
            window.__lastRingDamage = config ? config.ringDamage : null;
            return orig(config);
        };
        return {
            discharge: p.getPowerupStacks('OVERFLOW_DISCHARGE') > 0,
            cost: p.getPowerEnergyCost(),
            baseRingDamage: window.__baseRingDamage,
            full,
        };
    }, { discharge, full });
}

// Fire one power weapon synchronously; return the energy delta + observed dmg.
async function castPower(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        const before = p.energy;
        p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
        return { before, after: p.energy, spent: before - p.energy, ringDamage: window.__lastRingDamage };
    });
}

test.describe('QA-44: OVERFLOW_DISCHARGE full-energy power synergy', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            for (const k of Object.keys(p.spStats)) p.spStats[k] = 0; // clean 0-SP baseline
        });
    });

    test('FULL energy + powerup: cast is free AND damage is boosted +40%', async ({ page }) => {
        const prime = await primePlayer(page, { discharge: true, full: true });
        expect(prime.discharge).toBe(true);
        expect(prime.cost).toBeGreaterThan(0);
        expect(prime.baseRingDamage).toBeGreaterThan(0);
        const fired = await castPower(page);
        expect(fired.spent).toBe(0);                                       // free at full energy
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage * 1.4, 4); // +40% boost
    });

    test('NON-FULL energy + powerup: cast costs normally + base damage', async ({ page }) => {
        const prime = await primePlayer(page, { discharge: true, full: false });
        expect(prime.discharge).toBe(true);
        const fired = await castPower(page);
        expect(fired.spent).toBeCloseTo(prime.cost, 5);                    // normal cost (not full)
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage, 4);     // no boost
    });

    test('DEFAULT-SAFE: without the powerup, a full-energy cast costs normally + base damage', async ({ page }) => {
        const prime = await primePlayer(page, { discharge: false, full: true });
        expect(prime.discharge).toBe(false);
        const fired = await castPower(page);
        expect(fired.spent).toBeCloseTo(prime.cost, 5);                    // normal cost
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage, 4);     // base damage, byte-for-byte
    });

    test('no fatal JS errors through the overflow-discharge flow', async ({ page }) => {
        await primePlayer(page, { discharge: true, full: true });
        await castPower(page);
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
