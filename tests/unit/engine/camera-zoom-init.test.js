/**
 * tests/unit/engine/camera-zoom-init.test.js — 5.96.0
 *
 * Pins the engine's `_refreshCameraZoom()` formula that sets
 * `camera.zoom` based on platform + orientation:
 *   - desktop  → 1.0
 *   - mobile + portrait  → 0.65
 *   - mobile + landscape → 0.8
 *
 * We don't construct the full GameEngine (heavy DOM/audio deps); we
 * mirror the formula and assert it on a fake `engine.camera` object
 * across the four combinations.
 */

// Browser shims must precede any imports.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 400, innerHeight: 800,
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
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 5 };
}

import { afterEach, describe, expect, test } from '@jest/globals';
import { isMobile, isPortrait, _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
    // Restore the original innerWidth/innerHeight if a test mutated them.
    if (typeof globalThis.window === 'object') {
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
    }
});

// Mirror the production formula in game-engine.js `_refreshCameraZoom`.
function refreshCameraZoomForMode(camera) {
    if (!camera) return;
    if (!isMobile()) {
        camera.zoom = 1;
        return;
    }
    camera.zoom = isPortrait() ? 0.65 : 0.8;
}

describe('GameEngine._refreshCameraZoom — formula (5.96.0)', () => {
    test('desktop: camera.zoom = 1', () => {
        _resetUrlOverrideForTests(false);
        const camera = { zoom: 1 };
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(1);
    });

    test('mobile portrait: camera.zoom = 0.65', () => {
        _resetUrlOverrideForTests(true);
        // 400 × 800 = portrait (height > width).
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        const camera = { zoom: 1 };
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(0.65);
    });

    test('mobile landscape: camera.zoom = 0.8', () => {
        _resetUrlOverrideForTests(true);
        // 800 × 400 = landscape (width > height).
        globalThis.window.innerWidth = 800;
        globalThis.window.innerHeight = 400;
        const camera = { zoom: 1 };
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(0.8);
    });

    test('null camera: no-op (guard prevents crash before camera init)', () => {
        _resetUrlOverrideForTests(true);
        expect(() => refreshCameraZoomForMode(null)).not.toThrow();
        expect(() => refreshCameraZoomForMode(undefined)).not.toThrow();
    });

    test('formula is idempotent across orientation flips', () => {
        _resetUrlOverrideForTests(true);
        const camera = { zoom: 1 };
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(0.65);
        // Rotate to landscape:
        globalThis.window.innerWidth = 800;
        globalThis.window.innerHeight = 400;
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(0.8);
        // Back to portrait:
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        refreshCameraZoomForMode(camera);
        expect(camera.zoom).toBe(0.65);
    });
});
