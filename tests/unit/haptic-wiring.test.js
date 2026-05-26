/**
 * tests/unit/haptic-wiring.test.js — MB-2 (wire real haptics).
 *
 * Covers the enable-flag gating that core/utils.js layers on top of the
 * platform/haptic.js Web Vibration wrapper:
 *   - isHapticsEnabled() / setHapticsEnabled() round-trip (the user preference,
 *     persisted under 'rainboids:haptics').
 *   - triggerHapticFeedback() short-circuits to false when disabled, regardless
 *     of platform.
 *   - triggerHapticFeedback() also returns false on a non-mobile platform even
 *     when enabled, because vibrate() gates on isMobile() (false in node/jsdom).
 *     This confirms desktop-safety.
 *
 * No canvas / DOM gameplay is exercised — but importing utils.js installs
 * interaction listeners on window/document at load time, so the browser shims
 * (mirrored from assist-feedback.test.js) run first.
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'canvas') {
                return { width: 0, height: 0, style: {}, getContext: () => ({}) };
            }
            return { getContext: () => ({}), style: {}, addEventListener: () => {} };
        },
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = function Path2D() {};
}

import { afterEach, describe, expect, test } from '@jest/globals';
import {
    triggerHapticFeedback,
    isHapticsEnabled,
    setHapticsEnabled,
} from '../../js/modules/core/utils.js';

afterEach(() => {
    // Restore the default so cases don't leak state into one another.
    setHapticsEnabled(true);
});

describe('MB-2 — haptics enable flag', () => {
    test('isHapticsEnabled() defaults to true', () => {
        expect(isHapticsEnabled()).toBe(true);
    });

    test('setHapticsEnabled(false) disables, setHapticsEnabled(true) re-enables', () => {
        setHapticsEnabled(false);
        expect(isHapticsEnabled()).toBe(false);
        setHapticsEnabled(true);
        expect(isHapticsEnabled()).toBe(true);
    });
});

describe('MB-2 — triggerHapticFeedback gating', () => {
    test('returns false when haptics are disabled (enable-flag short-circuit)', () => {
        setHapticsEnabled(false);
        expect(triggerHapticFeedback()).toBe(false);
        expect(triggerHapticFeedback(40)).toBe(false);
    });

    test('returns false on a non-mobile platform even when enabled (desktop-safe)', () => {
        // vibrate() gates on isMobile(), which is false in node/jsdom, so the
        // call no-ops regardless of the enable flag being on.
        setHapticsEnabled(true);
        expect(triggerHapticFeedback()).toBe(false);
        expect(triggerHapticFeedback(60)).toBe(false);
    });
});
