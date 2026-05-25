// SYS-6 / ENMY-04 — projectile reflection helper tests.
//
// Pure, engine-agnostic: a "mirror" enemy carries a `reflect` front-arc config;
// the helpers decide whether a player bullet is reflected and, if so, return the
// spec for the enemy bullet to fire back. Driven here with stub enemies + plain
// bullet objects, mirroring the projectile-absorb / support-aura helper tests.
import { describe, expect, test } from '@jest/globals';
import {
    bulletInReflectArc,
    shouldReflect,
    reflectVector,
    makeReflectedBullet,
    REFLECT_DEFAULTS,
} from '../../../../js/modules/enemy/abilities/reflect.js';

// A mirror enemy at the origin facing +x (facingRad 0), 120° arc (±60°),
// reflecting only bullets that strike within `range` (120px) of the face.
const mirror = (over = {}) => ({
    x: 0, y: 0,
    reflects: true,
    reflect: { halfAngleRad: Math.PI / 3, facingRad: 0, range: 120, speed: 7, ...over },
});

// A plain player bullet at (x,y) with an optional incoming velocity/flags.
const bullet = (over = {}) => ({
    x: 100, y: 0, vx: -5, vy: 0, angle: Math.PI, damage: 12, element: 'fire', ...over,
});

describe('REFLECT_DEFAULTS', () => {
    test('exposes a sane front arc + speed', () => {
        expect(REFLECT_DEFAULTS.halfAngleRad).toBeGreaterThan(0);
        expect(REFLECT_DEFAULTS.halfAngleRad).toBeLessThanOrEqual(Math.PI);
        expect(REFLECT_DEFAULTS.speed).toBeGreaterThan(0);
    });

    test('exposes a finite reflect range so distant bullets are NOT reflected (audit H1)', () => {
        expect(typeof REFLECT_DEFAULTS.range).toBe('number');
        expect(REFLECT_DEFAULTS.range).toBeGreaterThan(0);
        expect(Number.isFinite(REFLECT_DEFAULTS.range)).toBe(true);
    });
});

