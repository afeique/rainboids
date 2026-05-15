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
    test('returns exactly 3 bottom-bar buttons on desktop', () => {
        _resetUrlOverrideForTests(false);
        const rects = getHudButtonRects(1280, 720);
        const keys = Object.keys(rects).sort();
        expect(keys).toEqual(['pause', 'shop', 'stats']);
    });

    test('desktop: no PRM/PWR side buttons present', () => {
        _resetUrlOverrideForTests(false);
        const rects = getHudButtonRects(1280, 720);
        expect(rects.prm).toBeUndefined();
        expect(rects.pwr).toBeUndefined();
    });
});

describe('getHudButtonRects — mobile mode (5.94.0)', () => {
    test('returns 5 buttons in mobile mode (SHOP/STATS/PAUSE + PRM + PWR)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        const keys = Object.keys(rects).sort();
        expect(keys).toEqual(['pause', 'prm', 'pwr', 'shop', 'stats']);
    });

    test('PRM button sits on the LEFT side of the canvas', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        // PRM x should be near the left edge (small).
        expect(rects.prm.x).toBeLessThan(50);
    });

    test('PWR button sits on the RIGHT side of the canvas', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        // PWR x + w should be near the right edge.
        expect(rects.pwr.x + rects.pwr.w).toBeGreaterThan(350);
    });

    test('5.99.3 — PRM and PWR sit at the BOTTOM of the canvas (corners)', () => {
        _resetUrlOverrideForTests(true);
        const canvasH = 800;
        const rects = getHudButtonRects(400, canvasH);
        // Both bottom-anchored: y + h should land within ~30 px of the
        // bottom edge (accounts for BOTTOM_MARGIN). Pre-5.99.3 they sat
        // at canvasH/2; 5.99.3 moves them to bottom corners.
        expect(rects.prm.y + rects.prm.h).toBeGreaterThan(canvasH - 40);
        expect(rects.pwr.y + rects.pwr.h).toBeGreaterThan(canvasH - 40);
    });

    test('PRM and PWR meet the 60-px touch-target minimum (w and h ≥ 60)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        expect(rects.prm.w).toBeGreaterThanOrEqual(60);
        expect(rects.prm.h).toBeGreaterThanOrEqual(60);
        expect(rects.pwr.w).toBeGreaterThanOrEqual(60);
        expect(rects.pwr.h).toBeGreaterThanOrEqual(60);
    });

    test('PRM and PWR are square', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        expect(rects.prm.w).toBe(rects.prm.h);
        expect(rects.pwr.w).toBe(rects.pwr.h);
    });

    test('PRM rect.kind is "primary"; PWR rect.kind is "power"', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        expect(rects.prm.kind).toBe('primary');
        expect(rects.pwr.kind).toBe('power');
    });

    test('PRM rect.label is "PRM"; PWR rect.label is "PWR"', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        expect(rects.prm.label).toBe('PRM');
        expect(rects.pwr.label).toBe('PWR');
    });
});

describe('hudButtonHitTest — mobile mode (5.94.0)', () => {
    test('returns "prm" when point falls inside the PRM rect', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        // Hit the centre of PRM.
        const cx = rects.prm.x + rects.prm.w / 2;
        const cy = rects.prm.y + rects.prm.h / 2;
        const engine = { _hudButtonRects: rects };
        expect(hudButtonHitTest(engine, cx, cy)).toBe('prm');
    });

    test('returns "pwr" when point falls inside the PWR rect', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        const cx = rects.pwr.x + rects.pwr.w / 2;
        const cy = rects.pwr.y + rects.pwr.h / 2;
        const engine = { _hudButtonRects: rects };
        expect(hudButtonHitTest(engine, cx, cy)).toBe('pwr');
    });

    test('returns null when point lands in open canvas (no button)', () => {
        _resetUrlOverrideForTests(true);
        const rects = getHudButtonRects(400, 800);
        // Open centre of the canvas — well clear of bottom bar AND side buttons.
        const engine = { _hudButtonRects: rects };
        expect(hudButtonHitTest(engine, 200, 100)).toBe(null);
    });
});
