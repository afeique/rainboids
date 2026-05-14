/**
 * tests/unit/platform/haptic.test.js
 *
 * Unit tests for js/modules/platform/haptic.js. Runs in Node.js; we
 * manipulate the global window / navigator shims to simulate mobile vs
 * desktop and to mock / un-mock navigator.vibrate.
 *
 * The platform-detect module caches the `?mobile=` URL override at
 * import time; we reset it via the exported _resetUrlOverrideForTests
 * helper so each test can independently force mobile mode on or off.
 *
 * We use `allure-jest/node` as the env (see jest.config.js), which
 * doesn't expose `jest` as a top-level global under experimental-vm-
 * modules — so we pull it from `@jest/globals` explicitly, matching the
 * convention used by tests/unit/net/loopback-connection.test.js.
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

beforeEach(async () => {
    // Reset to a clean mobile baseline (touch + small viewport) so vibrate()
    // can run by default. Individual tests override for desktop or no-API
    // scenarios.
    globalThis.window = {
        innerWidth: 400,
        innerHeight: 800,
        location: { search: '' },
        matchMedia: () => ({ matches: false }),
    };
    globalThis.navigator = {
        maxTouchPoints: 5,
        vibrate: jest.fn(() => true),
    };
    const mod = await import('../../../js/modules/platform/platform-detect.js');
    mod._resetUrlOverrideForTests(null);
});

afterAll(() => {
    delete globalThis.window;
    delete globalThis.navigator;
});

async function loadHaptic() {
    return import('../../../js/modules/platform/haptic.js');
}

describe('vibrate', () => {
    it('calls navigator.vibrate(50) when isMobile + API present', async () => {
        const mod = await loadHaptic();
        const result = mod.vibrate(50);
        expect(result).toBe(true);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledTimes(1);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledWith(50);
    });

    it('calls navigator.vibrate with an array pattern', async () => {
        const mod = await loadHaptic();
        const result = mod.vibrate([10, 20, 10]);
        expect(result).toBe(true);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledTimes(1);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledWith([10, 20, 10]);
    });

    it('returns false when isMobile() is false (desktop)', async () => {
        // Force desktop: no touch + large viewport.
        globalThis.navigator.maxTouchPoints = 0;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const platform = await import('../../../js/modules/platform/platform-detect.js');
        platform._resetUrlOverrideForTests(null);

        const mod = await loadHaptic();
        const result = mod.vibrate(50);
        expect(result).toBe(false);
        expect(globalThis.navigator.vibrate).not.toHaveBeenCalled();
    });

    it('returns false when navigator.vibrate is undefined (iOS Safari)', async () => {
        delete globalThis.navigator.vibrate;
        const mod = await loadHaptic();
        const result = mod.vibrate(50);
        expect(result).toBe(false);
    });

    it('returns false when navigator.vibrate throws', async () => {
        globalThis.navigator.vibrate = jest.fn(() => {
            throw new TypeError('Invalid pattern');
        });
        const mod = await loadHaptic();
        const result = mod.vibrate([-1]);
        expect(result).toBe(false);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledTimes(1);
    });
});

describe('isHapticSupported', () => {
    it('returns true when isMobile + API present', async () => {
        const mod = await loadHaptic();
        expect(mod.isHapticSupported()).toBe(true);
    });

    it('returns false when not on mobile', async () => {
        globalThis.navigator.maxTouchPoints = 0;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const platform = await import('../../../js/modules/platform/platform-detect.js');
        platform._resetUrlOverrideForTests(null);

        const mod = await loadHaptic();
        expect(mod.isHapticSupported()).toBe(false);
    });

    it('returns false when API is missing even on mobile', async () => {
        delete globalThis.navigator.vibrate;
        const mod = await loadHaptic();
        expect(mod.isHapticSupported()).toBe(false);
    });
});

describe('cancelVibrate', () => {
    it('calls navigator.vibrate(0)', async () => {
        const mod = await loadHaptic();
        const result = mod.cancelVibrate();
        expect(result).toBe(true);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledTimes(1);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledWith(0);
    });
});

describe('HAPTIC presets', () => {
    it('HAPTIC.LIGHT is a small positive number', async () => {
        const mod = await loadHaptic();
        expect(typeof mod.HAPTIC.LIGHT).toBe('number');
        expect(mod.HAPTIC.LIGHT).toBeGreaterThan(0);
        expect(mod.HAPTIC.LIGHT).toBeLessThan(50);
    });

    it('HAPTIC.DOUBLE is an array of numbers', async () => {
        const mod = await loadHaptic();
        expect(Array.isArray(mod.HAPTIC.DOUBLE)).toBe(true);
        expect(mod.HAPTIC.DOUBLE.length).toBeGreaterThan(1);
        for (const n of mod.HAPTIC.DOUBLE) {
            expect(typeof n).toBe('number');
            expect(n).toBeGreaterThan(0);
        }
    });
});

describe('URL override interop', () => {
    it('?mobile=1 forces isMobile() true so vibrate() works on a desktop shim', async () => {
        // Strip touch + use a desktop viewport — without the override,
        // isMobile() would return false and vibrate() would no-op.
        globalThis.navigator.maxTouchPoints = 0;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        globalThis.window.location.search = '?mobile=1';
        const platform = await import('../../../js/modules/platform/platform-detect.js');
        platform._resetUrlOverrideForTests(); // re-read from current search

        const mod = await loadHaptic();
        const result = mod.vibrate(mod.HAPTIC.MEDIUM);
        expect(result).toBe(true);
        expect(globalThis.navigator.vibrate).toHaveBeenCalledWith(mod.HAPTIC.MEDIUM);
    });
});
