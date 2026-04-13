/**
 * VFX Telemetry — records per-frame effect state into a ring buffer.
 *
 * Zero cost when disabled (default). Enabled by setting:
 *   window.__VFX_TELEMETRY__ = true
 *
 * Test code reads the buffer via:
 *   window.__vfxFrames        — Array of frame snapshots (ring buffer, max 600)
 *   window.__vfxFrameCount    — Total frames recorded
 *   window.__vfxClear()       — Reset buffer
 */

const MAX_FRAMES = 3600; // 60 seconds at 60fps

/**
 * Called at the end of every gameLoop() frame.
 * Captures all VFX-relevant state into the ring buffer.
 *
 * @param {object} ge — the GameEngine instance (`this` in gameLoop)
 */
export function recordVFXFrame(ge) {
    if (!window.__VFX_TELEMETRY__) return;

    // Lazy-init buffer
    if (!window.__vfxFrames) {
        window.__vfxFrames = [];
        window.__vfxFrameCount = 0;
        window.__vfxClear = () => {
            window.__vfxFrames = [];
            window.__vfxFrameCount = 0;
        };
    }

    const buf = window.__vfxFrames;
    const frame = window.__vfxFrameCount++;

    // ── Screen-level effects ──
    const screenFlash = {
        alpha: ge._screenFlashAlpha || 0,
        timer: ge._screenFlashTimer || 0,
        duration: ge._screenFlashDuration || 0,
    };
    const screenShake = {
        duration: ge.game.screenShakeDuration || 0,
        magnitude: ge.game.screenShakeMagnitude || 0,
    };
    const cameraKick = {
        x: ge._cameraKickX || 0,
        y: ge._cameraKickY || 0,
    };
    const hitstopFrames = ge._hitstopFrames || 0;

    // ── Player effects ──
    const player = ge.player && ge.player.active ? {
        hitFlash: ge.player._hitFlashTimer || 0,
        muzzleFlash: ge.player._muzzleFlashTimer || 0,
        muzzleIntensity: ge.player._muzzleFlashIntensity || 0,
        invincible: ge.player.invincible || false,
        x: Math.round(ge.player.x),
        y: Math.round(ge.player.y),
    } : null;

    // ── Entity flash states (enemies + asteroids with active effects) ──
    const entityFlashes = [];

    if (ge.enemyPool) {
        const enemies = ge.enemyPool.activeObjects;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.active) continue;
            if (e._hitFlashTimer > 0 || e._deathFlash > 0) {
                entityFlashes.push({
                    pool: 'enemy',
                    type: e._deathFlash > 0 ? 'death' : 'hit',
                    timer: e._deathFlash > 0 ? e._deathFlash : e._hitFlashTimer,
                    maxTimer: e._deathFlash > 0 ? (e._deathFlashMax || 8) : 10,
                    enemyType: e.type,
                    x: Math.round(e.x),
                    y: Math.round(e.y),
                });
            }
        }
    }

    if (ge.asteroidPool) {
        const asteroids = ge.asteroidPool.activeObjects;
        for (let i = 0; i < asteroids.length; i++) {
            const a = asteroids[i];
            if (!a.active) continue;
            if (a._hitFlashTimer > 0 || a._deathFlash > 0) {
                entityFlashes.push({
                    pool: 'asteroid',
                    type: a._deathFlash > 0 ? 'death' : 'hit',
                    timer: a._deathFlash > 0 ? a._deathFlash : a._hitFlashTimer,
                    maxTimer: a._deathFlash > 0 ? (a._deathFlashMax || 6) : 10,
                    x: Math.round(a.x),
                    y: Math.round(a.y),
                });
            }
        }
    }

    // ── Particle counts by type ──
    const particleCounts = {};
    let totalParticles = 0;
    if (ge.particlePool) {
        const particles = ge.particlePool.activeObjects;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.active) continue;
            const t = p.type || 'unknown';
            particleCounts[t] = (particleCounts[t] || 0) + 1;
            totalParticles++;
        }
    }

    // ── Pool counts ──
    const pools = {
        bullets: ge.bulletPool ? ge.bulletPool.activeObjects.length : 0,
        enemies: ge.enemyPool ? ge.enemyPool.activeObjects.length : 0,
        asteroids: ge.asteroidPool ? ge.asteroidPool.activeObjects.length : 0,
        enemyBullets: ge.enemyBulletPool ? ge.enemyBulletPool.activeObjects.length : 0,
        lineDebris: ge.lineDebrisPool ? ge.lineDebrisPool.activeObjects.length : 0,
    };

    // ── Build frame record ──
    const record = {
        frame,
        ts: performance.now(),
        hitstopFrames,
        screenFlash,
        screenShake,
        cameraKick,
        player,
        entityFlashes,
        particleCounts,
        totalParticles,
        pools,
    };

    // Ring buffer: overwrite oldest when full
    if (buf.length < MAX_FRAMES) {
        buf.push(record);
    } else {
        buf[frame % MAX_FRAMES] = record;
    }
}
