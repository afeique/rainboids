/**
 * tests/unit/enemy/boss-attacks.test.js — boss signature-attack wiring (ATK-n).
 *
 * Pins the edge-detection (fire-window fires its pattern exactly once per cycle)
 * and the Maelstrom Conduct-Rain radial emit through a stub enemyBulletPool.
 */
import { describe, expect, test } from '@jest/globals';
import { updateBossAttacks, _internal } from '../../../js/modules/enemy/boss-attacks.js';

const { firingEdge, counterEdge } = _internal;

// Minimal enemyBulletPool that records every spawned bullet.
function makePool() {
    const spawned = [];
    return {
        spawned,
        get() {
            const b = {
                reset(x, y, vx, vy, color, explosive) {
                    Object.assign(this, { x, y, vel: { x: vx, y: vy }, color, explosive });
                },
                radius: 0, glowRadius: 0, damage: 0, shooter: null,
            };
            spawned.push(b);
            return b;
        },
    };
}

function makeGE() {
    return { enemyBulletPool: makePool(), _activeShotElement: null, _activeShotPattern: null };
}

describe('edge detection', () => {
    test('firingEdge fires once on the rising edge, not while held', () => {
        const boss = {};
        expect(firingEdge(boss, 'k', false)).toBe(false);
        expect(firingEdge(boss, 'k', true)).toBe(true);   // 0→1 edge
        expect(firingEdge(boss, 'k', true)).toBe(false);  // held high
        expect(firingEdge(boss, 'k', false)).toBe(false); // falling
        expect(firingEdge(boss, 'k', true)).toBe(true);   // next cycle
    });

    test('counterEdge fires once per increment (multi-step jump = one edge)', () => {
        const boss = {};
        expect(counterEdge(boss, 'c', 0)).toBe(false);
        expect(counterEdge(boss, 'c', 1)).toBe(true);
        expect(counterEdge(boss, 'c', 1)).toBe(false);
        expect(counterEdge(boss, 'c', 4)).toBe(true);   // jumped +3 → still one edge
        expect(counterEdge(boss, 'c', 4)).toBe(false);
    });
});

describe('MAELSTROM — Conduct Rain', () => {
    const baseBoss = () => ({
        bossId: 'MAELSTROM', element: 'VOLT', x: 100, y: 200, radius: 50,
        warping: false, _deathFlash: 0, conductRainFiring: false, _enraged: false,
        getLevelScaledDamage: (d) => d * 2,
    });

    test('no fire while the strike window is off', () => {
        const ge = makeGE();
        const boss = baseBoss();
        updateBossAttacks(boss, ge, 1000);
        expect(ge.enemyBulletPool.spawned.length).toBe(0);
    });

    test('emits a VOLT radial nova once on the strike rising edge', () => {
        const ge = makeGE();
        const boss = baseBoss();
        boss.conductRainFiring = true;            // strike window opens
        updateBossAttacks(boss, ge, 1000);
        const n = ge.enemyBulletPool.spawned.length;
        expect(n).toBe(14);                        // non-enraged ring count
        // Every bullet carries the boss element + shooter tag + scaled damage.
        for (const b of ge.enemyBulletPool.spawned) {
            expect(b.element ?? 'VOLT'); // element stamped via reset path
            expect(b.shooter).toBe(boss);
            expect(b.damage).toBe(6);              // getLevelScaledDamage(3)
            expect(b.radius).toBeGreaterThan(0);
        }
        // Held high on the next frame → does NOT fire again.
        updateBossAttacks(boss, ge, 1016);
        expect(ge.enemyBulletPool.spawned.length).toBe(n);
        // Window closes then reopens → fires the next nova.
        boss.conductRainFiring = false;
        updateBossAttacks(boss, ge, 1032);
        boss.conductRainFiring = true;
        updateBossAttacks(boss, ge, 1048);
        expect(ge.enemyBulletPool.spawned.length).toBe(n + 14);
    });

    test('enraged fires a denser nova (20)', () => {
        const ge = makeGE();
        const boss = baseBoss();
        boss._enraged = true;
        boss.conductRainFiring = true;
        updateBossAttacks(boss, ge, 1000);
        expect(ge.enemyBulletPool.spawned.length).toBe(20);
    });

    test('does not fire while warping or dying', () => {
        const ge = makeGE();
        const boss = baseBoss();
        boss.conductRainFiring = true;
        boss.warping = true;
        updateBossAttacks(boss, ge, 1000);
        expect(ge.enemyBulletPool.spawned.length).toBe(0);
        boss.warping = false; boss._deathFlash = 1;
        updateBossAttacks(boss, ge, 1016);
        expect(ge.enemyBulletPool.spawned.length).toBe(0);
    });

    test('a boss with no ATTACKS entry is a no-op', () => {
        const ge = makeGE();
        const boss = { bossId: 'HARBINGER', x: 0, y: 0, radius: 40, _deathFlash: 0 };
        updateBossAttacks(boss, ge, 1000);
        expect(ge.enemyBulletPool.spawned.length).toBe(0);
    });
});
