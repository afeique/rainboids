/**
 * QA-49: OVERCLOCK keystone — power-economy inversion (alternate economy).
 *
 * Overclock is a no-downside energy keystone that INVERTS the power economy:
 *   • Power weapons IGNORE the energy meter — they cost 0 energy (no spend, no
 *     energy gate). isPowerReady gates ONLY on the dedicated _overclockCdUntil
 *     timer (energy AND the per-weapon powerCooldown are ignored).
 *   • They fire on a flat ~2.5s internal cooldown (a machine-gun-power cadence).
 *   • They deal ~60% effect (×0.6 damage) — the tradeoff for free + spammable.
 *
 * Verified through the live game surface (NOVA_BLAST — a non-charge power with a
 * `ringDamage` field, spent synchronously; same spy harness as QA-48):
 *   • with OVERCLOCK, a power fired at 0 energy STILL fires (energy stays ~0, not
 *     spent), goes on the ~2.5s internal cooldown (isPowerReady false right after,
 *     ready again after the cooldown), and deals ×0.6 base damage;
 *   • DEFAULT-SAFE: without the keystone, the same 0-energy attempt does NOT fire
 *     (energy-gated, byte-for-byte unchanged);
 *   • no fatal JS errors.
 *
 * Bounded: equips one passive, a couple synchronous casts + a short wait.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const FATAL = (m) =>
    !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
    !m.includes('Font') && !m.includes('net::ERR') &&
    !/favicon|ResizeObserver|AudioContext|Failed to load resource/i.test(m);

// Equip (or clear) OVERCLOCK via the real owned+slot+equip path, pick NOVA_BLAST
// (deterministic non-charge power with a ringDamage field), and spy on fireNova
// to capture the ringDamage of the config it actually dispatches.
async function primePlayer(page, { overclock = false } = {}) {
    return page.evaluate(({ overclock }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        for (const k of Object.keys(p.spStats)) p.spStats[k] = 0; // clean 0-SP baseline
        if (overclock) {
            p.setOwnedPassives(['OVERCLOCK']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'OVERCLOCK');
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
        p._overclockCdUntil = 0;
        const orig = p.fireNova.bind(p);
        window.__lastRingDamage = null;
        window.__baseRingDamage = p.getActivePowerConfig().ringDamage;
        p.fireNova = function (config) {
            window.__lastRingDamage = config ? config.ringDamage : null;
            return orig(config);
        };
        return {
            overclock: p.hasPassive('OVERCLOCK'),
            baseRingDamage: window.__baseRingDamage,
            cost: p.getPowerEnergyCost(),
        };
    }, { overclock });
}

// Attempt a power cast gated on isPowerReady (the real game gate); report whether
// it fired, energy spent, the dispatched damage, and the post-fire ready state.
async function tryCast(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        window.__lastRingDamage = null;
        const before = p.energy;
        const ready = p.isPowerReady();
        let fired = false;
        if (ready) { p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool); fired = true; }
        return {
            ready,
            fired,
            before,
            after: p.energy,
            spent: before - p.energy,
            ringDamage: window.__lastRingDamage,
            readyAfter: p.isPowerReady(),
            cdUntil: p._overclockCdUntil,
        };
    });
}

test.describe('QA-49: Overclock power-economy inversion', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('with OVERCLOCK, a power fires at 0 energy (not spent), at ×0.6 effect, on a ~2.5s cooldown', async ({ page }) => {
        const prime = await primePlayer(page, { overclock: true });
        expect(prime.overclock).toBe(true);

        // Drain energy to 0 (a tiny passive regen may tick before the cast — the
        // spend delta below is what proves the cast itself costs nothing). 0 < cost
        // would block the energy-gated path entirely; only Overclock lets it fire.
        await page.evaluate(() => { window.gameEngine.player.energy = 0; });

        const fired = await tryCast(page);
        expect(fired.ready).toBe(true);                  // gated only on the (clear) Overclock timer
        expect(fired.fired).toBe(true);
        expect(fired.before).toBeLessThan(prime.cost);   // started below the energy cost (energy-gate would block)
        expect(fired.spent).toBe(0);                     // energy NOT spent by the cast (before === after)
        expect(fired.after).toBe(fired.before);          // no deduction across the cast
        // ×0.6 effect on the config the fire fn received.
        expect(fired.ringDamage).toBeCloseTo(prime.baseRingDamage * 0.6, 4);
        // Now on the internal cooldown — not ready immediately after.
        expect(fired.readyAfter).toBe(false);
        expect(fired.cdUntil).toBeGreaterThan(0);
    });

    test('the internal cooldown clears after ~2.5s, then the power is ready again at 0 energy', async ({ page }) => {
        await primePlayer(page, { overclock: true });
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.energy = 0;
            p.firePower(window.gameEngine.bulletPool, window.gameEngine.audioManager, window.gameEngine.particlePool);
        });
        // Right after firing: still on cooldown.
        const mid = await page.evaluate(() => window.gameEngine.player.isPowerReady());
        expect(mid).toBe(false);

        // After the 2.5s flat cooldown (+margin), the timer elapses → ready again.
        await page.waitForTimeout(2800);
        const after = await page.evaluate(() => {
            const p = window.gameEngine.player;
            return { ready: p.isPowerReady(), energy: p.energy };
        });
        expect(after.ready).toBe(true); // ready again despite still being at ~0 energy
    });

    test('DEFAULT-SAFE: without OVERCLOCK, a 0-energy cast attempt does NOT fire (energy-gated)', async ({ page }) => {
        const prime = await primePlayer(page, { overclock: false });
        expect(prime.overclock).toBe(false);

        await page.evaluate(() => { window.gameEngine.player.energy = 0; });

        const attempt = await tryCast(page);
        expect(attempt.ready).toBe(false);  // energy-gated: 0 < cost → not ready
        expect(attempt.fired).toBe(false);  // never fires
        expect(attempt.ringDamage).toBeNull();
        expect(attempt.spent).toBe(0);      // nothing spent (it never fired)
    });

    test('no fatal JS errors through the overclock flow', async ({ page }) => {
        await primePlayer(page, { overclock: true });
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.energy = 0;
            p.firePower(window.gameEngine.bulletPool, window.gameEngine.audioManager, window.gameEngine.particlePool);
        });
        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
