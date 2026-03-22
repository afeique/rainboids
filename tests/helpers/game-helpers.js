/**
 * Shared helpers for Rainboids Playwright test suite.
 *
 * All helpers operate on a Playwright `page` object and communicate with the
 * game via `page.evaluate()`, which has access to the global `window.gameEngine`.
 */

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Navigate to the game and wait for `window.gameEngine` to be set.
 * Also waits for the sfxr audio library (or its 5-second timeout) so the
 * game is fully ready before proceeding.
 */
export async function loadGame(page) {
    await page.goto('/');

    // Wait for the game engine to be instantiated
    await page.waitForFunction(() => window.gameEngine !== undefined, {
        timeout: 20_000,
    });

    // Wait for the game loop to start (state is set in constructor)
    await page.waitForFunction(
        () => window.gameEngine && window.gameEngine.game,
        { timeout: 10_000 }
    );
}

/**
 * Transition from TITLE_SCREEN → PLAYING by:
 *  1. Directly calling gameEngine.init() (starts WAVE_TRANSITION)
 *  2. Waiting for the wave transition to naturally complete (2s delay)
 * This is equivalent to what happens on first click/keydown.
 */
export async function startGame(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        if (!ge) throw new Error('gameEngine not found on window');

        if (ge.game.state === 'TITLE_SCREEN') {
            try { ge.audioManager?.initializeAudio?.(); } catch (_) {}
            ge.init();
        }
    });

    // Wait for wave transition to finish and game to enter PLAYING state
    await page.waitForFunction(
        () => window.gameEngine?.game?.state === 'PLAYING',
        { timeout: 10_000 }
    );
}

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

export async function getGameState(page) {
    return page.evaluate(() => window.gameEngine?.game?.state);
}

export async function getPoolCounts(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        if (!ge) return null;
        return {
            particles:        ge.particlePool?.activeObjects?.length ?? 0,
            bullets:          ge.bulletPool?.activeObjects?.length ?? 0,
            asteroids:        ge.asteroidPool?.activeObjects?.length ?? 0,
            enemies:          ge.enemyPool?.activeObjects?.length ?? 0,
            enemyBullets:     ge.enemyBulletPool?.activeObjects?.length ?? 0,
            colorStars:       ge.colorStarPool?.activeObjects?.length ?? 0,
            backgroundStars:  ge.backgroundStarPool?.activeObjects?.length ?? 0,
            lineDebris:       ge.lineDebrisPool?.activeObjects?.length ?? 0,
            powerups:         ge.powerupPool?.activeObjects?.length ?? 0,
        };
    });
}

export async function getPlayerInfo(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        if (!ge || !ge.player) return null;
        const p = ge.player;
        return {
            x:      p.x,
            y:      p.y,
            health: p.health,
            active: p.active,
            angle:  p.angle,
        };
    });
}

// ---------------------------------------------------------------------------
// Stress-spawning helpers
// ---------------------------------------------------------------------------

/** Spawn N asteroids in random positions and return the new active count. */
export async function spawnAsteroids(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        for (let i = 0; i < n; i++) {
            const x = Math.random() * ge.gameField.width;
            const y = Math.random() * ge.gameField.height;
            const r = 30 + Math.random() * 30;
            ge.asteroidPool.get(x, y, r, 1);
        }
        return ge.asteroidPool.activeObjects.length;
    }, count);
}

/** Spawn N explosion particles at the centre of the game field. */
export async function spawnParticles(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        const cx = ge.gameField.width / 2;
        const cy = ge.gameField.height / 2;
        for (let i = 0; i < n; i++) {
            // Bypass the MAX_PARTICLES cap for stress tests by temporarily raising it
            ge.particlePool.get(
                cx + (Math.random() - 0.5) * 200,
                cy + (Math.random() - 0.5) * 200,
                'explosion'
            );
        }
        return ge.particlePool.activeObjects.length;
    }, count);
}

/** Spawn N background stars. */
export async function spawnBackgroundStars(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        for (let i = 0; i < n; i++) {
            const x = Math.random() * ge.gameField.width;
            const y = Math.random() * ge.gameField.height;
            const z = 0.3 + Math.random() * 3.5;
            ge.backgroundStarPool.get(x, y, z, 0.5);
        }
        return ge.backgroundStarPool.activeObjects.length;
    }, count);
}

/** Spawn N enemies of type HUNTER. */
export async function spawnEnemies(page, count) {
    return page.evaluate((n) => {
        const ge = window.gameEngine;
        for (let i = 0; i < n; i++) {
            const x = Math.random() * ge.gameField.width;
            const y = Math.random() * ge.gameField.height;
            ge.enemyPool.get(x, y, 'HUNTER', 1);
        }
        return ge.enemyPool.activeObjects.length;
    }, count);
}

