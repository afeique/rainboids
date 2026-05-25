// SYS-4 / ENMY-02 — projectile absorption (maw cone) unit tests.
//
// Drives the pure helpers headlessly with stub enemies/bullets + an explicit
// `now`. Asserts the DoD: cone hit/miss by angle & range (incl. ±π wraparound),
// the shouldAbsorb gating (eatsProjectiles / beam / melee / cone), shield
// accumulation + maxShield clamp + expiry stamp, absorbShieldRemaining lapsing,
// and consumeAbsorbShield partial vs full passthrough.
import { describe, expect, test } from '@jest/globals';
import {
    SHIELD_DURATION_MS,
    MAW_DEFAULTS,
    bulletInMawCone,
    absorbBullet,
    shouldAbsorb,
    absorbShieldRemaining,
    consumeAbsorbShield,
} from '../../../../js/modules/enemy/abilities/projectile-absorb.js';

// A devourer at the origin facing +x (0 rad), 90° cone (±45°), range 100.
function makeEnemy(overrides = {}) {
    return {
        x: 0,
        y: 0,
        eatsProjectiles: true,
        maw: {
            halfAngleRad: Math.PI / 4,
            range: 100,
            facingRad: 0,
            shieldPerBullet: 6,
            maxShield: 60,
        },
        ...overrides,
    };
}

describe('exported surface', () => {
    test('SHIELD_DURATION_MS and MAW_DEFAULTS are present and sane', () => {
        expect(SHIELD_DURATION_MS).toBe(3000);
        expect(MAW_DEFAULTS).toEqual(
            expect.objectContaining({
                halfAngleRad: expect.any(Number),
                range: expect.any(Number),
                facingRad: expect.any(Number),
                shieldPerBullet: expect.any(Number),
                maxShield: expect.any(Number),
            })
        );
        expect(MAW_DEFAULTS.maxShield).toBeGreaterThan(MAW_DEFAULTS.shieldPerBullet);
    });
});

describe('bulletInMawCone — angle', () => {
    test('bullet straight ahead (on the facing axis, in range) is inside', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: 50, y: 0 })).toBe(true);
    });

    test('bullet within the half-angle is inside', () => {
        const e = makeEnemy(); // ±45°
        // 30° off-axis: cos/sin at r=50
        const ang = Math.PI / 6;
        expect(bulletInMawCone(e, { x: 50 * Math.cos(ang), y: 50 * Math.sin(ang) })).toBe(true);
    });

    test('bullet exactly at the half-angle edge is inside (<=)', () => {
        const e = makeEnemy();
        const ang = Math.PI / 4; // exactly 45°
        expect(bulletInMawCone(e, { x: 50 * Math.cos(ang), y: 50 * Math.sin(ang) })).toBe(true);
    });

    test('bullet just outside the half-angle is out of arc', () => {
        const e = makeEnemy();
        const ang = Math.PI / 4 + 0.05; // ~47.9°
        expect(bulletInMawCone(e, { x: 50 * Math.cos(ang), y: 50 * Math.sin(ang) })).toBe(false);
    });

    test('bullet directly behind the maw is out of arc', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: -50, y: 0 })).toBe(false);
    });

    test('bullet perpendicular (90° off-axis) is out of a 90° cone', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: 0, y: 50 })).toBe(false);
    });

    test('a bullet on top of the maw (zero offset) counts as inside', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: 0, y: 0 })).toBe(true);
    });
});

describe('bulletInMawCone — angle wraparound near ±π', () => {
    // Maw facing +π (i.e. -x). A bullet to the left of the enemy points at ±π;
    // a naive (non-wrapping) angle compare would mis-handle the seam.
    test('bullet straight along a +π facing is inside despite the seam', () => {
        const e = makeEnemy({ maw: { ...makeEnemy().maw, facingRad: Math.PI } });
        // bullet directly to the -x side → atan2 gives +π (or -π); delta ~0
        expect(bulletInMawCone(e, { x: -50, y: 0 })).toBe(true);
    });

    test('bullet just inside the cone across the seam (facing +π) is inside', () => {
        const e = makeEnemy({ maw: { ...makeEnemy().maw, facingRad: Math.PI } });
        // 30° off the -x axis, on the -y side → atan2 ~ -(π-30°), crosses the seam
        const ang = Math.PI + Math.PI / 6; // 210°, wraps to -150°
        expect(bulletInMawCone(e, { x: 50 * Math.cos(ang), y: 50 * Math.sin(ang) })).toBe(true);
    });

    test('bullet outside the cone but near the seam (facing +π) is out', () => {
        const e = makeEnemy({ maw: { ...makeEnemy().maw, facingRad: Math.PI } });
        const ang = Math.PI / 6; // pointing +x-ish — opposite side of the seam
        expect(bulletInMawCone(e, { x: 50 * Math.cos(ang), y: 50 * Math.sin(ang) })).toBe(false);
    });

    test('facing -π behaves identically to facing +π', () => {
        const e = makeEnemy({ maw: { ...makeEnemy().maw, facingRad: -Math.PI } });
        expect(bulletInMawCone(e, { x: -50, y: 0 })).toBe(true);
    });
});

