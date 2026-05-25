/**
 * QA-25: Projectile reflection / Prism Mirror (ENMY-04)
 *
 * Smoke-tests the reflect vertical slice end-to-end in the live game, using the
 * debug spawn hook `gameEngine.spawnPrismMirror()`. The reflect helper itself is
 * unit-tested; this exercises the LIVE wiring (spawn → front-arc reflect → enemy
 * bullet spawned + player bullet consumed → mirror unharmed; flank/beam bypass;
 * no re-reflect ping-pong; kill) in the running game. Asserts:
 *   (a) the debug hook spawns a PRISM_MIRROR into the enemy pool carrying a
 *       `reflect` config + `reflects` flag (attached on the live spawn path)
 *   (b) a player bullet entering the front arc is REFLECTED: it is consumed AND
 *       an enemy `reflected` bullet appears in the enemyBulletPool AND the
 *       mirror's HP did NOT drop (the front-arc hit deals no damage)
 *   (c) a bullet from OUTSIDE the front arc (rear) is NOT reflected — the
 *       pre-pass returns false so the normal damage path runs; and a beam-flagged
 *       bullet (`isBeam`) BYPASSES the mirror even from the front
 *   (d) a bullet already flagged `reflected` is NOT re-reflected (no infinite
 *       ping-pong between two facing mirrors)
 *   (e) NO fatal JS errors through spawn → reflect → kill (killed via the real
 *       damage path / from behind the arc)
 *
 * Access mirrors 22-cloak / 23-blink / 24-suppress: dynamic-import the helper +
 * the collision module inside page.evaluate and operate on the live enemy /
 * pools. Arc geometry is exercised by CONSTRUCTING bullet-like objects at known
 * positions (relative to the mirror's `reflect.facingRad`) and calling
 * `shouldReflect` / `routeBulletToReflect` directly — far more reliable than
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

// Spawn a Prism Mirror via the debug hook and return a snapshot.
async function spawnPrismMirror(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const e = ge.spawnPrismMirror();
        if (!e) return null;
        return {
            type: e.type,
            active: e.active,
            element: e.element,
            health: e.health,
            maxHealth: e.maxHealth,
            hasReflect: !!e.reflect,
            reflects: !!e.reflects,
            halfAngleRad: e.reflect ? e.reflect.halfAngleRad : null,
            speed: e.reflect ? e.reflect.speed : null,
        };
    });
}

test.describe('QA-25: Projectile reflection / Prism Mirror', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Debug-spawn → pool presence + reflect config
    // ------------------------------------------------------------------

    test('debug hook spawns a PRISM_MIRROR carrying a reflect config + reflects flag', async ({ page }) => {
        const snap = await spawnPrismMirror(page);
        expect(snap).not.toBeNull();
        expect(snap.type).toBe('PRISM_MIRROR');
        expect(snap.active).toBe(true);
        expect(snap.element).toBe('RADIANT');
        expect(snap.health).toBeGreaterThan(0);
        expect(snap.maxHealth).toBeGreaterThan(0);
        expect(snap.hasReflect).toBe(true);
        expect(snap.reflects).toBe(true);
        // Reflect config merged from REFLECT_DEFAULTS + the type's reflectOpts.
        expect(snap.halfAngleRad).toBeGreaterThan(0);
        expect(snap.speed).toBeGreaterThan(0);

        // It is present in the active enemy pool, flagged as a reflector.
        const inPool = await page.evaluate(() => {
            const pool = window.gameEngine.enemyPool.activeObjects;
            return pool.some((e) => e.type === 'PRISM_MIRROR' && e.reflects && e.reflect && e.active);
        });
        expect(inPool).toBe(true);
    });

    // ------------------------------------------------------------------
    // (b) Front-arc bullet → reflected: consumed, enemy bullet spawned,
    //     mirror unharmed
    // ------------------------------------------------------------------

    test('a front-arc player bullet is reflected: consumed + enemy bullet spawned + mirror HP unchanged', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');

            // Spawn + anchor the mirror so the live AI can't move/kill it between
            // reads. Face its mirror arc toward +X (facingRad = 0).
            const e = ge.spawnPrismMirror({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;
            e.reflect.facingRad = 0;
            const hpBefore = e.health;

            // A player bullet sitting on the enemy's FRONT (+X side of it), aimed
            // back toward the mirror. Inside the front arc (toBullet ≈ 0 ≈ facing).
            const bullet = {
                active: true,
                x: e.x + 20, y: e.y, // +X of the mirror → in arc
                vx: -8, vy: 0,
                angle: Math.PI,
                damage: 5, element: 'KINETIC',
                startDying() { this.active = false; },
            };

            const ebBefore = ge.enemyBulletPool.activeObjects.length;
            const reflected = col.routeBulletToReflect.call(ge, bullet);
            const ebAfter = ge.enemyBulletPool.activeObjects.length;

            // Find the freshly-spawned reflected enemy bullet.
            const refBullet = ge.enemyBulletPool.activeObjects.find((b) => b.active && b.reflected);

            return {
                reflected,
                bulletConsumed: bullet.active === false,
                ebBefore,
                ebAfter,
                hasReflectedBullet: !!refBullet,
                refBulletDamage: refBullet ? refBullet.damage : null,
                hpBefore,
                hpAfter: e.health,
            };
        });

        expect(result.reflected).toBe(true);            // the pre-pass consumed it
        expect(result.bulletConsumed).toBe(true);       // player bullet gone
        expect(result.ebAfter).toBeGreaterThan(result.ebBefore); // an enemy bullet was spawned
        expect(result.hasReflectedBullet).toBe(true);   // flagged reflected:true
        // Damage clamp — the reflected bullet must not carry an enormous payload.
        expect(result.refBulletDamage).toBeGreaterThan(0);
        expect(result.refBulletDamage).toBeLessThanOrEqual(6); // REFLECT_DMG_CAP
        // The mirror takes NO damage from a front-arc hit.
        expect(result.hpAfter).toBe(result.hpBefore);
    });

    // ------------------------------------------------------------------
    // (c) Rear bullet NOT reflected; beam BYPASSES the mirror
    // ------------------------------------------------------------------

    test('a rear bullet is not reflected and a beam bypasses the mirror', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const reflect = await import('/js/modules/enemy/abilities/reflect.js');

            const e = ge.spawnPrismMirror({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;
            e.reflect.facingRad = 0; // faces +X

            // REAR bullet: on the -X side of the mirror (toBullet ≈ π, opposite the
            // +X facing) → outside the front arc → must NOT be reflected.
            const rearBullet = {
                active: true,
                x: e.x - 20, y: e.y,
                vx: 8, vy: 0, angle: 0,
                damage: 5, element: 'KINETIC',
                startDying() { this.active = false; },
            };
            const rearShould = reflect.shouldReflect(e, rearBullet);
            const rearReflected = col.routeBulletToReflect.call(ge, rearBullet);

            // BEAM bullet: on the FRONT (+X) but flagged isBeam → bypasses even
            // from the front (beams melt the mirror).
            const beamBullet = {
                active: true,
                x: e.x + 20, y: e.y,
                vx: -8, vy: 0, angle: Math.PI,
                damage: 5, element: 'RADIANT', isBeam: true,
                startDying() { this.active = false; },
            };
            const beamShould = reflect.shouldReflect(e, beamBullet);
            const beamReflected = col.routeBulletToReflect.call(ge, beamBullet);

            return {
                rearShould, rearReflected, rearConsumed: rearBullet.active === false,
                beamShould, beamReflected, beamConsumed: beamBullet.active === false,
            };
        });

        // Rear: outside the arc → no reflect, the player bullet survives the
        // pre-pass and falls through to the normal damage path.
        expect(result.rearShould).toBe(false);
        expect(result.rearReflected).toBe(false);
        expect(result.rearConsumed).toBe(false);
        // Beam: bypasses → no reflect, survives the pre-pass (the beam path melts
        // the mirror through the normal damage route).
        expect(result.beamShould).toBe(false);
        expect(result.beamReflected).toBe(false);
        expect(result.beamConsumed).toBe(false);
    });

    // ------------------------------------------------------------------
    // (d) An already-reflected bullet is NOT re-reflected (no ping-pong)
    // ------------------------------------------------------------------

    test('an already-reflected bullet is not re-reflected (no ping-pong)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const reflect = await import('/js/modules/enemy/abilities/reflect.js');

            const e = ge.spawnPrismMirror({ x: ge.player.x + 300, y: ge.player.y });
            e.x = ge.player.x + 300; e.y = ge.player.y; e.warping = false;
            e.reflect.facingRad = 0;

            // A bullet IN the front arc but already flagged `reflected` — a second
            // mirror must not bounce it again.
            const already = {
                active: true,
                x: e.x + 20, y: e.y,
                vx: -8, vy: 0, angle: Math.PI,
                damage: 5, element: 'KINETIC', reflected: true,
                startDying() { this.active = false; },
            };
            const should = reflect.shouldReflect(e, already);
            const reReflected = col.routeBulletToReflect.call(ge, already);
            return { should, reReflected, consumed: already.active === false };
        });
        expect(result.should).toBe(false);
        expect(result.reReflected).toBe(false);
        expect(result.consumed).toBe(false);
    });

    // ------------------------------------------------------------------
    // (e) No fatal errors through spawn → reflect → kill
    // ------------------------------------------------------------------

    test('no fatal JS errors through spawn → reflect → kill', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await spawnPrismMirror(page);

        // Let the live loop run real frames so the mirror's facingRad upkeep runs
        // each frame against the live player.
        await page.waitForTimeout(400);

        // Drive a front-arc reflect through the live pre-pass, then kill the
        // mirror through the real damage path (a beam-flagged bullet bypasses the
        // mirror, so the damage lands normally).
        await page.evaluate(async () => {
            const ge = window.gameEngine;
            const col = await import('/js/modules/combat/collision-system.js');
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'PRISM_MIRROR');
            if (!e) return;
            e.reflect.facingRad = 0;
            const bullet = {
                active: true, x: e.x + 20, y: e.y, vx: -8, vy: 0, angle: Math.PI,
                damage: 5, element: 'KINETIC', startDying() { this.active = false; },
            };
            col.routeBulletToReflect.call(ge, bullet);
            // Kill it through the real damage path.
            ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
            if (e.health <= 0) { e._deathFlash = 8; e._deathFlashMax = 8; ge.onEnemyKill(e); }
        });

        // Run more frames so the spawned reflected enemy bullet flies + expires.
        await page.waitForTimeout(400);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
