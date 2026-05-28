/**
 * tests/qa/14-mp-boss.spec.js — modular boss renders in the MP client.
 *
 * Boots the default (real SP sim) MP server with MP_START_WAVE=3 so the
 * stage-1 modular boss (Harbinger — multi-phase + orbiting shield parts) spawns
 * immediately, then verifies a browser client receives + renders it: the boss
 * appears, its orbiting parts stream + draw, and the SP shapes / boss-parts
 * render path throws nothing.
 *
 * Static page served by the shared Playwright webServer (npm run dev, :8090).
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MP_PORT = 8201;

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
      if (Date.now() > deadline) reject(new Error('MP boss server healthz timeout'));
      else setTimeout(tryOnce, 150);
    };
    tryOnce();
  });
}

let server;

test.beforeAll(async () => {
  server = spawn('node', ['server/src/index.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, MP_PORT: String(MP_PORT), MP_START_WAVE: '3' }, // open on the stage-1 boss wave
    stdio: 'ignore',
  });
  await waitForHealthz(MP_PORT);
});

test.afterAll(async () => {
  if (server) server.kill('SIGTERM');
});

test.describe('MULTIPLAYER — modular boss renders (real SP sim)', () => {
  test('the stage-1 boss + its orbiting parts stream and render without error', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    await page.goto(`/mp.html?server=localhost:${MP_PORT}&room=boss`);
    await expect.poll(() => page.evaluate(() => window.__mp?.connected())).toBe(true);

    // The modular boss spawns immediately on wave 3.
    await expect.poll(() => page.evaluate(() => window.__mp.wave()), { timeout: 9000 }).toBe(3);
    await expect.poll(() => page.evaluate(() => window.__mp.bossCount()), { timeout: 9000 }).toBeGreaterThan(0);
    // Its orbiting shield parts (bolt-heads) reach the client + render.
    await expect.poll(() => page.evaluate(() => window.__mp.bossPartCount()), { timeout: 9000 }).toBeGreaterThan(0);

    // Let it run a bit so the boss-parts + phase/intro render paths exercise.
    await page.waitForTimeout(1500);

    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);

    await ctx.close();
  });
});
