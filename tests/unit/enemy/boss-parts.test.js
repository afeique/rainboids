// Phase D.B0 — weak-point sub-entity layer.
//
// Pure, engine-agnostic: a boss carries a declarative parts script; this layer
// owns part HP, world positions (offset / rotate-with-boss / orbit), the
// "core invulnerable while parts live" gate, and hit-testing. Driven here with
// a stub boss + an explicit `now`, mirroring the boss-phases / boss-rage tests.
import { describe, expect, test } from '@jest/globals';
import {
    initBossParts,
    updateBossParts,
    coreBlocksDamage,
    livingParts,
    livingPartCount,
    getBossPart,
    bossPartAt,
    damageBossPart,
    DEFAULT_PART_RADIUS,
} from '../../../js/modules/enemy/boss-parts.js';

const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Two shielding bolt-heads + one decorative (non-shielding) vent.
function partsScript(log = []) {
    return [
        { id: 'bolt-a', name: 'Bolt A', maxHealth: 30, radius: 20, offset: { x: 40, y: 0 },
          onDestroy: () => log.push('bolt-a') },
        { id: 'bolt-b', name: 'Bolt B', maxHealth: 30, radius: 20, offset: { x: -40, y: 0 },
          onDestroy: () => log.push('bolt-b') },
        { id: 'vent', name: 'Vent', maxHealth: 10, radius: 12, shieldsCore: false,
          offset: { x: 0, y: 60 }, onDestroy: () => log.push('vent') },
    ];
}

describe('boss-parts — init', () => {
    test('builds live parts, seeds HP/radius/positions, shields the core', () => {
        const b = stubBoss();
        expect(initBossParts(b, partsScript(), null, 1000)).toBe(true);
        expect(livingPartCount(b)).toBe(3);
        const a = getBossPart(b, 'bolt-a');
        expect(a.health).toBe(30);
        expect(a.maxHealth).toBe(30);
        expect(a.radius).toBe(20);
        expect(a.shieldsCore).toBe(true);
        expect(a.x).toBeCloseTo(40, 5); // boss at origin + offset
        expect(a.y).toBeCloseTo(0, 5);
        expect(getBossPart(b, 'vent').shieldsCore).toBe(false);
        expect(coreBlocksDamage(b)).toBe(true); // shielding parts alive
    });

    test('defaults: maxHealth 1, radius DEFAULT_PART_RADIUS, shieldsCore true', () => {
        const b = stubBoss();
        initBossParts(b, [{ id: 'lonely' }], null, 0);
        const p = getBossPart(b, 'lonely');
        expect(p.maxHealth).toBe(1);
        expect(p.radius).toBe(DEFAULT_PART_RADIUS);
        expect(p.shieldsCore).toBe(true);
    });

    test('a missing/empty script is a safe no-op', () => {
        const b = stubBoss();
        expect(initBossParts(b, null)).toBe(false);
        expect(initBossParts(b, [])).toBe(false);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(livingParts(b)).toEqual([]);
        expect(bossPartAt(b, 0, 0)).toBeNull();
        expect(damageBossPart(b, 'x', 5)).toBeNull();
        expect(() => updateBossParts(b)).not.toThrow();
    });
});

