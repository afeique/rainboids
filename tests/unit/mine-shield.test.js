/**
 * tests/unit/mine-shield.test.js — Player-mine plasma shield (6.23.0).
 *
 * Verifies the `getMineShieldMultiplier(player)` helper in
 * `js/modules/combat/combat-manager.js`. The mechanic moved from ENEMY
 * mines (Phase 5) to PLAYER mines + the MINE_SHIELD_RADIUS upgrade in
 * 6.23.0. The helper now reads from `player.activeMines` rather than an
 * enemy bullet pool.
 *
 *   • returns 1.0 (no reduction) when player has no active mines
 *   • returns 1.0 when player has mines but none are armed-with-shield
 *   • returns 1.0 when the player is outside every armed mine's zone
 *   • returns 0.6 when the player is inside one armed mine's zone
 *   • returns 0.6 (NOT 0.36) when inside two zones — no stacking
 *   • ignores pre-armed mines (armed=false)
 *   • ignores mines with shieldRadius=0 (player has no MINE_SHIELD_RADIUS)
 *   • inactive mines are skipped
 *   • `getActivePlayerMineShield` returns the specific mine for FX use
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

import {
    getMineShieldMultiplier,
    isPlayerInMineShield,
    getActivePlayerMineShield,
} from '../../js/modules/combat/combat-manager.js';

// ---------------------------------------------------------------------------
// Minimal test fixtures — the helper only reads .x/.y on the player and
// iterates player.activeMines looking for { active, armed, shieldRadius,
// x, y }. No need to spin up the real player/skills systems.
// ---------------------------------------------------------------------------

function makeMine(x, y, opts = {}) {
    return {
        active: true,
        armed: true,
        shieldRadius: 120,
        x, y,
        ...opts,
    };
}

function makePlayer(x, y, mines = []) {
    return { x, y, activeMines: mines };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMineShieldMultiplier — player-mine plasma shield (6.23.0)', () => {
    test('returns 1.0 when player has no mines (empty array)', () => {
        const player = makePlayer(0, 0, []);
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('returns 1.0 when player has no activeMines field', () => {
        expect(getMineShieldMultiplier({ x: 0, y: 0 })).toBe(1.0);
    });

    test('returns 1.0 when player is null/undefined', () => {
        expect(getMineShieldMultiplier(null)).toBe(1.0);
        expect(getMineShieldMultiplier(undefined)).toBe(1.0);
    });

    test('returns 1.0 when player is outside all mine zones', () => {
        // Mine at (500,500) — distance ~707px, way outside the 120px radius
        const player = makePlayer(0, 0, [makeMine(500, 500)]);
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('returns 0.6 when player is inside one mine\'s zone', () => {
        // Mine at (100,100) — distance ~70.7px, well within 120px radius
        const player = makePlayer(50, 50, [makeMine(100, 100)]);
        expect(getMineShieldMultiplier(player)).toBe(0.6);
    });

    test('returns 0.6 (not 0.36) when player is inside two zones — no stacking', () => {
        const player = makePlayer(0, 0, [
            makeMine(50, 0),   // 50px away — inside
            makeMine(0, 80),   // 80px away — inside
        ]);
        const mult = getMineShieldMultiplier(player);
        expect(mult).toBe(0.6);
        expect(mult).not.toBeCloseTo(0.36); // 0.6 * 0.6 = 0.36 would be the stacked value
    });

    test('pre-armed mines (armed=false) are excluded', () => {
        const player = makePlayer(50, 50, [
            makeMine(100, 100, { armed: false }), // would be inside, but not yet armed
        ]);
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('mixed pool: only armed mines inside zone count', () => {
        const player = makePlayer(0, 0, [
            makeMine(50, 0, { armed: false }),   // close but disarmed → ignored
            makeMine(80, 0, { armed: true }),    // close and armed → triggers reduction
            makeMine(500, 500, { armed: true }), // far → no contribution
        ]);
        expect(getMineShieldMultiplier(player)).toBe(0.6);
    });

    test('inactive mines (active=false) are excluded', () => {
        const player = makePlayer(0, 0, [
            makeMine(50, 0, { active: false }), // dead, inside zone but skipped
        ]);
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('mine exactly at zone boundary (distance == shieldRadius) counts', () => {
        // Mine at (120, 0) — distance 120 == shieldRadius 120
        // Comparison is `<=` so this should be inside.
        const player = makePlayer(0, 0, [makeMine(120, 0)]);
        expect(getMineShieldMultiplier(player)).toBe(0.6);
    });

    test('mine just outside boundary does not count', () => {
        // Mine at (121, 0) — distance 121 > shieldRadius 120
        const player = makePlayer(0, 0, [makeMine(121, 0)]);
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('honors per-mine shieldRadius override (e.g. larger zone)', () => {
        // 120 base + 50 per stack — 3 stacks = 270 px
        const player = makePlayer(0, 0, [makeMine(150, 0, { shieldRadius: 270 })]);
        expect(getMineShieldMultiplier(player)).toBe(0.6);
    });

    test('shieldRadius == 0 disables the zone (no MINE_SHIELD_RADIUS stacks)', () => {
        const player = makePlayer(0, 0, [makeMine(0, 0, { shieldRadius: 0 })]);
        // Player is literally on top of the mine but radius=0 means
        // the player doesn't own MINE_SHIELD_RADIUS, so no zone.
        expect(getMineShieldMultiplier(player)).toBe(1.0);
    });

    test('legacy second argument is ignored (back-compat)', () => {
        // The old signature was getMineShieldMultiplier(player, enemyBulletPool).
        // We keep the second parameter for back-compat but ignore it.
        const player = makePlayer(50, 50, [makeMine(100, 100)]);
        expect(getMineShieldMultiplier(player, null)).toBe(0.6);
        expect(getMineShieldMultiplier(player, { activeObjects: [] })).toBe(0.6);
    });
});

describe('isPlayerInMineShield — convenience wrapper', () => {
    test('returns true when inside an armed zone', () => {
        const player = makePlayer(50, 50, [makeMine(100, 100)]);
        expect(isPlayerInMineShield(player)).toBe(true);
    });

    test('returns false when outside any zone', () => {
        const player = makePlayer(0, 0, [makeMine(500, 500)]);
        expect(isPlayerInMineShield(player)).toBe(false);
    });

    test('returns false when no mines exist', () => {
        expect(isPlayerInMineShield(makePlayer(0, 0, []))).toBe(false);
    });
});

describe('getActivePlayerMineShield — FX source mine', () => {
    test('returns null when no shielding mine matches', () => {
        const player = makePlayer(0, 0, []);
        expect(getActivePlayerMineShield(player)).toBeNull();
    });

    test('returns the specific mine the player is standing inside', () => {
        const target = makeMine(40, 0);
        const player = makePlayer(0, 0, [makeMine(500, 0), target, makeMine(-500, 0)]);
        expect(getActivePlayerMineShield(player)).toBe(target);
    });

    test('returns the first match when player is in multiple zones', () => {
        const first = makeMine(50, 0);
        const second = makeMine(0, 50);
        const player = makePlayer(0, 0, [first, second]);
        expect(getActivePlayerMineShield(player)).toBe(first);
    });

    test('skips pre-armed and zero-radius mines', () => {
        const player = makePlayer(0, 0, [
            makeMine(0, 0, { armed: false }),
            makeMine(0, 0, { shieldRadius: 0 }),
            makeMine(50, 0),
        ]);
        const m = getActivePlayerMineShield(player);
        expect(m).not.toBeNull();
        expect(m.x).toBe(50);
    });
});
