/**
 * tests/unit/platform/platform-detect.test.js
 *
 * Unit tests for js/modules/platform/platform-detect.js. Runs in Node.js;
 * we manipulate the global window / navigator shims to simulate touch
 * capability + viewport dimensions + URL params.
 *
 * Note: platform-detect.js caches the URL `?mobile=` override at module
 * load. The exported `_resetUrlOverrideForTests` helper re-reads it
 * (or accepts an explicit value) so tests can switch override modes
 * without ESM module-cache gymnastics.
 */

// Reset the window/navigator shims to a clean desktop baseline before
// importing the module under test. Per-test setup mutates them further.
beforeEach(async () => {
    globalThis.window = {
        innerWidth: 1920,
        innerHeight: 1080,
        location: { search: '' },
        matchMedia: () => ({ matches: false }),
    };
    globalThis.navigator = { maxTouchPoints: 0 };
    // Reset the cached override so each test starts clean.
    const mod = await import('../../../js/modules/platform/platform-detect.js');
    mod._resetUrlOverrideForTests(null);
});

afterAll(() => {
    delete globalThis.window;
    delete globalThis.navigator;
});

async function loadModule() {
    return import('../../../js/modules/platform/platform-detect.js');
}

describe('isTouchDevice', () => {
    it('returns false on a clean desktop window', async () => {
        const mod = await loadModule();
        expect(mod.isTouchDevice()).toBe(false);
    });

    it('returns true when ontouchstart is present', async () => {
        globalThis.window.ontouchstart = null;
        const mod = await loadModule();
        expect(mod.isTouchDevice()).toBe(true);
        delete globalThis.window.ontouchstart;
    });

    it('returns true when navigator.maxTouchPoints > 0', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        const mod = await loadModule();
        expect(mod.isTouchDevice()).toBe(true);
    });
});

describe('isPortrait', () => {
    it('returns false when width > height', async () => {
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const mod = await loadModule();
        expect(mod.isPortrait()).toBe(false);
    });

    it('returns true when height > width', async () => {
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        const mod = await loadModule();
        expect(mod.isPortrait()).toBe(true);
    });

    it('returns false when width === height (square)', async () => {
        globalThis.window.innerWidth = 600;
        globalThis.window.innerHeight = 600;
        const mod = await loadModule();
        expect(mod.isPortrait()).toBe(false);
    });
});

describe('isMobile', () => {
    it('returns false on a desktop (no touch, large viewport)', async () => {
        const mod = await loadModule();
        expect(mod.isMobile()).toBe(false);
    });

    it('returns false when touch is available but viewport is large', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        globalThis.window.innerWidth = 1920;
        globalThis.window.innerHeight = 1080;
        const mod = await loadModule();
        expect(mod.isMobile()).toBe(false);
    });

    it('returns true when touch + small portrait viewport', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        const mod = await loadModule();
        expect(mod.isMobile()).toBe(true);
    });

    it('returns true when touch + small landscape viewport', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        globalThis.window.innerWidth = 800;
        globalThis.window.innerHeight = 400;
        const mod = await loadModule();
        expect(mod.isMobile()).toBe(true);
    });

    it('returns false on a small viewport with no touch (narrow window)', async () => {
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        const mod = await loadModule();
        expect(mod.isMobile()).toBe(false);
    });

    it('honors ?mobile=1 URL override even on desktop', async () => {
        const mod = await loadModule();
        mod._resetUrlOverrideForTests(true);
        expect(mod.isMobile()).toBe(true);
    });

    it('honors ?mobile=0 URL override even on a touch phone', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        const mod = await loadModule();
        mod._resetUrlOverrideForTests(false);
        expect(mod.isMobile()).toBe(false);
    });

    it('parses ?mobile=true correctly via _readUrlOverride', async () => {
        globalThis.window.location.search = '?mobile=true';
        const mod = await loadModule();
        mod._resetUrlOverrideForTests(); // re-read from current search
        expect(mod.isMobile()).toBe(true);
    });

    it('parses ?mobile=false correctly via _readUrlOverride', async () => {
        globalThis.navigator.maxTouchPoints = 5;
        globalThis.window.innerWidth = 400;
        globalThis.window.innerHeight = 800;
        globalThis.window.location.search = '?mobile=false';
        const mod = await loadModule();
        mod._resetUrlOverrideForTests();
        expect(mod.isMobile()).toBe(false);
    });

    it('ignores invalid ?mobile=banana values (falls through to heuristic)', async () => {
        globalThis.window.location.search = '?mobile=banana';
        const mod = await loadModule();
        mod._resetUrlOverrideForTests();
        expect(mod.isMobile()).toBe(false);
    });
});
