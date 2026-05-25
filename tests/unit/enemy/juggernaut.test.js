/**
 * tests/unit/enemy/juggernaut.test.js — ENMY-10b Juggernaut.
 *
 * The Kinetic BRUISER: a telegraphed CHARGE-AND-RAM built on the SYS-11
 * telegraph helper. Asserts the type/element/resist + charge-marker data, then
 * drives the charge state machine (charge.js, which extends a telegraph) through
 * idle → windup → strike → recover with explicit timestamps. Confirms:
 *   - createCharge defaults + overrides + the embedded telegraph timings,
 *   - canCharge gate (CC / range / interval),
 *   - lockChargeTarget snapshots the player position + a normalized lane dir,
 *   - tickCharge locks the lane EXACTLY once on the strike transition + stamps
 *     lastChargeAt, and signals `recovered` once on the recover transition,
 *   - isStriking is true ONLY in the strike window,
 *   - isRearExposed maps to the recover (punish) window.
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
import {
    createCharge,
    canCharge,
    lockChargeTarget,
    tickCharge,
    isRearExposed,
    CHARGE_DEFAULTS,
} from '../../../js/modules/enemy/abilities/charge.js';
import {
    telegraphPhase,
    isStriking,
} from '../../../js/modules/enemy/telegraph.js';
import { ENEMY_TYPES } from '../../../js/modules/enemy/enemy-data.js';

// Build an enemy carrying a charge config at (px, py).
function makeEnemy(opts = {}, px = 0, py = 0) {
    return { x: px, y: py, active: true, charge: createCharge(opts) };
}

describe('JUGGERNAUT config', () => {
    test('exists as a Kinetic bruiser with a valid charge marker + chargeOpts', () => {
        const d = ENEMY_TYPES.JUGGERNAUT;
        expect(d).toBeTruthy();
        expect(d.name).toBe('Juggernaut');
        expect(d.element).toBe('KINETIC');
        // Charge marker + the timings/speed/range the AI reads.
        expect(d.charge).toBe(true);
        expect(d.chargeOpts).toBeTruthy();
        expect(d.chargeOpts.windupMs).toBeGreaterThan(0);
        expect(d.chargeOpts.strikeMs).toBeGreaterThan(0);
        expect(d.chargeOpts.recoverMs).toBeGreaterThanOrEqual(1000); // ~1.5s stun window
        expect(d.chargeOpts.chargeSpeed).toBeGreaterThan(d.speed);   // the charge is FAST vs the cruise
        expect(d.chargeOpts.range).toBeGreaterThan(0);
        expect(d.chargeOpts.intervalMs).toBeGreaterThan(0);
        expect(d.chargeOpts.ramDamage).toBeGreaterThan(25);          // heavier than the default ram
    });

    test('is a beefy, slow bruiser (the threat is the charge, not the cruise)', () => {
        const d = ENEMY_TYPES.JUGGERNAUT;
        expect(d.health).toBeGreaterThanOrEqual(16);
        expect(d.speed).toBeLessThanOrEqual(2);
        expect(d.size).toBeGreaterThanOrEqual(40);
        expect(d.points).toBeGreaterThanOrEqual(200);
    });

    test('is Kinetic-tough and WEAK to Volt', () => {
        const d = ENEMY_TYPES.JUGGERNAUT;
        expect(d.resist).toBeTruthy();
        expect(d.resist.KINETIC).toBeGreaterThan(0);  // resists Kinetic
        expect(d.resist.VOLT).toBeLessThan(0);         // weak to Volt
    });
});

describe('charge — createCharge', () => {
    test('uses CHARGE_DEFAULTS when no opts given', () => {
        const c = createCharge();
        expect(c.intervalMs).toBe(CHARGE_DEFAULTS.intervalMs);
        expect(c.range).toBe(CHARGE_DEFAULTS.range);
        expect(c.chargeSpeed).toBe(CHARGE_DEFAULTS.chargeSpeed);
        expect(c.ramDamage).toBe(CHARGE_DEFAULTS.ramDamage);
        expect(c.windupMs).toBe(CHARGE_DEFAULTS.windupMs);
        expect(c.strikeMs).toBe(CHARGE_DEFAULTS.strikeMs);
        expect(c.recoverMs).toBe(CHARGE_DEFAULTS.recoverMs);
        expect(c.startedAt).toBeNull();
        expect(c.phase).toBe('idle');
        expect(c.lastChargeAt).toBeNull();
        expect(c._locked).toBe(false);
        expect(c._stunned).toBe(false);
    });

    test('honors overrides', () => {
        const c = createCharge({ intervalMs: 1000, range: 50, chargeSpeed: 20, ramDamage: 99, windupMs: 100, strikeMs: 20, recoverMs: 200 });
        expect(c.intervalMs).toBe(1000);
        expect(c.range).toBe(50);
        expect(c.chargeSpeed).toBe(20);
        expect(c.ramDamage).toBe(99);
        expect(c.windupMs).toBe(100);
        expect(c.strikeMs).toBe(20);
        expect(c.recoverMs).toBe(200);
    });
});

describe('charge — canCharge gate', () => {
    test('no charge config → false', () => {
        expect(canCharge({}, { x: 0, y: 0 }, 0)).toBe(false);
        expect(canCharge(null, { x: 0, y: 0 }, 0)).toBe(false);
    });

    test('first charge allowed when in range + not CC\'d', () => {
        const e = makeEnemy({ range: 200, intervalMs: 1000 }, 0, 0);
        expect(canCharge(e, { x: 100, y: 0 }, 0)).toBe(true);   // within range
    });

    test('false when the player is out of range', () => {
        const e = makeEnemy({ range: 200, intervalMs: 1000 }, 0, 0);
        expect(canCharge(e, { x: 300, y: 0 }, 0)).toBe(false);  // 300 > 200
    });

    test('false while CC\'d (frozen / chilled / stunned)', () => {
        const e = makeEnemy({ range: 500 }, 0, 0);
        const player = { x: 100, y: 0 };
        e.frozen = true;
        expect(canCharge(e, player, 0)).toBe(false);
        e.frozen = false;
        e._frozenUntil = 5000;
        expect(canCharge(e, player, 1000)).toBe(false);
        e._frozenUntil = 0;
        e.chillUntil = 5000;
        expect(canCharge(e, player, 1000)).toBe(false);
        e.chillUntil = 0;
        e.stunUntil = 5000;
        expect(canCharge(e, player, 1000)).toBe(false);
        e.stunUntil = 0;
        expect(canCharge(e, player, 1000)).toBe(true);          // CC cleared
    });

    test('false before intervalMs elapsed since lastChargeAt, true after', () => {
        const e = makeEnemy({ range: 500, intervalMs: 1000 }, 0, 0);
        const player = { x: 100, y: 0 };
        e.charge.lastChargeAt = 2000;
        expect(canCharge(e, player, 2500)).toBe(false);
        expect(canCharge(e, player, 2999)).toBe(false);
        expect(canCharge(e, player, 3000)).toBe(true);          // exactly intervalMs
    });
});

describe('charge — lockChargeTarget', () => {
    test('snapshots the player position + a normalized lane direction', () => {
        const e = makeEnemy({}, 0, 0);
        lockChargeTarget(e, { x: 30, y: 40 }); // 3-4-5 triangle, len 50
        expect(e.charge.targetX).toBe(30);
        expect(e.charge.targetY).toBe(40);
        expect(e.charge.dirX).toBeCloseTo(0.6, 5);
        expect(e.charge.dirY).toBeCloseTo(0.8, 5);
        // unit length
        expect(Math.hypot(e.charge.dirX, e.charge.dirY)).toBeCloseTo(1, 5);
    });

    test('player exactly on top → falls back to a rightward lane', () => {
        const e = makeEnemy({}, 100, 100);
        lockChargeTarget(e, { x: 100, y: 100 });
        expect(e.charge.dirX).toBe(1);
        expect(e.charge.dirY).toBe(0);
    });
});

describe('charge — tickCharge lifecycle', () => {
    test('drives idle → windup → strike → recover; locks lane once; isStriking only in strike', () => {
        // windup [0,100), strike [100,140), recover [140,340)
        const e = makeEnemy({ range: 500, intervalMs: 1000, chargeSpeed: 10, windupMs: 100, strikeMs: 40, recoverMs: 200 }, 0, 0);
        const player = { x: 100, y: 0 };

        // t=0 — idle + eligible → start the wind-up (the visible tell).
        let r = tickCharge(e, player, 0);
        expect(r.phase).toBe('windup');
        expect(r.started).toBe(true);
        expect(r.striking).toBe(false);
        expect(isStriking(e.charge, 0)).toBe(false);
        expect(e.charge._locked).toBe(false);

        // t=50 — still winding up (lane NOT yet locked; player can sidestep).
        r = tickCharge(e, player, 50);
        expect(r.phase).toBe('windup');
        expect(r.striking).toBe(false);
        expect(e.charge._locked).toBe(false);

        // Player moves during the wind-up — the lane locks to the position at
        // charge-start (the strike frame below), not this one.
        player.x = 100; player.y = 100;

        // t=100 — strike opens → lock the lane EXACTLY once + stamp lastChargeAt.
        r = tickCharge(e, player, 100);
        expect(r.phase).toBe('strike');
        expect(r.striking).toBe(true);
        expect(isStriking(e.charge, 100)).toBe(true);
        expect(e.charge._locked).toBe(true);
        expect(e.charge.lastChargeAt).toBe(100);
        // Locked toward (100,100): normalized (≈0.707, 0.707).
        expect(e.charge.dirX).toBeCloseTo(Math.SQRT1_2, 4);
        expect(e.charge.dirY).toBeCloseTo(Math.SQRT1_2, 4);

        // t=120 — still striking, but the lane is NOT re-locked (single lock).
        const lockedDirX = e.charge.dirX;
        player.x = -999; // move the player; the locked lane must not follow
        r = tickCharge(e, player, 120);
        expect(r.phase).toBe('strike');
        expect(r.striking).toBe(true);
        expect(e.charge.dirX).toBe(lockedDirX);

        // t=140 — recover opens → `recovered` signals ONCE (caller applies stun).
        r = tickCharge(e, player, 140);
        expect(r.phase).toBe('recover');
        expect(r.striking).toBe(false);
        expect(isStriking(e.charge, 140)).toBe(false);
        expect(r.recovered).toBe(true);
        expect(e.charge._stunned).toBe(true);

        // t=200 — still recovering, but `recovered` does NOT re-signal.
        r = tickCharge(e, player, 200);
        expect(r.phase).toBe('recover');
        expect(r.recovered).toBe(false);

        // t=500 — well past the cycle → idle again, latches reset.
        r = tickCharge(e, player, 500);
        expect(r.phase).toBe('idle');
        expect(e.charge._locked).toBe(false);
        expect(e.charge._stunned).toBe(false);
    });

    test('does NOT start a charge while CC\'d', () => {
        const e = makeEnemy({ range: 500, windupMs: 100, strikeMs: 40, recoverMs: 200 }, 0, 0);
        e.frozen = true;
        const r = tickCharge(e, { x: 100, y: 0 }, 0);
        expect(r.phase).toBe('idle');
        expect(r.started).toBe(false);
        expect(e.charge.startedAt).toBeNull();
    });

    test('does not charge again until intervalMs elapses after charge-start', () => {
        const e = makeEnemy({ range: 500, intervalMs: 1000, windupMs: 100, strikeMs: 40, recoverMs: 200 }, 0, 0);
        const player = { x: 100, y: 0 };
        tickCharge(e, player, 0);    // windup
        tickCharge(e, player, 100);  // strike → lock + stamp lastChargeAt=100
        expect(e.charge.lastChargeAt).toBe(100);

        // t=500 — fully recovered + idle, but interval (1000) not elapsed → no new charge.
        let r = tickCharge(e, player, 500);
        expect(r.phase).toBe('idle');
        expect(r.started).toBe(false);

        // t=1100 — interval elapsed (>= 100 + 1000) → new wind-up.
        r = tickCharge(e, player, 1100);
        expect(r.phase).toBe('windup');
        expect(r.started).toBe(true);
    });

    test('no charge config → inert status', () => {
        const r = tickCharge({ x: 0, y: 0 }, { x: 0, y: 0 }, 0);
        expect(r).toEqual({ phase: 'idle', started: false, striking: false, recovered: false });
    });
});

describe('charge — isRearExposed (recover punish window)', () => {
    test('true only during recover, false in idle/windup/strike', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 40, recoverMs: 200 });
        e.charge.startedAt = 0;
        e.charge.phase = 'windup';
        expect(telegraphPhase(e.charge, 50)).toBe('windup');
        expect(isRearExposed(e, 50)).toBe(false);
        expect(telegraphPhase(e.charge, 120)).toBe('strike');
        expect(isRearExposed(e, 120)).toBe(false);
        expect(telegraphPhase(e.charge, 160)).toBe('recover');
        expect(isRearExposed(e, 160)).toBe(true);
        expect(isRearExposed(e, 500)).toBe(false); // back to idle
    });

    test('no charge config → never rear-exposed', () => {
        expect(isRearExposed({}, 0)).toBe(false);
        expect(isRearExposed(null, 0)).toBe(false);
    });
});
