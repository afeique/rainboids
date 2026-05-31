/**
 * tests/unit/weapon-element-e6.test.js — Phase E6 weapon element identity.
 *
 * Pins applyWeaponElementStatus: when a weapon's shot lands, it applies its
 * element's signature status. A recording stub `this` captures which
 * applyX helpers fire per element.
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

import { describe, expect, test, afterEach } from '@jest/globals';
import { applyWeaponElementStatus } from '../../js/modules/combat/collision-system.js';

function mkCtx() {
    const calls = [];
    const rec = (name) => (e, d) => calls.push(d === undefined ? name : `${name}:${d}`);
    return {
        calls,
        applyBurn: rec('burn'), applyChill: rec('chill'), applyFreeze: rec('freeze'),
        applyConduct: rec('conduct'), applyStun: rec('stun'),
        applyCorrode: rec('corrode'), applyBleed: rec('bleed'), applyMark: rec('mark'),
    };
}
const enemy = { active: true };
const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

describe('applyWeaponElementStatus (E6)', () => {
    test('PYRO applies burn', () => {
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, enemy, 'PYRO', 5);
        expect(ctx.calls).toEqual(['burn:5']);
    });

    test('CRYO chills on a light hit, freezes on a heavy hit', () => {
        const light = mkCtx();
        applyWeaponElementStatus.call(light, enemy, 'CRYO', 4); // < 8
        expect(light.calls).toEqual(['chill']);
        const heavy = mkCtx();
        applyWeaponElementStatus.call(heavy, enemy, 'CRYO', 12); // >= 8
        expect(heavy.calls).toEqual(['freeze']);
    });

    test('VOLT always conducts; shocks on the chance roll', () => {
        Math.random = () => 0.9; // above shock chance → no stun
        const noShock = mkCtx();
        applyWeaponElementStatus.call(noShock, enemy, 'VOLT', 5);
        expect(noShock.calls).toEqual(['conduct']);
        Math.random = () => 0.05; // below shock chance → stun fires
        const shock = mkCtx();
        applyWeaponElementStatus.call(shock, enemy, 'VOLT', 5);
        expect(shock.calls).toEqual(['conduct', 'stun:600']);
    });

    test('TOXIC corrodes + bleeds', () => {
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, enemy, 'TOXIC', 7);
        expect(ctx.calls).toEqual(['corrode', 'bleed:7']);
    });

    test('VOID marks', () => {
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, enemy, 'VOID', 5);
        expect(ctx.calls).toEqual(['mark']);
    });

    test('KINETIC and RADIANT proc no on-hit status', () => {
        const k = mkCtx();
        applyWeaponElementStatus.call(k, enemy, 'KINETIC', 5);
        expect(k.calls).toEqual([]);
        const r = mkCtx();
        applyWeaponElementStatus.call(r, enemy, 'RADIANT', 5);
        expect(r.calls).toEqual([]);
    });

    test('no-op on an inactive enemy', () => {
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, { active: false }, 'PYRO', 5);
        expect(ctx.calls).toEqual([]);
    });

    test('an unknown element id procs no status (default arm is a no-op)', () => {
        // Pins that a bogus / un-tagged element falls through the switch's
        // default and applies NOTHING — the damage path must never throw or
        // mis-apply a status for an element the system doesn't know.
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, enemy, 'NOT_AN_ELEMENT', 5);
        expect(ctx.calls).toEqual([]);
    });

    test('CRYO at exactly the freeze threshold (8) freezes', () => {
        // Boundary pin: the chill→freeze escalation uses `dealt >= 8`, so a
        // hit of exactly 8 must FREEZE (not chill). Guards an off-by-one drift
        // in ELEM_FREEZE_HIT or the comparison operator.
        const ctx = mkCtx();
        applyWeaponElementStatus.call(ctx, enemy, 'CRYO', 8);
        expect(ctx.calls).toEqual(['freeze']);
    });
});
