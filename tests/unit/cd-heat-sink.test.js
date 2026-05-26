// HEAT_SINK — offense keystone passive (§6c no-downsides, pure-upside rework).
//
//   • While held, holding primary fire ramps the fire RATE faster over sustained
//     fire — PAST the normal fire-rate cap — building HEAT as primaries land.
//   • The uncapped ramp is HARD-FLOORED at HEAT_SINK_FIRE_FLOOR_MS so the bullet
//     rate can never explode (perf floor).
//   • At max HEAT the ship VENTs an AoE burst to nearby enemies (a reward, NOT a
//     lockout — firing never stops), then HEAT resets and the ramp restarts.
//
// This unit suite validates the PASSIVES entry, the tunable constants, the pure
// ramp helper (faster with heat, floored, DEFAULT-SAFE at heat 0), the vent
// trigger predicate (heat ≥ max), and the pure vent-AoE selector (enemies within
// radius). All pure — no full Player needed.
import { PASSIVES } from '../../js/modules/combat/passive-data.js';
import {
    heatSinkFireRate,
    heatSinkShouldVent,
    heatSinkVentTargets,
} from '../../js/modules/player/weapons.js';
import {
    HEAT_SINK_MAX,
    HEAT_SINK_RAMP,
    HEAT_SINK_FIRE_FLOOR_MS,
    HEAT_SINK_VENT_RADIUS,
    HEAT_SINK_VENT_DAMAGE,
    HEAT_SINK_DECAY_PER_SEC,
} from '../../js/modules/core/constants.js';

describe('PASSIVES — HEAT_SINK entry', () => {
    test('HEAT_SINK exists with sane fields and a NO-LOCKOUT desc', () => {
        const e = PASSIVES.HEAT_SINK;
        expect(e).toBeDefined();
        expect(e.id).toBe('HEAT_SINK');
        expect(typeof e.name).toBe('string');
        expect(e.name.length).toBeGreaterThan(0);
        expect(typeof e.desc).toBe('string');
        expect(e.desc.length).toBeGreaterThan(0);
        // Offense keystone, slot-equippable, binary stack.
        expect(e.tags).toContain('keystone');
        expect(e.tags).toContain('offense');
        expect(e.slot).toBe(true);
        expect(e.item).toBe(false);
        // §6c — pure upside: no downside field. The desc frames the vent as an
        // AoE reward with NO lockout (the old "brief lockout" downside is gone).
        expect('downside' in e).toBe(false);
        expect(e.desc.toLowerCase()).toContain('no lockout');
        expect(e.desc.toLowerCase()).toContain('vent');
        expect(e.desc.toLowerCase()).toContain('aoe');
        // Hooks document the consumer sites.
        expect(e.hooks).toEqual(expect.arrayContaining(['fireRate', 'fire']));
    });
});

describe('constants — HEAT_SINK tunables', () => {
    test('sane defaults: max=100, ramp 0.45, floor 18ms, radius 200, decay > 0', () => {
        expect(HEAT_SINK_MAX).toBe(100);
        expect(HEAT_SINK_RAMP).toBe(0.45);
        expect(HEAT_SINK_FIRE_FLOOR_MS).toBe(18);
        expect(HEAT_SINK_VENT_RADIUS).toBe(200);
        expect(HEAT_SINK_VENT_DAMAGE).toBeGreaterThan(0);
        expect(HEAT_SINK_DECAY_PER_SEC).toBeGreaterThan(0);
    });
});