/** Override MAX_PARTICLES in GAME_CONFIG so particle stress tests aren't capped. */
export async function setMaxParticles(page, limit) {
    return page.evaluate((lim) => {
        // Access GAME_CONFIG through the engine (it's referenced there)
        if (window.__GAME_CONFIG__) {
            window.__GAME_CONFIG__.MAX_PARTICLES = lim;
        }
        // Also patch the pool directly
        const ge = window.gameEngine;
        if (ge && ge.particlePool) {
            // Allow the pool to grow beyond the normal cap for stress testing
            ge._stressTestMaxParticles = lim;
        }
    }, limit);
}

// ---------------------------------------------------------------------------
// FPS measurement
// ---------------------------------------------------------------------------

/**
 * Measure the page's requestAnimationFrame rate over `durationMs`.
 * Returns frames-per-second as a number.
 */
export async function measureFPS(page, durationMs = 2000) {
    return page.evaluate((duration) => {
        return new Promise((resolve) => {
            let frames = 0;
            let startTime = null;

            function tick(timestamp) {
                if (startTime === null) {
                    startTime = timestamp;
                }
                frames++;
                if (timestamp - startTime < duration) {
                    requestAnimationFrame(tick);
                } else {
                    const elapsedSec = (timestamp - startTime) / 1000;
                    resolve(frames / elapsedSec);
                }
            }

            requestAnimationFrame(tick);
        });
    }, durationMs);
}

/**
 * Measure frame time statistics (mean, p95, p99) over `sampleCount` frames.
 * Returns { mean, p50, p95, p99, min, max } in milliseconds.
 */
export async function measureFrameStats(page, sampleCount = 120) {
    return page.evaluate((count) => {
        return new Promise((resolve) => {
            const samples = [];
            let last = null;

            function tick(timestamp) {
                if (last !== null) {
                    samples.push(timestamp - last);
                }
                last = timestamp;

                if (samples.length < count) {
                    requestAnimationFrame(tick);
                } else {
                    const sorted = [...samples].sort((a, b) => a - b);
                    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
                    resolve({
                        mean,
                        p50:  sorted[Math.floor(sorted.length * 0.50)],
                        p95:  sorted[Math.floor(sorted.length * 0.95)],
                        p99:  sorted[Math.floor(sorted.length * 0.99)],
                        min:  sorted[0],
                        max:  sorted[sorted.length - 1],
                        fps:  1000 / mean,
                    });
                }
            }

            requestAnimationFrame(tick);
        });
    }, sampleCount);
}

// ---------------------------------------------------------------------------
// Weapon helpers
// ---------------------------------------------------------------------------

/** Get the player's currently equipped primary weapon ID. */
export async function getActivePrimary(page) {
    return page.evaluate(() => window.gameEngine?.player?.activePrimary);
}

/** Get the set of owned primary weapon IDs as an array. */
export async function getOwnedPrimaries(page) {
    return page.evaluate(() => {
        const p = window.gameEngine?.player;
        return p ? [...p.ownedPrimaries] : [];
    });
}

/** Equip a primary weapon by ID. Returns true if successful. */
export async function equipPrimary(page, weaponId) {
    return page.evaluate((id) => {
        const p = window.gameEngine?.player;
        if (!p || !p.ownedPrimaries.has(id)) return false;
        p.equipPrimary(id);
        return p.activePrimary === id;
    }, weaponId);
}

// ---------------------------------------------------------------------------
// Canvas pixel helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the canvas has any non-black pixels (i.e., something is drawn).
 */
export async function canvasHasContent(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return true;
        }
        return false;
    });
}

/**
 * Capture the average brightness of the canvas (0–255).
 */
export async function canvasBrightness(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return 0;
        const ctx = canvas.getContext('2d');
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        const pixels = (width * height);
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        return sum / pixels;
    });
}

// ---------------------------------------------------------------------------
// Formatting helpers (for perf test output)
// ---------------------------------------------------------------------------

export function fmtFPS(fps) {
    return `${fps.toFixed(1)} fps`;
}

export function fmtMs(ms) {
    return `${ms.toFixed(2)} ms`;
}

export function perfTable(rows) {
    const header = `${'Scenario'.padEnd(40)}  ${'FPS'.padEnd(8)}  ${'Mean'.padEnd(10)}  ${'P95'.padEnd(10)}  P99`;
    const hr = '─'.repeat(header.length);
    const lines = ['\n', hr, header, hr];
    for (const r of rows) {
        lines.push(
            `${r.label.padEnd(40)}  ${fmtFPS(r.fps).padEnd(8)}  ${fmtMs(r.mean).padEnd(10)}  ${fmtMs(r.p95).padEnd(10)}  ${fmtMs(r.p99)}`
        );
    }
    lines.push(hr);
    return lines.join('\n');
}
