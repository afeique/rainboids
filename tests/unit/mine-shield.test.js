/**
 * tests/unit/mine-shield.test.js — Phase 5 mine defensive plasma shield.
 *
 * Verifies the `getMineShieldMultiplier(player, enemyBulletPool)` helper
 * in `js/modules/combat/combat-manager.js`:
 *   • returns 1.0 (no reduction) when no mines exist
 *   • returns 1.0 when the player is outside every mine's shield zone
 *   • returns 0.6 when the player is inside one mine's zone
 *   • returns 0.6 (NOT 0.36) when inside two zones — no stacking
 *   • ignores pre-armed mines that are still in their settling window
 */

// ---------------------------------------------------------------------------
// Browser shims — combat-manager.js imports a bunch of modules that touch
// `window`, `document`, and `navigator` at module-load time, so set those up
// before importing anything from the game code.
// ---------------------------------------------------------------------------
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        performance: { now: () => Date.now() },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({
            getContext: () => ({}), style: {},
            addEventListener: () => {}, removeEventListener: () => {},
        }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, removeEventListener: () => {},
        body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, userAgent: 'node' };
}
if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() };
}

import { getMineShieldMultiplier, isPlayerInMineShield } from '../../js/modules/combat/combat-manager.js';

// ---------------------------------------------------------------------------
// Minimal test fixtures — the helper only reads .x/.y on the player and
// iterates pool.activeObjects looking for { active, shape, armed,
// shieldRadius, x, y }. No need to spin up the real pool/bullet classes.
// ---------------------------------------------------------------------------

function makePool(items) {
    return { activeObjects: items };
}

function makeMine(x, y, opts = {}) {
    return {
        active: true,
        shape: 'mine',
        armed: true,
        shieldRadius: 120,
        x, y,
        ...opts,
    };
}

function makePlayer(x, y) {
    return { x, y };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMineShieldMultiplier — Phase 5 plasma shield zone', () => {
    test('returns 1.0 when no mines exist (empty pool)', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('returns 1.0 when pool is missing / null', () => {
        const player = makePlayer(0, 0);
        expect(getMineShieldMultiplier(player, null)).toBe(1.0);
        expect(getMineShieldMultiplier(player, undefined)).toBe(1.0);
    });

    test('returns 1.0 when player is outside all mine zones', () => {
        const player = makePlayer(0, 0);
        // Mine at (500,500) — distance ~707px, way outside the 120px radius
        const pool = makePool([makeMine(500, 500)]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('returns 0.6 when player is inside one mine\'s zone', () => {
        const player = makePlayer(50, 50);
        // Mine at (100,100) — distance ~70.7px, well within 120px radius
        const pool = makePool([makeMine(100, 100)]);
        expect(getMineShieldMultiplier(player, pool)).toBe(0.6);
    });

    test('returns 0.6 (not 0.36) when player is inside two zones — no stacking', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([
            makeMine(50, 0),   // 50px away — inside
            makeMine(0, 80),   // 80px away — inside
        ]);
        const mult = getMineShieldMultiplier(player, pool);
        expect(mult).toBe(0.6);
        expect(mult).not.toBeCloseTo(0.36); // 0.6 * 0.6 = 0.36 would be the stacked value
    });

    test('pre-armed mines (armed=false) are excluded', () => {
        const player = makePlayer(50, 50);
        const pool = makePool([
            makeMine(100, 100, { armed: false }), // would be inside, but not yet armed
        ]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('mixed pool: only armed mines inside zone count', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([
            makeMine(50, 0, { armed: false }),   // close but disarmed → ignored
            makeMine(80, 0, { armed: true }),    // close and armed → triggers reduction
            makeMine(500, 500, { armed: true }), // far → no contribution
        ]);
        expect(getMineShieldMultiplier(player, pool)).toBe(0.6);
    });

    test('inactive mines (active=false) are excluded', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([
            makeMine(50, 0, { active: false }), // dead, inside zone but skipped
        ]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('non-mine bullets are excluded (shape != "mine")', () => {
        const player = makePlayer(0, 0);
        // Regular enemy bullet right on top of the player — no shield contribution
        const pool = makePool([{
            active: true, shape: 'triangle', armed: true,
            shieldRadius: 120, x: 0, y: 0,
        }]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('mine exactly at zone boundary (distance == shieldRadius) counts', () => {
        const player = makePlayer(0, 0);
        // Mine at (120, 0) — distance 120 == shieldRadius 120
        // Comparison is `<=` so this should be inside.
        const pool = makePool([makeMine(120, 0)]);
        expect(getMineShieldMultiplier(player, pool)).toBe(0.6);
    });

    test('mine just outside boundary does not count', () => {
        const player = makePlayer(0, 0);
        // Mine at (121, 0) — distance 121 > shieldRadius 120
        const pool = makePool([makeMine(121, 0)]);
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });

    test('honors per-mine shieldRadius override (e.g. larger zone)', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([makeMine(150, 0, { shieldRadius: 200 })]);
        expect(getMineShieldMultiplier(player, pool)).toBe(0.6);
    });

    test('shieldRadius == 0 disables the zone for that mine', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([makeMine(0, 0, { shieldRadius: 0 })]);
        // Player is literally on top of the mine but radius=0 means no zone.
        expect(getMineShieldMultiplier(player, pool)).toBe(1.0);
    });
});

describe('isPlayerInMineShield — convenience wrapper', () => {
    test('returns true when inside an armed zone', () => {
        const player = makePlayer(50, 50);
        const pool = makePool([makeMine(100, 100)]);
        expect(isPlayerInMineShield(player, pool)).toBe(true);
    });

    test('returns false when outside any zone', () => {
        const player = makePlayer(0, 0);
        const pool = makePool([makeMine(500, 500)]);
        expect(isPlayerInMineShield(player, pool)).toBe(false);
    });

    test('returns false when no mines exist', () => {
        expect(isPlayerInMineShield(makePlayer(0, 0), makePool([]))).toBe(false);
    });
});
