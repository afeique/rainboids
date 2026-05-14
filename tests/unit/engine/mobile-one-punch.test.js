/**
 * tests/unit/engine/mobile-one-punch.test.js — 5.95.0
 *
 * Pins the GameEngine cheat-flag initialization contract:
 *   - On desktop the `cheats.onePunchMan` flag MUST default to false.
 *   - On mobile the `cheats.onePunchMan` flag MUST be true at construct
 *     time so every bullet hit is a one-shot kill (the fruit-ninja
 *     redesign's "tap to destroy" feel).
 *
 * We don't spin up the full GameEngine here (it requires DOM canvases,
 * audio, input, music, etc.). Instead the test verifies the *formula*
 * that the constructor uses: `this.cheats.onePunchMan = !!this.mobile`,
 * with `this.mobile = isMobile()`. By driving the `?mobile=` URL
 * override we exercise the same boolean source the engine uses.
 *
 * This is the same testing strategy used by tests/unit/wave/mobile-
 * asteroid-size.test.js — mirror the production formula in the test
 * and assert it returns the right boolean for both modes.
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
import { isMobile, _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// Mirror the GameEngine constructor formula: `cheats.onePunchMan = !!mobile`.
function freshCheatsForMode() {
    const mobile = isMobile();
    return { onePunchMan: !!mobile };
}

describe('GameEngine cheats — onePunchMan default (5.95.0)', () => {
    test('mobile mode: cheats.onePunchMan defaults to TRUE', () => {
        _resetUrlOverrideForTests(true);
        const cheats = freshCheatsForMode();
        expect(cheats.onePunchMan).toBe(true);
    });

    test('desktop mode: cheats.onePunchMan defaults to FALSE', () => {
        _resetUrlOverrideForTests(false);
        const cheats = freshCheatsForMode();
        expect(cheats.onePunchMan).toBe(false);
    });
});
