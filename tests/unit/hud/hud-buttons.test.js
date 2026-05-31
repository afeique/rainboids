/**
 * tests/unit/hud/hud-buttons.test.js — 5.94.0
 *
 * Pins the layout invariants for the canvas HUD buttons. The 5.94.0
 * tower-defense pivot adds two new buttons (PRM / PWR) when running in
 * mobile mode; they sit on the left/right side margins of the canvas,
 * vertically centred, and are square (60×60 min touch target). On
 * desktop only the SHOP / STATS / PAUSE bottom-bar buttons appear.
 *
 * Tests:
 *  1. Desktop: 3 buttons (SHOP / STATS / PAUSE), no side buttons.
 *  2. Mobile:  5 buttons total (above + PRM + PWR).
 *  3. PRM sits on the left side, PWR on the right side.
 *  4. Side buttons meet the 60-px touch-target minimum.
 *  5. hudButtonHitTest correctly returns the PRM button id from a
 *     synthetic engine rect map.
 */

// Browser shims — getHudButtonRects is pure, hudButtonHitTest needs
// nothing from window, but the imports may transitively touch DOM-ish
// globals via icons.js.
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
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { maxTouchPoints: 0 };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { getHudButtonRects, hudButtonHitTest } from '../../../js/modules/hud/hud-buttons.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

describe('getHudButtonRects — desktop mode (5.94.0)', () => {
    test('returns only the PAUSE bottom-bar button on desktop (SHOP + STATS retired)', () => {
        _resetUrlOverrideForTests(false);
        const rects = getHudButtonRects(1280, 720);
        const keys = Object.keys(rects).sort();
        expect(keys).toEqual(['pause']); // 9.0.0 — STATS removed with the SP overlay
        expect(rects.shop).toBeUndefined(); // legacy gold shop commented out
        expect(rects.stats).toBeUndefined();
    });

    test('desktop: no PRM/PWR side buttons present', () => {
        _resetUrlOverrideForTests(false);
        const rects = getHudButtonRects(1280, 720);
        expect(rects.prm).toBeUndefined();
        expect(rects.pwr).toBeUndefined();
    });
});

describe('getHudButtonRects — mobile mode (5.100.0)', () => {
    test('mobile mode returns only PAUSE (SHOP + STATS retired; PRM/PWR removed in 5.100.0)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        const keys = Object.keys(rects).sort();
        expect(keys).toEqual(['pause']); // 9.0.0 — STATS removed with the SP overlay
    });

    test('mobile: PRM and PWR rects do not exist (weapon swap moved to pause menu in 5.100.0)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        expect(rects.prm).toBeUndefined();
        expect(rects.pwr).toBeUndefined();
    });
});

describe('hudButtonHitTest — mobile mode (5.100.0)', () => {
    test('returns null when point lands in open canvas (no button)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        const engine = { _hudButtonRects: rects };
        expect(hudButtonHitTest(engine, 200, 100)).toBe(null);
    });

    test('returns "pause" when point falls inside the PAUSE rect', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        const cx = rects.pause.x + rects.pause.w / 2;
        const cy = rects.pause.y + rects.pause.h / 2;
        const engine = { _hudButtonRects: rects };
        expect(hudButtonHitTest(engine, cx, cy)).toBe('pause');
    });
});