describe('boss-parts — core gating (invulnerable while parts live)', () => {
    test('core stays shielded until ALL shielding parts are destroyed', () => {
        const log = []; const b = stubBoss();
        initBossParts(b, partsScript(log), null, 0);
        expect(coreBlocksDamage(b)).toBe(true);

        // Kill the decorative vent — does NOT lift the gate (non-shielding).
        expect(damageBossPart(b, 'vent', 999).destroyed).toBe(true);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(log).toEqual(['vent']);

        // Kill one bolt — still shielded by the other.
        expect(damageBossPart(b, 'bolt-a', 30).destroyed).toBe(true);
        expect(coreBlocksDamage(b)).toBe(true);

        // Kill the last shielding bolt — core is now vulnerable.
        expect(damageBossPart(b, 'bolt-b', 30).destroyed).toBe(true);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(livingPartCount(b)).toBe(0);
        expect(log).toEqual(['vent', 'bolt-a', 'bolt-b']);
    });

    test('a boss whose parts are all non-shielding never gates the core', () => {
        const b = stubBoss();
        initBossParts(b, [
            { id: 'd1', shieldsCore: false }, { id: 'd2', shieldsCore: false },
        ], null, 0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(livingPartCount(b)).toBe(2);
    });
});

describe('boss-parts — damage', () => {
    test('chips HP, destroys at 0, fires onDestroy once, ignores re-hits', () => {
        const log = []; const b = stubBoss();
        initBossParts(b, partsScript(log), null, 0);
        expect(damageBossPart(b, 'bolt-a', 10)).toEqual({ destroyed: false, part: getBossPart(b, 'bolt-a') });
        expect(getBossPart(b, 'bolt-a').health).toBe(20);
        expect(damageBossPart(b, 'bolt-a', 25).destroyed).toBe(true); // overkill clamps to 0
        expect(getBossPart(b, 'bolt-a').health).toBe(0);
        expect(getBossPart(b, 'bolt-a').alive).toBe(false);
        // Re-hitting a dead part is a no-op and does not re-fire onDestroy.
        expect(damageBossPart(b, 'bolt-a', 10).destroyed).toBe(false);
        expect(log).toEqual(['bolt-a']);
    });

    test('accepts a part instance or an id; non-positive damage is a no-op', () => {
        const b = stubBoss();
        initBossParts(b, partsScript(), null, 0);
        const inst = getBossPart(b, 'bolt-b');
        damageBossPart(b, inst, 5);
        expect(inst.health).toBe(25);
        damageBossPart(b, inst, 0);
        damageBossPart(b, inst, -100);
        expect(inst.health).toBe(25); // unchanged
        expect(damageBossPart(b, 'nope', 5)).toEqual({ destroyed: false, part: null });
    });
});

describe('boss-parts — positioning', () => {
    test('static offset tracks the boss centre', () => {
        const b = stubBoss({ x: 100, y: 200 });
        initBossParts(b, [{ id: 'p', offset: { x: 30, y: -40 } }], null, 0);
        const p = getBossPart(b, 'p');
        expect(p.x).toBeCloseTo(130, 5);
        expect(p.y).toBeCloseTo(160, 5);
        b.x = 0; b.y = 0;
        updateBossParts(b, null, 1000);
        expect(p.x).toBeCloseTo(30, 5);
        expect(p.y).toBeCloseTo(-40, 5);
    });

    test('rotateWithBoss spins the offset by boss.angle', () => {
        const b = stubBoss({ angle: Math.PI / 2 });
        initBossParts(b, [{ id: 'p', offset: { x: 50, y: 0 }, rotateWithBoss: true }], null, 0);
        const p = getBossPart(b, 'p');
        // (50,0) rotated +90° → (0,50).
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(50, 5);
    });

    test('orbit advances the angle over elapsed time', () => {
        const b = stubBoss();
        initBossParts(b, [{ id: 'o', orbit: { radius: 100, speed: Math.PI, phase: 0 } }], null, 1000);
        const p = getBossPart(b, 'o');
        expect(p.x).toBeCloseTo(100, 5); // t=0 → angle 0
        expect(p.y).toBeCloseTo(0, 5);
        updateBossParts(b, null, 1500); // +0.5s → angle π/2
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(100, 5);
    });

    test('updateBossParts is gated by dying/warping/inactive', () => {
        const b = stubBoss();
        initBossParts(b, [{ id: 'p', offset: { x: 10, y: 0 } }], null, 0);
        const p = getBossPart(b, 'p');
        b.x = 500; // move the boss but freeze position updates
        b._deathFlash = 1;
        updateBossParts(b, null, 100);
        expect(p.x).toBeCloseTo(10, 5); // unchanged (dying)
        b._deathFlash = 0; b.warping = true;
        updateBossParts(b, null, 100);
        expect(p.x).toBeCloseTo(10, 5);
        b.warping = false; b.active = false;
        updateBossParts(b, null, 100);
        expect(p.x).toBeCloseTo(10, 5);
        b.active = true;
        updateBossParts(b, null, 100);
        expect(p.x).toBeCloseTo(510, 5); // now tracks the moved boss
    });
});

describe('boss-parts — hit-testing', () => {
    test('bossPartAt returns the living part under a point, null on miss/dead', () => {
        const b = stubBoss();
        initBossParts(b, partsScript(), null, 0);
        // bolt-a sits at (40,0) r=20 → a point at (45,5) is inside.
        expect(bossPartAt(b, 45, 5).id).toBe('bolt-a');
        // Far from any part.
        expect(bossPartAt(b, 1000, 1000)).toBeNull();
        // Destroy bolt-a; the same point no longer hits it.
        damageBossPart(b, 'bolt-a', 999);
        expect(bossPartAt(b, 45, 5)).toBeNull();
    });
});

describe('boss-parts — full clear (core becomes killable)', () => {
    test('clearing every shielding part lifts the gate', () => {
        const b = stubBoss();
        initBossParts(b, partsScript(), null, 0);
        for (const id of ['bolt-a', 'bolt-b']) damageBossPart(b, id, 999);
        // The vent (non-shielding) can stay alive; the core is already open.
        expect(coreBlocksDamage(b)).toBe(false);
        expect(livingPartCount(b)).toBe(1);
        expect(getBossPart(b, 'vent').alive).toBe(true);
    });
});
