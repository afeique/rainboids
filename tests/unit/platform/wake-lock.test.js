/**
 * tests/unit/platform/wake-lock.test.js
 *
 * Unit tests for js/modules/platform/wake-lock.js. Runs in Node.js; we
 * manipulate the global window / navigator / document shims to simulate
 * mobile vs desktop, mock navigator.wakeLock, and drive visibilitychange
 * events for the auto-reacquire path.
 *
 * The platform-detect module caches the `?mobile=` URL override at
 * import time; we reset it via the exported _resetUrlOverrideForTests
 * helper so each test starts from a clean mobile baseline. We also
 * call wake-lock's exported _resetForTests() so the module-scoped
 * sentinel and intent flag don't leak between cases.
 *
 * We use `allure-jest/node` as the env (see jest.config.js), which
 * doesn't expose `jest` as a top-level global under experimental-vm-
 * modules — so we pull it from `@jest/globals` explicitly, matching the
 * convention used by tests/unit/platform/haptic.test.js.
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Build a fresh sentinel mock per acquisition. Each one has its own
 * release() spy and an addEventListener that records the 'release'
 * handler so tests can fire the browser-released event manually.
 */
function makeSentinel() {
    const listeners = {};
    return {
        released: false,
        release: jest.fn(function () {
            this.released = true;
            // Fire the registered 'release' event listeners synchronously
            // — matches how a real implementation cleans up after a
            // direct sentinel.release() call.
            if (listeners.release) {
                for (const fn of listeners.release) fn();
            }
            return Promise.resolve();
        }),
        addEventListener: jest.fn(function (event, fn) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(fn);
        }),
        // Test-only: trigger the 'released' event as if the browser
        // released the lock independently (e.g. on tab hide).
        _fireRelease() {
            if (listeners.release) {
                for (const fn of listeners.release) fn();
            }
        },
    };
}

beforeEach(async () => {
    // Mobile baseline: touch device with a small viewport so isMobile()
    // returns true unless a test explicitly forces desktop.
    globalThis.window = {
        innerWidth: 400,
        innerHeight: 800,
        location: { search: '' },
        matchMedia: () => ({ matches: false }),
    };
    globalThis.navigator = {
        maxTouchPoints: 5,
        wakeLock: {
            request: jest.fn(async (_type) => makeSentinel()),
        },
    };
    // Document mock with a tiny event-bus so we can fire visibilitychange.
    const docListeners = {};
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener: jest.fn((event, fn) => {
            if (!docListeners[event]) docListeners[event] = [];
            docListeners[event].push(fn);
        }),
        removeEventListener: jest.fn(),
        _fire(event) {
            if (docListeners[event]) {
                for (const fn of docListeners[event]) fn();
            }
        },
    };
    // Expose document on window too so the default-arg `window.document`
    // in attachAutoReacquireHandler resolves cleanly.
    globalThis.window.document = globalThis.document;

    const platform = await import('../../../js/modules/platform/platform-detect.js');
    platform._resetUrlOverrideForTests(null);
    const wakeLock = await import('../../../js/modules/platform/wake-lock.js');
    wakeLock._resetForTests();
});

afterAll(() => {
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.document;
});

async function loadWakeLock() {
    return import('../../../js/modules/platform/wake-lock.js');
}

describe('requestWakeLock', () => {
    it('returns false on desktop (isMobile false)', async () => {
        globalThis.navigator.maxTouchPoints = 0;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const platform = await import('../../../js/modules/platform/platform-detect.js');
        platform._resetUrlOverrideForTests(null);

        const mod = await loadWakeLock();
        const result = await mod.requestWakeLock();
        expect(result).toBe(false);
        expect(globalThis.navigator.wakeLock.request).not.toHaveBeenCalled();
        expect(mod.isWakeLockHeld()).toBe(false);
    });

    it('returns false when navigator.wakeLock is missing', async () => {
        delete globalThis.navigator.wakeLock;
        const mod = await loadWakeLock();
        const result = await mod.requestWakeLock();
        expect(result).toBe(false);
        expect(mod.isWakeLockHeld()).toBe(false);
    });

    it('returns true when mobile + API present + acquisition succeeds', async () => {
        const mod = await loadWakeLock();
        const result = await mod.requestWakeLock();
        expect(result).toBe(true);
        expect(globalThis.navigator.wakeLock.request).toHaveBeenCalledTimes(1);
        expect(globalThis.navigator.wakeLock.request).toHaveBeenCalledWith('screen');
        expect(mod.isWakeLockHeld()).toBe(true);
    });

    it('returns false when navigator.wakeLock.request() throws', async () => {
        globalThis.navigator.wakeLock.request = jest.fn(async () => {
            throw new Error('NotAllowedError: low battery');
        });
        const mod = await loadWakeLock();
        const result = await mod.requestWakeLock();
        expect(result).toBe(false);
        expect(mod.isWakeLockHeld()).toBe(false);
    });

    it('is idempotent: second call returns true without re-acquiring', async () => {
        const mod = await loadWakeLock();
        const r1 = await mod.requestWakeLock();
        const r2 = await mod.requestWakeLock();
        expect(r1).toBe(true);
        expect(r2).toBe(true);
        // The underlying API should only have been called once; the
        // second request must reuse the existing sentinel.
        expect(globalThis.navigator.wakeLock.request).toHaveBeenCalledTimes(1);
        expect(mod.isWakeLockHeld()).toBe(true);
    });
});

