// Unit tests for `drawRemoteShip` in `js/modules/player/renderer.js`.
//
// `drawRemoteShip` is the minimal silhouette renderer for multiplayer peer
// ships in MVD scope. Unlike the local-player `draw()`, it intentionally
// strips every local feedback signal (thrust glow, shield shimmer, muzzle
// flash, hit flash) — those are MY-ship status cues and rendering them
// for a peer would misrepresent the simulation state.
//
// We test it with a minimal fake `ctx` that records every method invocation.
// The assertions are over the call SHAPE (presence of save/restore, that
// translate/rotate are called with the right args) rather than the exact
// pixel pattern — that's brittle and not what we care about for MVD.

import { describe, test, expect, jest } from '@jest/globals';
import { drawRemoteShip } from '../../../js/modules/player/renderer.js';

/**
 * Build a fake Canvas2D ctx that records every method call. The recorded
 * call log lets tests assert structural invariants (save/restore are
 * paired, translate+rotate happened before any draw, etc.) without
 * pulling in jsdom or a real Canvas.
 */
function makeFakeCtx() {
    const calls = [];
    const handler = {
        get(_target, prop) {
            // Properties (state) — return a sentinel value writable.
            if (prop === '__calls') return calls;
            // For setters (fillStyle, strokeStyle, …) we record + ignore.
            // Methods get a jest.fn that records the call.
            return (...args) => {
                calls.push({ method: prop, args });
            };
        },
        set(_target, prop, value) {
            calls.push({ method: `set:${prop}`, value });
            return true;
        },
    };
    return new Proxy({}, handler);
}

describe('drawRemoteShip — minimal silhouette renderer for MP peers', () => {
    test('translates + rotates to the supplied (x, y, angle)', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, 100, 200, 0.5, 14);

        const calls = ctx.__calls;
        const translate = calls.find(c => c.method === 'translate');
        const rotate = calls.find(c => c.method === 'rotate');
        expect(translate).toBeDefined();
        expect(translate.args).toEqual([100, 200]);
        // Local-ship convention: rotate(angle + PI/2) so the art "up"
        // axis aligns with the simulation aim direction.
        expect(rotate).toBeDefined();
        expect(rotate.args[0]).toBeCloseTo(0.5 + Math.PI / 2, 6);
    });

    test('balances save() + restore()', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, 0, 0, 0, 12);
        const calls = ctx.__calls;
        const saves = calls.filter(c => c.method === 'save').length;
        const restores = calls.filter(c => c.method === 'restore').length;
        // Each save() must have a matching restore().
        expect(saves).toBeGreaterThan(0);
        expect(saves).toBe(restores);
    });

    test('emits at least one fill + stroke path for the hull', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, 50, 50, 0, 12);
        const calls = ctx.__calls;
        const fillCount = calls.filter(c => c.method === 'fill').length;
        const strokeCount = calls.filter(c => c.method === 'stroke').length;
        // Multiple fills (wings + hull + cockpit) and multiple strokes
        // (silhouette + colored outlines + cockpit). The exact count
        // is implementation-defined; we just pin that drawing happened.
        expect(fillCount).toBeGreaterThan(0);
        expect(strokeCount).toBeGreaterThan(0);
    });

    test('uses radius parameter for ship scale (verify via path calls scale with r)', () => {
        const ctxSmall = makeFakeCtx();
        const ctxLarge = makeFakeCtx();
        drawRemoteShip(ctxSmall, 0, 0, 0, 8);
        drawRemoteShip(ctxLarge, 0, 0, 0, 32);

        // Find a `moveTo` or `lineTo` call and ensure the coordinates
        // scale with the radius. The hull's first vertex is `moveTo(0, -r)`.
        const findFirstMoveTo = (calls) =>
            calls.find(c => c.method === 'moveTo' && c.args[0] === 0 && c.args[1] < 0);
        const smallMv = findFirstMoveTo(ctxSmall.__calls);
        const largeMv = findFirstMoveTo(ctxLarge.__calls);
        expect(smallMv).toBeDefined();
        expect(largeMv).toBeDefined();
        // The nose-tip y-coordinate should be -8 for radius=8 and -32 for radius=32.
        expect(smallMv.args[1]).toBe(-8);
        expect(largeMv.args[1]).toBe(-32);
    });

    test('uses default radius (12) when none provided', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, 0, 0, 0);
        // The first nose-tip moveTo should be (0, -12).
        const mv = ctx.__calls.find(c =>
            c.method === 'moveTo' && c.args[0] === 0 && c.args[1] === -12,
        );
        expect(mv).toBeDefined();
    });

    test('silently no-ops on null/undefined ctx', () => {
        // Defensive: never throw if the renderer hands us a bad ctx.
        expect(() => drawRemoteShip(null, 0, 0, 0, 12)).not.toThrow();
        expect(() => drawRemoteShip(undefined, 0, 0, 0, 12)).not.toThrow();
    });

    test('silently no-ops on non-finite coords (defensive guard)', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, Number.NaN, 0, 0, 12);
        drawRemoteShip(ctx, 0, Infinity, 0, 12);
        drawRemoteShip(ctx, 0, 0, Number.NaN, 12);
        // No draw calls — the function bailed before doing anything.
        const hasDrawCall = ctx.__calls.some(c =>
            c.method === 'translate' || c.method === 'rotate' ||
            c.method === 'fill' || c.method === 'stroke',
        );
        expect(hasDrawCall).toBe(false);
    });

    test('does NOT trigger thrust / shield / muzzle FX (those are local-only signals)', () => {
        const ctx = makeFakeCtx();
        drawRemoteShip(ctx, 0, 0, 0, 12);
        // Local player.draw uses `globalCompositeOperation = 'lighter'`
        // for thrust glow, and `shadowBlur` for hull glow. The remote
        // ship draw must NOT use those — they're feedback for the local
        // player's own ship and would misread on a peer.
        const setLighter = ctx.__calls.find(
            c => c.method === 'set:globalCompositeOperation' && c.value === 'lighter',
        );
        const setShadowBlur = ctx.__calls.find(c => c.method === 'set:shadowBlur');
        expect(setLighter).toBeUndefined();
        expect(setShadowBlur).toBeUndefined();
    });
});
