/**
 * QA-41: ABLATIVE PLATING powerup (CD-04) — first hit each wave fully blocked.
 *
 * While the ABLATIVE_PLATING powerup is held, the FIRST damaging hit each wave is
 * fully negated (0 damage), then the plate is spent until the next wave recharges
 * it (wave start → ge.spawnWaveEntities sets player._ablativeReady = true). The
 * block sits in lifecycle.takeDamage AFTER the dodge / invuln / i-frame guards.
 *
 * These exercise the LIVE game (ge.takeDamage / ge.spawnWaveEntities) and verify:
 *   • held + ready → first hit blocked (0 HP lost) and the plate is marked spent
 *   • a SECOND hit the same wave takes normal damage
 *   • advancing a wave recharges the plate (next first hit blocked again)
 *   • DEFAULT-SAFE: WITHOUT the powerup, the first hit takes full damage
 * plus: no fatal JS errors through the flow.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Toggle the powerup on the live player by stamping the powerups Map directly (same
// path the sustain-powerups spec uses), clear invincibility + base shield (so
// finalDamage == raw damage and the assertions are exact), set the plate ready, and
// drop HP below max so an HP change is measurable.
async function primePlayer(page, { ablative = false, ready = true } = {}) {
    return page.evaluate(({ ablative, ready }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (ablative) p.powerups.set('ABLATIVE_PLATING', { stacks: 1 });
        else p.powerups.delete('ABLATIVE_PLATING');
        p.invincible = false;
        p.invincibilityTimer = 0;
        p.shield = 0;
        p._ablativeReady = ready;
        const maxHp = (typeof p.getEffectiveMaxHealth === 'function')
            ? p.getEffectiveMaxHealth() : p.maxHealth;
        p.health = maxHp;
        ge.healthTanks = 0; // avoid a tank-pop masking an HP change
        return {
            maxHp,
            held: p.getPowerupStacks('ABLATIVE_PLATING') > 0,
            ready: p._ablativeReady,
        };
    }, { ablative, ready });
}

test.describe('QA-41: ABLATIVE PLATING first-hit block', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('held + ready → first hit fully blocked, plate spent', async ({ page }) => {
        const { maxHp, held } = await primePlayer(page, { ablative: true });
        expect(held).toBe(true);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const hpBefore = ge.player.health;
            const dealt = ge.takeDamage(25, { fxX: ge.player.x, fxY: ge.player.y });
            return { dealt, hpBefore, hpAfter: ge.player.health, ready: ge.player._ablativeReady };
        });
        expect(r.dealt).toBe(0);                 // nothing reached HP
        expect(r.hpAfter).toBe(r.hpBefore);      // HP fully protected
        expect(r.hpAfter).toBe(maxHp);
        expect(r.ready).toBe(false);             // plate spent
    });

    test('a SECOND hit the same wave takes normal damage', async ({ page }) => {
        await primePlayer(page, { ablative: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const first = ge.takeDamage(25, { fxX: ge.player.x, fxY: ge.player.y });
            const hpBeforeSecond = ge.player.health;
            const second = ge.takeDamage(20, { fxX: ge.player.x, fxY: ge.player.y });
            return { first, second, drop: hpBeforeSecond - ge.player.health, ready: ge.player._ablativeReady };
        });
        expect(r.first).toBe(0);                 // first blocked
        expect(r.second).toBe(20);               // second lands in full
        expect(r.drop).toBe(20);
        expect(r.ready).toBe(false);
    });

    test('advancing a wave recharges the plate (next first hit blocked again)', async ({ page }) => {
        await primePlayer(page, { ablative: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.takeDamage(25);                   // spend the plate
            const spent = ge.player._ablativeReady;
            ge.spawnWaveEntities();              // wave start → recharge
            const recharged = ge.player._ablativeReady;
            const hpBefore = ge.player.health;
            const dealt = ge.takeDamage(30, { fxX: ge.player.x, fxY: ge.player.y });
            return { spent, recharged, dealt, drop: hpBefore - ge.player.health, readyAfter: ge.player._ablativeReady };
        });
        expect(r.spent).toBe(false);             // plate was spent
        expect(r.recharged).toBe(true);          // wave start recharged it
        expect(r.dealt).toBe(0);                 // next first hit blocked
        expect(r.drop).toBe(0);
        expect(r.readyAfter).toBe(false);        // spent again
    });

    test('DEFAULT-SAFE: WITHOUT the powerup, the first hit takes full damage', async ({ page }) => {
        await primePlayer(page, { ablative: false, ready: true });
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const hpBefore = ge.player.health;
            const dealt = ge.takeDamage(20, { fxX: ge.player.x, fxY: ge.player.y });
            return { dealt, drop: hpBefore - ge.player.health, ready: ge.player._ablativeReady };
        });
        // Desktop QA project → no mobile mult, no shield/director scaling here: the
        // full 20 lands on HP and the plate flag is left untouched (inert).
        expect(r.dealt).toBe(20);
        expect(r.drop).toBe(20);
        expect(r.ready).toBe(true);              // flag never consulted without the powerup
    });

    test('no fatal JS errors through the ablative flow', async ({ page }) => {
        await primePlayer(page, { ablative: true });
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.takeDamage(25);                   // block
            ge.takeDamage(15);                   // normal
            ge.spawnWaveEntities();              // recharge
            ge.takeDamage(40);                   // block again
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
