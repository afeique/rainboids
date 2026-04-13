/**
 * VFX Telemetry test helpers — enable, query, and assert on per-frame VFX state.
 *
 * Works with the in-game vfx-telemetry.js module which records effect state
 * every frame into window.__vfxFrames when enabled.
 */

/**
 * Enable VFX telemetry recording in the game.
 * Call BEFORE startGame() or immediately after loadGame().
 */
export async function enableVFXTelemetry(page) {
    await page.evaluate(() => {
        window.__VFX_TELEMETRY__ = true;
    });
}

/**
 * Get the last N telemetry frames.
 * @param {number} n — number of frames to retrieve (default 60 = 1 second)
 * @returns {Array} frame records
 */
export async function getVFXFrames(page, n = 60) {
    return page.evaluate((count) => {
        const buf = window.__vfxFrames;
        if (!buf || !buf.length) return [];
        return buf.slice(-count);
    }, n);
}

/**
 * Get all telemetry frames since the last clear.
 */
export async function getAllVFXFrames(page) {
    return page.evaluate(() => window.__vfxFrames || []);
}

/**
 * Clear the telemetry buffer and reset frame counter.
 */
export async function clearVFXBuffer(page) {
    await page.evaluate(() => {
        if (window.__vfxClear) window.__vfxClear();
    });
}

/**
 * Get total frame count recorded.
 */
export async function getVFXFrameCount(page) {
    return page.evaluate(() => window.__vfxFrameCount || 0);
}

/**
 * Wait until at least N frames have been recorded since last clear.
 */
export async function waitForVFXFrames(page, n, timeout = 5000) {
    await page.waitForFunction(
        (count) => (window.__vfxFrameCount || 0) >= count,
        n,
        { timeout }
    );
}

/**
 * Sample average brightness of a canvas region (0-255).
 * Useful for validating that flash effects actually render brighter pixels.
 */
export async function sampleRegionBrightness(page, x, y, w, h) {
    return page.evaluate(({ x, y, w, h }) => {
        const ge = window.gameEngine;
        if (!ge || !ge.ctx) return 0;
        const data = ge.ctx.getImageData(
            Math.max(0, Math.round(x)),
            Math.max(0, Math.round(y)),
            Math.round(w),
            Math.round(h)
        ).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        return sum / (w * h);
    }, { x, y, w, h });
}

/**
 * Sample brightness of a region centered on the player's screen position.
 */
export async function samplePlayerBrightness(page, size = 40) {
    return page.evaluate((sz) => {
        const ge = window.gameEngine;
        if (!ge || !ge.player || !ge.player.active) return 0;
        const sx = ge.player.x - ge.camera.x - sz / 2;
        const sy = ge.player.y - ge.camera.y - sz / 2;
        const data = ge.ctx.getImageData(
            Math.max(0, Math.round(sx)),
            Math.max(0, Math.round(sy)),
            sz, sz
        ).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        return sum / (sz * sz);
    }, size);
}

// ── Analysis utilities ──────────────────────────────────────────────────────

/**
 * Analyze telemetry frames for VFX quality metrics.
 * Returns a structured report of effect occurrences, durations, and issues.
 */
