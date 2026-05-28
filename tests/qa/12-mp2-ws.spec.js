/**
 * tests/qa/12-mp2-ws.spec.js — two-client WebSocket multiplayer smoke (LEGACY
 * toy sim). The server is spawned with MP_SIM=toy to exercise the lightweight
 * fallback sim; the DEFAULT (real SP sim) co-op path is covered by
 * 13-mp-sphost.spec.js.
 *
 * Spawns the Node MP server on a test port, opens two browser tabs at
 * /mp.html?server=localhost:<port>, and verifies:
 *   1. both clients complete the handshake and see 2 players,
 *   2. input on client A propagates through the authoritative server and shows
 *      up as movement of A's remote ship in client B's interpolated view.
 *
 * The static page is served by the shared Playwright webServer (npm run dev,
 * :8090); only the MP game server is spawned here.
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MP_PORT = 8199;

function waitForHealthz(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: 'localhost', port, path: '/healthz' }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error('MP server healthz timeout'));
      else setTimeout(tryOnce, 150);
    };
    tryOnce();
  });
}

let server;

test.beforeAll(async () => {
  server = spawn('node', ['server/src/index.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, MP_PORT: String(MP_PORT), MP_SIM: 'toy' },
    stdio: 'ignore',
  });
  await waitForHealthz(MP_PORT);
});

test.afterAll(async () => {
  if (server) server.kill('SIGTERM');
});

test.describe('MULTIPLAYER — two-client WebSocket', () => {
  test('both clients connect and see each other; input propagates', async ({ browser }) => {
    const url = `/mp.html?server=localhost:${MP_PORT}`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    // Catch render-time throws (e.g. the SP shapes.js draw path) — the rAF loop
    // would otherwise swallow them while state updates keep flowing.
    const pageErrors = [];
    a.on('pageerror', (e) => pageErrors.push(String(e)));
    a.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    await a.goto(url);
    await b.goto(url);

    // Both connect.
    await expect.poll(() => a.evaluate(() => window.__mp?.connected())).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__mp?.connected())).toBe(true);

    // Both see 2 players in the roster.
    await expect.poll(() => a.evaluate(() => window.__mp.roster().length)).toBe(2);
    await expect.poll(() => b.evaluate(() => window.__mp.roster().length)).toBe(2);

    // Client B should render exactly one remote ship (client A).
    await expect.poll(() => b.evaluate(() => window.__mp.remoteShips().length)).toBe(1);

    // Both clients should receive the authoritative asteroid field.
    await expect.poll(() => a.evaluate(() => window.__mp.asteroidCount())).toBeGreaterThan(0);
    await expect.poll(() => b.evaluate(() => window.__mp.asteroidCount())).toBeGreaterThan(0);

    // The wave system advances once players are present (wave 1 ~3s in),
    // and enemies spawn during the active wave.
    await expect.poll(() => a.evaluate(() => window.__mp.wave()), { timeout: 9000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => a.evaluate(() => window.__mp.enemyCount()), { timeout: 9000 }).toBeGreaterThan(0);

    const aId = await a.evaluate(() => window.__mp.playerId());

    // Record A's ship x as seen by B, then drive A to the right.
    const beforeX = await b.evaluate((id) => {
      const r = window.__mp.remoteShips().find((s) => s.id === id);
      return r ? r.x : null;
    }, aId);
    expect(beforeX).not.toBeNull();

    // Hold "D" (move right) and "Space" (fire) on client A for ~1s real time.
    await a.bringToFront();
    await a.keyboard.down('Space');
    await a.keyboard.down('KeyD');
    await a.waitForTimeout(1000);
    await a.keyboard.up('KeyD');
    await a.keyboard.up('Space');

    // B's interpolated view of A's ship should have moved right.
    await expect
      .poll(() => b.evaluate((id) => {
        const r = window.__mp.remoteShips().find((s) => s.id === id);
        return r ? r.x : -1;
      }, aId), { timeout: 4000 })
      .toBeGreaterThan(beforeX + 20);

    // A's fire should produce server-authoritative bullets visible to B.
    await expect.poll(() => b.evaluate(() => window.__mp.bulletCount()), { timeout: 4000 })
      .toBeGreaterThan(0);

    // The SP shapes.js render path (ships/enemies) must not throw at runtime.
    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);

    await ctxA.close();
    await ctxB.close();
  });

  test('separate room codes isolate players', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await a.goto(`/mp.html?server=localhost:${MP_PORT}&room=alpha`);
    await b.goto(`/mp.html?server=localhost:${MP_PORT}&room=beta`);

    await expect.poll(() => a.evaluate(() => window.__mp?.connected())).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__mp?.connected())).toBe(true);

    // Different rooms → each sees only itself, no remote ships.
    await expect.poll(() => a.evaluate(() => window.__mp.roster().length)).toBe(1);
    await expect.poll(() => b.evaluate(() => window.__mp.roster().length)).toBe(1);
    expect(await a.evaluate(() => window.__mp.remoteShips().length)).toBe(0);

    await ctxA.close();
    await ctxB.close();
  });

  test('title screen MULTIPLAYER button navigates to mp.html', async ({ page }) => {
    await page.goto('/');
    // Canvas-drawn title buttons; click the multiplayer rect the same way
    // QA-02 clicks NEW GAME (convert canvas px → client coords).
    await page.waitForFunction(
      () => window.gameEngine?._titleButtonRects?.multiplayer,
      { timeout: 15000 },
    );
    const pos = await page.evaluate(() => {
      const ge = window.gameEngine;
      const r = ge._titleButtonRects.multiplayer;
      const c = ge.canvas;
      const cb = c.getBoundingClientRect();
      return {
        x: cb.left + (r.x + r.w / 2) * (cb.width / c.width),
        y: cb.top + (r.y + r.h / 2) * (cb.height / c.height),
      };
    });
    await page.mouse.click(pos.x, pos.y);
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain('mp.html');
  });

  // Runs last: it restarts the shared server (leaving a live one for afterAll).
  test('client auto-reconnects after a server restart', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/mp.html?server=localhost:${MP_PORT}`);
    await expect.poll(() => page.evaluate(() => window.__mp?.connected())).toBe(true);

    // Hard-kill the server → the TCP drop makes the client detect it.
    const exited = new Promise((r) => server.on('exit', r));
    server.kill('SIGKILL');
    await exited;
    await expect.poll(() => page.evaluate(() => window.__mp?.connected()), { timeout: 6000 }).toBe(false);

    // Bring the server back on the same port → client should auto-reconnect.
    server = spawn('node', ['server/src/index.js'], {
      cwd: REPO_ROOT,
      env: { ...process.env, MP_PORT: String(MP_PORT), MP_SIM: 'toy' },
      stdio: 'ignore',
    });
    await waitForHealthz(MP_PORT);
    await expect.poll(() => page.evaluate(() => window.__mp?.connected()), { timeout: 10000 }).toBe(true);

    await ctx.close();
  });
});
