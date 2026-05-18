/**
 * QA-11: Multiplayer WASM round-trip smoke test
 *
 * Phase 1 of docs/Multiplayer WASM Pivot - 2026-05-17.md just landed:
 * `/mp` boots a WASM-compiled Rust simulation and renders a single ship
 * that moves under WASD + mouse aim. This spec is the regression guard
 * for that round-trip, so future changes don't silently break it.
 *
 * What we verify:
 *   1. /mp loads without console errors and the WASM module reports
 *      live ticks via the #mp-debug overlay (which mp-engine refreshes
 *      every 10 frames).
 *   2. The wasm-bindgen exports are reachable from page context:
 *      smoke_test() returns 42, build_info() returns a non-empty
 *      string containing "rainboids-client-wasm".
 *   3. Holding W produces a measurable ship-position delta in world
 *      coordinates (forward-thrust round-trip through Rust).
 *   4. Mouse movement updates the engine's projected world-space aim
 *      (proves the canvas-pixel -> world projection feeds set_input()).
 *
 * Notes on parsing:
 *   The overlay text (mp-engine.js line ~89) is a multi-line string:
 *       Rainboids MP - Phase 1
 *       tick:  N
 *       pos:   X.X, Y.Y
 *       aim:   X, Y
 *       fps:   X.X
 *   We pull "pos" and "aim" out with simple regex.
 *
 * Server: assumes the qa project's webServer (npm run dev on :8090) is
 * already running. This spec does NOT start its own server.
 */

import { test, expect } from '@playwright/test';

const MP_URL = 'http://localhost:8090/mp';

// Match "pos:   123.4, 567.8" (mp-engine.js uses toFixed(1) for pos).
const POS_RE = /pos:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
// Match "aim:   123, 456" (mp-engine.js uses toFixed(0) for aim).
const AIM_RE = /aim:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
// Match "tick:  N" — any positive integer means the engine loop is alive.
const TICK_RE = /tick:\s*(\d+)/i;

/**
 * Reads #mp-debug textContent and parses pos/aim/tick if present.
 * Returns null fields when the line hasn't been written yet so callers
 * can poll with expect.poll() until everything is populated.
 */
async function readDebug(page) {
    const text = await page.locator('#mp-debug').textContent();
    if (!text) return { text: '', pos: null, aim: null, tick: null };
    const pos = POS_RE.exec(text);
    const aim = AIM_RE.exec(text);
    const tick = TICK_RE.exec(text);
    return {
        text,
        pos: pos ? { x: parseFloat(pos[1]), y: parseFloat(pos[2]) } : null,
        aim: aim ? { x: parseFloat(aim[1]), y: parseFloat(aim[2]) } : null,
        tick: tick ? parseInt(tick[1], 10) : null,
    };
}

/**
 * Waits for the engine to have written at least one "pos" line to the
 * overlay (proves WASM boot + first frame both completed). Returns the
 * first fully-parsed debug snapshot. Fails loudly if the friendly
 * "WASM not yet built" overlay shows up.
 */
async function waitForBoot(page) {
    // The "WASM not yet built" overlay is mp-main.js's friendly error;
    // if that shows we want to fail with a clear message rather than
    // time out waiting for a pos: line that will never appear.
    await expect
        .poll(
            async () => {
                const text = (await page.locator('#mp-debug').textContent()) ?? '';
                if (text.includes('WASM not yet built')) {
                    throw new Error(
                        'WASM bundle missing on disk. Run `npm run wasm:build` before this test.'
                    );
                }
                const snap = await readDebug(page);
                return snap.pos !== null && snap.tick !== null && snap.tick > 0;
            },
            {
                message: 'mp-engine should populate #mp-debug with a pos+tick line after WASM boot',
                timeout: 15_000,
                intervals: [100, 200, 400],
            }
        )
        .toBe(true);

    return readDebug(page);
}

