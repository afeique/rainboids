/**
 * AI QA Bot — Performance Monitor
 *
 * Monitors FPS, entity counts, and flags performance regressions.
 */

export class PerformanceMonitor {
    constructor(page, logger, config = {}) {
        this.page = page;
        this.logger = logger;
        this.warningThreshold = config.fpsWarningThreshold || 30;
        this.criticalThreshold = config.fpsCriticalThreshold || 15;

        this._fpsSamples = [];
        this._reported = new Set();
    }

    /**
     * Sample current FPS and entity counts.
     * @param {object} state - Current game state
     */
    async sample(state) {
        const fps = await this.page.evaluate(() => {
            // Read FPS from game engine's own tracking if available
            const ge = window.gameEngine;
            if (ge?.lastFPS) return ge.lastFPS;
            // Fallback: estimate from frame timing
            if (ge?._lastFrameTime && ge?._frameTime) {
                return Math.round(1000 / ge._frameTime);
            }
            return null;
        });

        const metric = {
            fps,
            enemies: state?.entities?.enemies?.length || 0,
            asteroids: state?.entities?.asteroids?.length || 0,
            enemyBullets: state?.entities?.enemyBullets?.length || 0,
            playerBullets: state?.entities?.playerBulletCount || 0,
            particles: state?.entities?.particleCount || 0,
            wave: state?.wave,
        };

        this.logger.logMetrics(metric);

        if (fps !== null) {
            this._fpsSamples.push(fps);

            // Check for sustained FPS drops
            if (fps < this.criticalThreshold) {
                this._reportFPSIssue('critical', fps, metric);
            } else if (fps < this.warningThreshold) {
                // Only warn if sustained (3+ consecutive low samples)
                const recent = this._fpsSamples.slice(-3);
                if (recent.length >= 3 && recent.every(f => f < this.warningThreshold)) {
                    this._reportFPSIssue('medium', fps, metric);
                }
            }
        }

        return metric;
    }

    _reportFPSIssue(severity, fps, metric) {
        const bugId = `fps_${severity}:wave${metric.wave}`;
        if (this._reported.has(bugId)) return;
        this._reported.add(bugId);

        this.logger.logBug({
            id: bugId,
            title: `FPS drop to ${fps} (${severity}) at wave ${metric.wave}`,
            category: 'performance',
            severity,
            details: `Entities: ${metric.enemies} enemies, ${metric.asteroids} asteroids, ` +
                     `${metric.enemyBullets} enemy bullets, ${metric.particles} particles`,
            wave: metric.wave,
        });
    }

    /**
     * Get FPS statistics for the session.
     */
    getStats() {
        if (this._fpsSamples.length === 0) return null;
        const sorted = [...this._fpsSamples].sort((a, b) => a - b);
        return {
            count: sorted.length,
            mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p5: sorted[Math.floor(sorted.length * 0.05)],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
        };
    }
}
