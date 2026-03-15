/**
 * Juice tuning video capture tool.
 *
 * Records short gameplay clips as .webm video files for reviewing
 * high-frequency visual effects (screen shake, hitstop, hit flash,
 * engine thrust) that single screenshots can't capture.
 *
 * Usage:
 *   node juice-capture.mjs                    # default 10s clip
 *   node juice-capture.mjs --duration 5       # 5s clip
 *   node juice-capture.mjs --scenario impact  # specific test scenario
 *
 * Scenarios:
 *   idle      — ship sits still, showing idle engine state
 *   thrust    — idle → thrust → drift → restart cycle
 *   impact    — fly into asteroid, show collision juice
 *   combat    — spawn enemies nearby, take hits
 *   all       — run all scenarios sequentially (default)
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const URL = 'http://localhost:8090';
const OUT_DIR = 'juice-clips';
const args = process.argv.slice(2);
const duration = parseInt(args.find((_, i, a) => a[i - 1] === '--duration') || '8') * 1000;
const scenario = args.find((_, i, a) => a[i - 1] === '--scenario') || 'all';

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR);

async function startGame(page) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.gameEngine.init());
    await page.waitForTimeout(1000);
}

async function recordScenario(name, setupFn, durationMs = 6000) {
    console.log(`\n▶ Recording scenario: ${name} (${durationMs / 1000}s)`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
        viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    await startGame(page);
    await setupFn(page);
    await page.waitForTimeout(durationMs);

    // Get video path before closing
    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    // Rename to something descriptive
    const { renameSync } = await import('fs');
    const finalPath = `${OUT_DIR}/juice-${name}.webm`;
    try { renameSync(videoPath, finalPath); } catch { /* video may already be named */ }
    console.log(`  ✓ Saved ${finalPath}`);

    // Also capture key frames as screenshots for quick review
    return finalPath;
}

// ── Scenario definitions ─────────────────────────────────────────────

async function scenarioIdle(page) {
    // Just let the ship sit — show idle engine state
    await page.evaluate(() => {
        const ih = window.gameEngine.inputHandler;
        ih.input.aimX = window.gameEngine.player.x + 200;
        ih.input.aimY = window.gameEngine.player.y;
    });
}

async function scenarioThrust(page) {
    const ih = () => page.evaluate(() => window.gameEngine.inputHandler.input);

    // Phase 1: idle (2s)
    await page.evaluate(() => {
        const ih = window.gameEngine.inputHandler;
        ih.input.aimX = window.gameEngine.player.x + 200;
        ih.input.aimY = window.gameEngine.player.y;
    });
    await page.waitForTimeout(2000);

    // Phase 2: thrust right (2s)
    await page.evaluate(() => { window.gameEngine.inputHandler.input.right = true; });
    await page.waitForTimeout(2000);

    // Phase 3: stop, drift (2s)
    await page.evaluate(() => { window.gameEngine.inputHandler.input.right = false; });
    await page.waitForTimeout(2000);

    // Phase 4: restart engines (after idle gap)
    await page.evaluate(() => { window.gameEngine.inputHandler.input.up = true; });
}

async function scenarioImpact(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.cheats.onePunchMan = false;
        // Place player near center, aim right
        ge.player.x = 400;
        ge.player.y = 360;
        ge.inputHandler.input.aimX = 600;
        ge.inputHandler.input.aimY = 360;
    });
    await page.waitForTimeout(500);

    // Spawn asteroid right in front of player and push player toward it
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const ast = ge.asteroidPool.activeObjects[0];
        if (ast) {
            ast.x = ge.player.x + 120;
            ast.y = ge.player.y;
            ast.vel.x = -1;
            ast.vel.y = 0;
        }
        // Thrust player into asteroid
        ge.inputHandler.input.right = true;
    });
    await page.waitForTimeout(2000);

    // Second collision from different angle
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.inputHandler.input.right = false;
        ge.player.invincible = false; // clear invincibility for second test
        ge.player.invincibilityTimer = 0;
        const ast = ge.asteroidPool.activeObjects[0];
        if (ast) {
            ast.x = ge.player.x;
            ast.y = ge.player.y - 100;
            ast.vel.x = 0;
            ast.vel.y = 2;
        }
    });
}

async function scenarioCombat(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.cheats.onePunchMan = false;
        ge.player.x = 640;
        ge.player.y = 360;
        ge.inputHandler.input.aimX = 640;
        ge.inputHandler.input.aimY = 200;
        // Spawn a nearby enemy
        ge.spawnLeveledEnemies('HUNTER', 1);
    });

    // Move around and let combat happen
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.gameEngine.inputHandler.input.right = true; });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        window.gameEngine.inputHandler.input.right = false;
        window.gameEngine.inputHandler.input.left = true;
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        window.gameEngine.inputHandler.input.left = false;
        window.gameEngine.inputHandler.input.up = true;
    });
}

// ── Main ─────────────────────────────────────────────────────────────

const scenarios = {
    idle: scenarioIdle,
    thrust: scenarioThrust,
    impact: scenarioImpact,
    combat: scenarioCombat,
};

(async () => {
    const toRun = scenario === 'all' ? Object.keys(scenarios) : [scenario];

    for (const name of toRun) {
        if (!scenarios[name]) {
            console.error(`Unknown scenario: ${name}`);
            continue;
        }
        await recordScenario(name, scenarios[name], duration);
    }

    console.log(`\nDone! Videos in ${OUT_DIR}/`);
    console.log('Play with: open juice-clips/juice-*.webm');
})();
