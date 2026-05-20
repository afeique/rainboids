/**
 * QA-13: Multiplayer Phase 2 two-tab WebSocket smoke test
 *
 * Phase 2 of docs/Multiplayer WASM Pivot Phase 2 - 2026-05-17.md just
 * landed (mp 0.3.2). `/mp` now connects two browser tabs to a Rust
 * server (`rainboids-server` on :8443) over a binary WebSocket and each
 * tab sees the other's ship move via 20Hz snapshot interpolation. This
 * spec is the regression guard for that end-to-end round-trip.
 *
 * What we verify:
 *   1. Both tabs reach `ws: open` and get DISTINCT player ids from the
 *      server (Welcome.player_id is unique per connection).
 *   2. Each tab's overlay reports `peers: 1` (each sees the OTHER one).
 *   3. Holding W in tab1 produces ship movement that tab2 can observe
 *      via its `srv tick:` counter advancing (proves the 20Hz snapshot
 *      stream is actively flowing while input is producing world state
 *      changes server-side).
 *   4. Closing tab1 cleanly removes it from tab2's `peers` count
 *      (server detects WS close, broadcasts PeerLeft within ~hundreds
 *      of ms).
 *
 * Server prerequisites:
 *   The playwright.config.js webServer array starts both http-server
 *   on :8090 and `rainboids-server` on :8443 before tests run. Cargo
 *   cold compile is slow (~30s); the webServer timeout is 180s.
 *
 * WASM prerequisites:
 *   The WASM bundle in `js/mp/wasm/` must exist on disk. If it's
 *   missing, mp-main.js shows a "WASM not yet built" overlay; this
 *   spec detects that text and fails loudly with instructions to run
 *   `npm run wasm:build:dev`.
 *
 * Overlay format (from js/mp/mp-engine.js ~line 256):
 *     Rainboids MP - Phase 2 (mp X.Y.Z)
 *     tick:     N
 *     pos:      X.X, Y.Y
 *     aim:      X, Y
 *     fps:      X.X
 *     ws:       open|connecting|closed|...
 *     peers:    N
 *     pid:      N
 *     srv tick: N
 */

import { test, expect } from '@playwright/test';

const MP_URL = 'http://localhost:8090/mp';

// Overlay-line parsers. Match the mp-engine.js textContent format.
const POS_RE      = /pos:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
const TICK_RE     = /tick:\s*(\d+)/i;
const PEERS_RE    = /peers:\s*(\d+)/i;
const PID_RE      = /pid:\s*(\d+)/i;
const WS_STATE_RE = /ws:\s*(\w+)/i;
const SRV_TICK_RE = /srv\s+tick:\s*(\d+)/i;

/**
 * Reads #mp-debug textContent and parses every overlay field the MP
 * Phase 2 tests care about. Returns null for any field whose line
 * hasn't been written yet (lets callers poll until populated).
 *
 * Note: `tick` is the LOCAL prediction tick; `srvTick` is the most
 * recent server snapshot tick (these are separate counters).
 */
async function readMpDebug(page) {
    const text = (await page.locator('#mp-debug').textContent()) ?? '';
    if (text.includes('WASM not yet built')) {
        throw new Error(
            'WASM bundle missing on disk. Run `npm run wasm:build:dev` before this test.'
        );
    }
    const pos     = POS_RE.exec(text);
    const tick    = TICK_RE.exec(text);
    const peers   = PEERS_RE.exec(text);
    const pid     = PID_RE.exec(text);
    const wsState = WS_STATE_RE.exec(text);
    const srvTick = SRV_TICK_RE.exec(text);
    return {
        text,
        pos:     pos ? { x: parseFloat(pos[1]), y: parseFloat(pos[2]) } : null,
        tick:    tick ? parseInt(tick[1], 10) : null,
        peers:   peers ? parseInt(peers[1], 10) : null,
        // pid: "-" until Welcome arrives; only parse if numeric.
        pid:     pid ? parseInt(pid[1], 10) : null,
        wsState: wsState ? wsState[1].toLowerCase() : null,
        srvTick: srvTick ? parseInt(srvTick[1], 10) : null,
    };
}

/**
 * Polls the page's #mp-debug overlay until `ws:` reads `open`. Also
 * waits for `pid:` to be a parsed integer (proves the server's Welcome
 * frame arrived and the engine logged the assigned player_id).
 *
 * 15s is generous: even with a warm cargo binary the WS handshake +
 * first server tick + first overlay refresh fits comfortably inside
 * a couple of seconds; 15s tolerates GC pauses / CI slow starts.
 */
