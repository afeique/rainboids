/**
 * QA-43: energy-synergy powerups — SURGE_BATTERY + FLUX.
 *
 *   • SURGE_BATTERY (1-stack) — while held, the FIRST power weapon each wave costs
 *     0 energy (weapons.firePower zeroes the cost + spends the per-wave charge);
 *     recharges at wave start (game-engine.spawnWaveEntities → wave-manager).
 *   • FLUX — while held, each power cast adds a stacking +energy-regen buff
 *     (progression.getEffectiveEnergyRegenMult) that fades when casting stops.
 *
 * Exercised LIVE on the running game by firing a non-charge power (NOVA_BLAST,
 * deterministic synchronous spend) through ge.player.firePower and reading the
 * energy delta / regen mult. Verifies:
 *   • SURGE_BATTERY: 1st cast this wave spends 0, the 2nd spends normally
 *   • SURGE_BATTERY: spawnWaveEntities recharges the free shot
 *   • SURGE_BATTERY DEFAULT-SAFE: WITHOUT it, every cast spends the base cost
 *   • FLUX: after a power cast, getEffectiveEnergyRegenMult exceeds baseline; no
 *     powerup → regen mult is byte-for-byte the baseline (1 + REACTOR%)
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Toggle a powerup on the live player, pick a deterministic non-charge power, top
// off energy, and clear the per-wave bookkeeping so the free shot is ready.
async function primePlayer(page, { surge = false, flux = false } = {}) {
    return page.evaluate(({ surge, flux }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (surge) p.powerups.set('SURGE_BATTERY', { stacks: 1 });
        else p.powerups.delete('SURGE_BATTERY');
        if (flux) p.powerups.set('FLUX', { stacks: 1 });
        else p.powerups.delete('FLUX');
        // NOVA_BLAST — a non-charge power with a fixed energy cost; firePower spends
        // it synchronously, so the delta is deterministic.
        p.activePower = 'NOVA_BLAST';
        p.powerCooldown = 0;
        p.energy = p.getEffectiveMaxEnergy();
        p._surgeBatteryReady = true;
        p._fluxStacks = 0;
        p._fluxRefreshMs = 0;
        return {
            surge: p.getPowerupStacks('SURGE_BATTERY') > 0,
            flux: p.getPowerupStacks('FLUX') > 0,
            cost: p.getPowerEnergyCost(),
        };
    }, { surge, flux });
}

// Fire one power weapon synchronously and return the energy delta.
async function castPower(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        const before = p.energy;
        p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
        return { before, after: p.energy, spent: before - p.energy };
    });
}

test.describe('QA-43: SURGE_BATTERY + FLUX energy-synergy powerups', () => {
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

    test('SURGE_BATTERY: 1st power cast this wave is free, 2nd spends normally', async ({ page }) => {
        const prime = await primePlayer(page, { surge: true });
        expect(prime.surge).toBe(true);
        expect(prime.cost).toBeGreaterThan(0);
        const first = await castPower(page);
        const second = await castPower(page);
        expect(first.spent).toBe(0);                       // free first cast
        expect(second.spent).toBeCloseTo(prime.cost, 5);   // normal cost after
    });

    test('SURGE_BATTERY: spawnWaveEntities recharges the free shot', async ({ page }) => {
        await primePlayer(page, { surge: true });
        const first = await castPower(page);               // spends the charge
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const readyBefore = ge.player._surgeBatteryReady;
            ge.spawnWaveEntities();                          // wave-start recharge
            return { readyBefore, readyAfter: ge.player._surgeBatteryReady };
        });
        expect(first.spent).toBe(0);
        expect(r.readyBefore).toBe(false);                  // spent by the first cast
        expect(r.readyAfter).toBe(true);                    // recharged at wave start
        // The next wave's first cast is free again.
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.powerCooldown = 0;
            p.energy = p.getEffectiveMaxEnergy();
        });
        const next = await castPower(page);
        expect(next.spent).toBe(0);
    });

    test('SURGE_BATTERY DEFAULT-SAFE: without it, every cast spends the base cost', async ({ page }) => {
        const prime = await primePlayer(page, { surge: false });
        expect(prime.surge).toBe(false);
        const first = await castPower(page);
        expect(first.spent).toBeCloseTo(prime.cost, 5);     // no free shot
    });

    test('FLUX: a power cast raises the energy-regen mult above baseline', async ({ page }) => {
        await primePlayer(page, { flux: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const baseMult = p.getEffectiveEnergyRegenMult(); // 1 + REACTOR% (0 SP → 1)
            p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
            return { baseMult, afterMult: p.getEffectiveEnergyRegenMult(), stacks: p._fluxStacks };
        });
        expect(r.baseMult).toBe(1);
        expect(r.stacks).toBeGreaterThan(0);                // a cast added a stack
        expect(r.afterMult).toBeGreaterThan(r.baseMult);    // regen ramped up
    });

    test('FLUX DEFAULT-SAFE: without it, a cast leaves the regen mult at baseline', async ({ page }) => {
        await primePlayer(page, { flux: false });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const baseMult = p.getEffectiveEnergyRegenMult();
            p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
            return { baseMult, afterMult: p.getEffectiveEnergyRegenMult(), stacks: p._fluxStacks || 0 };
        });
        expect(r.baseMult).toBe(1);
        expect(r.stacks).toBe(0);                           // no powerup → no stacks
        expect(r.afterMult).toBe(r.baseMult);               // byte-for-byte unchanged
    });

    test('no fatal JS errors through the energy-powerup flow', async ({ page }) => {
        await primePlayer(page, { surge: true, flux: true });
        await castPower(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.getEffectiveEnergyRegenMult();
            ge.spawnWaveEntities();
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
