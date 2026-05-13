/**
 * Multiplayer test helpers.
 *
 * The MVD ("minimum viable demo") suite spins up two browser contexts, points
 * them at `?multiplayer=1`, quick-matches them into the same room, and asserts
 * that input fed into one context renders on the other. Sibling subagents are
 * still wiring server tick + client EngineDriver MP wiring in parallel, so
 * these helpers are intentionally permissive:
 *
 *   • `isMultiplayerServerReachable()` lets specs `test.skip()` cleanly when
 *     the Rust server isn't running locally.
 *   • `loadGameMultiplayer()` is a thin wrapper around the existing `loadGame`
 *     helper that appends `?multiplayer=1` and waits for the multiplayer
 *     feature-flag plumbing to settle.
 *   • `quickMatch()` drives the title-screen → MULTIPLAYER → QUICK MATCH →
 *     START flow using the modal's button labels and the `engineDriver`
 *     instance that `js/main.js` attaches to `window`.
 *   • `getRemoteShipState()` reads `window.gameEngine` for a remote peer's
 *     ship position. It tolerates the multiple shapes the engine may take
 *     during the porting work (Phase 1 of the multiplayer plan) so the test
 *     scaffold doesn't have to be rewritten the day the sim landing lands.
 *
 * Important: do NOT add real game logic here. This file is plumbing.
 */

// Default Rust server health probe URL. The server binds 0.0.0.0:8443 and
// exposes /health → "ok" — see server/src/server/http.rs + server/README.md.
export const DEFAULT_SERVER_HEALTH_URL =
    process.env.RAINBOIDS_SERVER_HEALTH_URL || 'http://localhost:8443/health';

// Title-screen "MULTIPLAYER" button hit-area is canvas-drawn, not a DOM
// element — the spec clicks the modal-opening API directly via `window`.
// The modal itself, once opened, is real DOM.
export const MULTIPLAYER_OVERLAY_SELECTOR = '#multiplayer-overlay';

/**
 * Check whether the Rust multiplayer server is reachable on its health
 * endpoint. Returns `true` if a 2xx response comes back within the timeout,
 * `false` otherwise. Never throws — call sites can use the boolean to drive
 * `test.skip()`.
 *
 * Uses Node's global `fetch` (Node 18+). The Rust server doesn't emit CORS
 * headers on /health, but Node-side fetch doesn't care.
 *
 * @param {object} [opts]
 * @param {string} [opts.url]       defaults to DEFAULT_SERVER_HEALTH_URL
 * @param {number} [opts.timeoutMs] defaults to 1500
 * @returns {Promise<boolean>}
 */
