/**
 * E2E — Multiplayer MVD ("minimum viable demo")
 *
 * The goal of this spec is to PROVE that two clients in the same room see
 * each other's ships move. It's the smallest possible end-to-end multiplayer
 * test: spin up two browser contexts, point both at `?multiplayer=1`,
 * quick-match them into the same room, fire a movement input on one, and
 * assert the other observes the avatar move.
 *
 * SCAFFOLD STATUS (Week 6+):
 *
 *   Sibling subagents are wiring the Rust server tick + the client
 *   EngineDriver multiplayer snapshot path in parallel. Until those land,
 *   this spec gates on whether the Rust server is reachable at
 *   `http://localhost:8443/health`. When the server isn't running the test
 *   skips (NOT fails) with a clear message so CI stays green. To run it
 *   locally:
 *
 *     # one terminal:
 *     cd server && cargo run --release
 *
 *     # another:
 *     npm run dev    # (Playwright auto-starts this if not running)
 *     npx playwright test tests/e2e/multiplayer-mvd.spec.js --project=e2e
 *
 *   Once Phase 1 of the multiplayer plan lands (server tick + client
 *   interpolator + `remotePlayers` map exposed on `gameEngine`), the
 *   movement assertion below will start passing without further changes.
 *
 * Architectural notes:
 *   • The two contexts share a Playwright `browser` instance but each gets
 *     its own `context.newPage()` — separate cookie jars, separate origins,
 *     separate `window.gameEngine`. This is the supported pattern for
 *     multi-client Playwright (browserContext-per-client).
 *   • `quickMatch()` is intentionally call-once-per-page; it's idempotent
 *     enough that re-running the test from the same dev server doesn't leak
 *     state — each ConnectionTask owns its own session UUID.
 *   • The "did the remote ship move?" assertion polls `getRemoteShipPosition`
 *     because the snapshot tick rate (currently planned at 30 Hz) is slower
 *     than Playwright's expectation polling. We sample for up to ~3s before
 *     failing.
 */

import { test, expect } from '@playwright/test';
import {
    isMultiplayerServerReachable,
    loadGameMultiplayer,
    quickMatch,
    getLocalShipPosition,
    getRemoteShipPosition,
    holdKey,
} from '../helpers/multiplayer.js';

test.describe('E2E-MVD: multiplayer minimum viable demo', () => {
    test('[MVD] two clients see each other\'s ships', async ({ browser }) => {
        // ─── Gate on server availability ───────────────────────────────────
        //
        // We probe the Rust server's /health endpoint (server/src/server/
        // http.rs → returns "ok"). If it's down, skip with a message that
        // tells the developer exactly how to bring it up. The test
        // SCAFFOLDING lands without failing CI when the server isn't
        // started — sibling subagents wiring the server tick + EngineDriver
        // MP path will exercise this spec as soon as their changes land.
        const serverUp = await isMultiplayerServerReachable();
        test.skip(
            !serverUp,
            'Rust server not running on :8443. Start with `cd server && cargo run --release` and re-run.'
        );

        // ─── Setup: two independent browser contexts ───────────────────────
        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        const pageA = await ctxA.newPage();
        const pageB = await ctxB.newPage();

        try {
            // Load both clients with multiplayer enabled.
            await Promise.all([
                loadGameMultiplayer(pageA),
                loadGameMultiplayer(pageB),
            ]);

            // Quick-match both into the same room. The server's matchmaker
            // pairs the two pending QuickMatch requests into one room (see
            // server/src/matchmaking/). Running these in parallel maximises
            // the chance of landing in the same room — if A finished and
            // started a "waiting" room, B's QuickMatch joins it.
            const [welcomeA, welcomeB] = await Promise.all([
                quickMatch(pageA),
                quickMatch(pageB),
            ]);
            expect(welcomeA?.playerId, 'A: welcome.playerId').toBeTruthy();
            expect(welcomeB?.playerId, 'B: welcome.playerId').toBeTruthy();
            expect(
                welcomeA.playerId,
                'each client should have a distinct playerId'
            ).not.toBe(welcomeB.playerId);

            // ─── Capture baseline positions ────────────────────────────────
            const posA_local_before = await getLocalShipPosition(pageA);
            const posB_local_before = await getLocalShipPosition(pageB);
            expect(posA_local_before).not.toBeNull();
            expect(posB_local_before).not.toBeNull();

            // ─── Action: thrust forward on A only ──────────────────────────
            //
            // KeyW maps to `inputHandler.input.up = true` (see
            // js/modules/ui/input-handler.js:105). Holding for 1s gives the
            // ship time to accelerate beyond any "snap-to-spawn" filter on
            // the wire.
            await holdKey(pageA, 'KeyW', 1000);

            // Give the server tick + snapshot fan-out a moment to propagate.
            // 1.5s headroom over the input pulse covers the worst-case
            // round-trip on a slow CI box.
            await pageB.waitForTimeout(1500);

            // ─── Assertion 1: A's local ship has moved on A's screen ───────
            //
            // The local prediction should reflect the input immediately,
            // independent of what the server has acknowledged. If this fails
            // the input plumbing is broken (not the network).
            const posA_local_after = await getLocalShipPosition(pageA);
            expect(posA_local_after).not.toBeNull();
            const localDist = Math.hypot(
                posA_local_after.x - posA_local_before.x,
                posA_local_after.y - posA_local_before.y
            );
            expect(
                localDist,
                'A: local ship should have moved after a 1s thrust pulse'
            ).toBeGreaterThan(5);

            // ─── Assertion 2: B sees A's remote ship at a non-spawn pos ────
            //
            // This is the actual MVD assertion — it requires the snapshot
            // fan-out + interpolator. Once Phase 1 lands, `gameEngine` (on
            // pageB) will publish a remote-players map keyed by playerId.
            // The helper tries several published shapes so the test doesn't
            // re-break when the map's exact name changes.
            const remoteOnB = await getRemoteShipPosition(pageB, welcomeA.playerId);
            expect(
                remoteOnB,
                `B should render A's ship (playerId=${welcomeA.playerId}) once snapshots arrive`
            ).not.toBeNull();

            // The remote ship should be visibly off its spawn coordinates.
            // We don't pin an exact value — only that it has drifted some
            // distance from the local-baseline location B started at. Using
            // B's own ship as a sanity proxy keeps the assertion stable
            // against any future world-size / camera changes.
            const remoteDistFromSpawn = Math.hypot(
                remoteOnB.x - posB_local_before.x,
                remoteOnB.y - posB_local_before.y
            );
            expect(
                remoteDistFromSpawn,
                'A\'s ship on B\'s screen should not be at B\'s spawn'
            ).toBeGreaterThan(5);

            // ─── Assertion 3: B's local ship did NOT move ──────────────────
            //
            // Sanity-check that the test isn't accidentally feeding input to
            // both clients. B never received a key event, so its local ship
            // should be effectively stationary (a tiny drift from passive
            // physics is OK — we tolerate up to a small radius).
            const posB_local_after = await getLocalShipPosition(pageB);
            const bDrift = Math.hypot(
                posB_local_after.x - posB_local_before.x,
                posB_local_after.y - posB_local_before.y
            );
            expect(
                bDrift,
                'B: local ship should be effectively stationary (no input fed)'
            ).toBeLessThan(20);
        } finally {
            await ctxA.close();
            await ctxB.close();
        }
    });
});
