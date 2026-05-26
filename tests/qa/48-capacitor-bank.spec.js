/**
 * QA-48: CAPACITOR_BANK keystone — energy overcharge + overcharged power boost.
 *
 * Capacitor Bank is a no-downside energy keystone:
 *   • The energy meter may OVERCHARGE past the normal effective cap
 *     (getEffectiveMaxEnergy), up to 1.5× that cap. The clamp moves at both the
 *     regen clamp + addEnergy clamp via getEnergyOverchargeCap().
 *   • The overcharge (portion ABOVE the normal cap) bleeds off over frames
 *     (CAPACITOR_BANK_DECAY_PER_SEC energy/s), floored at the normal cap.
 *   • A power weapon fired while overcharged deals +25% (captured BEFORE the
 *     energy spend, like Overflow Discharge's full-energy capture).
 *
 * Verified through the live game surface (NOVA_BLAST — non-charge power with a
 * `ringDamage` field, spent synchronously; same spy harness as QA-44):
 *   • with CAPACITOR_BANK, addEnergy can bank into the overcharge zone
 *     (energy > normal cap, ≤ 1.5× cap) AND a power fired there deals ×1.25;
 *   • the overcharge decays over real frames toward the normal cap;
 *   • DEFAULT-SAFE: without the passive, energy clamps at the normal cap and a
 *     power deals base damage (byte-for-byte unchanged);
 *   • no fatal JS errors.
 *
 * Bounded: equips one passive, a few synchronous casts + a short frame wait.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const FATAL = (m) =>
    !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
    !m.includes('Font') && !m.includes('net::ERR') &&
    !/favicon|ResizeObserver|AudioContext|Failed to load resource/i.test(m);

// Equip (or clear) CAPACITOR_BANK via the real owned+slot+equip path, pick
// NOVA_BLAST (deterministic non-charge power with a ringDamage field), and spy on
// fireNova to capture the ringDamage of the config it actually dispatches.
async function primePlayer(page, { capacitor = false } = {}) {
    return page.evaluate(({ capacitor }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        for (const k of Object.keys(p.spStats)) p.spStats[k] = 0; // clean 0-SP baseline
        if (capacitor) {
            p.setOwnedPassives(['CAPACITOR_BANK']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'CAPACITOR_BANK');
        } else {
            p.equippedPassives = [null, null, null, null, null];
            p._rebuildActivePassives();
        }
        // No energy-free / boost powerups interfering with the spend + damage delta.
        p.powerups.delete('OVERFLOW_DISCHARGE');
        p.powerups.delete('SURGE_BATTERY');
        p.powerups.delete('FLUX');
        p._surgeBatteryReady = false;
        p.activePower = 'NOVA_BLAST';
        p.powerCooldown = 0;
        const orig = p.fireNova.bind(p);
        window.__lastRingDamage = null;
        window.__baseRingDamage = p.getActivePowerConfig().ringDamage;
        p.fireNova = function (config) {
            window.__lastRingDamage = config ? config.ringDamage : null;
            return orig(config);
        };
        return {
            capacitor: p.hasPassive('CAPACITOR_BANK'),
            normalMax: p.getEffectiveMaxEnergy(),
            overchargeCap: p.getEnergyOverchargeCap(),
            baseRingDamage: window.__baseRingDamage,
            cost: p.getPowerEnergyCost(),
        };
    }, { capacitor });
}

async function castPower(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        const before = p.energy;
        p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
        return { before, after: p.energy, spent: before - p.energy, ringDamage: window.__lastRingDamage };
    });
}

test.describe('QA-48: Capacitor Bank energy overcharge', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('with CAPACITOR_BANK, energy overcharges past the normal cap (≤ 1.5×) and a power fired there deals +25%', async ({ page }) => {
        const prime = await primePlayer(page, { capacitor: true });
        expect(prime.capacitor).toBe(true);
        expect(prime.overchargeCap).toBeCloseTo(prime.normalMax * 1.5, 4);

        // Bank well past the normal cap; addEnergy should allow up to 1.5×.
        const banked = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.chargePaused = true; // freeze regen so the decay block doesn't run mid-assert
            p.energy = 0;
            p.addEnergy(500);
            return { energy: p.energy, normalMax: p.getEffectiveMaxEnergy(), cap: p.getEnergyOverchargeCap() };
        });
        expect(banked.energy).toBeGreaterThan(banked.normalMax); // overcharged
        expect(banked.energy).toBeCloseTo(banked.cap, 4);        // clamped at 1.5× cap
        expect(banked.energy).toBeLessThanOrEqual(banked.normalMax * 1.5 + 1e-6);

        // Fire a power weapon while overcharged → +25% damage.
        const fired = await castPower(page);
        expect(fired.before).toBeGreaterThan(banked.normalMax);  // still overcharged at the spend
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage * 1.25, 4);
    });

    test('the overcharge decays over frames toward the normal cap', async ({ page }) => {
        await primePlayer(page, { capacitor: true });
        const r = await page.evaluate(async () => {
            const p = window.gameEngine.player;
            p.chargePaused = false; // let the per-frame energy block (incl. decay) run
            const normalMax = p.getEffectiveMaxEnergy();
            p.energy = 0;
            p.addEnergy(500); // bank to the 1.5× overcharge cap
            const start = p.energy;
            // Let real frames run; the per-frame block bleeds the overcharge down.
            await new Promise((res) => setTimeout(res, 700));
            return { normalMax, start, after: p.energy };
        });
        expect(r.start).toBeGreaterThan(r.normalMax);   // started overcharged
        expect(r.after).toBeLessThan(r.start);          // overcharge bled off
        expect(r.after).toBeGreaterThanOrEqual(r.normalMax - 1e-6); // never below the normal cap
    });

    test('DEFAULT-SAFE: without the passive, energy clamps at the normal cap and a power deals base damage', async ({ page }) => {
        const prime = await primePlayer(page, { capacitor: false });
        expect(prime.capacitor).toBe(false);
        expect(prime.overchargeCap).toBe(prime.normalMax); // no overcharge headroom

        const banked = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.chargePaused = true;
            p.energy = 0;
            p.addEnergy(500); // would overcharge if the passive were held
            return { energy: p.energy, normalMax: p.getEffectiveMaxEnergy() };
        });
        expect(banked.energy).toBe(banked.normalMax); // clamps at the normal cap, no overcharge

        const fired = await castPower(page);
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage, 4); // base damage, byte-for-byte
    });

    test('no fatal JS errors through the capacitor-bank flow', async ({ page }) => {
        await primePlayer(page, { capacitor: true });
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.energy = 0;
            p.addEnergy(500);
        });
        await castPower(page);
        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
