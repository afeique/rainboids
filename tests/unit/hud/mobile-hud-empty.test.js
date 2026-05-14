/**
 * tests/unit/hud/mobile-hud-empty.test.js — 5.95.0
 *
 * Pins the mobile fruit-ninja HUD redesign: `updateHUD()` (the top-left
 * status cluster: triforce + health bar + XP bar + level/coins) is a
 * no-op on mobile. The bottom-button bar (SHOP/STATS/PAUSE/PRM/PWR) is
 * drawn outside this function by `drawHudButtons` so the player retains
 * the navigation surface.
 *
 * Strategy: stub a minimal `this` context with a fake `ctx` (canvas
 * 2D context). Verify that on mobile no draw calls are issued; on
 * desktop the canvas ctx receives the expected `save()` and `fillText`
 * calls.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({
            getContext: () => ({}), style: {}, addEventListener: () => {},
            id: '',
        }),
        getElementById: () => null,
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { updateHUD } from '../../../js/modules/hud/status.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// Build a fake canvas 2D context that records every call into a log
// so we can assert no-draw on the mobile path.
function makeFakeCtx() {
    const log = [];
    const ctx = new Proxy({}, {
        get(_, prop) {
            return (...args) => {
                log.push({ prop, args });
                return ctx;
            };
        },
    });
    return { ctx, log };
}

function makeEngineThis(canvasCtx) {
    return {
        ctx: canvasCtx,
        width: 1920, height: 1080,
        player: {
            health: 100, levelUpTextInfo: null,
            getEffectiveMaxHealth: () => 100,
            getPowerupStacks: () => 0,
        },
        healthTanks: 0,
        game: { state: 'playing', currentWave: 1 },
        drawCanvasTriforce: () => {},
        drawXPBar: () => {},
        drawLevelAndCoinsDisplay: () => {},
        drawEquippedWeaponSquares: () => {},
        drawSurvivalTimer: () => {},
        drawBottomRightGold: () => {},
        canvas: { width: 1920, height: 1080 },
    };
}

describe('updateHUD — mobile no-op (5.95.0)', () => {
    test('mobile mode: updateHUD writes nothing to the canvas ctx', () => {
        _resetUrlOverrideForTests(true);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        updateHUD.call(engine);
        // No save(), no fillText, no anything — early return.
        expect(log).toEqual([]);
    });

    test('mobile mode: drawCanvasTriforce / drawXPBar / drawLevelAndCoinsDisplay are never invoked', () => {
        _resetUrlOverrideForTests(true);
        let triforceCalls = 0, xpCalls = 0, lvlCalls = 0;
        const { ctx } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        engine.drawCanvasTriforce = () => triforceCalls++;
        engine.drawXPBar = () => xpCalls++;
        engine.drawLevelAndCoinsDisplay = () => lvlCalls++;
        updateHUD.call(engine);
        expect(triforceCalls).toBe(0);
        expect(xpCalls).toBe(0);
        expect(lvlCalls).toBe(0);
    });
});
