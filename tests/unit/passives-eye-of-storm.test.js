// Phase P6 — Eye of the Storm passive: while the player is ~stationary, nearby
// enemies AND their projectiles slow 40%. applyEyeOfTheStorm (engine-context)
// runs each frame: refresh-style applySlow on enemies in range; a one-time ×0.6
// velocity damp on enemy bullets in range (flagged on `_eyeSlowed`). Tested with
// a spy engine, mirroring the kill-splash helper tests.
import { describe, expect, test } from '@jest/globals';
import {
    applyEyeOfTheStorm,
    eyeOfStormStationary,
    EYE_RADIUS,
    EYE_SLOW_FACTOR,
    EYE_STILL_SPEED,
} from '../../js/modules/combat/collision-system.js';

const enemyAt = (x, y) => ({ x, y, active: true, warping: false, _deathFlash: 0 });
const bulletAt = (x, y, vx = 10, vy = 0) => ({ x, y, active: true, _eyeSlowed: false, vel: { x: vx, y: vy } });

function engine({ stationary = true, hasPassive = true, enemies = [], bullets = [] } = {}) {
    const slowed = [];
    return {
        slowed,
        player: {
            x: 0, y: 0,
            vel: { x: stationary ? 0 : 5, y: 0 },
            hasPassive: (id) => hasPassive && id === 'EYE_OF_THE_STORM',
        },
        enemyPool: { activeObjects: enemies },
        enemyBulletPool: { activeObjects: bullets },
        applySlow: (e, ms, f) => slowed.push({ e, ms, f }),
    };
}

describe('Eye of the Storm — stationary slow aura', () => {
    test('no passive → nothing slowed', () => {
        const e = enemyAt(10, 0); const b = bulletAt(10, 0);
        const eng = engine({ hasPassive: false, enemies: [e], bullets: [b] });
        applyEyeOfTheStorm.call(eng);
        expect(eng.slowed).toEqual([]);
        expect(b.vel.x).toBe(10);
    });

    test('moving player → aura is inactive (no slow)', () => {
        const e = enemyAt(10, 0); const b = bulletAt(10, 0);
        const eng = engine({ stationary: false, enemies: [e], bullets: [b] });
        applyEyeOfTheStorm.call(eng);
        expect(eng.slowed).toEqual([]);
        expect(b.vel.x).toBe(10);
    });

    test('stationary → in-range enemy gets a 40% applySlow', () => {
        const e = enemyAt(EYE_RADIUS - 10, 0);
        const eng = engine({ enemies: [e] });
        applyEyeOfTheStorm.call(eng);
        expect(eng.slowed.length).toBe(1);
        expect(eng.slowed[0].e).toBe(e);
        expect(eng.slowed[0].f).toBeCloseTo(EYE_SLOW_FACTOR, 5);
    });

    test('out-of-range enemy is not slowed', () => {
        const far = enemyAt(EYE_RADIUS + 50, 0);
        const eng = engine({ enemies: [far] });
        applyEyeOfTheStorm.call(eng);
        expect(eng.slowed).toEqual([]);
    });

    test('an in-range enemy bullet is damped ×0.6 exactly once', () => {
        const b = bulletAt(EYE_RADIUS - 10, 0, 10, 0);
        const eng = engine({ bullets: [b] });
        applyEyeOfTheStorm.call(eng);
        expect(b._eyeSlowed).toBe(true);
        expect(b.vel.x).toBeCloseTo(6, 5);
        // a second frame must NOT compound (already flagged)
        applyEyeOfTheStorm.call(eng);
        expect(b.vel.x).toBeCloseTo(6, 5);
    });

    test('out-of-range bullets are untouched', () => {
        const b = bulletAt(EYE_RADIUS + 30, 0, 10, 0);
        const eng = engine({ bullets: [b] });
        applyEyeOfTheStorm.call(eng);
        expect(b._eyeSlowed).toBe(false);
        expect(b.vel.x).toBe(10);
    });

    test('EYE_STILL_SPEED gate: speed exactly at the threshold still counts as stationary', () => {
        const e = enemyAt(10, 0);
        const eng = engine({ enemies: [e] });
        eng.player.vel.x = EYE_STILL_SPEED; // at the boundary
        applyEyeOfTheStorm.call(eng);
        expect(eng.slowed.length).toBe(1);
    });
});

describe('Eye of the Storm — stationary predicate (shared with the VFX bubble)', () => {
    test('at/under the threshold is stationary', () => {
        expect(eyeOfStormStationary(0)).toBe(true);
        expect(eyeOfStormStationary(EYE_STILL_SPEED)).toBe(true);
    });
    test('above the threshold is not stationary', () => {
        expect(eyeOfStormStationary(EYE_STILL_SPEED + 0.0001)).toBe(false);
        expect(eyeOfStormStationary(5)).toBe(false);
    });
});