describe('releaseWakeLock', () => {
    it('calls sentinel.release() and clears held state', async () => {
        // Capture the sentinel that the request returns so we can
        // assert on its release() spy after the fact.
        let acquired;
        globalThis.navigator.wakeLock.request = jest.fn(async () => {
            acquired = makeSentinel();
            return acquired;
        });
        const mod = await loadWakeLock();
        await mod.requestWakeLock();
        expect(mod.isWakeLockHeld()).toBe(true);

        const result = await mod.releaseWakeLock();
        expect(result).toBe(true);
        expect(acquired.release).toHaveBeenCalledTimes(1);
        expect(mod.isWakeLockHeld()).toBe(false);
    });

    it('returns false when no lock is held', async () => {
        const mod = await loadWakeLock();
        const result = await mod.releaseWakeLock();
        expect(result).toBe(false);
    });
});

describe('isWakeLockHeld', () => {
    it('returns false initially', async () => {
        const mod = await loadWakeLock();
        expect(mod.isWakeLockHeld()).toBe(false);
    });

    it('returns true after a successful request', async () => {
        const mod = await loadWakeLock();
        await mod.requestWakeLock();
        expect(mod.isWakeLockHeld()).toBe(true);
    });
});

describe('isWakeLockSupported', () => {
    it('returns true when navigator.wakeLock.request is present', async () => {
        const mod = await loadWakeLock();
        expect(mod.isWakeLockSupported()).toBe(true);
    });

    it('returns false when navigator.wakeLock is missing', async () => {
        delete globalThis.navigator.wakeLock;
        const mod = await loadWakeLock();
        expect(mod.isWakeLockSupported()).toBe(false);
    });

    it('is independent of isMobile (returns true on a desktop shim with API present)', async () => {
        // Force desktop in platform-detect, but keep navigator.wakeLock
        // populated. The support check is a pure capability test and
        // must not gate on isMobile().
        globalThis.navigator.maxTouchPoints = 0;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const platform = await import('../../../js/modules/platform/platform-detect.js');
        platform._resetUrlOverrideForTests(null);

        const mod = await loadWakeLock();
        expect(mod.isWakeLockSupported()).toBe(true);
    });
});

describe('attachAutoReacquireHandler', () => {
    it('adds a visibilitychange listener to the document', async () => {
        const mod = await loadWakeLock();
        mod.attachAutoReacquireHandler();
        expect(globalThis.document.addEventListener).toHaveBeenCalledWith(
            'visibilitychange',
            expect.any(Function)
        );
    });

    it('re-requests when visibility returns to visible and a lock was previously held', async () => {
        const mod = await loadWakeLock();
        mod.attachAutoReacquireHandler();

        // First: acquire a lock, then simulate the browser auto-releasing
        // it (as happens when the tab is hidden). The 'release' event on
        // the sentinel clears _currentLock but leaves _shouldHoldLock set,
        // which is exactly the state the auto-reacquire handler expects.
        await mod.requestWakeLock();
        expect(mod.isWakeLockHeld()).toBe(true);
        const requestCallsBefore = globalThis.navigator.wakeLock.request.mock.calls.length;

        // Grab the most recent sentinel and trigger its 'release' event
        // to mimic browser-side auto-release on tab hide.
        const lastReturnedSentinel = await globalThis.navigator.wakeLock.request.mock.results[0].value;
        lastReturnedSentinel._fireRelease();
        expect(mod.isWakeLockHeld()).toBe(false);

        // Now fire visibilitychange with state === 'visible'. The handler
        // should re-request because _shouldHoldLock is still true.
        globalThis.document.visibilityState = 'visible';
        globalThis.document._fire('visibilitychange');
        // requestWakeLock is async; wait a microtask for it to resolve.
        await Promise.resolve();
        await Promise.resolve();

        expect(globalThis.navigator.wakeLock.request.mock.calls.length).toBeGreaterThan(requestCallsBefore);
        expect(mod.isWakeLockHeld()).toBe(true);
    });

    it('does not re-request when visibility becomes hidden', async () => {
        const mod = await loadWakeLock();
        mod.attachAutoReacquireHandler();

        await mod.requestWakeLock();
        const lastReturnedSentinel = await globalThis.navigator.wakeLock.request.mock.results[0].value;
        lastReturnedSentinel._fireRelease();
        const requestCallsBefore = globalThis.navigator.wakeLock.request.mock.calls.length;

        globalThis.document.visibilityState = 'hidden';
        globalThis.document._fire('visibilitychange');
        await Promise.resolve();

        expect(globalThis.navigator.wakeLock.request.mock.calls.length).toBe(requestCallsBefore);
    });

    it('does not re-request after releaseWakeLock() has cleared the intent', async () => {
        const mod = await loadWakeLock();
        mod.attachAutoReacquireHandler();

        await mod.requestWakeLock();
        await mod.releaseWakeLock();
        const requestCallsBefore = globalThis.navigator.wakeLock.request.mock.calls.length;

        globalThis.document.visibilityState = 'visible';
        globalThis.document._fire('visibilitychange');
        await Promise.resolve();

        expect(globalThis.navigator.wakeLock.request.mock.calls.length).toBe(requestCallsBefore);
        expect(mod.isWakeLockHeld()).toBe(false);
    });
});
