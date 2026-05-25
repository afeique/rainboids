/**
 * QA-24: Skill-suppress aura / Null Drone (ENMY-10)
 *
 * Smoke-tests the suppress-aura vertical slice end-to-end in the live game, using
 * the debug spawn hook `gameEngine.spawnNullDrone()`. The suppress helper itself
 * is unit-tested; this exercises the LIVE wiring (spawn → in-aura suppression →
 * slowed cooldown regen → kill → recover) in the running game. Asserts:
 *   (a) the debug hook spawns a NULL_DRONE into the enemy pool carrying a
 *       `suppressAura` config (the read-only config is attached on the live
 *       spawn path)
 *   (b) with a drone in range, after a tick cooldownRegenScale(player, now) < 1
 *       and isSuppressed(player, now) is true — while a player with NO drone
 *       nearby has cooldownRegenScale === 1 / isSuppressed false (default-safe)
 *   (c) an ability cooldown recharges SLOWER while suppressed than over the same
 *       span unsuppressed (the engine applySuppressAura → updateAbilityCooldowns
 *       regen-scale path is live)
 *   (d) killing the drone restores normal regen after LINGER_MS
 *   (e) NO fatal JS errors through spawn → suppression → kill
 *
 * Access mirrors 22-cloak / 23-blink: dynamic-import the helper module inside
 * page.evaluate and read/operate on the live player + enemy state. The aura
 * stamp + the regen read both use the wall-clock (frameClock.now / Date.now —
 * the former is a cached Date.now), so an explicit `now` is taken from the live
 * frame clock where a read must agree with a stamp.
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

// Spawn a Null Drone via the debug hook (on top of the player so the ship sits
// inside the ~220px aura) and return a snapshot.
async function spawnNullDrone(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        // Spawn right on the player so the ship is inside the aura immediately.
        const e = ge.spawnNullDrone({ x: ge.player.x, y: ge.player.y });
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasAura: !!e.suppressAura,
            radius: e.suppressAura ? e.suppressAura.radius : null,
            cooldownScale: e.suppressAura ? e.suppressAura.cooldownScale : null,
            blocksActivation: e.suppressAura ? e.suppressAura.blocksActivation : null,
        };
    });
}

test.describe('QA-24: Skill-suppress aura / Null Drone', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + suppressAura config
    // ------------------------------------------------------------------

    test('debug hook spawns a NULL_DRONE carrying a suppressAura config', async ({ page }) => {
        const snap = await spawnNullDrone(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('NULL_DRONE');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('VOLT');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasAura).toBe(true);
        // Aura config from the NULL_DRONE type def.
        expect(snap.radius).toBeGreaterThan(0);
        expect(snap.cooldownScale).toBeGreaterThan(0);
        expect(snap.cooldownScale).toBeLessThan(1); // slows the recharge
        expect(snap.blocksActivation).toBe(false);   // slow-only, no hard-lock

        // It is present in the active enemy pool.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'NULL_DRONE' && e.suppressAura && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) In-aura → suppressed; no-drone → not suppressed (default-safe)
    // ------------------------------------------------------------------

    test('in aura cooldownRegenScale < 1 + isSuppressed true; no drone → scale 1 / not suppressed', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const sup = await import('/js/modules/enemy/abilities/suppress-aura.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');
            const p = ge.player;

            // Baseline: NO drone yet — the player must read full-speed regen.
            const baselineScale = sup.cooldownRegenScale(p, frameClock.now);
            const baselineSuppressed = sup.isSuppressed(p, frameClock.now);

            // Spawn a drone on top of the player, then run the live per-frame
            // suppress scan (engine wrapper) to stamp the player's fields.
            const drone = ge.spawnNullDrone({ x: p.x, y: p.y });
            ge.applySuppressAura();
            const now = frameClock.now;
            const inAuraScale = sup.cooldownRegenScale(p, now);
            const inAuraSuppressed = sup.isSuppressed(p, now);

            return {
                baselineScale,
                baselineSuppressed,
                droneScale: drone.suppressAura.cooldownScale,
                inAuraScale,
                inAuraSuppressed,
            };
        });
        // Default-safe baseline — no drone ⇒ no suppression.
        expect(result.baselineScale).toBe(1);
        expect(result.baselineSuppressed).toBe(false);
        // In aura ⇒ the regen tick is scaled by the drone's cooldownScale.
        expect(result.inAuraSuppressed).toBe(true);
        expect(result.inAuraScale).toBeLessThan(1);
        expect(result.inAuraScale).toBeCloseTo(result.droneScale, 5);
    });

    // ------------------------------------------------------------------
    // (c) Suppressed regen is slower than unsuppressed regen
    // ------------------------------------------------------------------

    test('an ability cooldown recharges slower while suppressed', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const { frameClock } = await import('/js/modules/core/frame-clock.js');
            const p = ge.player;
            const dt = 16; // one ~frame's worth of ms
            const startCd = 5000;

            // --- Unsuppressed span: no drone nearby. Drain a known cooldown. ---
            // (Clear any aura stamp from a prior frame so this is a clean baseline.)
            p._skillSuppressedUntil = 0;
            p.abilityCooldowns[0] = startCd;
            for (let i = 0; i < 20; i++) p.updateAbilityCooldowns(dt);
            const unsuppressedRemaining = p.abilityCooldowns[0];

            // --- Suppressed span: spawn a drone on the player + re-stamp every
            // tick (the engine wrapper does this each frame; here we drive it). ---
            ge.spawnNullDrone({ x: p.x, y: p.y });
            p.abilityCooldowns[0] = startCd;
            for (let i = 0; i < 20; i++) {
                ge.applySuppressAura();          // re-stamp (mirrors per-frame engine call)
                p.updateAbilityCooldowns(dt);
            }
            const suppressedRemaining = p.abilityCooldowns[0];

            return {
                startCd,
                unsuppressedRemaining,
                suppressedRemaining,
                suppressedNow: p._skillSuppressedUntil > frameClock.now,
            };
        });
        // Both spans drained from the same start; suppressed must have MORE
        // remaining (it recharged less — slower regen).
        expect(result.suppressedRemaining).toBeGreaterThan(result.unsuppressedRemaining);
        expect(result.unsuppressedRemaining).toBeLessThan(result.startCd);
        expect(result.suppressedNow).toBe(true);
    });

    // ------------------------------------------------------------------
    // (d) Killing the drone restores normal regen after LINGER_MS
    // ------------------------------------------------------------------

    test('killing the drone restores cooldownRegenScale to 1 after LINGER_MS', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const sup = await import('/js/modules/enemy/abilities/suppress-aura.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');
            const p = ge.player;

            // Spawn the drone INSIDE this synchronous evaluate so the live loop
            // can't move it out of range / kill it before we read (the
            // keep_distance AI retreats to ~320px and a player-overlapping spawn
            // can ram-die between separate evaluates). Anchor it on the player.
            const e0 = ge.spawnNullDrone({ x: p.x, y: p.y });
            if (e0) { e0.x = p.x; e0.y = p.y; e0.warping = false; }

            // Confirm suppressed while the drone is alive + in range.
            ge.applySuppressAura();
            const now = frameClock.now;
            const whileAlive = sup.cooldownRegenScale(p, now);

            // Kill the drone through the real damage path.
            if (e0) {
                ge.applyDamageToEnemy(e0, 1e6, { showNumber: false });
                if (e0.health <= 0) { e0._deathFlash = 8; e0._deathFlashMax = 8; ge.onEnemyKill(e0); }
            }

            // The stamp self-expires LINGER_MS after the last in-aura frame.
            // Read at now + LINGER_MS + 1 to confirm it has lapsed back to 1.
            const afterLinger = sup.cooldownRegenScale(p, now + sup.LINGER_MS + 1);
            const suppressedAfter = sup.isSuppressed(p, now + sup.LINGER_MS + 1);

            return { whileAlive, afterLinger, suppressedAfter, LINGER_MS: sup.LINGER_MS };
        });
        expect(result.whileAlive).toBeLessThan(1);   // suppressed while alive
        expect(result.afterLinger).toBe(1);          // restored after the linger lapses
        expect(result.suppressedAfter).toBe(false);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → suppression → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → suppression → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnNullDrone(page);

        // Let the live loop run real frames so the engine applySuppressAura scan
        // stamps the player and updateAbilityCooldowns runs the scaled regen.
        await page.waitForTimeout(600);

        // Kill it through the real damage path.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'NULL_DRONE');
            if (!e) return;
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) {
                e._deathFlash = 8;
                e._deathFlashMax = 8;
                ge.onEnemyKill(e);
            }
        });

        // Run more frames so the suppression stamp lapses + the HUD cue clears.
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
