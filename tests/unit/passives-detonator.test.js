// Phase P6 — Detonator passive. Killing a status-afflicted enemy detonates its
// statuses as an AoE: every enemy within DETONATE_RADIUS (110px) takes a 6-dmg
// burst and inherits the victim's active statuses (burn / corrode / chill).
// One hop — a chained kill runs the death pipeline but never re-detonates.
import { describe, expect, test } from '@jest/globals';
import { _detonateStatuses } from '../../js/modules/combat/collision-system.js';

const FUTURE = 1e15; // far beyond frameClock.now → an "active" status window

function target(x, y, opts = {}) {
    return {
        x, y, active: true, _deathFlash: 0, warping: false,
        brnUntil: 0, corrodeUntil: 0, corrodeStacks: 0, chillUntil: 0,
        burned: false, corroded: false, chilled: false,
        taken: [], _killAt: opts.killAt ?? Infinity,
        takeDamage(dmg) { this.taken.push(dmg); return dmg >= this._killAt; },
        ...opts,
    };
}

function engine(hasDetonator, others, victim) {
    const calls = { debris: 0, orbs: 0, kills: 0 };
    return {
        calls,
        player: { hasPassive: (id) => hasDetonator && id === 'DETONATOR' },
        enemyPool: { activeObjects: [victim, ...others] },
        applyBurn(e) { e.burned = true; },
        applyCorrode(e) { e.corroded = true; },
        applyChill(e) { e.chilled = true; },
        createEnemyDebris() { calls.debris++; },
        dropOrbsFromEntity() { calls.orbs++; },
        onEnemyKill() { calls.kills++; },
    };
}

describe('Detonator — status-kill AoE', () => {
    test('no passive → no detonation', () => {
        const near = target(10, 0);
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(false, [near], victim);
        _detonateStatuses.call(eng, victim);
        expect(near.taken).toEqual([]);
        expect(near.burned).toBe(false);
    });

    test('victim with NO status → no detonation even with passive', () => {
        const near = target(10, 0);
        const victim = target(0, 0); // no status flags
        const eng = engine(true, [near], victim);
        _detonateStatuses.call(eng, victim);
        expect(near.taken).toEqual([]);
    });

    test('burning victim bursts nearby enemies and spreads burn', () => {
        const near = target(10, 0);
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(true, [near], victim);
        _detonateStatuses.call(eng, victim);
        expect(near.taken).toEqual([6]);
        expect(near.burned).toBe(true);
        expect(near.corroded).toBe(false);
    });

    test('spreads ONLY the statuses the victim actually carried', () => {
        const near = target(10, 0);
        const victim = target(0, 0, { corrodeStacks: 2 });
        const eng = engine(true, [near], victim);
        _detonateStatuses.call(eng, victim);
        expect(near.corroded).toBe(true);
        expect(near.burned).toBe(false);
        expect(near.chilled).toBe(false);
    });

    test('hits ALL enemies in radius, not just the nearest', () => {
        const a = target(10, 0);
        const b = target(0, 30);
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(true, [a, b], victim);
        _detonateStatuses.call(eng, victim);
        expect(a.taken).toEqual([6]);
        expect(b.taken).toEqual([6]);
    });

    test('enemies beyond 110px are untouched', () => {
        const far = target(200, 0);
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(true, [far], victim);
        _detonateStatuses.call(eng, victim);
        expect(far.taken).toEqual([]);
        expect(far.burned).toBe(false);
    });

    test('skips the victim and dying/warping enemies', () => {
        const dying = target(5, 0, { _deathFlash: 8 });
        const warping = target(6, 0, { warping: true });
        const live = target(20, 0);
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(true, [dying, warping, live], victim);
        _detonateStatuses.call(eng, victim);
        expect(live.taken).toEqual([6]);
        expect(dying.taken).toEqual([]);
        expect(warping.taken).toEqual([]);
    });

    test('a chained KILL runs the death pipeline once', () => {
        const near = target(10, 0, { killAt: 6 });
        const victim = target(0, 0, { brnUntil: FUTURE });
        const eng = engine(true, [near], victim);
        _detonateStatuses.call(eng, victim);
        expect(near.taken).toEqual([6]);
        expect(eng.calls.debris).toBe(1);
        expect(eng.calls.orbs).toBe(1);
        expect(eng.calls.kills).toBe(1);
    });
});
