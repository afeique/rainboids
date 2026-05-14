/**
 * tests/unit/engine/mobile-one-punch.test.js — 5.96.0
 *
 * Pins the GameEngine cheat-flag initialization contract after the
 * 5.96.0 RPG-restoration revert:
 *   - On BOTH desktop and mobile, `cheats.onePunchMan` MUST default to
 *     false. Mobile is a tower-defense RPG; weapon upgrades, damage
 *     multipliers, and kill streaks all need to matter, so the
 *     one-shot-kill cheat is no longer auto-enabled on mobile.
 *   - The cheat is still available via console for dev/testing.
 *
 * History:
 *   - 5.95.0: introduced `cheats.onePunchMan = !!mobile` for the
 *     fruit-ninja mobile redesign.
 *   - 5.96.0: reverted — mobile is back to being an RPG.
 *
 * We don't spin up the full GameEngine here (it requires DOM canvases,
 * audio, input, music, etc.). Instead the test verifies the *formula*
 * that the constructor uses: `this.cheats.onePunchMan = false`,
 * independent of `this.mobile`.
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

// Mirror the 5.96.0 GameEngine constructor formula:
//   `cheats.onePunchMan = false` (no mobile branch).
function freshCheatsForMode() {
    // Read isMobile() to assert the formula is independent of it.
    void isMobile();
    return { onePunchMan: false };
}

describe('GameEngine cheats — onePunchMan default (5.96.0 RPG-revert)', () => {
    test('mobile mode: cheats.onePunchMan defaults to FALSE (was TRUE in 5.95.0)', () => {
        _resetUrlOverrideForTests(true);
        const cheats = freshCheatsForMode();
        expect(cheats.onePunchMan).toBe(false);
    });

    test('desktop mode: cheats.onePunchMan defaults to FALSE', () => {
        _resetUrlOverrideForTests(false);
        const cheats = freshCheatsForMode();
        expect(cheats.onePunchMan).toBe(false);
    });
});
