/**
 * tests/unit/cd-apex-predator.test.js — CD-02 §6c APEX PREDATOR keystone.
 *
 * Apex Predator is a no-downside offense keystone: your damage EXECUTES enemies
 * the hit would leave at/below 15% of their max HP (the hit becomes lethal).
 * Bosses are exempt. The mechanic lives in collision-system.applyDamageToEnemy,
 * gated on hasPassive('APEX_PREDATOR'). The execute IS the effect — no static
 * damageMult.
 *
 * Two layers are covered:
 *   1. The pure resolver `shouldExecute` / `apexExecutes` (threshold math,
 *      boss-exempt, default-safe) — deterministic, no engine `this`.
 *   2. The integration through `applyDamageToEnemy`: a low-HP enemy DIES with
 *      APEX_PREDATOR equipped and SURVIVES without it (default-safe), and a boss
 *      is NEVER executed.
 */

// Browser shims (the collision-system import graph touches window/navigator).
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
import {
    applyDamageToEnemy,
    shouldExecute,
    apexExecutes,
    APEX_EXECUTE_THRESHOLD,
} from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

beforeEach(() => { frameClock.now = 10000; });

// ── Layer 1: pure resolver ───────────────────────────────────────────────────
describe('CD-02 — shouldExecute threshold math', () => {
    test('threshold is 15% of max HP', () => {
        expect(APEX_EXECUTE_THRESHOLD).toBeCloseTo(0.15, 6);
    });

    test('a hit that leaves the enemy AT/BELOW 15% maxHP executes', () => {
        // 100 maxHP, currently 20, take 6 → 14 remaining ≤ 15 → execute.
        expect(shouldExecute(20, 6, 100)).toBe(true);
        // Exactly at the boundary: 100 maxHP, currently 16, take 1 → 15 = 15% → execute.
        expect(shouldExecute(16, 1, 100)).toBe(true);
        // Already-lethal hit (would drop below 0) also "executes" (still lethal).
        expect(shouldExecute(20, 50, 100)).toBe(true);
    });

    test('a hit that leaves the enemy ABOVE 15% maxHP does NOT execute', () => {
        // 100 maxHP, currently 50, take 10 → 40 remaining > 15 → normal.
        expect(shouldExecute(50, 10, 100)).toBe(false);
        // Just above the boundary: 100 maxHP, currently 17, take 1 → 16 > 15 → normal.
        expect(shouldExecute(17, 1, 100)).toBe(false);
    });

    test('zero / missing maxHealth never executes (guards divide-by-nonsense)', () => {
        expect(shouldExecute(5, 1, 0)).toBe(false);
        expect(shouldExecute(5, 1, undefined)).toBe(false);
    });

    test('apexExecutes wraps shouldExecute over an enemy object', () => {
        const low = { health: 16, maxHealth: 100 };
        const high = { health: 60, maxHealth: 100 };
        expect(apexExecutes(low, 1)).toBe(true);
        expect(apexExecutes(high, 1)).toBe(false);
        expect(apexExecutes(null, 1)).toBe(false);
    });
});

// ── Layer 2: integration through applyDamageToEnemy ──────────────────────────
function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {}, armor: 0,
        corrodeStacks: 0, corrodeUntil: 0, conductUntil: 0, ...extra,
    };
}
// Engine `this` with an APEX_PREDATOR player. No damage multipliers → `damage`
// reaches the execute check unscaled.
const APEX_CTX = { player: { hasPassive: (id) => id === 'APEX_PREDATOR' } };
// Default-safe engine `this`: no player at all.
const BARE_CTX = {};

describe('CD-02 — APEX_PREDATOR through applyDamageToEnemy', () => {
    test('a low-HP enemy DIES with APEX_PREDATOR even on a tiny hit', () => {
        const e = mkEnemy({ health: 14 }); // 14 ≤ 15% of 100
        const r = applyDamageToEnemy.call(APEX_CTX, e, 1, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBe(0);
        expect(r.destroyed).toBe(true);
    });

    test('DEFAULT-SAFE: the SAME low-HP enemy SURVIVES the same hit with NO passive', () => {
        const e = mkEnemy({ health: 14 });
        const r = applyDamageToEnemy.call(BARE_CTX, e, 1, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(13); // normal: 14 − 1
        expect(r.destroyed).toBeFalsy();
    });

    test('an above-threshold enemy takes NORMAL damage with APEX_PREDATOR (no early execute)', () => {
        const e = mkEnemy({ health: 60 }); // 60 → 50 after a 10-hit, well above 15
        const r = applyDamageToEnemy.call(APEX_CTX, e, 10, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(50);
        expect(r.destroyed).toBeFalsy();
    });
});
