/**
 * QA-22: Cloak / Phantom (ENMY-03)
 *
 * Smoke-tests the cloak vertical slice end-to-end in the live game, using the
 * debug spawn hook `gameEngine.spawnPhantom()`. The cloak helper itself is
 * unit-tested; this exercises the LIVE wiring (spawn → cloak cycle → reveal →
 * kill) in the running game. Asserts:
 *   (a) the debug hook spawns a PHANTOM into the enemy pool carrying a `cloak`
 *       state (the dormant helper is now attached on the live spawn path)
 *   (b) the cloak cycles: forcing the cycle into its cloaked window makes
 *       isCloaked() true AND isTargetable(enemy, now) false (it drops off
 *       homing/auto-aim) — while a cloak-less enemy stays always targetable
 *   (c) MARKing the Phantom (the live applyMark path) flips isTargetable back
 *       to true even while cloaked
 *   (d) NO fatal JS errors through spawn → cloak cycle → kill
 *
 * Cloak access mirrors 17-bosses' pattern: dynamic-import the helper module
 * inside page.evaluate and read/operate on the live enemy's cloak state.
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

// Spawn a Phantom via the debug hook and return a snapshot.
async function spawnPhantom(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnPhantom();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasCloak: !!e.cloak,
            cloakVisibleMs: e.cloak ? e.cloak.visibleMs : null,
            cloakCloakedMs: e.cloak ? e.cloak.cloakedMs : null,
        };
    });
}

test.describe('QA-22: Cloak / Phantom', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + cloak state
    // ------------------------------------------------------------------

    test('debug hook spawns a PHANTOM carrying a cloak state', async ({ page }) => {
        const snap = await spawnPhantom(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('PHANTOM');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('VOID');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasCloak).toBe(true);
        // Default cloak cycle durations from createCloak().
        expect(snap.cloakVisibleMs).toBeGreaterThan(0);
        expect(snap.cloakCloakedMs).toBeGreaterThan(0);

        // It is present in the active enemy pool.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'PHANTOM' && e.cloak && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Cloak cycle drops it off the target list while cloaked
    // ------------------------------------------------------------------

    test('while cloaked, isCloaked is true and isTargetable is false', async ({ page }) => {
        await spawnPhantom(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'PHANTOM');
            const cloak = await import('/js/modules/enemy/abilities/cloak.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Drive the cycle into its CLOAKED window by anchoring cycleStart in
            // the past so `now` lands past visibleMs. Read with an explicit now
            // taken from the live frame clock (what update() ticks with).
            const now = frameClock.now;
            e.cloak.cycleStart = now - (e.cloak.visibleMs + 10);
            cloak.tickCloak(e.cloak, now);

            const cloaked = cloak.isCloaked(e.cloak, now);
            const targetable = cloak.isTargetable(e, now);

            // A cloak-less enemy is always targetable — sanity baseline.
            const plain = { cloak: null };
            const plainTargetable = cloak.isTargetable(plain, now);

            return { cloaked, targetable, plainTargetable, stateCloaked: e.cloak.cloaked };
        });
        expect(result.cloaked).toBe(true);
        expect(result.stateCloaked).toBe(true);
        expect(result.targetable).toBe(false);
        // Cloak-less object stays targetable (the wiring is default-safe).
        expect(result.plainTargetable).toBe(true);
    });

    test('while visible, isTargetable is true', async ({ page }) => {
        await spawnPhantom(page);
        const targetable = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'PHANTOM');
            const cloak = await import('/js/modules/enemy/abilities/cloak.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');
            // Anchor the cycle at `now` so we sit at the very start of the
            // VISIBLE window.
            const now = frameClock.now;
            e.cloak.cycleStart = now;
            cloak.tickCloak(e.cloak, now);
            return cloak.isTargetable(e, now);
        });
        expect(targetable).toBe(true);
    });

    // ------------------------------------------------------------------
    // (c) MARK reveals a cloaked Phantom
    // ------------------------------------------------------------------

    test('MARKing a cloaked Phantom reveals it (isTargetable → true)', async ({ page }) => {
        await spawnPhantom(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'PHANTOM');
            const cloak = await import('/js/modules/enemy/abilities/cloak.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Use the SAME clock the live applyMark path stamps with, so the
            // mark window and the isTargetable read agree.
            const now = frameClock.now;
            // Force into the cloaked window.
            e.cloak.cycleStart = now - (e.cloak.visibleMs + 10);
            cloak.tickCloak(e.cloak, now);
            const beforeMark = cloak.isTargetable(e, now);

            // Apply MARK through the live game path, then re-check.
            ge.applyMark(e, 6000);
            const afterMark = cloak.isTargetable(e, now);

            return { beforeMark, afterMark, markUntil: e.markUntil, _markUntil: e._markUntil };
        });
        expect(result.beforeMark).toBe(false);
        expect(result.afterMark).toBe(true);
        // The live mark window is mirrored into the field cloak's isTargetable reads.
        expect(result._markUntil).toBe(result.markUntil);
    });

    // ------------------------------------------------------------------
    // (d) No fatal errors through spawn → cloak cycle → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → cloak cycle → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnPhantom(page);

        // Let the live loop run real frames so update() ticks the cloak and
        // draw() applies the fade across a visible↔cloaked toggle.
        await page.waitForTimeout(600);

        // Kill it through the real damage path.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'PHANTOM');
            if (!e) return;
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) {
                e._deathFlash = 8;
                e._deathFlashMax = 8;
                ge.onEnemyKill(e);
            }
        });

        // Run more frames so the death FX renders (cloaked enemies still show
        // their death flash/debris — the fade only wraps the normal shape).
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