describe('heatSinkFireRate — uncapped ramp helper', () => {
    test('DEFAULT-SAFE: heat 0 returns the base interval unchanged', () => {
        expect(heatSinkFireRate(120, 0)).toBe(120);
        expect(heatSinkFireRate(200, 0)).toBe(200);
    });

    test('heat shrinks the interval (faster fire) monotonically', () => {
        const base = 120;
        const cold = heatSinkFireRate(base, 0);
        const warm = heatSinkFireRate(base, HEAT_SINK_MAX / 2);
        const hot = heatSinkFireRate(base, HEAT_SINK_MAX);
        expect(warm).toBeLessThan(cold);
        expect(hot).toBeLessThan(warm);
    });

    test('full heat scales the interval down by HEAT_SINK_RAMP (past the cap)', () => {
        const base = 120; // well above the floor so the ramp, not the floor, governs
        // base*(1 - ramp) = 120 * 0.55 = 66
        expect(heatSinkFireRate(base, HEAT_SINK_MAX)).toBeCloseTo(base * (1 - HEAT_SINK_RAMP), 6);
    });

    test('PERF FLOOR: ramp can never go below HEAT_SINK_FIRE_FLOOR_MS', () => {
        // A tiny base interval at full heat would otherwise fall under the floor.
        expect(heatSinkFireRate(20, HEAT_SINK_MAX)).toBe(HEAT_SINK_FIRE_FLOOR_MS);
        expect(heatSinkFireRate(10, HEAT_SINK_MAX)).toBe(HEAT_SINK_FIRE_FLOOR_MS);
        // Even with a huge over-cap heat the floor still holds.
        expect(heatSinkFireRate(20, HEAT_SINK_MAX * 10)).toBe(HEAT_SINK_FIRE_FLOOR_MS);
    });

    test('heat is clamped to [0, MAX] (negative/over-max are safe)', () => {
        const base = 120;
        expect(heatSinkFireRate(base, -50)).toBe(base);                       // clamp low
        expect(heatSinkFireRate(base, HEAT_SINK_MAX * 5))
            .toBeCloseTo(heatSinkFireRate(base, HEAT_SINK_MAX), 6);           // clamp high
    });
});

describe('heatSinkShouldVent — vent trigger predicate', () => {
    test('false below max, true at/above max', () => {
        expect(heatSinkShouldVent(0)).toBe(false);
        expect(heatSinkShouldVent(HEAT_SINK_MAX - 1)).toBe(false);
        expect(heatSinkShouldVent(HEAT_SINK_MAX)).toBe(true);
        expect(heatSinkShouldVent(HEAT_SINK_MAX + 10)).toBe(true);
    });

    test('DEFAULT-SAFE: undefined/0 heat never vents', () => {
        expect(heatSinkShouldVent(undefined)).toBe(false);
    });
});

describe('heatSinkVentTargets — pure AoE selector', () => {
    const px = 500, py = 500;

    test('selects only ACTIVE enemies within HEAT_SINK_VENT_RADIUS', () => {
        const inNear = { x: px + 10, y: py + 10, active: true };
        const inEdge = { x: px + HEAT_SINK_VENT_RADIUS - 5, y: py, active: true };
        const outFar = { x: px + HEAT_SINK_VENT_RADIUS + 50, y: py, active: true };
        const inactiveNear = { x: px, y: py, active: false };
        const targets = heatSinkVentTargets([inNear, inEdge, outFar, inactiveNear], px, py);
        expect(targets).toContain(inNear);
        expect(targets).toContain(inEdge);
        expect(targets).not.toContain(outFar);
        expect(targets).not.toContain(inactiveNear);
        expect(targets.length).toBe(2);
    });

    test('empty / non-array input → empty selection (default-safe)', () => {
        expect(heatSinkVentTargets([], px, py)).toEqual([]);
        expect(heatSinkVentTargets(null, px, py)).toEqual([]);
        expect(heatSinkVentTargets(undefined, px, py)).toEqual([]);
    });

    test('the vent damage applied to each target is HEAT_SINK_VENT_DAMAGE (caller contract)', () => {
        // The selector returns targets; the engine applies HEAT_SINK_VENT_DAMAGE
        // to each via damageEnemy. Simulate that contract here.
        const e1 = { x: px, y: py, active: true, hp: 100 };
        const e2 = { x: px + 5, y: py, active: true, hp: 100 };
        const targets = heatSinkVentTargets([e1, e2], px, py);
        for (const e of targets) e.hp -= HEAT_SINK_VENT_DAMAGE;
        expect(e1.hp).toBe(100 - HEAT_SINK_VENT_DAMAGE);
        expect(e2.hp).toBe(100 - HEAT_SINK_VENT_DAMAGE);
    });
});
