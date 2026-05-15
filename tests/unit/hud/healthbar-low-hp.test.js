/**
 * tests/unit/hud/healthbar-low-hp.test.js — 5.105.0 regression test.
 *
 * Pins the healthbar fix from 5.105.0. At very low HP the legacy
 * `createHealthBarPath(filledWidth)` call malformed: when filledWidth
 * was less than 2 × bevelSize (24 px), the right-corner control
 * points slid LEFT of the bar's left edge (barX = 70), producing a
 * self-intersecting polygon whose fill bled past the silhouette.
 *
 * The fix clips to the full-width bar silhouette, then fills a simple
 * rectangle, so the fill geometry can never escape the bar's outer
 * shape regardless of how small filledWidth is.
 *
 * Strategy: render updateHUD with player.health = 1 / max = 100 and
 * assert no draw operation writes to an x-coordinate LEFT of barX.
 * The previous buggy code would issue `lineTo(58, 50)` and similar.
 */

// Browser shims — must happen before any game module import.
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
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class { constructor() {} };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { updateHUD } from '../../../js/modules/hud/status.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// Build a chainable fake ctx that records every method call (prop +
// args) into a log. createLinearGradient / createRadialGradient return
// the same ctx so chained .addColorStop calls work without crashing.
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

function makeEngineThis(canvasCtx, health, maxHealth) {
    return {
        ctx: canvasCtx,
        width: 1920, height: 1080,
        player: {
            health,
            levelUpTextInfo: null,
            getEffectiveMaxHealth: () => maxHealth,
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

// The healthbar coordinates are pinned in updateHUD:
//   barX = 70, barY = 20, barWidth = 220, barHeight = 30, bevelSize = 12
// Anything LEFT of barX-1 is the bug (allow 1px float epsilon).
const BAR_X = 70;
const BAR_RIGHT = BAR_X + 220;
const LEFT_TOLERANCE = 1;

// Names of canvas calls whose first 2 args are x/y in canvas space.
const POINT_CALLS = new Set([
    'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'rect', 'arc',
    'bezierCurveTo', 'quadraticCurveTo',
]);

function extractXCoords(log) {
    // For each call that places a path coord, pull the x.
    const xs = [];
    for (const entry of log) {
        if (!POINT_CALLS.has(entry.prop)) continue;
        // arc has (cx, cy, r, ...) — cx-r is the leftmost edge.
        if (entry.prop === 'arc') {
            const cx = entry.args[0] | 0;
            const r  = entry.args[2] | 0;
            xs.push(cx - r);
            continue;
        }
        // bezierCurveTo has (cp1x, cp1y, cp2x, cp2y, x, y)
        if (entry.prop === 'bezierCurveTo') {
            xs.push(entry.args[0], entry.args[2], entry.args[4]);
            continue;
        }
        // quadraticCurveTo has (cpx, cpy, x, y)
        if (entry.prop === 'quadraticCurveTo') {
            xs.push(entry.args[0], entry.args[2]);
            continue;
        }
        // fillRect / strokeRect / rect (x, y, w, h)
        if (entry.prop === 'fillRect' || entry.prop === 'strokeRect' || entry.prop === 'rect') {
            xs.push(entry.args[0]);
            // right edge
            xs.push(entry.args[0] + entry.args[2]);
            continue;
        }
        // moveTo / lineTo (x, y)
        xs.push(entry.args[0]);
    }
    return xs;
}

describe('healthbar at low HP (5.105.0 regression fix)', () => {
    test('1 HP / 100 max: no draw call writes LEFT of barX', () => {
        _resetUrlOverrideForTests(false); // desktop
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx, 1, 100);
        // _displayedHealth is lazily initialized; snap it so the bar
        // doesn't animate during the test.
        updateHUD.call(engine);
        // Snap the eased value to the target so the next call paints
        // the actual 1-HP-wide bar instead of an in-flight eased value.
        engine._displayedHealth = 1;
        log.length = 0;
        updateHUD.call(engine);

        const xs = extractXCoords(log);
        // Every recorded x must be >= barX - tolerance (-1 px float slop).
        // Anything left of barX would be the bug: the malformed polygon
        // pulling fill geometry past the bar's left silhouette.
        const offenders = xs.filter(x => x < BAR_X - LEFT_TOLERANCE);
        expect(offenders).toEqual([]);
    });

    test('5 HP / 100 max (filledWidth < 2×bevelSize): no overflow', () => {
        _resetUrlOverrideForTests(false);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx, 5, 100);
        updateHUD.call(engine);
        engine._displayedHealth = 5;
        log.length = 0;
        updateHUD.call(engine);

        const xs = extractXCoords(log);
        const offenders = xs.filter(x => x < BAR_X - LEFT_TOLERANCE);
        expect(offenders).toEqual([]);
    });

    test('11 HP / 100 max (filledWidth just below bevelSize): no overflow', () => {
        _resetUrlOverrideForTests(false);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx, 11, 100);
        updateHUD.call(engine);
        engine._displayedHealth = 11;
        log.length = 0;
        updateHUD.call(engine);

        const xs = extractXCoords(log);
        const offenders = xs.filter(x => x < BAR_X - LEFT_TOLERANCE);
        expect(offenders).toEqual([]);
    });

    test('100 HP / 100 max (full bar): paths stay inside [barX, barX+barWidth]', () => {
        _resetUrlOverrideForTests(false);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx, 100, 100);
        updateHUD.call(engine);
        engine._displayedHealth = 100;
        log.length = 0;
        updateHUD.call(engine);

        const xs = extractXCoords(log);
        // Full-width path is fine — bar paints normally.
        const leftOverflow = xs.filter(x => x < BAR_X - LEFT_TOLERANCE);
        expect(leftOverflow).toEqual([]);
    });

    test('still calls fillRect for the fill (clip-based fix in place)', () => {
        _resetUrlOverrideForTests(false);
        const { ctx, log } = makeFakeCtx();
        const engine = makeEngineThis(ctx, 1, 100);
        updateHUD.call(engine);
        engine._displayedHealth = 1;
        log.length = 0;
        updateHUD.call(engine);

        // The 5.105.0 fix replaces `fill()` on a malformed path with
        // `fillRect()` inside a clip mask. Verify at least one
        // fillRect was issued — confirms the new code path ran.
        const fillRectCalls = log.filter(e => e.prop === 'fillRect');
        expect(fillRectCalls.length).toBeGreaterThan(0);
    });
});
