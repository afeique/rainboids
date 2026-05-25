/**
 * QA-27: Player buff-strip on contact / Leech (ENMY-05)
 *
 * Smoke-tests the buff-strip vertical slice end-to-end in the live game, using
 * the debug spawn hook `gameEngine.spawnLeech()`. The buff-strip helper's
 * suppression convention is unit-tested; this exercises the LIVE wiring (spawn →
 * contact strips a random powerup + suppresses its re-grant → cooldown throttle →
 * window lapses → re-grantable) in the running game.
 *
 * IMPORTANT — data-model adaptation: the shipped buff-strip.js helper was written
 * against an ASSUMED `player.activePowerups` object-map; the LIVE game stores
 * powerups in `player.powerups` (a Map of type → { stacks, timeRemaining }). The
 * mechanic (applyBuffStrip in collision-system) is implemented against the real
 * Map; only the helper's model-agnostic `isBuffSuppressed` convention +
 * STRIP_DURATION_MS are reused. So these tests operate on the LIVE Map.
 *
 * Asserts:
 *   (a) the debug hook spawns a LEECH into the enemy pool carrying a `stripsBuff`
 *       flag + a `stripCooldownMs` (attached on the live spawn path)
 *   (b) a contact strips ONE powerup: it is removed from `player.powerups` AND
 *       `isBuffSuppressed(player, key, now)` is true for it
 *   (c) the stripped powerup can't be re-granted while suppressed (addPowerup
 *       no-ops during the window) and CAN be granted again after STRIP_DURATION_MS
 *   (d) the per-Leech cooldown: a SECOND immediate contact strips nothing more
 *       (only after stripCooldownMs); and a player with NO Leech / a non-Leech
 *       contact keeps all powerups (default-safe baseline)
 *   (e) NO fatal JS errors through spawn → contact/strip → kill
 *
 * Access mirrors 26-absorb / 24-suppress: dynamic-import the helper + the
 * collision module inside page.evaluate and operate on the live player / pools.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Collect any page errors so we can assert "no fatal JS errors" at the end.
function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

// Spawn a Leech via the debug hook and return a snapshot.
async function spawnLeech(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnLeech();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            stripsBuff: !!e.stripsBuff,
            stripCooldownMs: e.stripCooldownMs,
            lastStripAt: e._lastStripAt,
        };
    });
}

test.describe('QA-27: Player buff-strip on contact / Leech', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + stripsBuff config
    // ------------------------------------------------------------------

    test('debug hook spawns a LEECH carrying a stripsBuff flag + stripCooldownMs', async ({ page }) => {
        const snap = await spawnLeech(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('LEECH');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('TOXIC');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.stripsBuff).toBe(true);
        expect(snap.stripCooldownMs).toBeGreaterThan(0);
        // Fresh spawn carries no stale strip stamp.
        expect(snap.lastStripAt).toBe(0);

        // It is present in the active enemy pool, flagged as a stripper.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'LEECH' && e.stripsBuff && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) A contact strips ONE powerup: removed from the Map + suppressed
    // ------------------------------------------------------------------

    test('a Leech contact strips one powerup: removed from player.powerups + suppressed', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const bs = await import('/js/modules/enemy/abilities/buff-strip.js');
            const p = ge.player;

            // Grant a couple of strippable powerups via the LIVE addPowerup path.
            p.powerups.clear();
            p._buffSuppressed = {};
            p.addPowerup('RAPID_FIRE', { maxStacks: 99 });
            p.addPowerup('MULTI_SHOT', { maxStacks: 99 });
            const before = p.powerups.size;
            const keysBefore = Array.from(p.powerups.keys());

            // Spawn a Leech right on the player + drive a contact strip directly
            // (place it on the ship; applyBuffStrip is the contact mechanic).
            const e = ge.spawnLeech({ x: p.x, y: p.y });
            e.x = p.x; e.y = p.y; e.warping = false; e._lastStripAt = 0;
            const now = Date.now();
            const stripped = col.applyBuffStrip.call(ge, p, e, now);

            const after = p.powerups.size;
            const suppressed = stripped != null
                ? bs.isBuffSuppressed(p, stripped, now)
                : false;
            const stillPresent = stripped != null ? p.powerups.has(stripped) : true;

            return {
                before, after, keysBefore, stripped, suppressed, stillPresent,
                stampStored: !!(p._buffSuppressed && p._buffSuppressed[stripped] > now),
            };
        });

        expect(result.before).toBe(2);
        expect(result.keysBefore.sort()).toEqual(['MULTI_SHOT', 'RAPID_FIRE']);
        // Exactly one powerup was stripped.
        expect(result.stripped).not.toBeNull();
        expect(['RAPID_FIRE', 'MULTI_SHOT']).toContain(result.stripped);
        expect(result.after).toBe(1);
        // It is gone from the live Map AND suppressed.
        expect(result.stillPresent).toBe(false);
        expect(result.suppressed).toBe(true);
        expect(result.stampStored).toBe(true);
    });

    // ------------------------------------------------------------------
    // (c) Stripped buff can't be re-granted while suppressed; can after the window
    // ------------------------------------------------------------------

    test('a stripped powerup is blocked from re-grant during the window, granted after it lapses', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const bs = await import('/js/modules/enemy/abilities/buff-strip.js');
            const p = ge.player;

            p.powerups.clear();
            p._buffSuppressed = {};
            p.addPowerup('RAPID_FIRE', { maxStacks: 99 });

            const e = ge.spawnLeech({ x: p.x, y: p.y });
            e.x = p.x; e.y = p.y; e.warping = false; e._lastStripAt = 0;
            const stripped = col.applyBuffStrip.call(ge, p, e, Date.now());

            // Try to re-grant the very powerup that was just stripped — addPowerup
            // must NO-OP while suppressed.
            p.addPowerup(stripped, { maxStacks: 99 });
            const reGrantBlocked = !p.powerups.has(stripped);

            // Simulate the suppression window lapsing: roll the stamp into the past
            // (the wall-clock check in addPowerup reads Date.now()).
            p._buffSuppressed[stripped] = Date.now() - 1;
            const lapsed = !bs.isBuffSuppressed(p, stripped, Date.now());
            p.addPowerup(stripped, { maxStacks: 99 });
            const reGrantAllowed = p.powerups.has(stripped);

            return { stripped, reGrantBlocked, lapsed, reGrantAllowed,
                     STRIP_DURATION_MS: bs.STRIP_DURATION_MS };
        });

        expect(result.stripped).not.toBeNull();
        // 5-second suppression window matches the helper convention.
        expect(result.STRIP_DURATION_MS).toBe(5000);
        // Blocked during the window…
        expect(result.reGrantBlocked).toBe(true);
        // …and granted again once it lapses.
        expect(result.lapsed).toBe(true);
        expect(result.reGrantAllowed).toBe(true);
    });

    // ------------------------------------------------------------------
    // (d) Per-Leech cooldown + default-safe baselines
    // ------------------------------------------------------------------

    test('per-Leech cooldown throttles a 2nd immediate contact; non-Leech contact strips nothing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const p = ge.player;

            // --- Cooldown: two powerups, but a 2nd IMMEDIATE contact must no-op ---
            p.powerups.clear();
            p._buffSuppressed = {};
            p.addPowerup('RAPID_FIRE', { maxStacks: 99 });
            p.addPowerup('MULTI_SHOT', { maxStacks: 99 });

            const leech = ge.spawnLeech({ x: p.x, y: p.y });
            leech.x = p.x; leech.y = p.y; leech.warping = false; leech._lastStripAt = 0;

            const now = Date.now();
            const first = col.applyBuffStrip.call(ge, p, leech, now);
            const sizeAfterFirst = p.powerups.size;
            // A 2nd contact one frame later — inside stripCooldownMs → no-op.
            const second = col.applyBuffStrip.call(ge, p, leech, now + 16);
            const sizeAfterSecond = p.powerups.size;
            // A 3rd contact AFTER the cooldown elapses → strips the last one.
            const third = col.applyBuffStrip.call(ge, p, leech, now + leech.stripCooldownMs + 1);
            const sizeAfterThird = p.powerups.size;

            // --- Default-safe: a NON-Leech contact strips nothing ---
            p.powerups.clear();
            p._buffSuppressed = {};
            p.addPowerup('RAPID_FIRE', { maxStacks: 99 });
            p.addPowerup('PIERCING', { maxStacks: 99 });
            const sizeBeforeBaseline = p.powerups.size;
            // A plain object with no stripsBuff flag (mirrors any normal enemy).
            const nonLeech = { stripsBuff: false, color: '#fff', x: p.x, y: p.y };
            const baselineStripped = col.applyBuffStrip.call(ge, p, nonLeech, Date.now());
            const sizeAfterBaseline = p.powerups.size;

            return {
                first, sizeAfterFirst,
                second, sizeAfterSecond,
                third, sizeAfterThird,
                sizeBeforeBaseline, baselineStripped, sizeAfterBaseline,
            };
        });

        // First contact strips one (2 → 1).
        expect(result.first).not.toBeNull();
        expect(result.sizeAfterFirst).toBe(1);
        // Second IMMEDIATE contact is throttled — nothing stripped (still 1).
        expect(result.second).toBeNull();
        expect(result.sizeAfterSecond).toBe(1);
        // Third contact after the cooldown strips the last (1 → 0).
        expect(result.third).not.toBeNull();
        expect(result.sizeAfterThird).toBe(0);

        // Default-safe: a non-Leech contact strips nothing.
        expect(result.sizeBeforeBaseline).toBe(2);
        expect(result.baselineStripped).toBeNull();
        expect(result.sizeAfterBaseline).toBe(2);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → contact/strip → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → contact/strip → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnLeech(page);

        // Grant a couple powerups + run real frames so the live loop ticks the
        // Leech's homing pursuit toward the player.
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.powerups.clear();
            p._buffSuppressed = {};
            p.addPowerup('RAPID_FIRE', { maxStacks: 99 });
            p.addPowerup('MULTI_SHOT', { maxStacks: 99 });
        });
        await page.waitForTimeout(400);

        // Drive a contact strip through the live mechanic, then kill the Leech
        // through the real damage path.
        await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'LEECH');
            if (!e) return;
            e.x = ge.player.x; e.y = ge.player.y; e._lastStripAt = 0;
            col.applyBuffStrip.call(ge, ge.player, e, Date.now());
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) { e._deathFlash = 8; e._deathFlashMax = 8; ge.onEnemyKill(e); }
        });

        // Run more frames so the toast + FX particles tick + expire.
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