async function waitForWsOpen(page, label = 'page') {
    await expect
        .poll(
            async () => {
                const snap = await readMpDebug(page);
                return snap.wsState === 'open' && snap.pid !== null;
            },
            {
                message: `${label} should reach ws: open with an assigned pid`,
                timeout: 15_000,
                intervals: [100, 200, 400, 800],
            }
        )
        .toBe(true);
    return readMpDebug(page);
}

test.describe('QA-13: MP Phase 2 two-tab WS (/mp/ws)', () => {

    // ------------------------------------------------------------------
    // Test 1: both tabs reach ws:open and get distinct pids
    // ------------------------------------------------------------------
    test('Two tabs both reach ws:open state', async ({ browser }) => {
        // Separate contexts so cookies / storage don't bleed across tabs
        // (the WS handshake should treat them as fully independent peers).
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        try {
            await page1.goto(MP_URL);
            await page2.goto(MP_URL);

            const [snap1, snap2] = await Promise.all([
                waitForWsOpen(page1, 'page1'),
                waitForWsOpen(page2, 'page2'),
            ]);

            expect(snap1.wsState, 'page1 ws state').toBe('open');
            expect(snap2.wsState, 'page2 ws state').toBe('open');

            // Distinct player ids: the server assigns monotonically
            // increasing ids per slot, so two simultaneous tabs must
            // receive different numbers.
            expect(snap1.pid, 'page1 pid should be parsed').not.toBeNull();
            expect(snap2.pid, 'page2 pid should be parsed').not.toBeNull();
            expect(snap1.pid, 'pids must be distinct').not.toBe(snap2.pid);

            console.log(`QA-13 pids: page1=${snap1.pid}, page2=${snap2.pid}`);
        } finally {
            await ctx1.close();
            await ctx2.close();
        }
    });

    // ------------------------------------------------------------------
    // Test 2: each tab sees the OTHER in its peers count
    // ------------------------------------------------------------------
    test('Each tab sees the OTHER in its peers count', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        try {
            await page1.goto(MP_URL);
            await page2.goto(MP_URL);

            await Promise.all([
                waitForWsOpen(page1, 'page1'),
                waitForWsOpen(page2, 'page2'),
            ]);

            // Poll each overlay until `peers: 1`. PeerJoined is broadcast
            // by the server when the second tab's Hello lands, so the
            // first tab's count flips from 0 to 1 once the second tab
            // has finished handshaking. The second tab also sees the
            // first because the server emits its initial peer set in
            // Welcome (or via a subsequent PeerJoined replay).
            await expect
                .poll(async () => (await readMpDebug(page1)).peers, {
                    message: 'page1 should see exactly 1 peer (page2)',
                    timeout: 10_000,
                    intervals: [100, 200, 400],
                })
                .toBeGreaterThanOrEqual(1);

            await expect
                .poll(async () => (await readMpDebug(page2)).peers, {
                    message: 'page2 should see exactly 1 peer (page1)',
                    timeout: 10_000,
                    intervals: [100, 200, 400],
                })
                .toBeGreaterThanOrEqual(1);

            // Sanity: srv tick should be a positive integer on both
            // sides — proves the 20Hz snapshot stream is alive.
            const [snap1, snap2] = await Promise.all([
                readMpDebug(page1),
                readMpDebug(page2),
            ]);
            expect(snap1.srvTick, 'page1 srv tick parsed').not.toBeNull();
            expect(snap2.srvTick, 'page2 srv tick parsed').not.toBeNull();
            expect(snap1.srvTick, 'page1 srv tick > 0').toBeGreaterThan(0);
            expect(snap2.srvTick, 'page2 srv tick > 0').toBeGreaterThan(0);
        } finally {
            await ctx1.close();
            await ctx2.close();
        }
    });

    // ------------------------------------------------------------------
    // Test 3: ship movement in one tab visible to the other via
    //         server snapshot delivery
    // ------------------------------------------------------------------
    test('Ship movement in one tab is visible to the other', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        try {
            await page1.goto(MP_URL);
            await page2.goto(MP_URL);

            await Promise.all([
                waitForWsOpen(page1, 'page1'),
                waitForWsOpen(page2, 'page2'),
            ]);

            // Wait for both tabs to acknowledge the other peer before
            // we start the movement window — otherwise the assertion
            // that page2's srv tick advanced during the hold gets
            // muddled with the peer-discovery latency.
            await expect
                .poll(async () => (await readMpDebug(page2)).peers, {
                    timeout: 10_000,
                    intervals: [100, 200, 400],
                    message: 'page2 should see page1 before we start moving',
                })
                .toBeGreaterThanOrEqual(1);

            // Snapshot baselines (just before holding W).
            const beforeMove1 = await readMpDebug(page1);
            const beforeMove2 = await readMpDebug(page2);
            expect(beforeMove1.pos, 'page1 baseline pos parsed').not.toBeNull();
            expect(beforeMove2.srvTick, 'page2 baseline srv tick parsed').not.toBeNull();

            // Focus page1 and click its canvas to ensure window-level
            // keydown listeners fire (mp-input.js binds at window scope).
            await page1.bringToFront();
            await page1.locator('#mp-canvas').click({ position: { x: 100, y: 100 } });

            // Hold W for 1500ms. 20Hz snapshots × 1.5s = 30 expected
            // snapshot frames delivered to page2 during the hold.
            await page1.keyboard.down('w');
            await page1.waitForTimeout(1500);
            await page1.keyboard.up('w');

            // Give overlays a couple of refresh cycles (mp-engine
            // refreshes every 10 frames ≈ 167ms at 60fps).
            await page1.waitForTimeout(400);
            await page2.waitForTimeout(400);

            const afterMove1 = await readMpDebug(page1);
            const afterMove2 = await readMpDebug(page2);

            // page1 (local prediction): the ship must have visibly moved.
            expect(afterMove1.pos, 'page1 after pos parsed').not.toBeNull();
            const dx = afterMove1.pos.x - beforeMove1.pos.x;
            const dy = afterMove1.pos.y - beforeMove1.pos.y;
            const moveDist = Math.hypot(dx, dy);
            expect(
                moveDist,
                'page1 ship should have moved > 5 world units while W was held'
            ).toBeGreaterThan(5);

            // page2 (remote observer): we can't read the remote ship's
            // interpolated position from the overlay (only the LOCAL
            // ship's pos is logged), so we use srv tick advancement as
            // a proxy for "snapshots are flowing". At 20Hz × 1.5s plus
            // the 400ms settle wait we expect ~38 frames; require >10
            // to comfortably tolerate jitter and cargo-warmup hitches.
            expect(afterMove2.peers, 'page2 still sees page1').toBeGreaterThanOrEqual(1);
            expect(afterMove2.srvTick, 'page2 after srv tick parsed').not.toBeNull();
            const srvTickDelta = afterMove2.srvTick - beforeMove2.srvTick;
            expect(
                srvTickDelta,
                'page2 srv tick should advance > 10 during the 1.5s hold (20Hz × 1.5s = 30 expected)'
            ).toBeGreaterThan(10);

            console.log(
                `QA-13 movement: page1 |Δ|=${moveDist.toFixed(1)}, ` +
                `page2 srvTick ${beforeMove2.srvTick} -> ${afterMove2.srvTick} (Δ=${srvTickDelta})`
            );

            // Evidence: tab2 watching tab1 move. Letterboxed remote
            // ship should be visible somewhere on the canvas.
            await page2.screenshot({ path: 'tests/report/qa-13-tab2-sees-tab1-moving.png' });
        } finally {
            await ctx1.close();
            await ctx2.close();
        }
    });

    // ------------------------------------------------------------------
    // Test 4: disconnecting one tab cleanly removes it from the other
    // ------------------------------------------------------------------
    test('Disconnecting one tab cleanly removes it from the other', async ({ browser }) => {
        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        try {
            await page1.goto(MP_URL);
            await page2.goto(MP_URL);

            await Promise.all([
                waitForWsOpen(page1, 'page1'),
                waitForWsOpen(page2, 'page2'),
            ]);

            // Wait for page2 to register page1 as a peer.
            await expect
                .poll(async () => (await readMpDebug(page2)).peers, {
                    timeout: 10_000,
                    intervals: [100, 200, 400],
                    message: 'page2 should see page1 as a peer before disconnect',
                })
                .toBeGreaterThanOrEqual(1);

            // Close page1 (and its context — closing the page is enough
            // to drop the WS; closing the context is hygiene). The
            // per-connection task's reader loop detects WS close and
            // enqueues RoomCmd::Leave, which broadcasts PeerLeft.
            await page1.close();
            await ctx1.close();

            // Poll page2 until peers drops to 0. The server enqueues
            // Leave on WS close immediately, and the room actor
            // processes commands every tick (60Hz) — so this should
            // resolve within a few hundred ms in practice. 5s timeout
            // tolerates any TCP RST / keepalive lag.
            await expect
                .poll(async () => (await readMpDebug(page2)).peers, {
                    message: 'page2 peers should drop to 0 after page1 disconnect',
                    timeout: 5_000,
                    intervals: [100, 200, 400],
                })
                .toBe(0);
        } finally {
            // ctx1 was closed inside the try block; closing it again
            // is a no-op but wrapped in try/catch for safety.
            try { await ctx1.close(); } catch (_) { /* already closed */ }
            await ctx2.close();
        }
    });
});
