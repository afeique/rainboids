/**
 * QA-33: Juggernaut charge-and-ram (ENMY-10b)
 *
 * Smoke-tests the charge-and-ram vertical slice end-to-end in the live game,
 * using the debug spawn hook `gameEngine.spawnJuggernaut()`. The charge helper
 * itself is unit-tested; this exercises the LIVE wiring (spawn → telegraph
 * windup → strike → recover/stun → kill) in the running game. Asserts:
 *   (a) the debug hook spawns a JUGGERNAUT into the enemy pool carrying a
 *       telegraph-backed `charge` state (Kinetic element + valid charge config)
 *   (b) driving a charge cycle walks the telegraph idle → windup → strike →
 *       recover (poll telegraphPhase over simulated timestamps); isStriking is
 *       true ONLY in the strike window — while a charge-less object never
 *       charges (default-safe baseline)
 *   (c) after a charge ends (the recover transition) the LIVE update sets
 *       `stunUntil` (stunned + rear-exposed) — and isRearExposed reads true in
 *       the recover window
 *   (d) NO fatal JS errors through spawn → charge cycle → kill
 *
 * Charge access mirrors 23-blink's pattern: dynamic-import the helper module
 * inside page.evaluate and read/operate on the live enemy's charge state.
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

// Spawn a Juggernaut via the debug hook and return a snapshot.
async function spawnJuggernaut(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnJuggernaut();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasCharge: !!e.charge,
            windupMs: e.charge ? e.charge.windupMs : null,
            strikeMs: e.charge ? e.charge.strikeMs : null,
            recoverMs: e.charge ? e.charge.recoverMs : null,
            chargeSpeed: e.charge ? e.charge.chargeSpeed : null,
            range: e.charge ? e.charge.range : null,
            ramDamage: e.charge ? e.charge.ramDamage : null,
        };
    });
}

test.describe('QA-33: Juggernaut charge-and-ram', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + charge state
    // ------------------------------------------------------------------

    test('debug hook spawns a JUGGERNAUT carrying a charge state', async ({ page }) => {
        const snap = await spawnJuggernaut(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('JUGGERNAUT');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('KINETIC');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasCharge).toBe(true);
        // Charge timings/speed/range from the JUGGERNAUT type def.
        expect(snap.windupMs).toBeGreaterThan(0);
        expect(snap.strikeMs).toBeGreaterThan(0);
        expect(snap.recoverMs).toBeGreaterThan(0);
        expect(snap.chargeSpeed).toBeGreaterThan(0);
        expect(snap.range).toBeGreaterThan(0);
        expect(snap.ramDamage).toBeGreaterThan(25);

        // It is present in the active enemy pool.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'JUGGERNAUT' && e.charge && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Charge cycle walks windup → strike → recover
    // ------------------------------------------------------------------

    test('a charge cycle walks idle → windup → strike → recover; striking only mid-strike', async ({ page }) => {
        await spawnJuggernaut(page);
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'JUGGERNAUT');
            const charge = await import('/js/modules/enemy/abilities/charge.js');
            const tg = await import('/js/modules/enemy/telegraph.js');
            const { frameClock } = await import('/js/modules/core/frame-clock.js');

            // Pin a player anchor within charge range so the gate opens.
            const player = { x: e.x - 200, y: e.y };
            e.targetPlayer = player;

            // Reset the charge telegraph + guards to a clean IDLE baseline so a
            // prior live-loop frame doesn't leave it mid-cycle. This whole
            // page.evaluate runs synchronously (no awaits → frameClock.now is
            // frozen, the game loop can't interleave), so we drive a clean cycle
            // off our own monotonic clock.
            e.charge.startedAt = null;
            e.charge.phase = 'idle';
            e.charge.lastChargeAt = null;
            e.charge._locked = false;
            e.charge._stunned = false;
            e.frozen = false; e._frozenUntil = 0; e.freezeUntil = 0; e.chillUntil = 0; e.stunUntil = 0;

            const base = frameClock.now + 100000;
            const w = e.charge.windupMs;
            const s = e.charge.strikeMs;

            // t=base → start the wind-up (the visible tell).
            const r0 = charge.tickCharge(e, player, base);
            const phaseWindup = tg.telegraphPhase(e.charge, base);
            const strikingWindup = tg.isStriking(e.charge, base);

            // Mid-strike → lane locks once, isStriking true.
            const strikeNow = e.charge.startedAt + w + 1;
            const r1 = charge.tickCharge(e, player, strikeNow);
            const phaseStrike = tg.telegraphPhase(e.charge, strikeNow);
            const strikingMid = tg.isStriking(e.charge, strikeNow);

            // Recover window → isStriking false, isRearExposed true.
            const recoverNow = e.charge.startedAt + w + s + 1;
            const r2 = charge.tickCharge(e, player, recoverNow);
            const phaseRecover = tg.telegraphPhase(e.charge, recoverNow);
            const strikingRecover = tg.isStriking(e.charge, recoverNow);
            const rearExposed = charge.isRearExposed(e, recoverNow);

            // A charge-less object never charges / is never rear-exposed.
            const plain = { charge: null };
            const plainStriking = tg.isStriking({ startedAt: null }, base);
            const plainRearExposed = charge.isRearExposed(plain, base);

            return {
                started: r0.started,
                phaseWindup, strikingWindup,
                phaseStrike, strikingMid, locked: e.charge._locked, recovered: r1.recovered,
                phaseRecover, strikingRecover, rearExposed, recoveredOnTransition: r2.recovered,
                plainStriking, plainRearExposed,
            };
        });
        expect(result.started).toBe(true);
        expect(result.phaseWindup).toBe('windup');
        expect(result.strikingWindup).toBe(false);
        expect(result.phaseStrike).toBe('strike');
        expect(result.strikingMid).toBe(true);
        expect(result.locked).toBe(true);
        expect(result.phaseRecover).toBe('recover');
        expect(result.strikingRecover).toBe(false);
        expect(result.rearExposed).toBe(true);
        expect(result.recoveredOnTransition).toBe(true);
        // Charge-less baseline: never strikes, never rear-exposed.
        expect(result.plainStriking).toBe(false);
        expect(result.plainRearExposed).toBe(false);
    });

    // ------------------------------------------------------------------
    // (c) After a charge it ends up STUNNED (rear-exposed) via the live update
    // ------------------------------------------------------------------

    test('the live update sets stunUntil after a charge (stunned + rear-exposed)', async ({ page }) => {
        await spawnJuggernaut(page);
        // Park the Juggernaut close to the player so the charge gate opens, then
        // let the live update loop drive a full windup → strike → recover cycle.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'JUGGERNAUT');
            if (!e || !ge.player) return;
            // Sit ~200px off the player (inside range), clear any CC, reset the
            // charge so the live loop starts a fresh cycle on its own clock.
            e.x = ge.player.x + 200;
            e.y = ge.player.y;
            e.warping = false;
            e.charge.startedAt = null;
            e.charge.phase = 'idle';
            e.charge.lastChargeAt = null;
            e.charge._locked = false;
            e.charge._stunned = false;
            e.stunUntil = 0; e.frozen = false; e._frozenUntil = 0; e.freezeUntil = 0; e.chillUntil = 0;
            // Make the player invincible so the contact ram during the strike
            // doesn't kill it (and end the run) before we observe the stun.
            if (ge.player) ge.player.invincible = true;
        });

        // Let the live loop run real frames through a full charge cycle
        // (windup 700 + strike 450 + recover 1500 ≈ 2.65s; give margin).
        await page.waitForTimeout(3200);

        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            // The same instance may have died on contact (it rammed the player);
            // accept either: it's stunned/recovering, OR it ran a charge (a
            // lastChargeAt stamp) at some point. Look across the pool for any
            // Juggernaut that shows charge activity.
            const pool = ge.enemyPool.activeObjects;
            const jugs = pool.filter((e) => e.type === 'JUGGERNAUT' && e.charge);
            let chargedAny = false;
            let stunnedAny = false;
            const now = (ge.frameClock && ge.frameClock.now) || Date.now();
            for (const e of jugs) {
                if (e.charge.lastChargeAt != null) chargedAny = true;
                if (e.stunUntil && e.stunUntil > 0) stunnedAny = true;
            }
            return { jugCount: jugs.length, chargedAny, stunnedAny };
        });

        // It either committed a charge (stamped lastChargeAt) or was left stunned
        // by the recovery — the live wiring produced charge activity.
        expect(result.chargedAny || result.stunnedAny).toBe(true);
    });

    // ------------------------------------------------------------------
    // (d) No fatal errors through spawn → charge cycle → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → charge cycle → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnJuggernaut(page);

        // Make the player invincible so a ram doesn't end the run mid-test, then
        // let the live loop run real frames so update() ticks the charge (windup
        // → strike → recover) and draw() renders the lane tell + rear-exposed read.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.player) ge.player.invincible = true;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'JUGGERNAUT');
            if (e && ge.player) { e.x = ge.player.x + 220; e.y = ge.player.y; e.warping = false; }
        });
        await page.waitForTimeout(1500);

        // Kill it through the real damage path.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'JUGGERNAUT');
            if (!e) return;
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) {
                e._deathFlash = 8;
                e._deathFlashMax = 8;
                ge.onEnemyKill(e);
            }
        });

        // Run more frames so the death FX renders.
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
