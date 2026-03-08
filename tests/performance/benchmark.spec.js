/**
 * benchmark.spec.js — comprehensive performance benchmark
 *
 * Runs the full scenario matrix with rich telemetry collection and writes
 * a timestamped HTML + JSON report to benchmark/results/.
 *
 * Run with:
 *   npx playwright test benchmark --project=performance
 *   npm run benchmark
 */

import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
    loadGame, startGame, spawnAsteroids, spawnEnemies,
    spawnBackgroundStars, measureFrameStats, getPoolCounts,
} from '../helpers/game-helpers.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Spawn N explosion particles directly into the pool (bypasses MAX cap). */
async function spawnExplosions(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        const cx = ge.gameField.width / 2;
        const cy = ge.gameField.height / 2;
        for (let i = 0; i < n; i++) {
            const obj = ge.particlePool.pool.pop() || new (ge.particlePool.ObjectClass)();
            obj.reset(cx + (Math.random() - 0.5) * 600, cy + (Math.random() - 0.5) * 600, 'explosion');
            obj.life   = 20;
            obj.active = true;
            obj._poolIndex = ge.particlePool.activeObjects.length;
            ge.particlePool.activeObjects.push(obj);
        }
        return ge.particlePool.activeObjects.length;
    }, count);
}

/** Release everything from all pools (including stars) for a clean slate. */
async function clearAll(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const pools = [
            'asteroidPool', 'enemyPool', 'enemyBulletPool', 'bulletPool',
            'particlePool', 'lineDebrisPool', 'powerupPool',
            'backgroundStarPool', 'colorStarPool',
        ];
        for (const name of pools) {
            const pool = ge[name];
            if (!pool) continue;
            while (pool.activeObjects.length > 0) {
                pool.release(pool.activeObjects[pool.activeObjects.length - 1]);
            }
        }
    });
}

/** Collect Chrome GPU / renderer info via CDP. */
async function getGpuInfo(page) {
    try {
        const gpuInfo = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return { renderer: 'none', vendor: 'none', webglAvailable: false };
            const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                webglAvailable: true,
                renderer: dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                vendor:   dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
                version:  gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            };
        });
        return gpuInfo;
    } catch (_) {
        return { renderer: 'unknown', vendor: 'unknown', webglAvailable: false };
    }
}

/** Collect detailed frame-time histogram and per-scenario entity counts. */
async function fullMeasure(page, sampleCount = 120) {
    const stats  = await measureFrameStats(page, sampleCount);
    const counts = await getPoolCounts(page);
    return { stats, counts };
}

// ── scenario matrix ───────────────────────────────────────────────────────────

const SCENARIOS = [
    { label: 'Default (1 asteroid)',       asteroids: 1,  enemies: 0,  particles:  0, stars:  30 },
    { label: '5 asteroids',                asteroids: 5,  enemies: 0,  particles:  0, stars:  30 },
    { label: '10 asteroids',               asteroids: 10, enemies: 0,  particles:  0, stars:  30 },
    { label: '4 enemies',                  asteroids: 1,  enemies: 4,  particles:  0, stars:  30 },
    { label: '8 enemies',                  asteroids: 1,  enemies: 8,  particles:  0, stars:  30 },
    { label: '30 particles',               asteroids: 1,  enemies: 0,  particles: 30, stars:  30 },
    { label: '60 particles',               asteroids: 1,  enemies: 0,  particles: 60, stars:  30 },
    { label: '55 background stars',        asteroids: 1,  enemies: 0,  particles:  0, stars:  55 },
    { label: '200 background stars',       asteroids: 1,  enemies: 0,  particles:  0, stars: 200 },
    { label: 'Combat mid (5+4+30)',        asteroids: 5,  enemies: 4,  particles: 30, stars:  55 },
    { label: 'Combat heavy (10+8+60)',     asteroids: 10, enemies: 8,  particles: 60, stars:  55 },
    { label: 'Maximum stress (20+8+60)',   asteroids: 20, enemies: 8,  particles: 60, stars: 200 },
];

// ── report generation ────────────────────────────────────────────────────────

function buildJson(meta, rows) {
    return JSON.stringify({ meta, scenarios: rows }, null, 2);
}

function fmtFPS(n) { return n.toFixed(1).padStart(6); }
function fmtMs(n)  { return n.toFixed(1).padStart(8); }

