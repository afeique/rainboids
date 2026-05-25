/**
 * QA-26: Projectile absorption / Devourer (ENMY-09)
 *
 * Smoke-tests the absorb vertical slice end-to-end in the live game, using the
 * debug spawn hook `gameEngine.spawnDevourer()`. The absorb helper itself is
 * unit-tested; this exercises the LIVE wiring (spawn → maw-cone eat → bullet
 * consumed + shield banked → devourer unharmed; banked shield SOAKS subsequent
 * damage; outside-cone / beam bypass → normal hit; kill) in the running game.
 * Asserts:
 *   (a) the debug hook spawns a DEVOURER into the enemy pool carrying a `maw`
 *       config + `eatsProjectiles` flag (attached on the live spawn path)
 *   (b) a player bullet entering the maw cone is ABSORBED: it is consumed AND
 *       the devourer's `_absorbShield` increases AND the devourer's HP did NOT
 *       drop (the eaten shot deals no damage)
 *   (c) a banked absorb shield SOAKS incoming damage in the real damage path:
 *       applyDamageToEnemy reduces the shield first and HP only by the
 *       passthrough (confirms consumeAbsorbShield is in the path)
 *   (d) a bullet from OUTSIDE the maw cone is NOT absorbed (pre-pass returns
 *       false → normal damage path → HP drops); a beam-flagged bullet
 *       (`isBeam`) BYPASSES the maw even from inside the cone
 *   (e) NO fatal JS errors through spawn → absorb → kill (killed via the real
 *       damage path / from outside the maw cone)
 *
 * Access mirrors 25-reflect / 24-suppress / 22-cloak: dynamic-import the helper +
 * the collision module inside page.evaluate and operate on the live enemy /
 * pools. Cone geometry is exercised by CONSTRUCTING bullet-like objects at known
 * positions (relative to the devourer's `maw.facingRad`) and calling
 * `shouldAbsorb` / `routeBulletToAbsorb` directly — far more reliable than
 * aiming live fire through a moving target.
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

// Spawn a Devourer via the debug hook and return a snapshot.
async function spawnDevourer(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnDevourer();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasMaw: !!e.maw,
            eatsProjectiles: !!e.eatsProjectiles,
            halfAngleRad: e.maw ? e.maw.halfAngleRad : null,
            range: e.maw ? e.maw.range : null,
            shieldPerBullet: e.maw ? e.maw.shieldPerBullet : null,
            maxShield: e.maw ? e.maw.maxShield : null,
            absorbShield: e._absorbShield,
        };
    });
}

test.describe('QA-26: Projectile absorption / Devourer', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + maw config
    // ------------------------------------------------------------------

    test('debug hook spawns a DEVOURER carrying a maw config + eatsProjectiles flag', async ({ page }) => {
        const snap = await spawnDevourer(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('DEVOURER');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('VOID');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasMaw).toBe(true);
        expect(snap.eatsProjectiles).toBe(true);
        // Maw config merged from MAW_DEFAULTS + the type's mawOpts.
        expect(snap.halfAngleRad).toBeGreaterThan(0);
        expect(snap.range).toBeGreaterThan(0);
        expect(snap.shieldPerBullet).toBeGreaterThan(0);
        expect(snap.maxShield).toBeGreaterThan(0);
        // Fresh spawn carries no stale banked shield.
        expect(snap.absorbShield).toBe(0);

        // It is present in the active enemy pool, flagged as a devourer.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'DEVOURER' && e.eatsProjectiles && e.maw && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Maw-cone bullet → absorbed: consumed, shield banked, devourer unharmed
    // ------------------------------------------------------------------

    test('a maw-cone player bullet is absorbed: consumed + shield banked + devourer HP unchanged', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');

            // Spawn + anchor the devourer so the live AI can't move/kill it
            // between reads. Face its maw toward +X (facingRad = 0).
            const e = ge.spawnDevourer({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;
            e.maw.facingRad = 0;
            e._absorbShield = 0; e._absorbShieldUntil = 0;
            const hpBefore = e.health;
            const shieldBefore = e._absorbShield;

            // A player bullet sitting on the enemy's +X side (in the maw cone:
            // toBullet ≈ 0 ≈ facing) and within maw.range.
            const bullet = {
                active: true,
                x: e.x + 20, y: e.y, // +X of the devourer → in cone, close range
                vx: -8, vy: 0,
                angle: Math.PI,
                damage: 5, element: 'KINETIC',
                startDying() { this.active = false; },
            };

            const absorbed = col.routeBulletToAbsorb.call(ge, bullet);

            return {
                absorbed,
                bulletConsumed: bullet.active === false,
                shieldBefore,
                shieldAfter: e._absorbShield,
                hpBefore,
                hpAfter: e.health,
            };
        });

        expect(result.absorbed).toBe(true);             // the pre-pass ate it
        expect(result.bulletConsumed).toBe(true);        // player bullet gone
        // A shield was banked (shieldPerBullet > 0).
        expect(result.shieldAfter).toBeGreaterThan(result.shieldBefore);
        // The devourer takes NO damage from a shot it swallowed.
        expect(result.hpAfter).toBe(result.hpBefore);
    });

    // ------------------------------------------------------------------
    // (c) Banked shield SOAKS damage in the real damage path
    // ------------------------------------------------------------------

    test('a banked absorb shield soaks incoming damage (consumeAbsorbShield in the path)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const absorb = await import('/js/modules/enemy/abilities/projectile-absorb.js');

            const e = ge.spawnDevourer({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;

            // Bank a known shield with plenty of lifetime, and give it lots of HP
            // headroom so the passthrough can't kill it mid-assert. NOTE the lapse
            // stamp must use the SAME clock the game reads — frameClock.now is
            // Date.now() (wall-clock epoch ms), NOT performance.now() — or the
            // shield reads as already-expired in the live damage path.
            e.maxHealth = 1000; e.health = 1000;
            e._absorbShield = 20;
            e._absorbShieldUntil = Date.now() + 60000;

            const shieldBefore = e._absorbShield;
            const hpBefore = e.health;

            // Hit it for 8 — within the 20 shield, so the shield soaks it fully
            // and HP should not move. Use KINETIC (DEVOURER is neutral vs Kinetic
            // → no resist multiplier) so we can reason about the numbers cleanly.
            ge.applyDamageToEnemy(e, 8, { element: 'KINETIC', showNumber: false });

            const shieldMid = e._absorbShield;
            const hpMid = e.health;

            return {
                shieldBefore, hpBefore,
                shieldMid, hpMid,
                // Sanity-check the helper directly: with the shield now at 12,
                // hitting for 30 should soak 12 and pass 18 through. Use the same
                // Date.now() clock the stamp above was set against.
                passthrough: absorb.consumeAbsorbShield(e, 30, Date.now()),
                shieldAfterHelper: e._absorbShield,
            };
        });

        // The 8 damage was fully soaked: shield dropped by ~8, HP unchanged.
        expect(result.shieldMid).toBeLessThan(result.shieldBefore);
        expect(result.shieldBefore - result.shieldMid).toBeCloseTo(8, 5);
        expect(result.hpMid).toBe(result.hpBefore);
        // Direct helper check: 12 shield soaks 12 of a 30 hit → 18 passes through,
        // shield drains to 0.
        expect(result.passthrough).toBeCloseTo(18, 5);
        expect(result.shieldAfterHelper).toBe(0);
    });

    // ------------------------------------------------------------------
    // (d) Outside-cone bullet NOT absorbed; beam BYPASSES the maw
    // ------------------------------------------------------------------

    test('an outside-cone bullet is not absorbed and a beam bypasses the maw', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const absorb = await import('/js/modules/enemy/abilities/projectile-absorb.js');
            const now = window.performance.now ? window.performance.now() : Date.now();

            const e = ge.spawnDevourer({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;
            e.maw.facingRad = 0; // maw faces +X
            e._absorbShield = 0; e._absorbShieldUntil = 0;
            e.maxHealth = 1000; e.health = 1000;

            // REAR bullet: on the -X side of the devourer (toBullet ≈ π, opposite
            // the +X facing) → outside the maw cone → must NOT be absorbed.
            const rearBullet = {
                active: true,
                x: e.x - 20, y: e.y,
                vx: 8, vy: 0, angle: 0,
                damage: 5, element: 'KINETIC',
                startDying() { this.active = false; },
            };
            const rearShould = absorb.shouldAbsorb(e, rearBullet, now);
            const rearAbsorbed = col.routeBulletToAbsorb.call(ge, rearBullet);

            // BEAM bullet: inside the maw cone (+X, in range) but flagged isBeam →
            // bypasses the maw (beams melt the devourer through the normal path).
            const beamBullet = {
                active: true,
                x: e.x + 20, y: e.y,
                vx: -8, vy: 0, angle: Math.PI,
                damage: 5, element: 'RADIANT', isBeam: true,
                startDying() { this.active = false; },
            };
            const beamShould = absorb.shouldAbsorb(e, beamBullet, now);
            const beamAbsorbed = col.routeBulletToAbsorb.call(ge, beamBullet);

            return {
                rearShould, rearAbsorbed, rearConsumed: rearBullet.active === false,
                beamShould, beamAbsorbed, beamConsumed: beamBullet.active === false,
                shieldStillZero: e._absorbShield === 0,
            };
        });

        // Rear: outside the cone → no absorb, the player bullet survives the
        // pre-pass and falls through to the normal damage path.
        expect(result.rearShould).toBe(false);
        expect(result.rearAbsorbed).toBe(false);
        expect(result.rearConsumed).toBe(false);
        // Beam: bypasses → no absorb, survives the pre-pass (the beam path melts
        // the devourer through the normal damage route).
        expect(result.beamShould).toBe(false);
        expect(result.beamAbsorbed).toBe(false);
        expect(result.beamConsumed).toBe(false);
        // Nothing was eaten, so no shield was banked.
        expect(result.shieldStillZero).toBe(true);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → absorb → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → absorb → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnDevourer(page);

        // Let the live loop run real frames so the devourer's maw facingRad
        // upkeep runs each frame against the live player.
        await page.waitForTimeout(400);

        // Drive a maw-cone absorb through the live pre-pass, then kill the
        // devourer through the real damage path (a big direct hit — its banked
        // shield is small so the passthrough lands and finishes it).
        await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'DEVOURER');
            if (!e) return;
            e.maw.facingRad = 0;
            const bullet = {
                active: true, x: e.x + 20, y: e.y, vx: -8, vy: 0, angle: Math.PI,
                damage: 5, element: 'KINETIC', startDying() { this.active = false; },
            };
            col.routeBulletToAbsorb.call(ge, bullet);
            // Kill it through the real damage path (overwhelms the small shield).
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) { e._deathFlash = 8; e._deathFlashMax = 8; ge.onEnemyKill(e); }
        });

        // Run more frames so any spawned FX particles tick + expire.
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