test.describe('QA-11: MP smoke (/mp WASM round-trip)', () => {

    test.beforeEach(async ({ page }) => {
        // Collect console + page errors for the duration of the test
        // so the first sub-test can assert on them.
        page._consoleErrors = [];
        page._jsErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') page._consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
    });

    // ------------------------------------------------------------------
    // Test 1: page loads, WASM boots, no console errors
    // ------------------------------------------------------------------
    test('/mp loads without errors and WASM boots', async ({ page }) => {
        await page.goto(MP_URL);

        const snap = await waitForBoot(page);

        // Sanity: the overlay header line should still be present along
        // with a pos line — proves both mp-main.js (header) and
        // mp-engine.js (per-frame stats) ran end-to-end.
        expect(snap.text).toContain('Rainboids MP');
        expect(snap.tick, 'tick counter should be > 0').toBeGreaterThan(0);

        // Capture screenshot evidence (saved next to the report).
        await page.screenshot({ path: 'tests/report/qa-11-mp-boot.png' });

        // No fatal JS errors. Headless audio noise isn't expected here
        // (mp/* doesn't touch audio yet) but we still filter the usual
        // suspects so the test is robust if Phase 2 adds them.
        const errs = page._jsErrors.filter(msg =>
            !msg.includes('AudioContext') &&
            !msg.includes('net::ERR')
        );
        const conErrs = page._consoleErrors.filter(msg =>
            !msg.includes('AudioContext') &&
            !msg.includes('net::ERR') &&
            // favicon 404s are noisy and harmless
            !/favicon/i.test(msg)
        );
        expect(errs, `Page errors: ${errs.join('; ')}`).toHaveLength(0);
        expect(conErrs, `Console errors: ${conErrs.join('; ')}`).toHaveLength(0);
    });

    // ------------------------------------------------------------------
    // Test 2: WASM module exports work from page context
    // ------------------------------------------------------------------
    test('WASM module exports work', async ({ page }) => {
        await page.goto(MP_URL);
        await waitForBoot(page);

        // Dynamic-import the same glue mp-main.js uses, init() it, and
        // exercise the two cheap exports. We do this in-page so the
        // import path resolves correctly relative to the served HTML.
        const result = await page.evaluate(async () => {
            const mod = await import('/js/mp/wasm/rainboids_client_wasm.js');
            if (typeof mod.default === 'function') await mod.default();
            return {
                smoke: typeof mod.smoke_test === 'function' ? mod.smoke_test() : null,
                build: typeof mod.build_info === 'function' ? mod.build_info() : null,
                hasWorld: typeof mod.World === 'function',
            };
        });

        expect(result.smoke, 'smoke_test() should return 42').toBe(42);
        expect(typeof result.build, 'build_info() should return a string').toBe('string');
        expect(result.build.length, 'build_info() should be non-empty').toBeGreaterThan(0);
        expect(result.build).toContain('rainboids-client-wasm');
        expect(result.hasWorld, 'wasm module should export the World class').toBe(true);
    });

    // ------------------------------------------------------------------
    // Test 3: ship moves under W key (forward thrust)
    // ------------------------------------------------------------------
    test('Ship moves under W key (forward thrust)', async ({ page }) => {
        await page.goto(MP_URL);
        const start = await waitForBoot(page);
        expect(start.pos, 'should have parsed initial pos').not.toBeNull();
        const startPos = start.pos;

        // Click the canvas first to ensure the page has window focus so
        // window-level keydown listeners (mp-input.js) actually fire.
        await page.locator('#mp-canvas').click({ position: { x: 100, y: 100 } });

        // Hold W for 1s. mp-input.js maps "w" -> state.up = true, and
        // mp-engine forwards that to world.set_input(up=true, ...).
        await page.keyboard.down('w');
        await page.waitForTimeout(1000);
        await page.keyboard.up('w');

        // Give the engine a few frames to refresh the overlay (it
        // updates every 10 frames; at 60fps that's ~167ms — 400ms is a
        // comfortable margin).
        await page.waitForTimeout(400);

        // Poll for an updated pos snapshot (the overlay updates async
        // every 10 frames, so a stable read needs a wait + reparse).
        let endPos = null;
        await expect
            .poll(async () => {
                const snap = await readDebug(page);
                endPos = snap.pos;
                if (!endPos) return 0;
                const dx = endPos.x - startPos.x;
                const dy = endPos.y - startPos.y;
                return Math.hypot(dx, dy);
            }, {
                message: 'ship should have moved > 5 world-units after holding W for 1s',
                timeout: 5_000,
                intervals: [100, 200, 400],
            })
            .toBeGreaterThan(5);

        // Belt-and-suspenders: log the deltas so a future failure is
        // self-explanatory. (Playwright surfaces console.log from the
        // test runner with --reporter list.)
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        console.log(`QA-11 W-thrust: (${startPos.x.toFixed(1)},${startPos.y.toFixed(1)}) -> (${endPos.x.toFixed(1)},${endPos.y.toFixed(1)}) ; |Δ| = ${Math.hypot(dx, dy).toFixed(1)}`);

        await page.screenshot({ path: 'tests/report/qa-11-mp-after-thrust.png' });
    });

    // ------------------------------------------------------------------
    // Test 4: mouse aim updates engine state
    // ------------------------------------------------------------------
    test('Mouse aim updates ship angle', async ({ page }) => {
        await page.goto(MP_URL);
        const start = await waitForBoot(page);
        expect(start.aim, 'should have parsed initial aim').not.toBeNull();
        const startAim = start.aim;

        // Move the mouse to a clearly off-centre canvas position. The
        // mp-input handler reads event.clientX/Y minus the canvas's
        // bounding-rect origin, so absolute viewport coords are fine.
        // 1100,650 is near the bottom-right of the default 1280x720
        // qa viewport — well away from anywhere the centre of the
        // letterboxed 1920x1080 field would land.
        await page.mouse.move(1100, 650);

        // Wait for the engine to project + log the new aim. Overlay
        // refresh cadence is the limiter, so 400ms is safe.
        await page.waitForTimeout(400);

        let endAim = null;
        await expect
            .poll(async () => {
                const snap = await readDebug(page);
                endAim = snap.aim;
                if (!endAim) return 0;
                // Any change in aim coords is sufficient — we're proving
                // the canvas-pixel -> world projection is live, not
                // measuring an exact value (which would couple us to
                // viewport size).
                const dx = endAim.x - startAim.x;
                const dy = endAim.y - startAim.y;
                return Math.hypot(dx, dy);
            }, {
                message: 'aim coords should change after page.mouse.move()',
                timeout: 5_000,
                intervals: [100, 200, 400],
            })
            .toBeGreaterThan(0);

        console.log(`QA-11 aim: (${startAim.x},${startAim.y}) -> (${endAim.x},${endAim.y})`);
    });
});
