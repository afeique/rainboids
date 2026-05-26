/**
 * QA-36: CD energy-economy build axis (CD-01 / CD-05 / CD-06 / CD-14)
 *
 * The three permanent SP stats CAPACITOR / REACTOR / EFFICIENCY reshape the
 * power-weapon energy economy. Smoke-tested live in the running game:
 *   (a) DEFAULT-SAFE — a fresh (0-point) run reports maxEnergy 100, charge%
 *       clamps at 100, and the active power costs exactly its base; firing a
 *       power weapon still works and spends energy.
 *   (b) CAPACITOR — allocated via the real SP path, getEffectiveMaxEnergy()
 *       rises above 100 and the energy meter can now bank past 100.
 *   (c) EFFICIENCY — discounts the live power cost (capped −50%) and lowers
 *       the fire gate so the same banked energy still fires.
 *
 * Mirrors the QA-11 leveling/SP harness (real allocateSp + spStats path).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-36: CD energy economy', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        // Clear meta so each run starts at 0 SP (the default-safe baseline).
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            // Ensure a clean 0-point baseline regardless of persisted meta.
            for (const k of Object.keys(p.spStats)) p.spStats[k] = 0;
        });
    });

    // (a) DEFAULT-SAFE — 0 points behaves exactly as before CD.
    test('default (0-point) run: maxEnergy 100, charge clamps at 100, base power cost', async ({ page }) => {
        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            // With 0 EFFICIENCY points, getPowerEnergyCost() === the base cost.
            const base = p.getPowerEnergyCost();
            // Cram the meter past the base to confirm the clamp holds at 100.
            p.energy = 0;
            p.addEnergy(500);
            const clampedEnergy = p.energy;
            return {
                maxEnergy: p.getEffectiveMaxEnergy(),
                clampedEnergy,
                regenMult: p.getEffectiveEnergyRegenMult(),
                powerCost: p.getPowerEnergyCost(),
                base,
            };
        });
        expect(r.maxEnergy).toBe(100);
        expect(r.clampedEnergy).toBe(100); // addEnergy clamps to the (un-boosted) cap
        expect(r.regenMult).toBe(1);
        expect(r.powerCost).toBe(r.base); // 0-point cost is unchanged
    });

    test('default run: a power weapon still fires and spends energy', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.activePower = 'CHARGE_SHOT';
            p.powerCooldown = 0;
            p.energy = p.getEffectiveMaxEnergy(); // fully charged
            const before = p.energy;
            const ready = p.isPowerReady();
            // Drive the live fire path through the input system.
            ge.inputHandler.input.fireSecondary = true;
            return await new Promise((resolve) => {
                setTimeout(() => resolve({ before, ready, after: p.energy }), 400);
            });
        });
        expect(r.ready).toBe(true);
        // Firing a power weapon deducts energy from the meter.
        expect(r.after).toBeLessThan(r.before);
    });

    // (b) CAPACITOR — real SP allocation raises the cap and lets the meter bank past 100.
    test('CAPACITOR via the SP system raises max energy above 100', async ({ page }) => {
        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.sp = 30;
            const beforeMax = p.getEffectiveMaxEnergy();
            // Allocate the full stack (20 points) through the real path.
            let allocated = 0;
            for (let i = 0; i < 25; i++) { if (p.allocateSp('CAPACITOR')) allocated++; }
            const afterMax = p.getEffectiveMaxEnergy();
            // The meter can now bank past the old 100 cap.
            p.energy = 0;
            p.addEnergy(180);
            return { beforeMax, afterMax, allocated, points: p.spStats.CAPACITOR, banked: p.energy };
        });
        expect(r.beforeMax).toBe(100);
        expect(r.allocated).toBe(20); // capped at SP_STAT_MAX_POINTS
        expect(r.points).toBe(20);
        expect(r.afterMax).toBe(200);
        expect(r.banked).toBeGreaterThan(100); // banked past the pre-CD cap
    });

    // (c) EFFICIENCY — discounts the live power cost (capped) and lowers the fire gate.
    test('EFFICIENCY via the SP system lowers the live power cost (capped at -50%)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.activePower = 'CHARGE_SHOT';
            p.powerCooldown = 0;
            const baseCost = p.getPowerEnergyCost(); // 0-point baseline
            p.sp = 30;
            for (let i = 0; i < 25; i++) { p.allocateSp('EFFICIENCY'); }
            const cappedCost = p.getPowerEnergyCost();
            // The fire gate now clears at the discounted cost: park energy just
            // above the discounted cost but below the base cost.
            p.energy = (baseCost + cappedCost) / 2;
            const readyAtDiscount = p.isPowerReady();
            return { baseCost, cappedCost, points: p.spStats.EFFICIENCY, readyAtDiscount };
        });
        expect(r.points).toBe(20);
        // Full EFFICIENCY = the -50% cap → exactly half the base cost.
        expect(r.cappedCost).toBeCloseTo(r.baseCost * 0.5, 5);
        // Energy between the discounted and base cost now clears the gate.
        expect(r.readyAtDiscount).toBe(true);
    });

    test('no fatal JS errors through the energy-economy flow', async ({ page }) => {
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
