/**
 * tests/qa/12-mp2-ws.spec.js — two-client WebSocket multiplayer smoke.
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
    env: { ...process.env, MP_PORT: String(MP_PORT) },
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

    // Enemies spawn once players are present (first spawn ~1.5s).
    await expect.poll(() => a.evaluate(() => window.__mp.enemyCount()), { timeout: 8000 }).toBeGreaterThan(0);

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

    await ctxA.close();
    await ctxB.close();
  });
});
