/**
 * tests/unit/support-aura-s7.test.js — Phase A.E9-S7 ally support auras.
 *
 * Pure runAura (shield stamp / heal, radius + self/inactive gating) +
 * allyShieldMult + the LUMEN_DRONE config.
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

import { describe, expect, test } from '@jest/globals';
import { runAura, allyShieldMult, AURA_LINGER_MS } from '../../js/modules/enemy/support-aura.js';
import { ENEMY_TYPES } from '../../js/modules/enemy/enemy-data.js';

const NOW = 10000;
function support(aura) { return { x: 0, y: 0, active: true, aura, _allyShieldUntil: 0, _allyShieldAmount: 0 }; }
function ally(x, y, extra = {}) { return { x, y, active: true, _allyShieldUntil: 0, _allyShieldAmount: 0, ...extra }; }

describe('A.E9-S7 runAura (shield)', () => {
    const AURA = { radius: 180, kind: 'shield', amount: 0.4, intervalMs: 300 };

    test('stamps a timed shield on in-radius allies; skips out-of-radius + self', () => {
        const sup = support(AURA);
        const near = ally(100, 0);   // dist 100 < 180
        const far = ally(500, 0);    // outside
        const allies = [sup, near, far];
        const n = runAura(sup, allies, NOW);
        expect(n).toBe(1);                              // only `near` (self skipped, far skipped)
        expect(near._allyShieldUntil).toBe(NOW + AURA_LINGER_MS);
        expect(near._allyShieldAmount).toBeCloseTo(0.4);
        expect(far._allyShieldUntil).toBe(0);
        expect(sup._allyShieldUntil).toBe(0);           // support doesn't shield itself
    });

    test('skips inactive allies', () => {
        const sup = support(AURA);
        const dead = ally(50, 0, { active: false });
        expect(runAura(sup, [sup, dead], NOW)).toBe(0);
        expect(dead._allyShieldUntil).toBe(0);
    });

    test('no aura / no allies → no-op', () => {
        expect(runAura({ x: 0, y: 0 }, [ally(10, 0)], NOW)).toBe(0);
        expect(runAura(support(AURA), null, NOW)).toBe(0);
    });
});

describe('A.E9-S7 runAura (heal) + allyShieldMult', () => {
    test('heal restores HP up to maxHealth', () => {
        const sup = support({ radius: 180, kind: 'heal', amount: 3, intervalMs: 500 });
        const hurt = ally(20, 0, { health: 5, maxHealth: 10 });
        const full = ally(30, 0, { health: 10, maxHealth: 10 });
        runAura(sup, [sup, hurt, full], NOW);
        expect(hurt.health).toBe(8);    // 5 + 3
        expect(full.health).toBe(10);   // capped
    });

    test('allyShieldMult reduces damage while active, expires, caps at 0.9', () => {
        const e = { _allyShieldUntil: NOW + 100, _allyShieldAmount: 0.4 };
        expect(allyShieldMult(e, NOW)).toBeCloseTo(0.6);
        expect(allyShieldMult(e, NOW + 200)).toBe(1);   // expired
        e._allyShieldAmount = 0.99; e._allyShieldUntil = NOW + 100;
        expect(allyShieldMult(e, NOW)).toBeCloseTo(0.1); // 1 - min(0.9, 0.99)
        expect(allyShieldMult(null, NOW)).toBe(1);
    });
});

describe('LUMEN_DRONE config', () => {
    test('is a Radiant support with a valid shield aura', () => {
        const d = ENEMY_TYPES.LUMEN_DRONE;
        expect(d.element).toBe('RADIANT');
        expect(d.resist.RADIANT).toBeGreaterThan(0);
        expect(d.aura).toBeTruthy();
        expect(d.aura.kind).toBe('shield');
        expect(d.aura.radius).toBeGreaterThan(0);
        expect(d.aura.amount).toBeGreaterThan(0);
        expect(d.aura.intervalMs).toBeGreaterThan(0);
    });
});