export function analyzeVFXFrames(frames) {
    if (!frames.length) return { error: 'No frames to analyze' };

    const durationMs = frames.length > 1
        ? frames[frames.length - 1].ts - frames[0].ts
        : 0;
    const durationS = durationMs / 1000;
    const totalFrames = frames.length;

    // ── Hitstop analysis ──
    let hitstopSegments = [];
    let currentHitstop = null;
    for (const f of frames) {
        if (f.hitstopFrames > 0) {
            if (!currentHitstop) {
                currentHitstop = { startFrame: f.frame, startVal: f.hitstopFrames, frames: 1 };
            } else {
                currentHitstop.frames++;
            }
        } else if (currentHitstop) {
            hitstopSegments.push(currentHitstop);
            currentHitstop = null;
        }
    }
    if (currentHitstop) hitstopSegments.push(currentHitstop);

    const hitstopTotalFrames = hitstopSegments.reduce((s, h) => s + h.frames, 0);

    // ── Screen shake analysis ──
    const shakeFrames = frames.filter(f => f.screenShake.duration > 0);
    const peakShake = Math.max(0, ...frames.map(f => f.screenShake.magnitude));

    // ── Screen flash analysis ──
    const flashFrames = frames.filter(f => f.screenFlash.timer > 0);

    // ── Camera kick analysis ──
    const kickFrames = frames.filter(f => Math.abs(f.cameraKick.x) > 0.5 || Math.abs(f.cameraKick.y) > 0.5);
    const peakKick = Math.max(0, ...frames.map(f => Math.hypot(f.cameraKick.x, f.cameraKick.y)));

    // ── Muzzle flash analysis ──
    const muzzleFlashFrames = frames.filter(f => f.player && f.player.muzzleFlash > 0);

    // ── Entity hit flashes ──
    let hitFlashEvents = 0;
    let deathFlashEvents = 0;
    let prevEntityFlashes = new Set();
    for (const f of frames) {
        for (const ef of f.entityFlashes) {
            // Use pool + approximate position + type as entity key
            // Position rounded to 5px grid to handle minor movement
            const gx = Math.round(ef.x / 5) * 5;
            const gy = Math.round(ef.y / 5) * 5;
            const key = `${ef.pool}_${gx}_${gy}_${ef.type}`;
            if (!prevEntityFlashes.has(key)) {
                // New flash event (not seen in previous frame)
                if (ef.type === 'hit') hitFlashEvents++;
                if (ef.type === 'death') deathFlashEvents++;
            }
        }
        prevEntityFlashes = new Set(f.entityFlashes.map(ef => {
            const gx = Math.round(ef.x / 5) * 5;
            const gy = Math.round(ef.y / 5) * 5;
            return `${ef.pool}_${gx}_${gy}_${ef.type}`;
        }));
    }

    // ── Death flash completeness — check that timers count down to 0 ──
    const deathFlashSequences = [];
    const trackedDeaths = new Map(); // key → array of timer values
    for (const f of frames) {
        const currentKeys = new Set();
        for (const ef of f.entityFlashes) {
            if (ef.type === 'death') {
                const key = `${ef.pool}_${ef.x}_${ef.y}`;
                currentKeys.add(key);
                if (!trackedDeaths.has(key)) {
                    trackedDeaths.set(key, []);
                }
                trackedDeaths.get(key).push(ef.timer);
            }
        }
        // Check for deaths that disappeared
        for (const [key, timers] of trackedDeaths) {
            if (!currentKeys.has(key) && timers.length > 0) {
                deathFlashSequences.push({
                    key,
                    timers: [...timers],
                    completedToZero: timers[timers.length - 1] <= 1,
                });
                trackedDeaths.delete(key);
            }
        }
    }

    // ── Particle analysis ──
    const peakParticles = Math.max(0, ...frames.map(f => f.totalParticles));
    const avgParticles = frames.reduce((s, f) => s + f.totalParticles, 0) / totalFrames;

    // Particle type breakdown at peak
    let peakParticleFrame = frames[0];
    for (const f of frames) {
        if (f.totalParticles > peakParticleFrame.totalParticles) {
            peakParticleFrame = f;
        }
    }

    // ── Hitstop feedback loop detection ──
    // Check if hitstop > 50% of frames (indicates freeze bug)
    const hitstopRatio = hitstopTotalFrames / totalFrames;

    // Check for rapid consecutive hitstop segments
    let rapidHitstops = 0;
    for (let i = 1; i < hitstopSegments.length; i++) {
        const gap = hitstopSegments[i].startFrame -
            (hitstopSegments[i - 1].startFrame + hitstopSegments[i - 1].frames);
        if (gap <= 2) rapidHitstops++;
    }

    return {
        duration: { frames: totalFrames, seconds: Math.round(durationS * 10) / 10 },
        hitstop: {
            segments: hitstopSegments.length,
            totalFrames: hitstopTotalFrames,
            ratio: Math.round(hitstopRatio * 1000) / 1000,
            longestSegment: hitstopSegments.length
                ? Math.max(...hitstopSegments.map(s => s.frames))
                : 0,
            rapidConsecutive: rapidHitstops,
            freezeRisk: hitstopRatio > 0.4 || rapidHitstops > 5,
        },
        screenShake: {
            activeFrames: shakeFrames.length,
            peakMagnitude: Math.round(peakShake * 10) / 10,
            ratio: Math.round((shakeFrames.length / totalFrames) * 1000) / 1000,
        },
        screenFlash: {
            activeFrames: flashFrames.length,
            ratio: Math.round((flashFrames.length / totalFrames) * 1000) / 1000,
        },
        cameraKick: {
            activeFrames: kickFrames.length,
            peakMagnitude: Math.round(peakKick * 10) / 10,
        },
        muzzleFlash: {
            activeFrames: muzzleFlashFrames.length,
            ratio: Math.round((muzzleFlashFrames.length / totalFrames) * 1000) / 1000,
            detected: muzzleFlashFrames.length > 0,
        },
        entityFlashes: {
            hitEvents: hitFlashEvents,
            deathEvents: deathFlashEvents,
            deathSequences: deathFlashSequences.length,
            deathsCompletedCleanly: deathFlashSequences.filter(d => d.completedToZero).length,
        },
        particles: {
            peak: peakParticles,
            average: Math.round(avgParticles),
            peakBreakdown: peakParticleFrame.particleCounts,
        },
    };
}

/**
 * Generate a human-readable VFX quality report from telemetry.
 */
