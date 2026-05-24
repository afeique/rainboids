// Phase P6 — Overkill + Ricochet passives. On a killing blow, _passiveKillSplash
// forwards damage to the nearest other enemy: Overkill = wasted excess (bullet
// damage beyond the victim's HP), Ricochet = a flat 50% of the shot. Both route
// through the target's takeDamage exactly once (one hop, no chain re-entry).
import { describe, expect, test } from '@jest/globals';
import { _passiveKillSplash } from '../../js/modules/combat/collision-system.js';

function target(x, y, opts = {}) {
    const t = {
        x, y, active: true, _deathFlash: 0, warping: false,
        taken: [], _killAt: opts.killAt ?? Infinity,
        takeDamage(dmg) { this.taken.push(dmg); return dmg >= this._killAt; },
    };
    return t;
}

// `victim` is the just-killed enemy at the origin; `others` is the live pool.
function engine(passives, others, victim) {
    const calls = { debris: 0, orbs: 0, kills: 0 };
    return {
        calls,
        player: { hasPassive: (id) => passives.includes(id) },
        enemyPool: { activeObjects: [victim, ...others] },
        createEnemyDebris() { calls.debris++; },
        dropOrbsFromEntity() { calls.orbs++; },
        onEnemyKill() { calls.kills++; },
    };
}

describe('Overkill / Ricochet kill-splash', () => {
    test('no passive → no splash, nearest enemy untouched', () => {
        const near = target(10, 0);
        const victim = target(0, 0);
        const eng = engine([], [near], victim);
        _passiveKillSplash.call(eng, victim, 20, 5);
        expect(near.taken).toEqual([]);
    });

    test('Overkill splashes the wasted excess (damage − victim HP)', () => {
        const near = target(10, 0);
        const victim = target(0, 0);
        const eng = engine(['OVERKILL'], [near], victim);
        // 20 damage into a 5-HP victim → 15 wasted excess.
        _passiveKillSplash.call(eng, victim, 20, 5);
        expect(near.taken).toEqual([15]);
    });

    test('Overkill with no excess (damage ≤ HP) deals nothing', () => {
        const near = target(10, 0);
        const victim = target(0, 0);
        const eng = engine(['OVERKILL'], [near], victim);
        _passiveKillSplash.call(eng, victim, 5, 5);
        expect(near.taken).toEqual([]);
    });

    test('Ricochet bounces a flat 50% of the shot', () => {
        const near = target(10, 0);
        const victim = target(0, 0);
        const eng = engine(['RICOCHET'], [near], victim);
        _passiveKillSplash.call(eng, victim, 12, 4);
        expect(near.taken).toEqual([6]);
    });

    test('both passives stack: excess + 50% shot', () => {
        const near = target(10, 0);
        const victim = target(0, 0);
        const eng = engine(['OVERKILL', 'RICOCHET'], [near], victim);
        // excess = 20 − 5 = 15; ricochet = 20 * 0.5 = 10 → 25 total.
        _passiveKillSplash.call(eng, victim, 20, 5);
        expect(near.taken).toEqual([25]);
    });

    test('targets the NEAREST live enemy, skips the victim', () => {
        const near = target(10, 0);
        const far = target(150, 0);
        const victim = target(0, 0);
        const eng = engine(['RICOCHET'], [far, near], victim);
        _passiveKillSplash.call(eng, victim, 10, 0);
        expect(near.taken.length).toBe(1);
        expect(far.taken.length).toBe(0);
    });

    test('out-of-range enemies are not hit', () => {
        const far = target(9999, 0);
        const victim = target(0, 0);
        const eng = engine(['RICOCHET'], [far], victim);
        _passiveKillSplash.call(eng, victim, 10, 0);
        expect(far.taken).toEqual([]);
    });

    test('a chained KILL runs the death pipeline once (no re-entry)', () => {
        const near = target(10, 0, { killAt: 5 });
        const victim = target(0, 0);
        const eng = engine(['RICOCHET'], [near], victim);
        // ricochet = 10 * 0.5 = 5 ≥ killAt → kills the chained target.
        _passiveKillSplash.call(eng, victim, 10, 0);
        expect(near.taken).toEqual([5]);
        expect(eng.calls.debris).toBe(1);
        expect(eng.calls.orbs).toBe(1);
        expect(eng.calls.kills).toBe(1);
    });

    test('skips dying/warping enemies when picking the nearest', () => {
        const dying = target(5, 0); dying._deathFlash = 8;
        const warping = target(6, 0); warping.warping = true;
        const live = target(20, 0);
        const victim = target(0, 0);
        const eng = engine(['RICOCHET'], [dying, warping, live], victim);
        _passiveKillSplash.call(eng, victim, 10, 0);
        expect(live.taken).toEqual([5]);
        expect(dying.taken).toEqual([]);
        expect(warping.taken).toEqual([]);
    });
});
