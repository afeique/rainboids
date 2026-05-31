/**
 * tests/unit/hud/mobile-hud-empty.test.js — 5.96.0
 *
 * Pins the post-5.96.0 mobile HUD contract:
 *   - `updateHUD()` is NOT a no-op on mobile anymore. The 5.95.0 early-
 *     return that dropped the entire top-left status cluster (triforce
 *     + healthbar + XP) has been reverted because mobile is an RPG
 *     where HP / spare tanks / XP must remain visible.
 *   - The 5.92.0 mobile-simplified branch still hides loadout squares,
 *     gold readout, and the survival timer — those are nice-to-have,
 *     not essential. That branch is verified in a separate test (or
 *     manually) because it lives further down `updateHUD()`.
 *
 * History:
 *   - 5.92.0: hide loadout/gold/timer on mobile (`mobileSimplified`).
 *   - 5.95.0: hide entire top-left cluster on mobile (early return).
 *   - 5.96.0: revert the early return. Top-left cluster comes back.
 *
 * Strategy: stub a minimal `this` context with a fake `ctx` (canvas
 * 2D context). Verify that on mobile draw calls ARE issued (the
 * top-left status cluster renders); on desktop the same calls
 * happen.
 */

// Browser shims — must happen before any game module import.
// `createElement('canvas')` returns a richer stub: the icon sprite cache
// inside `updateHUD` calls `canvas.getContext('2d')` and drives a real
// 2D drawing path (save/scale/fillStyle/...). Return a chainable Proxy
// that swallows every call so the cache code path doesn't crash.
function _stubCanvasCtx() {
    return new Proxy({}, {
        get(_, prop) {
            if (prop === 'canvas') return { width: 0, height: 0 };
            return (...args) => undefined;
        },
    });
}

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
        createElement: (tag) => ({
            getContext: () => _stubCanvasCtx(),
            style: {}, addEventListener: () => {},
            id: '', width: 64, height: 64,
        }),
        getElementById: () => null,
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}
// Icon sprite cache uses `new Path2D(d)` to build SVG paths. Stub the
// constructor so it returns an opaque object the chainable ctx mock can
// swallow into its no-op call sink.
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class { constructor() {} };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { updateHUD } from '../../../js/modules/hud/status.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// Build a fake canvas 2D context that records every call into a log
// so we can assert the mobile path now DOES draw the top-left cluster.
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
        drawXPLevelBar: () => {},
        drawLevelAndCoinsDisplay: () => {},
        drawEquippedWeaponSquares: () => {},
        drawSurvivalTimer: () => {},
        drawBottomRightGold: () => {},
        canvas: { width: 1920, height: 1080 },
    };
}

describe('updateHUD — mobile restored (5.96.0 RPG-revert)', () => {
    test('mobile mode: updateHUD writes to the canvas ctx (top-left cluster restored)', () => {
        _resetUrlOverrideForTests(true);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        updateHUD.call(engine);
        // Top-left cluster paints — at minimum a `save()` is issued
        // by the health bar / triforce / XP draws. The 5.95.0 early-
        // return blocked all of this; 5.96.0 lets it through.
        expect(log.length).toBeGreaterThan(0);
    });

    test('mobile mode: drawCanvasTriforce + drawLevelAndCoinsDisplay ARE invoked', () => {
        _resetUrlOverrideForTests(true);
        let triforceCalls = 0, lvlCalls = 0;
        const { ctx } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        engine.drawCanvasTriforce = () => triforceCalls++;
        engine.drawLevelAndCoinsDisplay = () => lvlCalls++;
        updateHUD.call(engine);
        // Both helpers run on mobile (triforce spare-tanks + the orb row).
        // 9.x — the XP bar is gone (no leveling), so updateHUD no longer calls
        // drawXPBar; health is now a sphere drawn inline.
        expect(triforceCalls).toBe(1);
        expect(lvlCalls).toBe(1);
    });

    test('mobile mode: drawEquippedWeaponSquares is NOT invoked (mobileSimplified branch still hides it)', () => {
        _resetUrlOverrideForTests(true);
        let loadoutCalls = 0;
        const { ctx } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        engine.drawEquippedWeaponSquares = () => loadoutCalls++;
        updateHUD.call(engine);
        // 5.92.0's `mobileSimplified` gate still hides the loadout
        // squares — they're decorative on a phone-sized viewport.
        expect(loadoutCalls).toBe(0);
    });

    test('desktop mode: drawCanvasTriforce + drawLevelAndCoinsDisplay all run', () => {
        _resetUrlOverrideForTests(false);
        let triforceCalls = 0, lvlCalls = 0;
        const { ctx } = makeFakeCtx();
        const engine = makeEngineThis(ctx);
        engine.drawCanvasTriforce = () => triforceCalls++;
        engine.drawLevelAndCoinsDisplay = () => lvlCalls++;
        updateHUD.call(engine);
        expect(triforceCalls).toBe(1);
        expect(lvlCalls).toBe(1);
    });
});
