/**
 * tests/unit/enemy-frontal-shield-e8a.test.js — Phase E8a SENTINEL frontal shield.
 *
 * Hits arriving from the player's bearing are reduced; flanking / behind hits
 * land in full; AoE sources (no hit point) bypass the shield. Computed from the
 * hit point vs the live player position (not the enemy's render facing).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test, beforeEach } from '@jest/globals';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

const SHIELD = { arc: 2.4, reduction: 0.8 };
// Enemy at origin, player to the +x side → frontal bearing points +x.
function mkCtx() { return { player: { x: 100, y: 0 } }; }
function mkEnemy(extra = {}) {
    return {
        active: true, x: 0, y: 0, health: 100, maxHealth: 100, resist: {},
        armor: 0, corrodeStacks: 0, corrodeUntil: 0, conductUntil: 0,
        frontalShield: null, ...extra,
    };
}
beforeEach(() => { frameClock.now = 10000; });

describe('E8a SENTINEL frontal shield', () => {
    test('a hit from the player side (frontal) is reduced', () => {
        const e = mkEnemy({ frontalShield: SHIELD });
        // hit point on the +x (player) side → within the frontal arc
        applyDamageToEnemy.call(mkCtx(), e, 10, { element: 'KINETIC', showNumber: false, hitX: 50, hitY: 0 });
        expect(e.health).toBeCloseTo(100 - 10 * (1 - 0.8)); // 98 (80% blocked)
    });

    test('a hit from behind/flank lands in full', () => {
        const e = mkEnemy({ frontalShield: SHIELD });
        applyDamageToEnemy.call(mkCtx(), e, 10, { element: 'KINETIC', showNumber: false, hitX: -50, hitY: 0 });
        expect(e.health).toBeCloseTo(90); // rear hit → full
    });

    test('a side hit (outside the frontal arc) lands in full', () => {
        const e = mkEnemy({ frontalShield: SHIELD });
        applyDamageToEnemy.call(mkCtx(), e, 10, { element: 'KINETIC', showNumber: false, hitX: 0, hitY: 80 });
        expect(e.health).toBeCloseTo(90); // ~90° off the player bearing > arc/2
    });

    test('AoE source (no hit point) bypasses the shield', () => {
        const e = mkEnemy({ frontalShield: SHIELD });
        applyDamageToEnemy.call(mkCtx(), e, 10, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(90);
    });

    test('no shield → full damage regardless of angle', () => {
        const e = mkEnemy({ frontalShield: null });
        applyDamageToEnemy.call(mkCtx(), e, 10, { element: 'KINETIC', showNumber: false, hitX: 50, hitY: 0 });
        expect(e.health).toBeCloseTo(90);
    });
});