export function generateVFXReport(analysis) {
    const lines = [];
    const a = analysis;

    lines.push(`═══ VFX Telemetry Report ═══`);
    lines.push(`Duration: ${a.duration.frames} frames (${a.duration.seconds}s)`);
    lines.push('');

    // ── Hitstop ──
    lines.push(`── Hitstop ──`);
    lines.push(`  Segments: ${a.hitstop.segments}`);
    lines.push(`  Total frames in hitstop: ${a.hitstop.totalFrames} (${(a.hitstop.ratio * 100).toFixed(1)}%)`);
    lines.push(`  Longest segment: ${a.hitstop.longestSegment} frames`);
    if (a.hitstop.freezeRisk) {
        lines.push(`  ⚠ FREEZE RISK: ${a.hitstop.ratio > 0.3 ? 'hitstop ratio > 30%' : ''} ${a.hitstop.rapidConsecutive > 5 ? `${a.hitstop.rapidConsecutive} rapid consecutive segments` : ''}`);
    } else {
        lines.push(`  ✓ No freeze risk detected`);
    }
    lines.push('');

    // ── Screen effects ──
    lines.push(`── Screen Effects ──`);
    lines.push(`  Screen shake: ${a.screenShake.activeFrames} frames (${(a.screenShake.ratio * 100).toFixed(1)}%), peak ${a.screenShake.peakMagnitude}`);
    lines.push(`  Screen flash: ${a.screenFlash.activeFrames} frames (${(a.screenFlash.ratio * 100).toFixed(1)}%)`);
    lines.push(`  Camera kick: ${a.cameraKick.activeFrames} frames, peak ${a.cameraKick.peakMagnitude}px`);
    lines.push('');

    // ── Player feedback ──
    lines.push(`── Player Feedback ──`);
    if (a.muzzleFlash.detected) {
        lines.push(`  Muzzle flash: ✓ detected, ${a.muzzleFlash.activeFrames} frames (${(a.muzzleFlash.ratio * 100).toFixed(1)}%)`);
    } else {
        lines.push(`  Muzzle flash: ✗ NOT DETECTED — flash never rendered during capture`);
    }
    lines.push('');

    // ── Entity feedback ──
    lines.push(`── Entity Feedback ──`);
    lines.push(`  Hit flash events: ${a.entityFlashes.hitEvents}`);
    lines.push(`  Death flash events: ${a.entityFlashes.deathEvents}`);
    if (a.entityFlashes.deathSequences > 0) {
        const clean = a.entityFlashes.deathsCompletedCleanly;
        const total = a.entityFlashes.deathSequences;
        lines.push(`  Death flash completeness: ${clean}/${total} completed to zero`);
        if (clean < total) {
            lines.push(`  ⚠ ${total - clean} death flashes cut short (entity deactivated early?)`);
        }
    }
    lines.push('');

    // ── Particles ──
    lines.push(`── Particles ──`);
    lines.push(`  Peak active: ${a.particles.peak}`);
    lines.push(`  Average active: ${a.particles.average}`);
    if (a.particles.peakBreakdown && Object.keys(a.particles.peakBreakdown).length) {
        lines.push(`  Peak breakdown:`);
        const sorted = Object.entries(a.particles.peakBreakdown)
            .sort((a, b) => b[1] - a[1]);
        for (const [type, count] of sorted) {
            lines.push(`    ${type}: ${count}`);
        }
    }
    lines.push('');

    // ── Overall assessment ──
    lines.push(`── Assessment ──`);
    const issues = [];
    const goods = [];

    if (!a.muzzleFlash.detected) issues.push('No muzzle flash detected');
    if (a.muzzleFlash.ratio > 0 && a.muzzleFlash.ratio < 0.01) issues.push('Muzzle flash too rare (< 1% of frames)');
    if (a.hitstop.freezeRisk) issues.push('Hitstop freeze risk');
    if (a.entityFlashes.deathEvents === 0 && a.entityFlashes.hitEvents > 0) issues.push('No death flashes detected despite hits');
    if (a.screenShake.peakMagnitude === 0 && a.entityFlashes.deathEvents > 0) issues.push('No screen shake on deaths');
    if (a.particles.peak === 0 && a.entityFlashes.deathEvents > 0) issues.push('No explosion particles');

    if (a.muzzleFlash.detected && a.muzzleFlash.ratio >= 0.01) goods.push('Muzzle flash active and frequent');
    if (a.hitstop.segments > 0 && !a.hitstop.freezeRisk) goods.push('Hitstop provides hit weight without freezing');
    if (a.screenShake.peakMagnitude > 5) goods.push('Screen shake has good intensity');
    if (a.cameraKick.peakMagnitude > 3) goods.push('Camera kick provides directional impact');
    if (a.entityFlashes.hitEvents > 0) goods.push('Hit flashes give damage feedback');
    if (a.entityFlashes.deathEvents > 0) goods.push('Death flashes mark enemy destruction');
    if (a.particles.peak > 20) goods.push('Explosion particles add visual density');

    for (const g of goods) lines.push(`  ✓ ${g}`);
    for (const i of issues) lines.push(`  ✗ ${i}`);

    if (issues.length === 0) {
        lines.push(`  Overall: All VFX systems functioning`);
    } else {
        lines.push(`  Overall: ${issues.length} issue(s) found`);
    }

    return lines.join('\n');
}
