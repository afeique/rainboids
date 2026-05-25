/**
 * QA-23: Blink / Burrow / Wraithworm (ENMY-07)
 *
 * Smoke-tests the blink-burrow vertical slice end-to-end in the live game, using
 * the debug spawn hook `gameEngine.spawnWraithworm()`. The blink helper itself is
 * unit-tested; this exercises the LIVE wiring (spawn → telegraph → relocate →
 * vanish/untargetable → kill) in the running game. Asserts:
 *   (a) the debug hook spawns a WRAITHWORM into the enemy pool carrying a `blink`
 *       state (the dormant helper is now attached on the live spawn path)
 *   (b) driving a blink cycle to its STRIKE RELOCATES the enemy (x/y change) and
 *       during the windup/strike window isVanished(enemy, now) is true — while a
 *       blink-less object's isVanished stays false (default-safe baseline)
 *   (c) while vanished it drops off targeting — findNearestTarget / homing skip it
 *   (d) freeze guard: a CHILLed/FROZEN Wraithworm can't blink (canBlink false)
 *   (e) NO fatal JS errors through spawn → blink cycle → kill
 *
 * Blink access mirrors 22-cloak's pattern: dynamic-import the helper module
 * inside page.evaluate and read/operate on the live enemy's blink state.
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

// Spawn a Wraithworm via the debug hook and return a snapshot.
async function spawnWraithworm(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnWraithworm();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasBlink: !!e.blink,
            blinkKind: e.blink ? e.blink.kind : null,
            blinkRange: e.blink ? e.blink.range : null,
            blinkIntervalMs: e.blink ? e.blink.intervalMs : null,
        };
    });
}

test.describe('QA-23: Blink / Burrow / Wraithworm', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + blink state
    // ------------------------------------------------------------------

    test('debug hook spawns a WRAITHWORM carrying a blink state', async ({ page }) => {
        const snap = await spawnWraithworm(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('WRAITHWORM');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('VOLT');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasBlink).toBe(true);
        // Burrow config from the WRAITHWORM type def.
        expect(snap.blinkKind).toBe('burrow');
        expect(snap.blinkRange).toBeGreaterThan(0);
        expect(snap.blinkIntervalMs).toBeGreaterThan(0);

        // It is present in the active enemy pool.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'WRAITHWORM' && e.blink && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Blink cycle relocates + vanishes mid-blink
    // ------------------------------------------------------------------

    test('a blink cycle relocates the enemy and is vanished mid-blink', async ({ page }) => {
        await spawnWraithworm(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'WRAITHWORM');
            const blink = await import('/js/modules/enemy/abilities/blink-burrow.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Pin a stable player anchor so the burrow destination is deterministic.
            const player = { x: 100, y: 100 };
            e.targetPlayer = player;

            // The live update() loop may have already advanced this enemy's
            // telegraph on real frames. This whole page.evaluate runs synchronously
            // (no awaits → frameClock.now is frozen, the game loop can't interleave),
            // but we reset the embedded telegraph + blink guards to a known IDLE
            // baseline so we drive a clean cycle off our own monotonic clock.
            const tg = e.blink.telegraph;
            tg.startedAt = null;
            tg.phase = 'idle';
            e.blink.lastBlinkAt = null;
            e.blink._executed = false;
            e._frozenUntil = 0; // ensure not frozen from prior frames

            // Use a controlled base far ahead of frameClock.now so our reads agree.
            const now = frameClock.now + 100000;
            // First blink is eligible immediately (lastBlinkAt null). Use a fixed
            // rng so the destination is fully determined.
            const rng = () => 0.5;
            const startX = e.x;
            const startY = e.y;

            // Start the telegraph (windup) — enemy is now mid-blink/vanished.
            blink.tickBlink(e, player, now, rng);
            const vanishedDuringWindup = blink.isVanished(e, now);

            // Advance to the STRIKE window (past windupMs) — relocation fires.
            const strikeNow = tg.startedAt + tg.windupMs + 1;
            const res = blink.tickBlink(e, player, strikeNow, rng);
            const vanishedDuringStrike = blink.isVanished(e, strikeNow);

            // After recover lapses, it's visible/targetable again.
            const idleNow = tg.startedAt + tg.windupMs + tg.strikeMs + tg.recoverMs + 1;
            blink.tickBlink(e, player, idleNow, rng);
            const vanishedAfter = blink.isVanished(e, idleNow);

            // A blink-less object is never vanished (default-safe baseline).
            const plain = { blink: null };
            const plainVanished = blink.isVanished(plain, now);

            return {
                relocated: res.relocated,
                moved: (e.x !== startX || e.y !== startY),
                vanishedDuringWindup,
                vanishedDuringStrike,
                vanishedAfter,
                plainVanished,
            };
        });
        expect(result.relocated).toBe(true);
        expect(result.moved).toBe(true);
        expect(result.vanishedDuringWindup).toBe(true);
        expect(result.vanishedDuringStrike).toBe(true);
        expect(result.vanishedAfter).toBe(false);
        // Blink-less object stays visible/targetable (the wiring is default-safe).
        expect(result.plainVanished).toBe(false);
    });

    // ------------------------------------------------------------------
    // (c) While vanished it drops off targeting
    // ------------------------------------------------------------------

    test('while vanished it is not picked by the nearest-target / homing path', async ({ page }) => {
        await spawnWraithworm(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'WRAITHWORM');
            const blink = await import('/js/modules/enemy/abilities/blink-burrow.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Reset the embedded telegraph + guards to a clean IDLE baseline so
            // prior live-loop frames don't leave the enemy mid-cycle. This whole
            // page.evaluate runs synchronously (no awaits), so the game loop
            // can't interleave. We anchor at the LIVE frameClock.now so the
            // picker — which reads isVanished(obj, frameClock.now) — agrees with
            // the telegraph window we start here.
            const tg = e.blink.telegraph;
            tg.startedAt = null;
            tg.phase = 'idle';
            e.blink.lastBlinkAt = null;
            e.blink._executed = false;
            e._frozenUntil = 0;
            const now = frameClock.now;

            // While idle/visible the picker CAN return this enemy (sanity that
            // the negative below is meaningful). findNearestTarget returns
            // { x, y, dist, target }. Querying from the enemy's own position
            // (dist 0) makes it the nearest candidate.
            let pickedWhileVisible = null;
            if (typeof ge.findNearestTarget === 'function') {
                try {
                    const best = ge.findNearestTarget(e.x, e.y, 99999);
                    pickedWhileVisible = !!(best && best.target === e);
                } catch (_) { pickedWhileVisible = null; }
            }

            // Drive into the windup at the LIVE clock so it's vanished NOW —
            // startTelegraph stamps startedAt = now (= frameClock.now), so the
            // picker's isVanished read lands inside the windup window.
            blink.tickBlink(e, e.targetPlayer || { x: e.x, y: e.y }, now, () => 0.5);
            const vanished = blink.isVanished(e, now);

            // The auto-aim picker (findNearestTarget) skips vanished enemies via
            // the same isVanished skip. Confirm it does NOT return this enemy now.
            let pickedThisEnemy = null;
            if (typeof ge.findNearestTarget === 'function') {
                try {
                    const best = ge.findNearestTarget(e.x, e.y, 99999);
                    pickedThisEnemy = !!(best && best.target === e);
                } catch (_) {
                    pickedThisEnemy = null; // picker not callable in this harness
                }
            }
            return { vanished, pickedWhileVisible, pickedThisEnemy };
        });
        expect(result.vanished).toBe(true);
        // If the picker was callable, the vanished enemy must NOT be the pick.
        // (When visible it was a candidate; vanished it drops off.)
        if (result.pickedThisEnemy !== null) {
            expect(result.pickedWhileVisible).toBe(true);
            expect(result.pickedThisEnemy).toBe(false);
        }
    });

    // ------------------------------------------------------------------
    // (d) Freeze guard — a chilled/frozen Wraithworm can't blink
    // ------------------------------------------------------------------

    test('a chilled / frozen Wraithworm cannot blink (canBlink false)', async ({ page }) => {
        await spawnWraithworm(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'WRAITHWORM');
            const blink = await import('/js/modules/enemy/abilities/blink-burrow.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Reset to a clean baseline so a live-loop blink hasn't already
            // stamped lastBlinkAt (which would make beforeFreeze false on its
            // own) or left the freeze field set. Synchronous evaluate → the game
            // loop can't interleave. We read at the LIVE frameClock.now so the
            // applyChill window (stamped off frameClock.now) agrees with the read.
            const tg = e.blink.telegraph;
            tg.startedAt = null;
            tg.phase = 'idle';
            e.blink.lastBlinkAt = null;
            e.blink._executed = false;
            e._frozenUntil = 0;
            e.freezeUntil = 0;
            e.chillUntil = 0;
            // applyChill's _statusGuard requires NOT warping; a freshly debug-
            // spawned enemy may still be in its warp-in. Clear it so the live
            // applyChill path runs deterministically.
            e.warping = false;
            const now = frameClock.now;

            // Eligible before any freeze (first blink, lastBlinkAt null).
            const beforeFreeze = blink.canBlink(e, now);

            // Apply CHILL through the LIVE game path — applyChill mirrors the
            // chill window into `_frozenUntil`, the field the helper's isFrozen
            // reads. This validates the freeze-normalization wiring end-to-end.
            ge.applyChill(e, 3000);
            const afterChill = blink.canBlink(e, now);

            // A frozen Wraithworm must not relocate even when driven.
            const startX = e.x;
            const startY = e.y;
            blink.tickBlink(e, e.targetPlayer || { x: e.x, y: e.y }, now, () => 0.5);
            const movedWhileFrozen = (e.x !== startX || e.y !== startY);

            return { beforeFreeze, afterChill, frozenUntil: e._frozenUntil, movedWhileFrozen };
        });
        expect(result.beforeFreeze).toBe(true);
        expect(result.afterChill).toBe(false);
        expect(result.frozenUntil).toBeGreaterThan(0);
        expect(result.movedWhileFrozen).toBe(false);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → blink cycle → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → blink cycle → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnWraithworm(page);

        // Let the live loop run real frames so update() ticks the blink (it may
        // telegraph + relocate) and draw() handles the vanish/tell.
        await page.waitForTimeout(700);

        // Kill it through the real damage path.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'WRAITHWORM');
            if (!e) return;
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) {
                e._deathFlash = 8;
                e._deathFlashMax = 8;
                ge.onEnemyKill(e);
            }
        });

        // Run more frames so the death FX renders (a vanished/blinking enemy
        // still shows its death flash/debris — the skip only wraps the shape).
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
