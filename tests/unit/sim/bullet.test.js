// Pure bullet-update unit tests.
//
// `updatePlayerBullet` and `updateEnemyBullet` were extracted from
// `js/modules/player/bullet.js` and `js/modules/enemy/enemy-bullet.js`
// in the Phase-1 multiplayer engine refactor. These tests pin the
// behavior the wrappers depend on: lifetime decay, position
// integration, helix offset, per-pattern velocity, despawn flags.

import { describe, test, expect } from '@jest/globals';
import {
    updateBullet,
    updatePlayerBullet,
    updateEnemyBullet,
} from '../../../js/sim/bullet.js';
import { freshBulletState } from '../../../js/sim/state.js';

const TICK_SCALE = 30 / 60; // 0.5
const LOGIC_TICK_SECONDS = (1000 / 60) / 1000;

function freshCtx(overrides = {}) {
    return {
        tickScale: TICK_SCALE,
        logicTickSeconds: LOGIC_TICK_SECONDS,
        bulletSpeed: 8,
        boundaryWidth: 1920,
        boundaryHeight: 1080,
        now: 0,
        targetPlayer: null,
        homingTarget: null,
        rngFloat: () => 0.5, // deterministic for jitter tests
        ...overrides,
    };
}

describe('updatePlayerBullet — early exit + lifetime', () => {
    test('inactive bullet is not mutated', () => {
        const b = freshBulletState(0, 'player', { active: false, x: 100, y: 100, vx: 5, vy: 0 });
        const before = JSON.stringify({ x: b.x, y: b.y, life: b.life });
        updatePlayerBullet(b, freshCtx(), []);
        expect(JSON.stringify({ x: b.x, y: b.y, life: b.life })).toBe(before);
    });
    test('life increments by 1 each tick', () => {
        const b = freshBulletState(0, 'player', { x: 500, y: 500, vx: 1, vy: 0, maxLife: 100 });
        updatePlayerBullet(b, freshCtx(), []);
        expect(b.life).toBe(1);
    });
    test('expiry sets active=false and expiredByRange=true', () => {
        const b = freshBulletState(0, 'player', {
            x: 500, y: 500, vx: 1, vy: 0,
            life: 99, maxLife: 100, rangeMultiplier: 1.0,
        });
        updatePlayerBullet(b, freshCtx(), []);
        expect(b.active).toBe(false);
        expect(b.expiredByRange).toBe(true);
    });
});

describe('updatePlayerBullet — movement', () => {
    test('x += vx (NOT scaled by TICK_SCALE for player bullets)', () => {
        const b = freshBulletState(0, 'player', { x: 500, y: 500, vx: 8, vy: 0, maxLife: 100 });
        updatePlayerBullet(b, freshCtx(), []);
        expect(b.x).toBe(508);
        expect(b.y).toBe(500);
    });
});

describe('updatePlayerBullet — out-of-bounds despawn', () => {
    test('off-field x triggers expiredByBounds', () => {
        const b = freshBulletState(0, 'player', { x: 2000, y: 500, vx: 8, vy: 0, maxLife: 100 });
        updatePlayerBullet(b, freshCtx(), []);
        expect(b.active).toBe(false);
        expect(b.expiredByBounds).toBe(true);
    });
});

describe('updateEnemyBullet — aimed pattern', () => {
    test('straight movement scaled by TICK_SCALE', () => {
        const b = freshBulletState(0, 'enemy', {
            x: 500, y: 500,
            vx: 4, vy: 0, baseVx: 4, baseVy: 0,
            startX: 500, startY: 500, maxRange: 600,
            movementPattern: 'aimed',
        });
        updateEnemyBullet(b, freshCtx(), []);
        expect(b.x).toBe(500 + 4 * TICK_SCALE);
    });
});

describe('updateEnemyBullet — distance-based lifetime', () => {
    test('progress >= 1.0 sets expiredByRange', () => {
        const b = freshBulletState(0, 'enemy', {
            x: 1100, y: 500,
            vx: 4, vy: 0, baseVx: 4, baseVy: 0,
            startX: 500, startY: 500, maxRange: 600,
            movementPattern: 'aimed',
        });
        updateEnemyBullet(b, freshCtx(), []);
        expect(b.active).toBe(false);
        expect(b.expiredByRange).toBe(true);
    });
});

describe('updateBullet — dispatcher', () => {
    test('dispatches to player when kind=player', () => {
        const b = freshBulletState(0, 'player', { x: 500, y: 500, vx: 8, vy: 0, maxLife: 100 });
        updateBullet(b, freshCtx(), []);
        expect(b.x).toBe(508); // player bullets are unscaled
        expect(b.life).toBe(1);
    });
    test('dispatches to enemy when kind=enemy', () => {
        const b = freshBulletState(0, 'enemy', {
            x: 500, y: 500, vx: 4, vy: 0, baseVx: 4, baseVy: 0,
            startX: 500, startY: 500, maxRange: 600,
            movementPattern: 'aimed',
        });
        updateBullet(b, freshCtx(), []);
        expect(b.x).toBe(500 + 4 * TICK_SCALE); // enemy bullets are scaled
    });
});

describe('updateEnemyBullet — mine pattern (stationary)', () => {
    test('mine pattern zeroes velocity', () => {
        const b = freshBulletState(0, 'enemy', {
            x: 500, y: 500, vx: 5, vy: 5,
            baseVx: 5, baseVy: 5,
            startX: 500, startY: 500, maxRange: 600,
            movementPattern: 'mine', shape: 'mine',
            isPersistent: true, creationTime: 0,
        });
        updateEnemyBullet(b, freshCtx({ now: 100 }), []);
        // Mine pattern sets vel to 0,0 so x/y unchanged.
        expect(b.vx).toBe(0);
        expect(b.vy).toBe(0);
        expect(b.x).toBe(500);
        expect(b.y).toBe(500);
    });
});