export async function isMultiplayerServerReachable({
    url = DEFAULT_SERVER_HEALTH_URL,
    timeoutMs = 1500,
} = {}) {
    if (typeof fetch !== 'function') return false;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
        return res.ok;
    } catch {
        return false;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Navigate a Playwright page to the game with the multiplayer feature flag
 * enabled, then wait for `window.gameEngine` and `window.engineDriver` to be
 * available on the page (set by `js/main.js`).
 *
 * The flag is the same one production uses for the WIP multiplayer button:
 * `?multiplayer=1` (see `js/net/ws-client.js: multiplayerEnabled()`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {string} [opts.wsUrl]  optional `wsUrl` override forwarded to the
 *                               client via the same query-string surface
 *                               that `defaultWsUrl()` already consumes.
 */
export async function loadGameMultiplayer(page, { wsUrl } = {}) {
    const qs = new URLSearchParams({ multiplayer: '1' });
    if (wsUrl) qs.set('wsUrl', wsUrl);
    await page.goto(`/?${qs.toString()}`);

    await page.waitForFunction(() => window.gameEngine !== undefined, {
        timeout: 20_000,
    });
    await page.waitForFunction(
        () => window.gameEngine && window.gameEngine.game && window.engineDriver,
        { timeout: 10_000 }
    );
}

/**
 * Drive the title-screen multiplayer flow:
 *   1. Open the multiplayer modal (programmatically, sidestepping the
 *      canvas hit-test which is brittle in headless mode).
 *   2. Wait for "✓ Connected" to render (handshake done).
 *   3. Click "QUICK MATCH".
 *   4. Wait for the room-joined confirmation panel ("✓ Created room …" or
 *      "share code · …" — both branches go through `_renderRoomJoined`).
 *   5. Click "▶ START MULTIPLAYER GAME" to hand the live ConnectionTask to
 *      the EngineDriver and start the run.
 *   6. Wait for `gameEngine.game.state === 'PLAYING'`.
 *
 * Returns the welcome payload (`{ playerId, session, serverTimeMs }`) read
 * off the engine driver so the caller can correlate this context's avatar
 * across both browser contexts.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]  per-stage timeout (default 15s)
 * @returns {Promise<{ playerId: string, session: string }>}
 */
export async function quickMatch(page, { timeoutMs = 15_000 } = {}) {
    // 1. Open the modal. The title-screen MULTIPLAYER button is canvas-drawn
    //    with a click hit-rect; rather than mouse-aim in headless we call the
    //    same `openMultiplayerModal()` flow the click handler uses. The
    //    module exports the singleton accessor via `import` only — we reach
    //    it through the click path on `js/main.js`. Simpler approach: hover
    //    + click the canvas's MULTIPLAYER hit-rect once the title-screen
    //    renderer publishes it. The button rect lives at
    //    `gameEngine._titleButtonRects.multiplayer`.
    await page.evaluate(async () => {
        const ge = window.gameEngine;
        if (!ge) throw new Error('gameEngine missing');
        // Wait one rAF so the title renderer has populated _titleButtonRects.
        await new Promise((r) => requestAnimationFrame(() => r()));
        const rects = ge._titleButtonRects;
        if (!rects || !rects.multiplayer) {
            throw new Error('MULTIPLAYER button rect not exposed by engine');
        }
        const r = rects.multiplayer;
        const canvas = ge.canvas;
        const rect = canvas.getBoundingClientRect();
        // Convert canvas-space to client-space (helper for the test only).
        const cx = rect.left + (r.x + r.w / 2) * (rect.width / canvas.width);
        const cy = rect.top + (r.y + r.h / 2) * (rect.height / canvas.height);
        window.__mpHitTarget = { x: cx, y: cy };
    });
    const hit = await page.evaluate(() => window.__mpHitTarget);
    await page.mouse.click(hit.x, hit.y);

    // 2. Wait for the modal's "✓ Connected" line.
    await page.waitForSelector(`${MULTIPLAYER_OVERLAY_SELECTOR}`, { timeout: timeoutMs });
    await page.waitForFunction(
        () => {
            const overlay = document.getElementById('multiplayer-overlay');
            if (!overlay) return false;
            return overlay.textContent.includes('✓ Connected');
        },
        { timeout: timeoutMs }
    );

    // 3. Click QUICK MATCH.
    await page.evaluate(() => {
        const overlay = document.getElementById('multiplayer-overlay');
        if (!overlay) throw new Error('multiplayer overlay missing');
        const btn = [...overlay.querySelectorAll('button')].find(
            (b) => b.textContent.trim() === 'QUICK MATCH'
        );
        if (!btn) throw new Error('QUICK MATCH button missing');
        btn.click();
    });

    // 4. Wait for the post-join panel (share-code line). The modal uses
    //    `_renderRoomJoined` for both QuickMatch and CreateRoom — the
    //    "share code · ABC123" line is the most reliable terminal marker.
    await page.waitForFunction(
        () => {
            const overlay = document.getElementById('multiplayer-overlay');
            if (!overlay) return false;
            return /share code\s+·\s+/i.test(overlay.textContent);
        },
        { timeout: timeoutMs }
    );

    // 5. Click ▶ START MULTIPLAYER GAME.
    await page.evaluate(() => {
        const overlay = document.getElementById('multiplayer-overlay');
        const btn = [...overlay.querySelectorAll('button')].find(
            (b) => /START MULTIPLAYER GAME/.test(b.textContent)
        );
        if (!btn) throw new Error('START MULTIPLAYER GAME button missing');
        btn.click();
    });

    // 6. Wait for PLAYING state.
    await page.waitForFunction(
        () => window.gameEngine?.game?.state === 'PLAYING',
        { timeout: timeoutMs }
    );

    // Surface the welcome payload for the caller.
    return await page.evaluate(() => {
        const w = window.engineDriver?.welcome;
        if (!w) return null;
        return {
            playerId: typeof w.playerId === 'bigint' ? w.playerId.toString() : String(w.playerId),
            session: w.session,
        };
    });
}

/**
 * Read the local player's position from the engine. Works in both solo and
 * online modes (the engine class is the same — see EngineDriver).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ x: number, y: number } | null>}
 */
export async function getLocalShipPosition(page) {
    return page.evaluate(() => {
        const p = window.gameEngine?.player;
        if (!p) return null;
        return { x: p.x, y: p.y };
    });
}

/**
 * Read a remote peer's rendered ship state from the engine. The MP wiring
 * isn't fully landed yet (sibling PRs A/B), so this helper checks several
 * locations the snapshot interpolator may publish to:
 *
 *   • `gameEngine.remotePlayers` — Map<id, { x, y, … }>
 *   • `gameEngine.remoteShips`   — Map<id, …>
 *   • `gameEngine.netState.peers` — also a Map keyed by id
 *
 * Once Phase 1 of the MP plan lands, one of these will be canonical and the
 * others can be dropped from the helper. For now the caller passes the
 * `remotePlayerId` (a stringified number/uuid) and we return null if no
 * matching peer is rendered yet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} remotePlayerId   stringified bigint / uuid
 * @returns {Promise<{ x: number, y: number } | null>}
 */
export async function getRemoteShipPosition(page, remotePlayerId) {
    return page.evaluate((idStr) => {
        const ge = window.gameEngine;
        if (!ge) return null;

        const candidates = [
            ge.remotePlayers,
            ge.remoteShips,
            ge.netState?.peers,
            ge.netState?.remotePlayers,
        ].filter((c) => c && typeof c === 'object');

        for (const map of candidates) {
            // Map-like
            if (typeof map.get === 'function') {
                const v = map.get(idStr) ?? map.get(Number(idStr));
                if (v && typeof v.x === 'number' && typeof v.y === 'number') {
                    return { x: v.x, y: v.y };
                }
            }
            // Plain object keyed by id
            const v = map[idStr] ?? map[Number(idStr)];
            if (v && typeof v.x === 'number' && typeof v.y === 'number') {
                return { x: v.x, y: v.y };
            }
        }
        return null;
    }, remotePlayerId);
}

/**
 * Hold a key down for `durationMs` and then release it. Useful for "thrust
 * forward for 1 second" actions where the caller wants the input pulse to be
 * deterministic.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key      Playwright key name (e.g. 'KeyW', 'w')
 * @param {number} durationMs
 */
export async function holdKey(page, key, durationMs) {
    await page.keyboard.down(key);
    await page.waitForTimeout(durationMs);
    await page.keyboard.up(key);
}
