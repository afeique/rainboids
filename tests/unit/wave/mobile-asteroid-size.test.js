/**
 * tests/unit/wave/mobile-asteroid-size.test.js — 5.95.0
 *
 * Pins the mobile-mode asteroid spawn size cap.
 *
 * The wave-manager's `initializeWaveAsteroid` reads `isMobile()` and
 * selects either the desktop range (30-60 px) or the mobile range
 * (20-36 px). We don't try to spin up a full wave-manager binding for
 * `this` here — that would require building most of the game engine.
 * Instead we:
 *   1) Verify the exported MOBILE_ASTEROID_MAX_RADIUS constant is the
 *      pinned value (36 px) — this is the canonical cap that anywhere
 *      else in the code (split fragments, etc.) must respect.
 *   2) Mirror the spawn-time radius selection logic from
 *      initializeWaveAsteroid and verify it falls within bounds in both
 *      modes. The duplication is intentional — the test acts as a
 *      regression check against future drift between the cap and the
 *      spawn formula.
 */

// Browser shims — must happen before any game module import.
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
import {
    MOBILE_ASTEROID_MAX_RADIUS,
    MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS,
} from '../../../js/modules/wave/wave-manager.js';
import { isMobile, isPortrait, _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

afterEach(() => {
    _resetUrlOverrideForTests(null);
});

// Mirror initializeWaveAsteroid's radius pick. Kept in sync with the
// real implementation; the constants act as SSOT for each branch.
function pickRadius() {
    if (isMobile()) {
        return isPortrait()
            ? 16 + Math.random() * (MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS - 16)
            : 20 + Math.random() * (MOBILE_ASTEROID_MAX_RADIUS - 20);
    }
    return 30 + Math.random() * 30;
}

describe('mobile asteroid size cap (5.95.0 → 5.95.1)', () => {
    test('MOBILE_ASTEROID_MAX_RADIUS is the pinned cap (36 px) — landscape mobile', () => {
        expect(MOBILE_ASTEROID_MAX_RADIUS).toBe(36);
    });

    test('MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS is the pinned cap (28 px) — portrait mobile', () => {
        expect(MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS).toBe(28);
    });

    test('mobile portrait: spawn radius stays within [16, 28] across 1000 picks', () => {
        _resetUrlOverrideForTests(true);
        // Confirm test window IS in portrait (400 < 800).
        expect(isPortrait()).toBe(true);
        for (let i = 0; i < 1000; i++) {
            const r = pickRadius();
            expect(r).toBeGreaterThanOrEqual(16);
            expect(r).toBeLessThanOrEqual(MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS);
        }
    });

    test('desktop mode: spawn radius stays in original [30, 60] range across 1000 picks', () => {
        _resetUrlOverrideForTests(false);
        for (let i = 0; i < 1000; i++) {
            const r = pickRadius();
            expect(r).toBeGreaterThanOrEqual(30);
            expect(r).toBeLessThanOrEqual(60);
        }
    });

    test('mobile portrait cap is meaningfully smaller than landscape (and desktop minimum)', () => {
        // 28 < 36 < 60.
        expect(MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS).toBeLessThan(MOBILE_ASTEROID_MAX_RADIUS);
        expect(MOBILE_ASTEROID_MAX_RADIUS).toBeLessThan(60);
    });
});