describe('bulletInReflectArc', () => {
    test('bullet straight ahead is in the front arc', () => {
        expect(bulletInReflectArc(mirror(), bullet({ x: 100, y: 0 }))).toBe(true);
    });

    test('bullet just inside the arc edge (±60°) is in-arc', () => {
        // 59° off the +x facing
        const a = (59 * Math.PI) / 180;
        const b = bullet({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
        expect(bulletInReflectArc(mirror(), b)).toBe(true);
    });

    test('bullet just outside the arc edge is out-of-arc', () => {
        const a = (61 * Math.PI) / 180;
        const b = bullet({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
        expect(bulletInReflectArc(mirror(), b)).toBe(false);
    });

    test('bullet directly behind the mirror is out-of-arc', () => {
        expect(bulletInReflectArc(mirror(), bullet({ x: -100, y: 0 }))).toBe(false);
    });

    test('handles wraparound when the mirror faces near ±π', () => {
        // Mirror faces -x (π). A bullet at -x (also ≈π via atan2 → π) is in-arc.
        const m = mirror({ facingRad: Math.PI });
        expect(bulletInReflectArc(m, bullet({ x: -100, y: 0 }))).toBe(true);
        // A bullet slightly across the seam (atan2 → -π+small) must still test as
        // in-arc when within the half-angle of facing π.
        const a = Math.PI - 0.05; // ~177°, just inside ±60° of π
        const m2 = mirror({ facingRad: Math.PI });
        const b = bullet({ x: Math.cos(-a) * 100, y: Math.sin(-a) * 100 });
        expect(bulletInReflectArc(m2, b)).toBe(true);
        // And a bullet at +x (atan2 → 0) is the opposite direction → out-of-arc.
        expect(bulletInReflectArc(m2, bullet({ x: 100, y: 0 }))).toBe(false);
    });

    test('bullet exactly on the enemy counts as in-arc (degenerate)', () => {
        expect(bulletInReflectArc(mirror(), bullet({ x: 0, y: 0 }))).toBe(true);
    });

    // --- range gate (audit H1): only bullets that STRIKE the face reflect ---

    test('in-arc bullet WITHIN range is in-arc', () => {
        // Straight ahead at distance 100 < range 120 → strikes the face.
        expect(bulletInReflectArc(mirror(), bullet({ x: 100, y: 0 }))).toBe(true);
    });

    test('in-arc bullet BEYOND range is NOT in-arc (no field-wide reflect)', () => {
        // Straight ahead but at distance 500 ≫ range 120 → not striking → false,
        // even though the angle is dead-center in the front arc.
        expect(bulletInReflectArc(mirror(), bullet({ x: 500, y: 0 }))).toBe(false);
    });

    test('range boundary: just inside reflects, just outside does not', () => {
        const m = mirror({ range: 100 });
        // 99px straight ahead → inside the 100px range.
        expect(bulletInReflectArc(m, bullet({ x: 99, y: 0 }))).toBe(true);
        // 101px straight ahead → outside the 100px range.
        expect(bulletInReflectArc(m, bullet({ x: 101, y: 0 }))).toBe(false);
    });

    test('bullet exactly at range (dist == range) is in-arc (only > range fails)', () => {
        const m = mirror({ range: 100 });
        expect(bulletInReflectArc(m, bullet({ x: 100, y: 0 }))).toBe(true);
    });

    test('false when enemy has no reflect config', () => {
        expect(bulletInReflectArc({ x: 0, y: 0 }, bullet())).toBe(false);
    });

    test('false on null inputs', () => {
        expect(bulletInReflectArc(null, bullet())).toBe(false);
        expect(bulletInReflectArc(mirror(), null)).toBe(false);
    });
});

describe('shouldReflect — gating', () => {
    test('normal in-arc bullet reflects', () => {
        expect(shouldReflect(mirror(), bullet())).toBe(true);
    });

    test('false when enemy does not reflect', () => {
        const m = mirror(); m.reflects = false;
        expect(shouldReflect(m, bullet())).toBe(false);
    });

    test('false when enemy has no reflect config', () => {
        expect(shouldReflect({ reflects: true, x: 0, y: 0 }, bullet())).toBe(false);
    });

    test('beams bypass the mirror', () => {
        expect(shouldReflect(mirror(), bullet({ isBeam: true }))).toBe(false);
    });

    test('melee bypasses the mirror', () => {
        expect(shouldReflect(mirror(), bullet({ isMelee: true }))).toBe(false);
    });

    test('already-reflected bullets are not reflected again (no ping-pong)', () => {
        expect(shouldReflect(mirror(), bullet({ reflected: true }))).toBe(false);
    });

    test('bypassReflect flag opts a bullet out', () => {
        expect(shouldReflect(mirror(), bullet({ bypassReflect: true }))).toBe(false);
    });

    test('false when the in-arc gate fails (bullet behind)', () => {
        expect(shouldReflect(mirror(), bullet({ x: -100, y: 0 }))).toBe(false);
    });

    test('false when in-arc but beyond range (does not reflect across the field)', () => {
        // Dead-center in the front arc but far outside the reflect range → the
        // range gate fails, so the mirror does NOT bounce it (audit H1).
        expect(shouldReflect(mirror(), bullet({ x: 500, y: 0 }))).toBe(false);
    });

    test('true when in-arc AND within range (a bullet that actually strikes)', () => {
        expect(shouldReflect(mirror(), bullet({ x: 100, y: 0 }))).toBe(true);
    });

    test('false on null inputs', () => {
        expect(shouldReflect(null, bullet())).toBe(false);
        expect(shouldReflect(mirror(), null)).toBe(false);
    });
});

describe('reflectVector', () => {
    test('magnitude equals reflect.speed', () => {
        const v = reflectVector(mirror(), bullet({ x: 100, y: 0 }));
        expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(7, 6);
    });

    test('sends the bullet back out along enemy→bullet (toward where it came)', () => {
        // Bullet at +x came in heading -x; reflected vector should head +x (back
        // out the way it came), i.e. positive vx.
        const v = reflectVector(mirror(), bullet({ x: 100, y: 0 }));
        expect(v.vx).toBeGreaterThan(0);
        expect(v.vy).toBeCloseTo(0, 6);
        expect(v.angle).toBeCloseTo(0, 6);
    });

    test('reflected direction matches the enemy→bullet angle (off-axis)', () => {
        const b = bullet({ x: 0, y: 100 }); // bullet above the mirror
        const v = reflectVector(mirror(), b);
        expect(v.angle).toBeCloseTo(Math.PI / 2, 6); // straight up
        expect(v.vy).toBeGreaterThan(0);
        expect(v.vx).toBeCloseTo(0, 6);
    });

    test('uses REFLECT_DEFAULTS speed when enemy lacks a reflect config', () => {
        const v = reflectVector({ x: 0, y: 0 }, bullet({ x: 100, y: 0 }));
        expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(REFLECT_DEFAULTS.speed, 6);
    });

    test('degenerate: bullet on top of enemy bounces straight back along its heading', () => {
        const v = reflectVector(mirror(), bullet({ x: 0, y: 0, angle: 0 }));
        // angle 0 incoming → bounced to angle π → negative vx
        expect(v.vx).toBeLessThan(0);
        expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(7, 6);
    });
});

describe('makeReflectedBullet', () => {
    test('carries over damage + element and flags reflected:true', () => {
        const spec = makeReflectedBullet(mirror(), bullet({ damage: 25, element: 'ice' }));
        expect(spec.damage).toBe(25);
        expect(spec.element).toBe('ice');
        expect(spec.reflected).toBe(true);
    });

    test('vx/vy/angle match reflectVector exactly', () => {
        const m = mirror();
        const b = bullet({ x: 80, y: 60 });
        const v = reflectVector(m, b);
        const spec = makeReflectedBullet(m, b);
        expect(spec.vx).toBeCloseTo(v.vx, 9);
        expect(spec.vy).toBeCloseTo(v.vy, 9);
        expect(spec.angle).toBeCloseTo(v.angle, 9);
        expect(spec.speed).toBe(m.reflect.speed);
    });

    test('positions the reflected bullet at the enemy mirror face', () => {
        const m = mirror({}); m.x = 42; m.y = -17;
        const spec = makeReflectedBullet(m, bullet());
        expect(spec.x).toBe(42);
        expect(spec.y).toBe(-17);
    });

    test('falls back to enemy reflect.damage when the bullet has none', () => {
        const m = mirror({ damage: 9 });
        const b = bullet(); delete b.damage;
        const spec = makeReflectedBullet(m, b);
        expect(spec.damage).toBe(9);
    });

    test('damage defaults to 0 when neither bullet nor config provides it', () => {
        const m = mirror();
        const b = bullet(); delete b.damage;
        const spec = makeReflectedBullet(m, b);
        expect(spec.damage).toBe(0);
    });
});