describe('bulletInMawCone — range', () => {
    test('bullet beyond range (on-axis) is out', () => {
        const e = makeEnemy(); // range 100
        expect(bulletInMawCone(e, { x: 150, y: 0 })).toBe(false);
    });

    test('bullet exactly at range is inside (<=)', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: 100, y: 0 })).toBe(true);
    });

    test('bullet just past range is out', () => {
        const e = makeEnemy();
        expect(bulletInMawCone(e, { x: 100.0001, y: 0 })).toBe(false);
    });

    test('enemy not at origin: offset is computed relative to the enemy', () => {
        const e = makeEnemy({ x: 200, y: 200 });
        expect(bulletInMawCone(e, { x: 250, y: 200 })).toBe(true);  // 50px ahead
        expect(bulletInMawCone(e, { x: 350, y: 200 })).toBe(false); // 150px → out of range
    });

    test('no maw / no bullet → false (no throw)', () => {
        expect(bulletInMawCone({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
        expect(bulletInMawCone(makeEnemy(), null)).toBe(false);
        expect(bulletInMawCone(null, { x: 1, y: 0 })).toBe(false);
    });
});

describe('shouldAbsorb — gating', () => {
    const inCone = { x: 50, y: 0 };

    test('eatsProjectiles + maw + normal bullet in cone → true', () => {
        expect(shouldAbsorb(makeEnemy(), inCone, 1000)).toBe(true);
    });

    test('enemy without eatsProjectiles → false even if in cone', () => {
        expect(shouldAbsorb(makeEnemy({ eatsProjectiles: false }), inCone, 1000)).toBe(false);
    });

    test('enemy without a maw → false', () => {
        const e = makeEnemy();
        delete e.maw;
        expect(shouldAbsorb(e, inCone, 1000)).toBe(false);
    });

    test('beam bullet bypasses absorption → false', () => {
        expect(shouldAbsorb(makeEnemy(), { ...inCone, isBeam: true }, 1000)).toBe(false);
    });

    test('melee bullet bypasses absorption → false', () => {
        expect(shouldAbsorb(makeEnemy(), { ...inCone, isMelee: true }, 1000)).toBe(false);
    });

    test('explicit bypassAbsorb flag → false', () => {
        expect(shouldAbsorb(makeEnemy(), { ...inCone, bypassAbsorb: true }, 1000)).toBe(false);
    });

    test('normal bullet OUT of cone → false', () => {
        expect(shouldAbsorb(makeEnemy(), { x: -50, y: 0 }, 1000)).toBe(false);
    });
});

describe('absorbBullet — banking + clamp + expiry', () => {
    test('accumulates shieldPerBullet on each consumed bullet', () => {
        const e = makeEnemy();
        expect(absorbBullet(e, { x: 50, y: 0 }, 1000)).toBe(6);
        expect(absorbBullet(e, { x: 50, y: 0 }, 1100)).toBe(12);
        expect(e._absorbShield).toBe(12);
    });

    test('clamps the banked shield to maxShield', () => {
        const e = makeEnemy(); // shieldPerBullet 6, maxShield 60
        let v = 0;
        for (let i = 0; i < 100; i++) v = absorbBullet(e, { x: 50, y: 0 }, 1000 + i);
        expect(v).toBe(60);
        expect(e._absorbShield).toBe(60);
    });

    test('stamps _absorbShieldUntil to now + SHIELD_DURATION_MS', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 5000);
        expect(e._absorbShieldUntil).toBe(5000 + SHIELD_DURATION_MS);
    });

    test('re-absorbing refreshes the expiry stamp', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000);
        absorbBullet(e, { x: 50, y: 0 }, 4000);
        expect(e._absorbShieldUntil).toBe(4000 + SHIELD_DURATION_MS);
    });

    test('no maw → returns 0, no mutation', () => {
        const e = { x: 0, y: 0 };
        expect(absorbBullet(e, { x: 1, y: 0 }, 1000)).toBe(0);
        expect(e._absorbShield).toBeUndefined();
    });
});

describe('absorbShieldRemaining — expiry', () => {
    test('full banked value while active', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // banks 6, until 4000
        expect(absorbShieldRemaining(e, 2000)).toBe(6);
    });

    test('0 after the stamp expires', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // until 4000
        expect(absorbShieldRemaining(e, 4001)).toBe(0);
    });

    test('0 exactly at the expiry boundary (strictly-after only)', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // until 4000
        expect(absorbShieldRemaining(e, 4000)).toBe(0);
    });

    test('0 for an enemy that never absorbed', () => {
        expect(absorbShieldRemaining(makeEnemy(), 1000)).toBe(0);
        expect(absorbShieldRemaining(null, 1000)).toBe(0);
    });
});

describe('consumeAbsorbShield — passthrough', () => {
    test('partial: shield soaks all damage, returns 0 passthrough', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // 6 shield, until 4000
        const through = consumeAbsorbShield(e, 4, 2000);
        expect(through).toBe(0);
        expect(absorbShieldRemaining(e, 2000)).toBe(2);
    });

    test('full: damage exceeds shield, leftover passes through and shield empties', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // 6 shield
        const through = consumeAbsorbShield(e, 10, 2000);
        expect(through).toBe(4); // 10 - 6
        expect(absorbShieldRemaining(e, 2000)).toBe(0);
    });

    test('exact: damage equals shield, 0 passthrough and shield empties', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // 6 shield
        expect(consumeAbsorbShield(e, 6, 2000)).toBe(0);
        expect(absorbShieldRemaining(e, 2000)).toBe(0);
    });

    test('expired shield: amount passes through unchanged, nothing spent', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000); // until 4000
        const through = consumeAbsorbShield(e, 9, 4001);
        expect(through).toBe(9);
        // banked value untouched (it has simply lapsed, not been spent)
        expect(e._absorbShield).toBe(6);
    });

    test('no shield ever banked: returns amount unchanged', () => {
        expect(consumeAbsorbShield(makeEnemy(), 7, 1000)).toBe(7);
    });

    test('non-positive damage is treated as 0', () => {
        const e = makeEnemy();
        absorbBullet(e, { x: 50, y: 0 }, 1000);
        expect(consumeAbsorbShield(e, -5, 2000)).toBe(0);
        expect(absorbShieldRemaining(e, 2000)).toBe(6); // untouched
    });
});
