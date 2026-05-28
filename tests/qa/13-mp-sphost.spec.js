/**
 * tests/qa/13-mp-sphost.spec.js — two-client co-op smoke against the DEFAULT MP
 * sim, which is now the REAL single-player simulation (SpHost / SpRoom, Path A).
 *
 * The server is spawned with NO MP_SIM override, so this exercises exactly what
 * production serves. It proves the user-facing goal end-to-end: the real SP
 * weapons/enemies/asteroids/waves stream over the wire and render with the SAME
 * SP shapes.js path the single-player game uses — graphical parity, in a real
 * browser, with two pilots in one shared arena.
 *
 * Static page served by the shared Playwright webServer (npm run dev, :8090);
 * only the MP game server is spawned here, on its own port.
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MP_PORT = 8200;

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
      if (Date.now() > deadline) reject(new Error('MP sphost server healthz timeout'));
      else setTimeout(tryOnce, 150);
    };
    tryOnce();
  });
}

let server;

test.beforeAll(async () => {
  server = spawn('node', ['server/src/index.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, MP_PORT: String(MP_PORT) }, // no MP_SIM → the default (real SP sim)
    stdio: 'ignore',
  });
  await waitForHealthz(MP_PORT);
});

test.afterAll(async () => {
  if (server) server.kill('SIGTERM');
});

test.describe('MULTIPLAYER — co-op on the DEFAULT (real SP) sim', () => {
  test('two pilots share the real-sim arena; movement + fire render via SP shapes', async ({ browser }) => {
    const url = `/mp.html?server=localhost:${MP_PORT}&room=sphost-coop`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    // Catch render-time throws — the SP shapes.js draw path runs against the
    // REAL enemy types / asteroid fields here, so a bad shape mapping would
    // surface as a pageerror the rAF loop otherwise swallows.
    const pageErrors = [];
    a.on('pageerror', (e) => pageErrors.push(String(e)));
    a.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    await a.goto(url);
    await b.goto(url);

    // Both connect + see each other.
    await expect.poll(() => a.evaluate(() => window.__mp?.connected())).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__mp?.connected())).toBe(true);
    await expect.poll(() => a.evaluate(() => window.__mp.roster().length)).toBe(2);
    await expect.poll(() => b.evaluate(() => window.__mp.roster().length)).toBe(2);

    // B renders exactly one remote ship (client A).
    await expect.poll(() => b.evaluate(() => window.__mp.remoteShips().length)).toBe(1);

    // The REAL SP wave driver spawns wave 1 immediately: asteroids + enemies.
    await expect.poll(() => a.evaluate(() => window.__mp.asteroidCount())).toBeGreaterThan(0);
    await expect.poll(() => a.evaluate(() => window.__mp.wave())).toBeGreaterThanOrEqual(1);
    await expect.poll(() => a.evaluate(() => window.__mp.enemyCount())).toBeGreaterThan(0);
    // The varied real-sim roster reaches the client (wave 1 = HUNTER + WASP) and
    // each renders with its OWN SP shape — not all collapsed to one silhouette.
    await expect.poll(() => a.evaluate(() => window.__mp.enemyTypes().length)).toBeGreaterThanOrEqual(2);

    const aId = await a.evaluate(() => window.__mp.playerId());

    // Record A's ship x as seen by B, then immediately drive A right + fire.
    // (Driving early matters: an idle ship spawned dead-center is overrun by the
    // REAL wave-1 swarm — a moving ship escapes it, exactly like single-player.)
    const beforeX = await b.evaluate((id) => {
      const r = window.__mp.remoteShips().find((s) => s.id === id);
      return r ? r.x : null;
    }, aId);
    expect(beforeX).not.toBeNull();

    await a.bringToFront();
    await a.keyboard.down('Space');
    await a.keyboard.down('KeyD');

    // B's interpolated view of A's ship moves right (authoritative real-sim physics).
    await expect
      .poll(() => b.evaluate((id) => {
        const r = window.__mp.remoteShips().find((s) => s.id === id);
        return r ? r.x : -1;
      }, aId), { timeout: 5000 })
      .toBeGreaterThan(beforeX + 20);

    // A's fire produced server-authoritative SP bullets visible to B.
    await expect.poll(() => b.evaluate(() => window.__mp.bulletCount()), { timeout: 5000 })
      .toBeGreaterThan(0);

    // Client re-derives explosion particles from the event stream: a death or a
    // ship-down (idle B is overrun by the swarm) bursts shrapnel on A's view.
    await expect.poll(() => a.evaluate(() => window.__mp.particleCount()), { timeout: 8000 })
      .toBeGreaterThan(0);

    await a.keyboard.up('KeyD');
    await a.keyboard.up('Space');

    // The SP shapes.js render path (ships/enemies/asteroids) must not throw.
    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);

    await ctxA.close();
    await ctxB.close();
  });
});
