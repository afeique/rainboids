/**
 * QA-37: BLOODSHIELD passive (CD-10) — live damage-soak buffer.
 *
 * Over-healing past max HP banks into a temporary buffer that soaks incoming
 * damage BEFORE HP (cap = 35% max HP, slow decay). These tests exercise the
 * live game (ge.takeDamage / the heal-overflow feed) and verify:
 *   • a filled buffer absorbs a hit (HP loss reduced, buffer decremented)
 *   • a buffer smaller than the hit empties and the remainder hits HP
 *   • over-healing while the passive is equipped banks the buffer (the feed)
 *   • DEFAULT-SAFE: without the passive / empty buffer, a hit takes full damage
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Reset the player to a clean, non-invincible full-HP state with the given
// bloodshield buffer. Returns the effective max HP so assertions can be exact.
async function primePlayer(page, { bloodshield = 0, equipBloodshield = false } = {}) {
    return page.evaluate(({ bloodshield, equipBloodshield }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (equipBloodshield) {
            p.setOwnedPassives(['BLOODSHIELD']);
            p.setPassiveSlotsUnlocked(2);
            p.equipPassive(0, 'BLOODSHIELD');
        } else {
            p.setOwnedPassives([]);
            p.equippedPassives[0] = null;
            p._rebuildActivePassives();
        }
        p.invincible = false;
        p.invincibilityTimer = 0;
        // Zero the base 15% shield so finalDamage == raw damage and the soak
        // assertions are exact. The bloodshield soak runs AFTER shield/resist
        // reduction (so this only simplifies the arithmetic, not the path).
        p.shield = 0;
        const maxHp = p.getEffectiveMaxHealth();
        p.health = maxHp;
        ge.healthTanks = 0; // avoid a tank-pop masking a lethal/HP change
        p.bloodshield = bloodshield;
        p._bloodshieldRefreshMs = Date.now();
        return { maxHp, hasPassive: p.hasPassive('BLOODSHIELD') };
    }, { bloodshield, equipBloodshield });
}

test.describe('QA-37: BLOODSHIELD soak + feed', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('a filled buffer soaks the whole hit (HP untouched, buffer drained)', async ({ page }) => {
        const { maxHp } = await primePlayer(page, { bloodshield: 40 });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const hpBefore = ge.player.health;
            const bufBefore = ge.player.bloodshield;
            const dealt = ge.takeDamage(25, { fxX: ge.player.x, fxY: ge.player.y });
            return { dealt, hpBefore, hpAfter: ge.player.health, bufBefore, bufAfter: ge.player.bloodshield };
        });
        expect(r.dealt).toBe(0);                // nothing reached HP
        expect(r.hpAfter).toBe(r.hpBefore);     // HP fully protected
        expect(r.hpAfter).toBe(maxHp);
        expect(r.bufAfter).toBe(15);            // 40 − 25
    });

    test('a partial buffer empties and the remainder hits HP', async ({ page }) => {
        await primePlayer(page, { bloodshield: 10 });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const hpBefore = ge.player.health;
            const dealt = ge.takeDamage(25, { fxX: ge.player.x, fxY: ge.player.y });
            return { dealt, hpBefore, hpAfter: ge.player.health, bufAfter: ge.player.bloodshield };
        });
        expect(r.dealt).toBe(15);               // 25 − 10 reached HP
        expect(r.bufAfter).toBe(0);             // buffer emptied
        expect(r.hpBefore - r.hpAfter).toBe(15); // exactly the remainder
    });

    test('over-healing with the passive equipped banks the buffer (the feed)', async ({ page }) => {
        const { maxHp } = await primePlayer(page, { bloodshield: 0, equipBloodshield: true });
        const r = await page.evaluate((maxHp) => {
            const ge = window.gameEngine;
            // Player is at full HP; a 50-HP orb is entirely overflow. The feed
            // routes overflow into the buffer (up to 35% max HP) before tanks.
            ge.applyHealthOrbToTanks(50, 0);
            return {
                bloodshield: ge.player.bloodshield,
                cap: ge.player.getBloodshieldCap(),
                hasPassive: ge.player.hasPassive('BLOODSHIELD'),
            };
        }, maxHp);
        expect(r.hasPassive).toBe(true);
        expect(r.bloodshield).toBeGreaterThan(0);           // overflow banked
        expect(r.bloodshield).toBeLessThanOrEqual(r.cap + 0.001); // never exceeds the cap
        expect(r.cap).toBeCloseTo(maxHp * 0.35, 3);
    });

    test('DEFAULT-SAFE: no passive + empty buffer → hit takes full damage', async ({ page }) => {
        await primePlayer(page, { bloodshield: 0, equipBloodshield: false });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const hpBefore = ge.player.health;
            const dealt = ge.takeDamage(20, { fxX: ge.player.x, fxY: ge.player.y });
            return { dealt, drop: hpBefore - ge.player.health, buf: ge.player.bloodshield };
        });
        // Desktop QA project → no mobile mult, no shield/director scaling here:
        // the full 20 lands on HP and the buffer stays empty.
        expect(r.dealt).toBe(20);
        expect(r.drop).toBe(20);
        expect(r.buf).toBe(0);
    });

    test('no fatal JS errors through the bloodshield flow', async ({ page }) => {
        await primePlayer(page, { bloodshield: 30, equipBloodshield: true });
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.applyHealthOrbToTanks(40, 0);   // feed
            ge.takeDamage(15);                 // soak
            ge.takeDamage(50);                 // overflow soak + HP
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