function buildHtml(meta, rows) {
    const isSoftware = meta.gpu.renderer?.toLowerCase().includes('swiftshader') ||
                       meta.gpu.renderer?.toLowerCase().includes('llvmpipe')    ||
                       !meta.gpu.webglAvailable;
    const rendererClass = isSoftware ? 'software' : 'hardware';

    const tableRows = rows.map(r => `
        <tr>
          <td>${r.label}</td>
          <td class="num">${r.stats.fps.toFixed(1)}</td>
          <td class="num">${r.stats.mean.toFixed(1)}</td>
          <td class="num">${r.stats.p95.toFixed(1)}</td>
          <td class="num">${r.stats.p99.toFixed(1)}</td>
          <td class="num">${r.counts.asteroids}</td>
          <td class="num">${r.counts.enemies}</td>
          <td class="num">${r.counts.particles}</td>
          <td class="num">${r.counts.backgroundStars}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Rainboids Benchmark — ${meta.timestamp}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #0a0a1a; color: #c8e0ff; margin: 2rem; }
  h1   { color: #7af; }
  h2   { color: #a8d0ff; margin-top: 2rem; }
  .badge { display: inline-block; padding: .2em .6em; border-radius: 4px; font-weight: bold; }
  .hardware { background: #1a4a1a; color: #6f6; }
  .software { background: #4a1a1a; color: #f66; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem 2rem; max-width: 700px; }
  .meta-grid dt { color: #8af; }
  .meta-grid dd { margin: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { padding: .35rem .8rem; text-align: left; border-bottom: 1px solid #1a2a3a; }
  th { background: #111828; color: #8af; position: sticky; top: 0; }
  tr:hover { background: #0d1825; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .fps-good { color: #6f6; }
  .fps-ok   { color: #ff6; }
  .fps-bad  { color: #f66; }
  .note { margin-top: 1.5rem; padding: 1rem; background: #0d1825; border-left: 3px solid #45a; color: #aac; font-size: .9rem; }
</style>
</head>
<body>
<h1>🎮 Rainboids Performance Benchmark</h1>
<p>Generated: <strong>${meta.timestamp}</strong></p>

<h2>Environment</h2>
<dl class="meta-grid">
  <dt>Platform</dt>    <dd>${meta.platform}</dd>
  <dt>Rendering</dt>   <dd><span class="badge ${rendererClass}">${isSoftware ? 'Software (CPU)' : 'Hardware GPU'}</span></dd>
  <dt>GPU Renderer</dt><dd>${meta.gpu.renderer ?? 'N/A'}</dd>
  <dt>GPU Vendor</dt>  <dd>${meta.gpu.vendor ?? 'N/A'}</dd>
  <dt>WebGL Version</dt><dd>${meta.gpu.version ?? 'N/A'}</dd>
  <dt>Browser</dt>     <dd>${meta.headless ? 'Headless Chromium' : 'Headed Chromium'}</dd>
  <dt>Viewport</dt>    <dd>${meta.viewport}</dd>
  <dt>Branch</dt>      <dd>${meta.branch ?? 'unknown'}</dd>
</dl>

<h2>Scenario Results</h2>
<table>
  <thead>
    <tr>
      <th>Scenario</th>
      <th class="num">FPS</th>
      <th class="num">Mean (ms)</th>
      <th class="num">P95 (ms)</th>
      <th class="num">P99 (ms)</th>
      <th class="num">Asteroids</th>
      <th class="num">Enemies</th>
      <th class="num">Particles</th>
      <th class="num">Stars</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>

<div class="note">
  <strong>Headless vs Headful:</strong>
  Headless Chrome uses Skia's CPU software renderer, producing ~7–10 fps on this machine.
  Headful Chrome uses the system GPU (Metal on macOS, OpenGL/Vulkan on Linux) and typically
  runs at 30–60 fps. The <code>--use-gl=egl</code> flag was removed from the config because
  it is a Linux EGL hint that causes macOS to fall back to SwiftShader software rendering —
  worse than headless.
</div>
</body>
</html>`;
}

// ── test ─────────────────────────────────────────────────────────────────────

test.describe('Benchmark: comprehensive performance report', () => {

    test('full scenario matrix with telemetry export', async ({ page, browserName }) => {
        await loadGame(page);
        await startGame(page);

        const gpuInfo = await getGpuInfo(page);

        // Collect raw console output from the game
        const consoleLogs = [];
        page.on('console', msg => {
            if (msg.type() !== 'error') consoleLogs.push(msg.text());
        });

        const rows = [];

        for (const scenario of SCENARIOS) {
            await clearAll(page);

            if (scenario.stars     > 0) await spawnBackgroundStars(page, scenario.stars);
            if (scenario.asteroids > 0) await spawnAsteroids(page,      scenario.asteroids);
            if (scenario.enemies   > 0) await spawnEnemies(page,        scenario.enemies);
            if (scenario.particles > 0) await spawnExplosions(page,     scenario.particles);

            await page.waitForTimeout(300); // settle

            const { stats, counts } = await fullMeasure(page, 120);

            rows.push({ label: scenario.label, stats, counts });

            console.log(
                `  [${scenario.label.padEnd(30)}] ${fmtFPS(stats.fps)} fps` +
                `  mean=${fmtMs(stats.mean)}ms  p99=${fmtMs(stats.p99)}ms` +
                `  ast=${counts.asteroids} enemy=${counts.enemies} ptcl=${counts.particles}`
            );
        }

        // ── build report ────────────────────────────────────────────────────
        const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outDir = resolve(process.cwd(), 'benchmark', 'results');
        mkdirSync(outDir, { recursive: true });

        const meta = {
            timestamp:  new Date().toISOString(),
            platform:   process.platform,
            headless:   !!process.env.CI || page.context().browser()?.isConnected(),
            viewport:   '1280×720',
            branch:     process.env.GIT_BRANCH ?? 'opt',
            gpu:        gpuInfo,
            consoleLogs,
        };

        const jsonPath = resolve(outDir, `benchmark-${ts}.json`);
        const htmlPath = resolve(outDir, `benchmark-${ts}.html`);

        writeFileSync(jsonPath, buildJson(meta, rows));
        writeFileSync(htmlPath, buildHtml(meta, rows));

        console.log(`\n  ✔ JSON report: benchmark/results/benchmark-${ts}.json`);
        console.log(`  ✔ HTML report: benchmark/results/benchmark-${ts}.html`);

        // Soft assertion: default config should render at least 1 frame per second
        const defaultRow = rows[0];
        expect(defaultRow.stats.fps).toBeGreaterThan(1);
    });
});
